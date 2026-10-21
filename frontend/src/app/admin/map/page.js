'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import { 
    ArrowLeft, Loader2, MapPin, RefreshCw, Building2, 
    ChevronRight, Layers, Filter 
} from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[550px] bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center flex-col gap-2">
            <Loader2 className="animate-spin text-[var(--navy)]" size={32} />
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Loading Spatial GIS Coordinates…</span>
        </div>
    )
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

    const fetchMapData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const deptId = selectedDepartment || null;
            const data = await analyticsAPI.getMapData(deptId, 90);
            setMapData(data);
        } catch (err) {
            setError(err.message || 'Failed to load GIS map data');
        } finally {
            setLoading(false);
        }
    }, [selectedDepartment]);

    useEffect(() => {
        if (user) {
            fetchMapData();
        }
    }, [user, fetchMapData]);

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] flex-col gap-3">
                <Loader2 className="animate-spin text-[var(--navy)]" size={36} />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Authorising GIS Administrative Access…
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* ── Breadcrumb & Header ── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>Home</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>Admin Oversight</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">District GIS Map</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        District Geospatial Grievance Map
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        जिला जीआईएस मानचित्र — Geospatial visualization of civic complaints across wards and municipal zones
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Department Filter */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded text-xs shadow-sm">
                        <Building2 size={14} className="text-gray-400" />
                        <span className="font-semibold text-gray-600">Department:</span>
                        <select
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="bg-transparent font-medium text-gray-800 focus:outline-none cursor-pointer"
                        >
                            <option value="">All Departments</option>
                            {mapData.departments?.map(dept => (
                                <option key={dept.id} value={dept.id}>{dept.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Color Toggle */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded text-xs shadow-sm">
                        <Layers size={14} className="text-gray-400" />
                        <span className="font-semibold text-gray-600">Color by:</span>
                        <select
                            value={colorBy}
                            onChange={(e) => setColorBy(e.target.value)}
                            className="bg-transparent font-medium text-gray-800 focus:outline-none cursor-pointer"
                        >
                            <option value="category">Category</option>
                            <option value="priority">Priority</option>
                        </select>
                    </div>

                    <button
                        onClick={fetchMapData}
                        disabled={loading}
                        className="btn-ghost flex items-center gap-1.5 text-xs font-semibold"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="gov-alert error mb-4">
                    <span>{error}</span>
                    <button onClick={fetchMapData} className="ml-4 underline text-xs font-bold">Retry</button>
                </div>
            )}

            {/* Map Section */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <MapPin size={14} /> Ward Spatial Clusters (
                        {mapData.complaints?.length || 0} Geocoded Grievances)
                    </span>
                    <span className="text-[11px] text-gray-500">
                        {mapData.department_filter ? `Filtered: ${mapData.department_filter}` : 'Comprehensive City View'}
                    </span>
                </div>
                <div className="p-2 bg-gray-50">
                    <div className="h-[580px] rounded border border-gray-200 overflow-hidden shadow-inner">
                        {!loading ? (
                            <IssueMap
                                complaints={mapData.complaints}
                                colorBy={colorBy}
                            />
                        ) : (
                            <div className="w-full h-full bg-gray-50 flex items-center justify-center flex-col gap-2">
                                <Loader2 className="animate-spin text-[var(--navy)]" size={32} />
                                <span className="text-xs text-gray-500 font-semibold">Updating Map Layers…</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary by Category */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-3">
                    Geocoded Issue Count by Civic Domain
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {['Roads & Transport', 'Water Supply', 'Electricity', 'Sanitation & Waste', 'Health & Safety', 'General'].map(cat => {
                        const count = mapData.complaints?.filter(c => c.category === cat).length || 0;
                        return (
                            <div key={cat} className="metric-card mc-navy p-3 text-center">
                                <div className="text-xl font-bold text-gray-900">{count}</div>
                                <div className="text-[11px] font-semibold text-gray-600 truncate mt-0.5" title={cat}>
                                    {cat}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
