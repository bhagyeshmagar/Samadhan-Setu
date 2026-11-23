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
    Camera,
    CheckCircle2,
    AlertTriangle,
    MapPin,
    Lock,
    RefreshCw,
    ClipboardList,
    ShieldCheck,
    Loader2,
} from 'lucide-react';

function InspectionOfficerDashboard() {
    const { user, loading: authLoading } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('initial'); // initial | verification | all
    const [activeFormTask, setActiveFormTask] = useState(null); // { complaint, type: 'initial' | 'verification' }
    const [submitting, setSubmitting] = useState(false);

    const showToast = (message, tone = 'success') => {
        setToast({ message, tone });
        setTimeout(() => setToast(null), 4500);
    };

    const loadDashboard = useCallback(async () => {
        try {
            setError('');
            const res = await workflowAPI.getInspectorDashboard();
            setData(res);
        } catch (err) {
            setError(err.message || 'Failed to load your inspection queue.');
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

    const handleProofSubmit = async (payload) => {
        if (!activeFormTask) return;
        setSubmitting(true);
        try {
            const { complaint, type } = activeFormTask;
            if (type === 'initial') {
                await workflowAPI.submitInitialInspection(complaint.id, payload);
                showToast(`Initial site inspection proof submitted for ${complaint.complaint_number}. Sent to Nodal Officer for verification.`);
            } else {
                await workflowAPI.submitPostVerification(complaint.id, payload);
                showToast(
                    payload.verdict === 'verified'
                        ? `Post-repair verification PASSED for ${complaint.complaint_number}. Routed to Nodal Officer for final sign-off.`
                        : `Flagged ${complaint.complaint_number} for rework. Field Team & Nodal Officer notified.`
                );
            }
            setActiveFormTask(null);
            await loadDashboard();
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="max-w-6xl mx-auto px-4 md:px-8 py-12 flex items-center justify-center text-sm text-(--text-secondary) gap-2">
                <Loader2 size={18} className="animate-spin text-(--navy)" />
                <span>Loading your isolated Inspection Officer desk…</span>
            </div>
        );
    }

    const officer = data?.officer;
    const metrics = data?.metrics || {};
    const initialInspections = data?.initial_inspections || [];
    const postVerifications = data?.post_verifications || [];
    const allTasks = data?.all_tasks || [];

    const visibleList =
        activeTab === 'initial'
            ? initialInspections
            : activeTab === 'verification'
            ? postVerifications
            : allTasks;

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
                        <span className="uppercase tracking-wider">{officer?.department_name || 'Department'}</span>
                        <span>·</span>
                        <span className="font-mono">{officer?.employee_id || 'INSPECTOR'}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1 text-[#0369A1]">
                            <Lock size={11} /> Strictly Isolated Queue
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-(--text-primary) mt-1">
                        Field Inspection & Verification Desk
                    </h1>
                    <p className="text-xs text-(--text-secondary) mt-1">
                        Signed in as <strong>{user?.name}</strong> ({officer?.designation || 'Inspection Officer'}). You only see site inspections and post-repair checks assigned directly to you.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={loadDashboard}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border whitespace-nowrap"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                >
                    <RefreshCw size={13} />
                    <span>Refresh Tasks</span>
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
                    { label: 'Initial Inspections', value: metrics.initial_pending ?? 0, sub: 'Step 3 · Field Site Check', accent: '#003580', tab: 'initial' },
                    { label: 'Post-Repair Checks', value: metrics.post_verification_pending ?? 0, sub: 'Step 7 · Verify Resolution', accent: '#138808', tab: 'verification' },
                    { label: 'Rework Requested', value: metrics.rework_requested ?? 0, sub: 'Returned by Nodal Officer', accent: '#DC2626', tab: 'initial' },
                    { label: 'Submitted / Done', value: metrics.completed_or_submitted ?? 0, sub: 'Awaiting Next Stage', accent: '#475569', tab: 'all' },
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
                    { key: 'initial', label: 'Initial Site Inspections (Step 3)', count: initialInspections.length },
                    { key: 'verification', label: 'Post-Repair Verifications (Step 7)', count: postVerifications.length },
                    { key: 'all', label: 'All My Assigned Tasks', count: allTasks.length },
                ].map((t) => {
                    const active = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(t.key);
                                setActiveFormTask(null);
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

            {/* Task List */}
            {visibleList.length === 0 ? (
                <div
                    className="rounded-lg border p-12 text-center space-y-1.5"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    <ClipboardList size={28} className="mx-auto text-(--text-muted)" />
                    <p className="text-sm font-semibold text-(--text-primary)">No assigned tasks in this tab</p>
                    <p className="text-xs text-(--text-muted)">
                        Only inspections assigned specifically to {user?.name} appear here.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visibleList.map((c) => {
                        const citizenProof = getStageProof(c, 'citizen_proof');
                        const teamProof = getStageProof(c, 'team_resolution');
                        const canSubmitInitial = ['inspection_assigned', 'inspection_rework'].includes(c.status);
                        const canSubmitVerify = c.status === 'verification_assigned';
                        const isFormOpen = activeFormTask?.complaint?.id === c.id;

                        return (
                            <div
                                key={c.id}
                                className="rounded-lg border p-5 space-y-4"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                            >
                                {/* Top Header */}
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

                                {/* Location Pin */}
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

                                {/* Rework Banner */}
                                {c.status === 'inspection_rework' && c.rework_reason && (
                                    <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-xs flex items-start gap-2">
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold">Rework Requested by Nodal Officer</div>
                                            <p className="mt-0.5">{c.rework_reason}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Reference Evidence Cards */}
                                <div className={`grid gap-3 ${teamProof ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
                                    {citizenProof && (
                                        <div
                                            className="rounded-md border p-3 flex gap-3 items-start"
                                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getImageUrl(citizenProof.url)}
                                                alt="Citizen reported evidence"
                                                className="w-24 h-20 object-cover rounded border shrink-0"
                                                style={{ borderColor: 'var(--border)' }}
                                            />
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-(--text-muted)">
                                                    Citizen Reported Proof
                                                </div>
                                                <div className="font-semibold text-(--text-primary)">
                                                    {citizenProof.uploaded_by_name || c.citizen?.name || 'Citizen'}
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-2">
                                                    {citizenProof.notes || c.description}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {teamProof && (
                                        <div
                                            className="rounded-md border p-3 flex gap-3 items-start"
                                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getImageUrl(teamProof.url)}
                                                alt="Team resolution proof"
                                                className="w-24 h-20 object-cover rounded border shrink-0"
                                                style={{ borderColor: 'var(--border)' }}
                                            />
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[10px] uppercase tracking-wider font-bold text-[#138808]">
                                                    Field Team Resolution Proof ({c.assigned_team_name || 'Squad'})
                                                </div>
                                                <div className="font-semibold text-(--text-primary)">
                                                    Lead: {teamProof.uploaded_by_name || c.assigned_team_lead_name}
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-3">
                                                    {teamProof.notes || c.resolution_remarks}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <WorkflowStepper status={c.status} compact />

                                {/* Inline Proof Upload Form when active */}
                                {isFormOpen ? (
                                    <ProofUploadForm
                                        title={
                                            activeFormTask.type === 'initial'
                                                ? `Step 3: Submit Initial Site Inspection Proof (${c.complaint_number})`
                                                : `Step 7: Submit Post-Repair Site Verification (${c.complaint_number})`
                                        }
                                        subtitle={
                                            activeFormTask.type === 'initial'
                                                ? 'Upload on-site geotagged photo(s) confirming the issue for Nodal Officer review.'
                                                : 'Inspect the completed field repair, upload verification photo(s) with GPS, and record your verdict.'
                                        }
                                        notesLabel={
                                            activeFormTask.type === 'initial'
                                                ? 'Site Inspection Observations & Measurements'
                                                : 'Post-Repair Verification Remarks'
                                        }
                                        notesPlaceholder={
                                            activeFormTask.type === 'initial'
                                                ? 'e.g., Confirmed 1.5m pothole depth 14cm at reported coordinates. Safe for hot-mix asphalt crew.'
                                                : 'e.g., Checked finished surface and drainage slope. Repair matches quality standards / or describe defects found.'
                                        }
                                        submitLabel={
                                            activeFormTask.type === 'initial'
                                                ? 'Submit Inspection to Nodal Officer'
                                                : 'Submit Verification Verdict'
                                        }
                                        defaultLat={c.latitude}
                                        defaultLng={c.longitude}
                                        showVerdict={activeFormTask.type === 'verification'}
                                        submitting={submitting}
                                        onSubmit={handleProofSubmit}
                                        onCancel={() => setActiveFormTask(null)}
                                    />
                                ) : (
                                    <div
                                        className="pt-3 border-t flex flex-wrap items-center justify-between gap-2"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <span className="text-[11px] text-(--text-muted)">
                                            {canSubmitInitial
                                                ? 'Action needed: Visit site and upload geotagged initial inspection proof.'
                                                : canSubmitVerify
                                                ? 'Action needed: Revisit site to confirm field team repair before final approval.'
                                                : 'Submitted — currently with Nodal Officer / Field Team.'}
                                        </span>

                                        <div className="flex items-center gap-2">
                                            {canSubmitInitial && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFormTask({ complaint: c, type: 'initial' })}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#003580' }}
                                                >
                                                    <Camera size={14} />
                                                    <span>
                                                        {c.status === 'inspection_rework' ? 'Re-Upload Inspection Proof' : 'Upload Inspection Proof'}
                                                    </span>
                                                </button>
                                            )}
                                            {canSubmitVerify && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFormTask({ complaint: c, type: 'verification' })}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap"
                                                    style={{ background: '#138808' }}
                                                >
                                                    <ShieldCheck size={14} />
                                                    <span>Verify Resolution On-Site</span>
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

export default withRoleGuard(InspectionOfficerDashboard, {
    allowedRoles: ['inspection_officer'],
    loadingLabel: 'Loading Inspection Officer Dashboard…',
});
