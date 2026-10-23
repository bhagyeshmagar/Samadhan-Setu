'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { departmentAPI, aiAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import { 
    Loader2, ListTodo, CheckCircle, Clock, AlertTriangle, 
    Play, XCircle, ChevronDown, ChevronUp, MapPin, Brain, 
    Zap, ChevronRight, RefreshCw, ShieldCheck, FileText,
    Camera, Upload, Eye, CheckCircle2, Image as ImageIcon,
    Send, Check, X, ShieldAlert
} from 'lucide-react';

const TASK_STATUS_OPTIONS = ['Pending', 'Assigned', 'In Progress', 'Completed', 'Rejected'];
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

const formatImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
    return `${API_BASE}/uploads/${url.replace(/^\//, '')}`;
};

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

    // Proof upload states (per-task)
    const [inspectionFiles, setInspectionFiles] = useState({});
    const [inspectionPreviews, setInspectionPreviews] = useState({});
    const [inspectionNotes, setInspectionNotes] = useState({});
    
    const [resolutionFiles, setResolutionFiles] = useState({});
    const [resolutionPreviews, setResolutionPreviews] = useState({});
    const [resolutionRemarks, setResolutionRemarks] = useState({});

    // Lightbox modal for photos
    const [lightboxUrl, setLightboxUrl] = useState(null);

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
                remarks: notes || `Status updated to ${newStatus}`,
            });
            setSuccessMsg(`Task #${taskId.substring(0, 8)} status successfully updated to ${newStatus}`);
            await fetchData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Update failed');
        } finally {
            setActionLoading('');
        }
    };

    // Handle inspection file change
    const handleInspectionFileSelect = (taskId, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setInspectionFiles(prev => ({ ...prev, [taskId]: file }));
        setInspectionPreviews(prev => ({ ...prev, [taskId]: URL.createObjectURL(file) }));
    };

    // Handle resolution file change
    const handleResolutionFileSelect = (taskId, e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setResolutionFiles(prev => ({ ...prev, [taskId]: file }));
        setResolutionPreviews(prev => ({ ...prev, [taskId]: URL.createObjectURL(file) }));
    };

    // Step 1: Upload site inspection proof and transition to In Progress
    const handleUploadInspection = async (taskId) => {
        const file = inspectionFiles[taskId];
        const notes = inspectionNotes[taskId] || 'Site inspection completed by officer. Field redressal commenced.';
        
        setActionLoading(taskId);
        setError('');
        setSuccessMsg('');
        try {
            if (file) {
                await departmentAPI.uploadInspectionProof(taskId, [file]);
            }
            await departmentAPI.updateTaskStatus(taskId, {
                status: 'In Progress',
                notes: notes,
                remarks: notes,
            });
            setSuccessMsg(`Proof of inspection uploaded! Task #${taskId.substring(0, 8)} is now In Progress.`);
            // Clear inputs
            setInspectionFiles(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            setInspectionPreviews(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            setInspectionNotes(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            await fetchData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Inspection proof upload failed');
        } finally {
            setActionLoading('');
        }
    };

    // Step 2: Upload completion resolution proof and transition to Completed
    const handleUploadResolution = async (taskId) => {
        const file = resolutionFiles[taskId];
        const remarks = resolutionRemarks[taskId] || 'Field redressal executed and verified. Issue resolved.';
        
        setActionLoading(taskId);
        setError('');
        setSuccessMsg('');
        try {
            if (file) {
                await departmentAPI.uploadResolutionProof(taskId, [file]);
            }
            await departmentAPI.updateTaskStatus(taskId, {
                status: 'Completed',
                remarks: remarks,
                notes: remarks,
            });
            setSuccessMsg(`Proof of completion uploaded! Task #${taskId.substring(0, 8)} marked Completed & citizen notified.`);
            // Clear inputs
            setResolutionFiles(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            setResolutionPreviews(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            setResolutionRemarks(prev => { const n = { ...prev }; delete n[taskId]; return n; });
            await fetchData();
            setTimeout(() => setSuccessMsg(''), 4000);
        } catch (err) {
            setError(err.message || 'Resolution proof upload failed');
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
        <div className="max-w-6xl mx-auto py-6 px-4">
            {/* ── Breadcrumb ── */}
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                <span>Home</span>
                <ChevronRight size={12} />
                <span>Department Services</span>
                <ChevronRight size={12} />
                <span className="font-semibold text-gray-800">Officer Task Desk</span>
            </div>

            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
                        <ListTodo className="text-[var(--navy)]" size={26} />
                        Officer Task Desk
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        विभागीय कार्य डेस्क — Field grievance redressal workflows, statutory SLA monitoring & AI-prioritized task queue
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        onClick={() => {
                            if (!showAiQueue) fetchAiQueue();
                            setShowAiQueue(!showAiQueue);
                        }}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg border flex items-center gap-1.5 transition-all ${
                            showAiQueue
                                ? 'bg-purple-900 text-white border-purple-900 shadow-sm'
                                : 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100'
                        }`}
                    >
                        <Brain size={13} />
                        <span>AI-RANKED QUEUE</span>
                    </button>

                    <button
                        onClick={fetchData}
                        className="btn-ghost flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border rounded-lg border-gray-200 hover:bg-gray-50"
                    >
                        <RefreshCw size={13} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* ── Error & Success Alerts ── */}
            {error && (
                <div className="gov-alert error mb-4 flex items-center gap-3">
                    <AlertTriangle size={16} className="shrink-0 text-red-600" />
                    <span className="text-xs font-medium text-red-800 flex-1">{error}</span>
                    <button onClick={fetchData} className="text-xs font-bold underline text-red-900">Retry</button>
                </div>
            )}
            {successMsg && (
                <div className="gov-alert success mb-4 flex items-center gap-3 bg-emerald-50 border-emerald-300 text-emerald-800 p-3 rounded-lg border">
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                    <span className="text-xs font-semibold">{successMsg}</span>
                </div>
            )}

            {/* ── Metrics Cards ── */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                    <div className="gov-card p-4 border-l-4 border-l-[var(--navy)]">
                        <div className="text-2xl font-black text-gray-900 leading-none">
                            {metrics.total_assigned ?? metrics.total_tasks ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-1.5">
                            Total Assigned
                        </div>
                        <div className="text-[9px] text-gray-400 font-hindi mt-0.5">कुल आवंटित कार्य</div>
                    </div>

                    <div className="gov-card p-4 border-l-4 border-l-red-600">
                        <div className="text-2xl font-black text-red-700 leading-none">
                            {metrics.pending_action ?? metrics.pending ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-1.5">
                            Pending Action
                        </div>
                        <div className="text-[9px] text-gray-400 font-hindi mt-0.5">प्रतीक्षारत</div>
                    </div>

                    <div className="gov-card p-4 border-l-4 border-l-amber-500">
                        <div className="text-2xl font-black text-amber-700 leading-none">
                            {metrics.assigned ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-1.5">
                            Assigned
                        </div>
                        <div className="text-[9px] text-gray-400 font-hindi mt-0.5">स्वीकृत</div>
                    </div>

                    <div className="gov-card p-4 border-l-4 border-l-blue-600">
                        <div className="text-2xl font-black text-blue-700 leading-none">
                            {metrics.in_progress ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-1.5">
                            In Progress
                        </div>
                        <div className="text-[9px] text-gray-400 font-hindi mt-0.5">प्रगति पर</div>
                    </div>

                    <div className="gov-card p-4 border-l-4 border-l-emerald-600">
                        <div className="text-2xl font-black text-emerald-700 leading-none">
                            {metrics.resolved_count ?? metrics.completed ?? 0}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-gray-600 mt-1.5">
                            Resolved / Done
                        </div>
                        <div className="text-[9px] text-gray-400 font-hindi mt-0.5">पूर्ण कार्य</div>
                    </div>
                </div>
            )}

            {/* ── AI Priority Queue Drawer ── */}
            {showAiQueue && (
                <div className="gov-card p-5 mb-6 border-2 border-purple-200 bg-purple-50/40">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-purple-950">
                            <Brain size={18} className="text-purple-700" />
                            <span>AI Neural-Ranked Action Queue</span>
                            <span className="text-[10px] font-normal text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                                Optimized by SLA risk, sentiment & severity
                            </span>
                        </div>
                        <button
                            onClick={() => setShowAiQueue(false)}
                            className="text-xs text-purple-700 hover:text-purple-900 font-semibold"
                        >
                            Dismiss
                        </button>
                    </div>

                    {aiQueueLoading ? (
                        <div className="flex items-center justify-center py-6 gap-2 text-xs text-purple-800">
                            <Loader2 className="animate-spin" size={16} />
                            Calculating urgency scores…
                        </div>
                    ) : aiQueue.length === 0 ? (
                        <p className="text-xs text-purple-700 py-3">No pending tasks in AI priority queue.</p>
                    ) : (
                        <div className="space-y-2">
                            {aiQueue.slice(0, 5).map((q, idx) => (
                                <div key={q.id || q.complaint_id || idx} className="bg-white p-3 rounded-lg border border-purple-100 flex items-center justify-between gap-3 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-xs font-black text-purple-900 w-6">#{idx + 1}</span>
                                        <div>
                                            <div className="text-xs font-bold text-gray-900">{q.title}</div>
                                            <div className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                                                <span>Ward: {q.ward || '—'}</span>
                                                <span>•</span>
                                                <span className="text-purple-700 font-semibold">Priority Score: {q.priority_score}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowAiQueue(false);
                                            setExpandedTaskId(q.id || q.complaint_id);
                                        }}
                                        className="text-xs font-bold text-purple-800 hover:text-purple-950 px-2.5 py-1 rounded bg-purple-50"
                                    >
                                        Inspect Task →
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Status Filters ── */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mr-1">Filter:</span>
                <button
                    onClick={() => setStatusFilter('')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                        statusFilter === '' ? 'bg-[var(--navy)] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                    ALL TASKS ({tasks.length})
                </button>
                {TASK_STATUS_OPTIONS.map(opt => (
                    <button
                        key={opt}
                        onClick={() => setStatusFilter(opt)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors uppercase ${
                            statusFilter === opt ? 'bg-[var(--navy)] text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                        {opt}
                    </button>
                ))}
            </div>

            {/* ── Task List ── */}
            {tasks.length === 0 ? (
                <div className="gov-card p-12 text-center">
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
                        const priorityLower = (task.complaint_priority || 'low').toLowerCase();

                        return (
                            <div key={task.id} className="gov-card overflow-hidden transition-all duration-200 border border-gray-200 hover:border-gray-300">
                                {/* Header / Summary clickable row */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50/80 transition-colors"
                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            {/* Badges + Statutory Countdown Timer */}
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <Badge status={task.status} />
                                                <span className="badge badge-normal font-semibold">
                                                    {task.department_name || task.category || 'Municipal Works'}
                                                </span>
                                                
                                                {task.complaint_priority && (
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                        priorityLower === 'critical' ? 'text-red-800 bg-red-100 border border-red-300' :
                                                        priorityLower === 'high' ? 'text-rose-700 bg-rose-50 border border-rose-200' :
                                                        priorityLower === 'medium' ? 'text-amber-700 bg-amber-50 border border-amber-200' : 
                                                        'text-gray-700 bg-gray-100'
                                                    }`}>
                                                        Priority: {task.complaint_priority}
                                                    </span>
                                                )}

                                                {/* Live Statutory Countdown Timer (Compact in Header) */}
                                                <DeadlineTimer
                                                    deadline={task.sla_deadline}
                                                    createdAt={task.created_at}
                                                    priority={task.complaint_priority}
                                                    status={task.status}
                                                    resolvedAt={task.completed_at}
                                                    compact={true}
                                                />

                                                <span className="font-mono text-[11px] text-gray-400 ml-auto sm:ml-0">
                                                    ID: #{task.id?.substring(0, 8)}
                                                </span>
                                            </div>

                                            <h3 className="text-sm font-bold text-gray-900 mb-1 leading-snug">
                                                {task.complaint_title || 'Civic Redressal Task'}
                                            </h3>

                                            <p className="text-xs text-gray-600 line-clamp-1">
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
                                    <div className="px-5 pb-5 pt-3 border-t border-gray-100 bg-gray-50/50 space-y-4">
                                        
                                        {/* Statutory SLA Target Countdown Banner */}
                                        <div className="bg-white p-3.5 rounded-lg border border-gray-200 shadow-sm">
                                            <DeadlineTimer
                                                deadline={task.sla_deadline}
                                                createdAt={task.created_at}
                                                priority={task.complaint_priority}
                                                status={task.status}
                                                resolvedAt={task.completed_at}
                                                showProgressBar={true}
                                            />
                                        </div>

                                        {/* Full Grievance Statement */}
                                        {task.complaint_description && (
                                            <div>
                                                <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-1.5">
                                                    Complete Grievance Statement / विवरण
                                                </h4>
                                                <p className="text-xs text-gray-700 leading-relaxed bg-white p-3 rounded-lg border border-gray-200">
                                                    {task.complaint_description}
                                                </p>
                                            </div>
                                        )}

                                        {/* Citizen Uploaded Evidence Photos (if any) */}
                                        {task.attachments && task.attachments.length > 0 && (
                                            <div>
                                                <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2 flex items-center gap-1.5">
                                                    <ImageIcon size={12} /> Citizen Submitted Evidence / नागरिक द्वारा संलग्न
                                                </h4>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {task.attachments.map((att, i) => {
                                                        const src = typeof att === 'string' ? att : att?.url;
                                                        const fullUrl = formatImageUrl(src);
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setLightboxUrl(fullUrl)}
                                                                className="relative group cursor-pointer w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 shadow-sm"
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={fullUrl}
                                                                    alt="Citizen Evidence"
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                                                    <Eye size={16} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Existing Proof of Inspection Photos ("Before") */}
                                        {task.inspection_images && task.inspection_images.length > 0 && (
                                            <div className="bg-amber-50/70 p-3 rounded-lg border border-amber-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                                                        <Camera size={13} className="text-amber-700" />
                                                        Site Inspection Proof (Before Redressal) / स्थल निरीक्षण प्रमाण
                                                    </h4>
                                                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded font-semibold">
                                                        Recorded by Officer
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {task.inspection_images.map((imgUrl, i) => {
                                                        const fullUrl = formatImageUrl(imgUrl);
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setLightboxUrl(fullUrl)}
                                                                className="relative group cursor-pointer w-24 h-24 rounded-lg overflow-hidden border border-amber-300 bg-white shadow-sm"
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={fullUrl}
                                                                    alt="Inspection Proof"
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                                                    <Eye size={16} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Existing Proof of Completion Photos ("After") */}
                                        {task.proof_images && task.proof_images.length > 0 && (
                                            <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-200">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                                                        <CheckCircle2 size={13} className="text-emerald-700" />
                                                        Field Completion Proof (After Redressal) / कार्य पूर्ति प्रमाण
                                                    </h4>
                                                    <span className="text-[10px] bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded font-semibold">
                                                        Verified Redressal
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {task.proof_images.map((imgUrl, i) => {
                                                        const fullUrl = formatImageUrl(imgUrl);
                                                        return (
                                                            <div
                                                                key={i}
                                                                onClick={() => setLightboxUrl(fullUrl)}
                                                                className="relative group cursor-pointer w-24 h-24 rounded-lg overflow-hidden border border-emerald-300 bg-white shadow-sm"
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={fullUrl}
                                                                    alt="Resolution Proof"
                                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                                />
                                                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                                                    <Eye size={16} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Officer Remarks / Audit Notes */}
                                        {task.notes && (
                                            <div>
                                                <h4 className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-1">
                                                    Officer Field Redressal Remarks / टिप्पणी
                                                </h4>
                                                <p className="text-xs text-gray-700 italic bg-white p-2.5 rounded border border-gray-200">
                                                    &quot;{task.notes}&quot;
                                                </p>
                                            </div>
                                        )}

                                        {/* ── STRUCTURED OFFICER FIELD WORKFLOW STEPS ── */}
                                        {task.status !== 'Completed' && task.status !== 'Rejected' && (
                                            <div className="border border-blue-200 bg-blue-50/40 rounded-xl p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                                                        <ShieldCheck size={14} className="text-blue-700" />
                                                        Officer Execution & Proof Verification / विभागीय कार्यवाई
                                                    </h4>
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                                                        Current: {task.status}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    
                                                    {/* ── STEP 1: Preliminary Site Inspection ── */}
                                                    <div className={`p-4 rounded-lg border bg-white flex flex-col justify-between ${
                                                        task.status === 'In Progress' ? 'border-gray-200 opacity-90' : 'border-blue-300 ring-1 ring-blue-100'
                                                    }`}>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                                                    <Camera size={14} className="text-blue-600" />
                                                                    Step 1: Proof of Inspection
                                                                </span>
                                                                {task.status === 'In Progress' && (
                                                                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-1">
                                                                        <Check size={10} /> Commenced
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 mb-3">
                                                                Upload site photo before commencing field work. Documents condition & initial inspection findings.
                                                            </p>

                                                            {/* Image Upload Zone */}
                                                            <div className="mb-3">
                                                                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                                                                    Inspection Photo (स्थल फोटो):
                                                                </label>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={(e) => handleInspectionFileSelect(task.id, e)}
                                                                    className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                                                                />
                                                                {inspectionPreviews[task.id] && (
                                                                    <div className="mt-2 w-20 h-20 rounded-md overflow-hidden border border-blue-300">
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={inspectionPreviews[task.id]}
                                                                            alt="Inspection Preview"
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Field Notes Input */}
                                                            <div className="mb-3">
                                                                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                                                                    Inspection Notes / स्थल विवरण:
                                                                </label>
                                                                <textarea
                                                                    rows={2}
                                                                    value={inspectionNotes[task.id] || ''}
                                                                    onChange={(e) => setInspectionNotes(prev => ({ ...prev, [task.id]: e.target.value }))}
                                                                    placeholder="e.g. Site visited at 10:30 AM. Pothole measured 12cm deep. Maintenance crew dispatched."
                                                                    className="w-full text-xs p-2 rounded border border-gray-200 focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => handleUploadInspection(task.id)}
                                                            disabled={isLoading || (!inspectionFiles[task.id] && task.status === 'In Progress')}
                                                            className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-blue-700 hover:bg-blue-800 text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                        >
                                                            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                                                            <span>Upload Inspection & Mark In Progress</span>
                                                        </button>
                                                    </div>

                                                    {/* ── STEP 2: Field Redressal & Resolution Completion ── */}
                                                    <div className={`p-4 rounded-lg border bg-white flex flex-col justify-between ${
                                                        task.status === 'In Progress' ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200 opacity-90'
                                                    }`}>
                                                        <div>
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                                                    <CheckCircle2 size={14} className="text-emerald-600" />
                                                                    Step 2: Proof of Completion
                                                                </span>
                                                                <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                                                                    Final Resolution
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 mb-3">
                                                                Upload completed work photo (repaired road, cleaned area, restored supply) to notify citizen & collector.
                                                            </p>

                                                            {/* Image Upload Zone */}
                                                            <div className="mb-3">
                                                                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                                                                    Completion Photo (कार्य पूर्ति फोटो):
                                                                </label>
                                                                <input
                                                                    type="file"
                                                                    accept="image/*"
                                                                    onChange={(e) => handleResolutionFileSelect(task.id, e)}
                                                                    className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                                                                />
                                                                {resolutionPreviews[task.id] && (
                                                                    <div className="mt-2 w-20 h-20 rounded-md overflow-hidden border border-emerald-300">
                                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                        <img
                                                                            src={resolutionPreviews[task.id]}
                                                                            alt="Resolution Preview"
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Resolution Remarks Input */}
                                                            <div className="mb-3">
                                                                <label className="block text-[10px] font-bold uppercase text-gray-500 mb-1">
                                                                    Resolution Remarks / निवारण टिप्पणी:
                                                                </label>
                                                                <textarea
                                                                    rows={2}
                                                                    value={resolutionRemarks[task.id] || ''}
                                                                    onChange={(e) => setResolutionRemarks(prev => ({ ...prev, [task.id]: e.target.value }))}
                                                                    placeholder="e.g. Pothole filled with cold asphalt mix, leveled, and road opened for normal transit."
                                                                    className="w-full text-xs p-2 rounded border border-gray-200 focus:outline-none focus:border-emerald-500"
                                                                />
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={() => handleUploadResolution(task.id)}
                                                            disabled={isLoading}
                                                            className="w-full py-2 px-3 text-xs font-bold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                                                        >
                                                            {isLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                                                            <span>Complete Redressal & Notify Citizen</span>
                                                        </button>
                                                    </div>

                                                </div>

                                                {/* Quick Action Shortcuts (Accept / Reject) */}
                                                <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between flex-wrap gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                                        Quick Status Shortcuts:
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        {task.status === 'Pending' && (
                                                            <button
                                                                onClick={() => handleUpdateStatus(task.id, 'Assigned')}
                                                                disabled={isLoading}
                                                                className="px-3 py-1 text-xs font-semibold rounded bg-purple-700 text-white hover:bg-purple-800 disabled:opacity-50"
                                                            >
                                                                Accept & Assign
                                                            </button>
                                                        )}
                                                        {task.status !== 'In Progress' && task.status !== 'Completed' && (
                                                            <button
                                                                onClick={() => handleUpdateStatus(task.id, 'In Progress')}
                                                                disabled={isLoading}
                                                                className="px-3 py-1 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                                                            >
                                                                Set In Progress
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleUpdateStatus(task.id, 'Rejected', 'Rejected upon departmental review')}
                                                            disabled={isLoading}
                                                            className="px-3 py-1 text-xs font-semibold rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Task Registered & Closed Audit Footer */}
                                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 pt-3 border-t border-gray-200">
                                            <span>
                                                Registered: {task.created_at ? new Date(task.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                            </span>
                                            {task.completed_at && (
                                                <span className="text-emerald-700 font-semibold">
                                                    Resolved: {new Date(task.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            )}
                                            <span className="ml-auto text-gray-400">
                                                Department: {task.department_name || task.category || 'Municipal Services'}
                                            </span>
                                        </div>

                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Lightbox Modal for Photo Inspection ── */}
            {lightboxUrl && (
                <div
                    onClick={() => setLightboxUrl(null)}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="relative max-w-4xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl p-2"
                    >
                        <button
                            onClick={() => setLightboxUrl(null)}
                            className="absolute top-4 right-4 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors"
                        >
                            <X size={18} />
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={lightboxUrl}
                            alt="Inspection Photo"
                            className="max-h-[82vh] w-auto object-contain rounded-lg mx-auto"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
