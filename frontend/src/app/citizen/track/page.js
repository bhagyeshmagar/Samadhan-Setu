'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { MapPin, Loader2 } from 'lucide-react';

export default function TrackGrievance() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchComplaints();
        }
    }, [user]);

    const fetchComplaints = async () => {
        try {
            const data = await complaintsAPI.getMy();
            setComplaints(data);
        } catch (err) {
            setError(err.message || 'Failed to fetch complaints');
        } finally {
            setLoading(false);
        }
    };

    const getProgressWidth = (status) => {
        const s = String(status || '').toLowerCase().replace(/_/g, ' ');
        if (s === 'resolved' || s === 'closed') return 'w-full bg-green-500';
        if (s === 'in progress' || s === 'assigned') return 'w-2/3 bg-yellow-500';
        if (s === 'rejected') return 'w-full bg-red-500';
        return 'w-1/4 bg-blue-500'; // Pending
    };

    // Helper to get correct image URL
    const getImageUrl = (img) => {
        if (!img) return '';
        // Handle string paths
        if (typeof img === 'string') {
            // Try to parse as JSON if it looks like JSON
            if (img.startsWith('{') || img.startsWith('[')) {
                try {
                    const parsed = JSON.parse(img);
                    return getImageUrl(parsed);
                } catch (e) { }
            }
            if (img.startsWith('http')) return img;
            return `http://127.0.0.1:8000${img}`;
        }
        // Handle object with path property (resolution_proof format)
        if (img && typeof img === 'object') {
            if (img.path) return `http://127.0.0.1:8000${img.path}`;
            if (img.url) return img.url;
        }
        return '';
    };

    // Helper to parse resolution proof which might be stored as JSON string
    const getResolutionProof = (proof) => {
        if (!proof) return [];
        if (Array.isArray(proof)) return proof;
        if (typeof proof === 'string') {
            try {
                const parsed = JSON.parse(proof);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    };

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto my-8 px-4">
            <h2 className="text-2xl font-bold text-theme mb-6">My Grievance History</h2>

            {error && (
                <div className="text-[var(--error)] bg-[var(--error-bg)] p-3 rounded mb-4">{error}</div>
            )}

            {complaints.length === 0 ? (
                <div className="text-center py-12 card-theme rounded text-theme-muted">
                    No grievances found. <a href="/citizen/lodge" className="text-[var(--primary)] font-semibold hover:underline">Lodge your first complaint</a>
                </div>
            ) : (
                <div className="space-y-4">
                    {complaints.map((complaint) => (
                        <div
                            key={complaint.id}
                            className="card-theme card-hover-effect p-5 rounded-lg"
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="font-bold text-lg text-theme">#{complaint.id}</span>
                                        <span className="text-sm text-theme-secondary">• {complaint.category}</span>
                                        <span className="text-sm text-theme-muted">
                                            • {new Date(complaint.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-theme-secondary mb-2">{complaint.description}</p>
                                    <div className="text-sm text-theme-muted flex items-center gap-1 flex-wrap">
                                        <MapPin size={14} />
                                        <span>{complaint.location}</span>
                                        {complaint.latitude && complaint.longitude && (
                                            <>
                                                <span className="text-xs bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1 rounded-lg ml-2 border border-gray-300 dark:border-gray-600 font-mono shadow-sm">
                                                    📍 {complaint.latitude.toFixed(6)}, {complaint.longitude.toFixed(6)}
                                                </span>
                                                <a
                                                    href={`https://www.google.com/maps?q=${complaint.latitude},${complaint.longitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 hover:underline ml-1"
                                                >
                                                    Open in Maps ↗
                                                </a>
                                            </>
                                        )}
                                    </div>

                                    {/* Citizen Attachments */}
                                    {complaint.attachments && complaint.attachments.length > 0 && (
                                        <div className="mt-3">
                                            <h4 className="text-xs font-semibold text-theme-muted uppercase mb-2">📸 Issue Images</h4>
                                            <div className="flex gap-2 flex-wrap">
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
                                                            alt={`Attachment ${idx + 1}`}
                                                            className="w-16 h-16 object-cover rounded-lg border-2 border-blue-300 hover:border-blue-500 transition shadow-sm"
                                                            onError={(e) => { e.target.style.display = 'none'; }}
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-2 ml-4">
                                    <Badge status={complaint.status} />
                                    <div className="text-xs text-theme-muted font-medium">
                                        Priority: {complaint.priority}
                                    </div>
                                    {complaint.deadline && (
                                        <div className={`text-xs font-medium ${new Date(complaint.deadline) < new Date() ? 'text-red-600' : 'text-blue-600'}`}>
                                            Due: {new Date(complaint.deadline).toLocaleDateString()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Status Timeline Bar */}
                            <div className="mt-6 relative">
                                <div className="h-1 w-full bg-theme-tertiary rounded">
                                    <div className={`h-1 rounded transition-all duration-500 ${getProgressWidth(complaint.status)}`}></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-theme-muted mt-1 uppercase font-semibold">
                                    <span>Received</span>
                                    <span>Processing</span>
                                    <span>Resolved</span>
                                </div>
                            </div>

                            {/* Status Logs */}
                            {complaint.status_logs && complaint.status_logs.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-theme">
                                    <h4 className="text-xs font-semibold text-theme-muted uppercase mb-2">Status History</h4>
                                    <div className="space-y-2">
                                        {complaint.status_logs.slice(-3).map((log, idx) => (
                                            <div key={idx} className="text-sm text-theme-secondary flex gap-2">
                                                <span className="text-theme-muted">{new Date(log.created_at).toLocaleDateString()}</span>
                                                <Badge status={log.status} size="small" />
                                                {log.remarks && <span>- {log.remarks}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Resolution Details - Before/After Comparison */}
                            {(complaint.status === 'Resolved' || complaint.status === 'RESOLVED' || complaint.status.toLowerCase() === 'resolved') && (
                                <div className="mt-4 pt-4 border-t-2 border-green-300">
                                    {/* Before/After Images Comparison */}
                                    <div className="bg-gradient-to-r from-red-50 to-green-50 dark:from-red-900/20 dark:to-green-900/20 p-4 rounded-xl border border-theme mb-4">
                                        <h4 className="text-sm font-bold text-theme uppercase mb-4 text-center">📊 Before & After Resolution</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Before - Issue Images */}
                                            <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg border-2 border-red-300">
                                                <h5 className="text-xs font-bold text-red-700 dark:text-red-300 uppercase mb-2 flex items-center gap-1">
                                                    ❌ Before (Issue Reported)
                                                </h5>
                                                {complaint.attachments && complaint.attachments.length > 0 ? (
                                                    <div className="flex gap-2 flex-wrap">
                                                        {complaint.attachments.map((img, idx) => (
                                                            <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer">
                                                                <img
                                                                    src={getImageUrl(img)}
                                                                    alt={`Before ${idx + 1}`}
                                                                    className="w-24 h-24 object-cover rounded-lg border-2 border-red-400 shadow-md"
                                                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/96?text=No+Image'; }}
                                                                />
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-red-500 italic">No issue images uploaded</p>
                                                )}
                                            </div>

                                            {/* After - Resolution Proof */}
                                            <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border-2 border-green-300">
                                                <h5 className="text-xs font-bold text-green-700 dark:text-green-300 uppercase mb-2 flex items-center gap-1">
                                                    ✅ After (Issue Resolved)
                                                </h5>
                                                {(() => {
                                                    const proofImages = getResolutionProof(complaint.resolution_proof);
                                                    return proofImages.length > 0 ? (
                                                        <div className="flex gap-2 flex-wrap">
                                                            {proofImages.map((img, idx) => (
                                                                <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer">
                                                                    <img
                                                                        src={getImageUrl(img)}
                                                                        alt={`After ${idx + 1}`}
                                                                        className="w-24 h-24 object-cover rounded-lg border-2 border-green-400 shadow-md"
                                                                        onError={(e) => { e.target.src = 'https://via.placeholder.com/96?text=No+Image'; }}
                                                                    />
                                                                </a>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-green-500 italic">No resolution proof uploaded</p>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Resolution Remarks */}
                                    {complaint.resolution_remarks && (
                                        <div className="mb-4">
                                            <h4 className="text-xs font-semibold text-theme-muted uppercase mb-2">Officer Remarks</h4>
                                            <p className="text-sm text-theme-secondary bg-green-50 dark:bg-green-900/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                                                {complaint.resolution_remarks}
                                            </p>
                                        </div>
                                    )}

                                    {/* Rating Section */}
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Rate This Resolution</h4>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">Was this issue resolved to your satisfaction?</p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await complaintsAPI.rateResolution(complaint.id, 'satisfied');
                                                        fetchComplaints();
                                                    } catch (err) {
                                                        setError(err.message);
                                                    }
                                                }}
                                                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                                            >
                                                👍 Satisfied
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await complaintsAPI.rateResolution(complaint.id, 'unsatisfied');
                                                        fetchComplaints();
                                                    } catch (err) {
                                                        setError(err.message);
                                                    }
                                                }}
                                                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                                            >
                                                👎 Not Satisfied
                                            </button>
                                        </div>
                                        {(complaint.resolution_upvotes > 0 || complaint.resolution_downvotes > 0) && (
                                            <div className="mt-3 text-xs text-theme-muted">
                                                Ratings: 👍 {complaint.resolution_upvotes || 0} | 👎 {complaint.resolution_downvotes || 0}
                                                {complaint.needs_reconsideration && (
                                                    <span className="ml-2 text-red-600 font-semibold">⚠️ Marked for Reconsideration</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
