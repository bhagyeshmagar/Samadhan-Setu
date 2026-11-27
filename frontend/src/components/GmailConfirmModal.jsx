'use client';

import { useState } from 'react';
import { X, Mail, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useGmailAuth } from '@/lib/gmailAuth';
import { useLanguage } from '@/lib/i18n';
import GoogleSignInButton from './GoogleSignInButton';

function GmailConfirmDialogBody({
  onClose,
  onConfirm,
  mode,
  recipientEmail,
  subject,
  previewBody,
  items,
  allowEditRecipient,
}) {
  const { googleUser, isConnected, isConnecting, authError, connectGmail, getAccessToken } = useGmailAuth();
  const { t } = useLanguage();
  const [editableEmail, setEditableEmail] = useState(recipientEmail || googleUser?.email || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const isBulk = mode === 'bulk' && items.length > 1;
  const itemCount = isBulk ? items.length : 1;

  const handleConfirmSend = async () => {
    setError('');
    const token = getAccessToken();
    if (!token) {
      setError(t('google_not_connected_hint'));
      return;
    }
    const targetEmail = (editableEmail || googleUser?.email || '').trim();
    if (!isBulk && (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(targetEmail))) {
      setError('Please enter a valid recipient email address.');
      return;
    }

    setSending(true);
    try {
      await onConfirm({
        toEmail: targetEmail,
        accessToken: token,
      });
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send email via Gmail.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gmail-confirm-title"
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-xl overflow-hidden"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
        >
          <div className="flex items-center gap-2.5">
            <Mail size={18} style={{ color: 'var(--text-navy)' }} />
            <h2
              id="gmail-confirm-title"
              className="text-base font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {isBulk
                ? t('gmail_modal_bulk_title', { count: itemCount })
                : mode === 'test'
                  ? t('gmail_modal_test_title')
                  : t('gmail_modal_single_title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="p-1.5 rounded-lg transition-colors cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
            aria-label={t('close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {isBulk
              ? t('gmail_modal_bulk_desc', { count: itemCount })
              : t('gmail_modal_single_desc')}
          </p>

          <div
            className="p-3.5 rounded-lg border flex flex-wrap items-center justify-between gap-3"
            style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
          >
            <div className="min-w-0">
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {t('sending_account')}
              </div>
              {isConnected ? (
                <div className="flex items-center gap-1.5 mt-0.5 text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  <CheckCircle2 size={14} style={{ color: 'var(--text-green)' }} />
                  <span className="truncate">{googleUser?.email}</span>
                </div>
              ) : (
                <div className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {t('not_connected_session')}
                </div>
              )}
            </div>
            {!isConnected && (
              <GoogleSignInButton
                onClick={async () => {
                  const res = await connectGmail();
                  if (res?.user?.email && !editableEmail) {
                    setEditableEmail(res.user.email);
                  }
                }}
                loading={isConnecting}
                compact
              />
            )}
          </div>

          {isBulk ? (
            <div className="space-y-2">
              <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {t('affected_notifications', { count: itemCount })}
              </div>
              <div
                className="max-h-48 overflow-y-auto rounded-lg border divide-y"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
              >
                {items.map((item) => (
                  <div key={item.id} className="px-3.5 py-2.5 text-xs">
                    <div className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {item.subject}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 truncate" style={{ color: 'var(--text-secondary)' }}>
                      <span>{item.recipient}</span>
                      {item.complaint_number && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{item.complaint_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('recipient_email')}
                </label>
                {allowEditRecipient ? (
                  <input
                    type="email"
                    value={editableEmail}
                    onChange={(e) => setEditableEmail(e.target.value)}
                    placeholder="citizen@example.com"
                    className="gov-input text-sm"
                  />
                ) : (
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {editableEmail}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('subject')}
                </div>
                <div
                  className="px-3 py-2 rounded-lg border text-sm font-medium"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-page)', color: 'var(--text-primary)' }}
                >
                  {subject}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                  {t('message_preview')}
                </div>
                <div
                  className="px-3 py-2.5 rounded-lg border text-xs leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-page)', color: 'var(--text-secondary)' }}
                >
                  {previewBody}
                </div>
              </div>
            </div>
          )}

          {(error || authError) && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg border text-xs"
              style={{
                borderColor: 'var(--error)',
                background: 'var(--status-critical-bg)',
                color: 'var(--error)',
              }}
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{error || authError}</span>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="btn-ghost text-sm whitespace-nowrap shrink-0"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirmSend}
            disabled={sending || !isConnected}
            className="btn-gov-primary text-sm whitespace-nowrap shrink-0"
          >
            <Send size={14} />
            <span>
              {sending
                ? t('sending')
                : isBulk
                  ? t('confirm_send_bulk', { count: itemCount })
                  : t('confirm_send_gmail')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GmailConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  mode = 'single',
  recipientEmail = '',
  subject = '',
  previewBody = '',
  items = [],
  allowEditRecipient = true,
}) {
  if (!isOpen) return null;

  return (
    <GmailConfirmDialogBody
      key={`${mode}-${recipientEmail}-${subject}-${items.length}`}
      onClose={onClose}
      onConfirm={onConfirm}
      mode={mode}
      recipientEmail={recipientEmail}
      subject={subject}
      previewBody={previewBody}
      items={items}
      allowEditRecipient={allowEditRecipient}
    />
  );
}
