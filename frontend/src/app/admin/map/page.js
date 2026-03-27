'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import { ArrowLeft, Loader2, MapPin, RefreshCw, Building2 } from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => <div className="w-full h-[500px] bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
    </div>
});

export default function AdminMapPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [mapData, setMapData] = useState({ complaints: [], total: 0, departments: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [colorBy, setColorBy] = useState('category');
    const [selectedDepartment, setSelectedDepartment] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchMapData();
        }
    }, [user, selectedDepartment]);

    const fetchMapData = async () => {
        setLoading(true);
        setError('');
        try {
            const deptId = selectedDepartment || null;
            const data = await analyticsAPI.getMapData(deptId, 90);
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
                        onClick={() => router.push('/admin')}
                        className="flex items-center gap-2 text-theme-muted hover:text-theme mb-2 text-sm transition"
                    >
                        <ArrowLeft size={16} /> Back to Dashboard
                    </button>
                    <h1 className="text-3xl font-bold text-theme flex items-center gap-3">
                        <MapPin className="text-[var(--primary)]" />
                        District Issue Map
                    </h1>
                    <p className="text-theme-muted mt-1">
                        {mapData.department_filter
                            ? `Viewing: ${mapData.department_filter}`
                            : 'All Departments - Overview'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Department Filter */}
                    <div className="flex items-center gap-2 card-theme px-3 py-2 rounded-lg">
                        <Building2 size={16} className="text-theme-muted" />
                        <select
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="bg-transparent text-sm font-medium text-theme focus:outline-none cursor-pointer min-w-[150px]"
                        >
                            <option value="">All Departments</option>
                            {mapData.departments?.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Color Toggle */}
                    <div className="flex items-center gap-2 card-theme px-3 py-2 rounded-lg">
                        <span className="text-xs text-theme-muted">Color by:</span>
                        <select
                            value={colorBy}
                            onChange={(e) => setColorBy(e.target.value)}
                            className="bg-transparent text-sm font-medium text-theme focus:outline-none cursor-pointer"
                        >
                            <option value="category">Category</option>
                            <option value="priority">Priority</option>
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

            {/* Stats by Department */}
            <div className="mt-6">
                <h2 className="text-lg font-bold text-theme mb-4">Summary by Category</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {['Roads & Transport', 'Water Supply', 'Electricity', 'Sanitation & Waste', 'Health & Safety', 'General'].map(cat => {
                        const count = mapData.complaints?.filter(c => c.category === cat).length || 0;
                        return (
                            <div key={cat} className="card-theme rounded-lg p-4 text-center">
                                <div className="text-2xl font-bold text-theme">{count}</div>
                                <div className="text-xs text-theme-muted truncate" title={cat}>{cat}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
