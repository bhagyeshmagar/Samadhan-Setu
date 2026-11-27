'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import {
    Loader2, MapPin, RefreshCw, Building2,
    ChevronRight, Layers,
} from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => (
        <div
            className="w-full h-[550px] border rounded-lg flex items-center justify-center flex-col gap-2"
            style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
        >
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Loading Spatial GIS Coordinates…
            </span>
        </div>
    ),
});

export default function AdminMapPage() {
    const { user, loading: authLoading } = useAuth();
    const { t, tCategory } = useLanguage();
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
            let cancelled = false;
            Promise.resolve().then(() => {
                if (!cancelled) fetchMapData();
            });
            return () => {
                cancelled = true;
            };
        }
    }, [user, fetchMapData]);

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh] flex-col gap-3">
                <Loader2 className="animate-spin" size={36} style={{ color: 'var(--navy)' }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {t('authorising_gis')}
                </p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            {/* Breadcrumb & Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <div className="breadcrumb mb-2">
                        <span>{t('home')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span>{t('admin_oversight')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('district_gis_map')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('district_map_title')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('district_map_sub')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Department Filter */}
                    <div
                        className="flex items-center gap-2 border px-3 py-1.5 rounded text-xs"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-secondary)' }}
                    >
                        <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                        <span className="font-semibold">{t('department')}:</span>
                        <select
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="bg-transparent font-medium focus:outline-none cursor-pointer"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <option value="" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                {t('all_departments')}
                            </option>
                            {mapData.departments?.map(dept => (
                                <option
                                    key={dept.id}
                                    value={dept.id}
                                    style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                                >
                                    {dept.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Color Toggle */}
                    <div
                        className="flex items-center gap-2 border px-3 py-1.5 rounded text-xs"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-secondary)' }}
                    >
                        <Layers size={14} style={{ color: 'var(--text-muted)' }} />
                        <span className="font-semibold">{t('color_by')}</span>
                        <select
                            value={colorBy}
                            onChange={(e) => setColorBy(e.target.value)}
                            className="bg-transparent font-medium focus:outline-none cursor-pointer"
                            style={{ color: 'var(--text-primary)' }}
                        >
                            <option value="category" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                {t('category')}
                            </option>
                            <option value="priority" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                {t('priority')}
                            </option>
                        </select>
                    </div>

                    <button
                        onClick={fetchMapData}
                        disabled={loading}
                        className="btn-ghost flex items-center gap-1.5 text-xs font-semibold"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        <span>{t('refresh')}</span>
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="gov-alert error mb-4">
                    <span>{error}</span>
                    <button onClick={fetchMapData} className="ml-4 underline text-xs font-bold">{t('retry')}</button>
                </div>
            )}

            {/* Map Section */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <MapPin size={14} /> {t('ward_spatial_clusters')} ({mapData.complaints?.length || 0} {t('geocoded_grievances')})
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {mapData.department_filter ? `${t('filtered')}: ${mapData.department_filter}` : t('comprehensive_city_view')}
                    </span>
                </div>
                <div className="p-2" style={{ background: 'var(--bg-section)' }}>
                    <div
                        className="h-[580px] rounded border overflow-hidden shadow-inner"
                        style={{ borderColor: 'var(--border)' }}
                    >
                        {!loading ? (
                            <IssueMap
                                complaints={mapData.complaints}
                                colorBy={colorBy}
                            />
                        ) : (
                            <div
                                className="w-full h-full flex items-center justify-center flex-col gap-2"
                                style={{ background: 'var(--bg-section)' }}
                            >
                                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
                                <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                                    {t('updating_map_layers')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Summary by Category */}
            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {t('geocoded_by_domain')}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    {['Roads & Transport', 'Water Supply', 'Electricity', 'Sanitation & Waste', 'Health & Safety', 'General'].map(cat => {
                        const count = mapData.complaints?.filter(c => c.category === cat).length || 0;
                        const label = tCategory(cat);
                        return (
                            <div key={cat} className="metric-card mc-navy p-3 text-center">
                                <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{count}</div>
                                <div className="text-[11px] font-semibold truncate mt-0.5" style={{ color: 'var(--text-secondary)' }} title={label}>
                                    {label}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
