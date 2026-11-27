'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
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
    ZoomIn,
    X,
} from 'lucide-react';
import {
    formatCoordinates,
    formatGpsSourceLabel,
    evaluateGeofence,
} from '@/lib/proofUpload';

function InspectionOfficerDashboard() {
    const { user, loading: authLoading } = useAuth();
    const { t, tPriority } = useLanguage();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('initial'); // initial | verification | all
    const [activeFormTask, setActiveFormTask] = useState(null); // { complaint, type: 'initial' | 'verification' }
    const [submitting, setSubmitting] = useState(false);
    const [staging, setStaging] = useState(false);
    const [zoomedProof, setZoomedProof] = useState(null);

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

    const handleStageSitePhotos = async (payload) => {
        if (!activeFormTask) return;
        setStaging(true);
        try {
            const { complaint, type } = activeFormTask;
            const stage = type === 'initial' ? 'initial_inspection' : 'final_verification';
            const res = await workflowAPI.uploadInspectorSitePhotos(complaint.id, {
                ...payload,
                stage,
                submit_for_review: false,
            });
            const uploadedCount = res?.uploaded_proofs?.length || payload.files.length;
            showToast(
                `Saved ${uploadedCount} geotagged site photo(s) for ${complaint.complaint_number} (${formatCoordinates(payload.latitude, payload.longitude)}).`
            );
            await loadDashboard();
        } finally {
            setStaging(false);
        }
    };

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

    const getStageProofs = (complaint, stage) =>
        (complaint.proof_records || []).filter((r) => r.stage === stage);

    const getStageProof = (complaint, stage) => {
        const list = getStageProofs(complaint, stage);
        return list[list.length - 1] || null;
    };

    return (
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
            {toast && (
                <div
                    role="status"
                    data-testid="inspector-toast"
                    className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg border shadow-lg text-xs font-semibold flex items-center gap-2"
                    style={{
                        background: toast.tone === 'error' ? 'var(--status-critical-bg)' : 'var(--status-resolved-bg)',
                        borderColor: toast.tone === 'error' ? 'var(--error)' : 'var(--india-green)',
                        color: toast.tone === 'error' ? 'var(--error)' : 'var(--text-green)',
                    }}
                >
                    {toast.tone === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
                <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-(--text-muted)">
                        <span>{officer?.department_name || t('department')}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{officer?.employee_id || t('role_inspection_officer')}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-navy)' }}>
                            <Lock size={11} /> {t('inspector_scope')}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mt-1" style={{ color: 'var(--navy)' }}>
                        {t('inspector_title')}
                    </h1>
                    <p className="text-xs text-(--text-secondary) mt-1">
                        {t('inspector_sub')} · <strong>{user?.name}</strong>
                    </p>
                </div>

                <button
                    type="button"
                    onClick={loadDashboard}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border whitespace-nowrap cursor-pointer"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                >
                    <RefreshCw size={13} />
                    <span>{t('refresh')}</span>
                </button>
            </div>

            {error && (
                <div className="gov-alert error text-xs">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: t('tab_initial_insp'), value: metrics.initial_pending ?? 0, sub: t('wf_inspect'), accent: 'var(--navy)', tab: 'initial' },
                    { label: t('tab_post_verify'), value: metrics.post_verification_pending ?? 0, sub: t('wf_verify'), accent: 'var(--text-green)', tab: 'verification' },
                    { label: t('tab_rework'), value: metrics.rework_requested ?? 0, sub: t('role_nodal_officer'), accent: 'var(--error)', tab: 'initial' },
                    { label: t('tab_submitted'), value: metrics.completed_or_submitted ?? 0, sub: t('tab_final'), accent: 'var(--text-secondary)', tab: 'all' },
                ].map((kpi) => (
                    <button
                        key={kpi.label}
                        type="button"
                        onClick={() => setActiveTab(kpi.tab)}
                        className="text-left rounded-lg border p-3.5 transition-colors hover:bg-(--bg-card-hover) cursor-pointer"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        <div className="text-xs font-semibold text-(--text-muted)">{kpi.label}</div>
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
                    { key: 'initial', label: t('tab_initial_insp'), count: initialInspections.length },
                    { key: 'verification', label: t('tab_post_verify'), count: postVerifications.length },
                    { key: 'all', label: t('tab_all_tasks'), count: allTasks.length },
                ].map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.key);
                                setActiveFormTask(null);
                            }}
                            className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
                            style={{
                                background: active ? 'var(--navy)' : 'transparent',
                                color: active ? 'var(--primary-ink)' : 'var(--text-secondary)',
                            }}
                        >
                            <span>{tab.label}</span>
                            <span
                                className="text-[10px] font-mono tabular-nums px-1.5 rounded"
                                style={{
                                    background: active ? 'rgba(0,0,0,0.18)' : 'var(--bg-section)',
                                    color: active ? 'var(--primary-ink)' : 'var(--text-muted)',
                                }}
                            >
                                {tab.count}
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
                        const myInitialProofs = getStageProofs(c, 'initial_inspection');
                        const myVerifyProofs = getStageProofs(c, 'final_verification');
                        const canSubmitInitial = ['inspection_assigned', 'inspection_rework'].includes(c.status);
                        const canSubmitVerify = c.status === 'verification_assigned';
                        const isFormOpen = activeFormTask?.complaint?.id === c.id;
                        const activeStageProofs =
                            activeFormTask?.type === 'verification' ? myVerifyProofs : myInitialProofs;
                        const uploadedOfficerProofs = [...myInitialProofs, ...myVerifyProofs];

                        return (
                            <div
                                key={c.id}
                                data-testid={`inspector-task-card-${c.complaint_number}`}
                                className="rounded-lg border p-5 space-y-4"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                            >
                                {/* Top Header */}
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--text-muted)">
                                            <span className="font-mono font-bold text-(--navy)">{c.complaint_number}</span>
                                            <span aria-hidden="true">·</span>
                                            <span className="capitalize font-semibold text-(--text-secondary)">{tPriority(c.priority)}</span>
                                            <span aria-hidden="true">·</span>
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
                                    <div className="p-3 rounded-md border text-xs flex items-start gap-2"
                                        style={{ background: 'var(--status-critical-bg)', borderColor: 'var(--error)', color: 'var(--error)' }}>
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold">{t('tab_rework')}</div>
                                            <p className="mt-0.5">{c.rework_reason}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Reference Evidence Cards */}
                                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                                    {citizenProof && (
                                        <div
                                            className="rounded-md border p-3 flex gap-3 items-start"
                                            style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setZoomedProof(citizenProof)}
                                                className="relative w-24 h-20 rounded border overflow-hidden shrink-0 group"
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={getImageUrl(citizenProof.url)}
                                                    alt="Citizen reported evidence"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                    <ZoomIn size={10} />
                                                </span>
                                            </button>
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[11px] font-bold text-(--text-muted)">
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
                                            <button
                                                type="button"
                                                onClick={() => setZoomedProof(teamProof)}
                                                className="relative w-24 h-20 rounded border overflow-hidden shrink-0 group"
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={getImageUrl(teamProof.url)}
                                                    alt="Team resolution proof"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                    <ZoomIn size={10} />
                                                </span>
                                            </button>
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[11px] font-bold text-[#138808]">
                                                    Field Team Resolution Proof · {c.assigned_team_name || 'Squad'}
                                                </div>
                                                <div className="font-semibold text-(--text-primary)">
                                                    Lead: {teamProof.uploaded_by_name || c.assigned_team_lead_name}
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-2">
                                                    {teamProof.notes || c.resolution_remarks}
                                                </p>
                                                {teamProof.latitude && teamProof.longitude && (
                                                    <div className="text-[10px] font-mono tabular-nums text-(--text-muted)">
                                                        GPS: {formatCoordinates(teamProof.latitude, teamProof.longitude)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Uploaded Site Inspection / Verification Photos with GPS Metadata */}
                                {uploadedOfficerProofs.length > 0 && !isFormOpen && (
                                    <div
                                        data-testid="inspector-uploaded-gallery"
                                        className="pt-3 border-t space-y-2"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="font-semibold text-(--text-primary)">
                                                Recorded Geotagged Site Photos ({uploadedOfficerProofs.length})
                                            </span>
                                            <span className="text-[11px] text-(--text-muted)">
                                                Click any photo to inspect full resolution & coordinates
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                            {uploadedOfficerProofs.map((proof, idx) => {
                                                const geo = evaluateGeofence(proof.distance_meters);
                                                return (
                                                    <div
                                                        key={proof.id || `${proof.url}-${idx}`}
                                                        className="rounded-md border p-2.5 flex gap-2.5 items-start"
                                                        style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => setZoomedProof(proof)}
                                                            className="relative w-20 h-16 rounded border overflow-hidden shrink-0 group"
                                                            style={{ borderColor: 'var(--border)' }}
                                                        >
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={getImageUrl(proof.url)}
                                                                alt={proof.file_name || 'Site inspection photo'}
                                                                referrerPolicy="no-referrer"
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                                <ZoomIn size={10} />
                                                            </span>
                                                        </button>
                                                        <div className="min-w-0 flex-1 text-[11px] space-y-0.5">
                                                            <div className="font-semibold text-(--text-primary) truncate">
                                                                {proof.stage === 'final_verification' ? 'Post-Repair Verification' : 'Initial Site Inspection'}
                                                            </div>
                                                            <div className="font-mono text-[10px] tabular-nums text-(--text-secondary)">
                                                                {formatCoordinates(proof.latitude, proof.longitude)}
                                                            </div>
                                                            <div className="text-[10px] text-(--text-muted) flex flex-wrap items-center gap-x-1.5">
                                                                <span>{formatGpsSourceLabel(proof.gps_source)}</span>
                                                                {proof.gps_accuracy_m !== null && proof.gps_accuracy_m !== undefined && (
                                                                    <>
                                                                        <span aria-hidden="true">·</span>
                                                                        <span className="font-mono tabular-nums">±{Math.round(proof.gps_accuracy_m)}m</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            <div
                                                                className={`text-[10px] font-semibold tabular-nums ${
                                                                    geo.tone === 'success'
                                                                        ? 'text-[#0A6B05]'
                                                                        : geo.tone === 'warning'
                                                                        ? 'text-[#B45309]'
                                                                        : 'text-(--text-muted)'
                                                                }`}
                                                            >
                                                                {geo.label}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <WorkflowStepper status={c.status} compact />

                                {/* Inline Proof Upload Form when active */}
                                {isFormOpen ? (
                                    <ProofUploadForm
                                        mode={activeFormTask.type === 'initial' ? 'inspection' : 'verification'}
                                        title={
                                            activeFormTask.type === 'initial'
                                                ? `Step 3: Upload Geotagged Site Inspection Photos (${c.complaint_number})`
                                                : `Step 7: Submit Post-Repair Site Verification (${c.complaint_number})`
                                        }
                                        subtitle={
                                            activeFormTask.type === 'initial'
                                                ? 'Upload site photos with live or EXIF GPS metadata. Save photos incrementally or submit directly for Nodal review.'
                                                : 'Inspect the completed field repair, upload geotagged verification photos, and record your verdict.'
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
                                        stageLabel="Save Geotagged Photos"
                                        defaultLat={c.latitude}
                                        defaultLng={c.longitude}
                                        existingProofs={activeStageProofs}
                                        showVerdict={activeFormTask.type === 'verification'}
                                        submitting={submitting}
                                        staging={staging}
                                        onStageOnly={handleStageSitePhotos}
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
                                                ? 'Action needed: Visit site and upload geotagged initial inspection photos.'
                                                : canSubmitVerify
                                                ? 'Action needed: Revisit site to confirm field team repair before final approval.'
                                                : 'Submitted — currently with Nodal Officer / Field Team.'}
                                        </span>

                                        <div className="flex items-center gap-2">
                                            {canSubmitInitial && (
                                                <button
                                                    type="button"
                                                    data-testid={`open-inspection-upload-${c.complaint_number}`}
                                                    onClick={() => setActiveFormTask({ complaint: c, type: 'initial' })}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer"
                                                    style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}
                                                >
                                                    <Camera size={14} />
                                                    <span>
                                                        {c.status === 'inspection_rework' ? 'Re-Upload Inspection Proof' : 'Upload Site Photos & Proof'}
                                                    </span>
                                                </button>
                                            )}
                                            {canSubmitVerify && (
                                                <button
                                                    type="button"
                                                    data-testid={`open-verification-upload-${c.complaint_number}`}
                                                    onClick={() => setActiveFormTask({ complaint: c, type: 'verification' })}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                                                    style={{ background: 'var(--india-green)' }}
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

            {/* Lightbox Zoom Overlay */}
            {zoomedProof && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
                    onClick={() => setZoomedProof(null)}
                >
                    <div className="max-w-3xl w-full space-y-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-white text-xs">
                            <span className="font-semibold">
                                {zoomedProof.uploaded_by_name || 'Officer'} · GPS:{' '}
                                <span className="font-mono tabular-nums">
                                    {formatCoordinates(zoomedProof.latitude, zoomedProof.longitude)}
                                </span>
                                {zoomedProof.gps_source ? ` · ${formatGpsSourceLabel(zoomedProof.gps_source)}` : ''}
                            </span>
                            <button
                                type="button"
                                onClick={() => setZoomedProof(null)}
                                className="p-1.5 rounded bg-white/15 hover:bg-white/25"
                                aria-label="Close photo preview"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={getImageUrl(zoomedProof.url)}
                            alt="Full-size field proof"
                            referrerPolicy="no-referrer"
                            className="w-full max-h-[75vh] object-contain rounded-lg border border-white/20 bg-black"
                        />
                        {zoomedProof.notes && (
                            <p className="text-xs text-white/85">{zoomedProof.notes}</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default withRoleGuard(InspectionOfficerDashboard, {
    allowedRoles: ['inspection_officer'],
    loadingLabel: 'Loading Inspection Officer Dashboard…',
});
