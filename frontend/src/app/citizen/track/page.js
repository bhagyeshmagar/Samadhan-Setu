'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { complaintsAPI, aiAPI } from '@/lib/api';
import {
    computeDashboardSummaryFromComplaints,
    filterComplaintsBySummaryBucket,
} from '@/lib/dashboardSummary';
import DeadlineTimer from '@/components/DeadlineTimer';
import DashboardSummarySection from '@/components/DashboardSummarySection';
import {
    MapPin, Loader2, ArrowRight, Clock, CheckCircle, AlertTriangle,
    ChevronDown, ChevronUp, ListTodo, Brain, BarChart3, Search
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const getImageUrl = (img) => {
    if (!img) return '';
    const raw = typeof img === 'string' ? img : (img?.s3_key || img?.path || img?.url || '');
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/api/')) return `${API_BASE}${raw}`;
    if (raw.startsWith('/uploads/')) return `${API_BASE}${raw}`;
    return `${API_BASE}/api/media/${raw.replace(/^\//, '')}`;
};

const STATUS_ORDER = ['submitted', 'inspection', 'field_work', 'verification', 'resolved', 'closed'];

const getStatusIndex = (status) => {
    if (!status) return 0;
    const clean = status.toLowerCase().replace(/\s+/g, '_');
    if (clean === 'submitted' || clean === 'verified' || clean === 'assigned') return 0;
    if (['inspection_assigned', 'inspection_submitted', 'inspection_rework', 'inspection_verified'].includes(clean)) return 1;
    if (['team_assigned', 'work_in_progress', 'in_progress', 'redressal_rework', 'reopened'].includes(clean)) return 2;
    if (['resolution_submitted', 'verification_assigned', 'verification_submitted'].includes(clean)) return 3;
    if (clean === 'resolved' || clean.startsWith('appealed')) return 4;
    if (clean === 'closed') return 5;
    return 0;
};

export default function TrackGrievance() {
    const { user, loading: authLoading } = useAuth();
    const { t, tStatus, tPriority, tCategory, locale } = useLanguage();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionMessage, setActionMessage] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [detailData, setDetailData] = useState({});
    const [aiData, setAiData] = useState({});
    const [feedbackForm, setFeedbackForm] = useState({});
    const [feedbackLoading, setFeedbackLoading] = useState(false);
    const [appealReasons, setAppealReasons] = useState({});
    const [showAppealBoxes, setShowAppealBoxes] = useState({});
    const [appealLoading, setAppealLoading] = useState(false);
    const [summaryFilter, setSummaryFilter] = useState('all');

    const fetchComplaints = useCallback(async () => {
        try {
            setError('');
            const data = await complaintsAPI.getMy();
            const sorted = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setComplaints(sorted);
        } catch (err) {
            setError(err.message || 'Failed to fetch complaints');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
    }, [user, authLoading, router]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        async function loadInitial() {
            if (!cancelled) await fetchComplaints();
        }
        loadInitial();
        return () => {
            cancelled = true;
        };
    }, [user, fetchComplaints]);

    const summaryStats = useMemo(
        () => computeDashboardSummaryFromComplaints(complaints, user?.role || 'citizen'),
        [complaints, user?.role]
    );

    const visibleComplaints = useMemo(
        () => filterComplaintsBySummaryBucket(complaints, summaryFilter, user?.role || 'citizen'),
        [complaints, summaryFilter, user?.role]
    );

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
        if (!aiData[id]) {
            aiAPI.getSummary(id).then(data => {
                if (data && data.pipeline_status !== 'not_run') {
                    setAiData(prev => ({ ...prev, [id]: data }));
                }
            }).catch(() => {});
        }
    };

    const handleFeedbackSubmit = async (id, satisfied = true) => {
        const rating = feedbackForm[id]?.rating;
        if (!rating) {
            setActionMessage({ id, type: 'error', text: t('rate_resolution_quality') });
            return;
        }
        setFeedbackLoading(true);
        setActionMessage(null);
        try {
            await complaintsAPI.submitFeedback(id, {
                rating: rating,
                feedback_text: feedbackForm[id]?.text || (satisfied ? 'Citizen confirmed resolution.' : 'Unsatisfied with resolution.'),
                satisfied: satisfied,
            });
            fetchComplaints();
            setFeedbackForm(prev => ({ ...prev, [id]: { ...prev[id], submitted: true } }));
        } catch (err) {
            console.error('Feedback error:', err);
            setActionMessage({ id, type: 'error', text: err.message || 'Failed to submit feedback.' });
        } finally {
            setFeedbackLoading(false);
        }
    };

    const handleAppealSubmit = async (id) => {
        const reason = (appealReasons[id] || '').trim();
        if (reason.length < 10) {
            setActionMessage({ id, type: 'error', text: t('appeal_placeholder') });
            return;
        }
        setAppealLoading(true);
        setActionMessage(null);
        try {
            await complaintsAPI.appealComplaint(id, reason);
            setShowAppealBoxes(prev => ({ ...prev, [id]: false }));
            setAppealReasons(prev => ({ ...prev, [id]: '' }));
            fetchComplaints();
        } catch (err) {
            console.error('Appeal error:', err);
            setActionMessage({ id, type: 'error', text: err.message || 'Failed to file appeal.' });
        } finally {
            setAppealLoading(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('loading_grievances')}</p>
            </div>
        );
    }

    return (
        <div className="w-full min-w-0 max-w-5xl mx-auto py-6">
            {/* Page Header */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <div className="breadcrumb mb-2">
                        <Link href="/">{t('home')}</Link>
                        <ChevronDown size={10} className="breadcrumb-sep -rotate-90" />
                        <span className="breadcrumb-current">{t('my_grievances')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>{t('my_grievances')}</h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('total_complaints_count', { count: complaints.length })}
                    </p>
                </div>
                <button onClick={fetchComplaints} className="btn-outline flex items-center gap-2 text-sm">
                    <Loader2 size={14} className={loading ? 'animate-spin' : ''} /> {t('refresh')}
                </button>
            </div>

            {/* Logged-in User Dashboard Summary Section */}
            <div className="mb-7">
                <DashboardSummarySection
                    user={user}
                    summary={summaryStats}
                    loading={loading}
                    error={error}
                    onRetry={fetchComplaints}
                    showRefreshButton={false}
                    activeFilter={summaryFilter}
                    onSelectFilter={setSummaryFilter}
                />
            </div>

            {complaints.length === 0 ? (
                <div className="gov-card p-16 text-center" style={{ borderTop: '3px solid var(--saffron)' }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                        style={{ background: 'var(--navy-light)' }}>
                        <Search size={22} style={{ color: 'var(--navy)' }} />
                    </div>
                    <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{t('no_grievances_yet')}</p>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{t('no_grievances_sub')}</p>
                    <Link href="/citizen/lodge" className="btn-primary inline-flex">
                        {t('file_a_grievance')} <ArrowRight size={15} />
                    </Link>
                </div>
            ) : visibleComplaints.length === 0 ? (
                <div className="gov-card p-10 text-center">
                    <p className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                        {t('no_match_filter')}
                    </p>
                    <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                        {t('other_statuses_note', { count: complaints.length })}
                    </p>
                    <button
                        type="button"
                        onClick={() => setSummaryFilter('all')}
                        className="btn-outline text-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        {t('show_all_grievances')}
                    </button>
                </div>
            ) : (
                <div className="space-y-6">
                    {visibleComplaints.map((complaint) => {
                        const isExpanded = expandedId === complaint.id;
                        const detail = detailData[complaint.id];
                        const sNorm = (complaint.status || '').toLowerCase().replace(/\s+/g, '_');
                        const pNorm = (complaint.priority || '').toLowerCase();
                        const statusIdx = getStatusIndex(complaint.status);
                        const isReopened = sNorm === 'reopened';
                        const isAppealed = sNorm.startsWith('appealed') || sNorm === 'escalated';

                        const statusBadge = ['resolved', 'closed'].includes(sNorm) ? 'resolved' :
                            ['in_progress', 'assigned', 'work_in_progress', 'team_assigned'].includes(sNorm) ? 'progress' :
                            sNorm.startsWith('appealed') || sNorm === 'escalated' ? 'appealed' : 'submitted';

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
                                                    <span className="badge-dot" />{tStatus(sNorm || complaint.status)}
                                                </span>
                                                <span className={`badge ${priorityBadge} capitalize`}>
                                                    {tPriority(complaint.priority)}
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
                                                {complaint.title || tCategory(complaint.category)}
                                            </h3>
                                            <p className="text-sm truncate pr-8" style={{ color: 'var(--text-secondary)' }}>
                                                {complaint.description?.substring(0, 120)}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-4 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                <span className="flex items-center gap-1.5"><MapPin size={12} style={{ color: 'var(--navy)' }} /> {complaint.location}</span>
                                                <span className="flex items-center gap-1.5"><Clock size={12} style={{ color: 'var(--navy)' }} /> {new Date(complaint.created_at).toLocaleDateString(locale)}</span>
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
                                        <span>{t('submitted')}</span>
                                        <span>{t('resolved')}</span>
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
                                                        <Clock size={12} /> {t('audit_trail')}
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
                                                                            {tStatus(log.to_status)}
                                                                        </p>
                                                                        {log.remarks && (
                                                                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{log.remarks}</p>
                                                                        )}
                                                                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                                                                            {new Date(log.created_at).toLocaleString(locale)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                                                            <Loader2 className="animate-spin" size={16} /> {t('fetching_timeline')}
                                                        </div>
                                                    )}

                                                    {(isReopened || isAppealed) && (
                                                        <div className="gov-alert warning mt-3">
                                                            <AlertTriangle size={14} />
                                                            <span className="text-sm">
                                                                {isReopened ? t('reopened_notice') : t('appeal_review_notice')}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* AI Insights Panel */}
                                                {(aiData[complaint.id] || complaint.ai_category) && (
                                                    <div className="gov-card p-5">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-4 flex items-center gap-2"
                                                            style={{ color: 'var(--navy)' }}>
                                                            <Brain size={12} /> {t('ai_verification_triage')}
                                                        </h4>
                                                        <div className="space-y-4">
                                                            <div className="p-3 rounded-lg mb-3" style={{ background: 'var(--navy-xlight)', border: '1px solid var(--border)' }}>
                                                                <div className="flex justify-between items-center mb-2">
                                                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('ai_assessed_category')}</span>
                                                                    <span className="badge badge-submitted font-semibold">
                                                                        {tCategory(aiData[complaint.id]?.text_analysis?.category || complaint.ai_category || complaint.category)}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 text-xs">
                                                                    {(aiData[complaint.id]?.ai_confidence || complaint.ai_confidence) && (
                                                                        <span className="badge badge-closed">
                                                                            {t('confidence')}: {Math.round((aiData[complaint.id]?.ai_confidence || complaint.ai_confidence) > 1 ? (aiData[complaint.id]?.ai_confidence || complaint.ai_confidence) : (aiData[complaint.id]?.ai_confidence || complaint.ai_confidence) * 100)}%
                                                                        </span>
                                                                    )}
                                                                    {aiData[complaint.id]?.text_analysis?.urgency_level && (
                                                                        <span className="badge badge-closed">
                                                                            {t('urgency')}: {tPriority(aiData[complaint.id].text_analysis.urgency_level)}
                                                                        </span>
                                                                    )}
                                                                    {aiData[complaint.id]?.text_analysis?.severity_level && (
                                                                        <span className="badge badge-closed">
                                                                            {t('severity')}: {tPriority(aiData[complaint.id].text_analysis.severity_level)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {(aiData[complaint.id]?.priority?.score || complaint.priority_score) && (
                                                                <div className="p-3 rounded-lg flex justify-between items-center"
                                                                    style={{ background: 'var(--navy-light)', border: '1px solid var(--border-mid)' }}>
                                                                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--navy)' }}>
                                                                        <BarChart3 size={12} /> {t('priority_score')}
                                                                    </span>
                                                                    <span className="text-sm font-bold" style={{ color: 'var(--navy)' }}>
                                                                        {(aiData[complaint.id]?.priority?.score || complaint.priority_score)?.toFixed?.(2) ?? '—'} → {tPriority(aiData[complaint.id]?.priority?.priority || complaint.priority)}
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
                                                        <ListTodo size={12} /> {t('assigned_actions')}
                                                    </h4>

                                                    {detail?.tasks && detail.tasks.length > 0 ? (
                                                        <div className="space-y-4">
                                                            {detail.tasks.map((task, idx) => {
                                                                const tStatusNorm = (task.status || '').toLowerCase().replace(/\s+/g, '_');
                                                                const isDone = ['completed', 'resolved', 'closed'].includes(tStatusNorm);
                                                                const isProg = ['in_progress', 'assigned', 'active'].includes(tStatusNorm);
                                                                const isRej = ['rejected', 'cancelled'].includes(tStatusNorm);
                                                                const borderColor = isDone ? 'var(--india-green)' : isProg ? 'var(--navy)' : isRej ? 'var(--status-critical)' : 'var(--border-mid)';
                                                                const badgeClass = isDone ? 'badge-resolved' : isProg ? 'badge-progress' : isRej ? 'badge-critical' : 'badge-submitted';
                                                                return (
                                                                    <div key={idx} className="relative overflow-hidden rounded-lg"
                                                                        style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}` }}>
                                                                        <div className="flex items-center justify-between p-3">
                                                                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                                                {task.department_name || t('department')}
                                                                            </span>
                                                                            <span className={`badge ${badgeClass} capitalize`}>{tStatus(tStatusNorm || task.status)}</span>
                                                                        </div>
                                                                        {task.notes && <p className="text-xs px-3 pb-3" style={{ color: 'var(--text-secondary)' }}>{task.notes}</p>}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                                                            {t('awaiting_dept_assignment')}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Attachments */}
                                                {complaint.attachments && complaint.attachments.length > 0 && (
                                                    <div className="gov-card p-5">
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: 'var(--navy)' }}>
                                                            {t('evidence_uploaded_by_you')}
                                                        </h4>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {complaint.attachments.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer"
                                                                    className="block overflow-hidden rounded-xl transition-all shadow-sm"
                                                                    style={{ border: '1px solid var(--border)' }}>
                                                                    <img src={getImageUrl(img)} alt="Evidence" className="w-20 h-20 object-cover hover:scale-105 transition-transform" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Official Resolution Proofs uploaded by Officer */}
                                                {complaint.resolution_proof && complaint.resolution_proof.length > 0 && (
                                                    <div className="gov-card p-5"
                                                        style={{ background: 'var(--status-resolved-bg)', borderColor: 'var(--india-green)' }}>
                                                        <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3 flex items-center gap-1.5"
                                                            style={{ color: 'var(--text-green)' }}>
                                                            <CheckCircle size={12} />
                                                            {t('officer_redressal_proof')}
                                                        </h4>
                                                        <div className="flex gap-3 flex-wrap">
                                                            {complaint.resolution_proof.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer"
                                                                    className="block overflow-hidden rounded-xl shadow-sm hover:scale-105 transition-transform"
                                                                    style={{ border: '1px solid var(--india-green)' }}>
                                                                    <img src={getImageUrl(img)} alt="Resolution Proof" className="w-20 h-20 object-cover" />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Action Taken Report (ATR) & Citizen Satisfaction Gate */}
                                                {['resolved'].includes(sNorm) && (
                                                    <div className="mt-4 p-4 rounded-xl border"
                                                        style={{
                                                            borderColor: 'var(--india-green)',
                                                            background: 'var(--status-resolved-bg)',
                                                        }}>
                                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-green)' }}>
                                                                {t('atr_filed_heading')}
                                                            </span>
                                                            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                                {t('auto_closes_7d')}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                                                            {complaint.resolution_remarks || complaint.resolution_notes || 'Field inspection completed and resolution proof uploaded by the nodal team.'}
                                                        </p>

                                                        {((detail?.inspection_images?.length || 0) > 0 || (detail?.resolution_proof?.length || 0) > 0) && (
                                                            <div className="mb-4 rounded-lg border p-3"
                                                                style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                                                                <h4 className="mb-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-green)' }}>
                                                                    {t('field_evidence_comparison')}
                                                                </h4>
                                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                                    {detail?.inspection_images?.[0] && (
                                                                        <a href={getImageUrl(detail.inspection_images[0])} target="_blank" rel="noopener noreferrer" className="block">
                                                                            <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-saffron)' }}>
                                                                                {t('before_inspection')}
                                                                            </span>
                                                                            <img src={getImageUrl(detail.inspection_images[0])} alt="Site inspection before work"
                                                                                className="h-36 w-full rounded-lg border object-cover" style={{ borderColor: 'var(--border-mid)' }} />
                                                                        </a>
                                                                    )}
                                                                    {detail?.resolution_proof?.[0] && (
                                                                        <a href={getImageUrl(detail.resolution_proof[0])} target="_blank" rel="noopener noreferrer" className="block">
                                                                            <span className="mb-1 block text-[10px] font-semibold uppercase" style={{ color: 'var(--text-green)' }}>
                                                                                {t('after_resolution')}
                                                                            </span>
                                                                            <img src={getImageUrl(detail.resolution_proof[0])} alt="Resolution after work"
                                                                                className="h-36 w-full rounded-lg border object-cover" style={{ borderColor: 'var(--border-mid)' }} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {actionMessage?.id === complaint.id && (
                                                            <div className="gov-alert error mb-3 text-xs">
                                                                <AlertTriangle size={13} />
                                                                <span>{actionMessage.text}</span>
                                                            </div>
                                                        )}

                                                        {/* Rating stars */}
                                                        <div className="mb-3">
                                                            <span className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>
                                                                {t('rate_resolution_quality')}
                                                            </span>
                                                            <div className="flex gap-1.5 text-2xl cursor-pointer">
                                                                {[1, 2, 3, 4, 5].map(star => (
                                                                    <span
                                                                        key={star}
                                                                        onClick={() => setFeedbackForm(prev => ({ ...prev, [complaint.id]: { ...prev[complaint.id], rating: star } }))}
                                                                        style={{
                                                                            color: (feedbackForm[complaint.id]?.rating || 0) >= star
                                                                                ? 'var(--saffron)'
                                                                                : 'var(--border-mid)',
                                                                        }}
                                                                        className="hover:scale-110 transition-transform"
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
                                                                className="px-4 py-2 rounded-lg text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                                                                style={{ background: 'var(--india-green)' }}
                                                            >
                                                                {feedbackLoading && <Loader2 size={12} className="animate-spin" />}
                                                                ✓ {t('satisfied_close')}
                                                            </button>
                                                            <button
                                                                onClick={() => setShowAppealBoxes(prev => ({ ...prev, [complaint.id]: !prev[complaint.id] }))}
                                                                className="px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                                                                style={{ background: 'var(--saffron-dark)', color: '#FFFFFF' }}
                                                            >
                                                                ✗ {t('not_satisfied_appeal')}
                                                            </button>
                                                        </div>

                                                        {showAppealBoxes[complaint.id] && (
                                                            <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                                                                <textarea
                                                                    value={appealReasons[complaint.id] || ''}
                                                                    onChange={(e) => setAppealReasons(prev => ({ ...prev, [complaint.id]: e.target.value }))}
                                                                    placeholder={t('appeal_placeholder')}
                                                                    className="gov-input text-sm"
                                                                    rows={3}
                                                                />
                                                                <button
                                                                    onClick={() => handleAppealSubmit(complaint.id)}
                                                                    disabled={appealLoading}
                                                                    className="mt-2 px-4 py-2 rounded-lg text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
                                                                    style={{ background: 'var(--error)' }}
                                                                >
                                                                    {appealLoading && <Loader2 size={12} className="animate-spin" />}
                                                                    {t('submit_official_appeal')}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Appeal Active Notice */}
                                                {sNorm.startsWith('appealed') && (
                                                    <div className="mt-4 p-4 rounded-xl border"
                                                        style={{ borderColor: 'var(--status-appealed)', background: 'var(--status-appealed-bg)' }}>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <AlertTriangle size={15} style={{ color: 'var(--status-appealed)' }} />
                                                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--status-appealed)' }}>
                                                                {tStatus(sNorm)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs" style={{ color: 'var(--text-primary)' }}>
                                                            {t('appeal_review_notice')}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Resolution & Rating Display (when Closed) */}
                                                {sNorm === 'closed' && (
                                                    <div className="space-y-3 mt-4">
                                                        {complaint.citizen_rating && (
                                                            <div className="gov-card p-4">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                                                                    {t('rate_resolution_quality')}
                                                                </p>
                                                                <div className="flex items-center gap-1 mb-2 text-xl">
                                                                    {[1, 2, 3, 4, 5].map(star => (
                                                                        <span key={star} style={{ color: star <= complaint.citizen_rating ? 'var(--saffron)' : 'var(--border-mid)' }}>★</span>
                                                                    ))}
                                                                </div>
                                                                {complaint.feedback_text && (
                                                                    <p className="text-sm font-medium italic p-2.5 rounded-lg"
                                                                        style={{ color: 'var(--text-secondary)', background: 'var(--bg-section)' }}>
                                                                        &quot;{complaint.feedback_text}&quot;
                                                                    </p>
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
