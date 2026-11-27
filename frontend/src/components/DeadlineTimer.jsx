'use client';

import { useSyncExternalStore } from 'react';
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

let currentClockTime = typeof window !== 'undefined' ? Date.now() : 0;
const clockListeners = new Set();
let clockIntervalId = null;

const subscribeToClock = (callback) => {
    clockListeners.add(callback);
    if (clockIntervalId === null && typeof window !== 'undefined') {
        currentClockTime = Date.now();
        clockIntervalId = setInterval(() => {
            currentClockTime = Date.now();
            clockListeners.forEach(cb => {
                try { cb(); } catch {}
            });
        }, 1000);
    }
    return () => {
        clockListeners.delete(callback);
        if (clockListeners.size === 0 && clockIntervalId !== null) {
            clearInterval(clockIntervalId);
            clockIntervalId = null;
        }
    };
};

const getClockSnapshot = () => currentClockTime;
const getClockServerSnapshot = () => 0;

const STATUTORY_HOURS = {
    critical: 72,
    high: 120,
    medium: 168,
    low: 504,
};

export default function DeadlineTimer({
    deadline,
    createdAt,
    priority = 'medium',
    status = 'submitted',
    resolvedAt = null,
    compact = false,
    showProgressBar = false,
    className = '',
}) {
    const { t, locale } = useLanguage();
    const now = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockServerSnapshot);

    const priorityKey = (priority || 'medium').toLowerCase();
    const statutoryHours = STATUTORY_HOURS[priorityKey] || 168;
    const statutoryDays = Math.round(statutoryHours / 24);

    let targetDate = deadline ? new Date(deadline) : null;
    const startDate = createdAt ? new Date(createdAt) : null;

    if (!targetDate && startDate) {
        targetDate = new Date(startDate.getTime() + statutoryHours * 3600 * 1000);
    }

    const statusLower = (status || '').toLowerCase().replace(/\s+/g, '_');
    const isCompleted = ['resolved', 'closed', 'completed'].includes(statusLower);

    if (!targetDate) {
        return (
            <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${className}`}
                style={{ background: 'var(--bg-section)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
            >
                <Clock size={12} />
                <span className="tabular-nums">SLA: {statutoryDays}d</span>
            </span>
        );
    }

    const targetMs = targetDate.getTime();
    const startMs = startDate ? startDate.getTime() : (targetMs - statutoryHours * 3600 * 1000);

    if (isCompleted) {
        const resolvedMs = resolvedAt ? new Date(resolvedAt).getTime() : now;
        const wasOnTime = resolvedMs <= targetMs;

        const toneStyle = wasOnTime
            ? { background: 'var(--status-resolved-bg)', color: 'var(--status-resolved)', borderColor: 'var(--india-green)' }
            : { background: 'var(--status-in-progress-bg)', color: 'var(--status-in-progress)', borderColor: 'var(--saffron)' };

        if (compact) {
            return (
                <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${className}`}
                    style={toneStyle}
                >
                    <CheckCircle2 size={11} />
                    <span>{wasOnTime ? t('sla_in_sla') : t('sla_late')}</span>
                </span>
            );
        }

        return (
            <div className={`inline-flex flex-col gap-1 ${className}`}>
                <div
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={toneStyle}
                >
                    <CheckCircle2 size={13} />
                    <span>
                        {wasOnTime
                            ? t('sla_resolved_on_time', { days: statutoryDays })
                            : t('sla_resolved_late')}
                    </span>
                </div>
            </div>
        );
    }

    const diffMs = targetMs - now;
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);

    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');
    let timeStr = '';
    if (days > 0) {
        timeStr = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    } else if (hours > 0) {
        timeStr = `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    } else {
        timeStr = `${minutes}m ${pad(seconds)}s`;
    }

    const hoursLeft = diffMs / (1000 * 3600);
    let tone = {
        bg: 'var(--status-resolved-bg)',
        text: 'var(--status-resolved)',
        border: 'var(--india-green)',
        icon: <Clock size={12} />,
        label: t('sla_target'),
        barColor: 'var(--india-green)',
    };

    if (isOverdue) {
        tone = {
            bg: 'var(--status-critical-bg)',
            text: 'var(--status-critical)',
            border: 'var(--error)',
            icon: <ShieldAlert size={13} />,
            label: t('sla_breached'),
            barColor: 'var(--error)',
        };
    } else if (hoursLeft <= 24) {
        tone = {
            bg: 'var(--status-critical-bg)',
            text: 'var(--status-critical)',
            border: 'var(--error)',
            icon: <AlertTriangle size={12} />,
            label: t('sla_urgency'),
            barColor: 'var(--error)',
        };
    } else if (hoursLeft <= 48) {
        tone = {
            bg: 'var(--status-in-progress-bg)',
            text: 'var(--status-in-progress)',
            border: 'var(--saffron)',
            icon: <AlertTriangle size={12} />,
            label: t('sla_target'),
            barColor: 'var(--saffron)',
        };
    }

    const totalDuration = Math.max(1, targetMs - startMs);
    const elapsed = Math.max(0, now - startMs);
    const percentConsumed = Math.min(100, Math.round((elapsed / totalDuration) * 100));

    if (compact) {
        return (
            <span
                title={`${t('sla_deadline')}: ${targetDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${className}`}
                style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
            >
                {tone.icon}
                <span className="font-mono tracking-tight tabular-nums">
                    {isOverdue ? `${t('sla_overdue_by')} ${days}d ${hours}h` : `${timeStr} ${t('sla_left')}`}
                </span>
            </span>
        );
    }

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold"
                style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
            >
                {tone.icon}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-85">
                        {tone.label} ({statutoryDays}d):
                    </span>
                    <span className="font-mono font-bold text-xs tracking-tight tabular-nums">
                        {isOverdue
                            ? `${t('sla_overdue_by')} ${days}d ${hours}h ${minutes}m ${seconds}s`
                            : `${timeStr} ${t('sla_remaining')}`}
                    </span>
                </div>
            </div>

            {showProgressBar && (
                <div className="w-full">
                    <div className="flex justify-between items-center text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                        <span>{t('submitted')} {startDate ? startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : ''}</span>
                        <span className="font-mono font-semibold tabular-nums">
                            {isOverdue ? t('sla_time_elapsed') : t('sla_window_consumed', { pct: percentConsumed })}
                        </span>
                        <span>{t('sla_deadline')}: {targetDate.toLocaleDateString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{ width: `${percentConsumed}%`, background: tone.barColor }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
