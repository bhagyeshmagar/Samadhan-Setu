'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { adminAPI, aiAPI } from '@/lib/api';
import { useAIServices } from '@/hooks/useAIServices';
import {
    BarChart3, AlertTriangle, CheckCircle, Loader2,
    Sparkles, Activity, Cpu, ShieldCheck, RefreshCw,
    ChevronRight, TrendingUp, Users
} from 'lucide-react';

/* ── Small helper: model status badge ── */
function ModelBadge({ available }) {
    return available ? (
        <span className="badge badge-resolved">
            <span className="badge-dot" /> ONLINE
        </span>
    ) : (
        <span className="badge badge-critical">
            <span className="badge-dot" /> OFFLINE
        </span>
    );
}

/* ── Page section wrapper ── */
function Section({ title, icon, children, action }) {
    return (
        <div className="gov-section mb-6">
            <div className="gov-section-header">
                <span className="gov-section-title flex items-center gap-2">
                    {icon} {title}
                </span>
                {action}
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

export default function AdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [stats, setStats] = useState(null);
    const [summary, setSummary] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modelHealth, setModelHealth] = useState(null);
    const [overrideStats, setOverrideStats] = useState(null);

    const { getInsights, insights, loading: insightsLoading } = useAIServices();

    useEffect(() => {
        if (!authLoading && (!user || user.role !== 'admin')) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    const fetchData = useCallback(async () => {
        try {
            const [statsData, summaryData, deptsData] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getSummary(),
                adminAPI.getDepartments()
            ]);
            setStats(statsData);
            setSummary(summaryData);
            setDepartments(deptsData);
            getInsights();
            aiAPI.getModelHealth().then(d => setModelHealth(d)).catch(() => {});
            aiAPI.getOverrideStats().then(d => setOverrideStats(d)).catch(() => {});
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [getInsights]);

    useEffect(() => {
        if (user?.role === 'admin') fetchData();
    }, [fetchData, user]);

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading dashboard…</p>
                </div>
            </div>
        );
    }

    const highPriorityZones = [
        'Ward 12 - Market Area',
        'Sector 4 - Housing Board',
        'MG Road - Commercial'
    ];

    const resRate = summary?.resolution_rate || 0;

    return (
        <div className="max-w-6xl mx-auto py-6">

            {/* ── Page Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    {/* Breadcrumb */}
                    <div className="breadcrumb mb-2">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Admin Oversight</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        Oversight Dashboard
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        System-wide grievance metrics and AI model health — निगरानी डैशबोर्ड
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Live status */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
                        style={{ background: 'var(--india-green-light)', color: 'var(--india-green)', border: '1px solid var(--india-green)' }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        Systems Nominal
                    </div>
                    <button
                        onClick={fetchData}
                        className="btn-ghost flex items-center gap-1.5 text-xs"
                        title="Refresh data"
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                </div>
            </div>

            {/* ── Error ── */}
            {error && (
                <div className="gov-alert error mb-6">
                    <AlertTriangle size={16} />
                    <div className="flex-1">
                        <span>{error}</span>
                        <button onClick={fetchData} className="ml-3 underline text-xs font-bold">Retry</button>
                    </div>
                </div>
            )}

            {/* ── Top Metrics ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="metric-card mc-navy">
                    <div className="metric-number">{summary?.total_complaints ?? '—'}</div>
                    <div className="metric-label">Total Complaints</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'Noto Sans Devanagari' }}>कुल शिकायतें</div>
                </div>
                <div className="metric-card mc-critical">
                    <div className="metric-number" style={{ color: 'var(--status-critical)' }}>{summary?.active_complaints ?? '—'}</div>
                    <div className="metric-label">Active</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'Noto Sans Devanagari' }}>सक्रिय</div>
                </div>
                <div className="metric-card mc-green">
                    <div className="metric-number" style={{ color: 'var(--india-green)' }}>{summary?.resolved_complaints ?? '—'}</div>
                    <div className="metric-label">Resolved</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'Noto Sans Devanagari' }}>समाधानित</div>
                </div>
                <div className="metric-card mc-saffron">
                    <div className="metric-number">
                        {summary?.tasks_completed ?? '—'}
                        <span className="text-base font-medium" style={{ color: 'var(--text-muted)' }}>
                            /{summary?.total_tasks ?? '?'}
                        </span>
                    </div>
                    <div className="metric-label">Tasks Done</div>
                </div>
                <div className="metric-card mc-navy">
                    <div className="metric-number">{resRate}<span className="text-xl">%</span></div>
                    <div className="metric-label">Resolution Rate</div>
                    {/* Mini progress bar */}
                    <div className="priority-bar mt-2">
                        <div className="priority-bar-fill" style={{
                            width: `${resRate}%`,
                            background: resRate >= 80 ? 'var(--india-green)' : resRate >= 50 ? 'var(--saffron)' : 'var(--status-critical)'
                        }} />
                    </div>
                </div>
            </div>

            {/* ── AI Insights + Categorical Distribution ── */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">

                {/* AI Insights */}
                <Section title="AI Neural Insights" icon={<Sparkles size={12} />}>
                    {insightsLoading ? (
                        <div className="flex items-center gap-3 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <Loader2 className="animate-spin" size={16} />
                            Synthesising pattern data…
                        </div>
                    ) : insights && insights.length > 0 ? (
                        <div className="space-y-3">
                            {insights.map((insight, idx) => (
                                <div key={idx} className="gov-card p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                            {insight.insight_name}
                                        </h4>
                                        <span className="badge badge-progress shrink-0">{insight.category}</span>
                                    </div>
                                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                                        <strong>{insight.support_count}</strong> parallel anomalies across{' '}
                                        {insight.locations?.join(', ')}.
                                    </p>
                                    {insight.top_keywords?.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {insight.top_keywords.map((kw, k) => (
                                                <span key={k} className="text-[10px] px-2 py-0.5 rounded font-medium"
                                                    style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                                                    {kw}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-8 text-center">
                            <Activity size={24} style={{ color: 'var(--border-mid)' }} className="mb-2" />
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No significant anomalies detected</p>
                        </div>
                    )}
                </Section>

                {/* Category Distribution */}
                <Section title="Distribution by Category" icon={<BarChart3 size={12} />}>
                    <div className="space-y-4">
                        {stats?.by_category ? Object.entries(stats.by_category).map(([cat, count]) => {
                            const total = stats.total || 1;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div key={cat}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                                        <span style={{ color: 'var(--text-muted)' }}>{count} ({pct}%)</span>
                                    </div>
                                    <div className="priority-bar">
                                        <div
                                            className="priority-bar-fill medium"
                                            style={{ width: `${pct}%`, background: 'var(--navy)' }}
                                        />
                                    </div>
                                </div>
                            );
                        }) : (
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No category data available.</p>
                        )}
                    </div>
                </Section>
            </div>

            {/* ── Priority + High Priority Zones ── */}
            <div className="grid md:grid-cols-2 gap-6 mb-6">

                {/* Urgency / Priority */}
                <Section title="Urgency Distribution" icon={<TrendingUp size={12} />}>
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: 'Critical', labelHi: 'गंभीर', count: (stats?.by_priority?.critical ?? stats?.by_priority?.Critical ?? stats?.by_priority?.high ?? stats?.by_priority?.High ?? 0), color: 'var(--status-critical)', bg: 'var(--status-critical-bg)' },
                            { label: 'Elevated', labelHi: 'उच्च', count: (stats?.by_priority?.medium ?? stats?.by_priority?.Medium ?? 0), color: 'var(--saffron-dark)', bg: 'var(--saffron-light)' },
                            { label: 'Normal', labelHi: 'सामान्य', count: (stats?.by_priority?.low ?? stats?.by_priority?.Low ?? 0), color: 'var(--india-green)', bg: 'var(--india-green-light)' },
                        ].map(p => (
                            <div key={p.label} className="gov-card p-4 text-center"
                                style={{ borderTop: `3px solid ${p.color}` }}>
                                <div className="text-2xl font-bold mb-1" style={{ color: p.color }}>
                                    {p.count ?? '—'}
                                </div>
                                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                    {p.label}
                                </div>
                                <div className="text-[9px]" style={{ color: 'var(--text-muted)', fontFamily: 'Noto Sans Devanagari' }}>
                                    {p.labelHi}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* High Priority Zones */}
                <Section title="High Priority Sectors" icon={<AlertTriangle size={12} />}>
                    <div className="space-y-2">
                        {highPriorityZones.map((zone, i) => (
                            <div key={i}
                                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm"
                                style={{ background: i === 0 ? 'var(--status-critical-bg)' : 'var(--bg-section)', border: '1px solid var(--border)' }}>
                                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{zone}</span>
                                <span className="badge badge-critical">
                                    <span className="badge-dot" /> Active
                                </span>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>

            {/* ── Departments Table ── */}
            <Section title={`Active Departments (${departments.length})`} icon={<Users size={12} />}
                action={
                    <a href="/admin/departments"
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--navy-light)', color: 'var(--navy)' }}>
                        <ChevronRight size={12} /> Manage
                    </a>
                }>
                {departments.length > 0 ? (
                    <div className="overflow-x-auto rounded-lg overflow-hidden">
                        <table className="gov-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Department Name</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {departments.map(dept => (
                                    <tr key={dept.id}>
                                        <td className="muted font-mono">{dept.code}</td>
                                        <td className="font-semibold">{dept.name}</td>
                                        <td className="muted">{dept.contact_email || '—'}</td>
                                        <td>
                                            <span className="badge badge-resolved">
                                                <span className="badge-dot" /> Active
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>
                        No department data available.
                    </p>
                )}
            </Section>
            {/* ── Management Shortcuts ── */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                {[
                    {
                        href: '/admin/officers',
                        title: 'Officer Management',
                        desc: 'Add, edit, and deactivate field officers',
                        icon: <Users size={20} />,
                        color: 'var(--navy)',
                        bg: 'var(--navy-light)',
                    },
                    {
                        href: '/admin/departments',
                        title: 'Department Management',
                        desc: 'Create and manage government departments',
                        icon: <TrendingUp size={20} />,
                        color: 'var(--india-green)',
                        bg: 'var(--india-green-light)',
                    },
                ].map(card => (
                    <a key={card.href} href={card.href}
                        className="gov-card p-5 flex items-center gap-4 hover:shadow-lg transition-shadow group">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: card.bg, color: card.color }}>
                            {card.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                                {card.title}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {card.desc}
                            </div>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }}
                            className="shrink-0 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                ))}
            </div>

            {/* ── AI Model Health + Override Stats ── */}
            {(modelHealth || overrideStats) && (
                <div className="grid md:grid-cols-2 gap-6">

                    {modelHealth && (
                        <Section title="AI Model Health" icon={<Cpu size={12} />}>
                            <div className="space-y-3">
                                {[
                                    { name: 'DistilBERT (Classification)', key: 'distilbert_available' },
                                    { name: 'SBERT (Similarity)',          key: 'sbert_available' },
                                    { name: 'YOLOv8 (Image Analysis)',     key: 'yolo_available' },
                                ].map(m => (
                                    <div key={m.key} className="flex items-center justify-between py-2 border-b last:border-0"
                                        style={{ borderColor: 'var(--border)' }}>
                                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                                        <ModelBadge available={modelHealth[m.key]} />
                                    </div>
                                ))}
                                <div className="flex justify-between text-xs pt-2" style={{ color: 'var(--text-muted)' }}>
                                    <span>Total Inferences: {modelHealth.total_inferences}</span>
                                    <span>Avg Latency: {modelHealth.avg_latency_ms}ms</span>
                                </div>
                                {modelHealth.fallback_rate > 0 && (
                                    <div className="gov-alert warning text-xs">
                                        <AlertTriangle size={13} />
                                        Fallback rate: {(modelHealth.fallback_rate * 100).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {overrideStats && (
                        <Section title="AI Suggestion Accuracy" icon={<ShieldCheck size={12} />}>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {[
                                    { label: 'Total',     val: overrideStats.total_suggestions, color: 'var(--navy)' },
                                    { label: 'Accepted',  val: overrideStats.accepted,           color: 'var(--india-green)' },
                                    { label: 'Overridden',val: overrideStats.overridden,         color: 'var(--saffron-dark)' },
                                    { label: 'Pending',   val: overrideStats.pending,            color: 'var(--text-muted)' },
                                ].map(s => (
                                    <div key={s.label} className="gov-card p-3 text-center">
                                        <div className="text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
                                        <div className="metric-label">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                                <RefreshCw size={11} />
                                Override rate: {(overrideStats.override_rate * 100).toFixed(1)}%
                            </div>
                        </Section>
                    )}
                </div>
            )}
        </div>
    );
}
