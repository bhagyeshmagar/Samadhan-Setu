'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { workflowAPI, getImageUrl } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import WorkflowStepper from '@/components/WorkflowStepper';
import ProofUploadForm from '@/components/ProofUploadForm';
import withRoleGuard from '@/components/withRoleGuard';
import {
    Wrench,
    Play,
    Camera,
    CheckCircle2,
    AlertTriangle,
    MapPin,
    Lock,
    RefreshCw,
    Users,
    Loader2,
} from 'lucide-react';

function TeamLeadDashboard() {
    const { user, loading: authLoading } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('assigned'); // assigned | in_progress | rework | submitted
    const [activeFormId, setActiveFormId] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const showToast = (message, tone = 'success') => {
        setToast({ message, tone });
        setTimeout(() => setToast(null), 4500);
    };

    const loadDashboard = useCallback(async () => {
        try {
            setError('');
            const res = await workflowAPI.getTeamDashboard();
            setData(res);
        } catch (err) {
            setError(err.message || 'Failed to load your team work orders.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;

        let cancelled = false;
        async function init() {
            if (!cancelled) await loadDashboard();
        }
        init();
        return () => {
            cancelled = true;
        };
    }, [user, authLoading, loadDashboard]);

    const handleStartWork = async (complaint) => {
        setBusyId(complaint.id);
        try {
            await workflowAPI.startFieldWork(complaint.id);
            showToast(`Started field remediation for ${complaint.complaint_number}.`);
            await loadDashboard();
            setActiveTab('in_progress');
        } catch (err) {
            showToast(err.message || 'Could not start work order.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const handleSubmitResolution = async (complaint, payload) => {
        setBusyId(complaint.id);
        try {
            await workflowAPI.submitResolutionProof(complaint.id, payload);
            showToast(
                `Resolution proof & ATR uploaded for ${complaint.complaint_number}. Routed to Inspection Officer for post-repair site verification.`
            );
            setActiveFormId(null);
            await loadDashboard();
            setActiveTab('submitted');
        } finally {
            setBusyId(null);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 flex items-center justify-center text-sm text-(--text-secondary) gap-2">
                <Loader2 size={18} className="animate-spin text-(--navy)" />
                <span>Loading isolated Field Team work orders…</span>
            </div>
        );
    }

    const team = data?.team;
    const metrics = data?.metrics || {};
    const assignedOrders = data?.assigned_orders || [];
    const inProgressOrders = data?.in_progress_orders || [];
    const reworkOrders = data?.rework_orders || [];
    const submittedOrders = data?.submitted_orders || [];

    const visibleList =
        activeTab === 'assigned'
            ? assignedOrders
            : activeTab === 'in_progress'
            ? inProgressOrders
            : activeTab === 'rework'
            ? reworkOrders
            : submittedOrders;

    const getStageProof = (complaint, stage) => {
        const list = (complaint.proof_records || []).filter((r) => r.stage === stage);
        return list[list.length - 1] || null;
    };

    return (
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
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
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-(--text-muted)">
                        <span className="uppercase tracking-wider">{team?.department_name || 'Field Operations'}</span>
                        <span>·</span>
                        <span className="font-mono">{team?.code || 'TEAM'}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-[#047857]">
                            <Lock size={11} /> Isolated Squad Queue
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) mt-1">
                        {team?.name || 'Field Team Execution Desk'}
                    </h1>
                    <p className="text-xs text-(--text-secondary) mt-1">
                        Team Lead: <strong>{user?.name}</strong> · {team?.specialization || 'Civic Redressal'} · Crew of{' '}
                        <span className="tabular-nums font-semibold">{team?.member_count ?? 6}</span>
                        {team?.ward_coverage?.length > 0 ? ` · Wards: ${team.ward_coverage.join(', ')}` : ''}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={loadDashboard}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border whitespace-nowrap"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                >
                    <RefreshCw size={13} />
                    <span>Refresh Orders</span>
                </button>
            </div>

            {error && (
                <div className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: 'New Work Orders', value: metrics.assigned ?? 0, sub: 'Ready to Mobilize', accent: '#003580', tab: 'assigned' },
                    { label: 'Work In Progress', value: metrics.in_progress ?? 0, sub: 'Step 6 · Active on Site', accent: '#C2410C', tab: 'in_progress' },
                    { label: 'Rework Required', value: metrics.rework_required ?? 0, sub: 'Returned from Verification', accent: '#DC2626', tab: 'rework' },
                    { label: 'Submitted / Done', value: metrics.submitted_or_resolved ?? 0, sub: 'With Inspector / Resolved', accent: '#138808', tab: 'submitted' },
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

            {/* Segmented Tabs */}
            <div
                className="flex items-center gap-1 overflow-x-auto p-1 rounded-lg border"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
                {[
                    { key: 'assigned', label: 'Assigned Work Orders', count: assignedOrders.length },
                    { key: 'in_progress', label: 'Work In Progress', count: inProgressOrders.length },
                    { key: 'rework', label: 'Rework Required', count: reworkOrders.length },
                    { key: 'submitted', label: 'Submitted / Completed', count: submittedOrders.length },
                ].map((t) => {
                    const active = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(t.key);
                                setActiveFormId(null);
                            }}
                            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                                active ? 'bg-[#003580] text-white' : 'text-(--text-secondary) hover:bg-(--bg-section)'
                            }`}
                        >
                            <span>{t.label}</span>
                            <span
                                className={`text-[10px] font-mono tabular-nums px-1.5 rounded ${
                                    active ? 'bg-white/20 text-white' : 'bg-(--bg-section) text-(--text-muted)'
                                }`}
                            >
                                {t.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Work Order Cards */}
            {visibleList.length === 0 ? (
                <div
                    className="rounded-lg border p-12 text-center space-y-1.5"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    <Users size={28} className="mx-auto text-(--text-muted)" />
                    <p className="text-sm font-semibold text-(--text-primary)">No work orders in this tab</p>
                    <p className="text-xs text-(--text-muted)">
                        Only tasks dispatched specifically to {team?.name || 'your squad'} are visible here.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visibleList.map((c) => {
                        const citizenProof = getStageProof(c, 'citizen_proof');
                        const inspProof = getStageProof(c, 'initial_inspection');
                        const canStart = ['team_assigned', 'redressal_rework'].includes(c.status);
                        const canUploadProof = ['work_in_progress', 'team_assigned', 'redressal_rework'].includes(c.status);
                        const isFormOpen = activeFormId === c.id;

                        return (
                            <div
                                key={c.id}
                                className="rounded-lg border p-5 space-y-4"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-muted)">
                                            <span className="font-mono font-bold text-(--navy)">{c.complaint_number}</span>
                                            <span>·</span>
                                            <span className="capitalize font-semibold text-(--text-secondary)">{c.priority} priority</span>
                                            <span>·</span>
                                            <span>{c.ward}</span>
                                        </div>
                                        <h2 className="text-base font-bold text-(--text-primary) mt-1">{c.title}</h2>
                                        <p className="text-xs text-(--text-secondary) mt-1">{c.description}</p>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <Badge status={c.status} />
                                        {c.sla_deadline && !['resolved', 'closed'].includes(c.status) && (
                                            <DeadlineTimer deadline={c.sla_deadline} />
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-(--text-secondary)">
                                    <span className="inline-flex items-center gap-1">
                                        <MapPin size={13} className="text-(--navy)" />
                                        {c.location}
                                    </span>
                                    {c.latitude && c.longitude && (
                                        <span className="font-mono text-[11px] tabular-nums text-(--text-muted)">
                                            Site Pin: {Number(c.latitude).toFixed(5)}, {Number(c.longitude).toFixed(5)}
                                        </span>
                                    )}
                                </div>

                                {c.status === 'redressal_rework' && c.rework_reason && (
                                    <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs flex items-start gap-2">
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold">Rework Required — Site Check / Nodal Review</div>
                                            <p className="mt-0.5">{c.rework_reason}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Citizen + Verified Inspection Reference Proofs */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {citizenProof && (
                                        <div
                                            className="rounded-md border p-3 flex gap-3 items-start"
                                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getImageUrl(citizenProof.url)}
                                                alt="Citizen grievance photo"
                                                className="w-24 h-20 object-cover rounded border shrink-0"
                                                style={{ borderColor: 'var(--border)' }}
                                            />
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-(--text-muted)">
                                                    Citizen Grievance Photo
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-3">
                                                    {citizenProof.notes || c.description}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                    {inspProof && (
                                        <div
                                            className="rounded-md border p-3 flex gap-3 items-start"
                                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getImageUrl(inspProof.url)}
                                                alt="Verified site inspection"
                                                className="w-24 h-20 object-cover rounded border shrink-0"
                                                style={{ borderColor: 'var(--border)' }}
                                            />
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-(--navy)">
                                                    Verified Site Inspection ({inspProof.uploaded_by_name})
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-3">
                                                    {inspProof.notes}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <WorkflowStepper status={c.status} compact />

                                {isFormOpen ? (
                                    <ProofUploadForm
                                        title={`Step 6: Upload Resolution Proof & Action Taken Report (${c.complaint_number})`}
                                        subtitle="Upload geotagged after-repair photo(s) and ATR notes. This automatically dispatches the Inspection Officer for post-repair site verification."
                                        notesLabel="Action Taken Report (ATR) — Work Performed"
                                        notesPlaceholder="e.g., Milled damaged asphalt, laid 50mm hot-mix bitumen, compacted with 8-ton roller, and restored road markings."
                                        submitLabel="Submit Resolution Proof for Inspection"
                                        defaultLat={c.latitude}
                                        defaultLng={c.longitude}
                                        submitting={busyId === c.id}
                                        onSubmit={(payload) => handleSubmitResolution(c, payload)}
                                        onCancel={() => setActiveFormId(null)}
                                    />
                                ) : (
                                    <div
                                        className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <span className="text-[11px] text-(--text-muted)">
                                            {c.status === 'team_assigned'
                                                ? 'Mobilize your crew and mark Work In Progress when remediation starts.'
                                                : c.status === 'work_in_progress'
                                                ? 'Once repair is complete, upload geotagged resolution proof & ATR.'
                                                : c.status === 'redressal_rework'
                                                ? 'Address the rework remarks above and re-submit updated resolution proof.'
                                                : 'Resolution proof submitted — awaiting Inspector verification & Nodal sign-off.'}
                                        </span>

                                        <div className="flex flex-wrap items-center gap-2">
                                            {canStart && (
                                                <button
                                                    type="button"
                                                    disabled={busyId === c.id}
                                                    onClick={() => handleStartWork(c)}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60"
                                                    style={{ background: '#003580' }}
                                                >
                                                    {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                                    <span>{c.status === 'redressal_rework' ? 'Resume Rework' : 'Start Field Work'}</span>
                                                </button>
                                            )}
                                            {canUploadProof && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFormId(c.id)}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#138808' }}
                                                >
                                                    <Camera size={14} />
                                                    <span>Upload Resolution Proof & ATR</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default withRoleGuard(TeamLeadDashboard, {
    allowedRoles: ['team_lead'],
    loadingLabel: 'Loading Field Team Dashboard…',
});
