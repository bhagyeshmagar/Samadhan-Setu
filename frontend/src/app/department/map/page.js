'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { analyticsAPI } from '@/lib/api';
import dynamic from 'next/dynamic';
import {
    Loader2, MapPin, RefreshCw, ChevronRight,
    Layers, ShieldAlert,
} from 'lucide-react';

// Dynamic import to avoid SSR issues with Leaflet
const IssueMap = dynamic(() => import('@/components/IssueMap'), {
    ssr: false,
    loading: () => (
        <div
            className="w-full h-137.5 border rounded-lg flex items-center justify-center flex-col gap-2"
            style={{ background: 'var(--bg-section)', borderColor: 'var(--border)' }}
        >
            <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Loading Spatial GIS Coordinates…
            </span>
        </div>
    ),
});

export default function DepartmentMapPage() {
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();
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

    const fetchMapData = useCallback(async () => {
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
    }, []);

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
                    {t('verifying_gis')}
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
                        <span>{t('department_services')}</span>
                        <ChevronRight size={10} className="breadcrumb-sep" />
                        <span className="breadcrumb-current">{t('field_issue_cluster_map')}</span>
                    </div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('ward_map_title')}
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {t('ward_map_sub')}
                    </p>
                </div>

                <div className="flex items-center gap-2">
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
                            <option value="priority" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                {t('priority_severity')}
                            </option>
                            <option value="category" style={{ background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                                {t('category')}
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

            {/* Map Frame */}
            <div className="gov-section mb-6">
                <div className="gov-section-header">
                    <span className="gov-section-title flex items-center gap-2">
                        <MapPin size={14} /> {t('field_grievances')} ({mapData.complaints?.length || 0} {t('located')})
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {mapData.department_filter ? `${t('department')}: ${mapData.department_filter}` : t('all_assigned_jurisdictions')}
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
                                    {t('updating_spatial_layers')}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Field Advisory */}
            <div className="gov-card p-4 text-xs flex items-start gap-3" style={{ color: 'var(--text-secondary)' }}>
                <ShieldAlert size={18} className="shrink-0 mt-0.5" style={{ color: 'var(--navy)' }} />
                <div>
                    <h4 className="font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>
                        {t('field_dispatch_directive')}
                    </h4>
                    <p>{t('field_dispatch_directive_body')}</p>
                </div>
            </div>
        </div>
    );
}
