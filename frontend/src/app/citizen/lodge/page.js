'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import { useAIServices } from '@/hooks/useAIServices';
import { FileText, MapPin, CheckCircle, Activity, Loader2, Navigation, ImagePlus, X, AlertCircle, AlertTriangle, ExternalLink } from 'lucide-react';

export default function LodgeGrievance() {
    const { user, loading: authLoading, logout } = useAuth();
    const router = useRouter();

    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [coordinates, setCoordinates] = useState({ lat: null, lng: null });
    const [ward, setWard] = useState('');
    const [images, setImages] = useState([]);

    // Use AI Hook
    const {
        classify,
        classification,
        loading: aiLoading,
        checkSimilar,
        similarComplaints,
        clearSimilar
    } = useAIServices();

    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [similarityLoading, setSimilarityLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Redirect if not logged in
    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    // AI Preview & Similarity Check - debounced and automatic
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (description.length >= 15) {
                // Run classification
                classify(description);

                // Run similarity check automatically
                setSimilarityLoading(true);
                try {
                    await checkSimilar(description);
                } catch (err) {
                    console.error('Similarity check failed:', err);
                } finally {
                    setSimilarityLoading(false);
                }
            } else {
                clearSimilar();
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [description, classify, checkSimilar, clearSimilar]);

    // Auto-detect location
    const getAutoLocation = useCallback(async () => {
        setLocationLoading(true);
        setError('');

        const tryGPS = () => {
            return new Promise((resolve, reject) => {
                if (!navigator.geolocation) {
                    reject(new Error('GPS not supported'));
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, source: 'GPS' }),
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                );
            });
        };

        const tryIPLocation = async () => {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data.city) return { city: data.city, region: data.region, country: data.country_name, source: 'IP' };
            throw new Error('IP location failed');
        };

        try {
            const coords = await tryGPS();
            setCoordinates({ lat: coords.lat, lng: coords.lon });
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json`,
                    { headers: { 'User-Agent': 'SamadhanSetu/1.0' } }
                );
                const data = await response.json();
                if (data.display_name) {
                    const addr = data.address;
                    const parts = [addr.road, addr.suburb, addr.city || addr.town, addr.state].filter(Boolean);
                    setLocation(parts.join(', ') || data.display_name);
                } else {
                    setLocation(`GPS: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
                }
            } catch {
                setLocation(`GPS: ${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
            }
        } catch (gpsError) {
            try {
                const ipData = await tryIPLocation();
                setLocation(`${ipData.city}, ${ipData.region}`);
            } catch {
                setError('Location access denied. Please enter manually.');
            }
        } finally {
            setLocationLoading(false);
        }
    }, []);

    // Handle image upload
    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length + images.length > 3) {
            setError('Max 3 files');
            return;
        }

        files.forEach(file => {
            if (file.size > 5 * 1024 * 1024) {
                setError('Files must be under 5MB');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => setImages(prev => [...prev, { url: e.target.result, file }]);
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index) => setImages(prev => prev.filter((_, i) => i !== index));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description || !location) {
            setError('Missing fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await complaintsAPI.submit({
                description, location, latitude: coordinates.lat, longitude: coordinates.lng, ward, is_public: true,
            });

            if (images.length > 0 && result.id) {
                try {
                    const files = images.map(img => img.file);
                    await complaintsAPI.uploadImages(result.id, files);
                } catch (uploadErr) {
                    console.error('Image upload failed:', uploadErr);
                }
            }

            setSuccess(true);
            setTimeout(() => router.push('/citizen/track'), 1500);
        } catch (err) {
            const errorMsg = err.message || 'Submission failed';
            if (errorMsg.includes('credentials') || errorMsg.includes('401')) {
                logout();
                router.push('/login?expired=true');
            } else setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) {
        return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="animate-spin opacity-50" /></div>;
    }

    if (success) {
        return (
            <div className="max-w-2xl mx-auto mt-16 p-12 glass-panel text-center animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-theme flex items-center justify-center mx-auto mb-6 border border-theme">
                    <CheckCircle className="text-theme" size={32} />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2 text-theme">Request Registered</h2>
                <p className="text-sm text-theme-muted mb-6">Neural routing complete. Redirecting to timeline...</p>
                <Loader2 className="animate-spin opacity-30 mx-auto" size={16} />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-theme mb-2">New Request</h2>
                <p className="text-sm text-theme-muted">File a new anomaly report. Fields marked * are mandatory.</p>
            </div>

            <div className="flex flex-col md:flex-row gap-8">
                {/* Main Form Area */}
                <div className="w-full md:w-2/3">
                    <form onSubmit={handleSubmit} className="space-y-8 glass-panel p-8">
                        <div>
                            <label className="block text-xs font-semibold tracking-wider uppercase text-theme-secondary mb-3">
                                Description Data <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full min-h-[140px] p-4 bg-transparent border border-theme rounded-xl text-theme focus:border-theme focus:ring-1 focus:ring-theme outline-none resize-none transition-all"
                                placeholder="Detail the civic issue precisely. E.g., 'Main water pipe burst on 5th Avenue causing flooding...'"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold tracking-wider uppercase text-theme-secondary mb-3">
                                Telemetry (Location) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative flex items-center">
                                <MapPin className="absolute left-4 opacity-40 text-theme" size={16} />
                                <input
                                    type="text"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full pl-12 pr-32 p-4 bg-transparent border border-theme rounded-xl text-theme focus:border-theme focus:ring-1 focus:ring-theme outline-none transition-all"
                                    placeholder="Input exact address"
                                />
                                <button
                                    type="button"
                                    onClick={getAutoLocation}
                                    disabled={locationLoading}
                                    className="absolute right-2 px-4 py-2 text-xs font-semibold bg-theme-tertiary border border-theme text-theme rounded-lg hover:bg-theme-secondary transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {locationLoading ? <Loader2 className="animate-spin" size={14} /> : <Navigation size={14} />} 
                                    Locate
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-semibold tracking-wider uppercase text-theme-secondary mb-3">
                                    Zone (Optional)
                                </label>
                                <input
                                    type="text"
                                    value={ward}
                                    onChange={(e) => setWard(e.target.value)}
                                    className="w-full p-4 bg-transparent border border-theme rounded-xl text-theme focus:border-theme focus:ring-1 focus:ring-theme outline-none"
                                    placeholder="E.g., Sector 4"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-semibold tracking-wider uppercase text-theme-secondary mb-3">
                                    Visual Context (<span className="opacity-50">{images.length}/3</span>)
                                </label>
                                <div className="relative">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        id="image-upload"
                                    />
                                    <label htmlFor="image-upload" className="flex items-center justify-center gap-2 w-full p-4 bg-transparent border border-theme border-dashed rounded-xl text-theme cursor-pointer hover:bg-theme-tertiary hover:border-solid transition-all">
                                        <ImagePlus size={16} className="opacity-60" /> Upload Images
                                    </label>
                                </div>
                            </div>
                        </div>

                        {images.length > 0 && (
                            <div className="flex gap-4 flex-wrap">
                                {images.map((img, idx) => (
                                    <div key={idx} className="relative group">
                                        <img src={img.url} alt={`Preview ${idx}`} className="w-16 h-16 object-cover rounded-lg border border-theme shadow-sm" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(idx)}
                                            className="absolute -top-2 -right-2 w-5 h-5 bg-white border border-gray-200 dark:bg-zinc-800 dark:border-zinc-700 text-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {error && (
                            <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/10 text-red-600 text-sm flex items-center gap-3">
                                <AlertCircle size={16} /> {error}
                            </div>
                        )}

                        <div className="pt-4 border-t border-theme">
                            <button
                                type="submit"
                                disabled={!description || !location || loading}
                                className="w-full btn-primary py-4 rounded-xl flex justify-center items-center gap-2 tracking-wide disabled:opacity-50"
                            >
                                {loading ? <Loader2 className="animate-spin" size={16} /> : 'Execute Request'}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Right Panel: AI & Similar Items */}
                <div className="w-full md:w-1/3 flex flex-col gap-6">
                    {/* Live AI Analysis Module (Very Minimal) */}
                    <div className="glass-panel p-6 border-l-2 border-l-theme">
                        <h3 className="text-[10px] font-bold tracking-widest uppercase text-theme-muted mb-6 flex items-center gap-2">
                            <Activity size={12} /> AI Analysis Log {aiLoading && <span className="w-1 h-1 rounded-full bg-theme animate-pulse ml-auto"></span>}
                        </h3>
                        
                        <div className="flex justify-between items-center mb-4 pb-4 border-b border-theme border-dashed">
                            <span className="text-xs text-theme-secondary">Class</span>
                            <span className="text-sm font-semibold text-theme">
                                {classification?.category ? classification.category : <span className="opacity-30">Awaiting input...</span>}
                            </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                            <span className="text-xs text-theme-secondary">Initial Priority</span>
                            {classification?.priority ? (
                                <span className={`text-xs px-2 py-1 rounded font-semibold tracking-wider uppercase
                                    ${classification.priority === 'High' ? 'bg-red-50 text-red-600 border border-red-100 dark:bg-red-900/20 dark:border-red-900/30' :
                                      classification.priority === 'Medium' ? 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/30' :
                                      'bg-theme-tertiary text-theme border border-theme'}
                                `}>
                                    {classification.priority}
                                </span>
                            ) : (
                                <span className="text-xs opacity-30">—</span>
                            )}
                        </div>
                    </div>

                    {/* Similar Deduplication Radar */}
                    {similarComplaints.length > 0 && (
                        <div className="glass-panel p-6 border-l-2 border-l-amber-500">
                            <h3 className="text-[10px] font-bold tracking-widest uppercase text-theme-muted mb-4 flex items-center gap-2">
                                <AlertTriangle size={12} className="text-amber-500" /> Duplication Radar
                            </h3>
                            <p className="text-xs text-theme-secondary mb-4 leading-relaxed">
                                System detected {similarComplaints.length} existing record(s) matching your input signature. 
                            </p>
                            
                            <div className="space-y-3">
                                {similarComplaints.slice(0, 2).map((comp, idx) => (
                                    <div key={idx} className="p-3 bg-theme-secondary border border-theme rounded-xl shadow-sm text-sm">
                                        <p className="text-theme font-medium truncate mb-2">{comp.description}</p>
                                        <div className="flex items-center justify-between text-xs text-theme-muted">
                                            <span>Match: {Math.round(comp.similarity_score * 100)}%</span>
                                            <button 
                                                type="button" 
                                                onClick={() => router.push(`/citizen/community?highlight=${comp.complaint_id}`)}
                                                className="text-theme hover:underline flex items-center gap-1"
                                            >
                                                Boost Existing <ExternalLink size={10} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
