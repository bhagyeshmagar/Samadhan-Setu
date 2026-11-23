'use client';

import { useState, useRef } from 'react';
import {
    Camera,
    MapPin,
    Upload,
    X,
    CheckCircle2,
    AlertTriangle,
    Crosshair,
    Loader2,
} from 'lucide-react';

const MAX_BYTES = 5 * 1024 * 1024;

export default function ProofUploadForm({
    title = 'Upload Geotagged Field Proof',
    subtitle = 'Photo evidence and GPS coordinates are required.',
    notesLabel = 'Field Observations / Notes',
    notesPlaceholder = 'Describe site conditions, measurements, and findings...',
    submitLabel = 'Submit Proof',
    defaultLat = null,
    defaultLng = null,
    showVerdict = false,
    submitting = false,
    onSubmit,
    onCancel,
}) {
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [notes, setNotes] = useState('');
    const [verdict, setVerdict] = useState('verified');
    const [latitude, setLatitude] = useState(defaultLat !== null && defaultLat !== undefined ? String(defaultLat) : '');
    const [longitude, setLongitude] = useState(defaultLng !== null && defaultLng !== undefined ? String(defaultLng) : '');
    const [gpsState, setGpsState] = useState('idle'); // idle | locating | captured | fallback
    const [gpsMessage, setGpsMessage] = useState(
        defaultLat ? 'Pre-filled from reported site pin. Click "Capture Live GPS" on site.' : 'Click "Capture Live GPS" or enter site coordinates.'
    );
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);

    const captureGPS = () => {
        setError('');
        if (typeof window === 'undefined' || !navigator.geolocation) {
            setGpsState('fallback');
            setGpsMessage('Geolocation unavailable in browser — using manual coordinates.');
            return;
        }
        setGpsState('locating');
        setGpsMessage('Acquiring satellite GPS coordinates…');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(pos.coords.latitude.toFixed(6));
                setLongitude(pos.coords.longitude.toFixed(6));
                setGpsState('captured');
                setGpsMessage(`GPS locked (±${Math.round(pos.coords.accuracy || 10)}m accuracy)`);
            },
            () => {
                setGpsState('fallback');
                if (defaultLat && defaultLng) {
                    setLatitude(String(defaultLat));
                    setLongitude(String(defaultLng));
                    setGpsMessage('Browser GPS blocked — fallback recorded from site pin (editable below).');
                } else {
                    setGpsMessage('Browser GPS denied — enter coordinates manually below.');
                }
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    };

    const handleFileSelect = (e) => {
        setError('');
        const chosen = Array.from(e.target.files || []);
        if (chosen.length === 0) return;

        const validFiles = [];
        const nextPreviews = [];
        for (const f of chosen) {
            if (!f.type.startsWith('image/')) {
                setError(`"${f.name}" is not a valid image file (JPG, PNG, WebP only).`);
                continue;
            }
            if (f.size > MAX_BYTES) {
                setError(`"${f.name}" exceeds the 5MB file size limit.`);
                continue;
            }
            validFiles.push(f);
            nextPreviews.push({ name: f.name, url: URL.createObjectURL(f), size: f.size });
        }

        setFiles((prev) => [...prev, ...validFiles].slice(0, 4));
        setPreviews((prev) => [...prev, ...nextPreviews].slice(0, 4));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index) => {
        setPreviews((prev) => {
            const target = prev[index];
            if (target?.url) URL.revokeObjectURL(target.url);
            return prev.filter((_, i) => i !== index);
        });
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (files.length === 0) {
            setError('Please upload at least one site photo as proof before submitting.');
            return;
        }
        if (!notes.trim()) {
            setError('Please enter detailed field notes / remarks.');
            return;
        }
        const latNum = latitude !== '' ? Number(latitude) : null;
        const lngNum = longitude !== '' ? Number(longitude) : null;
        if (latNum === null || lngNum === null || Number.isNaN(latNum) || Number.isNaN(lngNum)) {
            setError('Please capture GPS coordinates or enter valid latitude & longitude.');
            return;
        }

        try {
            await onSubmit({
                files,
                notes: notes.trim(),
                atr_notes: notes.trim(),
                verdict,
                latitude: latNum,
                longitude: lngNum,
                gps_source: gpsState === 'captured' ? 'live_gps' : 'manual_fallback',
            });
        } catch (err) {
            setError(err.message || 'Submission failed. Please retry.');
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="rounded-lg border p-5 space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
            <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <div>
                    <h3 className="text-sm font-bold text-(--text-primary) flex items-center gap-2">
                        <Camera size={16} className="text-(--navy)" />
                        <span>{title}</span>
                    </h3>
                    <p className="text-xs text-(--text-secondary) mt-0.5">{subtitle}</p>
                </div>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1 rounded text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-section)"
                        aria-label="Close form"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {error && (
                <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Post-resolution verdict toggle (Step 7 only) */}
            {showVerdict && (
                <div>
                    <label className="block text-xs font-semibold text-(--text-primary) mb-1.5">
                        Site Verification Verdict <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setVerdict('verified')}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors ${
                                verdict === 'verified'
                                    ? 'border-[#138808] bg-[#E8F5E9] text-[#0A6B05]'
                                    : 'border-(--border) bg-(--bg-page) text-(--text-secondary)'
                            }`}
                        >
                            <CheckCircle2 size={16} className="shrink-0" />
                            <div>
                                <div className="text-xs font-bold">Verified Resolved</div>
                                <div className="text-[11px] opacity-80">Send to Nodal Officer for final approval</div>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setVerdict('rework')}
                            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-colors ${
                                verdict === 'rework'
                                    ? 'border-red-600 bg-red-50 text-red-700'
                                    : 'border-(--border) bg-(--bg-page) text-(--text-secondary)'
                            }`}
                        >
                            <AlertTriangle size={16} className="shrink-0" />
                            <div>
                                <div className="text-xs font-bold">Incomplete — Rework Needed</div>
                                <div className="text-[11px] opacity-80">Return to Field Team & alert Nodal Officer</div>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Mandatory Photo Upload */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-(--text-primary)">
                        Geotagged Site Photo Proof <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-(--text-muted)">JPG/PNG/WebP · Max 5MB · Up to 4 photos</span>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 px-3 rounded-md border border-dashed flex flex-col items-center justify-center gap-1 text-xs text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                    style={{ borderColor: 'var(--border-strong)' }}
                >
                    <Upload size={18} className="text-(--navy)" />
                    <span className="font-semibold text-(--text-primary)">Click to select site proof photo(s)</span>
                    <span className="text-[11px] text-(--text-muted)">Required before submission</span>
                </button>

                {previews.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2.5">
                        {previews.map((p, idx) => (
                            <div
                                key={`${p.name}-${idx}`}
                                className="relative rounded-md border overflow-hidden group"
                                style={{ borderColor: 'var(--border)' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.url} alt={p.name} className="w-full h-24 object-cover" />
                                <button
                                    type="button"
                                    onClick={() => removeFile(idx)}
                                    className="absolute top-1 right-1 p-0.5 rounded bg-black/70 text-white hover:bg-red-600"
                                    aria-label="Remove photo"
                                >
                                    <X size={12} />
                                </button>
                                <div className="px-1.5 py-1 text-[10px] truncate text-(--text-secondary) bg-(--bg-card)">
                                    {p.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* GPS Coordinates Capture + Manual Fallback */}
            <div className="rounded-md border p-3 space-y-2.5" style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-(--text-primary)">
                        <MapPin size={14} className="text-(--navy)" />
                        <span>Site GPS Coordinates</span>
                        <span className="text-[11px] font-normal text-(--text-muted)">
                            ({gpsState === 'captured' ? 'Live GPS' : 'Manual / Site Pin'})
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={captureGPS}
                        disabled={gpsState === 'locating'}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-colors whitespace-nowrap"
                        style={{
                            background: 'var(--bg-card)',
                            borderColor: 'var(--border-mid)',
                            color: 'var(--navy)',
                        }}
                    >
                        {gpsState === 'locating' ? <Loader2 size={12} className="animate-spin" /> : <Crosshair size={12} />}
                        <span>{gpsState === 'locating' ? 'Locating…' : 'Capture Live GPS'}</span>
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[10px] uppercase tracking-wider font-semibold text-(--text-muted) mb-1">
                            Latitude
                        </label>
                        <input
                            type="text"
                            value={latitude}
                            onChange={(e) => {
                                setLatitude(e.target.value);
                                setGpsState('fallback');
                            }}
                            placeholder="19.017800"
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] uppercase tracking-wider font-semibold text-(--text-muted) mb-1">
                            Longitude
                        </label>
                        <input
                            type="text"
                            value={longitude}
                            onChange={(e) => {
                                setLongitude(e.target.value);
                                setGpsState('fallback');
                            }}
                            placeholder="72.847800"
                            className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums rounded border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            required
                        />
                    </div>
                </div>
                <p className="text-[11px] text-(--text-muted)">{gpsMessage}</p>
            </div>

            {/* Required Notes / ATR */}
            <div>
                <label className="block text-xs font-semibold text-(--text-primary) mb-1.5">
                    {notesLabel} <span className="text-red-500">*</span>
                </label>
                <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={notesPlaceholder}
                    className="w-full px-3 py-2 text-xs rounded-md border resize-none focus:outline-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                    required
                />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap"
                        style={{ borderColor: 'var(--border-mid)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md text-white transition-colors whitespace-nowrap disabled:opacity-60"
                    style={{ background: showVerdict && verdict === 'rework' ? '#DC2626' : '#003580' }}
                >
                    {submitting && <Loader2 size={13} className="animate-spin" />}
                    <span>{submitting ? 'Submitting…' : submitLabel}</span>
                </button>
            </div>
        </form>
    );
}
