'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import {
    MapPin, ThumbsUp, AlertTriangle, Loader2, RefreshCw,
    Activity, MessageSquare, ChevronRight, ShieldCheck
} from 'lucide-react';

export default function CommunityFeed() {
    const { user } = useAuth();
    const { t, tCategory, locale } = useLanguage();
    const router = useRouter();
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortBy, setSortBy] = useState('recent');
    const [category, setCategory] = useState('');
    const [upvoting, setUpvoting] = useState(null);

    const categories = [
        'All', 'Roads & Transport', 'Water Supply', 'Electricity',
        'Sanitation & Waste', 'Health & Safety', 'General'
    ];

    const fetchComplaints = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await complaintsAPI.getPublicFeed(
                category === 'All' ? '' : category,
                sortBy
            );
            setComplaints(data || []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message || 'Failed to fetch public complaints');
            setComplaints([]);
        } finally {
            setLoading(false);
        }
    }, [category, sortBy]);

    useEffect(() => {
        let cancelled = false;
        Promise.resolve().then(() => {
            if (!cancelled) fetchComplaints();
        });
        return () => {
            cancelled = true;
        };
    }, [fetchComplaints]);

    const handleUpvote = async (id) => {
        if (!user) {
            router.push('/login');
            return;
        }

        setUpvoting(id);
        try {
            const res = await complaintsAPI.upvote(id);
            setComplaints(prev => prev.map(c =>
                c.id === id ? { ...c, upvotes: res?.upvotes !== undefined ? res.upvotes : (c.upvotes || 0) + 1, has_upvoted: true } : c
            ));
        } catch (err) {
            console.error('Upvote failed:', err);
            if (err.message?.includes('credentials')) {
                router.push('/login');
            }
        } finally {
            setUpvoting(null);
        }
    };

    let trendingCategory = 'General';
    let resolutionRate = 0;
    if (complaints.length > 0) {
        const counts = complaints.reduce((acc, c) => {
            acc[c.category] = (acc[c.category] || 0) + 1;
            return acc;
        }, {});
        trendingCategory = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'General';

        const resolvedCount = complaints.filter(c => ['resolved', 'closed'].includes((c.status || '').toLowerCase())).length;
        resolutionRate = Math.round((resolvedCount / complaints.length) * 100);
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* ── Breadcrumb & Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <Link href="/">{t('home')}</Link>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>{t('citizen_services')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('public_grievance_feed')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('public_grievance_feed')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('community_subtitle')}
                    </p>
                </div>
                <button
                    onClick={fetchComplaints}
                    disabled={loading}
                    className="btn-ghost flex items-center gap-2 text-xs font-semibold"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {t('sync_feed')}
                </button>
            </div>

            {/* ── Top Highlights / Metrics Strip ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="metric-card mc-navy">
                    <div className="metric-number tabular-nums">{complaints.length}</div>
                    <div className="metric-label">{t('public_issues_listed')}</div>
                </div>
                <div className="metric-card mc-saffron">
                    <div className="metric-number text-lg truncate" style={{ color: 'var(--text-saffron)' }}>
                        {tCategory(trendingCategory)}
                    </div>
                    <div className="metric-label">{t('high_activity_sector')}</div>
                </div>
                <div className="metric-card mc-green">
                    <div className="metric-number tabular-nums" style={{ color: 'var(--text-green)' }}>
                        {resolutionRate}%
                    </div>
                    <div className="metric-label">{t('community_resolution')}</div>
                </div>
                <div className="metric-card mc-navy flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: 'var(--navy)' }}>
                        <ShieldCheck size={16} style={{ color: 'var(--text-green)' }} />
                        <span>{t('public_accountability')}</span>
                    </div>
                    <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>
                        {t('public_accountability_desc')}
                    </p>
                </div>
            </div>

            {/* ── Layout: Main Feed & Sidebar ── */}
            <div className="flex flex-col lg:flex-row gap-6">
                {/* Main Feed Column */}
                <div className="flex-1 min-w-0">
                    {/* Filter Bar */}
                    <div className="gov-card p-3 mb-6 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                                {t('category')}:
                            </span>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="gov-input text-xs py-1.5 px-3 rounded font-medium cursor-pointer w-auto"
                                style={{ minWidth: '160px' }}
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat === 'All' ? '' : cat}>
                                        {tCategory(cat)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-wider mr-1" style={{ color: 'var(--text-secondary)' }}>
                                {t('sort')}:
                            </span>
                            {[
                                { key: 'recent', label: t('sort_recent') },
                                { key: 'upvotes', label: t('sort_upvotes') },
                                { key: 'priority', label: t('sort_priority') }
                            ].map((sortOption) => {
                                const isActive = sortBy === sortOption.key;
                                return (
                                    <button
                                        key={sortOption.key}
                                        onClick={() => setSortBy(sortOption.key)}
                                        className="px-3 py-1.5 text-xs font-semibold rounded transition-colors cursor-pointer"
                                        style={{
                                            background: isActive ? 'var(--navy)' : 'var(--bg-section)',
                                            color: isActive ? 'var(--primary-ink)' : 'var(--text-secondary)',
                                            border: `1px solid ${isActive ? 'var(--navy)' : 'var(--border)'}`,
                                        }}
                                    >
                                        {sortOption.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="gov-alert error mb-6">
                            <AlertTriangle size={16} />
                            <div className="flex-1 flex justify-between items-center">
                                <span>{error}</span>
                                <button onClick={fetchComplaints} className="font-bold underline text-xs cursor-pointer">
                                    {t('retry')}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading ? (
                        <div className="gov-card py-20 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                {t('loading_public_records')}
                            </p>
                        </div>
                    ) : complaints.length > 0 ? (
                        /* Complaints Feed List */
                        <div className="space-y-4">
                            {complaints.map((complaint) => (
                                <div key={complaint.id} className="gov-card p-5 transition-colors">
                                    <div className="flex flex-col sm:flex-row gap-5">

                                        {/* Upvote Component */}
                                        <div className="flex sm:flex-col items-center justify-center gap-2 sm:w-20 flex-shrink-0 border-b sm:border-b-0 sm:border-r pb-3 sm:pb-0 sm:pr-4"
                                            style={{ borderColor: 'var(--border)' }}>
                                            <button
                                                onClick={() => handleUpvote(complaint.id)}
                                                disabled={upvoting === complaint.id}
                                                title={t('upvote_title')}
                                                className="p-2.5 rounded-lg border transition-all flex items-center justify-center cursor-pointer"
                                                style={{
                                                    background: upvoting === complaint.id || complaint.has_upvoted ? 'var(--navy-light)' : 'var(--bg-section)',
                                                    borderColor: upvoting === complaint.id || complaint.has_upvoted ? 'var(--navy)' : 'var(--border-mid)',
                                                    color: upvoting === complaint.id || complaint.has_upvoted ? 'var(--text-navy)' : 'var(--text-secondary)',
                                                }}
                                            >
                                                {upvoting === complaint.id ? (
                                                    <Loader2 className="animate-spin" size={18} />
                                                ) : (
                                                    <ThumbsUp size={18} />
                                                )}
                                            </button>
                                            <div className="text-center">
                                                <div className="text-lg font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)' }}>
                                                    {complaint.upvotes || 0}
                                                </div>
                                                <div className="text-[9px] uppercase tracking-wider font-semibold mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                    {t('upvotes')}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="badge badge-normal font-semibold">
                                                        {tCategory(complaint.category || 'General')}
                                                    </span>
                                                    {['critical', 'high'].includes((complaint.priority || '').toLowerCase()) && (
                                                        <span className="badge badge-critical flex items-center gap-1">
                                                            <AlertTriangle size={12} /> {t('critical_priority')}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                                                    <span>
                                                        {complaint.created_at
                                                            ? new Date(complaint.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
                                                            : '—'}
                                                    </span>
                                                    <Badge status={complaint.status} />
                                                </div>
                                            </div>

                                            <h3 className="text-base font-bold mb-1 leading-snug" style={{ color: 'var(--navy)' }}>
                                                {complaint.title || complaint.description?.substring(0, 80) || t('lodge_grievance')}
                                            </h3>

                                            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-secondary)' }}>
                                                {complaint.description}
                                            </p>

                                            <div className="flex items-center justify-between text-xs pt-3 border-t"
                                                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                                                <div className="flex items-center gap-1.5 truncate max-w-md">
                                                    <MapPin size={14} className="flex-shrink-0" style={{ color: 'var(--navy)' }} />
                                                    <span className="truncate">{complaint.location || '—'}</span>
                                                </div>
                                                <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                    ID: #{complaint.id?.substring(0, 8)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="gov-card text-center py-16 px-4">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{ background: 'var(--bg-section)', color: 'var(--text-muted)' }}>
                                <MessageSquare size={26} />
                            </div>
                            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                                {t('no_grievances_found')}
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-6" style={{ color: 'var(--text-muted)' }}>
                                {t('no_grievances_found_desc')}
                            </p>
                            <button
                                onClick={() => router.push(user ? '/citizen/lodge' : '/login')}
                                className="btn-gov-primary text-xs"
                            >
                                {user ? t('lodge_grievance') : t('signin_to_lodge')}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div className="w-full lg:w-80 flex-shrink-0 space-y-6">
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2">
                                <Activity size={14} /> {t('ward_intelligence')}
                            </span>
                        </div>
                        <div className="p-4 space-y-4 text-xs">
                            <div className="p-3 rounded border" style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}>
                                <span className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('high_grievance_category')}
                                </span>
                                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                    {tCategory(trendingCategory)}
                                </span>
                            </div>

                            <div className="p-3 rounded border" style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}>
                                <span className="text-[10px] uppercase font-bold block mb-1" style={{ color: 'var(--text-muted)' }}>
                                    {t('community_resolution_rate')}
                                </span>
                                <div className="text-lg font-bold tabular-nums mb-1" style={{ color: 'var(--text-green)' }}>
                                    {resolutionRate}%
                                </div>
                                <div className="priority-bar">
                                    <div
                                        className="priority-bar-fill"
                                        style={{
                                            width: `${resolutionRate}%`,
                                            background: resolutionRate >= 70 ? 'var(--india-green)' : 'var(--saffron)'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="p-3 rounded border leading-relaxed"
                                style={{ background: 'var(--navy-light)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}>
                                <span className="font-bold block mb-1" style={{ color: 'var(--navy)' }}>
                                    {t('citizen_advisory')}:
                                </span>
                                {t('citizen_advisory_desc')}
                            </div>
                        </div>
                    </div>

                    <div className="gov-card p-4 text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                        <h4 className="font-bold uppercase tracking-wider text-[11px]" style={{ color: 'var(--navy)' }}>
                            {t('redressal_guarantee')}
                        </h4>
                        <p className="leading-relaxed">
                            {t('redressal_guarantee_desc')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
