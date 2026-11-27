'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Mail,
  MessageCircle,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  LogOut,
  Save,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { useGmailAuth } from '@/lib/gmailAuth';
import { notificationsAPI } from '@/lib/api';
import {
  NOTIFICATION_EVENTS,
  formatPhoneDisplay,
} from '@/lib/notificationChannels';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import GmailConfirmModal from '@/components/GmailConfirmModal';

const STATUS_META = {
  sent: { key: 'log_sent', color: 'var(--text-green)', icon: CheckCircle2 },
  queued: { key: 'log_queued', color: 'var(--text-saffron)', icon: Clock },
  fallback_ready: { key: 'log_fallback_ready', color: 'var(--text-navy)', icon: ExternalLink },
  sending: { key: 'log_sending', color: 'var(--text-navy)', icon: Clock },
  failed: { key: 'log_failed', color: 'var(--error)', icon: AlertCircle },
};

function ChannelSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: checked ? 'var(--navy)' : 'var(--bg-section)',
        borderColor: checked ? 'var(--navy)' : 'var(--border-mid)',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
        style={{
          transform: checked ? 'translateX(22px)' : 'translateX(3px)',
        }}
      />
    </button>
  );
}

export default function NotificationsCenterPage() {
  const { user, loading: authLoading } = useAuth();
  const { t, tEvent, tEventDesc, locale } = useLanguage();
  const {
    googleUser,
    isConnected: gmailConnected,
    isConnecting: gmailConnecting,
    authError: gmailAuthError,
    connectGmail,
    disconnectGmail,
    markTokenExpired,
  } = useGmailAuth();

  // Preferences state
  const [prefs, setPrefs] = useState(null);
  const [capabilities, setCapabilities] = useState({
    gmail_oauth_supported: true,
    whatsapp_cloud_configured: false,
    whatsapp_fallback_supported: true,
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsBanner, setPrefsBanner] = useState(null);

  // Delivery logs state
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    sent: 0,
    queued: 0,
    fallback_ready: 0,
    failed: 0,
    gmail_queued: 0,
  });
  const [canViewAll, setCanViewAll] = useState(false);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState('');

  // Filters
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [scopeFilter, setScopeFilter] = useState('mine');
  const [searchQuery, setSearchQuery] = useState('');

  // Actions & Modals
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [testWaResult, setTestWaResult] = useState(null);
  const [testingWa, setTestingWa] = useState(false);
  const [dispatchingRowId, setDispatchingRowId] = useState(null);
  const [actionBanner, setActionBanner] = useState(null);
  const [gmailModal, setGmailModal] = useState(null);

  const refreshLogs = useCallback(async () => {
    if (!user) return;
    setLogsLoading(true);
    setLogsError('');
    try {
      const data = await notificationsAPI.getDeliveryLogs({
        channel: channelFilter,
        status: statusFilter,
        event_type: eventFilter,
        scope: scopeFilter,
        q: searchQuery.trim(),
      });
      setLogs(data.items || []);
      if (data.summary) setSummary(data.summary);
      setCanViewAll(Boolean(data.can_view_all));
      if (data.capabilities) setCapabilities(data.capabilities);
    } catch (err) {
      setLogsError(err?.message || 'Unable to load notification delivery logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [user, channelFilter, statusFilter, eventFilter, scopeFilter, searchQuery]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    notificationsAPI
      .getPreferences()
      .then((data) => {
        if (!active) return;
        setPrefs(data.preferences);
        if (data.capabilities) setCapabilities(data.capabilities);
      })
      .catch((err) => {
        if (active) {
          setPrefsBanner({ type: 'error', text: err?.message || 'Unable to load notification preferences.' });
        }
      })
      .finally(() => {
        if (active) setPrefsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    notificationsAPI
      .getDeliveryLogs({
        channel: channelFilter,
        status: statusFilter,
        event_type: eventFilter,
        scope: scopeFilter,
        q: searchQuery.trim(),
      })
      .then((data) => {
        if (!active) return;
        setLogs(data.items || []);
        if (data.summary) setSummary(data.summary);
        setCanViewAll(Boolean(data.can_view_all));
        if (data.capabilities) setCapabilities(data.capabilities);
        setLogsError('');
      })
      .catch((err) => {
        if (active) {
          setLogsError(err?.message || 'Unable to load notification delivery logs.');
        }
      })
      .finally(() => {
        if (active) setLogsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, channelFilter, statusFilter, eventFilter, scopeFilter, searchQuery]);

  const handleConnectGmailClick = async () => {
    const res = await connectGmail();
    if (res?.user?.email) {
      setPrefs((prev) =>
        prev && !prev.gmail_address ? { ...prev, gmail_address: res.user.email } : prev
      );
    }
  };

  const loadLogs = refreshLogs;

  const queuedGmailLogs = useMemo(
    () => logs.filter((l) => l.channel === 'gmail' && (l.status === 'queued' || l.status === 'failed')),
    [logs]
  );

  const handleSavePreferences = async () => {
    if (!prefs) return;
    setSavingPrefs(true);
    setPrefsBanner(null);
    try {
      const res = await notificationsAPI.updatePreferences({
        gmail_enabled: prefs.gmail_enabled,
        gmail_address: prefs.gmail_address,
        whatsapp_enabled: prefs.whatsapp_enabled,
        whatsapp_phone: prefs.whatsapp_phone,
        events: prefs.events,
      });
      setPrefs(res.preferences);
      setPrefsBanner({ type: 'success', text: 'Notification preferences saved.' });
    } catch (err) {
      setPrefsBanner({ type: 'error', text: err?.message || 'Failed to save preferences.' });
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleToggleEventChannel = (eventKey, channel, value) => {
    setPrefs((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        events: {
          ...prev.events,
          [eventKey]: {
            ...(prev.events?.[eventKey] || { gmail: true, whatsapp: true }),
            [channel]: value,
          },
        },
      };
    });
  };

  const openTestGmailModal = () => {
    const target = prefs?.gmail_address || googleUser?.email || user?.email || '';
    setGmailModal({
      mode: 'test',
      recipientEmail: target,
      subject: '[Samadhan Setu] Test Alert — Samadhan Setu Notifications Connected',
      previewBody: `Dear ${user?.name || 'User'},\n\nThis is a verification alert confirming that Gmail notifications are active for your Samadhan Setu account.\n\nReference: TEST-VERIFY`,
      allowEditRecipient: true,
    });
  };

  const openSingleGmailModal = (log) => {
    setGmailModal({
      mode: 'single',
      logId: log.id,
      recipientEmail: log.recipient || prefs?.gmail_address || googleUser?.email || '',
      subject: log.subject,
      previewBody: log.text_body || log.message_preview || '',
      allowEditRecipient: true,
    });
  };

  const openBulkGmailModal = () => {
    if (queuedGmailLogs.length === 0) return;
    setGmailModal({
      mode: 'bulk',
      items: queuedGmailLogs.slice(0, 20),
    });
  };

  const handleConfirmGmailModal = async ({ toEmail, accessToken }) => {
    if (!gmailModal) return;
    setActionBanner(null);
    try {
      if (gmailModal.mode === 'test') {
        const res = await notificationsAPI.sendTest('gmail', { to_email: toEmail }, accessToken);
        setActionBanner({ type: 'success', text: res?.detail || `Test email sent to ${toEmail}.` });
      } else if (gmailModal.mode === 'bulk') {
        const ids = (gmailModal.items || []).map((item) => item.id);
        const res = await notificationsAPI.dispatchGmail({ log_ids: ids }, accessToken);
        setActionBanner({ type: 'success', text: res?.detail || `Dispatched ${res?.sent_count || 0} Gmail alerts.` });
      } else {
        const res = await notificationsAPI.dispatchGmail(
          { log_id: gmailModal.logId, to_email: toEmail },
          accessToken
        );
        setActionBanner({ type: 'success', text: res?.detail || `Gmail alert sent to ${toEmail}.` });
      }
      await loadLogs();
    } catch (err) {
      if (String(err?.message || '').toLowerCase().includes('expired')) {
        markTokenExpired();
      }
      throw err;
    }
  };

  const handleTestWhatsApp = async () => {
    setTestingWa(true);
    setTestWaResult(null);
    setActionBanner(null);
    try {
      const res = await notificationsAPI.sendTest('whatsapp', {
        to_phone: prefs?.whatsapp_phone || user?.phone || '',
      });
      setTestWaResult(res);
      await loadLogs();
    } catch (err) {
      setTestWaResult({ ok: false, error: err?.message || 'Unable to test WhatsApp delivery.' });
    } finally {
      setTestingWa(false);
    }
  };

  const handleRowWhatsAppDispatch = async (log) => {
    setDispatchingRowId(log.id);
    setActionBanner(null);
    try {
      const res = await notificationsAPI.dispatchWhatsApp({ log_id: log.id });
      if (res.status === 'sent') {
        setActionBanner({ type: 'success', text: `WhatsApp alert delivered to ${formatPhoneDisplay(log.recipient)}.` });
      } else if (res.fallback_url) {
        setActionBanner({
          type: 'info',
          text: 'Meta Cloud API secrets are not configured yet. Use the prepared WhatsApp link.',
          url: res.fallback_url,
        });
      } else if (res.error) {
        setActionBanner({ type: 'error', text: res.error });
      }
      await loadLogs();
    } catch (err) {
      setActionBanner({ type: 'error', text: err?.message || 'WhatsApp dispatch failed.' });
    } finally {
      setDispatchingRowId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto w-full py-8 space-y-6">
        <div className="h-8 w-64 rounded animate-pulse" style={{ background: 'var(--bg-section)' }} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-56 rounded-xl border animate-pulse" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} />
          <div className="h-56 rounded-xl border animate-pulse" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-xl mx-auto w-full py-16 text-center">
        <div
          className="rounded-xl border p-8 space-y-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <h1 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>
            {t('notif_signin_title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {t('notif_signin_desc')}
          </p>
          <div className="pt-2">
            <Link href="/login" className="btn-gov-primary text-sm">
              {t('notif_signin_cta')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full space-y-8">
      {/* Breadcrumb & Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="space-y-1.5">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link href="/">{t('home')}</Link>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{t('notif_center_title')}</span>
          </nav>
          <h1
            className="text-2xl md:text-3xl font-bold tracking-tight"
            style={{ color: 'var(--navy)', textWrap: 'balance' }}
          >
            {t('notif_center_title')}
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            {t('notif_center_sub')}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {queuedGmailLogs.length > 0 ? (
            <button
              type="button"
              onClick={openBulkGmailModal}
              className="btn-gov-primary text-sm whitespace-nowrap shrink-0"
            >
              <Send size={15} />
              <span>{t('send_queued_gmail', { count: queuedGmailLogs.length })}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={savingPrefs || prefsLoading}
              className="btn-gov-primary text-sm whitespace-nowrap shrink-0"
            >
              <Save size={15} />
              <span>{savingPrefs ? t('saving') : t('save_preferences')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Action Feedback Banner */}
      {actionBanner && (
        <div
          className="rounded-xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm"
          style={{
            borderColor: actionBanner.type === 'error' ? 'var(--error)' : 'var(--border-mid)',
            background: actionBanner.type === 'error'
              ? 'var(--status-critical-bg)'
              : actionBanner.type === 'success'
                ? 'var(--status-resolved-bg)'
                : 'var(--navy-xlight)',
            color: actionBanner.type === 'error'
              ? 'var(--error)'
              : actionBanner.type === 'success'
                ? 'var(--text-green)'
                : 'var(--text-navy)',
          }}
        >
          <span>{actionBanner.text}</span>
          <div className="flex items-center gap-3">
            {actionBanner.url && (
              <a
                href={actionBanner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold underline whitespace-nowrap"
              >
                <span>{t('open_whatsapp')}</span>
                <ExternalLink size={14} />
              </a>
            )}
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="text-xs underline cursor-pointer"
            >
              {t('dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* 4-Column Summary Strip */}
      <section aria-label="Delivery summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t('stat_total_logged'), value: summary.total, note: t('stat_gmail_wa') },
            { label: t('stat_delivered'), value: summary.sent, note: t('stat_confirmed_api') },
            { label: t('stat_queued_gmail'), value: summary.queued, note: t('stat_awaiting_review') },
            { label: t('stat_whatsapp_ready'), value: summary.fallback_ready, note: capabilities.whatsapp_cloud_configured ? t('stat_cloud_active') : t('stat_instant_links') },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border p-4 md:p-5"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {stat.label}
              </div>
              <div
                className="mt-1.5 text-2xl md:text-3xl font-bold font-mono tabular-nums"
                style={{ color: 'var(--navy)' }}
              >
                {stat.value}
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                {stat.note}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Two-Column Channel Connections */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch" aria-label="Channel connections">
        {/* Gmail API Channel */}
        <div
          className="rounded-xl border p-6 flex flex-col justify-between gap-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Mail size={18} style={{ color: 'var(--text-navy)' }} />
                  <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                    {t('gmail_notifications')}
                  </h2>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {t('gmail_card_desc')}
                </p>
              </div>
              <ChannelSwitch
                checked={Boolean(prefs?.gmail_enabled)}
                onChange={(val) => setPrefs((p) => (p ? { ...p, gmail_enabled: val } : p))}
                label={t('gmail_notifications')}
                disabled={prefsLoading}
              />
            </div>

            {/* Google Account Connection Control */}
            <div
              className="rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3"
              style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
            >
              <div className="min-w-0">
                <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  {t('google_account_status')}
                </div>
                {gmailConnected ? (
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    <CheckCircle2 size={15} style={{ color: 'var(--text-green)' }} />
                    <span className="truncate">{googleUser?.email}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {googleUser?.email
                      ? t('google_reconnect_hint', { email: googleUser.email })
                      : t('google_not_connected_hint')}
                  </div>
                )}
              </div>

              {gmailConnected ? (
                <button
                  type="button"
                  onClick={disconnectGmail}
                  className="btn-ghost text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <LogOut size={13} />
                  <span>{t('disconnect')}</span>
                </button>
              ) : (
                <GoogleSignInButton
                  onClick={handleConnectGmailClick}
                  loading={gmailConnecting}
                />
              )}
            </div>

            {gmailAuthError && (
              <div
                className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs"
                style={{
                  borderColor: 'var(--error)',
                  background: 'var(--status-critical-bg)',
                  color: 'var(--error)',
                }}
              >
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{gmailAuthError}</span>
              </div>
            )}

            <div>
              <label htmlFor="gmail-recipient-input" className="gov-label">
                {t('recipient_gmail_address')}
              </label>
              <input
                id="gmail-recipient-input"
                type="email"
                value={prefs?.gmail_address || ''}
                onChange={(e) => setPrefs((p) => (p ? { ...p, gmail_address: e.target.value } : p))}
                placeholder="you@gmail.com"
                className="gov-input text-sm"
                disabled={prefsLoading}
              />
            </div>
          </div>

          <div className="pt-3 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('gmail_memory_note')}
            </span>
            <button
              type="button"
              onClick={openTestGmailModal}
              disabled={prefsLoading}
              className="btn-ghost text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Send size={13} />
              <span>{t('send_test_gmail')}</span>
            </button>
          </div>
        </div>

        {/* Meta WhatsApp Cloud API + Fallback Channel */}
        <div
          className="rounded-xl border p-6 flex flex-col justify-between gap-5"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageCircle size={18} style={{ color: 'var(--text-green)' }} />
                  <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                    {t('whatsapp_notifications')}
                  </h2>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {t('whatsapp_card_desc')}
                </p>
              </div>
              <ChannelSwitch
                checked={Boolean(prefs?.whatsapp_enabled)}
                onChange={(val) => setPrefs((p) => (p ? { ...p, whatsapp_enabled: val } : p))}
                label={t('whatsapp_notifications')}
                disabled={prefsLoading}
              />
            </div>

            {/* Delivery Mode Indicator */}
            <div
              className="rounded-lg border p-3.5 flex items-center justify-between gap-3 text-xs"
              style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
            >
              <div className="space-y-0.5">
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {capabilities.whatsapp_cloud_configured
                    ? t('wa_cloud_connected')
                    : t('wa_fallback_active')}
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {capabilities.whatsapp_cloud_configured
                    ? t('wa_cloud_desc')
                    : t('wa_fallback_desc')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSetupGuideOpen((v) => !v)}
                className="inline-flex items-center gap-1 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                style={{ color: 'var(--text-navy)' }}
              >
                <span>{t('setup_guide')}</span>
                {setupGuideOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {setupGuideOpen && (
              <div
                className="rounded-lg border p-3.5 text-xs space-y-2 leading-relaxed"
                style={{ background: 'var(--bg-page)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  How to enable automated Meta WhatsApp Cloud API delivery:
                </div>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Open <strong>developers.facebook.com</strong> and create or select a Business App with the <strong>WhatsApp</strong> product added.</li>
                  <li>Go to <strong>WhatsApp → API Setup</strong> and copy your <strong>Phone Number ID</strong> and a temporary or permanent System User <strong>Access Token</strong>.</li>
                  <li>Add <code className="font-mono">WHATSAPP_PHONE_NUMBER_ID</code> and <code className="font-mono">WHATSAPP_ACCESS_TOKEN</code> in AI Studio <strong>Settings → Secrets</strong> (optional: <code className="font-mono">WHATSAPP_GRAPH_VERSION=v21.0</code>).</li>
                  <li>Restart the server — automated WhatsApp delivery will activate automatically.</li>
                </ol>
              </div>
            )}

            <div>
              <label htmlFor="whatsapp-phone-input" className="gov-label">
                {t('whatsapp_mobile_label')}
              </label>
              <input
                id="whatsapp-phone-input"
                type="tel"
                value={prefs?.whatsapp_phone || ''}
                onChange={(e) => setPrefs((p) => (p ? { ...p, whatsapp_phone: e.target.value } : p))}
                placeholder="+91 98765 43210"
                className="gov-input text-sm font-mono tabular-nums"
                disabled={prefsLoading}
              />
              {prefs?.whatsapp_phone && (
                <p className="mt-1 text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {formatPhoneDisplay(prefs.whatsapp_phone) || '10–15 digits'}
                </p>
              )}
            </div>

            {testWaResult && (
              <div
                className="rounded-lg border px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2"
                style={{
                  borderColor: testWaResult.error ? 'var(--error)' : 'var(--border-mid)',
                  background: testWaResult.error ? 'var(--status-critical-bg)' : 'var(--bg-section)',
                  color: testWaResult.error ? 'var(--error)' : 'var(--text-primary)',
                }}
              >
                <span>{testWaResult.detail || testWaResult.error}</span>
                {testWaResult.fallback_url && (
                  <a
                    href={testWaResult.fallback_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline whitespace-nowrap"
                    style={{ color: 'var(--text-green)' }}
                  >
                    <span>{t('open_whatsapp')}</span>
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="pt-3 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('whatsapp_default_in')}
            </span>
            <button
              type="button"
              onClick={handleTestWhatsApp}
              disabled={testingWa || prefsLoading}
              className="btn-ghost text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <MessageCircle size={13} />
              <span>{testingWa ? t('testing') : t('send_test_whatsapp')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 5-Event Notification Matrix */}
      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        aria-label="Event notification matrix"
      >
        <div
          className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
              {t('lifecycle_triggers')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {t('lifecycle_triggers_sub')}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSavePreferences}
            disabled={savingPrefs || prefsLoading}
            className="btn-gov-primary text-xs whitespace-nowrap shrink-0"
          >
            <Save size={14} />
            <span>{savingPrefs ? t('saving') : t('save_preferences')}</span>
          </button>
        </div>

        {prefsBanner && (
          <div
            className="px-6 py-2.5 border-b text-xs flex items-center justify-between"
            style={{
              borderColor: 'var(--border)',
              background: prefsBanner.type === 'error' ? 'var(--status-critical-bg)' : 'var(--status-resolved-bg)',
              color: prefsBanner.type === 'error' ? 'var(--error)' : 'var(--text-green)',
            }}
          >
            <span>{prefsBanner.text}</span>
            <button type="button" onClick={() => setPrefsBanner(null)} className="underline cursor-pointer">
              {t('dismiss')}
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <th className="py-3 px-6 font-semibold">{t('lifecycle_event')}</th>
                <th className="py-3 px-4 font-semibold text-center w-32">Gmail</th>
                <th className="py-3 px-6 font-semibold text-center w-32">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {NOTIFICATION_EVENTS.map((evt) => {
                const cfg = prefs?.events?.[evt.key] || { gmail: true, whatsapp: true };
                return (
                  <tr key={evt.key} className="transition-colors hover:bg-(--bg-card-hover)">
                    <td className="py-3.5 px-6">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {tEvent(evt.key)}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {tEventDesc(evt.key)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex justify-center">
                        <ChannelSwitch
                          checked={Boolean(cfg.gmail)}
                          onChange={(val) => handleToggleEventChannel(evt.key, 'gmail', val)}
                          label={`Gmail: ${tEvent(evt.key)}`}
                          disabled={prefsLoading || !prefs?.gmail_enabled}
                        />
                      </div>
                    </td>
                    <td className="py-3.5 px-6 text-center">
                      <div className="flex justify-center">
                        <ChannelSwitch
                          checked={Boolean(cfg.whatsapp)}
                          onChange={(val) => handleToggleEventChannel(evt.key, 'whatsapp', val)}
                          label={`WhatsApp: ${tEvent(evt.key)}`}
                          disabled={prefsLoading || !prefs?.whatsapp_enabled}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Outbound Delivery Logs Table */}
      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        aria-label="Notification delivery logs"
      >
        <div
          className="px-6 py-4 border-b space-y-4"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--navy)' }}>
                {t('outbound_delivery_logs')}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {t('outbound_delivery_logs_sub')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canViewAll && (
                <div
                  className="inline-flex items-center p-0.5 rounded-lg border"
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                  {[
                    { value: 'mine', label: t('my_alerts') },
                    { value: 'all', label: t('all_alerts') },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScopeFilter(opt.value)}
                      className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
                      style={{
                        background: scopeFilter === opt.value ? 'var(--navy)' : 'transparent',
                        color: scopeFilter === opt.value ? 'var(--primary-ink)' : 'var(--text-secondary)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={loadLogs}
                className="btn-ghost text-xs inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RefreshCw size={13} />
                <span>{t('refresh')}</span>
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_logs_placeholder')}
                className="gov-input text-xs pl-9 py-2"
              />
            </div>

            {/* Channel Segmented Filter */}
            <div
              className="inline-flex items-center p-0.5 rounded-lg border"
              style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
              {[
                { value: '', label: t('all_channels') },
                { value: 'gmail', label: 'Gmail' },
                { value: 'whatsapp', label: 'WhatsApp' },
              ].map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  onClick={() => setChannelFilter(tab.value)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  style={{
                    background: channelFilter === tab.value ? 'var(--navy)' : 'transparent',
                    color: channelFilter === tab.value ? 'var(--primary-ink)' : 'var(--text-secondary)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('all_statuses')}
              className="gov-input text-xs py-2 w-auto min-w-[140px]"
            >
              <option value="">{t('all_statuses')}</option>
              <option value="sent">{t('log_sent')}</option>
              <option value="queued">{t('log_queued')}</option>
              <option value="fallback_ready">{t('log_fallback_ready')}</option>
              <option value="failed">{t('log_failed')}</option>
            </select>

            {/* Event Filter */}
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              aria-label={t('all_lifecycle_events')}
              className="gov-input text-xs py-2 w-auto min-w-[180px]"
            >
              <option value="">{t('all_lifecycle_events')}</option>
              {NOTIFICATION_EVENTS.map((evt) => (
                <option key={evt.key} value={evt.key}>
                  {tEvent(evt.key)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Body / States */}
        {logsError ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm" style={{ color: 'var(--error)' }}>{logsError}</p>
            <button type="button" onClick={loadLogs} className="btn-ghost text-xs">
              {t('try_again')}
            </button>
          </div>
        ) : logsLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-11 rounded-lg animate-pulse" style={{ background: 'var(--bg-section)' }} />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {t('no_delivery_records')}
            </p>
            <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
              {t('no_delivery_records_sub')}
            </p>
            <div className="pt-1 flex items-center justify-center gap-2.5">
              <button type="button" onClick={openTestGmailModal} className="btn-ghost text-xs">
                {t('send_test_gmail')}
              </button>
              <button type="button" onClick={handleTestWhatsApp} className="btn-ghost text-xs">
                {t('send_test_whatsapp')}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <th className="py-3 px-5 font-semibold whitespace-nowrap">{t('col_channel')}</th>
                  <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('col_recipient_event')}</th>
                  <th className="py-3 px-4 font-semibold">{t('col_subject_message')}</th>
                  <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('col_status')}</th>
                  <th className="py-3 px-4 font-semibold whitespace-nowrap">{t('col_timestamp')}</th>
                  <th className="py-3 px-5 font-semibold text-right whitespace-nowrap">{t('col_action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {logs.map((log) => {
                  const meta = STATUS_META[log.status] || STATUS_META.queued;
                  const StatusIcon = meta.icon;
                  return (
                    <tr key={log.id} className="transition-colors hover:bg-(--bg-card-hover)">
                      <td className="py-3 px-5 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {log.channel === 'gmail' ? (
                            <Mail size={14} style={{ color: 'var(--text-navy)' }} />
                          ) : (
                            <MessageCircle size={14} style={{ color: 'var(--text-green)' }} />
                          )}
                          <span>{log.channel === 'gmail' ? 'Gmail' : 'WhatsApp'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                          {log.channel === 'whatsapp'
                            ? formatPhoneDisplay(log.recipient) || log.recipient
                            : log.recipient}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <span>{tEvent(log.event_type)}</span>
                          {log.complaint_number && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{log.complaint_number}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {log.subject}
                        </div>
                        <div className="mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {log.error_message || log.message_preview}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 font-medium" style={{ color: meta.color }}>
                          <StatusIcon size={13} />
                          <span>{t(meta.key)}</span>
                        </div>
                        {log.provider_message_id && (
                          <div className="text-[10px] font-mono tabular-nums mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            ID: {String(log.provider_message_id).slice(0, 14)}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        {new Date(log.dispatched_at || log.created_at).toLocaleString(locale)}
                      </td>

                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {log.channel === 'gmail' ? (
                          <button
                            type="button"
                            onClick={() => openSingleGmailModal(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors"
                            style={{
                              borderColor: 'var(--border-mid)',
                              color: 'var(--text-navy)',
                              background: 'var(--bg-card)',
                            }}
                          >
                            <Send size={12} />
                            <span>{log.status === 'sent' ? t('send_gmail') : log.status === 'failed' ? t('retry') : t('send_gmail')}</span>
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            {capabilities.whatsapp_cloud_configured && (
                              <button
                                type="button"
                                disabled={dispatchingRowId === log.id}
                                onClick={() => handleRowWhatsAppDispatch(log)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors disabled:opacity-60"
                                style={{
                                  borderColor: 'var(--border-mid)',
                                  color: 'var(--text-green)',
                                  background: 'var(--bg-card)',
                                }}
                              >
                                <Send size={12} />
                                <span>{dispatchingRowId === log.id ? t('sending') : 'API'}</span>
                              </button>
                            )}
                            {log.fallback_url && (
                              <a
                                href={log.fallback_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors"
                                style={{
                                  borderColor: 'var(--border-mid)',
                                  color: 'var(--text-green)',
                                  background: 'var(--bg-card)',
                                }}
                              >
                                <span>{t('open_whatsapp')}</span>
                                <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Mandatory Explicit Confirmation Modal for Gmail API Sends */}
      <GmailConfirmModal
        isOpen={Boolean(gmailModal)}
        onClose={() => setGmailModal(null)}
        onConfirm={handleConfirmGmailModal}
        mode={gmailModal?.mode || 'single'}
        recipientEmail={gmailModal?.recipientEmail || ''}
        subject={gmailModal?.subject || ''}
        previewBody={gmailModal?.previewBody || ''}
        items={gmailModal?.items || []}
        allowEditRecipient={gmailModal?.allowEditRecipient !== false}
      />
    </div>
  );
}
