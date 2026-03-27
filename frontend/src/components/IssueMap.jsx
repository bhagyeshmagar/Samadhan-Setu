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

export default function IssueMap({ complaints = [], colorBy = 'priority', center = [18.5204, 73.8567], zoom = 12 }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        // Initialize map only once
        if (!mapInstanceRef.current && mapRef.current) {
            mapInstanceRef.current = L.map(mapRef.current).setView(center, zoom);

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
    }, []);

    useEffect(() => {
        if (!mapInstanceRef.current) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Add markers for each complaint
        complaints.forEach(complaint => {
            if (!complaint.lat || !complaint.lng) return;

            const color = colorBy === 'priority'
                ? priorityColors[complaint.priority] || '#6b7280'
                : categoryColors[complaint.category] || '#6b7280';

            const marker = L.marker([complaint.lat, complaint.lng], {
                icon: createIcon(color)
            }).addTo(mapInstanceRef.current);

            marker.bindPopup(`
                <div style="min-width: 200px; font-family: system-ui;">
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px;">
                        #${complaint.id} - ${complaint.category}
                    </div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
                        📍 ${complaint.location}
                    </div>
                    <div style="font-size: 12px; margin-bottom: 8px;">
                        ${complaint.description}
                    </div>
                    <div style="display: flex; gap: 8px; font-size: 11px;">
                        <span style="background: ${priorityColors[complaint.priority]}; color: white; padding: 2px 8px; border-radius: 12px;">
                            ${complaint.priority}
                        </span>
                        <span style="background: #e5e7eb; padding: 2px 8px; border-radius: 12px;">
                            ${complaint.status}
                        </span>
                    </div>
                </div>
            `);

            markersRef.current.push(marker);
        });

        // Fit bounds if there are complaints
        if (complaints.length > 0) {
            const validComplaints = complaints.filter(c => c.lat && c.lng);
            if (validComplaints.length > 0) {
                const bounds = L.latLngBounds(validComplaints.map(c => [c.lat, c.lng]));
                mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    }, [complaints, colorBy]);

    return (
        <div className="relative w-full h-full rounded-xl overflow-hidden shadow-lg border border-theme">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: '500px' }} />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 z-[1000]">
                <div className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    {colorBy === 'priority' ? 'Priority' : 'Category'}
                </div>
                {colorBy === 'priority' ? (
                    <div className="space-y-1">
                        {Object.entries(priorityColors).map(([name, color]) => (
                            <div key={name} className="flex items-center gap-2 text-xs">
                                <div style={{ background: color }} className="w-3 h-3 rounded-full" />
                                <span className="text-gray-700 dark:text-gray-300">{name}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="space-y-1">
                        {Object.entries(categoryColors).map(([name, color]) => (
                            <div key={name} className="flex items-center gap-2 text-xs">
                                <div style={{ background: color }} className="w-3 h-3 rounded-full" />
                                <span className="text-gray-700 dark:text-gray-300">{name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Stats overlay */}
            <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-4 py-2 z-[1000]">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    {complaints.length} Issues
                </span>
            </div>
        </div>
    );
}
