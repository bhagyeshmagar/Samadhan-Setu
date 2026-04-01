'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { MapPin, ThumbsUp, AlertTriangle, Loader2, RefreshCw, Activity } from 'lucide-react';

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

    useEffect(() => {
        fetchComplaints();
    }, [sortBy, category]);

    const fetchComplaints = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await complaintsAPI.getPublic(
                category === 'All' ? '' : category,
                sortBy
            );
            setComplaints(data || []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message || 'Failed to fetch complaints');
            setComplaints([]);
        } finally {
            setLoading(false);
        }
    };

    const handleUpvote = async (id) => {
        if (!user) {
            router.push('/login?redirect=/citizen/community');
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
            if (err.message.includes('credentials')) {
                router.push('/login?redirect=/citizen/community');
            }
        } finally {
            setUpvoting(null);
        }
    };

    return (
        <div className="max-w-5xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-theme mb-2">Community Radar</h2>
                    <p className="text-sm text-theme-muted">Public anomalies reported by local residents. Upvote to elevate priority.</p>
                </div>
                <button
                    onClick={fetchComplaints}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-secondary border border-theme rounded-lg text-xs font-semibold tracking-wider uppercase text-theme hover:bg-theme-tertiary transition-colors"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Sync
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-center mb-8 p-2 rounded-xl border border-theme bg-theme-tertiary/50 backdrop-blur-sm">
                <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="px-4 py-2 text-xs font-semibold tracking-wider text-theme bg-transparent border-r border-theme outline-none cursor-pointer hover:bg-theme/50 rounded-l-lg transition-colors appearance-none"
                    style={{ minWidth: '160px' }}
                >
                    {categories.map(cat => (
                        <option key={cat} value={cat === 'All' ? '' : cat}>{cat} Issues</option>
                    ))}
                </select>
                
                <div className="flex gap-1 pl-2">
                    {['recent', 'upvotes', 'priority'].map((sortType) => (
                        <button
                            key={sortType}
                            onClick={() => setSortBy(sortType)}
                            className={`px-4 py-1.5 text-xs font-semibold tracking-wider uppercase rounded-lg transition-all ${
                                sortBy === sortType 
                                    ? 'bg-theme text-theme shadow-sm border border-theme' 
                                    : 'text-theme-muted hover:text-theme hover:bg-theme-secondary/50 border border-transparent'
                            }`}
                        >
                            {sortType === 'recent' ? 'Latest' : sortType === 'upvotes' ? 'Top Voted' : 'Critical'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm mb-6 flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={fetchComplaints} className="text-xs uppercase tracking-wider font-bold underline">Retry</button>
                </div>
            )}

            {/* Loading */}
            {loading ? (
                <div className="flex justify-center flex-col gap-4 items-center py-32 opacity-50">
                    <Loader2 className="animate-spin text-theme" size={32} />
                    <span className="text-[10px] tracking-widest uppercase font-bold text-theme">Indexing Area Data...</span>
                </div>
            ) : (
                <>
                    {/* Complaints Grid */}
                    {complaints.length > 0 ? (
                        <div className="flex flex-col gap-4">
                            {complaints.map((complaint) => (
                                <div key={complaint.id} className="glass-panel p-6 group transition-all duration-300">
                                    <div className="flex flex-col sm:flex-row gap-6">
                                        
                                        {/* Voting block */}
                                        <div className="flex sm:flex-col items-center gap-3 sm:gap-1 sm:w-16 flex-shrink-0 border-b sm:border-b-0 sm:border-r border-theme pb-4 sm:pb-0 sm:pr-4">
                                            <button
                                                onClick={() => handleUpvote(complaint.id)}
                                                disabled={upvoting === complaint.id}
                                                className={`p-3 rounded-xl border transition-all ${
                                                    upvoting === complaint.id
                                                        ? 'bg-theme text-theme border-theme shadow-inner'
                                                        : 'bg-theme-secondary border-theme text-theme-muted group-hover:border-theme hover:text-theme hover:bg-theme-tertiary'
                                                }`}
                                            >
                                                {upvoting === complaint.id ? <Loader2 className="animate-spin" size={18} /> : <ThumbsUp size={18} />}
                                            </button>
                                            <div className="flex flex-col items-center">
                                                <span className="font-bold text-lg text-theme leading-none">{complaint.upvotes || 0}</span>
                                                <span className="text-[9px] uppercase tracking-widest text-theme-muted font-bold">Votes</span>
                                            </div>
                                        </div>

                                        {/* Content block */}
                                        <div className="flex-grow min-w-0">
                                            <div className="flex flex-wrap justify-between items-start gap-4 mb-3">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded bg-theme-tertiary border border-theme text-theme">
                                                        {complaint.category || 'General'}
                                                    </span>
                                                    {complaint.priority === 'HIGH' && (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest uppercase text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-200 dark:border-red-900/30">
                                                            <AlertTriangle size={10} /> Critical
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-theme-muted">
                                                    <span>{new Date(complaint.created_at).toLocaleDateString()}</span>
                                                    <Badge status={complaint.status} />
                                                </div>
                                            </div>
                                            
                                            <p className="font-medium text-theme text-base mb-4 leading-relaxed pr-8">
                                                {complaint.description}
                                            </p>
                                            
                                            <div className="flex items-center gap-2 text-xs font-semibold text-theme-muted bg-theme-tertiary/50 w-fit px-3 py-1.5 rounded-lg border border-theme/50">
                                                <MapPin size={12} className="opacity-60" />
                                                <span className="truncate max-w-sm">{complaint.location}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        /* Empty State */
                        <div className="glass-panel text-center py-24 flex flex-col items-center border-dashed">
                            <Activity size={48} className="text-theme-muted opacity-30 mb-6" />
                            <h3 className="text-xl font-bold tracking-tight text-theme mb-2">Sector Clear</h3>
                            <p className="text-theme-muted mb-8 text-sm">No public civic anomalies recorded in this sector matching the filters.</p>
                            
                            <button
                                onClick={() => router.push(user ? '/citizen/lodge' : '/login')}
                                className="btn-primary px-8 py-3 rounded-xl font-semibold tracking-wide text-sm"
                            >
                                {user ? 'Report New Anomaly' : 'Authenticate to Report'}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
