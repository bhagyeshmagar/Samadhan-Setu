'use client';

import Link from 'next/link';
import {
    ArrowRight, FileText, Activity, CheckCircle,
    MapPin, Users, BarChart3, Info, ShieldCheck,
    ChevronRight, Bell
} from 'lucide-react';

/* ── Announcement Ticker ── */
const NOTICES = [
    '📢 AI-assisted complaint routing is now live — complaints are auto-classified and routed in under 2 seconds.',
    '📋 New: Officers can now view AI priority explanations for each complaint.',
    '✅ Resolution rate improved to 94% in the last 30 days.',
    '🗓️ Portal maintenance scheduled: Sunday 2 AM – 4 AM IST.',
    '📱 File grievances now available on mobile — optimised for all devices.',
];

function AnnouncementTicker() {
    return (
        <div
            className="ticker-wrap flex items-center gap-3"
            role="marquee"
            aria-label="Important announcements"
        >
            <span
                className="shrink-0 flex items-center gap-1.5 font-bold text-accent px-3 border-r border-white/20 text-[11px] uppercase tracking-wider"
            >
                <Bell size={11} />
                Notice
            </span>
            <div className="overflow-hidden flex-1">
                <span className="ticker-content">
                    {NOTICES.join('   •   ')}
                    &nbsp;&nbsp;&nbsp;
                </span>
            </div>
        </div>
    );
}

/* ── Stats (will be replaced with real API data in Phase 1) ── */
const STATS = [
    { value: '98%',    label: 'Routing Accuracy',    labelHi: 'रूटिंग सटीकता',    color: 'mc-navy' },
    { value: '<2s',    label: 'AI Classification',   labelHi: 'AI वर्गीकरण',       color: 'mc-saffron' },
    { value: '94%',    label: 'Resolution Rate',     labelHi: 'समाधान दर',         color: 'mc-green' },
    { value: 'Live',   label: 'System Status',       labelHi: 'सिस्टम स्थिति',    color: 'mc-purple' },
];

/* ── Quick Action Tiles ── */
const TILES = [
    {
        href: '/citizen/lodge',
        icon: <FileText size={22} />,
        label: 'Lodge Grievance',
        labelHi: 'शिकायत दर्ज करें',
        desc: 'File a new civic complaint',
        color: 'var(--navy)',
    },
    {
        href: '/citizen/track',
        icon: <Activity size={22} />,
        label: 'Track Status',
        labelHi: 'स्थिति ट्रैक करें',
        desc: 'Follow your complaint live',
        color: 'var(--saffron)',
    },
    {
        href: '/citizen/community',
        icon: <Users size={22} />,
        label: 'Community',
        labelHi: 'समुदाय',
        desc: 'View public complaints & upvote',
        color: 'var(--india-green)',
    },
    {
        href: '#',
        icon: <BarChart3 size={22} />,
        label: 'Statistics',
        labelHi: 'सांख्यिकी',
        desc: 'District-level resolution data',
        color: '#7C3AED',
    },
    {
        href: '#',
        icon: <MapPin size={22} />,
        label: 'District Map',
        labelHi: 'जिला मानचित्र',
        desc: 'Heatmap of active complaints',
        color: '#0891B2',
    },
    {
        href: '#',
        icon: <Info size={22} />,
        label: 'About',
        labelHi: 'के बारे में',
        desc: 'Platform overview & guidelines',
        color: 'var(--text-muted)',
    },
];

/* ── Process Steps ── */
const STEPS = [
    {
        num: '01',
        title: 'Submit',
        titleHi: 'जमा करें',
        desc: 'File your civic grievance with description, location & photos.',
    },
    {
        num: '02',
        title: 'AI Routes',
        titleHi: 'AI रूट करता है',
        desc: 'Our AI classifies, prioritises and routes to the right department instantly.',
    },
    {
        num: '03',
        title: 'Officer Acts',
        titleHi: 'अधिकारी कार्रवाई करता है',
        desc: 'Assigned officer resolves the issue within mandated SLA with full accountability.',
    },
];

