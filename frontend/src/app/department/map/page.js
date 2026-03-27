'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, MapPin, RefreshCw } from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => <div className="w-full h-[500px] bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
});

export default function DepartmentMapPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [mapData, setMapData] = useState({ complaints: [], total: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [colorBy, setColorBy] = useState('priority');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchMapData();
        }
    }, [user]);

    const fetchMapData = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await analyticsAPI.getMapData(null, 90);
            setMapData(data);
        } catch (err) {
            setError(err.message || 'Failed to load map data');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={40} />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <button
                        onClick={() => router.push('/department')}
                        className="flex items-center gap-2 text-theme-muted hover:text-theme mb-2 text-sm transition"
                    >
                        <ArrowLeft size={16} /> Back to Dashboard
                    </button>
                    <h1 className="text-3xl font-bold text-theme flex items-center gap-3">
                        <MapPin className="text-[var(--primary)]" />
                        Issue Cluster Map
                    </h1>
                    <p className="text-theme-muted mt-1">
                        {mapData.department_filter ? `Department: ${mapData.department_filter}` : 'Your Department Issues'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Color Toggle */}
                    <div className="flex items-center gap-2 card-theme px-3 py-2 rounded-lg">
                        <span className="text-xs text-theme-muted">Color by:</span>
                        <select
                            value={colorBy}
                            onChange={(e) => setColorBy(e.target.value)}
                            className="bg-transparent text-sm font-medium text-theme focus:outline-none cursor-pointer"
                        >
                            <option value="priority">Priority</option>
                            <option value="category">Category</option>
                        </select>
                    </div>

                    <button
                        onClick={fetchMapData}
                        disabled={loading}
                        className="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
                    {error}
                    <button onClick={fetchMapData} className="ml-4 underline">Retry</button>
                </div>
            )}

            {/* Map */}
            <div className="h-[600px]">
                {!loading && (
                    <IssueMap
                        complaints={mapData.complaints}
                        colorBy={colorBy}
                    />
                )}
                {loading && (
                    <div className="w-full h-full bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl flex items-center justify-center">
                        <Loader2 className="animate-spin text-blue-500" size={40} />
                    </div>
                )}
            </div>

            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card-theme rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-theme">{mapData.total || 0}</div>
                    <div className="text-sm text-theme-muted">Total Issues</div>
                </div>
                <div className="card-theme rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">
                        {mapData.complaints?.filter(c => c.priority === 'High').length || 0}
                    </div>
                    <div className="text-sm text-theme-muted">High Priority</div>
                </div>
                <div className="card-theme rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                        {mapData.complaints?.filter(c => c.priority === 'Medium').length || 0}
                    </div>
                    <div className="text-sm text-theme-muted">Medium Priority</div>
                </div>
                <div className="card-theme rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                        {mapData.complaints?.filter(c => c.priority === 'Low').length || 0}
                    </div>
                    <div className="text-sm text-theme-muted">Low Priority</div>
                </div>
            </div>
        </div>
    );
}
