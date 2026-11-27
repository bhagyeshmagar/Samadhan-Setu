'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ArrowRight, FileText, Activity,
    MapPin, Users, BarChart3, Info, ShieldCheck,
    ChevronRight, Bell, Lock, Zap, ClipboardCheck
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { complaintsAPI, workflowAPI, departmentAPI, adminAPI } from '@/lib/api';
import {
    computeDashboardSummaryFromComplaints,
    computeDashboardSummaryFromAdminStats,
} from '@/lib/dashboardSummary';
import DashboardSummarySection from '@/components/DashboardSummarySection';

function AnnouncementTicker({ t }) {
    const notices = [
        t('ticker_1'),
        t('ticker_2'),
        t('ticker_3'),
        t('ticker_4'),
        t('ticker_5'),
    ];

    return (
        <div
            className="ticker-wrap flex items-center gap-3"
            role="marquee"
            aria-label={t('notice')}
        >
            <span
                className="shrink-0 flex items-center gap-1.5 font-bold px-3 border-r text-[11px] uppercase tracking-wider"
                style={{ color: 'var(--saffron)', borderColor: 'var(--footer-border)' }}
            >
                <Bell size={11} />
                {t('notice')}
            </span>
            <div className="overflow-hidden flex-1">
                <span className="ticker-content">
                    {notices.join('   ·   ')}
                    &nbsp;&nbsp;&nbsp;
                </span>
            </div>
        </div>
    );
}

