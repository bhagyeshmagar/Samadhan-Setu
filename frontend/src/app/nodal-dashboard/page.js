'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { workflowAPI, adminAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import WorkflowStepper from '@/components/WorkflowStepper';
import ProofComparisonDrawer from '@/components/ProofComparisonDrawer';
import TaskAssignment from '@/components/TaskAssignment';
import withRoleGuard from '@/components/withRoleGuard';
import { getAssignableIntakeComplaints, getPriorityConfig } from '@/lib/taskAssignment';
import {
    ClipboardCheck,
    Users,
    ShieldCheck,
    CheckCircle2,
    MapPin,
    RefreshCw,
    Eye,
    UserPlus,
    Wrench,
    AlertTriangle,
    Loader2,
    Building2,
} from 'lucide-react';

function NodalOfficerDashboard() {
    const { user, loading: authLoading } = useAuth();

    const [dashboard, setDashboard] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [selectedDeptId, setSelectedDeptId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);

    const [activeTab, setActiveTab] = useState('intake'); // intake | review | dispatch | final | all
    const [comparisonState, setComparisonState] = useState(null); // { complaint, mode }
    const [assignModal, setAssignModal] = useState(null); // { type: 'inspector' | 'team' | 'verifier', complaint }
    const [actionBusy, setActionBusy] = useState(false);

    const isAdmin = user && ['admin', 'super_admin'].includes(user.role);

    const showToast = (message, tone = 'success') => {
        setToast({ message, tone });
        setTimeout(() => setToast(null), 4500);
    };

    const loadDashboard = useCallback(async (deptOverride) => {
        try {
            setError('');
            const data = await workflowAPI.getNodalDashboard(deptOverride || undefined);
            setDashboard(data);
        } catch (err) {
            setError(err.message || 'Failed to load Nodal Officer command queue.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;

        let cancelled = false;
        async function init() {
            if (['admin', 'super_admin'].includes(user.role)) {
                try {
                    const depts = await adminAPI.getDepartments();
                    if (!cancelled) {
                        setDepartments(depts || []);
                        const firstId = selectedDeptId || depts?.[0]?.id || '';
                        setSelectedDeptId(firstId);
                        await loadDashboard(firstId);
                        return;
                    }
                } catch {
                    // fallback to default dept
                }
            }
            if (!cancelled) {
                await loadDashboard(selectedDeptId || undefined);
            }
        }
        init();
        return () => {
            cancelled = true;
        };
    }, [user, authLoading, loadDashboard, selectedDeptId]);

    const openAssignModal = (type, complaint) => {
        setAssignModal({ type, complaint });
    };

    const handleTaskAssign = async ({ complaintId, complaint, mode, assigneeId, priority, instructions }) => {
        setActionBusy(true);
        try {
            const slaMeta = getPriorityConfig(priority);
            if (mode === 'inspector') {
                await workflowAPI.assignInspector(complaintId, assigneeId, instructions, priority);
                showToast(
                    `Inspection Officer assigned to ${complaint.complaint_number} (${slaMeta.label} priority · ${slaMeta.slaLabel}).`
                );
            } else if (mode === 'team') {
                await workflowAPI.assignTeam(complaintId, assigneeId, instructions, priority);
                showToast(
                    `Field Team dispatched for ${complaint.complaint_number} (${slaMeta.label} priority · ${slaMeta.slaLabel}).`
                );
            } else if (mode === 'verifier') {
                await workflowAPI.assignVerifier(complaintId, assigneeId, instructions, priority);
                showToast(`Post-repair verifier assigned for ${complaint.complaint_number}.`);
            }
            setAssignModal(null);
            await loadDashboard(selectedDeptId || undefined);
        } catch (err) {
            showToast(err.message || 'Assignment failed.', 'error');
            throw err;
        } finally {
            setActionBusy(false);
        }
    };

    const handleComparisonDecision = async (payload) => {
        if (!comparisonState?.complaint) return;
        setActionBusy(true);
        try {
            const { complaint, mode } = comparisonState;
            if (mode === 'initial_inspection') {
                await workflowAPI.reviewInspection(complaint.id, payload);
                showToast(
                    payload.decision === 'approve'
                        ? `Inspection verified for ${complaint.complaint_number}. Ready to assign Field Team.`
                        : payload.decision === 'rework'
                        ? `Returned ${complaint.complaint_number} to Inspection Officer for rework.`
                        : `Reassigned ${complaint.complaint_number} to another Inspection Officer.`
                );
            } else if (mode === 'final_approval') {
                await workflowAPI.finalDecision(complaint.id, payload);
                showToast(
                    payload.decision === 'approve'
                        ? `${complaint.complaint_number} marked RESOLVED and citizen notified.`
                        : payload.decision === 'rework_team'
                        ? `Returned ${complaint.complaint_number} to Field Team for rework.`
                        : payload.decision === 'reassign_team'
                        ? `Reassigned ${complaint.complaint_number} to replacement Field Team.`
                        : `Ordered fresh site verification for ${complaint.complaint_number}.`
                );
            }
            setComparisonState(null);
            await loadDashboard(selectedDeptId || undefined);
        } catch (err) {
            showToast(err.message || 'Decision failed.', 'error');
        } finally {
            setActionBusy(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-12 flex items-center justify-center text-sm text-(--text-secondary) gap-2">
                <Loader2 size={18} className="animate-spin text-(--navy)" />
                <span>Loading Nodal Officer Command Workspace…</span>
            </div>
        );
    }

    const complaints = dashboard?.complaints || [];
    const inspectors = dashboard?.inspectors || [];
    const teams = dashboard?.teams || [];
    const metrics = dashboard?.metrics || {};
    const department = dashboard?.department;
    const unassignedIntake = getAssignableIntakeComplaints(complaints);

    const filteredComplaints = complaints.filter((c) => {
        if (activeTab === 'intake') {
            return ['submitted', 'verified', 'assigned', 'inspection_assigned', 'inspection_rework'].includes(c.status);
        }
        if (activeTab === 'review') {
            return c.status === 'inspection_submitted';
        }
        if (activeTab === 'dispatch') {
            return ['inspection_verified', 'team_assigned', 'work_in_progress', 'redressal_rework', 'verification_assigned'].includes(c.status);
        }
        if (activeTab === 'final') {
            return c.status === 'verification_submitted';
        }
        return true;
    });

    const TABS = [
        { key: 'intake', label: 'Intake & Inspection', count: (metrics.new_intake || 0) + (metrics.inspection_in_flight || 0) },
        { key: 'review', label: 'Inspection Review', count: metrics.inspection_review || 0 },
        { key: 'dispatch', label: 'Team Dispatch & Work', count: (metrics.ready_for_team || 0) + (metrics.active_field_work || 0) },
        { key: 'final', label: 'Final Approval', count: metrics.final_approval || 0 },
        { key: 'all', label: 'All Grievances', count: metrics.total || 0 },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg border shadow-lg text-xs font-semibold flex items-center gap-2 ${
                        toast.tone === 'error'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-[#E8F5E9] border-[#138808]/30 text-[#0A6B05]'
                    }`}
                >
                    {toast.tone === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                <div>
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                        <Building2 size={13} className="text-(--navy)" />
                        <span>{department?.name || 'Department'}</span>
                        <span>·</span>
                        <span>Nodal Officer Command</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) mt-1">
                        Grievance Orchestration & Proof Verification
                    </h1>
                    <p className="text-xs text-(--text-secondary) mt-1">
                        Assign inspections, verify site proofs side-by-side, dispatch field teams, and approve final citizen notifications.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {isAdmin && departments.length > 0 && (
                        <select
                            value={selectedDeptId}
                            onChange={(e) => {
                                setSelectedDeptId(e.target.value);
                                setLoading(true);
                                loadDashboard(e.target.value);
                            }}
                            className="px-3 py-2 text-xs font-medium rounded-md border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                        >
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        onClick={() => loadDashboard(selectedDeptId || undefined)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                    >
                        <RefreshCw size={13} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Strip — Single-elevation 1px hairline border */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                    { label: 'New Intake', value: metrics.new_intake ?? 0, sub: 'Awaiting Inspector', accent: '#003580', tab: 'intake' },
                    { label: 'Inspection Review', value: metrics.inspection_review ?? 0, sub: 'Verify Proof (Step 4)', accent: '#C2410C', tab: 'review' },
                    { label: 'Ready for Team', value: metrics.ready_for_team ?? 0, sub: 'Dispatch Squad (Step 5)', accent: '#0369A1', tab: 'dispatch' },
                    { label: 'Final Approval', value: metrics.final_approval ?? 0, sub: '3-Way Check (Step 8)', accent: '#138808', tab: 'final' },
                    { label: 'Resolved', value: metrics.resolved ?? 0, sub: 'Citizen Notified', accent: '#475569', tab: 'all' },
                ].map((kpi) => (
                    <button
                        key={kpi.label}
                        type="button"
                        onClick={() => setActiveTab(kpi.tab)}
                        className="text-left rounded-lg border p-3.5 transition-colors hover:bg-(--bg-card-hover)"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">{kpi.label}</div>
                        <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: kpi.accent }}>
                            {kpi.value}
                        </div>
                        <div className="text-[11px] text-(--text-secondary) mt-0.5">{kpi.sub}</div>
                    </button>
                ))}
            </div>

            {/* Main 2-Column Layout: Left Queue (8 cols) + Right Department Roster (4 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Queue */}
                <div className="lg:col-span-8 space-y-4">
                    {/* Segmented Tabs */}
                    <div
                        className="flex items-center gap-1 overflow-x-auto p-1 rounded-lg border"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        {TABS.map((t) => {
                            const active = activeTab === t.key;
                            return (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setActiveTab(t.key)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                        active
                                            ? 'bg-[#003580] text-white'
                                            : 'text-(--text-secondary) hover:bg-(--bg-section)'
                                    }`}
                                >
                                    <span>{t.label}</span>
                                    <span
                                        className={`text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded ${
                                            active ? 'bg-white/20 text-white' : 'bg-(--bg-section) text-(--text-muted)'
                                        }`}
                                    >
                                        {t.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Complaint Queue Cards */}
                    {filteredComplaints.length === 0 ? (
                        <div
                            className="rounded-lg border p-10 text-center space-y-1.5"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                        >
                            <ClipboardCheck size={28} className="mx-auto text-(--text-muted)" />
                            <p className="text-sm font-semibold text-(--text-primary)">No grievances in this stage</p>
                            <p className="text-xs text-(--text-muted)">
                                Switch tabs above or refresh to check newly routed departmental issues.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredComplaints.map((c) => (
                                <div
                                    key={c.id}
                                    className="rounded-lg border p-4 space-y-3"
                                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                >
                                    {/* Top Meta Row */}
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-muted)">
                                                <span className="font-mono font-bold text-(--navy)">{c.complaint_number}</span>
                                                <span>·</span>
                                                <span
                                                    className="capitalize font-semibold"
                                                    style={{ color: getPriorityConfig(c.priority).accent }}
                                                >
                                                    {c.priority} priority
                                                </span>
                                                <span>·</span>
                                                <span>{c.ward}</span>
                                                {c.ai_confidence && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="tabular-nums">AI {Math.round(c.ai_confidence * 100)}%</span>
                                                    </>
                                                )}
                                            </div>
                                            <h3 className="text-sm font-bold text-(--text-primary) mt-1">{c.title}</h3>
                                            <p className="text-xs text-(--text-secondary) mt-0.5 line-clamp-2">{c.description}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <Badge status={c.status} />
                                            {c.sla_deadline && !['resolved', 'closed'].includes(c.status) && (
                                                <DeadlineTimer deadline={c.sla_deadline} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Location & Current Assignees */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
                                        <span className="inline-flex items-center gap-1">
                                            <MapPin size={12} className="text-(--text-muted)" />
                                            {c.location}
                                        </span>
                                        {c.assigned_inspector_name && (
                                            <span>
                                                Inspector: <strong className="text-(--text-primary)">{c.assigned_inspector_name}</strong>
                                            </span>
                                        )}
                                        {c.assigned_team_name && (
                                            <span>
                                                Team: <strong className="text-(--text-primary)">{c.assigned_team_name}</strong>
                                            </span>
                                        )}
                                    </div>

                                    {c.rework_reason && (
                                        <div className="px-3 py-2 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-start gap-2">
                                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                            <span>
                                                <strong>Rework Note:</strong> {c.rework_reason}
                                            </span>
                                        </div>
                                    )}

                                    <WorkflowStepper status={c.status} compact />

                                    {/* Contextual Stage Actions */}
                                    <div
                                        className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <span className="text-[11px] text-(--text-muted)">
                                            {(c.proof_records || []).length} geotagged proof artifact(s) on record
                                        </span>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {/* Step 3: Assign / Reassign Inspector */}
                                            {['submitted', 'verified', 'assigned', 'inspection_assigned', 'inspection_rework'].includes(c.status) && (
                                                <button
                                                    type="button"
                                                    onClick={() => openAssignModal('inspector', c)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#003580' }}
                                                >
                                                    <UserPlus size={13} />
                                                    <span>
                                                        {c.assigned_inspector_id ? 'Reassign Inspector' : 'Assign Inspection Officer'}
                                                    </span>
                                                </button>
                                            )}

                                            {/* Step 4: Side-by-Side Initial Inspection Review */}
                                            {c.status === 'inspection_submitted' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setComparisonState({ complaint: c, mode: 'initial_inspection' })}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#C2410C' }}
                                                >
                                                    <ShieldCheck size={13} />
                                                    <span>Compare & Confirm Inspection</span>
                                                </button>
                                            )}

                                            {/* Step 5: Assign / Reassign Field Team */}
                                            {['inspection_verified', 'redressal_rework', 'team_assigned'].includes(c.status) && (
                                                <button
                                                    type="button"
                                                    onClick={() => openAssignModal('team', c)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#003580' }}
                                                >
                                                    <Wrench size={13} />
                                                    <span>{c.assigned_team_id ? 'Reassign Field Team' : 'Assign Field Team'}</span>
                                                </button>
                                            )}

                                            {/* Optional: Reassign Verifier during Step 7 */}
                                            {c.status === 'verification_assigned' && (
                                                <button
                                                    type="button"
                                                    onClick={() => openAssignModal('verifier', c)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border whitespace-nowrap"
                                                    style={{ borderColor: 'var(--border-mid)', color: 'var(--navy)', background: 'var(--bg-card)' }}
                                                >
                                                    <UserPlus size={13} />
                                                    <span>Reassign Verifier</span>
                                                </button>
                                            )}

                                            {/* Step 8: 3-Way Final Proof Approval & Citizen Notification */}
                                            {c.status === 'verification_submitted' && (
                                                <button
                                                    type="button"
                                                    onClick={() => setComparisonState({ complaint: c, mode: 'final_approval' })}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#138808' }}
                                                >
                                                    <CheckCircle2 size={13} />
                                                    <span>Compare Proofs & Final Approve</span>
                                                </button>
                                            )}

                                            {/* Audit View for any stage */}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setComparisonState({
                                                        complaint: c,
                                                        mode:
                                                            c.status === 'inspection_submitted'
                                                                ? 'initial_inspection'
                                                                : c.status === 'verification_submitted'
                                                                ? 'final_approval'
                                                                : 'readonly',
                                                    })
                                                }
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border whitespace-nowrap"
                                                style={{ borderColor: 'var(--border-mid)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                                            >
                                                <Eye size={13} />
                                                <span>Proofs</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Inline Quick Task Assignment + Department Roster */}
                <aside className="lg:col-span-4 space-y-4">
                    {/* Reusable Task Assignment Component (Inline Card Variant for New Intake) */}
                    <TaskAssignment
                        variant="inline"
                        mode="inspector"
                        complaints={unassignedIntake}
                        officers={inspectors}
                        teams={teams}
                        submitting={actionBusy}
                        onAssign={handleTaskAssign}
                    />

                    {/* Inspection Officers Panel */}
                    <div
                        className="rounded-lg border overflow-hidden"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        <div
                            className="px-4 py-3 border-b flex items-center justify-between"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                        >
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--text-primary)">
                                <ClipboardCheck size={14} className="text-(--navy)" />
                                <span>Inspection Officers</span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                                {inspectors.length} active
                            </span>
                        </div>
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                            {inspectors.length === 0 ? (
                                <p className="p-4 text-xs text-(--text-muted)">No inspection officers assigned to this department.</p>
                            ) : (
                                inspectors.map((insp) => (
                                    <div key={insp.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-(--text-primary) truncate">{insp.name}</div>
                                            <div className="text-[11px] text-(--text-muted) truncate">
                                                {insp.employee_id} · {insp.designation}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs font-bold font-mono tabular-nums text-(--navy)">
                                                {insp.active_inspections ?? 0}
                                            </div>
                                            <div className="text-[10px] text-(--text-muted)">active</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Field Teams Panel */}
                    <div
                        className="rounded-lg border overflow-hidden"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        <div
                            className="px-4 py-3 border-b flex items-center justify-between"
                            style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                        >
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-(--text-primary)">
                                <Users size={14} className="text-[#138808]" />
                                <span>Field Redressal Teams</span>
                            </div>
                            <span className="text-[11px] font-mono tabular-nums text-(--text-muted)">
                                {teams.length} squads
                            </span>
                        </div>
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                            {teams.length === 0 ? (
                                <p className="p-4 text-xs text-(--text-muted)">No field teams configured for this department.</p>
                            ) : (
                                teams.map((team) => {
                                    const pct = Math.min(100, Math.round(((team.active_work_orders || 0) / Math.max(team.daily_capacity || 1, 1)) * 100));
                                    return (
                                        <div key={team.id} className="px-4 py-3 space-y-1.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <div className="text-xs font-bold text-(--text-primary) truncate">{team.name}</div>
                                                    <div className="text-[11px] text-(--text-muted) truncate">
                                                        Lead: {team.team_lead_name} · {team.code}
                                                    </div>
                                                </div>
                                                <span className="text-xs font-mono font-bold tabular-nums text-(--text-primary) shrink-0">
                                                    {team.active_work_orders ?? 0}/{team.daily_capacity}
                                                </span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-section)' }}>
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: pct > 80 ? '#DC2626' : '#138808',
                                                    }}
                                                />
                                            </div>
                                            {team.ward_coverage?.length > 0 && (
                                                <div className="text-[10px] text-(--text-muted) truncate">
                                                    Wards: {team.ward_coverage.join(' · ')}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </aside>
            </div>

            {/* Reusable Task Assignment Component (Modal Dialog Variant) */}
            {assignModal && (
                <TaskAssignment
                    variant="modal"
                    mode={assignModal.type}
                    complaint={assignModal.complaint}
                    officers={inspectors}
                    teams={teams}
                    submitting={actionBusy}
                    onAssign={handleTaskAssign}
                    onCancel={() => setAssignModal(null)}
                />
            )}

            {/* Side-by-Side Proof Comparison Drawer (Steps 4 & 8) */}
            {comparisonState && (
                <ProofComparisonDrawer
                    complaint={comparisonState.complaint}
                    mode={comparisonState.mode}
                    inspectors={inspectors}
                    teams={teams}
                    submitting={actionBusy}
                    onDecision={comparisonState.mode === 'readonly' ? null : handleComparisonDecision}
                    onClose={() => setComparisonState(null)}
                />
            )}
        </div>
    );
}

export default withRoleGuard(NodalOfficerDashboard, {
    allowedRoles: ['nodal_officer', 'officer', 'admin', 'super_admin'],
    loadingLabel: 'Loading Nodal Officer Dashboard…',
});
