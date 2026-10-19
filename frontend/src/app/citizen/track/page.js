'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI, aiAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { MapPin, Loader2, ArrowRight, ExternalLink, Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, ListTodo, Brain, Link2, BarChart3, Search } from 'lucide-react';

const STATUS_ORDER = ['Submitted', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Closed'];

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

    const handleFeedbackSubmit = async (id) => {
        if (!feedbackForm[id]?.rating) return;
        setFeedbackLoading(true);
        try {
            await complaintsAPI.submitFeedback(id, {
                rating: feedbackForm[id].rating,
                feedback_text: feedbackForm[id].text || ''
            });
            fetchComplaints(); // refresh the list
            setFeedbackForm(prev => ({ ...prev, [id]: { ...prev[id], submitted: true } }));
        } catch (err) {
            console.error('Feedback error:', err);
            alert('Failed to submit feedback.');
        } finally {
            setFeedbackLoading(false);
        }
    };

    const getImageUrl = (img) => {
        if (!img) return '';
        if (typeof img === 'string') {
            if (img.startsWith('http')) return img;
            return `http://127.0.0.1:8000${img}`;
        }
        if (img?.path) return `http://127.0.0.1:8000${img.path}`;
        return '';
    };

    const getStatusIndex = (status) => {
        const idx = STATUS_ORDER.indexOf(status);
        return idx >= 0 ? idx : 0;
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
                        <a href="/">Home</a>
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
                        const statusIdx = getStatusIndex(complaint.status);
                        const isTerminal = ['Resolved', 'Closed'].includes(complaint.status);
                        const isReopened = complaint.status === 'Reopened';
                        const isAppealed = complaint.status === 'Appealed';

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
                                                <span className={`badge badge-${
                                                    complaint.status === 'Resolved' || complaint.status === 'Closed' ? 'resolved' :
                                                    complaint.status === 'In Progress' || complaint.status === 'Assigned' ? 'progress' :
                                                    complaint.status === 'Appealed' ? 'appealed' : 'submitted'
                                                }`}>
                                                    <span className="badge-dot" />{complaint.status}
                                                </span>
                                                <span className={`badge ${
                                                    complaint.priority === 'High'   ? 'badge-critical' :
                                                    complaint.priority === 'Medium' ? 'badge-progress'  : 'badge-closed'
                                                }`}>
                                                    {complaint.priority}
                                                </span>
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
                                                            {detail.tasks.map((task, idx) => (
                                                                <div key={idx} className="relative overflow-hidden rounded-lg"
                                                                    style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${
                                                                        task.status === 'Completed' ? 'var(--india-green)' :
                                                                        task.status === 'In Progress' ? 'var(--navy)' :
                                                                        task.status === 'Rejected'   ? 'var(--status-critical)' : 'var(--border-mid)'
                                                                    }` }}>
                                                                    <div className="flex items-center justify-between p-3">
                                                                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                            {task.department_name || 'Department'}
                                                                        </span>
                                                                        <span className={`badge ${
                                                                            task.status === 'Completed'  ? 'badge-resolved' :
                                                                            task.status === 'In Progress'? 'badge-progress' :
                                                                            task.status === 'Rejected'   ? 'badge-critical' : 'badge-submitted'
                                                                        }`}>{task.status}</span>
                                                                    </div>
                                                                    {task.notes && <p className="text-xs px-3 pb-3" style={{ color: 'var(--text-secondary)' }}>{task.notes}</p>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-medium text-theme-muted">Awaiting departmental assignment.</p>
                                                    )}
                                                </div>

                                                {/* Attachments */}
                                                {complaint.attachments && complaint.attachments.length > 0 && (
                                                    <div className="gov-card p-5">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--navy)' }}>Evidence Uploaded</h4>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {complaint.attachments.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-gray-200 dark:border-theme hover:border-primary transition-all shadow-sm">
                                                                    <img src={getImageUrl(img)} alt="Evidence" className="w-20 h-20 object-cover hover:scale-105 transition-transform" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Resolution & Feedback */}
                                                {isTerminal && complaint.resolution_remarks && (
                                                    <div className="space-y-3">
                                                        <div className="gov-alert success">
                                                            <CheckCircle size={14} />
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-wider mb-1">Resolution Summary</p>
                                                                <p className="text-sm leading-relaxed">{complaint.resolution_remarks}</p>
                                                            </div>
                                                        </div>

                                                        {/* Feedback Form */}
                                                        {complaint.citizen_rating ? (
                                                            <div className="gov-card p-4">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                                                    Citizen Satisfaction Rating
                                                                </p>
                                                                <div className="flex items-center gap-1 mb-3 text-xl">
                                                                    {[1, 2, 3, 4, 5].map(star => (
                                                                        <span key={star} className={star <= complaint.citizen_rating ? 'text-amber-400' : 'text-gray-200 dark:text-gray-700'}>★</span>
                                                                    ))}
                                                                </div>
                                                                {complaint.feedback_text && <p className="text-sm font-medium text-theme-secondary italic bg-gray-50 dark:bg-theme-tertiary p-3 rounded-lg">"{complaint.feedback_text}"</p>}
                                                            </div>
                                                        ) : feedbackForm[complaint.id]?.submitted ? (
                                                            <div className="gov-alert success text-sm">
                                                                <CheckCircle size={16} />
                                                                Thank you for verifying the resolution!
                                                            </div>
                                                        ) : (
                                                            <div className="gov-card p-4">
                                                                <h4 className="text-[10px] uppercase tracking-widest font-bold mb-3" style={{ color: 'var(--navy)' }}>Verify & Rate Resolution</h4>
                                                                <div className="flex gap-2 mb-4 text-3xl cursor-pointer justify-center">
                                                                    {[1, 2, 3, 4, 5].map(star => (
                                                                        <span 
                                                                            key={star} 
                                                                            onClick={() => setFeedbackForm(prev => ({ ...prev, [complaint.id]: { ...prev[complaint.id], rating: star } }))}
                                                                            className={(feedbackForm[complaint.id]?.rating || 0) >= star ? 'text-amber-400 hover:scale-110 transition-transform drop-shadow-sm' : 'text-gray-200 hover:text-amber-200 hover:scale-110 transition-transform'}
                                                                        >
                                                                            ★
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <textarea
                                                                    placeholder="Optional: describe your experience…"
                                                                    className="gov-input resize-none mb-3"
                                                                    rows={3}
                                                                    value={feedbackForm[complaint.id]?.text || ''}
                                                                    onChange={e => setFeedbackForm(prev => ({ ...prev, [complaint.id]: { ...prev[complaint.id], text: e.target.value } }))}
                                                                />
                                                                <button
                                                                    onClick={() => handleFeedbackSubmit(complaint.id)}
                                                                    disabled={!feedbackForm[complaint.id]?.rating || feedbackLoading}
                                                                    className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-50"
                                                                >
                                                                    {feedbackLoading ? <Loader2 size={14} className="animate-spin" /> : 'Submit Feedback'}
                                                                </button>
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