export default function Home() {
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();
    const [userSummary, setUserSummary] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState('');

    const fetchLoggedInSummary = useCallback(async (currentUser) => {
        if (!currentUser) return;
        setSummaryLoading(true);
        setSummaryError('');
        try {
            const role = currentUser.role;
            if (role === 'citizen') {
                const list = await complaintsAPI.getMy();
                setUserSummary(computeDashboardSummaryFromComplaints(list, 'citizen'));
            } else if (role === 'nodal_officer' || role === 'officer') {
                const dash = await workflowAPI.getNodalDashboard();
                setUserSummary(computeDashboardSummaryFromComplaints(dash?.complaints || [], 'nodal_officer'));
            } else if (role === 'inspection_officer') {
                const dash = await workflowAPI.getInspectorDashboard();
                setUserSummary(computeDashboardSummaryFromComplaints(dash?.all_tasks || [], 'inspection_officer'));
            } else if (role === 'team_lead') {
                const dash = await workflowAPI.getTeamDashboard();
                setUserSummary(computeDashboardSummaryFromComplaints(dash?.all_orders || [], 'team_lead'));
            } else if (role === 'supervisor') {
                const list = await departmentAPI.getComplaints();
                setUserSummary(computeDashboardSummaryFromComplaints(list || [], 'supervisor'));
            } else if (role === 'admin' || role === 'super_admin') {
                const stats = await adminAPI.getStats();
                setUserSummary(computeDashboardSummaryFromAdminStats(stats));
            } else {
                const list = await complaintsAPI.getMy();
                setUserSummary(computeDashboardSummaryFromComplaints(list, role));
            }
        } catch (err) {
            setSummaryError(err.message || 'Unable to load your dashboard summary right now.');
        } finally {
            setSummaryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading || !user) return;
        let cancelled = false;
        async function init() {
            if (!cancelled) await fetchLoggedInSummary(user);
        }
        init();
        return () => {
            cancelled = true;
        };
    }, [authLoading, user, fetchLoggedInSummary]);

    const stats = [
        { value: t('stat_access_val'), label: t('stat_access_lbl'), color: 'mc-navy' },
        { value: t('stat_ai_val'), label: t('stat_ai_lbl'), color: 'mc-saffron' },
        { value: t('stat_audit_val'), label: t('stat_audit_lbl'), color: 'mc-green' },
        { value: t('stat_mode_val'), label: t('stat_mode_lbl'), color: 'mc-purple' },
    ];

    const tiles = [
        {
            href: '/citizen/lodge',
            icon: <FileText size={22} />,
            label: t('lodge_grievance'),
            desc: t('tile_lodge_desc'),
            tone: 'var(--navy)',
        },
        {
            href: '/citizen/track',
            icon: <Activity size={22} />,
            label: t('track_status'),
            desc: t('tile_track_desc'),
            tone: 'var(--saffron)',
        },
        {
            href: '/citizen/community',
            icon: <Users size={22} />,
            label: t('community'),
            desc: t('tile_community_desc'),
            tone: 'var(--india-green)',
        },
        {
            href: '/admin/analytics',
            icon: <BarChart3 size={22} />,
            label: t('tile_stats'),
            desc: t('tile_stats_desc'),
            tone: 'var(--status-appealed)',
        },
        {
            href: '/department/map',
            icon: <MapPin size={22} />,
            label: t('tile_map'),
            desc: t('tile_map_desc'),
            tone: 'var(--info)',
        },
        {
            href: '/notifications',
            icon: <Info size={22} />,
            label: t('notifications'),
            desc: t('preferences_delivery_logs'),
            tone: 'var(--text-secondary)',
        },
    ];

    const steps = [
        { num: '01', title: t('step1_title'), desc: t('step1_desc') },
        { num: '02', title: t('step2_title'), desc: t('step2_desc') },
        { num: '03', title: t('step3_title'), desc: t('step3_desc') },
    ];

    return (
        <div className="flex flex-col -mt-6 -mx-4 md:-mx-8">

            {/* Announcement Ticker */}
            <AnnouncementTicker t={t} />

            {/* Hero Section */}
            <section
                className="py-12 md:py-16 px-4 md:px-8"
                style={{ background: 'var(--bg-page)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-350 mx-auto grid md:grid-cols-2 gap-10 items-center">

                    {/* Left: Copy */}
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold mb-4" style={{ color: 'var(--text-saffron)' }}>
                            <ShieldCheck size={14} style={{ color: 'var(--india-green)' }} />
                            <span>{t('prototype_badge')}</span>
                        </div>

                        <h1
                            className="text-4xl md:text-5xl font-bold leading-tight mb-3"
                            style={{ color: 'var(--navy)', textWrap: 'balance' }}
                        >
                            {t('hero_title')}
                        </h1>
                        <p
                            className="text-xl md:text-2xl font-medium mb-4"
                            style={{ color: 'var(--saffron)', textWrap: 'balance' }}
                        >
                            {t('hero_subtitle')}
                        </p>
                        <p
                            className="text-base leading-relaxed mb-8 max-w-lg"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            {t('hero_desc')}
                        </p>

                        {/* CTAs */}
                        <div className="flex flex-wrap gap-3">
                            <Link href="/citizen/lodge" className="btn-primary text-sm px-6 py-3 whitespace-nowrap">
                                {t('lodge_grievance')} <ArrowRight size={16} />
                            </Link>
                            <Link href="/citizen/track" className="btn-outline text-sm px-6 py-3 whitespace-nowrap">
                                {t('track_status')}
                            </Link>
                        </div>

                        {/* Quick trust signals */}
                        <div className="flex flex-wrap gap-5 mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <span className="flex items-center gap-1.5">
                                <Lock size={13} style={{ color: 'var(--saffron)' }} />
                                {t('trust_rbac')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Zap size={13} style={{ color: 'var(--saffron)' }} />
                                {t('trust_ai')}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <ClipboardCheck size={13} style={{ color: 'var(--india-green)' }} />
                                {t('trust_audit')}
                            </span>
                        </div>
                    </div>

                    {/* Right: Civic Identity Visual */}
                    <div className="hidden md:flex flex-col gap-4">
                        <div
                            className="rounded-xl flex items-center justify-center p-10 relative overflow-hidden"
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                minHeight: '260px',
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    top: '-36px',
                                    right: '-36px',
                                    width: '150px',
                                    height: '150px',
                                    borderRadius: '50%',
                                    background: 'var(--navy-light)',
                                    opacity: 0.7,
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: '-42px',
                                    left: '-24px',
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    background: 'var(--saffron-light)',
                                    opacity: 0.85,
                                }}
                            />

                            <div className="text-center z-10 space-y-3">
                                <div className="mx-auto w-16 h-16 flex items-center justify-center">
                                    <svg width="60" height="60" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                        <rect
                                            x="0.75"
                                            y="0.75"
                                            width="34.5"
                                            height="34.5"
                                            rx="8"
                                            style={{ fill: 'var(--emblem-bg)', stroke: 'var(--emblem-border)' }}
                                            strokeWidth="1.5"
                                        />
                                        <path d="M6 25C10 16 26 16 30 25" style={{ stroke: 'var(--emblem-arch)' }} strokeWidth="2.5" strokeLinecap="round" />
                                        <path d="M5 24H31" style={{ stroke: 'var(--emblem-stroke)' }} strokeWidth="2" strokeLinecap="round" />
                                        <path d="M12 24V28M18 24V28M24 24V28" style={{ stroke: 'var(--emblem-stroke)' }} strokeWidth="1.5" strokeLinecap="round" />
                                        <circle cx="18" cy="11" r="3" style={{ fill: 'var(--emblem-dot)' }} />
                                    </svg>
                                </div>
                                <p className="text-lg font-bold tracking-tight" style={{ color: 'var(--brand-title)' }}>
                                    {t('app_name')}
                                </p>
                                <p className="text-xs max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
                                    {t('tagline')}
                                </p>
                                <div className="pt-2 text-xs font-semibold" style={{ color: 'var(--india-green)' }}>
                                    {t('system_online')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Personalized Dashboard Summary OR Public Platform Stats */}
            <section
                className="py-8 px-4 md:px-8"
                style={{ background: 'var(--bg-section)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-350 mx-auto">
                    {user ? (
                        <DashboardSummarySection
                            user={user}
                            summary={userSummary}
                            loading={summaryLoading}
                            error={summaryError}
                            onRetry={() => fetchLoggedInSummary(user)}
                            showDashboardLink
                            heading={t('dashboard_summary')}
                        />
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {stats.map((s) => (
                                <div key={s.label} className={`metric-card ${s.color}`}>
                                    <div className="metric-number">{s.value}</div>
                                    <div className="metric-label">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Quick Access Tiles */}
            <section className="py-10 px-4 md:px-8" style={{ background: 'var(--bg-page)' }}>
                <div className="max-w-[1400px] mx-auto">
                    <div className="mb-6">
                        <h2 className="text-lg font-bold" style={{ color: 'var(--navy)' }}>
                            {t('quick_access')}
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {t('quick_access_sub')}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                        {tiles.map((tile) => (
                            <Link key={tile.href + tile.label} href={tile.href} className="action-tile">
                                <div
                                    className="action-tile-icon"
                                    style={{ background: 'var(--navy-light)', color: tile.tone }}
                                >
                                    {tile.icon}
                                </div>
                                <div>
                                    <p className="action-tile-label">{tile.label}</p>
                                    <p className="action-tile-sublabel mt-0.5 line-clamp-2">
                                        {tile.desc}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* How it Works */}
            <section
                className="py-10 px-4 md:px-8"
                style={{ background: 'var(--bg-section)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-[1400px] mx-auto">
                    <div className="mb-8">
                        <h2 className="text-lg font-bold" style={{ color: 'var(--navy)' }}>
                            {t('how_it_works')}
                        </h2>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                            {t('how_it_works_sub')}
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-0 relative">
                        <div
                            className="hidden md:block absolute top-[1.1rem] left-[16%] right-[16%] h-0.5 z-0"
                            style={{ background: 'var(--border-mid)' }}
                        />
                        {steps.map((step, i) => (
                            <div key={step.num} className="flex flex-col items-center text-center px-6 pb-6 relative z-10">
                                <div className="step-circle mb-4 tabular-nums">
                                    {step.num}
                                </div>
                                <h3 className="font-bold text-sm mb-1.5" style={{ color: 'var(--navy)' }}>
                                    {step.title}
                                </h3>
                                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    {step.desc}
                                </p>
                                {i < steps.length - 1 && (
                                    <ChevronRight
                                        size={18}
                                        className="md:hidden mt-4"
                                        style={{ color: 'var(--border-strong)' }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Lower CTA Banner (Slightly warm orange on pitch dark in dark mode) */}
            <section
                className="py-10 px-4 md:px-8"
                style={{
                    background: 'var(--bg-cta-banner)',
                    borderTop: '1px solid var(--footer-border)',
                }}
            >
                <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--footer-heading)' }}>
                            {t('cta_banner_title')}
                        </h2>
                        <p className="text-sm" style={{ color: 'var(--footer-text)' }}>
                            {t('cta_banner_sub')}
                        </p>
                    </div>
                    <div className="flex gap-3 shrink-0">
                        <Link
                            href="/citizen/lodge"
                            className="btn-saffron text-sm px-6 py-3 flex items-center gap-2 whitespace-nowrap"
                        >
                            {t('lodge_grievance')} <ArrowRight size={15} />
                        </Link>
                        <Link
                            href="/login"
                            className="text-sm px-6 py-3 rounded-lg font-medium border transition-colors whitespace-nowrap"
                            style={{
                                borderColor: 'var(--footer-border)',
                                color: 'var(--footer-link-hover)',
                            }}
                        >
                            {t('login')}
                        </Link>
                    </div>
                </div>
            </section>

        </div>
    );
}
