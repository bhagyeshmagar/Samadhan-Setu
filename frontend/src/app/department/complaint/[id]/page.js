'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { departmentAPI, complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import {
    MapPin, Clock, User, Phone, Mail, FileText, Upload, CheckCircle,
    AlertTriangle, ArrowLeft, Loader2, ImagePlus, X, MessageSquare,
    Calendar, Activity, ChevronRight, ShieldCheck, CheckCircle2
} from 'lucide-react';

export default function HandleComplaint() {
    const params = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const [complaint, setComplaint] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Form state
    const [remarks, setRemarks] = useState('');
    const [status, setStatus] = useState('');
    const [proofImages, setProofImages] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Helper to get correct image URL
    const getImageUrl = (img) => {
        if (!img) return '';
        if (typeof img === 'string') {
            if (img.startsWith('http')) return img;
            return `http://127.0.0.1:8000${img}`;
        }
        if (img.path) return `http://127.0.0.1:8000${img.path}`;
        return '';
    };

    const complaintId = params?.id;

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user && complaintId) {
            fetchComplaint();
        }
    }, [user, complaintId]);

    const fetchComplaint = async () => {
        try {
            const data = await complaintsAPI.getById(complaintId);
            setComplaint(data);
            setStatus(data.status);
        } catch (err) {
            setError('Failed to load complaint data');
        } finally {
            setLoading(false);
        }
    };

    const handleProofUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length + proofImages.length > 5) {
            setError('Maximum 5 proof images allowed');
            return;
        }

        files.forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                setError('Each file must be less than 10MB');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                setProofImages(prev => [...prev, { url: e.target.result, file, name: file.name }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeProof = (index) => {
        setProofImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleResolve = async () => {
        if (!remarks.trim()) {
            setError('Official resolution remarks are required by administrative policy.');
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            await departmentAPI.updateStatus(complaintId, {
                status: 'Resolved',
                remarks: remarks
            });

            setSuccess(true);
            setTimeout(() => {
                router.push('/department');
            }, 2000);
        } catch (err) {
            setError(err.message || 'Failed to update resolution status');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusUpdate = async (newStatus) => {
        try {
            await departmentAPI.updateStatus(complaintId, {
                status: newStatus === 'IN_PROGRESS' ? 'In Progress' : newStatus,
                remarks: `Status updated to ${newStatus}`
            });
            setStatus(newStatus);
            fetchComplaint();
        } catch (err) {
            setError('Failed to update status');
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] flex-col gap-3">
                <Loader2 className="animate-spin text-[var(--navy)]" size={36} />
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

                {/* SLA Timer */}
                {complaint.deadline && (() => {
                    const now = new Date();
                    const deadline = new Date(complaint.deadline);
                    const diff = deadline - now;
                    const isOverdue = diff < 0;
                    const absDiff = Math.abs(diff);
                    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const timeText = `${days.toString().padStart(2, '0')}d : ${hours.toString().padStart(2, '0')}h`;

                    return (
                        <div className={`flex items-center gap-3 px-4 py-2.5 rounded border ${
                            isOverdue 
                                ? 'bg-red-50 border-red-300 text-red-900' 
                                : 'bg-blue-50 border-blue-200 text-blue-900'
                        }`}>
                            <Clock className={isOverdue ? 'text-red-600 animate-pulse' : 'text-blue-700'} size={20} />
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider">
                                    {isOverdue ? 'SLA OVERDUE / समय सीमा समाप्त' : 'Statutory SLA Deadline'}
                                </p>
                                <p className="text-base font-bold font-mono leading-none mt-0.5">
                                    {isOverdue ? `-${timeText}` : timeText}
                                </p>
                            </div>
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Complaint Details Card */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2">
                                <FileText size={14} /> Registered Grievance Particulars
                            </span>
                            <div className="flex items-center gap-2">
                                <Badge status={complaint.status} />
                                {complaint.priority && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                        complaint.priority === 'HIGH' ? 'bg-red-100 text-red-800' :
                                        complaint.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-800' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        AI Priority: {complaint.priority}
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
                                    <MapPin className="text-[var(--navy)] mt-0.5 flex-shrink-0" size={16} />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-bold uppercase text-gray-500">Location / Ward</p>
                                        <p className="text-xs font-semibold text-gray-900 truncate">{complaint.location || 'Not Specified'}</p>
                                        {complaint.ward && <p className="text-[11px] text-gray-500">Ward: {complaint.ward}</p>}
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 p-3 rounded border border-gray-200 bg-white">
                                    <Calendar className="text-[var(--navy)] mt-0.5 flex-shrink-0" size={16} />
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
                                        <ImagePlus size={14} className="text-[var(--navy)]" /> Citizen Submitted Photographic Evidence ({complaint.attachments.length})
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
                                                <img
                                                    src={getImageUrl(img)}
                                                    alt={`Evidence ${idx + 1}`}
                                                    className="w-28 h-28 object-cover rounded border border-gray-300 hover:border-[var(--navy)] shadow-sm transition hover:scale-105"
                                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/128?text=Evidence'; }}
                                                />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Officer Resolution Workspace */}
                    <div className="gov-section border-t-4 border-t-[var(--india-green)]">
                        <div className="gov-section-header bg-green-50/50">
                            <span className="gov-section-title flex items-center gap-2 text-green-950 font-bold">
                                <CheckCircle size={14} className="text-green-700" />
                                Officer Resolution Workspace / निवारण कार्यवाई
                            </span>
                        </div>

                        <div className="p-5 space-y-4">
                            {/* Officer Remarks */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Official Redressal Remarks / कार्यवाई विवरण <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={remarks}
                                    onChange={(e) => setRemarks(e.target.value)}
                                    className="gov-input w-full resize-none p-3 text-xs"
                                    placeholder="Enter detailed report on repairs conducted, materials utilized, and on-site resolution verification..."
                                    rows="4"
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
                                        accept="image/*"
                                        multiple
                                        onChange={handleProofUpload}
                                        className="hidden"
                                        id="proof-upload"
                                    />
                                    <label htmlFor="proof-upload" className="cursor-pointer flex flex-col items-center">
                                        <Upload className="text-gray-400 mb-1.5" size={32} />
                                        <span className="text-xs font-bold text-[var(--navy)]">Attach On-Site Proof Images</span>
                                        <span className="text-[10px] text-gray-400 mt-0.5">PNG, JPG up to 10MB each (max 5 files)</span>
                                    </label>
                                </div>

                                {proofImages.length > 0 && (
                                    <div className="flex gap-2.5 mt-3 flex-wrap">
                                        {proofImages.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                                <img
                                                    src={img.url}
                                                    alt={`Proof ${idx + 1}`}
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
                                    onClick={() => handleStatusUpdate('IN_PROGRESS')}
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
                                    <option value="Pending">Pending / प्रतीक्षारत</option>
                                    <option value="Assigned">Assigned / स्वीकृत</option>
                                    <option value="In Progress">In Progress / प्रगति पर</option>
                                    <option value="Resolved">Resolved / समाधानित</option>
                                    <option value="Rejected">Rejected / निरस्त</option>
                                </select>
                            </div>

                            <div className="pt-2">
                                <div className="flex justify-between text-[11px] mb-1">
                                    <span className="text-gray-500 font-semibold">SLA Health</span>
                                    <span className="font-bold text-[var(--navy)]">75%</span>
                                </div>
                                <div className="priority-bar">
                                    <div className="priority-bar-fill" style={{ width: '75%', background: 'var(--india-green)' }} />
                                </div>
                            </div>
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
                            {complaint.status_logs?.slice(-4).reverse().map((log, idx) => (
                                <div key={idx} className="flex gap-2.5 text-xs">
                                    <div className="w-2 h-2 mt-1.5 rounded-full bg-[var(--navy)] flex-shrink-0" />
                                    <div>
                                        <p className="font-semibold text-gray-900">
                                            Stage: <Badge status={log.status} size="small" />
                                        </p>
                                        {log.remarks && <p className="text-gray-600 text-[11px] mt-0.5">{log.remarks}</p>}
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                            {new Date(log.created_at).toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                            {(!complaint.status_logs || complaint.status_logs.length === 0) && (
                                <p className="text-xs text-gray-400 text-center py-2">No preceding action logged.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
