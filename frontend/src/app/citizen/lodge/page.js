'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { complaintsAPI } from '@/lib/api';
import { useAIServices } from '@/hooks/useAIServices';
import {
    MapPin, CheckCircle, Loader2, Navigation,
    ImagePlus, X, AlertCircle, AlertTriangle,
    ExternalLink, ShieldCheck, Activity, ChevronRight
} from 'lucide-react';

export default function LodgeGrievance() {
    const { user, loading: authLoading, logout } = useAuth();
    const { t, tCategory, tPriority } = useLanguage();
    const router = useRouter();

    const [title, setTitle]           = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation]     = useState('');
    const [coordinates, setCoordinates] = useState({ lat: null, lng: null });
    const [ward, setWard]             = useState('');
    const [images, setImages]         = useState([]);
    const [isPublic, setIsPublic]     = useState(true);

    const {
        classify, classification, loading: aiLoading,
        checkSimilar, similarComplaints, clearSimilar
    } = useAIServices();

    const [loading, setLoading]               = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [similarityLoading, setSimilarityLoading] = useState(false);
    const [error, setError]                   = useState('');
    const [success, setSuccess]               = useState(false);

    useEffect(() => {
        if (!authLoading && !user) router.push('/login');
    }, [user, authLoading, router]);

    // AI classification + similarity — debounced 1s
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (description.length >= 15) {
                classify(description);
                setSimilarityLoading(true);
                try { await checkSimilar(description); }
                catch { /* silent */ }
                finally { setSimilarityLoading(false); }
            } else {
                clearSimilar();
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [description, classify, checkSimilar, clearSimilar]);

    const getAutoLocation = useCallback(async () => {
        setLocationLoading(true);
        setError('');
        const tryGPS = () => new Promise((resolve, reject) => {
            if (!navigator.geolocation) { reject(new Error('GPS not supported')); return; }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
                reject,
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
        try {
            const coords = await tryGPS();
            setCoordinates({ lat: coords.lat, lng: coords.lon });
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json`,
                    { headers: { 'User-Agent': 'SamadhanSetu/1.0' } }
                );
                const data = await res.json();
                if (data.display_name) {
                    const a = data.address;
                    setLocation([a.road, a.suburb, a.city || a.town, a.state].filter(Boolean).join(', ') || data.display_name);
                } else {
                    setLocation(`GPS: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
                }
            } catch {
                setLocation(`GPS: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
            }
        } catch {
            setError(t('err_location_denied'));
        } finally {
            setLocationLoading(false);
        }
    }, [t]);

    const handleImageUpload = e => {
        const files = Array.from(e.target.files);
        if (files.length + images.length > 3) { setError(t('err_max_files')); return; }
        files.forEach(file => {
            if (file.size > 5 * 1024 * 1024) { setError(t('err_file_size')); return; }
            const reader = new FileReader();
            reader.onload = ev => setImages(prev => [...prev, { url: ev.target.result, file }]);
            reader.readAsDataURL(file);
        });
    };

    const removeImage = idx => setImages(prev => prev.filter((_, i) => i !== idx));

    const handleSubmit = async e => {
        e.preventDefault();
        if (!title || !description || !location) {
            setError(t('err_required_fields'));
            return;
        }
        setLoading(true);
        setError('');
        try {
            const result = await complaintsAPI.submit({
                title, description, location,
                latitude: coordinates?.lat ?? null,
                longitude: coordinates?.lng ?? null,
                ward, is_public: isPublic,
            });
            if (images.length > 0 && result.id) {
                try {
                    await complaintsAPI.uploadImages(result.id, images.map(i => i.file));
                } catch (imgErr) {
                    setError(`${t('grievance_registered')} (${imgErr.message})`);
                    setLoading(false);
                    return;
                }
            }
            setSuccess(true);
            setTimeout(() => router.push('/citizen/track'), 2000);
        } catch (err) {
            const msg = err.message || 'Submission failed';
            if (msg.includes('credentials') || msg.includes('401')) {
                logout(); router.push('/login?expired=true');
            } else setError(msg);
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="animate-spin" size={32} style={{ color: 'var(--navy)' }} />
            </div>
        );
    }

    /* ── Success screen ── */
    if (success) {
        return (
            <div className="max-w-md mx-auto mt-20">
                <div className="gov-card p-12 text-center"
                    style={{ borderTop: '4px solid var(--india-green)' }}>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                        style={{ background: 'var(--india-green-light)' }}>
                        <CheckCircle size={36} style={{ color: 'var(--india-green)' }} />
                    </div>
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--navy)' }}>
                        {t('grievance_registered')}
                    </h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                        {t('grievance_registered_desc')}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold"
                        style={{ color: 'var(--navy)' }}>
                        <Loader2 className="animate-spin" size={16} /> {t('redirecting_tracking')}
                    </div>
                </div>
            </div>
        );
    }

    const canSubmit = title && description && location && !loading;
    const aiConfidence = classification?.confidence != null
        ? Math.round(classification.confidence <= 1 ? classification.confidence * 100 : classification.confidence)
        : null;

    return (
        <div className="max-w-5xl mx-auto py-6">

            {/* ── Page Header ── */}
            <div className="mb-6">
                <div className="breadcrumb mb-2">
                    <Link href="/">{t('home')}</Link>
                    <ChevronRight size={10} className="breadcrumb-sep" />
                    <span className="breadcrumb-current">{t('lodge_grievance')}</span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={18} style={{ color: 'var(--india-green)' }} />
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--navy)' }}>
                        {t('report_civic_issue')}
                    </h1>
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('mandatory_note')}
                </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">

                {/* ── Main Form ── */}
                <div className="flex-1">
                    <form onSubmit={handleSubmit} noValidate>

                        {/* Section 1: Basic Info */}
                        <div className="gov-section mb-5">
                            <div className="gov-section-header">
                                <span className="gov-section-title">{t('lodge_sec1')}</span>
                            </div>
                            <div className="p-5 space-y-5">

                                {/* Title */}
                                <div>
                                    <label className="gov-label">
                                        {t('subject_title')} <span style={{ color: 'var(--error)' }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="gov-input"
                                        placeholder={t('subject_placeholder')}
                                        maxLength={200}
                                    />
                                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                        {t('characters_count', { count: title.length })}
                                    </p>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="gov-label">
                                        {t('description')} <span style={{ color: 'var(--error)' }}>*</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        className="gov-input resize-none"
                                        rows={5}
                                        placeholder={t('describe_issue')}
                                    />
                                    {description.length >= 15 && (
                                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px]"
                                            style={{ color: 'var(--india-green)' }}>
                                            <Activity size={11} />
                                            {t('ai_analysing')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Location */}
                        <div className="gov-section mb-5">
                            <div className="gov-section-header">
                                <span className="gov-section-title">{t('lodge_sec2')}</span>
                            </div>
                            <div className="p-5 space-y-5">

                                <div>
                                    <label className="gov-label">
                                        {t('address_location')} <span style={{ color: 'var(--error)' }}>*</span>
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <MapPin
                                                size={15}
                                                className="absolute left-3 top-1/2 -translate-y-1/2"
                                                style={{ color: 'var(--text-muted)' }}
                                            />
                                            <input
                                                type="text"
                                                value={location}
                                                onChange={e => {
                                                    setLocation(e.target.value);
                                                    setCoordinates({ lat: null, lng: null });
                                                }}
                                                className="gov-input pl-9"
                                                placeholder={t('address_placeholder')}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={getAutoLocation}
                                            disabled={locationLoading}
                                            className="btn-outline flex items-center gap-1.5 text-sm flex-shrink-0 px-4"
                                        >
                                            {locationLoading
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <Navigation size={14} />}
                                            {t('locate')}
                                        </button>
                                    </div>
                                    {coordinates?.lat != null && coordinates?.lng != null && (
                                        <p className="text-[11px] mt-1" style={{ color: 'var(--india-green)' }}>
                                            ✓ {t('gps_captured')}: {coordinates.lat.toFixed(5)}, {coordinates.lng.toFixed(5)}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="gov-label">
                                        {t('zone_ward')}
                                    </label>
                                    <input
                                        type="text"
                                        value={ward}
                                        onChange={e => setWard(e.target.value)}
                                        className="gov-input"
                                        placeholder={t('ward_placeholder')}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Evidence */}
                        <div className="gov-section mb-5">
                            <div className="gov-section-header">
                                <span className="gov-section-title">{t('lodge_sec3')}</span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {t('uploaded_count', { count: images.length })}
                                </span>
                            </div>
                            <div className="p-5">
                                <input
                                    type="file" accept="image/*" multiple
                                    onChange={handleImageUpload}
                                    className="hidden" id="image-upload"
                                />
                                {images.length < 3 && (
                                    <label htmlFor="image-upload"
                                        className="flex items-center justify-center gap-2 w-full py-5 rounded-lg cursor-pointer text-sm font-medium transition-colors"
                                        style={{
                                            border: '2px dashed var(--border-mid)',
                                            background: 'var(--bg-section)',
                                            color: 'var(--text-secondary)'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--navy)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-mid)'}
                                    >
                                        <ImagePlus size={18} style={{ color: 'var(--navy)' }} />
                                        {t('upload_photos_hint')}
                                    </label>
                                )}
                                {images.length > 0 && (
                                    <div className="flex gap-3 flex-wrap mt-3">
                                        {images.map((img, idx) => (
                                            <div key={idx} className="relative group">
                                                <img src={img.url} alt={`Preview ${idx + 1}`}
                                                    className="w-20 h-20 object-cover rounded-lg"
                                                    style={{ border: '1px solid var(--border)' }} />
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(idx)}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                    style={{ background: 'var(--error)' }}
                                                >
                                                    <X size={11} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="gov-alert error mb-4">
                                <AlertCircle size={15} />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}

                        {/* Privacy toggle */}
                        <div className="gov-card p-4 mb-5">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div>
                                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                        {t('public_grievance')}
                                    </span>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        {isPublic ? t('public_visible_hint') : t('private_visible_hint')}
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                    className="w-5 h-5 accent-[var(--navy)]"
                                />
                            </label>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="btn-primary w-full py-3.5 text-base justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading
                                ? <><Loader2 size={18} className="animate-spin" /> {t('submitting')}</>
                                : t('submit_grievance')
                            }
                        </button>
                    </form>
                </div>

                {/* ── Right Sidebar: AI Panel ── */}
                <div className="w-full lg:w-72 flex flex-col gap-4 flex-shrink-0">

                    {/* AI Classifier */}
                    <div className="gov-section">
                        <div className="gov-section-header">
                            <span className="gov-section-title flex items-center gap-1.5">
                                <Activity size={11} /> {t('ai_classifier')}
                            </span>
                            {(aiLoading || similarityLoading) && (
                                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--navy)' }} />
                            )}
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('category')}</span>
                                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    {classification?.category
                                        ? tCategory(classification.category)
                                        : <span style={{ opacity: 0.5 }}>{t('waiting')}</span>}
                                </span>
                            </div>
                            <div className="gov-divider my-0" />
                            <div className="flex justify-between items-center">
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('priority')}</span>
                                {classification?.priority ? (
                                    <span className={`badge ${
                                        ['High', 'Critical'].includes(classification.priority) ? 'badge-critical' :
                                        classification.priority === 'Medium' ? 'badge-progress' : 'badge-resolved'
                                    }`}>
                                        {tPriority(classification.priority)}
                                    </span>
                                ) : (
                                    <span className="text-xs" style={{ opacity: 0.5, color: 'var(--text-muted)' }}>—</span>
                                )}
                            </div>
                            {aiConfidence && (
                                <>
                                    <div className="gov-divider my-0" />
                                    <div>
                                        <div className="flex justify-between text-xs mb-1"
                                            style={{ color: 'var(--text-muted)' }}>
                                            <span>{t('confidence')}</span>
                                            <span className="font-semibold" style={{ color: 'var(--navy)' }}>{aiConfidence}%</span>
                                        </div>
                                        <div className="priority-bar">
                                            <div className="priority-bar-fill medium"
                                                style={{ width: `${aiConfidence}%`, background: 'var(--navy)' }} />
                                        </div>
                                    </div>
                                </>
                            )}
                            {!classification && !aiLoading && (
                                <p className="text-[11px] text-center py-2" style={{ color: 'var(--text-muted)' }}>
                                    {t('ai_min_chars')}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Similar Complaints Warning */}
                    {similarComplaints.length > 0 && (
                        <div className="gov-section" style={{ borderTop: '3px solid var(--saffron)' }}>
                            <div className="gov-section-header">
                                <span className="gov-section-title flex items-center gap-1.5">
                                    <AlertTriangle size={11} /> {t('duplicate_check')}
                                </span>
                            </div>
                            <div className="p-4">
                                <div className="gov-alert warning mb-3 text-xs">
                                    <AlertTriangle size={13} />
                                    {t('similar_exist', { count: similarComplaints.length })}
                                </div>
                                <div className="space-y-2">
                                    {similarComplaints.slice(0, 2).map((comp, idx) => (
                                        <div key={idx} className="p-3 rounded-lg"
                                            style={{ background: 'var(--bg-section)', border: '1px solid var(--border)' }}>
                                            <p className="text-xs font-medium truncate mb-2"
                                                style={{ color: 'var(--text-primary)' }}>
                                                {comp.description}
                                            </p>
                                            <div className="flex justify-between items-center">
                                                <span className="badge badge-progress text-[10px]">
                                                    {t('match_pct', { pct: Math.round(comp.similarity_score * 100) })}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => router.push(`/citizen/community?highlight=${comp.complaint_id}`)}
                                                    className="text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                                                    style={{ color: 'var(--navy)' }}
                                                >
                                                    {t('view')} <ExternalLink size={10} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Guidelines */}
                    <div className="gov-card p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider mb-3"
                            style={{ color: 'var(--navy)' }}>
                            {t('submission_guidelines')}
                        </h4>
                        <ul className="text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
                            {[
                                t('guideline_1'),
                                t('guideline_2'),
                                t('guideline_3'),
                                t('guideline_4'),
                            ].map((tip, i) => (
                                <li key={i} className="flex items-start gap-2">
                                    <span className="text-[10px] font-bold mt-0.5 flex-shrink-0"
                                        style={{ color: 'var(--saffron-dark)' }}>
                                        {i + 1}.
                                    </span>
                                    {tip}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
