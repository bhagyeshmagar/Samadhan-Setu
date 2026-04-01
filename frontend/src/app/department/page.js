'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { departmentAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { AlertTriangle, CheckCircle, MapPin, Loader2, RefreshCw, Eye, Activity, Play } from 'lucide-react';

export default function DepartmentDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [pendingCount, setPendingCount] = useState({ pending: 0, in_progress: 0, total_active: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('Pending');  
    const [updating, setUpdating] = useState(null);

    useEffect(() => {
        if (!authLoading && (!user || (user.role !== 'officer' && user.role !== 'admin'))) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user, statusFilter]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [complaintsData, countData] = await Promise.all([
                departmentAPI.getComplaints(statusFilter || undefined),
                departmentAPI.getPendingCount()
            ]);
            setComplaints(complaintsData || []);
            setPendingCount(countData || { pending: 0, in_progress: 0, total_active: 0 });
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (id, newStatus, remarks = '') => {
        setUpdating(id);
        const statusMap = {
            'IN_PROGRESS': 'In Progress',
            'RESOLVED': 'Resolved',
            'REJECTED': 'Rejected',
            'PENDING': 'Pending'
        };
        const mappedStatus = statusMap[newStatus] || newStatus;
        try {
            await departmentAPI.updateStatus(id, {
                status: mappedStatus,
                remarks: remarks || `Status updated to ${mappedStatus}`
            });
            fetchData();
        } catch (err) {
            setError(err.message || 'Failed to update status');
        } finally {
            setUpdating(null);
        }
    };

    if (authLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="animate-spin text-theme opacity-50" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-theme pb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-theme-muted">Department Interface</span>
                    </div>
                    <h2 className="text-4xl font-bold tracking-tight text-theme mb-1">Operational Queue</h2>
                    <p className="text-sm font-light text-theme-secondary">
                        <strong className="text-theme font-medium">{pendingCount.total_active || 0} active anomalies</strong> pending resolution.
                    </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="px-4 py-2 text-[10px] font-bold tracking-widest uppercase border border-theme rounded-lg text-theme bg-theme-secondary hover:bg-theme-tertiary transition-colors flex items-center gap-2"
                    >
                        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Sync
                    </button>
                    
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 min-w-[140px] text-[10px] font-bold tracking-widest uppercase border border-theme rounded-lg text-theme bg-theme-secondary hover:bg-theme-tertiary transition-colors outline-none cursor-pointer appearance-none"
                    >
                        <option value="">ALL STATUS</option>
                        <option value="Pending">PENDING</option>
                        <option value="In Progress">IN PROGRESS</option>
                        <option value="Resolved">RESOLVED</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-[10px] font-bold uppercase tracking-wider mb-6 flex items-center justify-between">
                    <span>{typeof error === 'object' ? JSON.stringify(error) : error}</span>
                    <button onClick={fetchData} className="underline border-none bg-transparent">Retry</button>
                </div>
            )}

            {/* Quick Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="glass-panel p-8 group transition-all duration-300 hover:border-red-500/50">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-900/30">
                            <AlertTriangle size={16} className="text-red-500" />
                        </div>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-theme-muted">Queue</span>
                    </div>
                    <div className="text-5xl font-bold tracking-tighter text-theme group-hover:text-red-500 transition-colors">
                        {pendingCount.pending || 0}
                    </div>
                </div>
                
                <div className="glass-panel p-8 group transition-all duration-300 hover:border-amber-500/50">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-900/30">
                            <Activity size={16} className="text-amber-500" />
                        </div>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-theme-muted">Active</span>
                    </div>
                    <div className="text-5xl font-bold tracking-tighter text-theme group-hover:text-amber-500 transition-colors">
                        {pendingCount.in_progress || 0}
                    </div>
                </div>
                
                <div className="glass-panel p-8 group transition-all duration-300 hover:border-green-500/50">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900/30">
                            <CheckCircle size={16} className="text-green-500" />
                        </div>
                        <span className="text-[10px] font-bold tracking-widest uppercase text-theme-muted">Cleared</span>
                    </div>
                    <div className="text-5xl font-bold tracking-tighter text-theme group-hover:text-green-500 transition-colors">
                        {pendingCount.resolved_today || 0}
                    </div>
                </div>
            </div>

            {/* Loading Grid */}
            {loading && (
                <div className="flex flex-col items-center justify-center py-24 opacity-50 gap-4">
                    <Loader2 className="animate-spin text-theme" size={32} />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-theme">Indexing Table Data...</span>
                </div>
            )}

            {/* Task Table */}
            {!loading && (
                <div className="glass-panel overflow-hidden border-dashed">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap md:whitespace-normal">
                            <thead>
                                <tr className="border-b border-theme bg-theme-tertiary/30">
                                    <th className="py-5 px-6 text-[10px] font-bold tracking-widest uppercase text-theme-muted">ID Hash</th>
                                    <th className="py-5 px-6 text-[10px] font-bold tracking-widest uppercase text-theme-muted">Class & Context</th>
                                    <th className="py-5 px-6 text-[10px] font-bold tracking-widest uppercase text-theme-muted">Location</th>
                                    <th className="py-5 px-6 text-[10px] font-bold tracking-widest uppercase text-theme-muted">Status Protocol</th>
                                    <th className="py-5 px-6 text-[10px] font-bold tracking-widest uppercase text-theme-muted text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-theme">
                                {complaints.map((complaint) => {
                                    const statusLower = String(complaint.status || '').toLowerCase().replace(/_/g, ' ');
                                    const isPending = statusLower === 'pending';
                                    const isResolved = statusLower === 'resolved' || statusLower === 'rejected' || statusLower === 'closed';

                                    // Very abstract ID
                                    const shortId = complaint.id.toString().substring(0, 8);

                                    return (
                                        <tr key={complaint.id} className="hover:bg-theme-tertiary/50 transition-colors group">
                                            <td className="py-6 px-6 align-top">
                                                <div className="font-mono text-xs font-bold text-theme opacity-80 group-hover:opacity-100 transition-opacity">
                                                    {shortId}
                                                </div>
                                                <div className="text-[9px] uppercase tracking-widest text-theme-muted mt-2 font-bold flex items-center gap-1">
                                                    {complaint.priority === 'High' && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1"></span>}
                                                    {complaint.priority} Prio
                                                </div>
                                            </td>
                                            
                                            <td className="py-6 px-6 align-top max-w-sm">
                                                <div className="font-bold text-sm text-theme tracking-tight mb-2">
                                                    {complaint.category || 'General Anomaly'}
                                                </div>
                                                <div className="text-xs text-theme-secondary font-light leading-relaxed line-clamp-2">
                                                    {complaint.description}
                                                </div>
                                                
                                                {/* Mini Attachments */}
                                                {complaint.attachments && complaint.attachments.length > 0 && (
                                                    <div className="flex gap-1 mt-3">
                                                        {complaint.attachments.slice(0, 3).map((img, idx) => {
                                                            const imgUrl = typeof img === 'string' ? (img.startsWith('http') ? img : `http://127.0.0.1:8000${img}`) : (img.path ? `http://127.0.0.1:8000${img.path}` : '');
                                                            return <div key={idx} className="w-6 h-6 rounded border border-theme bg-theme-tertiary overflow-hidden flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity"><img src={imgUrl} className="w-full h-full object-cover" /></div>;
                                                        })}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="py-6 px-6 align-top max-w-[200px]">
                                                <div className="flex items-start gap-2 text-xs text-theme-muted font-medium bg-theme-secondary/50 p-2 rounded-lg border border-theme">
                                                    <MapPin size={12} className="mt-0.5 opacity-50 flex-shrink-0" />
                                                    <span className="truncate">{complaint.location}</span>
                                                </div>
                                            </td>
                                            
                                            <td className="py-6 px-6 align-top">
                                                <Badge status={complaint.status} size="default" />
                                                
                                                {complaint.deadline && (
                                                    <div className={`text-[10px] font-bold tracking-widest uppercase mt-3 ${new Date(complaint.deadline) < new Date() ? 'text-red-500 line-through' : 'text-theme-muted'}`}>
                                                        DUE: {new Date(complaint.deadline).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </td>
                                            
                                            <td className="py-6 px-6 align-top text-right">
                                                {!isResolved ? (
                                                    <div className="flex flex-col gap-2 items-end">
                                                        <button
                                                            onClick={() => router.push(`/department/complaint/${complaint.id}`)}
                                                            className="flex items-center gap-2 px-4 py-2 bg-theme text-theme border border-theme hover:border-blue-500 rounded-lg text-xs font-bold transition-colors w-full justify-center md:w-auto md:justify-end"
                                                        >
                                                            <Eye size={14} /> Open
                                                        </button>
                                                        
                                                        {isPending && (
                                                            <button
                                                                onClick={() => handleStatusUpdate(complaint.id, 'IN_PROGRESS', 'Execution initiated')}
                                                                disabled={updating === complaint.id}
                                                                className="flex items-center gap-2 px-4 py-2 bg-theme-secondary text-amber-600 border border-theme hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg text-xs font-bold transition-all disabled:opacity-50 w-full justify-center md:w-auto md:justify-end"
                                                            >
                                                                {updating === complaint.id ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                                                                Start
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-[10px] font-bold tracking-widest uppercase text-theme-muted border border-dashed border-theme p-2 rounded-lg text-center bg-theme-secondary/50">
                                                        Task Sealed
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {complaints.length === 0 && (
                        <div className="text-center py-20 flex flex-col items-center border-t border-theme">
                            <CheckCircle size={32} className="text-green-500 opacity-60 mb-4" />
                            <h3 className="text-lg font-bold tracking-tight text-theme mb-2">Queue Empty</h3>
                            <p className="text-theme-muted text-sm font-light">All assigned civic anomalies have been processed.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
