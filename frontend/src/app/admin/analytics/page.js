'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { analyticsAPI } from '@/lib/api';
import { 
    Loader2, TrendingUp, AlertTriangle, ShieldCheck, 
    Activity, Users, ChevronRight, RefreshCw, BarChart3, Clock 
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function AdminAnalyticsDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [performance, setPerformance] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
        if (!authLoading && user && user.role !== 'admin') {
            router.push('/');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user && user.role === 'admin') {
            fetchAnalytics();
        }
    }, [user]);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError('');
        try {
            const [perfData, alertsData] = await Promise.all([
                analyticsAPI.getDepartmentPerformance(30),
                analyticsAPI.getSmartAlerts(7)
            ]);
            setPerformance(perfData || []);
            setAlerts(alertsData || []);
        } catch (err) {
            setError(err.message || 'Failed to load analytics metrics');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center flex-col gap-3">
                <Loader2 className="animate-spin text-[var(--navy)]" size={32} />
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Computing Municipal Analytics…
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* ── Breadcrumb & Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>Admin Oversight</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">City Analytics</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        City-Level Governance Analytics
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        नगरीय विश्लेषण एवं निष्पादन समीक्षा — Real-time SLA monitoring, anomaly alerts & cross-department performance
                    </p>
                </div>
                <button
                    onClick={fetchAnalytics}
                    className="btn-ghost flex items-center gap-1.5 text-xs font-semibold"
                >
                    <RefreshCw size={13} />
                    <span>Refresh Data</span>
                </button>
            </div>

            {error && (
                <div className="gov-alert error mb-6">
                    <AlertTriangle size={16} />
                    <div className="flex-1 flex justify-between items-center">
                        <span>{error}</span>
                        <button onClick={fetchAnalytics} className="underline text-xs font-bold">Retry</button>
                    </div>
                </div>
            )}

            {/* ── Smart Alerts Section ── */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <Activity size={14} /> Smart Anomalies & Predictive Warnings / आसन्न संकट चेतावनी
                    </span>
                    <span className="text-[11px] text-gray-500">Last 7 Days Scan</span>
                </div>
                <div className="p-5">
                    {alerts.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 flex flex-col items-center justify-center gap-2">
                            <ShieldCheck size={28} className="text-green-600 mb-1" />
                            <span className="text-sm font-semibold text-gray-800">All Municipal Sectors Nominal</span>
                            <span className="text-xs text-gray-400">No anomalous spikes or systemic failures detected in recent complaint flows.</span>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-4">
                            {alerts.map(alert => (
                                <div 
                                    key={alert.alert_id} 
                                    className={`p-4 rounded-lg border ${
                                        alert.severity === 'CRITICAL' 
                                            ? 'bg-red-50/60 border-red-200 text-red-900' 
                                            : 'bg-orange-50/60 border-orange-200 text-orange-950'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle size={16} className={alert.severity === 'CRITICAL' ? 'text-red-600' : 'text-orange-600'} />
                                            <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded ${
                                                alert.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'
                                            }`}>
                                                {alert.type || 'ANOMALY'}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">
                                            Severity: {alert.severity}
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-bold mb-1">{alert.title}</h4>
                                    <p className="text-xs leading-relaxed opacity-90 mb-3">{alert.message}</p>
                                    {alert.related_complaint_ids?.length > 0 && (
                                        <div className="text-[10px] font-mono bg-white/70 border border-current/20 px-2.5 py-1 rounded inline-block">
                                            Related Grievances: {alert.related_complaint_ids.join(', ')}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Performance Metrics & Charts ── */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
                {/* Resolution Chart */}
                <div className="gov-section">
                    <div className="gov-section-header">
                        <span className="gov-section-title flex items-center gap-2">
                            <BarChart3 size={14} /> Total vs Resolved Complaints (30 Days)
                        </span>
                    </div>
                    <div className="p-5">
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={performance} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis 
                                        dataKey="department_name" 
                                        tick={{ fontSize: 10, fill: '#4b5563' }} 
                                        tickLine={false} 
                                    />
                                    <YAxis 
                                        tick={{ fontSize: 10, fill: '#4b5563' }} 
                                        tickLine={false} 
                                    />
                                    <RechartsTooltip 
                                        cursor={{ fill: 'rgba(0,0,0,0.03)' }} 
                                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#d1d5db', borderRadius: '6px', fontSize: '12px' }} 
                                    />
                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                    <Bar dataKey="total_complaints" name="Total Logged" fill="#003366" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="resolved_complaints" name="Resolved" fill="#138808" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* SLA & Rating Table */}
                <div className="gov-section flex flex-col">
                    <div className="gov-section-header">
                        <span className="gov-section-title flex items-center gap-2">
                            <Clock size={14} /> Department SLA & Public Rating Matrix
                        </span>
                    </div>
                    <div className="p-0 overflow-x-auto flex-1">
                        <table className="gov-table">
                            <thead>
                                <tr>
                                    <th>Department</th>
                                    <th>SLA Breach Rate</th>
                                    <th>Avg Resolution</th>
                                    <th>Citizen Rating</th>
                                </tr>
                            </thead>
                            <tbody>
                                {performance.map(dept => (
                                    <tr key={dept.department_id}>
                                        <td className="font-semibold text-gray-900">{dept.department_name}</td>
                                        <td>
                                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                dept.sla_breach_rate > 20 
                                                    ? 'bg-red-50 text-red-700 border border-red-200' 
                                                    : dept.sla_breach_rate > 5 
                                                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                                    : 'bg-green-50 text-green-700 border border-green-200'
                                            }`}>
                                                {dept.sla_breach_rate}%
                                            </span>
                                        </td>
                                        <td className="muted">{dept.avg_resolution_time_hours} hrs</td>
                                        <td>
                                            <div className="flex items-center gap-1.5">
                                                <Users size={12} className="text-gray-400" />
                                                <span className="font-bold text-gray-900">
                                                    {dept.avg_citizen_rating > 0 ? `${dept.avg_citizen_rating} / 5` : 'N/A'}
                                                </span>
                                                <span className="text-[10px] text-gray-400">({dept.feedback_count || 0})</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
