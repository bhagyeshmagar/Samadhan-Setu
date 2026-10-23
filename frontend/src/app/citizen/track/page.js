'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { complaintsAPI, aiAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import { MapPin, Loader2, ArrowRight, ExternalLink, Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ListTodo, Brain, Link2, BarChart3, Search, Camera } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
const getImageUrl = (img) => {
    const raw = typeof img === 'string' ? img : img?.path || img?.url;
    if (!raw) return '';
    if (raw.startsWith('http')) return raw;
    if (raw.startsWith('/uploads/')) return `${API_BASE}${raw}`;
    return `${API_BASE}/uploads/${raw.replace(/^\//, '')}`;
};

const STATUS_ORDER = ['submitted', 'verified', 'assigned', 'in_progress', 'resolved', 'closed'];
const STATUS_LABELS = {
    'submitted': 'Submitted',
    'verified': 'Verified',
    'assigned': 'Assigned',
    'in_progress': 'In Progress',
    'resolved': 'Resolved',
    'closed': 'Closed',
    'reopened': 'Reopened',
    'escalated': 'Escalated',
    'rejected': 'Rejected',
    'appealed': 'Appealed'
};

const getStatusIndex = (status) => {
    if (!status) return 0;
    const clean = status.toLowerCase().replace(/\s+/g, '_');
    const idx = STATUS_ORDER.indexOf(clean);
    return idx >= 0 ? idx : 0;
};