export default function Home() {
    return (
        <div className="flex flex-col -mt-6 -mx-4 md:-mx-8">

            {/* ── Announcement Ticker ── */}
            <AnnouncementTicker />

            {/* ── Hero Section ── */}
            <section
                className="py-12 md:py-16 px-4 md:px-8"
                style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-350 mx-auto grid md:grid-cols-2 gap-10 items-center">

                    {/* Left: Text */}
                    <div>
                        {/* Official badge */}
                        <div className="inline-flex items-center gap-1.5 mb-5 px-3 py-1.5 rounded-full text-xs font-semibold"
                            style={{ background: 'var(--navy-light)', color: 'var(--navy)', border: '1px solid rgba(0,53,128,0.15)' }}
                        >
                            <ShieldCheck size={13} style={{ color: 'var(--india-green)' }} />
                            Government of India — Authorised Portal
                        </div>

                        <h1
                            className="text-4xl md:text-5xl font-bold leading-tight mb-2"
                            style={{ color: 'var(--navy)' }}
                        >
                            File your grievance.
                        </h1>
                        <p
                            className="text-2xl font-medium mb-5"
                            style={{
                                color: 'var(--saffron)',
                                fontFamily: "'Noto Sans Devanagari', sans-serif",
                            }}
                        >
                            अपनी शिकायत दर्ज करें।
                        </p>
                        <p
                            className="text-base leading-relaxed mb-8 max-w-lg"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            Transparent, accountable, AI-powered civic grievance resolution —
                            bridging citizens and local administration.
                        </p>

                        {/* CTAs */}
                        <div className="flex flex-wrap gap-3">
                            <Link href="/citizen/lodge" className="btn-primary text-sm px-6 py-3">
                                Lodge Grievance <ArrowRight size={16} />
                            </Link>
                            <Link href="/citizen/track" className="btn-outline text-sm px-6 py-3">
                                Track Status
                            </Link>
                        </div>

                        {/* Quick trust signals */}
                        <div className="flex flex-wrap gap-4 mt-8">
                            {[
                                { icon: '🔒', text: 'Secure & encrypted' },
                                { icon: '⚡', text: 'AI-routed in 2 seconds' },
                                { icon: '📊', text: 'Full audit trail' },
                            ].map(t => (
                                <div key={t.text} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <span>{t.icon}</span>
                                    <span>{t.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Illustration placeholder with stats */}
                    <div className="hidden md:flex flex-col gap-4">
                        {/* Faux illustration area */}
                        <div
                            className="rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, var(--navy-xlight) 0%, #EEF9EF 100%)',
                                border: '1px solid var(--border)',
                                minHeight: '240px',
                                position: 'relative',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Decorative geometric shapes */}
                            <div style={{
                                position: 'absolute', top: '-20px', right: '-20px',
                                width: '120px', height: '120px', borderRadius: '50%',
                                background: 'rgba(0,53,128,0.06)',
                            }} />
                            <div style={{
                                position: 'absolute', bottom: '-30px', left: '-15px',
                                width: '90px', height: '90px', borderRadius: '50%',
                                background: 'rgba(255,153,51,0.08)',
                            }} />

                            <div className="text-center z-10 p-8">
                                <div className="text-6xl mb-4">🏛️</div>
                                <p className="text-sm font-semibold" style={{ color: 'var(--navy)' }}>
                                    Samadhan Setu
                                </p>
                                <p className="text-xs mt-1" style={{
                                    color: 'var(--text-muted)',
                                    fontFamily: "'Noto Sans Devanagari', sans-serif"
                                }}>
                                    AI Grievance Redressal Platform
                                </p>
                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <span className="inline-block w-3 h-3 rounded-full" style={{ background: 'var(--india-green)' }} />
                                    <span className="text-xs" style={{ color: 'var(--india-green)', fontWeight: 600 }}>
                                        System Online
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Stats Row ── */}
            <section
                className="py-8 px-4 md:px-8"
                style={{ background: 'var(--bg-section)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-350 mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {STATS.map((s) => (
                            <div key={s.label} className={`metric-card ${s.color}`}>
                                <div className="metric-number">{s.value}</div>
                                <div className="metric-label">{s.label}</div>
                                <div
                                    className="text-[10px] mt-0.5"
                                    style={{ color: 'var(--text-muted)', fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                                >
                                    {s.labelHi}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Quick Access Tiles ── */}
            <section className="py-10 px-4 md:px-8" style={{ background: 'var(--bg-card)' }}>
                <div className="max-w-[1400px] mx-auto">
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--saffron)' }} />
                            <h2 className="text-lg font-bold" style={{ color: 'var(--navy)' }}>
                                Quick Access
                            </h2>
                        </div>
                        <p className="text-sm ml-3" style={{ color: 'var(--text-muted)' }}>
                            Everything you need — शीघ्र पहुँच
                        </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                        {TILES.map((tile) => (
                            <Link key={tile.label} href={tile.href} className="action-tile">
                                <div
                                    className="action-tile-icon"
                                    style={{ background: `${tile.color}15`, color: tile.color }}
                                >
                                    {tile.icon}
                                </div>
                                <div>
                                    <p className="action-tile-label">{tile.label}</p>
                                    <p
                                        className="text-[10px] mt-0.5"
                                        style={{
                                            color: 'var(--text-muted)',
                                            fontFamily: "'Noto Sans Devanagari', sans-serif",
                                        }}
                                    >
                                        {tile.labelHi}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── How it Works ── */}
            <section
                className="py-10 px-4 md:px-8"
                style={{ background: 'var(--bg-section)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
            >
                <div className="max-w-[1400px] mx-auto">
                    <div className="mb-8">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-5 rounded-full" style={{ background: 'var(--navy)' }} />
                            <h2 className="text-lg font-bold" style={{ color: 'var(--navy)' }}>
                                How it works
                            </h2>
                        </div>
                        <p className="text-sm ml-3" style={{ color: 'var(--text-muted)' }}>
                            3 simple steps — यह कैसे काम करता है
                        </p>
                    </div>

                    {/* Steps */}
                    <div className="grid md:grid-cols-3 gap-0 relative">
                        {/* Connecting line (desktop only) */}
                        <div
                            className="hidden md:block absolute top-[1.1rem] left-[16%] right-[16%] h-0.5 z-0"
                            style={{ background: 'var(--border-mid)' }}
                        />
                        {STEPS.map((step, i) => (
                            <div key={step.num} className="flex flex-col items-center text-center px-6 pb-6 relative z-10">
                                <div className="step-circle mb-4">
                                    {step.num}
                                </div>
                                <h3 className="font-bold text-sm mb-0.5" style={{ color: 'var(--navy)' }}>
                                    {step.title}
                                </h3>
                                <p
                                    className="text-[11px] mb-2"
                                    style={{
                                        color: 'var(--saffron-dark)',
                                        fontFamily: "'Noto Sans Devanagari', sans-serif",
                                    }}
                                >
                                    {step.titleHi}
                                </p>
                                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                    {step.desc}
                                </p>
                                {i < STEPS.length - 1 && (
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

            {/* ── CTA Banner ── */}
            <section
                className="py-10 px-4 md:px-8"
                style={{ background: 'var(--navy)' }}
            >
                <div className="max-w-[1400px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">
                            Have a civic issue to report?
                        </h2>
                        <p className="text-sm text-white/60">
                            It takes less than 2 minutes. AI does the rest.
                        </p>
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                        <Link
                            href="/citizen/lodge"
                            className="btn-saffron text-sm px-6 py-3 flex items-center gap-2"
                        >
                            Lodge Grievance <ArrowRight size={15} />
                        </Link>
                        <Link
                            href="/login"
                            className="btn-ghost text-sm px-6 py-3 text-white border-white/30 hover:bg-white/10"
                        >
                            Sign In
                        </Link>
                    </div>
                </div>
            </section>

        </div>
    );
}
