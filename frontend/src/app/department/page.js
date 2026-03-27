'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { departmentAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { AlertTriangle, CheckCircle, MapPin, Loader2, RefreshCw, Eye, Clock, Users } from 'lucide-react';

export default function DepartmentDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [pendingCount, setPendingCount] = useState({ pending: 0, in_progress: 0, total_active: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [statusFilter, setStatusFilter] = useState('Pending');  // Default to pending
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
        // Map to correct enum values
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

    const getPriorityBadge = (priority) => {
        const p = String(priority || 'Low').toLowerCase();
        if (p === 'high') return <span className="flex items-center gap-1 text-[var(--error)] font-bold"><AlertTriangle size={14} /> High</span>;
        if (p === 'medium') return <span className="text-[var(--accent)] font-semibold">Medium</span>;
        return <span className="text-[var(--primary)]">Low</span>;
    };

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={40} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto my-8 px-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-theme">Department Dashboard</h2>
                    <p className="text-sm text-theme-muted mt-1">
                        Welcome, Officer. You have{' '}
                        <span className="font-bold text-[var(--accent)]">{pendingCount.total_active || 0} active</span> tasks.
                    </p>
                </div>

                <div className="flex gap-3 items-center">
                    {/* Refresh */}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-2 bg-theme-tertiary hover:bg-theme-secondary text-theme rounded-lg text-sm transition border border-theme"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>

                    {/* Priority Legend */}
                    <div className="hidden md:flex bg-theme-card p-2 rounded-lg border border-theme shadow-sm gap-4 text-sm text-theme-muted">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[var(--error)]"></div> High
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[var(--accent)]"></div> Medium
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-[var(--primary)]"></div> Low
                        </div>
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-theme rounded-lg text-sm bg-theme-card text-theme shadow-sm focus:ring-2 focus:ring-[var(--primary)] outline-none"
                    >
                        <option value="">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="text-[var(--error)] bg-[var(--error-bg)] border border-red-200 dark:border-red-800 p-4 rounded-lg mb-6 flex items-center justify-between">
                    <span>{typeof error === 'object' ? JSON.stringify(error) : error}</span>
                    <button onClick={fetchData} className="text-sm underline hover:text-red-800 dark:hover:text-red-300">Retry</button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="card-theme rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                            <Clock className="text-red-600 dark:text-red-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-theme-muted">Pending</p>
                            <p className="text-2xl font-bold text-theme">{pendingCount.pending || 0}</p>
                        </div>
                    </div>
                </div>
                <div className="card-theme rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                            <RefreshCw className="text-yellow-600 dark:text-yellow-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-theme-muted">In Progress</p>
                            <p className="text-2xl font-bold text-theme">{pendingCount.in_progress || 0}</p>
                        </div>
                    </div>
                </div>
                <div className="card-theme rounded-xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <CheckCircle className="text-green-600 dark:text-green-500" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-theme-muted">Resolved Today</p>
                            <p className="text-2xl font-bold text-theme">{pendingCount.resolved_today || 0}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="animate-spin text-[var(--primary)]" size={40} />
                </div>
            )}

            {/* Complaints Table */}
            {!loading && (
                <div className="card-theme rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-theme-tertiary text-theme-muted text-xs uppercase font-semibold">
                            <tr>
                                <th className="p-4 border-b border-theme">ID</th>
                                <th className="p-4 border-b border-theme">Priority (AI)</th>
                                <th className="p-4 border-b border-theme">Issue / Location</th>
                                <th className="p-4 border-b border-theme">Deadline</th>
                                <th className="p-4 border-b border-theme text-center">Votes</th>
                                <th className="p-4 border-b border-theme">Status</th>
                                <th className="p-4 border-b border-theme text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm text-theme-secondary">
                            {complaints.map((complaint) => {
                                const statusLower = String(complaint.status || '').toLowerCase().replace(/_/g, ' ');
                                const isResolved = statusLower === 'resolved' || statusLower === 'rejected' || statusLower === 'closed';

                                return (
                                    <tr key={complaint.id} className="hover:bg-theme-tertiary border-b border-theme last:border-0 transition">
                                        <td className="p-4 font-mono text-[var(--primary)]">#{complaint.id}</td>
                                        <td className="p-4">{getPriorityBadge(complaint.priority)}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-theme mb-1">{complaint.category || 'General'}</div>
                                            <div className="truncate max-w-sm text-theme-muted text-sm" title={complaint.description}>
                                                {complaint.description}
                                            </div>
                                            <div className="text-xs text-theme-muted mt-1 flex items-center gap-1">
                                                <MapPin size={12} /> {complaint.location}
                                            </div>
                                            {/* Issue Images */}
                                            {complaint.attachments && complaint.attachments.length > 0 && (
                                                <div className="flex gap-1 mt-2 items-center">
                                                    <span className="text-xs text-red-500 mr-1">📷</span>
                                                    {complaint.attachments.slice(0, 2).map((img, idx) => {
                                                        const imgUrl = typeof img === 'string'
                                                            ? (img.startsWith('http') ? img : `http://127.0.0.1:8000${img}`)
                                                            : (img.path ? `http://127.0.0.1:8000${img.path}` : '');
                                                        return (
                                                            <a key={idx} href={imgUrl} target="_blank" rel="noopener noreferrer">
                                                                <img src={imgUrl} alt={`Issue ${idx + 1}`} className="w-10 h-10 object-cover rounded border-2 border-red-300" />
                                                            </a>
                                                        );
                                                    })}
                                                    {complaint.attachments.length > 2 && (
                                                        <span className="text-xs text-theme-muted">+{complaint.attachments.length - 2}</span>
                                                    )}
                                                </div>
                                            )}
                                            {/* Resolution Proof Images (for resolved) */}
                                            {isResolved && complaint.resolution_proof && (() => {
                                                const proofs = Array.isArray(complaint.resolution_proof)
                                                    ? complaint.resolution_proof
                                                    : (typeof complaint.resolution_proof === 'string' ? JSON.parse(complaint.resolution_proof || '[]') : []);
                                                return proofs.length > 0 && (
                                                    <div className="flex gap-1 mt-1 items-center">
                                                        <span className="text-xs text-green-500 mr-1">✅</span>
                                                        {proofs.slice(0, 2).map((img, idx) => {
                                                            const imgUrl = typeof img === 'string'
                                                                ? (img.startsWith('http') ? img : `http://127.0.0.1:8000${img}`)
                                                                : (img.path ? `http://127.0.0.1:8000${img.path}` : '');
                                                            return (
                                                                <a key={idx} href={imgUrl} target="_blank" rel="noopener noreferrer">
                                                                    <img src={imgUrl} alt={`Proof ${idx + 1}`} className="w-10 h-10 object-cover rounded border-2 border-green-400" />
                                                                </a>
                                                            );
                                                        })}
                                                        {proofs.length > 2 && (
                                                            <span className="text-xs text-theme-muted">+{proofs.length - 2}</span>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-4">
                                            {complaint.deadline ? (
                                                <span className={`text-xs font-medium ${new Date(complaint.deadline) < new Date() ? 'text-red-600' : 'text-blue-600'}`}>
                                                    {new Date(complaint.deadline).toLocaleDateString()}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="font-bold text-[var(--accent)]">{complaint.upvotes || 0}</span>
                                        </td>
                                        <td className="p-4"><Badge status={complaint.status} /></td>
                                        <td className="p-4">
                                            {!isResolved ? (
                                                <div className="flex gap-2 justify-center">
                                                    {statusLower === 'pending' && (
                                                        <button
                                                            onClick={() => handleStatusUpdate(complaint.id, 'IN_PROGRESS', 'Work started')}
                                                            disabled={updating === complaint.id}
                                                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {updating === complaint.id ? <Loader2 className="animate-spin" size={12} /> : null}
                                                            Start
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => router.push(`/department/complaint/${complaint.id}`)}
                                                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm transition flex items-center gap-1"
                                                    >
                                                        <Eye size={12} /> Handle
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-green-600 dark:text-green-500 flex items-center gap-1 justify-center text-xs font-medium">
                                                    <CheckCircle size={14} /> Done
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {complaints.length === 0 && (
                        <div className="text-center py-16 text-theme-muted">
                            <Users size={48} className="mx-auto text-theme-muted mb-4 opacity-50" />
                            <p className="font-medium">No complaints found matching the filter.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
