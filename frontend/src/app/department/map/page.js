'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import { 
    ArrowLeft, Loader2, MapPin, RefreshCw, ChevronRight, 
    Layers, ShieldAlert 
} from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-137.5 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center flex-col gap-2">
            <Loader2 className="animate-spin text-accent" size={32} />
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Loading Spatial GIS Coordinates…</span>
        </div>
    )
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
            setError(err.message || 'Failed to load department map data');
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] flex-col gap-3">
                <Loader2 className="animate-spin text-[var(--navy)]" size={36} />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Verifying Officer GIS Clearance…
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
                        <span>Department Services</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">Field Issue Cluster Map</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        Field Operations GIS Map
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        विभागीय कार्यक्षेत्र मानचित्र — Spatial mapping of active civic grievances & field dispatch priorities
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Color Toggle */}
                    <div className="flex items-center gap-2 bg-white border border-gray-200 px-3 py-1.5 rounded text-xs shadow-sm">
                        <Layers size={14} className="text-gray-400" />
                        <span className="font-semibold text-gray-600">Color by:</span>
                        <select
                            value={colorBy}
                            onChange={(e) => setColorBy(e.target.value)}
                            className="bg-transparent font-medium text-gray-800 focus:outline-none cursor-pointer"
                        >
                            <option value="priority">Priority Severity</option>
                            <option value="category">Category</option>
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

            {/* Map Frame */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <MapPin size={14} /> Field Grievances ({mapData.complaints?.length || 0} Located)
                    </span>
                    <span className="text-[11px] text-gray-500">
                        {mapData.department_filter ? `Department: ${mapData.department_filter}` : 'All Assigned Jurisdictions'}
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
                                <span className="text-xs text-gray-500 font-semibold">Updating Spatial Layers…</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Field Advisory */}
            <div className="gov-card p-4 text-xs text-gray-600 flex items-start gap-3">
                <ShieldAlert size={18} className="text-[var(--navy)] flex-shrink-0 mt-0.5" />
                <div>
                    <h4 className="font-bold text-gray-900 mb-0.5">Field Dispatch Directive:</h4>
                    <p>
                        High-density red clusters indicate recurring infrastructure failures or critical ward hazards. Officers must prioritize on-site inspection of high-priority clusters within 24 hours under the Civic Service Level Agreement.
                    </p>
                </div>
            </div>
        </div>
    );
}
