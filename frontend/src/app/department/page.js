'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { departmentAPI, aiAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { 
    Loader2, ListTodo, CheckCircle, Clock, AlertTriangle, 
    Play, XCircle, ChevronDown, ChevronUp, MapPin, Brain, 
    Zap, ChevronRight, RefreshCw, ShieldCheck, FileText 
} from 'lucide-react';

const TASK_STATUS_OPTIONS = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Rejected'];

export default function DepartmentDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [tasks, setTasks] = useState([]);
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [expandedTaskId, setExpandedTaskId] = useState(null);
    const [actionLoading, setActionLoading] = useState('');
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [aiQueue, setAiQueue] = useState([]);
    const [showAiQueue, setShowAiQueue] = useState(false);
    const [aiQueueLoading, setAiQueueLoading] = useState(false);

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
        if (!authLoading && user && user.role !== 'officer' && user.role !== 'admin') {
            router.push('/');
        }
    }, [user, authLoading, router]);

    const fetchData = useCallback(async () => {
        try {
            const [tasksData, metricsData] = await Promise.all([
                departmentAPI.getTasks(statusFilter || undefined),
                departmentAPI.getDashboardMetrics(),
            ]);
            setTasks(tasksData || []);
            setMetrics(metricsData);
        } catch (err) {
            setError(err.message || 'Failed to load task records');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        if (user && (user.role === 'officer' || user.role === 'admin')) {
            fetchData();
        }
    }, [user, fetchData]);

    const fetchAiQueue = async () => {
        setAiQueueLoading(true);
        try {
            const data = await aiAPI.getOfficerQueue(statusFilter || undefined);
            setAiQueue(data || []);
        } catch (err) {
            console.error('AI queue fetch failed:', err);
        } finally {
            setAiQueueLoading(false);
        }
    };

    const handleUpdateStatus = async (taskId, newStatus, notes = '') => {
        setActionLoading(taskId);
        setError('');
        setSuccessMsg('');
        try {
            await departmentAPI.updateTaskStatus(taskId, {
                status: newStatus,
                notes: notes || `Status updated to ${newStatus}`,
            });
            setSuccessMsg(`Task #${taskId.substring(0, 8)} status successfully updated to ${newStatus}`);
            await fetchData();
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            setError(err.message || 'Update failed');
        } finally {
            setActionLoading('');
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
                <Loader2 className="animate-spin text-[var(--navy)]" size={32} />
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Loading Officer Console…
                </p>
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
                        <span className="breadcrumb-current">Officer Task Desk</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        Officer Task Desk
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        विभागीय कार्य डेस्क — Field grievance redressal workflows, SLA monitoring & AI-prioritized task queue
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const next = !showAiQueue;
                            setShowAiQueue(next);
                            if (next && aiQueue.length === 0) fetchAiQueue();
                        }}
                        className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 border ${
                            showAiQueue 
                                ? 'bg-purple-800 text-white border-purple-900 shadow-sm' 
                                : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                        }`}
                    >
                        <Brain size={14} />
                        <span>{showAiQueue ? 'Hide AI Queue' : 'AI-Ranked Queue'}</span>
                    </button>
                    <button
                        onClick={fetchData}
                        className="btn-ghost flex items-center gap-1.5 text-xs font-semibold"
                        title="Refresh data"
                    >
                        <RefreshCw size={13} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ── Alerts ── */}
            {error && (
                <div className="gov-alert error mb-4">
                    <AlertTriangle size={16} />
                    <div className="flex-1 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={fetchData} className="underline text-xs font-bold">Retry</button>
                    </div>
                </div>
            )}
            {successMsg && (
                <div className="gov-alert success mb-4">
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* ── Metrics Cards ── */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="metric-card mc-navy">
                        <div className="metric-number">{metrics.total_tasks ?? 0}</div>
                        <div className="metric-label">Total Assigned</div>
                        <div className="text-[10px] mt-0.5 text-gray-400" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                            कुल आवंटित कार्य
                        </div>
                    </div>
                    <div className="metric-card mc-critical">
                        <div className="metric-number" style={{ color: 'var(--status-critical)' }}>
                            {metrics.pending ?? 0}
                        </div>
                        <div className="metric-label">Pending Action</div>
                        <div className="text-[10px] mt-0.5 text-gray-400" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                            प्रतीक्षारत
                        </div>
                    </div>
                    <div className="metric-card mc-saffron">
                        <div className="metric-number" style={{ color: 'var(--saffron-dark)' }}>
                            {metrics.assigned ?? 0}
                        </div>
                        <div className="metric-label">Assigned</div>
                        <div className="text-[10px] mt-0.5 text-gray-400" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                            स्वीकृत
                        </div>
                    </div>
                    <div className="metric-card mc-navy">
                        <div className="metric-number text-blue-700">
                            {metrics.in_progress ?? 0}
                        </div>
                        <div className="metric-label">In Progress</div>
                        <div className="text-[10px] mt-0.5 text-gray-400" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                            प्रगति पर
                        </div>
                    </div>
                    <div className="metric-card mc-green">
                        <div className="metric-number" style={{ color: 'var(--india-green)' }}>
                            {metrics.completed ?? 0}
                        </div>
                        <div className="metric-label">Resolved / Done</div>
                        <div className="text-[10px] mt-0.5 text-gray-400" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                            पूर्ण कार्य
                        </div>
                    </div>
                </div>
            )}

            {/* ── AI-Ranked Queue Drawer ── */}
            {showAiQueue && (
                <div className="gov-section mb-6 border-l-4 border-l-purple-600">
                    <div className="gov-section-header bg-purple-50">
                        <span className="gov-section-title flex items-center gap-2 text-purple-950 font-bold">
                            <Brain size={14} className="text-purple-700" />
                            AI-Synthesised Priority Order (Automated Routing & Severity Ranking)
                        </span>
                        <span className="text-[11px] text-purple-700 font-medium">
                            Ranked by Impact, Urgency & SLA Breach Risk
                        </span>
                    </div>
                    <div className="p-4 bg-white">
                        {aiQueueLoading ? (
                            <div className="flex items-center gap-3 py-6 justify-center text-xs text-gray-500">
                                <Loader2 size={16} className="animate-spin text-purple-600" />
                                <span>Evaluating NLP urgency, similarity clusters & SLA factors…</span>
                            </div>
                        ) : aiQueue.length === 0 ? (
                            <p className="text-xs text-gray-500 py-4 text-center">
                                No urgent AI-ranked tasks found in the current filter.
                            </p>
                        ) : (
                            <div className="space-y-2.5">
                                {aiQueue.map((item, idx) => (
                                    <div key={item.task_id} className="p-3.5 rounded border border-gray-200 bg-gray-50 hover:bg-white flex items-start justify-between gap-4 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                <span className="text-[11px] font-mono font-bold text-gray-700 bg-gray-200 px-1.5 py-0.5 rounded">
                                                    #{idx + 1}
                                                </span>
                                                <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                    item.priority === 'Critical' ? 'bg-red-100 text-red-800' :
                                                    item.priority === 'High' ? 'bg-red-50 text-red-700' :
                                                    item.priority === 'Medium' ? 'bg-amber-50 text-amber-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                    Priority: {item.priority}
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-bold uppercase flex items-center gap-1">
                                                    <Zap size={10} /> Urgency: {item.urgency_level}
                                                </span>
                                                {item.sla_risk_level && item.sla_risk_level !== 'Low' && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase text-red-700 bg-red-50 border border-red-200">
                                                        SLA Risk: {item.sla_risk_level}
                                                    </span>
                                                )}
                                                {item.similar_count > 0 && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded text-purple-700 bg-purple-50 font-bold border border-purple-200">
                                                        {item.similar_count} Duplicate/Related Reports
                                                    </span>
                                                )}
                                            </div>
                                            <h4 className="text-sm font-bold text-gray-900 truncate">
                                                {item.complaint_title || 'Civic Grievance Matter'}
                                            </h4>
                                            <p className="text-xs text-gray-600 truncate mt-0.5">
                                                {item.complaint_description}
                                            </p>
                                            {item.complaint_location && (
                                                <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                                                    <MapPin size={12} className="text-[var(--navy)]" />
                                                    <span>{item.complaint_location}</span>
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <div className="text-xl font-bold text-gray-900 font-mono">
                                                {item.priority_score?.toFixed(2)}
                                            </div>
                                            <div className="text-[9px] uppercase tracking-wider text-gray-400 font-semibold">
                                                Priority Score
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Filter Tabs ── */}
            <div className="gov-card p-3 mb-6 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">Filter:</span>
                    <button
                        onClick={() => setStatusFilter('')}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-colors ${
                            !statusFilter
                                ? 'bg-[var(--navy)] text-white shadow-sm'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                    >
                        All Tasks ({metrics?.total_tasks ?? 0})
                    </button>
                    {TASK_STATUS_OPTIONS.map(s => {
                        const count = s === 'Pending' ? metrics?.pending :
                                      s === 'Assigned' ? metrics?.assigned :
                                      s === 'In Progress' ? metrics?.in_progress :
                                      s === 'Completed' ? metrics?.completed : null;
                        return (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-colors whitespace-nowrap ${
                                    statusFilter === s
                                        ? 'bg-[var(--navy)] text-white shadow-sm'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                }`}
                            >
                                {s} {count !== null && count !== undefined ? `(${count})` : ''}
                            </button>
                        );
                    })}
                </div>

                <div className="text-xs text-gray-500 font-medium">
                    Showing <strong>{tasks.length}</strong> tasks
                </div>
            </div>

            {/* ── Task Records List ── */}
            {tasks.length === 0 ? (
                <div className="gov-card p-16 text-center">
                    <FileText size={32} className="mx-auto text-gray-300 mb-3" />
                    <h3 className="text-base font-bold text-gray-800 mb-1">No Active Tasks</h3>
                    <p className="text-xs text-gray-500">
                        No field tasks found{statusFilter ? ` under status "${statusFilter}"` : ''}.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map(task => {
                        const isExpanded = expandedTaskId === task.id;
                        const isLoading = actionLoading === task.id;

                        return (
                            <div key={task.id} className="gov-card overflow-hidden transition-colors">
                                {/* Header / Summary clickable row */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <Badge status={task.status} />
                                                <span className="badge badge-normal font-semibold">
                                                    {task.department_name || 'Municipal Works'}
                                                </span>
                                                {task.complaint_priority && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                        task.complaint_priority === 'High' ? 'text-red-700 bg-red-50 border border-red-200' :
                                                        task.complaint_priority === 'Medium' ? 'text-amber-700 bg-amber-50 border border-amber-200' : 
                                                        'text-gray-700 bg-gray-100'
                                                    }`}>
                                                        Priority: {task.complaint_priority}
                                                    </span>
                                                )}
                                                <span className="font-mono text-[11px] text-gray-400 ml-auto sm:ml-0">
                                                    ID: #{task.id?.substring(0, 8)}
                                                </span>
                                            </div>

                                            <h3 className="text-sm font-bold text-gray-900 mb-1 leading-snug">
                                                {task.complaint_title || 'Civic Redressal Task'}
                                            </h3>

                                            <p className="text-xs text-gray-600 truncate">
                                                {task.complaint_description}
                                            </p>

                                            {task.complaint_location && (
                                                <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1.5">
                                                    <MapPin size={12} className="text-[var(--navy)] flex-shrink-0" />
                                                    <span>{task.complaint_location}</span>
                                                </p>
                                            )}
                                        </div>

                                        <div className="text-gray-400 p-1 flex-shrink-0">
                                            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Detail Panel */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50">
                                        <div className="space-y-4">
                                            {/* Full Description */}
                                            {task.complaint_description && (
                                                <div>
                                                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-1.5">
                                                        Complete Grievance Statement / विवरण
                                                    </h4>
                                                    <p className="text-xs text-gray-700 leading-relaxed bg-white p-3 rounded border border-gray-200">
                                                        {task.complaint_description}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Notes if any */}
                                            {task.notes && (
                                                <div>
                                                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                                                        Previous Officer Remarks
                                                    </h4>
                                                    <p className="text-xs text-gray-600 italic">
                                                        &quot;{task.notes}&quot;
                                                    </p>
                                                </div>
                                            )}

                                            {/* Officer Action Workflow Controls */}
                                            {task.status !== 'Completed' && task.status !== 'Rejected' && (
                                                <div className="pt-2">
                                                    <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">
                                                        Workflow Actions / कार्यवाई
                                                    </h4>
                                                    <div className="flex flex-wrap gap-2">
                                                        {task.status === 'Pending' && (
                                                            <>
                                                                <button
                                                                    onClick={() => handleUpdateStatus(task.id, 'Assigned')}
                                                                    disabled={isLoading}
                                                                    className="px-3.5 py-1.5 text-xs font-semibold rounded bg-purple-700 text-white hover:bg-purple-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                                >
                                                                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Accept & Assign to Field'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleUpdateStatus(task.id, 'Rejected', 'Task rejected by officer upon preliminary verification')}
                                                                    disabled={isLoading}
                                                                    className="px-3.5 py-1.5 text-xs font-semibold rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 transition-colors disabled:opacity-50"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </>
                                                        )}

                                                        {task.status === 'Assigned' && (
                                                            <button
                                                                onClick={() => handleUpdateStatus(task.id, 'In Progress')}
                                                                disabled={isLoading}
                                                                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-blue-700 text-white hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                            >
                                                                {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Commence Field Work / प्रारंभ करें'}
                                                            </button>
                                                        )}

                                                        {task.status === 'In Progress' && (
                                                            <button
                                                                onClick={() => handleUpdateStatus(task.id, 'Completed', 'Task successfully resolved on field')}
                                                                disabled={isLoading}
                                                                className="px-3.5 py-1.5 text-xs font-semibold rounded bg-green-700 text-white hover:bg-green-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                            >
                                                                {isLoading ? <Loader2 size={12} className="animate-spin" /> : 'Mark Completed & Notify Citizen'}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Meta & Audit Footer */}
                                            <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 pt-3 border-t border-gray-200">
                                                <span>Registered: {task.created_at ? new Date(task.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                                                {task.completed_at && (
                                                    <span>Completed: {new Date(task.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                                )}
                                                <span className="ml-auto text-gray-400">Department: {task.department_name}</span>
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
