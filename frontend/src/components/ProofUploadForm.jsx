'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
    Camera,
    MapPin,
    Upload,
    X,
    CheckCircle2,
    AlertTriangle,
    Crosshair,
    Loader2,
    Compass,
    Save,
    Wrench,
} from 'lucide-react';
import { getImageUrl } from '@/lib/api';
import {
    MAX_PROOF_FILES,
    validateClientImageFile,
    validateGpsCoordinates,
    computeSiteDistanceMeters,
    evaluateGeofence,
    parseExifGpsFromJpeg,
    formatFileSize,
    formatGpsSourceLabel,
    formatCoordinates,
} from '@/lib/proofUpload';

export default function ProofUploadForm({
    mode = 'inspection', // 'inspection' | 'verification' | 'resolution'
    title = 'Upload Geotagged Field Proof',
    subtitle = 'Photo evidence and GPS coordinates are required.',
    notesLabel = 'Field Observations / Notes',
    notesPlaceholder = 'Describe site conditions, measurements, and findings...',
    submitLabel = 'Submit Proof',
    stageLabel = '',
    defaultLat = null,
    defaultLng = null,
    existingProofs = [],
    showVerdict = false,
    showMaterials = false,
    submitting = false,
    staging = false,
    onSubmit,
    onStageOnly,
    onCancel,
}) {
    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [notes, setNotes] = useState('');
    const [materialsUsed, setMaterialsUsed] = useState('');
    const [verdict, setVerdict] = useState('verified');
    const [latitude, setLatitude] = useState(
        defaultLat !== null && defaultLat !== undefined ? String(defaultLat) : ''
    );
    const [longitude, setLongitude] = useState(
        defaultLng !== null && defaultLng !== undefined ? String(defaultLng) : ''
    );
    const [gpsAccuracy, setGpsAccuracy] = useState(null);
    const [gpsCapturedAt, setGpsCapturedAt] = useState(null);
    const [gpsSource, setGpsSource] = useState(
        defaultLat !== null && defaultLat !== undefined ? 'manual_pin' : 'manual_fallback'
    );
    const [gpsState, setGpsState] = useState('idle'); // idle | locating | captured | exif | fallback
    const [gpsMessage, setGpsMessage] = useState(
        defaultLat !== null && defaultLat !== undefined
            ? 'Pre-filled from reported site pin. Capture Live GPS on site or upload a geotagged JPEG.'
            : 'Capture Live GPS on site, upload a geotagged JPEG, or enter decimal coordinates.'
    );
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef(null);
    const previewsRef = useRef([]);

    useEffect(() => {
        previewsRef.current = previews;
    }, [previews]);

    useEffect(() => {
        return () => {
            previewsRef.current.forEach((p) => {
                if (p?.url) URL.revokeObjectURL(p.url);
            });
        };
    }, []);

    const hasExistingStagePhotos = Array.isArray(existingProofs) && existingProofs.length > 0;
    const isBusy = submitting || staging;

    const liveGeofence = useMemo(() => {
        const parsed = validateGpsCoordinates(latitude, longitude, gpsAccuracy, { required: false });
        if (!parsed.valid || parsed.latitude === null || parsed.longitude === null) {
            return null;
        }
        const distance = computeSiteDistanceMeters(
            defaultLat,
            defaultLng,
            parsed.latitude,
            parsed.longitude
        );
        return {
            distance,
            ...evaluateGeofence(distance),
        };
    }, [latitude, longitude, gpsAccuracy, defaultLat, defaultLng]);

    const captureGPS = () => {
        setError('');
        if (typeof window === 'undefined' || !navigator.geolocation) {
            setGpsState('fallback');
            setGpsSource(defaultLat !== null && defaultLat !== undefined ? 'manual_pin' : 'manual_fallback');
            setGpsMessage('Browser geolocation unavailable — verify or edit site coordinates below.');
            return;
        }
        setGpsState('locating');
        setGpsMessage('Acquiring device GPS lock…');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const latStr = pos.coords.latitude.toFixed(6);
                const lngStr = pos.coords.longitude.toFixed(6);
                const accVal = Number.isFinite(pos.coords.accuracy)
                    ? Math.round(pos.coords.accuracy * 10) / 10
                    : null;
                setLatitude(latStr);
                setLongitude(lngStr);
                setGpsAccuracy(accVal);
                setGpsCapturedAt(new Date(pos.timestamp || Date.now()).toISOString());
                setGpsSource('live_gps');
                setGpsState('captured');
                setGpsMessage(
                    accVal !== null
                        ? `Live device GPS locked (±${Math.round(accVal)}m accuracy)`
                        : 'Live device GPS locked'
                );
            },
            () => {
                setGpsState('fallback');
                if (defaultLat !== null && defaultLng !== null && defaultLat !== undefined && defaultLng !== undefined) {
                    setLatitude(String(defaultLat));
                    setLongitude(String(defaultLng));
                    setGpsAccuracy(null);
                    setGpsSource('manual_pin');
                    setGpsMessage('Location permission declined — using reported site pin (editable below).');
                } else {
                    setGpsSource('manual_fallback');
                    setGpsMessage('Location permission declined — enter decimal coordinates manually.');
                }
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
    };

    const applySitePin = () => {
        if (defaultLat === null || defaultLat === undefined || defaultLng === null || defaultLng === undefined) return;
        setLatitude(String(defaultLat));
        setLongitude(String(defaultLng));
        setGpsAccuracy(null);
        setGpsCapturedAt(new Date().toISOString());
        setGpsSource('manual_pin');
        setGpsState('fallback');
        setGpsMessage('Coordinates reset to reported grievance site pin.');
    };

    const ingestFiles = async (fileList) => {
        setError('');
        const chosen = Array.from(fileList || []);
        if (chosen.length === 0) return;

        const remaining = MAX_PROOF_FILES - files.length;
        if (remaining <= 0) {
            setError(`Maximum of ${MAX_PROOF_FILES} proof photos already selected.`);
            return;
        }

        const validFiles = [];
        const nextPreviews = [];
        let firstExifCoords = null;

        for (const f of chosen.slice(0, remaining)) {
            const validationErr = validateClientImageFile(f);
            if (validationErr) {
                setError(validationErr);
                continue;
            }
            let exifGps = null;
            if (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name || '')) {
                try {
                    const buf = await f.arrayBuffer();
                    exifGps = parseExifGpsFromJpeg(buf);
                    if (exifGps && !firstExifCoords) {
                        firstExifCoords = exifGps;
                    }
                } catch {
                    exifGps = null;
                }
            }
            validFiles.push(f);
            nextPreviews.push({
                name: f.name,
                url: URL.createObjectURL(f),
                size: f.size,
                exifGps,
            });
        }

        if (chosen.length > remaining) {
            setError(`Only the first ${remaining} additional photo(s) were added (max ${MAX_PROOF_FILES} per upload).`);
        }

        if (validFiles.length > 0) {
            setFiles((prev) => [...prev, ...validFiles].slice(0, MAX_PROOF_FILES));
            setPreviews((prev) => [...prev, ...nextPreviews].slice(0, MAX_PROOF_FILES));
        }

        // Auto-apply embedded EXIF GPS when live GPS hasn't been locked yet
        if (firstExifCoords && gpsState !== 'captured') {
            setLatitude(firstExifCoords.latitude.toFixed(6));
            setLongitude(firstExifCoords.longitude.toFixed(6));
            setGpsAccuracy(null);
            setGpsCapturedAt(new Date().toISOString());
            setGpsSource('exif_gps');
            setGpsState('exif');
            setGpsMessage('GPS coordinates automatically extracted from uploaded photo EXIF metadata.');
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleFileSelect = (e) => {
        ingestFiles(e.target.files);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        ingestFiles(e.dataTransfer?.files);
    };

    const removeFile = (index) => {
        setPreviews((prev) => {
            const target = prev[index];
            if (target?.url) URL.revokeObjectURL(target.url);
            return prev.filter((_, i) => i !== index);
        });
        setFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const buildPayload = ({ isStageOnly = false } = {}) => {
        if (files.length === 0 && (isStageOnly || !hasExistingStagePhotos)) {
            setError(
                mode === 'resolution'
                    ? 'Please attach at least one after-repair resolution proof photo (JPG, PNG, or WebP).'
                    : 'Please attach at least one geotagged site photo (JPG, PNG, or WebP).'
            );
            return null;
        }
        if (!isStageOnly && !notes.trim()) {
            setError(
                mode === 'resolution'
                    ? 'Please enter the Action Taken Report (ATR) detailing the completed work.'
                    : 'Please enter detailed field inspection observations / remarks.'
            );
            return null;
        }

        const gpsCheck = validateGpsCoordinates(latitude, longitude, gpsAccuracy, {
            required: !(isStageOnly && mode === 'resolution'),
        });
        if (!gpsCheck.valid) {
            setError(gpsCheck.error);
            return null;
        }

        return {
            files,
            notes: notes.trim(),
            atr_notes: notes.trim(),
            materials_used: materialsUsed.trim(),
            verdict,
            latitude: gpsCheck.latitude,
            longitude: gpsCheck.longitude,
            gps_accuracy: gpsCheck.accuracy,
            gps_source: gpsSource,
            captured_at: gpsCapturedAt || new Date().toISOString(),
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const payload = buildPayload({ isStageOnly: false });
        if (!payload) return;

        try {
            await onSubmit(payload);
        } catch (err) {
            setError(err.message || 'Submission failed. Please retry.');
        }
    };

    const handleStageOnly = async () => {
        if (!onStageOnly) return;
        setError('');
        const payload = buildPayload({ isStageOnly: true });
        if (!payload) return;

        try {
            await onStageOnly(payload);
            previews.forEach((p) => {
                if (p?.url) URL.revokeObjectURL(p.url);
            });
            setFiles([]);
            setPreviews([]);
        } catch (err) {
            setError(err.message || 'Failed to save photos. Please retry.');
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            data-testid={`proof-upload-form-${mode}`}
            className="rounded-lg border p-5 space-y-4"
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                    <h3 className="text-sm font-bold text-(--text-primary) flex items-center gap-2">
                        <Camera size={16} className="text-(--navy) shrink-0" />
                        <span>{title}</span>
                    </h3>
                    <p className="text-xs text-(--text-secondary) mt-0.5">{subtitle}</p>
                </div>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="p-1.5 rounded text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-section)"
                        aria-label="Close upload form"
                    >
                        <X size={16} />
                    </button>
                )}
            </div>

            {error && (
                <div
                    role="alert"
                    className="p-3 rounded-md border border-red-200 bg-red-50 text-red-700 text-xs flex items-start gap-2"
                >
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {/* Existing Staged Photos for this Stage */}
            {hasExistingStagePhotos && (
                <div className="space-y-2 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-(--text-primary)">
                            Uploaded for this stage ({existingProofs.length})
                        </span>
                        <span className="text-[11px] text-(--text-muted)">
                            You can submit with these photos or attach additional shots below
                        </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {existingProofs.map((proof, idx) => (
                            <div
                                key={proof.id || `${proof.url}-${idx}`}
                                className="rounded-md border overflow-hidden"
                                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={getImageUrl(proof.url)}
                                    alt={proof.file_name || `Uploaded proof ${idx + 1}`}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-20 object-cover"
                                />
                                <div className="px-2 py-1 text-[10px] font-mono tabular-nums text-(--text-muted) truncate">
                                    {formatCoordinates(proof.latitude, proof.longitude)}
                                </div>
                            </div>
                        ))}
                    </div>
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

            {/* Photo Dropzone & File Picker */}
            <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="text-xs font-semibold text-(--text-primary)">
                        {mode === 'resolution' ? 'After-Repair Resolution Proof Photo(s)' : 'Geotagged Site Photo Proof'}{' '}
                        {!hasExistingStagePhotos && <span className="text-red-500">*</span>}
                    </label>
                    <span className="text-[11px] text-(--text-muted) tabular-nums">
                        JPG, PNG, WebP · Max 5 MB each · {files.length}/{MAX_PROOF_FILES} selected
                    </span>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleFileSelect}
                    data-testid="proof-file-input"
                    className="hidden"
                />
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            fileInputRef.current?.click();
                        }
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`w-full py-5 px-4 rounded-md border border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors cursor-pointer ${
                        isDragging ? 'bg-(--bg-section)' : 'hover:bg-(--bg-section)'
                    }`}
                    style={{
                        borderColor: isDragging ? 'var(--navy)' : 'var(--border-strong)',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <Upload size={18} className="text-(--navy)" />
                    <span className="font-semibold text-(--text-primary)">
                        Click to select or drag & drop site proof photos
                    </span>
                    <span className="text-[11px] text-(--text-muted)">
                        EXIF GPS coordinates in JPEG camera photos are extracted automatically
                    </span>
                </div>

                {previews.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
                        {previews.map((p, idx) => (
                            <div
                                key={`${p.name}-${idx}`}
                                className="relative rounded-md border overflow-hidden"
                                style={{ borderColor: 'var(--border)', background: 'var(--bg-page)' }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={p.url}
                                    alt={p.name}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-24 object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => removeFile(idx)}
                                    className="absolute top-1 right-1 p-1 rounded bg-black/75 text-white hover:bg-red-600"
                                    aria-label={`Remove ${p.name}`}
                                >
                                    <X size={12} />
                                </button>
                                <div className="px-2 py-1.5 space-y-0.5 bg-(--bg-card)">
                                    <div className="text-[11px] font-medium truncate text-(--text-primary)">
                                        {p.name}
                                    </div>
                                    <div className="text-[10px] text-(--text-muted) font-mono tabular-nums flex items-center justify-between gap-1">
                                        <span>{formatFileSize(p.size)}</span>
                                        {p.exifGps && <span className="text-[#0A6B05] font-semibold">EXIF GPS</span>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* GPS Metadata Section */}
            <div
                className="rounded-md border p-3.5 space-y-3"
                style={{ background: 'var(--bg-page)', borderColor: 'var(--border)' }}
                data-testid="proof-gps-section"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-(--text-primary)">
                            <MapPin size={14} className="text-(--navy)" />
                            <span>GPS Metadata</span>
                        </span>
                        <span className="text-(--text-muted)" aria-hidden="true">·</span>
                        <span className="text-[11px] text-(--text-secondary)">
                            {formatGpsSourceLabel(gpsSource)}
                        </span>
                        {gpsAccuracy !== null && (
                            <>
                                <span className="text-(--text-muted)" aria-hidden="true">·</span>
                                <span className="text-[11px] font-mono tabular-nums text-(--text-secondary)">
                                    ±{Math.round(gpsAccuracy)}m
                                </span>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        {defaultLat !== null && defaultLat !== undefined && defaultLng !== null && defaultLng !== undefined && (
                            <button
                                type="button"
                                onClick={applySitePin}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors whitespace-nowrap"
                                style={{
                                    background: 'var(--bg-card)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-secondary)',
                                }}
                            >
                                <Compass size={12} />
                                <span>Use Site Pin</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={captureGPS}
                            disabled={gpsState === 'locating'}
                            data-testid="capture-live-gps-btn"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold border transition-colors whitespace-nowrap"
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
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                        <label
                            htmlFor={`proof-lat-${mode}`}
                            className="block text-[11px] font-semibold text-(--text-secondary) mb-1"
                        >
                            Latitude (-90 to 90)
                        </label>
                        <input
                            id={`proof-lat-${mode}`}
                            type="text"
                            inputMode="decimal"
                            value={latitude}
                            onChange={(e) => {
                                setLatitude(e.target.value);
                                setGpsState('fallback');
                                setGpsSource('manual_fallback');
                                setGpsAccuracy(null);
                            }}
                            placeholder="19.019600"
                            data-testid="proof-latitude-input"
                            className="w-full px-2.5 py-2 text-xs font-mono tabular-nums rounded border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            required
                        />
                    </div>
                    <div>
                        <label
                            htmlFor={`proof-lng-${mode}`}
                            className="block text-[11px] font-semibold text-(--text-secondary) mb-1"
                        >
                            Longitude (-180 to 180)
                        </label>
                        <input
                            id={`proof-lng-${mode}`}
                            type="text"
                            inputMode="decimal"
                            value={longitude}
                            onChange={(e) => {
                                setLongitude(e.target.value);
                                setGpsState('fallback');
                                setGpsSource('manual_fallback');
                                setGpsAccuracy(null);
                            }}
                            placeholder="72.839800"
                            data-testid="proof-longitude-input"
                            className="w-full px-2.5 py-2 text-xs font-mono tabular-nums rounded border"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                            required
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" aria-live="polite">
                    <span className="text-(--text-muted)">{gpsMessage}</span>
                    {liveGeofence && (
                        <span
                            data-testid="proof-geofence-status"
                            className={`font-semibold tabular-nums ${
                                liveGeofence.tone === 'success'
                                    ? 'text-[#0A6B05]'
                                    : liveGeofence.tone === 'warning'
                                    ? 'text-[#B45309]'
                                    : 'text-(--text-secondary)'
                            }`}
                        >
                            {liveGeofence.label}
                        </span>
                    )}
                </div>
            </div>

            {/* Materials & Equipment Used (Team Lead Resolution Proof only) */}
            {showMaterials && (
                <div>
                    <label
                        htmlFor={`proof-materials-${mode}`}
                        className="block text-xs font-semibold text-(--text-primary) mb-1.5"
                    >
                        <span className="inline-flex items-center gap-1.5">
                            <Wrench size={13} className="text-(--navy)" />
                            <span>Materials & Equipment Used</span>
                        </span>
                        <span className="text-[11px] font-normal text-(--text-muted) ml-1.5">(Optional)</span>
                    </label>
                    <input
                        id={`proof-materials-${mode}`}
                        type="text"
                        value={materialsUsed}
                        onChange={(e) => setMaterialsUsed(e.target.value)}
                        placeholder="e.g., 200kg hot-mix asphalt, primer tack coat, 8-ton vibratory roller"
                        data-testid="proof-materials-input"
                        className="w-full px-3 py-2 text-xs rounded-md border focus:outline-none"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                    />
                </div>
            )}

            {/* Required Notes / ATR */}
            <div>
                <label
                    htmlFor={`proof-notes-${mode}`}
                    className="block text-xs font-semibold text-(--text-primary) mb-1.5"
                >
                    {notesLabel} <span className="text-red-500">*</span>
                </label>
                <textarea
                    id={`proof-notes-${mode}`}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={notesPlaceholder}
                    data-testid="proof-notes-input"
                    className="w-full px-3 py-2 text-xs rounded-md border resize-none focus:outline-none"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)', color: 'var(--text-primary)' }}
                    required
                />
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isBusy}
                        className="px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap"
                        style={{ borderColor: 'var(--border-mid)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}
                    >
                        Cancel
                    </button>
                )}
                {onStageOnly && stageLabel && (
                    <button
                        type="button"
                        onClick={handleStageOnly}
                        disabled={isBusy}
                        data-testid="proof-stage-btn"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap disabled:opacity-60"
                        style={{ borderColor: 'var(--navy)', color: 'var(--navy)', background: 'var(--bg-card)' }}
                    >
                        {staging ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                        <span>{staging ? 'Uploading…' : stageLabel}</span>
                    </button>
                )}
                <button
                    type="submit"
                    disabled={isBusy}
                    data-testid="proof-submit-btn"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
                    style={{
                        background: showVerdict && verdict === 'rework' ? 'var(--status-critical)' : mode === 'resolution' ? 'var(--india-green)' : 'var(--navy)',
                        color: showVerdict && verdict === 'rework' ? '#FFFFFF' : mode === 'resolution' ? '#FFFFFF' : 'var(--primary-ink)',
                    }}
                >
                    {submitting && <Loader2 size={13} className="animate-spin" />}
                    <span>{submitting ? 'Submitting…' : submitLabel}</span>
                </button>
            </div>
        </form>
    );
}
