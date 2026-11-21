'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { departmentAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import AppellateAdjudicationModal from '@/components/AppellateAdjudicationModal';
import {
    Scale, ShieldAlert, CheckCircle2, Clock,
    AlertTriangle, RefreshCw, Loader2, ChevronRight,
    ArrowUpRight, FileText, User
} from 'lucide-react';

export default function SupervisorAppellateConsole() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [appeals, setAppeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [filterLevel, setFilterLevel] = useState('all');

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
        if (!authLoading && user && !['supervisor', 'admin', 'super_admin'].includes(user.role)) {
            router.push('/department');
        }
    }, [user, authLoading, router]);

    const fetchAppeals = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch appeals queue from department tasks
            const tasks = await departmentAPI.getTasks('appeals');
            setAppeals(tasks || []);
        } catch (err) {
            setError(err.message || 'Failed to load appellate records');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user && ['supervisor', 'admin', 'super_admin'].includes(user.role)) {
            fetchAppeals();
        }
    }, [user, fetchAppeals]);

    const filteredAppeals = appeals.filter(a => {
        if (filterLevel === 'l1') return a.status === 'appealed_l1';
        if (filterLevel === 'l2') return a.status === 'appealed_l2';
        return true;
    });

    const l1Count = appeals.filter(a => a.status === 'appealed_l1').length;
    const l2Count = appeals.filter(a => a.status === 'appealed_l2').length;
    const breachedCount = appeals.filter(a => a.sla_breached).length;

    if (authLoading || (loading && appeals.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                <Loader2 className="animate-spin text-navy" size={36} />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Loading Appellate Authority Console…
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5">
                <div>
                    <div className="breadcrumb mb-1">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Appellate Authority Desk</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-navy text-white">
                            <Scale size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                                Appellate Adjudication & Oversight Desk
                            </h1>
                            <p className="text-xs text-gray-500">
                                द्वितीयक अपीलीय एवं पर्यवेक्षी पीठ — Official adjudication console for contested civic grievance resolutions
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={fetchAppeals}
                    className="btn-outline text-xs px-3.5 py-2 flex items-center gap-1.5"
                >
                    <RefreshCw size={13} />
                    <span>Refresh Dossiers</span>
                </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="metric-card mc-navy">
                    <div className="metric-number">{appeals.length}</div>
                    <div className="metric-label">Total Active Appeals</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">कुल लंबित अपीलें</div>
                </div>
                <div className="metric-card mc-saffron">
                    <div className="metric-number">{l1Count}</div>
                    <div className="metric-label">Level 1 Nodal Review</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">प्रथम अपीलीय समीक्षा</div>
                </div>
                <div className="metric-card mc-purple">
                    <div className="metric-number">{l2Count}</div>
                    <div className="metric-label">Level 2 Appellate Review</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">द्वितीय अपीलीय पीठ</div>
                </div>
                <div className="metric-card mc-red">
                    <div className="metric-number">{breachedCount}</div>
                    <div className="metric-label">SLA Breached Appeals</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">समयसीमा उल्लंघित</div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-3">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-2">Queue Filter:</span>
                {[
                    { id: 'all', label: `All Active Appeals (${appeals.length})` },
                    { id: 'l1', label: `Level 1 Nodal (${l1Count})` },
                    { id: 'l2', label: `Level 2 Appellate (${l2Count})` },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setFilterLevel(tab.id)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                            filterLevel === tab.id
                                ? 'bg-navy text-white shadow-xs'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-red-50 text-red-700 text-xs flex items-center gap-2">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                </div>
            )}

            {/* Appeals Queue Table / Cards */}
            {filteredAppeals.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
                    <CheckCircle2 size={40} className="mx-auto text-green-600 mb-2" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Appellate Queue Clean</h3>
                    <p className="text-xs text-gray-500 mt-1">There are no contested grievances awaiting appellate adjudication in this category.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredAppeals.map(complaint => (
                        <div
                            key={complaint.id}
                            className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs hover:border-navy/40 transition space-y-4"
                        >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-xs font-bold text-navy px-2 py-1 rounded bg-navy-light/60">
                                        #{complaint.complaint_number || complaint.id?.slice(0, 8)}
                                    </span>
                                    <Badge status={complaint.status} size="small" />
                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                        {complaint.category || 'General'}
                                    </span>
                                </div>
                                <DeadlineTimer
                                    deadline={complaint.deadline}
                                    createdAt={complaint.created_at}
                                    priority={complaint.priority}
                                    status={complaint.status}
                                    resolvedAt={complaint.resolved_at}
                                    compact={true}
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="md:col-span-2 space-y-2">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                                        {complaint.title}
                                    </h3>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
                                        {complaint.description}
                                    </p>

                                    {/* Appeal Remarks */}
                                    {complaint.appeal_remarks && (
                                        <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 text-xs">
                                            <span className="font-bold text-rose-800 dark:text-rose-300">Citizen Appeal Grounds: </span>
                                            <span className="text-rose-950 dark:text-rose-200 italic">&ldquo;{complaint.appeal_remarks}&rdquo;</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col justify-between items-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800">
                                    <div className="text-right text-[11px] text-gray-400 space-y-0.5">
                                        <p>Filed: {new Date(complaint.created_at).toLocaleDateString('en-IN')}</p>
                                        {complaint.citizen?.full_name && (
                                            <p className="flex items-center gap-1 justify-end">
                                                <User size={11} />
                                                <span>{complaint.citizen.full_name}</span>
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <Link
                                            href={`/department/complaint/${complaint.id}`}
                                            className="btn-outline text-xs px-3 py-2 flex items-center gap-1"
                                        >
                                            <FileText size={12} />
                                            <span>Full Dossier</span>
                                        </Link>
                                        <button
                                            onClick={() => setSelectedComplaint(complaint)}
                                            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Scale size={13} />
                                            <span>Adjudicate</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Adjudication Modal */}
            <AppellateAdjudicationModal
                isOpen={Boolean(selectedComplaint)}
                onClose={() => setSelectedComplaint(null)}
                complaint={selectedComplaint}
                onSuccess={fetchAppeals}
            />
        </div>
    );
}
