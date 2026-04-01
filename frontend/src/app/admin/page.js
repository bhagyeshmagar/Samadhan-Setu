'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { adminAPI } from '@/lib/api';
import { useAIServices } from '@/hooks/useAIServices';
import { BarChart3, AlertTriangle, Users, CheckCircle, Loader2, Sparkles, Activity } from 'lucide-react';

export default function AdminDashboard() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [stats, setStats] = useState(null);
    const [summary, setSummary] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const { getInsights, insights, loading: insightsLoading } = useAIServices();

    useEffect(() => {
        if (!authLoading && (!user || user.role !== 'admin')) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
        try {
            const [statsData, summaryData, deptsData] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getSummary(),
                adminAPI.getDepartments()
            ]);
            setStats(statsData);
            setSummary(summaryData);
            setDepartments(deptsData);

            // Non-blocking AI insights fetch
            getInsights();
        } catch (err) {
            setError(err.message || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading || loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="animate-spin text-theme opacity-50" size={32} />
            </div>
        );
    }

    const highPriorityZones = [
        'Ward 12 - Market Area',
        'Sector 4 - Housing Board',
        'MG Road - Commercial'
    ];

    return (
        <div className="max-w-6xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b border-theme pb-6">
                <div>
                    <h2 className="text-4xl font-bold tracking-tight text-theme mb-2">Oversight Command</h2>
                    <p className="text-sm font-light text-theme-muted">Global civic system metrics and AI pattern recognition.</p>
                </div>
                <div className="px-3 py-1 bg-theme-secondary/80 backdrop-blur-sm border border-theme rounded-full flex items-center gap-2 text-[10px] tracking-widest uppercase font-bold text-theme">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></span> Systems Nominal
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm mb-6 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={fetchData} className="text-xs uppercase tracking-wider font-bold underline">Retry</button>
                </div>
            )}

            {/* Top Level Telemetry */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="glass-panel p-6 flex flex-col justify-between h-32">
                    <div className="text-[10px] text-theme-muted font-bold tracking-widest uppercase break-words leading-tight">Total Volume</div>
                    <div className="text-4xl md:text-5xl font-bold text-theme tracking-tighter">{summary?.total_complaints || 0}</div>
                </div>
                <div className="glass-panel p-6 flex flex-col justify-between h-32 border-l-2 border-l-red-500">
                    <div className="text-[10px] text-red-500 font-bold tracking-widest uppercase break-words leading-tight">Action Pending</div>
                    <div className="text-4xl md:text-5xl font-bold text-theme tracking-tighter">{summary?.pending_action || 0}</div>
                </div>
                <div className="glass-panel p-6 flex flex-col justify-between h-32 border-l-2 border-l-green-500">
                    <div className="text-[10px] text-green-500 font-bold tracking-widest uppercase break-words leading-tight">Resolved Issues</div>
                    <div className="text-4xl md:text-5xl font-bold text-theme tracking-tighter">{summary?.resolved || 0}</div>
                </div>
                <div className="glass-panel p-6 flex flex-col justify-between h-32 relative overflow-hidden">
                    <div className="text-[10px] text-theme-muted font-bold tracking-widest uppercase break-words leading-tight">Efficacy Rate</div>
                    <div className="text-4xl md:text-5xl font-bold text-theme tracking-tighter">
                        {summary?.resolution_rate || 0}<span className="text-2xl text-theme-muted">%</span>
                    </div>
                </div>
            </div>

            {/* AI Insights Engine - Massive Redesign */}
            <div className="glass-panel p-8 mb-8 border-dashed">
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-full bg-theme-tertiary border border-theme flex items-center justify-center">
                        <Sparkles size={16} className="text-theme opacity-80" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-theme">Neural Insights</h3>
                        <p className="text-[10px] tracking-widest uppercase font-bold text-theme-muted">Pattern Recognition Engine</p>
                    </div>
                </div>

                {insightsLoading ? (
                    <div className="flex items-center gap-4 py-8 px-4 border border-theme border-dashed rounded-xl opacity-50">
                        <Loader2 className="animate-spin text-theme" size={20} /> 
                        <span className="text-xs font-bold tracking-widest uppercase text-theme">Synthesizing data streams...</span>
                    </div>
                ) : insights && insights.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-6">
                        {insights.map((insight, idx) => (
                            <div key={idx} className="p-6 bg-theme-secondary/50 border border-theme rounded-xl hover:border-theme-muted transition-colors group">
                                <h4 className="text-sm font-bold text-theme mb-3 tracking-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                                    {insight.insight_name}
                                </h4>
                                <p className="text-xs text-theme-secondary mb-4 leading-relaxed font-light">
                                    Identified <strong className="text-theme font-semibold">{insight.support_count} parallel anomalies</strong> across {insight.locations.join(', ')}.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-widest bg-theme-tertiary px-2 py-1 rounded border border-theme text-theme">
                                        CLASS: {insight.category}
                                    </span>
                                    {insight.top_keywords?.map((kw, k) => (
                                        <span key={k} className="text-[9px] font-bold uppercase tracking-widest bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded">
                                            {kw}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-8 px-4 border border-theme border-dashed rounded-xl text-center flex flex-col items-center">
                        <Activity size={24} className="text-theme-muted opacity-30 mb-3" />
                        <span className="text-xs font-bold tracking-widest uppercase text-theme-muted">No significant anomalies detected</span>
                    </div>
                )}
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
                {/* Categorical Distribution */}
                <div className="glass-panel p-8">
                    <h3 className="text-[10px] tracking-widest uppercase font-bold text-theme-muted mb-6">Distribution Matrix</h3>
                    <div className="space-y-5">
                        {stats?.by_category && Object.entries(stats.by_category).map(([category, count]) => {
                            const total = stats.total || 1;
                            const pct = Math.round((count / total) * 100);
                            return (
                                <div key={category} className="group">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-xs font-semibold text-theme">{category}</span>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-xs text-theme-muted">{count} units</span>
                                            <span className="text-[10px] font-bold text-theme tracking-widest">{pct}%</span>
                                        </div>
                                    </div>
                                    <div className="w-full bg-theme-tertiary h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="bg-theme h-full rounded-full group-hover:bg-blue-500 transition-colors duration-300"
                                            style={{ width: `${pct}%` }}
                                        ></div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="flex flex-col gap-8">
                    {/* Urgency Vectors */}
                    <div className="glass-panel p-8">
                        <h3 className="text-[10px] tracking-widest uppercase font-bold text-theme-muted mb-6">Urgency Vectors</h3>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="p-4 bg-theme-secondary border border-theme rounded-xl flex flex-col items-center justify-center group hover:border-red-500 transition-colors">
                                <div className="text-2xl font-bold text-theme tracking-tighter mb-1 group-hover:text-red-500 transition-colors">
                                    {stats?.by_priority?.High || 0}
                                </div>
                                <div className="text-[9px] font-bold tracking-widest text-theme-muted uppercase">CRITICAL</div>
                            </div>
                            <div className="p-4 bg-theme-secondary border border-theme rounded-xl flex flex-col items-center justify-center group hover:border-amber-500 transition-colors">
                                <div className="text-2xl font-bold text-theme tracking-tighter mb-1 group-hover:text-amber-500 transition-colors">
                                    {stats?.by_priority?.Medium || 0}
                                </div>
                                <div className="text-[9px] font-bold tracking-widest text-theme-muted uppercase">ELEVATED</div>
                            </div>
                            <div className="p-4 bg-theme-secondary border border-theme rounded-xl flex flex-col items-center justify-center group hover:border-blue-500 transition-colors">
                                <div className="text-2xl font-bold text-theme tracking-tighter mb-1 group-hover:text-blue-500 transition-colors">
                                    {stats?.by_priority?.Low || 0}
                                </div>
                                <div className="text-[9px] font-bold tracking-widest text-theme-muted uppercase">NOMINAL</div>
                            </div>
                        </div>
                    </div>

                    {/* Threat Zones */}
                    <div className="glass-panel p-8 flex-grow">
                        <h3 className="text-[10px] tracking-widest uppercase font-bold text-theme-muted mb-6">High Priority Sectors</h3>
                        <div className="space-y-3">
                            {highPriorityZones.map((zone, i) => (
                                <div key={i} className="flex items-center justify-between py-3 border-b border-theme border-dashed last:border-0 last:pb-0">
                                    <span className="text-xs font-semibold text-theme">{zone}</span>
                                    <span className="text-[9px] tracking-widest font-bold text-red-500 uppercase flex items-center gap-1">
                                        <AlertTriangle size={10} /> Active
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Department Entities */}
            <div className="glass-panel p-8">
                <h3 className="text-[10px] tracking-widest uppercase font-bold text-theme-muted mb-6">Active Operational Nodes (Departments)</h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {departments.map((dept) => (
                        <div key={dept.id} className="p-5 bg-theme-secondary border border-theme rounded-xl flex flex-col justify-between hover:border-theme-muted transition-colors group">
                            <div>
                                <div className="text-[9px] font-bold tracking-widest text-theme-muted uppercase mb-1">NODE: {dept.code}</div>
                                <div className="text-sm font-bold text-theme tracking-tight mb-4">{dept.name}</div>
                            </div>
                            {dept.contact_email ? (
                                <div className="text-xs text-theme-secondary font-mono bg-theme-tertiary px-2 py-1 rounded w-fit border border-theme">
                                    {dept.contact_email}
                                </div>
                            ) : (
                                <div className="text-xs text-theme-muted italic">Comm-link offline</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
