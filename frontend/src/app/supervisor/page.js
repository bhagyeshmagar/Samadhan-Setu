'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { departmentAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import DeadlineTimer from '@/components/DeadlineTimer';
import AppellateAdjudicationModal from '@/components/AppellateAdjudicationModal';
import {
    Scale, CheckCircle2, AlertTriangle, RefreshCw, Loader2,
    ChevronRight, FileText, User
} from 'lucide-react';

export default function SupervisorAppellateConsole() {
    const { user, loading: authLoading } = useAuth();
    const { t, tCategory, locale } = useLanguage();
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
            let cancelled = false;
            Promise.resolve().then(() => {
                if (!cancelled) fetchAppeals();
            });
            return () => {
                cancelled = true;
            };
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
                <Loader2 className="animate-spin" size={36} style={{ color: 'var(--navy)' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {t('loading')}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5"
                style={{ borderColor: 'var(--border)' }}>
                <div>
                    <div className="breadcrumb mb-1">
                        <Link href="/">{t('home')}</Link>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('appellate_desk')}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl"
                            style={{ background: 'var(--navy)', color: 'var(--primary-ink)' }}>
                            <Scale size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                                {t('supervisor_title')}
                            </h1>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('supervisor_sub')}
                            </p>
                        </div>
                    </div>
                </div>

                <button
                    onClick={fetchAppeals}
                    className="btn-outline text-xs px-3.5 py-2 flex items-center gap-1.5"
                >
                    <RefreshCw size={13} />
                    <span>{t('refresh_dossiers')}</span>
                </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="metric-card mc-navy">
                    <div className="metric-number tabular-nums">{appeals.length}</div>
                    <div className="metric-label">{t('total_active_appeals')}</div>
                </div>
                <div className="metric-card mc-saffron">
                    <div className="metric-number tabular-nums" style={{ color: 'var(--text-saffron)' }}>{l1Count}</div>
                    <div className="metric-label">{t('level1_nodal_review')}</div>
                </div>
                <div className="metric-card mc-navy">
                    <div className="metric-number tabular-nums" style={{ color: 'var(--status-appealed)' }}>{l2Count}</div>
                    <div className="metric-label">{t('level2_appellate_review')}</div>
                </div>
                <div className="metric-card mc-critical">
                    <div className="metric-number tabular-nums" style={{ color: 'var(--status-critical)' }}>{breachedCount}</div>
                    <div className="metric-label">{t('sla_breached_appeals')}</div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <span className="text-xs font-bold uppercase tracking-wider mr-2" style={{ color: 'var(--text-muted)' }}>
                    {t('queue_filter')}:
                </span>
                {[
                    { id: 'all', label: `${t('all_active_appeals')} (${appeals.length})` },
                    { id: 'l1', label: `${t('level1_nodal')} (${l1Count})` },
                    { id: 'l2', label: `${t('level2_appellate')} (${l2Count})` },
                ].map(tab => {
                    const isActive = filterLevel === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setFilterLevel(tab.id)}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
                            style={{
                                background: isActive ? 'var(--navy)' : 'var(--bg-section)',
                                color: isActive ? 'var(--primary-ink)' : 'var(--text-secondary)',
                                border: `1px solid ${isActive ? 'var(--navy)' : 'var(--border)'}`,
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {error && (
                <div className="gov-alert error text-xs">
                    <AlertTriangle size={15} />
                    <span>{error}</span>
                </div>
            )}

            {/* Appeals Queue Cards */}
            {filteredAppeals.length === 0 ? (
                <div className="gov-card text-center py-16 px-4">
                    <CheckCircle2 size={40} className="mx-auto mb-2" style={{ color: 'var(--text-green)' }} />
                    <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                        {t('no_grievances_found')}
                    </h3>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {t('no_grievances_found_desc')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredAppeals.map(complaint => (
                        <div
                            key={complaint.id}
                            className="gov-card p-5 space-y-4"
                        >
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-3"
                                style={{ borderColor: 'var(--border)' }}>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-mono text-xs font-bold px-2 py-1 rounded"
                                        style={{ color: 'var(--navy)', background: 'var(--navy-light)' }}>
                                        #{complaint.complaint_number || complaint.id?.slice(0, 8)}
                                    </span>
                                    <Badge status={complaint.status} size="small" />
                                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                                        {tCategory(complaint.category || 'General')}
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
                                    <h3 className="text-sm font-bold" style={{ color: 'var(--navy)' }}>
                                        {complaint.title}
                                    </h3>
                                    <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        {complaint.description}
                                    </p>

                                    {/* Appeal Remarks */}
                                    {complaint.appeal_remarks && (
                                        <div className="p-3 rounded-xl border text-xs"
                                            style={{
                                                background: 'var(--status-appealed-bg)',
                                                borderColor: 'var(--status-appealed)',
                                                color: 'var(--text-primary)',
                                            }}>
                                            <span className="font-bold" style={{ color: 'var(--status-appealed)' }}>
                                                {t('appeals')}:{' '}
                                            </span>
                                            <span className="italic">&ldquo;{complaint.appeal_remarks}&rdquo;</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col justify-between items-end gap-3 pt-2 md:pt-0 border-t md:border-t-0"
                                    style={{ borderColor: 'var(--border)' }}>
                                    <div className="text-right text-[11px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                                        <p>{new Date(complaint.created_at).toLocaleDateString(locale)}</p>
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
                                            <span>{t('view')}</span>
                                        </Link>
                                        <button
                                            onClick={() => setSelectedComplaint(complaint)}
                                            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Scale size={13} />
                                            <span>{t('appeals')}</span>
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
