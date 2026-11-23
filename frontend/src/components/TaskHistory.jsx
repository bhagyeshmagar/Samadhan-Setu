'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import {
    History,
    RefreshCw,
    AlertTriangle,
    Loader2,
    X,
    UserCheck,
    MessageSquareText,
    Clock,
} from 'lucide-react';
import { workflowAPI } from '@/lib/api';
import {
    buildTaskHistoryTimeline,
    formatTimelineTimestamp,
    formatSlaDeadline,
    getTimelineDotModifier,
    getPriorityConfig,
} from '@/lib/taskAssignment';

/**
 * Reusable TaskHistory component for the Nodal Dashboard.
 *
 * Fetches and displays the chronological audit trail for a grievance — including
 * task creation, status transitions, timestamped officer/team assignments, and
 * actor comments — styled with the `.timeline`, `.timeline-item`, and `.timeline-dot`
 * classes defined in `globals.css`.
 *
 * Variants:
 *  - 'modal'    : Accessible audit-trail dialog opened from any grievance card
 *  - 'panel'    : Standalone card embedded directly inside the Nodal Dashboard
 *  - 'embedded' : Compact timeline section embedded inside TaskAssignment
 */
export default function TaskHistory({
    complaintId,
    initialComplaint = null,
    variant = 'panel',
    refreshKey = 0,
    onClose,
}) {
    const headingId = useId();
    const resolvedId = complaintId || initialComplaint?.id || '';

    const [auditData, setAuditData] = useState(null);
    const [fetchState, setFetchState] = useState({ status: 'idle', error: '' });
    const [manualTick, setManualTick] = useState(0);

    useEffect(() => {
        if (!resolvedId) return;
        let cancelled = false;

        async function loadAuditTrail() {
            setFetchState({ status: 'loading', error: '' });
            try {
                const payload = await workflowAPI.getComplaintAuditTrail(resolvedId);
                if (!cancelled) {
                    setAuditData(payload);
                    setFetchState({ status: 'ready', error: '' });
                }
            } catch (err) {
                if (!cancelled) {
                    setFetchState({
                        status: 'error',
                        error: err?.message || 'Unable to load grievance audit trail.',
                    });
                }
            }
        }

        loadAuditTrail();
        return () => {
            cancelled = true;
        };
    }, [resolvedId, refreshKey, manualTick]);

    // Escape key closes modal variant
    useEffect(() => {
        if (variant !== 'modal' || !onClose) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [variant, onClose]);

    const mergedComplaint = useMemo(() => {
        if (auditData && auditData.complaint_id === resolvedId) {
            return {
                ...(initialComplaint || {}),
                id: auditData.complaint_id,
                complaint_number: auditData.complaint_number || initialComplaint?.complaint_number,
                title: auditData.title || initialComplaint?.title,
                status: auditData.status || initialComplaint?.status,
                priority: auditData.priority || initialComplaint?.priority,
                sla_deadline: auditData.sla_deadline || initialComplaint?.sla_deadline,
                created_at: auditData.created_at || initialComplaint?.created_at,
                assigned_inspector_name: auditData.assigned_inspector_name ?? initialComplaint?.assigned_inspector_name,
                assigned_team_name: auditData.assigned_team_name ?? initialComplaint?.assigned_team_name,
                status_history: auditData.status_history || initialComplaint?.status_history || [],
                audit_logs: auditData.audit_logs || [],
            };
        }
        return initialComplaint;
    }, [auditData, initialComplaint, resolvedId]);

    const events = useMemo(
        () => buildTaskHistoryTimeline(mergedComplaint, mergedComplaint?.audit_logs || []),
        [mergedComplaint]
    );

    const isLoading = fetchState.status === 'loading';
    const hasFreshAudit = Boolean(auditData && auditData.complaint_id === resolvedId);
    const priorityMeta = mergedComplaint?.priority ? getPriorityConfig(mergedComplaint.priority) : null;

    const timelineBody = (
        <>
            {fetchState.status === 'error' && (
                <div
                    role="alert"
                    className="px-3 py-2 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs flex items-center justify-between gap-2 mb-3"
                >
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                        <AlertTriangle size={13} className="shrink-0" />
                        <span className="truncate">{fetchState.error}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setManualTick((n) => n + 1)}
                        className="text-[11px] font-semibold underline shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {isLoading && events.length === 0 ? (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-(--text-muted)">
                    <Loader2 size={14} className="animate-spin text-(--navy)" />
                    <span>Fetching chronological audit trail…</span>
                </div>
            ) : events.length === 0 ? (
                <p className="text-xs text-(--text-muted) py-2">
                    No status transitions or assignment events have been recorded for this grievance yet.
                </p>
            ) : (
                <ol
                    data-testid="task-history-timeline"
                    className={`timeline ${
                        variant === 'embedded'
                            ? 'max-h-40 overflow-y-auto pr-1'
                            : variant === 'modal'
                            ? 'max-h-[54vh] overflow-y-auto pr-2'
                            : 'max-h-72 overflow-y-auto pr-1'
                    }`}
                >
                    {events.map((ev, idx) => {
                        const isLatest = idx === events.length - 1;
                        const dotModifier = getTimelineDotModifier(ev, isLatest);
                        const dotClass = dotModifier ? `timeline-dot ${dotModifier}` : 'timeline-dot';

                        return (
                            <li
                                key={ev.id}
                                className={`timeline-item ${isLatest ? 'pb-1!' : ''}`}
                            >
                                <span className={dotClass} aria-hidden="true" />

                                <div className="space-y-1">
                                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                        <span className="text-xs font-semibold text-(--text-primary)">
                                            {ev.title}
                                        </span>
                                        <time
                                            dateTime={ev.timestamp || undefined}
                                            className="text-[11px] font-mono tabular-nums text-(--text-muted) whitespace-nowrap"
                                        >
                                            {formatTimelineTimestamp(ev.timestamp)}
                                        </time>
                                    </div>

                                    {/* Actor & Assignment Metadata (Clean Unboxed Typography) */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-(--text-muted)">
                                        {ev.actorName && (
                                            <span className="font-medium text-(--text-secondary)">
                                                {ev.actorName}
                                            </span>
                                        )}
                                        {ev.actorRole && (
                                            <>
                                                {ev.actorName && <span aria-hidden="true">·</span>}
                                                <span className="capitalize">
                                                    {ev.actorRole.replace(/_/g, ' ')}
                                                </span>
                                            </>
                                        )}
                                        {ev.assigneeName && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span className="inline-flex items-center gap-1 text-(--navy) font-semibold">
                                                    <UserCheck size={11} className="shrink-0" />
                                                    <span>Assignee: {ev.assigneeName}</span>
                                                </span>
                                            </>
                                        )}
                                        {ev.priority && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span
                                                    className="capitalize font-semibold"
                                                    style={{ color: getPriorityConfig(ev.priority).accent }}
                                                >
                                                    {ev.priority} priority
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Comments / Remarks */}
                                    {ev.remarks && (
                                        <p className="text-xs text-(--text-secondary) leading-relaxed flex items-start gap-1.5">
                                            <MessageSquareText
                                                size={12}
                                                className="shrink-0 mt-0.5 text-(--text-muted)"
                                                aria-hidden="true"
                                            />
                                            <span className={variant === 'embedded' ? 'line-clamp-2' : ''}>
                                                {ev.remarks}
                                            </span>
                                        </p>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </>
    );

    if (variant === 'embedded') {
        return (
            <div
                data-testid="task-assignment-history"
                className="pt-3 border-t space-y-2.5"
                style={{ borderColor: 'var(--border)' }}
            >
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-(--text-primary)">
                        <History size={13} className="text-(--navy) shrink-0" />
                        <span>Task History</span>
                    </span>
                    <div className="flex items-center gap-2">
                        {isLoading && <Loader2 size={11} className="animate-spin text-(--text-muted)" />}
                        <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                            {events.length} {events.length === 1 ? 'event' : 'events'}
                        </span>
                    </div>
                </div>
                {timelineBody}
            </div>
        );
    }

    const headerBar = (
        <div
            className={`border-b flex items-start justify-between gap-3 ${
                variant === 'modal' ? 'px-5 py-4' : 'px-4 py-3'
            }`}
            style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
        >
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-(--text-muted)">
                    <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-(--text-primary)">
                        <History size={13} className="text-(--navy) shrink-0" />
                        <span>Task History</span>
                    </span>
                    {mergedComplaint?.complaint_number && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-bold text-(--navy)">
                                {mergedComplaint.complaint_number}
                            </span>
                        </>
                    )}
                    {priorityMeta && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize font-semibold" style={{ color: priorityMeta.accent }}>
                                {priorityMeta.label} Priority
                            </span>
                        </>
                    )}
                </div>
                {mergedComplaint?.title && (
                    <h2 id={headingId} className="text-sm font-bold text-(--text-primary) mt-1">
                        {mergedComplaint.title}
                    </h2>
                )}
                {mergedComplaint?.sla_deadline && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-(--text-secondary) mt-1">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock size={11} className="text-(--text-muted) shrink-0" />
                            <span>SLA Deadline: {formatSlaDeadline(mergedComplaint.sla_deadline)}</span>
                        </span>
                        {mergedComplaint.assigned_inspector_name && (
                            <span>
                                Inspector: <strong className="text-(--text-primary)">{mergedComplaint.assigned_inspector_name}</strong>
                            </span>
                        )}
                        {mergedComplaint.assigned_team_name && (
                            <span>
                                Team: <strong className="text-(--text-primary)">{mergedComplaint.assigned_team_name}</strong>
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
                <button
                    type="button"
                    onClick={() => setManualTick((n) => n + 1)}
                    disabled={isLoading}
                    aria-label="Refresh audit trail"
                    className="p-1.5 rounded-md border text-(--text-secondary) hover:bg-(--bg-section) disabled:opacity-50"
                    style={{ borderColor: 'var(--border-mid)', background: 'var(--bg-card)' }}
                >
                    <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                </button>
                {variant === 'modal' && onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close task history dialog"
                        className="p-1.5 rounded-md text-(--text-muted) hover:bg-(--bg-section)"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>
        </div>
    );

    if (variant === 'modal') {
        return (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                data-testid="task-history-modal"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && onClose) {
                        onClose();
                    }
                }}
            >
                <div
                    className="w-full max-w-xl rounded-xl border shadow-xl overflow-hidden"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    {headerBar}
                    <div className="p-5">{timelineBody}</div>
                    <div
                        className="px-5 py-3 border-t flex items-center justify-between gap-2"
                        style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                    >
                        <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                            {events.length} chronological audit {events.length === 1 ? 'record' : 'records'}
                            {hasFreshAudit ? ' · synced' : ''}
                        </span>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-1.5 text-xs font-semibold rounded-md border whitespace-nowrap"
                                style={{
                                    borderColor: 'var(--border-mid)',
                                    color: 'var(--text-primary)',
                                    background: 'var(--bg-card)',
                                }}
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section
            aria-labelledby={headingId}
            data-testid="task-history-panel"
            className="rounded-lg border overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
            {headerBar}
            <div className="p-4">{timelineBody}</div>
        </section>
    );
}
