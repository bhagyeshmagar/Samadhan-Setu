// Shared notification channel definitions, validators, templates, and external dispatchers
// Supports Google Gmail API (client-provided OAuth Bearer token) and Meta WhatsApp Cloud API with wa.me fallback.

export const NOTIFICATION_EVENTS = [
  {
    key: 'complaint_lodged',
    label: 'Grievance Lodged Confirmation',
    description: 'Confirmation receipt when a new civic grievance is registered and routed to a department.',
  },
  {
    key: 'assignment',
    label: 'Inspector & Field Team Assignments',
    description: 'Alerts when an inspection officer, field repair squad, or post-repair verifier is assigned or reassigned.',
  },
  {
    key: 'status_resolution',
    label: 'Status Updates & Final Resolution',
    description: 'Progress milestones, field inspection submissions, proof uploads, and final approved resolutions.',
  },
  {
    key: 'sla_escalation',
    label: 'SLA Deadline Warnings & Escalations',
    description: 'Urgent alerts when a grievance crosses 75% of its statutory resolution window or breaches SLA.',
  },
  {
    key: 'appeal_adjudication',
    label: 'Appeal Submission & Adjudication Decisions',
    description: 'Notifications when a citizen files an appeal or a supervisor issues an appellate ruling.',
  },
];

export const VALID_EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.key);

export function getEventLabel(eventType) {
  const match = NOTIFICATION_EVENTS.find((e) => e.key === eventType);
  return match ? match.label : 'Grievance Update';
}

export function inferEventTypeFromTitle(title = '') {
  const lower = String(title).toLowerCase();
  if (lower.includes('appeal') || lower.includes('adjudicat')) return 'appeal_adjudication';
  if (lower.includes('sla') || lower.includes('escalat') || lower.includes('breach') || lower.includes('overdue')) {
    return 'sla_escalation';
  }
  if (lower.includes('registered') || lower.includes('lodged') || lower.includes('new grievance intake')) {
    return 'complaint_lodged';
  }
  if (
    lower.includes('assign') ||
    lower.includes('work order') ||
    lower.includes('rework') ||
    lower.includes('verification assigned') ||
    lower.includes('re-verification')
  ) {
    return 'assignment';
  }
  return 'status_resolution';
}

export function sanitizeHeaderValue(value) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 240);
}

