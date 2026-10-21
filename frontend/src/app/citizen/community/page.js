'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { 
    MapPin, ThumbsUp, AlertTriangle, Loader2, RefreshCw, 
    Activity, MessageSquare, ChevronRight, TrendingUp, CheckCircle, ShieldCheck
} from 'lucide-react';

export default function CommunityFeed() {
    const { user } = useAuth();
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
        fetchComplaints();
    }, [fetchComplaints]);

    const handleUpvote = async (id) => {
        if (!user) {
            router.push('/login');
            return;
        }

        setUpvoting(id);
        try {
            await complaintsAPI.upvote(id);
            setComplaints(prev => prev.map(c =>
                c.id === id ? { ...c, upvotes: (c.upvotes || 0) + 1 } : c
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
        
        const resolvedCount = complaints.filter(c => c.status === 'Resolved' || c.status === 'Closed').length;
        resolutionRate = Math.round((resolvedCount / complaints.length) * 100);
    }

    return (
        <div className="max-w-6xl mx-auto py-6">
            {/* ── Breadcrumb & Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>Citizen Services</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Public Grievance Feed</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        Public Grievance Feed
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        सामुदायिक शिकायत मंच — Transparent civic issues submitted by residents in your municipal jurisdiction
                    </p>
                </div>
                <button
                    onClick={fetchComplaints}
                    disabled={loading}
                    className="btn-ghost flex items-center gap-2 text-xs font-semibold"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Sync Feed / ताज़ा करें
                </button>
            </div>

            {/* ── Top Highlights / Metrics Strip ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="metric-card mc-navy">
                    <div className="metric-number">{complaints.length}</div>
                    <div className="metric-label">Public Issues Listed</div>
                    <div className="text-[10px] mt-0.5 text-gray-500" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                        कुल सार्वजनिक मुद्दे
                    </div>
                </div>
                <div className="metric-card mc-saffron">
                    <div className="metric-number text-lg truncate" style={{ color: 'var(--saffron-dark)' }}>
                        {trendingCategory}
                    </div>
                    <div className="metric-label">High-Activity Sector</div>
                    <div className="text-[10px] mt-0.5 text-gray-500" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                        सर्वाधिक सक्रिय श्रेणी
                    </div>
                </div>
                <div className="metric-card mc-green">
                    <div className="metric-number" style={{ color: 'var(--india-green)' }}>
                        {resolutionRate}%
                    </div>
                    <div className="metric-label">Community Resolution</div>
                    <div className="text-[10px] mt-0.5 text-gray-500" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                        समाधान दर
                    </div>
                </div>
                <div className="metric-card mc-navy flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--navy)] mb-1">
                        <ShieldCheck size={16} className="text-green-600" />
                        <span>Public Accountability</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-tight">
                        Upvoting helps municipal authorities prioritise ward interventions.
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
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Category:</span>
                            <select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="gov-input text-xs py-1.5 px-3 rounded font-medium cursor-pointer"
                                style={{ minWidth: '160px' }}
                            >
                                {categories.map(cat => (
                                    <option key={cat} value={cat === 'All' ? '' : cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mr-1">Sort:</span>
                            {[
                                { key: 'recent', label: 'Latest / नवीनतम' },
                                { key: 'upvotes', label: 'Top Voted / शीर्ष मत' },
                                { key: 'priority', label: 'Critical / अति-गंभीर' }
                            ].map((sortOption) => (
                                <button
                                    key={sortOption.key}
                                    onClick={() => setSortBy(sortOption.key)}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                                        sortBy === sortOption.key
                                            ? 'bg-[var(--navy)] text-white shadow-sm'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                    }`}
                                >
                                    {sortOption.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error Notice */}
                    {error && (
                        <div className="gov-alert error mb-6">
                            <AlertTriangle size={16} />
                            <div className="flex-1 flex justify-between items-center">
                                <span>{error}</span>
                                <button onClick={fetchComplaints} className="font-bold underline text-xs">Retry</button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {loading ? (
                        <div className="gov-card py-20 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-[var(--navy)]" size={32} />
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">
                                Loading Public Grievance Records…
                            </p>
                        </div>
                    ) : complaints.length > 0 ? (
                        /* Complaints Feed List */
                        <div className="space-y-4">
                            {complaints.map((complaint) => (
                                <div key={complaint.id} className="gov-card p-5 hover:border-gray-400 transition-colors">
                                    <div className="flex flex-col sm:flex-row gap-5">
                                        
                                        {/* Upvote Pill Component */}
                                        <div className="flex sm:flex-col items-center justify-center gap-2 sm:w-20 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-gray-100 pb-3 sm:pb-0 sm:pr-4">
                                            <button
                                                onClick={() => handleUpvote(complaint.id)}
                                                disabled={upvoting === complaint.id}
                                                title="Upvote this civic grievance"
                                                className={`p-2.5 rounded-lg border transition-all flex items-center justify-center ${
                                                    upvoting === complaint.id
                                                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                                                }`}
                                            >
                                                {upvoting === complaint.id ? (
                                                    <Loader2 className="animate-spin" size={18} />
                                                ) : (
                                                    <ThumbsUp size={18} />
                                                )}
                                            </button>
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-gray-900 leading-none">
                                                    {complaint.upvotes || 0}
                                                </div>
                                                <div className="text-[9px] uppercase tracking-wider font-semibold text-gray-400 mt-0.5">
                                                    Upvotes
                                                </div>
                                            </div>
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="badge badge-normal font-semibold">
                                                        {complaint.category || 'General Civic'}
                                                    </span>
                                                    {complaint.priority === 'HIGH' && (
                                                        <span className="badge badge-critical flex items-center gap-1">
                                                            <AlertTriangle size={12} /> Critical Priority
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    <span>{complaint.created_at ? new Date(complaint.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                                                    <Badge status={complaint.status} />
                                                </div>
                                            </div>

                                            <h3 className="text-base font-bold text-gray-900 mb-1 leading-snug">
                                                {complaint.title || complaint.description?.substring(0, 80) || 'Civic Grievance'}
                                            </h3>

                                            <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                                {complaint.description}
                                            </p>

                                            <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100">
                                                <div className="flex items-center gap-1.5 truncate max-w-md">
                                                    <MapPin size={14} className="text-[var(--navy)] flex-shrink-0" />
                                                    <span className="truncate">{complaint.location || 'Ward Area / Jurisdiction'}</span>
                                                </div>
                                                <span className="font-mono text-[11px] text-gray-400">
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
                            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                <MessageSquare size={26} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">No Grievances Found</h3>
                            <p className="text-xs text-gray-500 max-w-md mx-auto mb-6">
                                There are currently no public civic grievances matching your selected category and sort filters.
                            </p>
                            <button
                                onClick={() => router.push(user ? '/citizen/lodge' : '/login')}
                                className="btn-gov-primary text-xs"
                            >
                                {user ? 'Lodge Grievance / शिकायत दर्ज करें' : 'Sign In to Lodge Grievance'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Sidebar */}
                <div className="w-full lg:w-80 flex-shrink-0 space-y-6">
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-2">
                                <Activity size={14} /> Ward Intelligence / वार्ड विवरण
                            </span>
                        </div>
                        <div className="p-4 space-y-4 text-xs">
                            <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                                    High Grievance Category
                                </span>
                                <span className="text-sm font-bold text-gray-900">
                                    {trendingCategory}
                                </span>
                            </div>

                            <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">
                                    Community Resolution Rate
                                </span>
                                <div className="text-lg font-bold text-green-700 mb-1">
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

                            <div className="p-3 bg-blue-50 border border-blue-200 rounded text-blue-900 leading-relaxed">
                                <span className="font-bold block mb-1">Citizen Advisory / नागरिक सूचना:</span>
                                Community upvotes highlight shared neighborhood issues to help municipal authorities gauge local impact and coordinate prompt redressal.
                            </div>
                        </div>
                    </div>

                    <div className="gov-card p-4 text-xs text-gray-600 space-y-2">
                        <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">
                            Redressal Guarantee
                        </h4>
                        <p className="leading-relaxed">
                            Under municipal citizen charter standards, every lodged grievance is routed for departmental review and monitored against mandated resolution timelines.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
