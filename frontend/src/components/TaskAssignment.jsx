'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import {
    ClipboardCheck,
    UserPlus,
    Wrench,
    X,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Clock,
    MapPin,
    ShieldCheck,
    CalendarClock,
    ArrowRight,
} from 'lucide-react';
import TaskHistory from '@/components/TaskHistory';
import {
    PRIORITY_OPTIONS,
    INSTRUCTION_PRESETS,
    normalizePriority,
    getPriorityConfig,
    getNowMs,
    computeSlaDeadline,
    formatSlaDeadline,
    describeSlaDelta,
    sortInspectorsByWorkload,
    sortTeamsByWorkload,
} from '@/lib/taskAssignment';

const MODE_COPY = {
    inspector: {
        title: 'Assign Site Inspection',
        inlineTitle: 'Quick Task Assignment',
        inlineSubtitle: 'Dispatch a new grievance to an available Inspection Officer and set its priority SLA.',
        assigneeLabel: 'Inspection Officer',
        emptyAssigneeMessage: 'No active Inspection Officers are available in this department.',
        isolationNote: 'Strict task isolation applies: only the selected inspection officer will see this assignment.',
        placeholder: 'e.g., Verify exact dimensions, inspect drainage blockage, and upload geotagged site photos...',
        submitLabel: 'Assign Task',
        reassignLabel: 'Confirm Reassignment',
    },
    team: {
        title: 'Dispatch Field Redressal Team',
        inlineTitle: 'Field Team Dispatch',
        inlineSubtitle: 'Assign a verified grievance to a departmental field squad and confirm its priority SLA.',
        assigneeLabel: 'Field Redressal Team',
        emptyAssigneeMessage: 'No active Field Redressal Teams are configured for this department.',
        isolationNote: 'Strict task isolation applies: only the selected team lead will see this work order.',
        placeholder: 'e.g., Mobilize hot-mix patching crew, barricade affected lane, and upload resolution proof...',
        submitLabel: 'Dispatch Team',
        reassignLabel: 'Confirm Reassignment',
    },
    verifier: {
        title: 'Assign Post-Repair Verifier',
        inlineTitle: 'Verification Assignment',
        inlineSubtitle: 'Assign an Inspection Officer for independent post-repair verification.',
        assigneeLabel: 'Verification Officer',
        emptyAssigneeMessage: 'No active Inspection Officers are available for site verification.',
        isolationNote: 'Strict task isolation applies: only the selected verifier will see this verification task.',
        placeholder: 'e.g., Re-inspect repaired section and confirm quality matches initial inspection report...',
        submitLabel: 'Assign Verifier',
        reassignLabel: 'Confirm Verifier',
    },
};

/**
 * Reusable Task Assignment component for the Nodal Officer Dashboard.
 *
 * Supports:
 *  - variant: 'inline' (flat dashboard card with grievance picker) | 'modal' (accessible dialog locked to a complaint)
 *  - mode: 'inspector' (default) | 'team' | 'verifier'
 *  - Priority selection with live SLA target preview & server-side SLA recalculation
 *  - Workload-sorted dropdown of available officers/teams
 *  - Dispatch instructions textarea with optional quick instruction presets
 */