export default function TrackGrievance() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [detailData, setDetailData] = useState({});
    const [aiData, setAiData] = useState({});
    const [feedbackForm, setFeedbackForm] = useState({});
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [appealReasons, setAppealReasons] = useState({});
    const [showAppealBoxes, setShowAppealBoxes] = useState({});
    const [appealLoading, setAppealLoading] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) fetchComplaints();
    }, [user]);

    const fetchComplaints = async () => {
        try {
            const data = await complaintsAPI.getMy();
            const sorted = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setComplaints(sorted);
        } catch (err) {
            setError(err.message || 'Failed to fetch complaints');
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = async (id) => {
        if (expandedId === id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(id);
        if (!detailData[id]) {
            try {
                const detail = await complaintsAPI.getById(id);
                setDetailData(prev => ({ ...prev, [id]: detail }));
            } catch (err) {
                console.error('Failed to load detail:', err);
            }
        }
        // Fetch AI analysis (non-blocking)
        if (!aiData[id]) {
            aiAPI.getSummary(id).then(data => {
                if (data && data.pipeline_status !== 'not_run') {
                    setAiData(prev => ({ ...prev, [id]: data }));
                }
            }).catch(() => {});
        }
    };

    const handleFeedbackSubmit = async (id, satisfied = true) => {
        const rating = feedbackForm[id]?.rating || (satisfied ? 5 : 1);
        setFeedbackLoading(true);
        try {
            await complaintsAPI.submitFeedback(id, {
                rating: rating,
                feedback_text: feedbackForm[id]?.text || (satisfied ? 'Citizen confirmed resolution.' : 'Unsatisfied with resolution.'),
                satisfied: satisfied,
            });
            fetchComplaints(); // refresh the list
            setFeedbackForm(prev => ({ ...prev, [id]: { ...prev[id], submitted: true } }));
        } catch (err) {
            console.error('Feedback error:', err);
            alert(err.message || 'Failed to submit feedback.');
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleAppealSubmit = async (id) => {
        const reason = (appealReasons[id] || '').trim();
        if (reason.length < 10) {
            alert('Please provide a clear appeal reason (at least 10 characters).');
            return;
        }
        setAppealLoading(true);
        try {
            await complaintsAPI.appealComplaint(id, reason);
            setShowAppealBoxes(prev => ({ ...prev, [id]: false }));
            setAppealReasons(prev => ({ ...prev, [id]: '' }));
            fetchComplaints();
        } catch (err) {
            console.error('Appeal error:', err);
            alert(err.message || 'Failed to file appeal.');
        } finally {
            setAppealLoading(false);
        }
    };

    const getImageUrl = (img) => {
        if (!img) return '';
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
        const raw = typeof img === 'string' ? img : (img?.s3_key || img?.path || img?.url || '');
        if (!raw) return '';
        if (raw.startsWith('http')) return raw;
        if (raw.startsWith('/uploads/')) return `${apiBase}${raw}`;
        return `${apiBase}/uploads/${raw.replace(/^\//, '')}`;
    };

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading your grievances…</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-6">
            {/* Page Header */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="breadcrumb mb-2">
                        <Link href="/">Home</Link>
                        <ChevronDown size={10} className="breadcrumb-sep -rotate-90" />
                        <span className="breadcrumb-current">My Grievances</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>My Grievances</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        मेरी शिकायतें &nbsp;|&nbsp; {complaints.length} total complaint{complaints.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button onClick={fetchComplaints} className="btn-outline flex items-center gap-2 text-sm">
                    <Loader2 size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && (
                <div className="gov-alert error mb-6">
                    <AlertTriangle size={15} />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {complaints.length === 0 ? (
                <div className="gov-card p-16 text-center" style={{ borderTop: '3px solid var(--saffron)' }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ background: 'var(--navy-light)' }}>
                        <Search size={22} style={{ color: 'var(--navy)' }} />
                    </div>
                    <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No grievances filed yet</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>अभी तक कोई शिकायत दर्ज नहीं की गई</p>
                    <a href="/citizen/lodge" className="btn-primary inline-flex">
                        File a Grievance <ArrowRight size={15} />
                    </a>
                </div>
            ) : (
                <div className="space-y-6">
                    {complaints.map((complaint) => {
                        const isExpanded = expandedId === complaint.id;
                        const detail = detailData[complaint.id];
                        const sNorm = (complaint.status || '').toLowerCase().replace(/\s+/g, '_');
                        const pNorm = (complaint.priority || '').toLowerCase();
                        const statusIdx = getStatusIndex(complaint.status);
                        const isTerminal = ['resolved', 'closed'].includes(sNorm);
                        const isReopened = sNorm === 'reopened';
                        const isAppealed = sNorm === 'appealed' || sNorm === 'escalated';

                        const statusBadge = ['resolved', 'closed'].includes(sNorm) ? 'resolved' :
                            ['in_progress', 'assigned'].includes(sNorm) ? 'progress' :
                            ['appealed', 'escalated'].includes(sNorm) ? 'appealed' : 'submitted';

                        const priorityBadge = ['high', 'critical'].includes(pNorm) ? 'badge-critical' :
                            pNorm === 'medium' ? 'badge-progress' : 'badge-closed';

                        return (
                            <div key={complaint.id} className="gov-section" style={{ marginBottom: 0 }}>
                                {/* Summary Row */}
                                <div
                                    className="p-5 cursor-pointer transition-colors"
                                    style={{ background: isExpanded ? 'var(--navy-xlight)' : undefined }}
                                    onClick={() => toggleExpand(complaint.id)}
                                    onMouseEnter={e => !isExpanded && (e.currentTarget.style.background = 'var(--bg-section)')}
                                    onMouseLeave={e => !isExpanded && (e.currentTarget.style.background = '')}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded"
                                                    style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                                                    #{complaint.id?.substring(0, 8).toUpperCase()}
                                                </span>
                                                <span className={`badge badge-${statusBadge}`}>
                                                    <span className="badge-dot" />{STATUS_LABELS[sNorm] || complaint.status}
                                                </span>
                                                <span className={`badge ${priorityBadge} capitalize`}>
                                                    {complaint.priority}
                                                </span>
                                                <DeadlineTimer
                                                    deadline={complaint.deadline}
                                                    createdAt={complaint.created_at}
                                                    priority={complaint.priority}
                                                    status={complaint.status}
                                                    resolvedAt={complaint.resolved_at}
                                                    compact={true}
                                                />
                                            </div>
                                            <h3 className="text-base font-bold mb-1 truncate" style={{ color: 'var(--navy)' }}>
                                                {complaint.title || complaint.category}
                                            </h3>
                                            <p className="text-sm truncate pr-8" style={{ color: 'var(--text-secondary)' }}>
                                                {complaint.description?.substring(0, 120)}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                <span className="flex items-center gap-1.5"><MapPin size={12} style={{ color: 'var(--navy)' }} /> {complaint.location}</span>
                                                <span className="flex items-center gap-1.5"><Clock size={12} style={{ color: 'var(--navy)' }} /> {new Date(complaint.created_at).toLocaleDateString('en-IN')}</span>
                                            </div>
                                        </div>
                                        <div className="p-1.5 rounded-lg shrink-0"
                                            style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </div>

                                    {/* Status Progress Bar */}
                                    <div className="mt-4 flex items-center gap-0.5">
                                        {STATUS_ORDER.map((step, idx) => (
                                            <div key={step} className="flex-1 h-1.5 rounded-full transition-all duration-500"
                                                style={{ background: idx <= statusIdx ? 'var(--navy)' : 'var(--border)' }} />
                                        ))}
                                    </div>
                                    <div className="flex justify-between mt-1.5 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>
                                        <span>Submitted</span>
                                        <span>Resolved</span>
                                    </div>
                                </div>

                                {/* Expanded Detail */}
                                {isExpanded && (
                                    <div className="border-t p-5" style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}>
                                        {/* Statutory SLA Countdown Timer */}
                                        <div className="gov-card p-4 mb-4" style={{ background: 'var(--bg-card)' }}>
                                            <DeadlineTimer
                                                deadline={complaint.deadline}
                                                createdAt={complaint.created_at}
                                                priority={complaint.priority}
                                                status={complaint.status}
                                                resolvedAt={complaint.resolved_at}
                                                showProgressBar={true}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                            {/* Left Column: Timeline & Analysis */}
                                            <div className="space-y-4">
                                                {/* Status Timeline */}
                                                <div className="gov-card p-5">
                                                    <h4 className="text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2"
                                                        style={{ color: 'var(--navy)' }}>
                                                        <Clock size={12} /> Audit Trail — गतिविधि लॉग
                                                    </h4>

                                                    {detail?.status_history && detail.status_history.length > 0 ? (
                                                        <div className="timeline">
                                                            {detail.status_history.map((log, idx) => (
                                                                <div key={idx} className="timeline-item">
                                                                    <div className={`timeline-dot ${
                                                                        idx === detail.status_history.length - 1 ? 'active' : 'done'
                                                                    }`} />
                                                                    <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                                                                        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--navy)' }}>
                                                                            {log.to_status}
                                                                        </p>
                                                                        {log.remarks && (
                                                                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{log.remarks}</p>
                                                                        )}
                                                                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                                                                            {new Date(log.created_at).toLocaleString('en-IN')}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-sm font-medium text-theme-muted">
                                                            <Loader2 className="animate-spin" size={16} /> Fetching timeline...
                                                        </div>
                                                    )}

                                                    {(isReopened || isAppealed) && (
                                                        <div className="gov-alert warning mt-3">
                                                            <AlertTriangle size={14} />
                                                            <span className="text-sm">
                                                                {isReopened ? 'This grievance was reopened for further review.' : 'This grievance is under appeal review.'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* AI Insights Panel */}
                                                {aiData[complaint.id] && (
                                                    <div className="gov-card p-5">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2"
                                                            style={{ color: 'var(--navy)' }}>
                                                            <Brain size={12} /> AI Verification
                                                        </h4>
                                                        <div className="space-y-4">
                                                            {aiData[complaint.id].text_analysis && (
                                                                <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--navy-xlight)', border: '1px solid var(--border)' }}>
                                                                    <div className="flex justify-between items-center mb-2">
                                                                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Category</span>
                                                                        <span className="badge badge-submitted">
                                                                            {aiData[complaint.id].text_analysis.category}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex gap-2">
                                                                        <span className="badge badge-closed">
                                                                            Urgency: {aiData[complaint.id].text_analysis.urgency_level}
                                                                        </span>
                                                                        <span className="badge badge-closed">
                                                                            Severity: {aiData[complaint.id].text_analysis.severity_level}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {aiData[complaint.id].priority?.score && (
                                                                <div className="p-3 rounded-lg flex justify-between items-center"
                                                                    style={{ background: 'var(--navy-light)', border: '1px solid rgba(0,53,128,0.2)' }}>
                                                                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--navy)' }}>
                                                                        <BarChart3 size={12} /> Escalation Score
                                                                    </span>
                                                                    <span className="text-sm font-bold" style={{ color: 'var(--navy)' }}>
                                                                        {aiData[complaint.id].priority.score.toFixed(2)} → {aiData[complaint.id].priority.priority}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right Column: Actions & Tasks */}
                                            <div className="space-y-4">
                                                <div className="gov-card p-5">
                                                    <h4 className="text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2"
                                                        style={{ color: 'var(--navy)' }}>
                                                        <ListTodo size={12} /> Assigned Actions
                                                    </h4>

                                                    {detail?.tasks && detail.tasks.length > 0 ? (
                                                        <div className="space-y-4">
                                                            {detail.tasks.map((task, idx) => {
                                                                const tStatus = (task.status || '').toLowerCase().replace(/\s+/g, '_');
                                                                const isDone = ['completed', 'resolved', 'closed'].includes(tStatus);
                                                                const isProg = ['in_progress', 'assigned', 'active'].includes(tStatus);
                                                                const isRej = ['rejected', 'cancelled'].includes(tStatus);
                                                                const borderColor = isDone ? 'var(--india-green)' : isProg ? 'var(--navy)' : isRej ? 'var(--status-critical)' : 'var(--border-mid)';
                                                                const badgeClass = isDone ? 'badge-resolved' : isProg ? 'badge-progress' : isRej ? 'badge-critical' : 'badge-submitted';
                                                                return (
                                                                <div key={idx} className="relative overflow-hidden rounded-lg"
                                                                    style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}` }}>
                                                                    <div className="flex items-center justify-between p-3">
                                                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                            {task.department_name || 'Department'}
                                                                        </span>
                                                                        <span className={`badge ${badgeClass} capitalize`}>{STATUS_LABELS[tStatus] || task.status}</span>
                                                                    </div>
                                                                    {task.notes && <p className="text-xs px-3 pb-3" style={{ color: 'var(--text-secondary)' }}>{task.notes}</p>}
                                                                </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-medium text-theme-muted">Awaiting departmental assignment.</p>
                                                    )}
                                                </div>

                                                {/* Attachments */}
                                                {complaint.attachments && complaint.attachments.length > 0 && (
                                                    <div className="gov-card p-5">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--navy)' }}>Evidence Uploaded by You / संलग्न प्रमाण</h4>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {complaint.attachments.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gray-200 dark:border-theme hover:border-primary transition-all shadow-sm">
                                                                    <img src={getImageUrl(img)} alt="Evidence" className="w-20 h-20 object-cover hover:scale-105 transition-transform" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Official Resolution Proofs uploaded by Officer */}
                                                {complaint.resolution_proof && complaint.resolution_proof.length > 0 && (
                                                    <div className="gov-card p-5 border border-emerald-300 bg-emerald-50/30">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-1.5 text-emerald-800">
                                                            <CheckCircle size={12} className="text-emerald-600" />
                                                            Officer Field Redressal Proof / समाधान प्रमाण
                                                        </h4>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {complaint.resolution_proof.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-emerald-300 shadow-sm hover:scale-105 transition-transform">
                                                                    <img src={getImageUrl(img)} alt="Resolution Proof" className="w-20 h-20 object-cover" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Samadhan Setu Action Taken Report (ATR) & Citizen Satisfaction Gate */}
                                                {['resolved'].includes(sNorm) && (
                                                    <div className="mt-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                                                Action Taken Report (ATR) Filed by Department
                                                            </span>
                                                            <span className="text-[11px] text-gray-500">Auto-closes in 7 days if no reply</span>
                                                        </div>
                                                        <p className="text-sm text-gray-800 dark:text-gray-200 mb-3">
                                                            {complaint.resolution_remarks || complaint.resolution_notes || 'Field inspection completed and resolution proof uploaded by the nodal team.'}
                                                        </p>

                                                        {/* Optional Rating stars before deciding */}
                                                        <div className="mb-3">
                                                            <span className="text-xs text-gray-600 block mb-1">Rate the resolution quality:</span>
                                                            <div className="flex gap-1.5 text-2xl cursor-pointer">
                                                                {[1, 2, 3, 4, 5].map(star => (
                                                                    <span 
                                                                        key={star} 
                                                                        onClick={() => setFeedbackForm(prev => ({ ...prev, [complaint.id]: { ...prev[complaint.id], rating: star } }))}
                                                                        className={(feedbackForm[complaint.id]?.rating || 0) >= star ? 'text-amber-400 hover:scale-110 transition-transform' : 'text-gray-300 hover:text-amber-200'}
                                                                    >
                                                                        ★
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-wrap gap-3 mt-3">
                                                            <button
                                                                onClick={() => handleFeedbackSubmit(complaint.id, true)}
                                                                disabled={feedbackLoading}
                                                                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2"
                                                            >
                                                                {feedbackLoading && <Loader2 size={12} className="animate-spin" />}
                                                                ✓ Satisfied — Close Grievance
                                                            </button>
                                                            <button
                                                                onClick={() => setShowAppealBoxes(prev => ({ ...prev, [complaint.id]: !prev[complaint.id] }))}
                                                                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
                                                            >
                                                                ✗ Not Satisfied — File Appeal (L1 / L2)
                                                            </button>
                                                        </div>

                                                        {showAppealBoxes[complaint.id] && (
                                                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                                                                <textarea
                                                                    value={appealReasons[complaint.id] || ''}
                                                                    onChange={(e) => setAppealReasons(prev => ({ ...prev, [complaint.id]: e.target.value }))}
                                                                    placeholder="Explain why the resolution is incomplete or unsatisfactory (routes to Nodal / Appellate Authority)..."
                                                                    className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-sm text-gray-900 dark:text-white"
                                                                    rows={3}
                                                                />
                                                                <button
                                                                    onClick={() => handleAppealSubmit(complaint.id)}
                                                                    disabled={appealLoading}
                                                                    className="mt-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2"
                                                                >
                                                                    {appealLoading && <Loader2 size={12} className="animate-spin" />}
                                                                    Submit Official Appeal
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Appeal Active Notice */}
                                                {sNorm === 'appealed' && (
                                                    <div className="mt-4 p-4 rounded-xl border border-rose-500/30 bg-rose-500/10">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <AlertTriangle size={15} className="text-rose-500" />
                                                            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                                                Samadhan Setu Appeal Under Review
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-rose-800 dark:text-rose-200">
                                                            Your grievance has been officially escalated to the Appellate Authority with an expedited SLA deadline for re-investigation.
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Resolution & Rating Display (when Closed) */}
                                                {sNorm === 'closed' && (
                                                    <div className="space-y-3 mt-4">
                                                        {complaint.citizen_rating && (
                                                            <div className="gov-card p-4">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                                                    Citizen Satisfaction Rating
                                                                </p>
                                                                <div className="flex items-center gap-1 mb-2 text-xl">
                                                                    {[1, 2, 3, 4, 5].map(star => (
                                                                        <span key={star} className={star <= complaint.citizen_rating ? 'text-amber-400' : 'text-gray-300'}>★</span>
                                                                    ))}
                                                                </div>
                                                                {complaint.feedback_text && (
                                                                    <p className="text-sm font-medium italic text-gray-700 bg-gray-50 p-2.5 rounded-lg">&quot;{complaint.feedback_text}&quot;</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
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
