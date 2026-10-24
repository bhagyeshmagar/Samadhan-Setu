'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { departmentAPI, complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import {
    MapPin, Clock, User, Phone, Mail, FileText, Upload, CheckCircle,
    AlertTriangle, ArrowLeft, Loader2, ImagePlus, X,
    Calendar, Activity, ChevronRight, CheckCircle2, Brain
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const MAX_PROOF_FILES = 5;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // backend limit is 5 MB

// Values match the backend ComplaintStatus enum (lowercase / snake_case)
const STATUS_OPTIONS = [
    { value: 'submitted', label: 'Pending / प्रतीक्षारत' },
    { value: 'assigned', label: 'Assigned / स्वीकृत' },
    { value: 'in_progress', label: 'In Progress / प्रगति पर' },
    { value: 'resolved', label: 'Resolved / समाधानित' },
    { value: 'rejected', label: 'Rejected / निरस्त' },
];

// Backend stores keys like "citizen/abc.jpg" and serves them under /uploads
const getImageUrl = (img) => {
    const raw = typeof img === 'string' ? img : img?.path;
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('/uploads/')) return `${API_BASE}${raw}`;
    return `${API_BASE}/uploads/${raw.replace(/^\//, '')}`;
};

export default function HandleComplaint() {
    const params = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

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
        } catch {
            setError('Failed to load complaint data');
        } finally {
            setLoading(false);
        }
    }, [complaintId]);

    useEffect(() => {
        if (user && complaintId) {
            fetchComplaint();
        }
    }, [user, complaintId, fetchComplaint]);

    useEffect(() => {
        if (complaint) {
            setTriageCategory(complaint.category || '');
            const p = complaint.priority;
            setTriagePriority(typeof p === 'object' && p?.value ? p.value.toLowerCase() : String(p || 'medium').toLowerCase());
        }
    }, [complaint]);

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
                <Loader2 className="animate-spin text-(--navy)" size={36} />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Retrieving Official Grievance Dossier…
                </p>
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-xl mx-auto my-16 p-8 gov-card text-center border-t-4 border-t-green-600">
                <CheckCircle2 size={64} className="mx-auto text-green-600 mb-4" />
                <h2 className="text-xl font-bold text-gray-900 mb-1">
                    Grievance Marked as Resolved
                </h2>
                <p className="text-xs text-gray-600 mb-2">
                    शिकायत निवारण दर्ज — The citizen will receive SMS and digital notification regarding this resolution.
                </p>
                <p className="text-[11px] text-gray-400">Redirecting to Department Task Desk…</p>
            </div>
        );
    }

    if (!complaint) {
        return (
            <div className="max-w-lg mx-auto my-16 p-8 gov-card text-center">
                <AlertTriangle size={48} className="mx-auto text-red-600 mb-3" />
                <h2 className="text-lg font-bold text-gray-900 mb-1">Grievance Record Not Found</h2>
                <p className="text-xs text-gray-500 mb-4">The requested complaint ID does not exist or has been archived.</p>
                <button onClick={() => router.push('/department')} className="btn-gov-primary text-xs">
                    Return to Dashboard
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
            {/* ── Breadcrumb & Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>Department Services</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Grievance Action Dossier</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/department')}
                            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition"
                            title="Back"
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                            Grievance Action Dossier #{complaint.id?.substring(0, 8)}
                        </h1>
                    </div>
                    <p className="text-sm mt-0.5 ml-8" style={{ color: 'var(--text-muted)' }}>
                        शिकायत निवारण कार्यवाही — Official field officer inspection and resolution console
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
                    {(complaint.status || '').toLowerCase() === 'appealed' && (
                        <div className="p-5 rounded-2xl border-2 border-rose-400 bg-rose-50/80 shadow-sm">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-rose-800 mb-2 flex items-center gap-2">
                                ⚖️ Appellate Authority Adjudication Required (Citizen Appeal Active)
                            </h3>
                            <p className="text-xs text-rose-900 mb-3 leading-relaxed">
                                The citizen challenged the previous Action Taken Report (ATR). Issue a binding Appellate Order below:
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const notes = prompt('Enter Appellate Rework Directive for Field Team (min 10 chars):', 'Field inspection incomplete. Re-verify on site and upload fresh geo-tagged proof within 24 hours.');
                                        if (notes && notes.length >= 10) {
                                            await departmentAPI.adjudicateAppeal(complaint.id, 'reopen_rework', notes);
                                            window.location.reload();
                                        }
                                    }}
                                    className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                                >
                                    ↺ Uphold Citizen Appeal — Reopen for Field Rework (24h SLA)
                                </button>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        const notes = prompt('Enter Final Binding Appellate Closure Order (min 10 chars):', 'Verified before/after evidence and departmental logs. Work meets municipal specifications. Appeal disposed.');
                                        if (notes && notes.length >= 10) {
                                            await departmentAPI.adjudicateAppeal(complaint.id, 'final_close', notes);
                                            window.location.reload();
                                        }
                                    }}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                                >
                                    ✓ Dispose Appeal — Issue Final Resolution & Close
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Complaint Details Card */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2">
                                <FileText size={14} /> Registered Grievance Particulars
                            </span>
                            <div className="flex items-center gap-2">
                                <Badge status={complaint.status} />
                                {priority && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                        priority === 'high' || priority === 'critical' ? 'bg-red-100 text-red-800' :
                                        priority === 'medium' ? 'bg-amber-100 text-amber-800' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        AI Priority: {priority}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="p-5 space-y-4">
                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                    Domain / Category
                                </span>
                                <div className="text-sm font-bold text-gray-900">
                                    {complaint.category || 'General Civic'}
                                </div>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                    Citizen Statement / समस्या विवरण
                                </span>
                                <p className="text-sm text-gray-800 leading-relaxed bg-gray-50 p-3.5 rounded border border-gray-200">
                                    {complaint.description}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <div className="flex items-start gap-2.5 p-3 rounded border border-gray-200 bg-white">
                                    <MapPin className="text-(--navy) mt-0.5 shrink-0" size={16} />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase text-gray-500">Location / Ward</p>
                                        <p className="text-xs font-semibold text-gray-900 truncate">{complaint.location || 'Not Specified'}</p>
                                        {complaint.ward && <p className="text-[11px] text-gray-500">Ward: {complaint.ward}</p>}
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 p-3 rounded border border-gray-200 bg-white">
                                    <Calendar className="text-(--navy) mt-0.5 shrink-0" size={16} />
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-gray-500">Registration Timestamp</p>
                                        <p className="text-xs font-semibold text-gray-900">
                                            {complaint.created_at ? new Date(complaint.created_at).toLocaleString('en-IN') : '—'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Citizen Submitted Images */}
                            {complaint.attachments && complaint.attachments.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <ImagePlus size={14} className="text-(--navy)" /> Citizen Submitted Photographic Evidence ({complaint.attachments.length})
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
                                                    className="w-28 h-28 object-cover rounded border border-gray-300 hover:border-(--navy) shadow-sm transition hover:scale-105"
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Samadhan Setu Nodal Governance Verification */}
                    <div className="gov-section border-t-4 border-t-purple-600 bg-purple-50/20">
                        <div className="gov-section-header bg-purple-50/50 flex items-center justify-between">
                            <span className="gov-section-title flex items-center gap-2 text-purple-950 font-bold">
                                <Brain size={14} className="text-purple-700" />
                                Samadhan Setu Nodal Governance Verification / नोडल अधिकारी समीक्षा
                            </span>
                            <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded">
                                Human-in-the-Loop
                            </span>
                        </div>

                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-3 bg-white rounded border border-purple-100 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                                        AI Recommended Category
                                    </span>
                                    <span className="text-sm font-bold text-gray-900">
                                        {complaint.category || 'General Civic'}
                                    </span>
                                </div>
                                <div className="p-3 bg-white rounded border border-purple-100 shadow-sm">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block">
                                        AI Recommended Priority
                                    </span>
                                    <span className="text-sm font-bold uppercase text-purple-800">
                                        {typeof complaint.priority === 'object' ? complaint.priority.value : (complaint.priority || 'Medium')}
                                    </span>
                                </div>
                            </div>

                            {triageSuccess && (
                                <div className="gov-alert success text-xs bg-emerald-50 border-emerald-300 text-emerald-800">
                                    <CheckCircle size={14} className="text-emerald-600" />
                                    <span>{triageSuccess}</span>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleConfirmTriage(false)}
                                    disabled={triageSubmitting}
                                    className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-2"
                                >
                                    {triageSubmitting && <Loader2 size={12} className="animate-spin" />}
                                    ✓ Confirm AI Triage Recommendation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowOverride(!showOverride)}
                                    className="px-4 py-2 rounded-lg border border-purple-300 text-purple-800 hover:bg-purple-50 text-xs font-semibold"
                                >
                                    {showOverride ? 'Cancel Override' : 'Override Category / Priority'}
                                </button>
                            </div>

                            {showOverride && (
                                <div className="mt-3 p-4 bg-white rounded-lg border border-purple-200 space-y-3">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[11px] font-bold uppercase text-gray-600 block mb-1">
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
                                            <label className="text-[11px] font-bold uppercase text-gray-600 block mb-1">
                                                Adjusted Priority
                                            </label>
                                            <select
                                                value={triagePriority}
                                                onChange={(e) => setTriagePriority(e.target.value)}
                                                className="gov-input w-full text-xs"
                                            >
                                                <option value="low">Low (14 Days)</option>
                                                <option value="medium">Medium (7 Days)</option>
                                                <option value="high">High (72 Hours)</option>
                                                <option value="critical">Critical (24 Hours)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold uppercase text-gray-600 block mb-1">
                                            Mandatory Reason for Override <span className="text-red-500">*</span>
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
                                        className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-2"
                                    >
                                        {triageSubmitting && <Loader2 size={12} className="animate-spin" />}
                                        Submit Official Triage Override
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Officer Resolution Workspace */}
                    <div className="gov-section border-t-4 border-t-(--india-green)">
                        <div className="gov-section-header bg-green-50/50">
                            <span className="gov-section-title flex items-center gap-2 text-green-950 font-bold">
                                <CheckCircle size={14} className="text-green-700" />
                                Officer Resolution Workspace / निवारण कार्यवाई
                            </span>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Officer Remarks */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Official Action Taken Report (ATR) Notes <span className="text-red-500">*</span>
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
                                        className="px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition"
                                    >
                                        ✨ Auto-Draft Official ATR with AI
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
                                        className="text-[11px] bg-gray-100 hover:bg-gray-200 border border-gray-300 px-2.5 py-1 rounded text-gray-700 font-medium transition"
                                    >
                                        Template: Inspection & Completed
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRemarks('Maintenance crew dispatched. Defect rectified in compliance with municipal safety standards.')}
                                        className="text-[11px] bg-gray-100 hover:bg-gray-200 border border-gray-300 px-2.5 py-1 rounded text-gray-700 font-medium transition"
                                    >
                                        Template: Maintenance Rectification
                                    </button>
                                </div>
                            </div>

                            {/* Resolution Proof Upload */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Resolution Proof Photographs (Upload On-Site Photos)
                                </label>
                                <div className="border-2 border-dashed border-gray-300 rounded p-5 hover:bg-gray-50 transition cursor-pointer text-center">
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        multiple
                                        onChange={handleProofUpload}
                                        className="hidden"
                                        id="proof-upload"
                                    />
                                    <label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center">
                                        <Upload className="text-gray-400 mb-1.5" size={32} />
                                        <span className="text-xs font-bold text-(--navy)">Attach On-Site Proof Images</span>
                                        <span className="text-[10px] text-gray-400 mt-0.5">JPG, PNG, WEBP up to 5MB each (max {MAX_PROOF_FILES} files)</span>
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
                                                    className="w-20 h-20 object-cover rounded border border-green-300 shadow-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeProof(idx)}
                                                    className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow hover:bg-red-700 transition"
                                                    title="Remove image"
                                                >
                                                    <X size={12} />
                                                </button>
                                                <span className="absolute bottom-0 left-0 right-0 bg-green-700 text-white text-[9px] text-center rounded-b truncate px-1 font-semibold">
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
                            <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => handleStatusUpdate('in_progress')}
                                    className="text-xs font-bold text-gray-600 hover:text-gray-900 underline transition"
                                >
                                    Save Progress / प्रगति दर्ज करें
                                </button>
                                <button
                                    onClick={handleResolve}
                                    disabled={submitting || !remarks.trim()}
                                    className="btn-gov-primary flex items-center gap-2 text-xs py-2 px-6"
                                    style={{ background: 'var(--india-green)', borderColor: 'var(--india-green)' }}
                                >
                                    {submitting ? (
                                        <Loader2 className="animate-spin" size={16} />
                                    ) : (
                                        <CheckCircle size={16} />
                                    )}
                                    <span>Certify Resolved / समाधानित प्रमाणित करें</span>
                                </button>
                            </div>

                            {['resolved', 'closed'].includes(String(complaint.status || '').toLowerCase()) && (
                                <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-900">
                                                Resolve verified linked complaints
                                            </h3>
                                            <p className="mt-1 text-xs text-cyan-800">
                                                Apply this resolution to semantically matching complaints in the same ward or nearby area.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSwarmResolve}
                                            disabled={swarmSubmitting}
                                            className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                                        >
                                            {swarmSubmitting ? 'Checking linked complaints…' : 'Resolve linked complaints'}
                                        </button>
                                    </div>
                                    {swarmResult && (
                                        <p className="mt-3 text-xs font-medium text-emerald-800" role="status">
                                            {swarmResult.message}
                                            {swarmResult.cascaded_complaint_numbers?.length > 0 && (
                                                <span className="mt-1 block">
                                                    Resolved: {swarmResult.cascaded_complaint_numbers.join(', ')}
                                                </span>
                                            )}
                                        </p>
                                    )}
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
                                <Activity size={13} /> Administrative Status
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-500 block mb-1">
                                    Current Stage
                                </label>
                                <select
                                    value={status}
                                    onChange={(e) => handleStatusUpdate(e.target.value)}
                                    className="gov-input w-full text-xs font-semibold py-1.5"
                                >
                                    {STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>

                            {slaHealth !== null && (
                                <div className="pt-2">
                                    <div className="flex justify-between text-[11px] mb-1">
                                        <span className="text-gray-500 font-semibold">SLA Time Remaining</span>
                                        <span className="font-bold text-(--navy)">{slaHealth}%</span>
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
                                <User size={13} /> Citizen Profile / प्रार्थी विवरण
                            </span>
                        </div>
                        <div className="p-4 space-y-3 text-xs">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gray-100 border border-gray-300 rounded-full flex items-center justify-center font-bold text-gray-700">
                                    {complaint.user?.name?.charAt(0) || 'C'}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-900">{complaint.user?.name || 'Citizen'}</p>
                                    <p className="text-[10px] text-gray-400">Verified Citizen Account</p>
                                </div>
                            </div>
                            <div className="space-y-1.5 pt-2 border-t border-gray-100 text-gray-600">
                                <div className="flex items-center gap-2">
                                    <Mail size={13} className="text-gray-400" />
                                    <span className="truncate">{complaint.user?.email || 'Not provided'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Phone size={13} className="text-gray-400" />
                                    <span>{complaint.user?.phone || 'Not provided'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Activity Log */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-1.5">
                                <Clock size={13} /> Official Action Audit Trail
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {history.map((log, idx) => (
                                <div key={log.id || idx} className="flex gap-2.5 text-xs">
                                    <div className="w-2 h-2 mt-1.5 rounded-full bg-(--navy) shrink-0" />
                                    <div>
                                        <p className="font-semibold text-gray-900">
                                            Stage: <Badge status={log.to_status} size="small" />
                                        </p>
                                        {log.remarks && <p className="text-gray-600 text-[11px] mt-0.5">{log.remarks}</p>}
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            {new Date(log.created_at).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {history.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-2">No preceding action logged.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
