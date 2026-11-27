'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { analyticsAPI } from '@/lib/api';
import {
    Loader2, AlertTriangle, ShieldCheck,
    Activity, Users, ChevronRight, RefreshCw, BarChart3, Clock,
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
} from 'recharts';

export default function AdminAnalyticsDashboard() {
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const [performance, setPerformance] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
        if (!authLoading && user && user.role !== 'admin' && user.role !== 'super_admin') {
            router.push('/');
        }
    }, [user, authLoading, router]);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [perfData, alertsData] = await Promise.all([
                analyticsAPI.getDepartmentPerformance(30),
                analyticsAPI.getSmartAlerts(7),
            ]);
            setPerformance(perfData || []);
            setAlerts(alertsData || []);
        } catch (err) {
            setError(err.message || 'Failed to load analytics metrics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (user && (user.role === 'admin' || user.role === 'super_admin')) {
            let cancelled = false;
            Promise.resolve().then(() => {
                if (!cancelled) fetchAnalytics();
            });
            return () => {
                cancelled = true;
            };
        }
    }, [user, fetchAnalytics]);

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {t('computing_analytics')}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* Breadcrumb & Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>{t('home')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>{t('admin_oversight')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('analytics')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('city_analytics')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('city_analytics_sub')}
                    </p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    className="btn-ghost flex items-center gap-1.5 text-xs font-semibold"
                >
                    <RefreshCw size={13} />
                    <span>{t('refresh_data')}</span>
                </button>
            </div>

            {error && (
                <div className="gov-alert error mb-6">
                    <AlertTriangle size={16} />
                    <div className="flex-1 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={fetchAnalytics} className="underline text-xs font-bold">{t('retry')}</button>
                    </div>
                </div>
            )}

            {/* Smart Alerts Section */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <Activity size={14} /> {t('smart_anomalies')}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t('last_7_days')}</span>
                </div>
                <div className="p-5">
                    {alerts.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                            <ShieldCheck size={28} className="mb-1" style={{ color: 'var(--status-resolved)' }} />
                            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                {t('all_sectors_nominal')}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {t('all_sectors_nominal_sub')}
                            </span>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {alerts.map(alert => {
                                const isCrit = alert.severity === 'CRITICAL';
                                return (
                                    <div
                                        key={alert.alert_id}
                                        className="p-4 rounded-lg border"
                                        style={{
                                            background: isCrit ? 'var(--status-critical-bg)' : 'var(--status-progress-bg)',
                                            borderColor: isCrit ? 'var(--status-critical)' : 'var(--status-progress)',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle
                                                    size={16}
                                                    style={{ color: isCrit ? 'var(--status-critical)' : 'var(--status-progress)' }}
                                                />
                                                <span
                                                    className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
                                                    style={{
                                                        background: 'var(--bg-card)',
                                                        color: isCrit ? 'var(--status-critical)' : 'var(--status-progress)',
                                                        border: `1px solid ${isCrit ? 'var(--status-critical)' : 'var(--status-progress)'}`,
                                                    }}
                                                >
                                                    {alert.type || 'ANOMALY'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>
                                                {t('severity')}: {alert.severity}
                                            </span>
                                        </div>
                                        <h4 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                                            {alert.title}
                                        </h4>
                                        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                                            {alert.message}
                                        </p>
                                        {alert.related_complaint_ids?.length > 0 && (
                                            <div
                                                className="text-[10px] font-mono px-2.5 py-1 rounded inline-block border"
                                                style={{
                                                    background: 'var(--bg-card)',
                                                    borderColor: 'var(--border-mid)',
                                                    color: 'var(--text-primary)',
                                                }}
                                            >
                                                {t('related_grievances')}: {alert.related_complaint_ids.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Performance Metrics & Charts */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
                {/* Resolution Chart */}
                <div className="gov-section">
                    <div className="gov-section-header">
                        <span className="gov-section-title flex items-center gap-2">
                            <BarChart3 size={14} /> {t('total_vs_resolved_30d')}
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={performance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                    <XAxis
                                        dataKey="department_name"
                                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--border)' }}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                                        tickLine={false}
                                        axisLine={{ stroke: 'var(--border)' }}
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: 'var(--navy-light)' }}
                                        contentStyle={{
                                            backgroundColor: 'var(--bg-card)',
                                            borderColor: 'var(--border-mid)',
                                            color: 'var(--text-primary)',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                        }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        labelStyle={{ color: 'var(--navy)', fontWeight: 700 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px', color: 'var(--text-secondary)' }} />
                                    <Bar dataKey="total_complaints" name={t('stat_total_logged')} fill="var(--navy)" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="resolved_complaints" name={t('resolved')} fill="var(--india-green)" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* SLA & Rating Table */}
                <div className="gov-section flex flex-col">
                    <div className="gov-section-header">
                        <span className="gov-section-title flex items-center gap-2">
                            <Clock size={14} /> {t('dept_sla_matrix')}
                        </span>
                    </div>
                    <div className="p-0 overflow-x-auto flex-1">
                        <table className="gov-table">
                            <thead>
                                <tr>
                                    <th>{t('department')}</th>
                                    <th>{t('sla_breach_rate')}</th>
                                    <th>{t('avg_resolution')}</th>
                                    <th>{t('citizen_rating')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {performance.map(dept => {
                                    const breachStyle =
                                        dept.sla_breach_rate > 20
                                            ? { background: 'var(--status-critical-bg)', color: 'var(--status-critical)', borderColor: 'var(--status-critical)' }
                                            : dept.sla_breach_rate > 5
                                            ? { background: 'var(--status-progress-bg)', color: 'var(--status-progress)', borderColor: 'var(--status-progress)' }
                                            : { background: 'var(--status-resolved-bg)', color: 'var(--status-resolved)', borderColor: 'var(--status-resolved)' };
                                    return (
                                        <tr key={dept.department_id}>
                                            <td className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                {dept.department_name}
                                            </td>
                                            <td>
                                                <span
                                                    className="px-2 py-0.5 rounded text-[11px] font-bold border"
                                                    style={breachStyle}
                                                >
                                                    {dept.sla_breach_rate}%
                                                </span>
                                            </td>
                                            <td className="muted">{dept.avg_resolution_time_hours} {t('hrs')}</td>
                                            <td>
                                                <div className="flex items-center gap-1.5">
                                                    <Users size={12} style={{ color: 'var(--text-muted)' }} />
                                                    <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                                                        {dept.avg_citizen_rating > 0 ? `${dept.avg_citizen_rating} / 5` : 'N/A'}
                                                    </span>
                                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                        ({dept.feedback_count || 0})
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