export function isValidEmail(email) {
  const clean = String(email || '').trim();
  if (!clean || clean.length > 254 || /[\r\n]/.test(clean)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function normalizeWhatsAppPhone(rawPhone) {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return '';
}

export function formatPhoneDisplay(rawPhone) {
  const digits = normalizeWhatsAppPhone(rawPhone);
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return `+${digits}`;
}

export function buildWhatsAppFallbackUrl(phone, messageText) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  const safeBody = String(messageText || '').trim().slice(0, 1500);
  return `https://wa.me/${digits}?text=${encodeURIComponent(safeBody)}`;
}

export function getDefaultNotificationPreferences(user) {
  const events = {};
  for (const evt of NOTIFICATION_EVENTS) {
    events[evt.key] = { gmail: true, whatsapp: true };
  }
  return {
    gmail_enabled: true,
    gmail_address: user?.email || '',
    whatsapp_enabled: true,
    whatsapp_phone: normalizeWhatsAppPhone(user?.phone || '') || '',
    events,
    updated_at: new Date().toISOString(),
  };
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNotificationPayload({
  eventType = 'status_resolution',
  title,
  body,
  complaintNumber,
  recipientName,
}) {
  const eventLabel = getEventLabel(eventType);
  const cleanTitle = sanitizeHeaderValue(title || eventLabel);
  const subject = cleanTitle.startsWith('[Samadhan Setu]')
    ? cleanTitle
    : `[Samadhan Setu] ${cleanTitle}`;
  const greeting = recipientName ? `Dear ${recipientName},` : 'Hello,';
  const refLine = complaintNumber ? `Grievance Reference: ${complaintNumber}\n` : '';

  const textBody = [
    greeting,
    '',
    String(body || '').trim(),
    '',
    `${refLine}Event Category: ${eventLabel}`,
    'Portal: Samadhan Setu — Civic Grievance Redressal System',
  ].join('\n');

  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#F5F7FA;font-family:Arial,sans-serif;color:#1C2B4A;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="height:4px;background:linear-gradient(to right,#FF9933 33.3%,#FFFFFF 33.3%,#FFFFFF 66.6%,#138808 66.6%);"></td>
      </tr>
      <tr>
        <td style="padding:20px 24px 12px 24px;border-bottom:1px solid #E2E8F0;">
          <div style="font-size:12px;font-weight:700;color:#003580;text-transform:uppercase;letter-spacing:0.06em;">Samadhan Setu</div>
          <h2 style="margin:6px 0 0 0;font-size:18px;color:#1C2B4A;">${escapeHtml(cleanTitle)}</h2>
        </td>
      </tr>
      <tr>
        <td style="padding:20px 24px;font-size:14px;line-height:1.6;color:#334155;">
          <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 16px 0;">${escapeHtml(String(body || '').trim())}</p>
          <div style="padding:12px 14px;background:#F5F8FF;border:1px solid #DCE6F7;border-radius:6px;font-size:13px;color:#1C2B4A;">
            ${complaintNumber ? `<div><strong>Reference:</strong> ${escapeHtml(complaintNumber)}</div>` : ''}
            <div><strong>Category:</strong> ${escapeHtml(eventLabel)}</div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
          Sent via Samadhan Setu Civic Grievance Redressal Portal.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const whatsappText = [
    `*Samadhan Setu — ${cleanTitle}*`,
    complaintNumber ? `Ref: ${complaintNumber}` : null,
    String(body || '').trim(),
    `Category: ${eventLabel}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    subject,
    textBody,
    htmlBody,
    whatsappText,
    eventLabel,
  };
}

export function buildRfc2822Base64Url({ to, subject, textBody, htmlBody }) {
  const safeTo = sanitizeHeaderValue(to);
  const safeSubject = sanitizeHeaderValue(subject);
  const boundary = `samadhan_boundary_${Date.now().toString(36)}`;

  const mimeLines = [
    `To: ${safeTo}`,
    `Subject: =?UTF-8?B?${Buffer.from(safeSubject, 'utf-8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(textBody || ''), 'utf-8').toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(String(htmlBody || textBody || ''), 'utf-8').toString('base64'),
    '',
    `--${boundary}--`,
  ];

  return Buffer.from(mimeLines.join('\r\n'), 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function isMetaWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_ACCESS_TOKEN.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_PHONE_NUMBER_ID.trim()
  );
}

export async function dispatchMetaWhatsAppMessage({ toPhone, bodyText }) {
  const digits = normalizeWhatsAppPhone(toPhone);
  if (!digits) {
    return {
      ok: false,
      mode: 'validation',
      status: 'failed',
      providerMessageId: null,
      fallbackUrl: null,
      error: 'Enter a valid WhatsApp phone number with country code (10–15 digits).',
    };
  }

  const fallbackUrl = buildWhatsAppFallbackUrl(digits, bodyText);

  if (!isMetaWhatsAppConfigured()) {
    return {
      ok: true,
      mode: 'fallback',
      status: 'fallback_ready',
      providerMessageId: null,
      fallbackUrl,
      error: null,
    };
  }

  const version = (process.env.WHATSAPP_GRAPH_VERSION || 'v21.0').trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN.trim();

  if (!/^[a-zA-Z0-9._-]+$/.test(version) || !/^\d+$/.test(phoneNumberId)) {
    return {
      ok: false,
      mode: 'cloud_api',
      status: 'failed',
      providerMessageId: null,
      fallbackUrl,
      error: 'Invalid WhatsApp Cloud API server configuration.',
    };
  }

  try {
    const endpoint = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'text',
        text: {
          preview_url: false,
          body: String(bodyText || '').slice(0, 4096),
        },
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiErr = data?.error?.message || `Meta WhatsApp API returned HTTP ${response.status}`;
      return {
        ok: false,
        mode: 'cloud_api',
        status: 'failed',
        providerMessageId: null,
        fallbackUrl,
        error: apiErr,
      };
    }

    const msgId = data?.messages?.[0]?.id || null;
    return {
      ok: true,
      mode: 'cloud_api',
      status: 'sent',
      providerMessageId: msgId,
      fallbackUrl,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'cloud_api',
      status: 'failed',
      providerMessageId: null,
      fallbackUrl,
      error: err?.message || 'Unable to reach Meta WhatsApp Cloud API.',
    };
  }
}

export async function dispatchGmailApiMessage({ accessToken, toEmail, subject, textBody, htmlBody }) {
  if (!accessToken || typeof accessToken !== 'string') {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      threadId: null,
      error: 'Connect your Google account with Sign in with Google before sending via Gmail.',
    };
  }
  if (!isValidEmail(toEmail)) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      threadId: null,
      error: 'Recipient email address is invalid.',
    };
  }

  try {
    const raw = buildRfc2822Base64Url({
      to: toEmail,
      subject,
      textBody,
      htmlBody,
    });

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg =
        data?.error?.message ||
        (response.status === 401
          ? 'Your Google session expired. Please reconnect with Sign in with Google.'
          : `Gmail API returned HTTP ${response.status}`);
      return {
        ok: false,
        status: 'failed',
        providerMessageId: null,
        threadId: null,
        error: msg,
        authExpired: response.status === 401 || response.status === 403,
      };
    }

    return {
      ok: true,
      status: 'sent',
      providerMessageId: data?.id || null,
      threadId: data?.threadId || null,
      error: null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      threadId: null,
      error: err?.message || 'Unable to reach Gmail API.',
    };
  }
}
