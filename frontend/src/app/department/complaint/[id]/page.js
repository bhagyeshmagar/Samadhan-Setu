'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { departmentAPI, complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import AppellateAdjudicationModal from '@/components/AppellateAdjudicationModal';
import {
    MapPin, Clock, User, Phone, Mail, FileText, Upload, CheckCircle,
    AlertTriangle, ArrowLeft, Loader2, ImagePlus, X,
    Calendar, Activity, ChevronRight, CheckCircle2, Brain
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const MAX_PROOF_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // backend limit is 5 MB

// Values match the backend ComplaintStatus enum (lowercase / snake_case)
const STATUS_OPTIONS = [
    { value: 'submitted', label: 'Pending / प्रतीक्षारत' },
    { value: 'assigned', label: 'Assigned / स्वीकृत' },
    { value: 'in_progress', label: 'In Progress / प्रगति पर' },
    { value: 'resolved', label: 'Resolved / समाधानित' },
    { value: 'closed', label: 'Closed / बंद' },
    { value: 'reopened', label: 'Reopened / पुनः खुला' },
    { value: 'appealed_l1', label: 'Appeal Level 1 (Nodal Review)' },
    { value: 'appealed_l2', label: 'Appeal Level 2 (Appellate Review)' },
    { value: 'escalated', label: 'Escalated / अग्रसारित' },
    { value: 'rejected', label: 'Rejected / निरस्त' },
];

// Securely load media from API endpoint
const getImageUrl = (img) => {
    const raw = typeof img === 'string' ? img : (img?.url || img?.path);
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/api/')) return `${API_BASE}${raw}`;
    if (raw.startsWith('/uploads/')) return `${API_BASE}${raw}`;
    return `${API_BASE}/api/media/${raw.replace(/^\//, '')}`;
};

export default function HandleComplaint() {
    const params = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { t, tStatus, tPriority, tCategory, locale } = useLanguage();

    const [complaint, setComplaint] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [now] = useState(() => Date.now());

    // Form state
    const [remarks, setRemarks] = useState('');
    const [status, setStatus] = useState('');
    const [proofImages, setProofImages] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Nodal Triage state
    const [triageCategory, setTriageCategory] = useState('');
    const [triagePriority, setTriagePriority] = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [showOverride, setShowOverride] = useState(false);
    const [triageSubmitting, setTriageSubmitting] = useState(false);
    const [triageSuccess, setTriageSuccess] = useState('');
    const [swarmSubmitting, setSwarmSubmitting] = useState(false);
    const [swarmResult, setSwarmResult] = useState(null);
    const [showAdjudicationModal, setShowAdjudicationModal] = useState(false);

    const complaintId = params?.id;

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const fetchComplaint = useCallback(async () => {
        try {
            const data = await complaintsAPI.getById(complaintId);
            setComplaint(data);
            setStatus(data.status);
            setTriageCategory(data.category || '');
            const p = data.priority;
            setTriagePriority(typeof p === 'object' && p?.value ? p.value.toLowerCase() : String(p || 'medium').toLowerCase());
        } catch {
            setError('Failed to load complaint data');
        } finally {
            setLoading(false);
        }
    }, [complaintId]);

    useEffect(() => {
        if (user && complaintId) {
            let cancelled = false;
            Promise.resolve().then(() => {
                if (!cancelled) fetchComplaint();
            });
            return () => {
                cancelled = true;
            };
        }
    }, [user, complaintId, fetchComplaint]);

    const handleConfirmTriage = async (isOverride = false) => {
        if (isOverride && !overrideReason.trim()) {
            setError('An override reason is required by Samadhan Setu Governance Protocol when overriding AI triage.');
            return;
        }
        setTriageSubmitting(true);
        setError('');
        try {
            await departmentAPI.confirmTriage(complaintId, {
                category: isOverride ? triageCategory : complaint.category,
                priority: isOverride ? triagePriority : (typeof complaint.priority === 'object' ? complaint.priority.value : complaint.priority),
                override_reason: isOverride ? overrideReason : '',
            });
            setTriageSuccess(isOverride ? 'Triage override successfully recorded.' : 'AI Triage confirmed by Nodal Officer.');
            setShowOverride(false);
            setOverrideReason('');
            await fetchComplaint();
            setTimeout(() => setTriageSuccess(''), 4000);
        } catch (err) {
            setError(err.message || 'Failed to confirm triage');
        } finally {
            setTriageSubmitting(false);
        }
    };

    const handleProofUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length + proofImages.length > MAX_PROOF_FILES) {
            setError(`Maximum ${MAX_PROOF_FILES} proof images allowed`);
            return;
        }
        setError('');

        files.forEach((file) => {
            if (file.size > MAX_FILE_BYTES) {
                setError('Each file must be less than 5MB');
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
                setProofImages((prev) => [...prev, { url: ev.target.result, file, name: file.name }]);
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removeProof = (index) => {
        setProofImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleResolve = async () => {
        if (!remarks.trim()) {
            setError('Official resolution remarks are required by administrative policy.');
            return;
        }
        if (remarks.trim().length < 20) {
            setError('Resolution remarks must be at least 20 characters describing the remediation action taken.');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            if (proofImages.length > 0) {
                await departmentAPI.uploadProof(complaintId, proofImages.map((i) => i.file));
            }
            await departmentAPI.updateComplaintStatus(complaintId, {
                status: 'resolved',
                remarks,
            });

            setSuccess(true);
            setTimeout(() => router.push('/department'), 2000);
        } catch (err) {
            setError(err.message || 'Failed to update resolution status');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        setError('');
        try {
            await departmentAPI.updateComplaintStatus(complaintId, {
                status: newStatus,
                remarks: `Status updated to ${newStatus.replace('_', ' ')}`,
            });
            setStatus(newStatus);
            fetchComplaint();
        } catch (err) {
            setError(err.message || 'Failed to update status');
        }
    };

    const handleSwarmResolve = async () => {
        setSwarmSubmitting(true);
        setError('');
        setSwarmResult(null);
        try {
            const result = await departmentAPI.swarmResolve(complaintId);
            setSwarmResult(result);
            await fetchComplaint();
        } catch (err) {
            setError(err.message || 'Failed to resolve linked complaints');
        } finally {
            setSwarmSubmitting(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] flex-col gap-3">
                <Loader2 className="animate-spin" size={36} style={{ color: 'var(--navy)' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {t('loading')}
                </p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-xl mx-auto my-16 p-8 gov-card text-center" style={{ borderTop: '4px solid var(--india-green)' }}>
                <CheckCircle2 size={64} className="mx-auto mb-4" style={{ color: 'var(--india-green)' }} />
                <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {t('certify_resolved')}
                </h2>
                <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                    {t('grievance_registered_desc')}
                </p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('redirecting_dashboard')}</p>
            </div>
        );
    }

    if (!complaint) {
        return (
            <div className="max-w-lg mx-auto my-16 p-8 gov-card text-center">
                <AlertTriangle size={48} className="mx-auto mb-3" style={{ color: 'var(--status-critical)' }} />
                <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('no_grievances_found')}</h2>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{t('no_grievances_found_desc')}</p>
                <button onClick={() => router.push('/department')} className="btn-gov-primary text-xs">
                    {t('open_dashboard')}
                </button>
            </div>
        );
    }

    const priority = (complaint.priority || '').toLowerCase();
    const history = [...(complaint.status_history || [])].slice(-4).reverse();

    // SLA timing (computed from real created_at / deadline)
    let slaHealth = null;
    if (complaint.deadline && complaint.created_at) {
        const total = new Date(complaint.deadline) - new Date(complaint.created_at);
        const elapsed = now - new Date(complaint.created_at);
        if (total > 0) {
            slaHealth = Math.max(0, Math.min(100, Math.round((1 - elapsed / total) * 100)));
        }
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* Breadcrumb & Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>{t('home')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>{t('department_services')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('grievance_dossier')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/department')}
                            className="btn-ghost p-1.5 rounded transition"
                            title="Back"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                            {t('grievance_dossier')} #{complaint.id?.substring(0, 8)}
                        </h1>
                    </div>
                    <p className="text-sm mt-0.5 ml-8" style={{ color: 'var(--text-muted)' }}>
                        {t('dossier_sub')}
                    </p>
                </div>

                {/* Statutory SLA Timer */}
                <div className="w-full sm:w-auto">
                    <DeadlineTimer
                        deadline={complaint.deadline}
                        createdAt={complaint.created_at}
                        priority={complaint.priority}
                        status={complaint.status}
                        resolvedAt={complaint.resolved_at}
                        showProgressBar={false}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Appellate Authority Adjudication Panel */}
                    {(complaint.status || '').toLowerCase().startsWith('appealed') && (
                        <div
                            className="p-5 rounded-2xl border-2 shadow-sm space-y-3"
                            style={{ background: 'var(--status-critical-bg)', borderColor: 'var(--status-critical)' }}
                        >
                            <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2" style={{ color: 'var(--status-critical)' }}>
                                {t('appellate_desk')} ({String(complaint.status || '').toLowerCase() === 'appealed_l2' ? t('level2_appellate_review') : t('level1_nodal_review')})
                            </h3>
                            {complaint.appeal_remarks && (
                                <div
                                    className="p-3 rounded-lg border text-xs"
                                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                                >
                                    <span className="font-bold">Citizen Appeal Reason: </span>
                                    <span>{complaint.appeal_remarks}</span>
                                </div>
                            )}

                            {['supervisor', 'admin', 'super_admin'].includes(user?.role) ? (
                                <div className="pt-1">
                                    <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        As an authorized Appellate Authority, review the evidence and citizen grounds to issue a binding administrative order:
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setShowAdjudicationModal(true)}
                                        className="text-xs px-5 py-2.5 flex items-center gap-2 rounded-xl shadow-sm font-bold"
                                        style={{ background: 'var(--status-critical)', color: '#FFFFFF' }}
                                    >
                                        Open Appellate Adjudication Console
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="p-3 rounded-lg border text-xs"
                                    style={{ background: 'var(--status-progress-bg)', borderColor: 'var(--status-progress)', color: 'var(--status-progress)' }}
                                >
                                    This complaint is currently under official Appellate Review. Only designated Supervisors and Admins may adjudicate appeals and issue rework directives.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Complaint Details Card */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2">
                                <FileText size={14} /> {t('registered_particulars')}
                            </span>
                            <div className="flex items-center gap-2">
                                <Badge status={complaint.status} />
                                {priority && (
                                    <span
                                        className="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                                        style={
                                            priority === 'high' || priority === 'critical'
                                                ? { background: 'var(--status-critical-bg)', color: 'var(--status-critical)' }
                                                : priority === 'medium'
                                                ? { background: 'var(--status-progress-bg)', color: 'var(--status-progress)' }
                                                : { background: 'var(--bg-section)', color: 'var(--text-secondary)' }
                                        }
                                    >
                                        {t('priority')}: {tPriority(priority)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('category')}
                                </span>
                                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                    {tCategory(complaint.category || 'General')}
                                </div>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('citizen_statement')}
                                </span>
                                <p
                                    className="text-sm leading-relaxed p-3.5 rounded border"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                >
                                    {complaint.description}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <div
                                    className="flex items-start gap-2.5 p-3 rounded border"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
                                >
                                    <MapPin className="mt-0.5 shrink-0" size={16} style={{ color: 'var(--navy)' }} />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                                            {t('location_ward')}
                                        </p>
                                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                            {complaint.location || 'Not Specified'}
                                        </p>
                                        {complaint.ward && (
                                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                {complaint.ward}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div
                                    className="flex items-start gap-2.5 p-3 rounded border"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
                                >
                                    <Calendar className="mt-0.5 shrink-0" size={16} style={{ color: 'var(--navy)' }} />
                                    <div>
                                        <p className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                                            {t('registration_timestamp')}
                                        </p>
                                        <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            {complaint.created_at ? new Date(complaint.created_at).toLocaleString(locale) : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Citizen Submitted Images */}
                            {complaint.attachments && complaint.attachments.length > 0 && (
                                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                    <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                                        <ImagePlus size={14} style={{ color: 'var(--navy)' }} /> {t('evidence_uploaded_by_you')} ({complaint.attachments.length})
                                    </h4>
                                    <div className="flex gap-3 flex-wrap">
                                        {complaint.attachments.map((img, idx) => (
                                            <a
                                                key={idx}
                                                href={getImageUrl(img)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block"
                                            >
                                                <Image
                                                    src={getImageUrl(img)}
                                                    alt={`Evidence ${idx + 1}`}
                                                    width={112}
                                                    height={112}
                                                    unoptimized
                                                    className="w-28 h-28 object-cover rounded border shadow-sm transition hover:scale-105"
                                                    style={{ borderColor: 'var(--border-mid)' }}
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Nodal Governance Verification */}
                    <div className="gov-section" style={{ borderTop: '4px solid var(--navy)' }}>
                        <div className="gov-section-header flex items-center justify-between">
                            <span className="gov-section-title flex items-center gap-2 font-bold">
                                <Brain size={14} style={{ color: 'var(--navy)' }} />
                                {t('nodal_verification')}
                            </span>
                            <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}
                            >
                                Human-in-the-Loop
                            </span>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-3 rounded border" style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}>
                                    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                                        {t('ai_assessed_category')}
                                    </span>
                                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                        {tCategory(complaint.ai_results?.[0]?.predicted_category || complaint.ai_category || complaint.category || 'General')}
                                    </span>
                                </div>
                                <div className="p-3 rounded border" style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}>
                                    <span className="text-[10px] font-bold uppercase tracking-wider block" style={{ color: 'var(--text-muted)' }}>
                                        {t('priority')}
                                    </span>
                                    <span className="text-sm font-bold uppercase" style={{ color: 'var(--navy)' }}>
                                        {tPriority(typeof complaint.priority === 'object' ? complaint.priority.value : (complaint.priority || 'medium'))}
                                    </span>
                                </div>
                            </div>

                            {triageSuccess && (
                                <div className="gov-alert success text-xs">
                                    <CheckCircle size={14} />
                                    <span>{triageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleConfirmTriage(false)}
                                    disabled={triageSubmitting}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2"
                                    style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}
                                >
                                    {triageSubmitting && <Loader2 size={12} className="animate-spin" />}
                                    ✓ Confirm AI Triage Recommendation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowOverride(!showOverride)}
                                    className="btn-ghost px-4 py-2 rounded-lg text-xs font-semibold"
                                >
                                    {showOverride ? t('cancel') : 'Override Category / Priority'}
                                </button>
                            </div>

                            {showOverride && (
                                <div
                                    className="mt-3 p-4 rounded-lg border space-y-3"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border-mid)' }}
                                >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                                Adjusted Category
                                            </label>
                                            <input
                                                type="text"
                                                value={triageCategory}
                                                onChange={(e) => setTriageCategory(e.target.value)}
                                                className="gov-input w-full text-xs"
                                                placeholder="e.g. Roads, Water Supply, Sanitation"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                                Adjusted Priority
                                            </label>
                                            <select
                                                value={triagePriority}
                                                onChange={(e) => setTriagePriority(e.target.value)}
                                                className="gov-input w-full text-xs"
                                            >
                                                <option value="low">{tPriority('low')} (21 Days / 504h)</option>
                                                <option value="medium">{tPriority('medium')} (7 Days / 168h)</option>
                                                <option value="high">{tPriority('high')} (5 Days / 120h)</option>
                                                <option value="critical">{tPriority('critical')} (3 Days / 72h)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                            Mandatory Reason for Override <span style={{ color: 'var(--status-critical)' }}>*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={overrideReason}
                                            onChange={(e) => setOverrideReason(e.target.value)}
                                            placeholder="Explain why AI classification is altered (logged for model retraining)..."
                                            className="gov-input w-full text-xs"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleConfirmTriage(true)}
                                        disabled={triageSubmitting || !overrideReason.trim()}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2"
                                        style={{ background: 'var(--status-critical)', color: '#FFFFFF' }}
                                    >
                                        {triageSubmitting && <Loader2 size={12} className="animate-spin" />}
                                        Submit Official Triage Override
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Before / After Visual Verification Card (BUG-10) */}
                    {(() => {
                        const beforeImgs = complaint.inspection_images || [];
                        const afterImgs = complaint.resolution_proof || complaint.proof_images || [];
                        if (beforeImgs.length === 0 && afterImgs.length === 0) return null;
                        return (
                            <div className="gov-section border-t-4 border-t-cyan-600 bg-cyan-50/10">
                                <div className="gov-section-header bg-cyan-50/50 flex items-center justify-between">
                                    <span className="gov-section-title flex items-center gap-2 text-cyan-950 font-bold">
                                        <ImagePlus size={14} className="text-cyan-700" />
                                        Before / After Forensic Verification / पूर्व–पश्चात् फोटो सत्यापन
                                    </span>
                                    <span className="text-[10px] bg-cyan-100 text-cyan-800 font-bold px-2 py-0.5 rounded">
                                        Visual Evidence
                                    </span>
                                </div>
                                <div className="p-5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* Before — Inspection Photos */}
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                                                Before (Site Inspection)
                                            </p>
                                            {beforeImgs.length > 0 ? (
                                                <div className="flex gap-2 flex-wrap">
                                                    {beforeImgs.map((img, idx) => (
                                                        <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer">
                                                            <Image
                                                                src={getImageUrl(img)}
                                                                alt={`Before ${idx + 1}`}
                                                                width={100} height={100} unoptimized
                                                                className="w-24 h-24 object-cover rounded border-2 border-amber-300 hover:border-amber-600 shadow-sm transition hover:scale-105"
                                                            />
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 italic">No inspection photo uploaded yet.</p>
                                            )}
                                        </div>

                                        {/* After — Resolution Proof Photos */}
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                                                After (Resolution Proof)
                                            </p>
                                            {afterImgs.length > 0 ? (
                                                <div className="flex gap-2 flex-wrap">
                                                    {afterImgs.map((img, idx) => (
                                                        <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer">
                                                            <Image
                                                                src={getImageUrl(img)}
                                                                alt={`After ${idx + 1}`}
                                                                width={100} height={100} unoptimized
                                                                className="w-24 h-24 object-cover rounded border-2 border-emerald-300 hover:border-emerald-600 shadow-sm transition hover:scale-105"
                                                            />
                                                        </a>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 italic">Resolution proof not yet submitted.</p>
                                            )}
                                        </div>
                                    </div>

                                    {beforeImgs.length > 0 && afterImgs.length > 0 && (
                                        <p className="mt-3 text-[11px] text-cyan-800 font-medium flex items-center gap-1.5">
                                            <CheckCircle size={12} className="text-emerald-600" />
                                            Forensic Before/After photo pair present — visual verification enabled.
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Officer Resolution Workspace */}
                    <div className="gov-section" style={{ borderTop: '4px solid var(--india-green)' }}>
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2 font-bold">
                                <CheckCircle size={14} style={{ color: 'var(--india-green)' }} />
                                {t('officer_resolution_workspace')}
                            </span>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Officer Remarks */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                        Official Action Taken Report (ATR) Notes <span style={{ color: 'var(--status-critical)' }}>*</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                const res = await departmentAPI.generateAtrDraft(complaint.id);
                                                if (res?.atr_draft) setRemarks(res.atr_draft);
                                            } catch (err) {
                                                console.error('ATR draft error:', err);
                                            }
                                        }}
                                        className="px-3 py-1 rounded-lg border text-xs font-semibold transition"
                                        style={{ background: 'var(--navy-light)', borderColor: 'var(--border-mid)', color: 'var(--navy)' }}
                                    >
                                        Auto-Draft Official ATR with AI
                                    </button>
                                </div>
                                <textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    className="gov-input w-full resize-none p-3 text-xs"
                                    placeholder="Enter detailed report on repairs conducted, materials utilized, and on-site resolution verification..."
                                    rows={5}
                                />
                                <div className="mt-2 flex gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setRemarks('Site inspected by field staff and necessary repairs/clearance successfully completed. Normal services restored.')}
                                        className="btn-ghost text-[11px] px-2.5 py-1 rounded font-medium transition"
                                    >
                                        Template: Inspection & Completed
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRemarks('Maintenance crew dispatched. Defect rectified in compliance with municipal safety standards.')}
                                        className="btn-ghost text-[11px] px-2.5 py-1 rounded font-medium transition"
                                    >
                                        Template: Maintenance Rectification
                                    </button>
                                </div>
                            </div>

                            {/* Resolution Proof Upload */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                                    Resolution Proof Photographs (Upload On-Site Photos)
                                </label>
                                <div
                                    className="border-2 border-dashed rounded p-5 transition cursor-pointer text-center"
                                    style={{ borderColor: 'var(--border-mid)', background: 'var(--bg-section)' }}
                                >
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        multiple
                                        onChange={handleProofUpload}
                                        className="hidden"
                                        id="proof-upload"
                                    />
                                    <label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center">
                                        <Upload className="mb-1.5" size={32} style={{ color: 'var(--text-muted)' }} />
                                        <span className="text-xs font-bold" style={{ color: 'var(--navy)' }}>Attach On-Site Proof Images</span>
                                        <span className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>JPG, PNG, WEBP up to 5MB each (max {MAX_PROOF_FILES} files)</span>
                                    </label>
                                </div>

                                {proofImages.length > 0 && (
                                    <div className="flex gap-2.5 mt-3 flex-wrap">
                                        {proofImages.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                                <Image
                                                    src={img.url}
                                                    alt={`Proof ${idx + 1}`}
                                                    width={80}
                                                    height={80}
                                                    unoptimized
                                                    className="w-20 h-20 object-cover rounded border shadow-sm"
                                                    style={{ borderColor: 'var(--india-green)' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeProof(idx)}
                                                    className="absolute -top-1.5 -right-1.5 text-white rounded-full p-0.5 shadow transition"
                                                    style={{ background: 'var(--status-critical)' }}
                                                    title="Remove image"
                                                >
                                                    <X size={12} />
                                                </button>
                                                <span
                                                    className="absolute bottom-0 left-0 right-0 text-white text-[9px] text-center rounded-b truncate px-1 font-semibold"
                                                    style={{ background: 'var(--india-green)' }}
                                                >
                                                    Proof #{idx + 1}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="gov-alert error text-xs">
                                    <AlertTriangle size={14} />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                                <button
                                    type="button"
                                    onClick={() => handleStatusUpdate('in_progress')}
                                    className="text-xs font-bold underline transition"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {t('save_progress')}
                                </button>
                                <button
                                    onClick={handleResolve}
                                    disabled={submitting || !remarks.trim()}
                                    className="btn-gov-primary flex items-center gap-2 text-xs py-2 px-6"
                                    style={{ background: 'var(--india-green)', borderColor: 'var(--india-green)', color: '#FFFFFF' }}
                                >
                                    {submitting ? (
                                        <Loader2 className="animate-spin" size={16} />
                                    ) : (
                                        <CheckCircle size={16} />
                                    )}
                                    <span>{t('certify_resolved')}</span>
                                </button>
                            </div>

                            {['resolved', 'closed'].includes(String(complaint.status || '').toLowerCase()) && (
                                <div
                                    className="rounded-xl border p-4"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
                                                Grievance Deduplication Policy
                                            </h3>
                                            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                                Automated mass-resolution is disabled for citizen governance integrity. Each citizen grievance requires separate, authentic on-site inspection proof.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Status Management */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-1.5">
                                <Activity size={13} /> {t('administrative_status')}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('current_stage')}
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => handleStatusUpdate(e.target.value)}
                                    className="gov-input w-full text-xs font-semibold py-1.5"
                                >
                                    {STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{tStatus(o.value)}</option>
                                    ))}
                                </select>
                            </div>

                            {slaHealth !== null && (
                                <div className="pt-2">
                                    <div className="flex justify-between text-[11px] mb-1">
                                        <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>SLA {t('sla_remaining')}</span>
                                        <span className="font-bold" style={{ color: 'var(--navy)' }}>{slaHealth}%</span>
                                    </div>
                                    <div className="priority-bar">
                                        <div
                                            className="priority-bar-fill"
                                            style={{
                                                width: `${slaHealth}%`,
                                                background: slaHealth > 50 ? 'var(--india-green)' : slaHealth > 20 ? 'var(--saffron)' : 'var(--status-critical)',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Citizen Details */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-1.5">
                                <User size={13} /> {t('citizen_profile')}
                            </span>
                        </div>
                        <div className="p-4 space-y-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 border rounded-full flex items-center justify-center font-bold"
                                    style={{ background: 'var(--bg-section)', borderColor: 'var(--border-mid)', color: 'var(--navy)' }}
                                >
                                    {complaint.user?.name?.charAt(0) || 'C'}
                                </div>
                                <div>
                                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{complaint.user?.name || t('role_citizen')}</p>
                                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Verified Citizen Account</p>
                                </div>
                            </div>
                            <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                                <div className="flex items-center gap-2">
                                    <Mail size={13} style={{ color: 'var(--text-muted)' }} />
                                    <span className="truncate">{complaint.user?.email || 'Not provided'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone size={13} style={{ color: 'var(--text-muted)' }} />
                                    <span>{complaint.user?.phone || 'Not provided'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Activity Log */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-1.5">
                                <Clock size={13} /> {t('official_audit_trail')}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {history.map((log, idx) => (
                                <div key={log.id || idx} className="flex gap-2.5 text-xs">
                                    <div className="w-2 h-2 mt-1.5 rounded-full shrink-0" style={{ background: 'var(--navy)' }} />
                                    <div>
                                        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            <Badge status={log.to_status} size="small" />
                                        </p>
                                        {log.remarks && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{log.remarks}</p>}
                                        <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                            {new Date(log.created_at).toLocaleString(locale)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && (
                                <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)' }}>No preceding action logged.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Appellate Adjudication Modal (H-06 FIX) */}
            <AppellateAdjudicationModal
                isOpen={showAdjudicationModal}
                onClose={() => setShowAdjudicationModal(false)}
                complaint={complaint}
                onSuccess={fetchComplaint}
            />
        </div>
    );
}
