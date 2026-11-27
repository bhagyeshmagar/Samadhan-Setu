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
    Play,
    Camera,
    CheckCircle2,
    AlertTriangle,
    MapPin,
    Lock,
    RefreshCw,
    Users,
    Loader2,
    ZoomIn,
    X,
} from 'lucide-react';
import {
    formatCoordinates,
    formatGpsSourceLabel,
    evaluateGeofence,
} from '@/lib/proofUpload';

function TeamLeadDashboard() {
    const { user, loading: authLoading } = useAuth();
    const { t, tPriority } = useLanguage();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [toast, setToast] = useState(null);
    const [activeTab, setActiveTab] = useState('assigned'); // assigned | in_progress | rework | submitted
    const [activeFormId, setActiveFormId] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [stagingId, setStagingId] = useState(null);
    const [zoomedProof, setZoomedProof] = useState(null);

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

    const handleStageResolutionProof = async (complaint, payload) => {
        setStagingId(complaint.id);
        try {
            const res = await workflowAPI.uploadTeamResolutionProof(complaint.id, {
                ...payload,
                submit_for_verification: false,
            });
            const count = res?.uploaded_proofs?.length || payload.files.length;
            showToast(
                `Saved ${count} progress resolution photo(s) for ${complaint.complaint_number}. You can add more or submit the final ATR when complete.`
            );
            await loadDashboard();
            setActiveTab('in_progress');
        } finally {
            setStagingId(null);
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
                    data-testid="team-toast"
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
                        <span>{team?.department_name || t('department')}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{team?.code || 'TEAM'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-green)' }}>
                            <Lock size={11} /> {t('team_scope')}
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight mt-1" style={{ color: 'var(--navy)' }}>
                        {team?.name || t('team_title')}
                    </h1>
                    <p className="text-xs text-(--text-secondary) mt-1">
                        {t('role_team_lead')}: <strong>{user?.name}</strong> · {t('team_sub')}
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
                    { label: t('tab_assigned'), value: metrics.assigned ?? 0, sub: t('wf_team'), accent: 'var(--navy)', tab: 'assigned' },
                    { label: t('tab_in_progress'), value: metrics.in_progress ?? 0, sub: t('wf_repair'), accent: 'var(--text-saffron)', tab: 'in_progress' },
                    { label: t('tab_rework'), value: metrics.rework_required ?? 0, sub: t('wf_verify'), accent: 'var(--error)', tab: 'rework' },
                    { label: t('tab_submitted'), value: metrics.submitted_or_resolved ?? 0, sub: t('wf_resolved'), accent: 'var(--text-green)', tab: 'submitted' },
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
                    { key: 'assigned', label: t('tab_assigned'), count: assignedOrders.length },
                    { key: 'in_progress', label: t('tab_in_progress'), count: inProgressOrders.length },
                    { key: 'rework', label: t('tab_rework'), count: reworkOrders.length },
                    { key: 'submitted', label: t('tab_submitted'), count: submittedOrders.length },
                ].map((tab) => {
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => {
                                setActiveTab(tab.key);
                                setActiveFormId(null);
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
                        const resolutionProofs = getStageProofs(c, 'team_resolution');
                        const canStart = ['team_assigned', 'redressal_rework'].includes(c.status);
                        const canUploadProof = ['work_in_progress', 'team_assigned', 'redressal_rework'].includes(c.status);
                        const isFormOpen = activeFormId === c.id;

                        return (
                            <div
                                key={c.id}
                                data-testid={`team-order-card-${c.complaint_number}`}
                                className="rounded-lg border p-5 space-y-4"
                                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                            >
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
                                    <div className="p-3 rounded-md border text-xs flex items-start gap-2"
                                        style={{ background: 'var(--status-critical-bg)', borderColor: 'var(--error)', color: 'var(--error)' }}>
                                        <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                        <div>
                                            <div className="font-bold">{t('tab_rework')}</div>
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
                                            <button
                                                type="button"
                                                onClick={() => setZoomedProof(citizenProof)}
                                                className="relative w-24 h-20 rounded border overflow-hidden shrink-0 group"
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={getImageUrl(citizenProof.url)}
                                                    alt="Citizen grievance photo"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                    <ZoomIn size={10} />
                                                </span>
                                            </button>
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[11px] font-bold text-(--text-muted)">
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
                                            <button
                                                type="button"
                                                onClick={() => setZoomedProof(inspProof)}
                                                className="relative w-24 h-20 rounded border overflow-hidden shrink-0 group"
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={getImageUrl(inspProof.url)}
                                                    alt="Verified site inspection"
                                                    referrerPolicy="no-referrer"
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                    <ZoomIn size={10} />
                                                </span>
                                            </button>
                                            <div className="min-w-0 text-xs space-y-1">
                                                <div className="text-[11px] font-bold text-(--navy)">
                                                    Verified Site Inspection · {inspProof.uploaded_by_name}
                                                </div>
                                                <p className="text-[11px] text-(--text-secondary) line-clamp-3">
                                                    {inspProof.notes}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Uploaded Team Resolution Proof Gallery & ATR */}
                                {resolutionProofs.length > 0 && !isFormOpen && (
                                    <div
                                        data-testid="team-resolution-gallery"
                                        className="pt-3 border-t space-y-2"
                                        style={{ borderColor: 'var(--border)' }}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                            <span className="font-semibold text-[#0A6B05]">
                                                Uploaded Resolution Proof ({resolutionProofs.length})
                                            </span>
                                            {c.resolution_materials && (
                                                <span className="text-[11px] text-(--text-secondary)">
                                                    Materials: {c.resolution_materials}
                                                </span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                                            {resolutionProofs.map((proof, idx) => {
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
                                                                alt={proof.file_name || 'Resolution proof'}
                                                                referrerPolicy="no-referrer"
                                                                className="w-full h-full object-cover"
                                                            />
                                                            <span className="absolute bottom-1 right-1 p-0.5 rounded bg-black/70 text-white opacity-80 group-hover:opacity-100">
                                                                <ZoomIn size={10} />
                                                            </span>
                                                        </button>
                                                        <div className="min-w-0 flex-1 text-[11px] space-y-0.5">
                                                            <div className="font-semibold text-(--text-primary) truncate">
                                                                {proof.file_name || `After-Repair Photo ${idx + 1}`}
                                                            </div>
                                                            <div className="font-mono text-[10px] tabular-nums text-(--text-secondary)">
                                                                {formatCoordinates(proof.latitude, proof.longitude)}
                                                            </div>
                                                            <div className="text-[10px] text-(--text-muted)">
                                                                {formatGpsSourceLabel(proof.gps_source)}
                                                                {proof.distance_meters !== null && proof.distance_meters !== undefined
                                                                    ? ` · ${geo.label}`
                                                                    : ''}
                                                            </div>
                                                            {proof.notes && (
                                                                <p className="text-[10px] text-(--text-secondary) line-clamp-1">
                                                                    {proof.notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <WorkflowStepper status={c.status} compact />

                                {isFormOpen ? (
                                    <ProofUploadForm
                                        mode="resolution"
                                        title={`Step 6: Upload Resolution Proof & Action Taken Report (${c.complaint_number})`}
                                        subtitle="Upload geotagged after-repair photos, log materials used, and submit ATR notes to dispatch post-repair site verification."
                                        notesLabel="Action Taken Report (ATR) — Work Performed"
                                        notesPlaceholder="e.g., Milled damaged asphalt, laid 50mm hot-mix bitumen, compacted with 8-ton roller, and restored road markings."
                                        submitLabel="Submit Resolution Proof for Inspection"
                                        stageLabel="Save Progress Proof"
                                        defaultLat={c.latitude}
                                        defaultLng={c.longitude}
                                        existingProofs={resolutionProofs}
                                        showMaterials
                                        submitting={busyId === c.id}
                                        staging={stagingId === c.id}
                                        onStageOnly={(payload) => handleStageResolutionProof(c, payload)}
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
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap disabled:opacity-60 cursor-pointer"
                                                    style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}
                                                >
                                                    {busyId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                                    <span>{c.status === 'redressal_rework' ? 'Resume Rework' : 'Start Field Work'}</span>
                                                </button>
                                            )}
                                            {canUploadProof && (
                                                <button
                                                    type="button"
                                                    data-testid={`open-resolution-upload-${c.complaint_number}`}
                                                    onClick={() => setActiveFormId(c.id)}
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                                                    style={{ background: 'var(--india-green)' }}
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

            {/* Lightbox Zoom Overlay */}
            {zoomedProof && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6"
                    onClick={() => setZoomedProof(null)}
                >
                    <div className="max-w-3xl w-full space-y-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-white text-xs">
                            <span className="font-semibold">
                                {zoomedProof.uploaded_by_name || 'Field Team'} · GPS:{' '}
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
                            alt="Full-size resolution proof"
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

export default withRoleGuard(TeamLeadDashboard, {
    allowedRoles: ['team_lead'],
    loadingLabel: 'Loading Field Team Dashboard…',
});
