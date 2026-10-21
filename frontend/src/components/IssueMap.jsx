'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet marker icons in Next.js
const createIcon = (color) => {
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            width: 24px;
            height: 24px;
            background: ${color};
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
    });
};

const priorityColors = {
    'critical': '#991b1b',
    'high': '#dc2626',
    'medium': '#f97316',
    'low': '#3b82f6',
    'Critical': '#991b1b',
    'High': '#dc2626',
    'Medium': '#f97316',
    'Low': '#3b82f6'
};

const categoryColors = {
    'Roads & Transport': '#ef4444',
    'Water Supply': '#3b82f6',
    'Electricity': '#eab308',
    'Sanitation & Waste': '#22c55e',
    'Health & Safety': '#a855f7',
    'General': '#6b7280'
};

const DEFAULT_CENTER = [18.5204, 73.8567];

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export default function IssueMap({ complaints = [], colorBy = 'priority', center = DEFAULT_CENTER, zoom = 12 }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);

    // Memoize stable coordinates
    const centerLat = center[0] ?? DEFAULT_CENTER[0];
    const centerLng = center[1] ?? DEFAULT_CENTER[1];

    useEffect(() => {
        // Initialize map only once
        if (!mapInstanceRef.current && mapRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView([centerLat, centerLng], zoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(mapInstanceRef.current);
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [centerLat, centerLng, zoom]);

    useEffect(() => {
        if (!mapInstanceRef.current) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        const validCoords = [];

        // Add markers for each complaint
        complaints.forEach(complaint => {
            const lat = Number(complaint.latitude ?? complaint.lat);
            const lng = Number(complaint.longitude ?? complaint.lng);
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

            validCoords.push([lat, lng]);

            const priorityKey = (complaint.priority || 'low').toLowerCase();
            const color = colorBy === 'priority'
                ? priorityColors[priorityKey] || '#6b7280'
                : categoryColors[complaint.category] || '#6b7280';

            const marker = L.marker([lat, lng], {
                icon: createIcon(color)
            }).addTo(mapInstanceRef.current);

            const safeId = escapeHtml(complaint.complaint_number || complaint.id || '');
            const safeCategory = escapeHtml(complaint.category || 'General');
            const safeLocation = escapeHtml(complaint.location || complaint.address || 'Location unavailable');
            const safeDesc = escapeHtml(complaint.description || '');
            const safePriority = escapeHtml(complaint.priority || 'low');
            const safeStatus = escapeHtml(complaint.status || 'submitted');
            const badgeColor = priorityColors[priorityKey] || '#6b7280';

            marker.bindPopup(`
                <div style="min-width: 200px; font-family: system-ui;">
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px;">
                        #${safeId} - ${safeCategory}
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                        📍 ${safeLocation}
                    </div>
                    <div style="font-size: 12px; margin-bottom: 8px; max-height: 80px; overflow-y: auto;">
                        ${safeDesc}
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 11px;">
                        <span style="background: ${badgeColor}; color: white; padding: 2px 8px; border-radius: 12px; text-transform: capitalize;">
                            ${safePriority}
                        </span>
                        <span style="background: #e5e7eb; color: #374151; padding: 2px 8px; border-radius: 12px; text-transform: capitalize;">
                            ${safeStatus.replace('_', ' ')}
                        </span>
                    </div>
                </div>
            `);

            markersRef.current.push(marker);
        });

        // Fit bounds if there are valid complaints
        if (validCoords.length > 0 && mapInstanceRef.current) {
            const bounds = L.latLngBounds(validCoords);
            mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [complaints, colorBy]);

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden shadow-lg border border-theme">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: '500px' }} />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-theme-secondary border border-theme rounded-lg shadow-lg p-3 z-1000">
                <div className="text-xs font-semibold text-theme-muted mb-2">
                    {colorBy === 'priority' ? 'Priority' : 'Category'}
                </div>
                {colorBy === 'priority' ? (
                    <div className="space-y-1">
                        {['critical', 'high', 'medium', 'low'].map(name => (
                            <div key={name} className="flex items-center gap-2 text-xs">
                                <div style={{ background: priorityColors[name] }} className="w-3 h-3 rounded-full" />
                                <span className="text-theme capitalize">{name}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {Object.entries(categoryColors).map(([name, color]) => (
                            <div key={name} className="flex items-center gap-2 text-xs">
                                <div style={{ background: color }} className="w-3 h-3 rounded-full" />
                                <span className="text-theme">{name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Stats overlay */}
            <div className="absolute top-4 right-4 bg-theme-secondary border border-theme rounded-lg shadow-lg px-4 py-2 z-1000">
                <span className="text-sm font-bold text-theme">
                    {complaints.length} Issues
                </span>
            </div>
        </div>
    );
}