export default function TaskAssignment({
    variant = 'inline',
    mode = 'inspector',
    complaint = null,
    complaints = [],
    officers = [],
    teams = [],
    defaultPriority,
    submitting = false,
    onAssign,
    onCancel,
}) {
    const uid = useId();
    const copy = MODE_COPY[mode] || MODE_COPY.inspector;

    const sortedAssignees = useMemo(
        () => (mode === 'team' ? sortTeamsByWorkload(teams) : sortInspectorsByWorkload(officers)),
        [mode, officers, teams]
    );

    const selectableComplaints = useMemo(
        () => (complaint ? [complaint] : Array.isArray(complaints) ? complaints : []),
        [complaint, complaints]
    );

    const [selectedComplaintId, setSelectedComplaintId] = useState('');
    const [assigneeDraft, setAssigneeDraft] = useState({ complaintId: null, value: '' });
    const [priorityDraft, setPriorityDraft] = useState({ complaintId: null, value: '' });
    const [slaBaseTimeMs, setSlaBaseTimeMs] = useState(getNowMs);
    const [priorityInteracted, setPriorityInteracted] = useState(false);
    const [instructions, setInstructions] = useState('');
    const [localError, setLocalError] = useState('');
    const [internalBusy, setInternalBusy] = useState(false);

    const activeComplaint = useMemo(() => {
        if (complaint) return complaint;
        return selectableComplaints.find((c) => c.id === selectedComplaintId) || selectableComplaints[0] || null;
    }, [complaint, selectableComplaints, selectedComplaintId]);

    const currentAssigneeId = useMemo(() => {
        if (!activeComplaint) return '';
        if (mode === 'team') return activeComplaint.assigned_team_id || '';
        if (mode === 'verifier') return activeComplaint.verification_inspector_id || '';
        return activeComplaint.assigned_inspector_id || '';
    }, [activeComplaint, mode]);

    const assigneeId = useMemo(() => {
        const draftValue = assigneeDraft.complaintId === activeComplaint?.id ? assigneeDraft.value : '';
        if (draftValue && sortedAssignees.some((a) => a.id === draftValue)) {
            return draftValue;
        }
        if (currentAssigneeId && sortedAssignees.some((a) => a.id === currentAssigneeId)) {
            return currentAssigneeId;
        }
        return sortedAssignees[0]?.id || '';
    }, [assigneeDraft, activeComplaint, sortedAssignees, currentAssigneeId]);

    const priority = useMemo(() => {
        if (priorityDraft.complaintId === activeComplaint?.id && priorityDraft.value) {
            return normalizePriority(priorityDraft.value);
        }
        return normalizePriority(defaultPriority || activeComplaint?.priority || 'medium');
    }, [priorityDraft, activeComplaint, defaultPriority]);

    const isBusy = submitting || internalBusy;
    const isReassign = Boolean(currentAssigneeId);

    // Escape key closes modal variant when not actively submitting
    useEffect(() => {
        if (variant !== 'modal' || !onCancel) return;
        const onKeyDown = (e) => {
            if (e.key === 'Escape' && !isBusy) {
                onCancel();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [variant, onCancel, isBusy]);

    const currentPriority = normalizePriority(activeComplaint?.priority || 'medium');
    const selectedPriorityConfig = getPriorityConfig(priority);
    const priorityChanged = Boolean(activeComplaint && currentPriority !== priority);
    const presets = INSTRUCTION_PRESETS[mode] || INSTRUCTION_PRESETS.inspector;

    const recalculatedDeadlineIso = useMemo(
        () => computeSlaDeadline(priority, new Date(slaBaseTimeMs)),
        [priority, slaBaseTimeMs]
    );
    const slaDelta = useMemo(
        () => describeSlaDelta(activeComplaint?.sla_deadline, recalculatedDeadlineIso),
        [activeComplaint?.sla_deadline, recalculatedDeadlineIso]
    );

    const handleSelectComplaint = (nextId) => {
        setSelectedComplaintId(nextId);
        setPriorityInteracted(false);
        setSlaBaseTimeMs(getNowMs());
        setLocalError('');
    };

    const handleSelectAssignee = (nextId) => {
        setAssigneeDraft({ complaintId: activeComplaint?.id || null, value: nextId });
        if (localError) setLocalError('');
    };

    const handleSelectPriority = (nextPriority) => {
        setPriorityDraft({ complaintId: activeComplaint?.id || null, value: nextPriority });
        setSlaBaseTimeMs(getNowMs());
        setPriorityInteracted(true);
    };

    const handleInsertPreset = (presetText) => {
        setInstructions((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) return presetText;
            if (trimmed.includes(presetText)) return prev;
            return `${trimmed}\n${presetText}`;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError('');

        if (!activeComplaint) {
            setLocalError('Select a grievance before assigning a task.');
            return;
        }
        if (!assigneeId) {
            setLocalError(`Select an available ${copy.assigneeLabel.toLowerCase()} to continue.`);
            return;
        }
        if (typeof onAssign !== 'function') return;

        setInternalBusy(true);
        try {
            await onAssign({
                complaintId: activeComplaint.id,
                complaint: activeComplaint,
                mode,
                assigneeId,
                priority,
                instructions: instructions.trim(),
            });
            setInstructions('');
            setAssigneeDraft({ complaintId: null, value: '' });
            setPriorityDraft({ complaintId: null, value: '' });
        } catch (err) {
            setLocalError(err?.message || 'Task assignment failed. Please try again.');
        } finally {
            setInternalBusy(false);
        }
    };

    const grievanceSelectId = `${uid}-grievance`;
    const assigneeSelectId = `${uid}-assignee`;
    const instructionsId = `${uid}-instructions`;
    const headingId = `${uid}-heading`;

    // Empty state for inline card when all new intake grievances have already been dispatched
    if (variant === 'inline' && !activeComplaint) {
        return (
            <section
                aria-labelledby={headingId}
                data-testid="task-assignment-inline"
                className="rounded-lg border overflow-hidden"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
                <div
                    className="px-4 py-3 border-b flex items-center justify-between gap-2"
                    style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <UserPlus size={14} className="text-(--navy) shrink-0" />
                        <h2 id={headingId} className="text-xs font-bold uppercase tracking-wider text-(--text-primary) truncate">
                            {copy.inlineTitle}
                        </h2>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-(--text-muted) whitespace-nowrap shrink-0">
                        0 pending
                    </span>
                </div>
                <div className="p-4 flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-[#138808] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-(--text-primary)">All new intake grievances dispatched</p>
                        <p className="text-[11px] text-(--text-secondary) leading-relaxed">
                            Every newly received departmental complaint currently has an assigned Inspection Officer. You can still reassign any active case directly from its card.
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    const formContent = (
        <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
            {/* Header */}
            <div
                className={`border-b flex items-start justify-between gap-3 ${variant === 'modal' ? 'px-5 py-3.5' : 'px-4 py-2.5'}`}
                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
            >
                <div className="min-w-0">
                    {variant === 'modal' && activeComplaint ? (
                        <>
                            <div className="flex items-center gap-2 text-[11px] text-(--text-muted)">
                                <span className="font-mono font-bold text-(--navy)">{activeComplaint.complaint_number}</span>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">{activeComplaint.ward || 'Municipal Ward'}</span>
                            </div>
                            <h2 id={headingId} className="text-sm font-bold text-(--text-primary) mt-0.5">
                                {copy.title}
                            </h2>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                {mode === 'team' ? (
                                    <Wrench size={14} className="text-(--navy) shrink-0" />
                                ) : (
                                    <UserPlus size={14} className="text-(--navy) shrink-0" />
                                )}
                                <h2 id={headingId} className="text-xs font-bold uppercase tracking-wider text-(--text-primary)">
                                    {copy.inlineTitle}
                                </h2>
                            </div>
                            <p className="text-[11px] text-(--text-secondary) mt-0.5 leading-snug">{copy.inlineSubtitle}</p>
                        </>
                    )}
                </div>

                {variant === 'modal' && onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isBusy}
                        aria-label="Close task assignment dialog"
                        className="p-1.5 rounded-md text-(--text-muted) hover:bg-(--bg-section) focus-visible:outline-2 focus-visible:outline-(--navy) disabled:opacity-50 shrink-0"
                    >
                        <X size={16} />
                    </button>
                ) : (
                    <span className="text-[11px] font-mono tabular-nums text-(--text-muted) whitespace-nowrap shrink-0 mt-0.5">
                        {selectableComplaints.length} new
                    </span>
                )}
            </div>

            {/* Body */}
            <div
                className={
                    variant === 'modal'
                        ? 'p-5 space-y-4 max-h-[72vh] overflow-y-auto'
                        : 'p-3.5 space-y-3'
                }
            >
                {/* Inline Grievance Selector OR Modal Grievance Summary */}
                {variant === 'inline' && !complaint ? (
                    <div className="space-y-1.5">
                        <label htmlFor={grievanceSelectId} className="block text-xs font-semibold text-(--text-primary)">
                            New Grievance
                        </label>
                        <select
                            id={grievanceSelectId}
                            value={activeComplaint?.id || ''}
                            onChange={(e) => handleSelectComplaint(e.target.value)}
                            disabled={isBusy}
                            className="w-full px-3 py-2 text-xs rounded-md border focus-visible:outline-2 focus-visible:outline-(--navy)"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                        >
                            {selectableComplaints.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.complaint_number} — {item.title}
                                </option>
                            ))}
                        </select>
                        {activeComplaint && (
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-(--text-muted)">
                                <span className="inline-flex items-center gap-1 min-w-0 truncate">
                                    <MapPin size={11} className="shrink-0" />
                                    <span className="truncate">{activeComplaint.location}</span>
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="whitespace-nowrap">{activeComplaint.ward}</span>
                            </div>
                        )}
                    </div>
                ) : (
                    activeComplaint && (
                        <div className="pb-3 border-b space-y-1" style={{ borderColor: 'var(--border)' }}>
                            <p className="text-xs font-semibold text-(--text-primary)">{activeComplaint.title}</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-(--text-secondary)">
                                <span className="inline-flex items-center gap-1">
                                    <MapPin size={11} className="text-(--text-muted) shrink-0" />
                                    <span>{activeComplaint.location}</span>
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="capitalize">Current: {currentPriority} priority</span>
                            </div>
                        </div>
                    )
                )}

                {/* Officer / Field Team Dropdown */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor={assigneeSelectId} className="block text-xs font-semibold text-(--text-primary)">
                            {copy.assigneeLabel}
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                            {sortedAssignees.length} available
                        </span>
                    </div>

                    {sortedAssignees.length === 0 ? (
                        <div className="px-3 py-2.5 rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <span>{copy.emptyAssigneeMessage}</span>
                        </div>
                    ) : (
                        <>
                            <select
                                id={assigneeSelectId}
                                value={assigneeId}
                                onChange={(e) => handleSelectAssignee(e.target.value)}
                                disabled={isBusy}
                                required
                                className="w-full px-3 py-2 text-xs rounded-md border focus-visible:outline-2 focus-visible:outline-(--navy)"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                            >
                                <option value="" disabled>
                                    Select {copy.assigneeLabel.toLowerCase()}…
                                </option>
                                {mode === 'team'
                                    ? sortedAssignees.map((t) => {
                                          const load = t.active_work_orders ?? t.active_tasks ?? 0;
                                          const tag = t.id === currentAssigneeId ? ' [Current]' : '';
                                          return (
                                              <option key={t.id} value={t.id}>
                                                  {t.name} ({t.code}) · Lead: {t.team_lead_name} ({load}/{t.daily_capacity} load){tag}
                                              </option>
                                          );
                                      })
                                    : sortedAssignees.map((officer) => {
                                          const load = officer.active_inspections ?? officer.active_tasks ?? 0;
                                          const tag = officer.id === currentAssigneeId ? ' [Current]' : '';
                                          return (
                                              <option key={officer.id} value={officer.id}>
                                                  {officer.name} ({officer.employee_id}) — {load} active {load === 1 ? 'task' : 'tasks'}
                                                  {tag}
                                              </option>
                                          );
                                      })}
                            </select>
                            <p className="text-[11px] text-(--text-muted) flex items-start gap-1.5">
                                <ShieldCheck size={12} className="shrink-0 mt-0.5 text-(--navy)" />
                                <span>{copy.isolationNote}</span>
                            </p>
                        </>
                    )}
                </div>

                {/* Priority Level Selector with Live SLA Preview */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <span id={`${uid}-priority-label`} className="text-xs font-semibold text-(--text-primary)">
                            Priority Level
                        </span>
                        <span
                            data-testid="task-assignment-sla-preview"
                            className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums font-semibold"
                            style={{ color: selectedPriorityConfig.accent }}
                        >
                            <Clock size={11} />
                            <span>{selectedPriorityConfig.slaLabel}</span>
                        </span>
                    </div>

                    <div
                        role="radiogroup"
                        aria-labelledby={`${uid}-priority-label`}
                        className="grid grid-cols-4 gap-1 p-1 rounded-md border"
                        style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                    >
                        {PRIORITY_OPTIONS.map((opt) => {
                            const selected = priority === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    disabled={isBusy}
                                    onClick={() => handleSelectPriority(opt.value)}
                                    className="px-2 py-2 rounded text-xs font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-(--navy) disabled:opacity-50"
                                    style={
                                        selected
                                            ? {
                                                  background: opt.accent,
                                                  color: '#FFFFFF',
                                              }
                                            : {
                                                  background: 'transparent',
                                                  color: 'var(--text-secondary)',
                                              }
                                    }
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Immediate Recalculated SLA Deadline Visual Indicator */}
                    <div
                        data-testid="task-assignment-sla-indicator"
                        aria-live="polite"
                        className="rounded-md border px-3 py-2.5 space-y-1.5 transition-colors"
                        style={{
                            background: 'var(--bg-page)',
                            borderColor: priorityChanged || priorityInteracted ? selectedPriorityConfig.accent : 'var(--border)',
                        }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <span
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
                                style={{ color: selectedPriorityConfig.accent }}
                            >
                                <CalendarClock size={13} className="shrink-0" />
                                <span>
                                    {priorityChanged || priorityInteracted
                                        ? 'Recalculated SLA Deadline'
                                        : 'Target SLA Deadline'}
                                </span>
                            </span>
                            <span
                                data-testid="task-assignment-sla-delta"
                                className="text-[11px] font-mono tabular-nums font-semibold"
                                style={{
                                    color:
                                        slaDelta.direction === 'tighter'
                                            ? '#DC2626'
                                            : slaDelta.direction === 'extended'
                                            ? '#0369A1'
                                            : 'var(--text-muted)',
                                }}
                            >
                                {slaDelta.label}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span
                                data-testid="task-assignment-recalculated-deadline"
                                className="text-xs font-mono font-bold tabular-nums text-(--text-primary)"
                            >
                                {formatSlaDeadline(recalculatedDeadlineIso)}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                                {selectedPriorityConfig.slaHours}h from dispatch
                            </span>
                        </div>

                        {activeComplaint?.sla_deadline && (
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-(--text-muted) pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                                <span>Current:</span>
                                <span className="font-mono tabular-nums text-(--text-secondary)">
                                    {formatSlaDeadline(activeComplaint.sla_deadline)}
                                </span>
                                <ArrowRight size={11} className="shrink-0" aria-hidden="true" />
                                <span className="capitalize font-semibold" style={{ color: selectedPriorityConfig.accent }}>
                                    {priority}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums font-semibold text-(--text-primary)">
                                    {formatSlaDeadline(recalculatedDeadlineIso)}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Instructions Input + Quick Presets */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <label htmlFor={instructionsId} className="block text-xs font-semibold text-(--text-primary)">
                            Dispatch Instructions
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                            {instructions.length}/400
                        </span>
                    </div>

                    <textarea
                        id={instructionsId}
                        rows={variant === 'modal' ? 3 : 2}
                        maxLength={400}
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        disabled={isBusy}
                        placeholder={copy.placeholder}
                        className="w-full px-3 py-2 text-xs rounded-md border resize-y focus-visible:outline-2 focus-visible:outline-(--navy)"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                    />

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">Quick fill:</span>
                        {presets.map((preset, idx) => (
                            <button
                                key={idx}
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleInsertPreset(preset)}
                                className="text-[11px] text-(--navy) hover:underline text-left disabled:opacity-50"
                            >
                                + {idx === 0 ? 'GPS & dimensions' : idx === 1 ? 'Safety check' : 'Landmark verify'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Chronological Task History Audit Trail (.timeline) */}
                {activeComplaint && (
                    <TaskHistory
                        variant="embedded"
                        complaintId={activeComplaint.id}
                        initialComplaint={activeComplaint}
                    />
                )}

                {/* Inline Error Feedback */}
                {localError && (
                    <div
                        role="alert"
                        className="px-3 py-2.5 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2"
                    >
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{localError}</span>
                    </div>
                )}
            </div>

            {/* Footer Action Bar */}
            <div
                className={`border-t flex items-center justify-end gap-2 ${variant === 'modal' ? 'px-5 py-3.5' : 'px-3.5 py-2.5'}`}
                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
            >
                {variant === 'modal' && onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isBusy}
                        className="px-4 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap disabled:opacity-50"
                        style={{ borderColor: 'var(--border-mid)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                    >
                        Cancel
                    </button>
                )}

                <button
                    type="submit"
                    disabled={isBusy || !assigneeId || !activeComplaint}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-opacity hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--navy) disabled:opacity-50 whitespace-nowrap"
                    style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}
                >
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}
                    <span>{isReassign ? copy.reassignLabel : copy.submitLabel}</span>
                </button>
            </div>
        </form>
    );

    if (variant === 'modal') {
        return (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={headingId}
                data-testid="task-assignment-modal"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && onCancel && !isBusy) {
                        onCancel();
                    }
                }}
            >
                <div
                    className="w-full max-w-md rounded-xl border shadow-xl overflow-hidden"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    {formContent}
                </div>
            </div>
        );
    }

    return (
        <section
            aria-labelledby={headingId}
            data-testid="task-assignment-inline"
            className="rounded-lg border overflow-hidden"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
            {formContent}
        </section>
    );
}
