'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import { useAIServices } from '@/hooks/useAIServices';
import { FileText, MapPin, CheckCircle, Activity, Loader2, Navigation, ImagePlus, X, AlertCircle, AlertTriangle, ThumbsUp, ExternalLink } from 'lucide-react';

export default function LodgeGrievance() {
    const { user, loading: authLoading, logout } = useAuth();
    const router = useRouter();

    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [coordinates, setCoordinates] = useState({ lat: null, lng: null });
    const [ward, setWard] = useState('');
    const [isPublic, setIsPublic] = useState(true);
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

    // Auto-detect location with IP fallback
    const getAutoLocation = useCallback(async () => {
        setLocationLoading(true);
        setError('');

        // Try GPS first, then fallback to IP-based location
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

        // IP-based fallback
        const tryIPLocation = async () => {
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            if (data.city) {
                return { city: data.city, region: data.region, country: data.country_name, source: 'IP' };
            }
            throw new Error('IP location failed');
        };

        try {
            // Try GPS first
            const coords = await tryGPS();
            setCoordinates({ lat: coords.lat, lng: coords.lon });
            try {
                // Reverse geocode the GPS coordinates
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
            // GPS failed, try IP-based location
            try {
                const ipData = await tryIPLocation();
                setLocation(`${ipData.city}, ${ipData.region}`);
            } catch {
                setError('Could not detect location. Please enter manually.');
            }
        } finally {
            setLocationLoading(false);
        }
    }, []);

    // Handle image upload
    const handleImageUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length + images.length > 3) {
            setError('Maximum 3 images allowed');
            return;
        }

        files.forEach(file => {
            if (file.size > 5 * 1024 * 1024) {
                setError('Each image must be less than 5MB');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                setImages(prev => [...prev, { url: e.target.result, file }]);
            };
            reader.readAsDataURL(file);
        });
    };

    const removeImage = (index) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description || !location) {
            setError('Please fill in all required fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Submit complaint and get the response with ID
            const result = await complaintsAPI.submit({
                description,
                location,
                latitude: coordinates.lat,
                longitude: coordinates.lng,
                ward,
                is_public: isPublic,
            });

            // Upload images if any
            if (images.length > 0 && result.id) {
                try {
                    const files = images.map(img => img.file);
                    await complaintsAPI.uploadImages(result.id, files);
                } catch (uploadErr) {
                    console.error('Image upload failed:', uploadErr);
                    // Don't fail the whole submission if image upload fails
                }
            }

            setSuccess(true);
            setTimeout(() => {
                router.push('/citizen/track');
            }, 2000);
        } catch (err) {
            const errorMsg = err.message || 'Failed to submit complaint';
            // If auth error, redirect to login
            if (errorMsg.includes('credentials') || errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
                logout();
                router.push('/login?expired=true');
            } else {
                setError(errorMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    // Navigate to existing complaint
    const handleViewComplaint = (complaintId) => {
        router.push(`/citizen/community?highlight=${complaintId}`);
    };

    if (authLoading) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <Loader2 className="animate-spin text-[var(--primary)]" size={32} />
            </div>
        );
    }

    if (success) {
        return (
            <div className="max-w-3xl mx-auto my-8 p-8 card-theme rounded-lg text-center">
                <CheckCircle size={64} className="mx-auto text-[var(--success)] mb-4" />
                <h2 className="text-2xl font-bold text-theme mb-2">Grievance Submitted Successfully!</h2>
                <p className="text-theme-secondary">Your complaint has been classified and routed to the appropriate department.</p>
                <p className="text-theme-muted mt-2">Redirecting to your complaints...</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto my-8 p-6 card-theme rounded-lg">
            <h2 className="text-2xl font-bold text-theme mb-6 flex items-center gap-2">
                <FileText className="text-[var(--accent)]" /> Lodge a New Grievance
            </h2>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">
                        Describe the Issue <span className="text-[var(--error)]">*</span>
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full p-3 input-theme rounded-lg focus:ring-2 focus:ring-[var(--input-focus)] outline-none transition"
                        rows="4"
                        placeholder="E.g., Large pothole at Main Street causing traffic jams. Multiple vehicles have been damaged..."
                    />
                    <p className="text-xs text-theme-muted mt-1">
                        Our AI will automatically detect the category, priority, and check for similar reports.
                    </p>
                </div>

                {/* Similar Issues Alert - AUTOMATIC */}
                {similarComplaints.length > 0 && (
                    <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-800 shadow-sm">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="p-2 bg-[var(--warning-bg)] rounded-full flex-shrink-0">
                                <AlertTriangle className="text-[var(--warning)]" size={20} />
                            </div>
                            <div>
                                <h4 className="font-bold text-theme">Similar Issue Already Reported!</h4>
                                <p className="text-sm text-theme-secondary">
                                    We found {similarComplaints.length} similar complaint{similarComplaints.length > 1 ? 's' : ''} in our system.
                                    Consider upvoting an existing one to boost its priority instead of creating a duplicate.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3 max-h-60 overflow-y-auto">
                            {similarComplaints.map((complaint, idx) => (
                                <div key={idx} className="p-3 bg-theme-card rounded-lg border border-theme shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--primary-light)] text-[var(--primary)]">
                                                    {complaint.category}
                                                </span>
                                                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${complaint.status === 'resolved'
                                                        ? 'bg-[var(--success-bg)] text-[var(--success)]'
                                                        : complaint.status === 'in_progress'
                                                            ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                                                            : 'bg-theme-tertiary text-theme-secondary'
                                                    }`}>
                                                    {complaint.status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                </span>
                                                <span className="text-xs text-theme-muted">
                                                    {Math.round(complaint.similarity_score * 100)}% match
                                                </span>
                                            </div>
                                            <p className="text-sm text-theme line-clamp-2">{complaint.description}</p>
                                            <p className="text-xs text-theme-muted mt-1 flex items-center gap-1">
                                                <MapPin size={10} /> {complaint.location}
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleViewComplaint(complaint.complaint_id)}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-[var(--primary)] text-white rounded-md text-xs font-medium hover:bg-[var(--primary-dark)] transition"
                                            >
                                                <ThumbsUp size={12} /> Upvote This
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleViewComplaint(complaint.complaint_id)}
                                                className="flex items-center gap-1 px-3 py-1.5 border border-theme text-theme-secondary rounded-md text-xs font-medium hover:bg-theme-tertiary transition"
                                            >
                                                <ExternalLink size={12} /> View
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <p className="text-xs text-theme-muted mt-3 text-center">
                            You can still submit a new complaint if your issue is different.
                        </p>
                    </div>
                )}

                {/* AI Detection Display */}
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-4 rounded-lg border border-theme">
                    <h3 className="text-sm font-semibold text-theme-secondary mb-3 flex items-center gap-2">
                        <Activity className="text-[var(--primary)]" size={16} />
                        AI Analysis
                        {(aiLoading || similarityLoading) && <Loader2 className="animate-spin text-[var(--primary)]" size={14} />}
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-theme-muted mb-1">Detected Category</label>
                            <div className="w-full p-3 bg-theme-card border border-theme rounded-lg font-semibold text-theme flex items-center justify-between shadow-sm">
                                {aiLoading ? (
                                    <span className="text-theme-muted">Analyzing...</span>
                                ) : classification?.category ? (
                                    <>
                                        <span className="text-[var(--primary)]">{classification.category}</span>
                                        <CheckCircle size={16} className="text-[var(--success)]" />
                                    </>
                                ) : (
                                    <span className="text-theme-muted">Start typing to detect...</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-theme-muted mb-1">Priority Assessment</label>
                            <div className="w-full p-3 bg-theme-card border border-theme rounded-lg font-semibold flex items-center justify-between shadow-sm">
                                <span className={`${classification?.priority === 'High' ? 'text-[var(--error)]' :
                                    classification?.priority === 'Medium' ? 'text-[var(--accent)]' : 'text-[var(--primary)]'
                                    }`}>
                                    {aiLoading ? 'Calculating...' : (classification?.priority ? `${classification.priority} Priority` : 'Low Priority')}
                                </span>
                                {classification?.confidence > 0 && (
                                    <span className="text-xs text-theme-muted bg-theme-tertiary px-2 py-1 rounded">
                                        {Math.round(classification.confidence)}% confident
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Image Upload */}
                <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">
                        Attach Photos (Optional)
                    </label>
                    <div className="border-2 border-dashed border-theme rounded-lg p-4 hover:border-[var(--primary)] transition">
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleImageUpload}
                            className="hidden"
                            id="image-upload"
                        />
                        <label htmlFor="image-upload" className="cursor-pointer flex flex-col items-center">
                            <ImagePlus className="text-theme-muted mb-2" size={32} />
                            <span className="text-sm text-theme-muted">Click to upload images (max 3)</span>
                        </label>
                    </div>

                    {images.length > 0 && (
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {images.map((img, idx) => (
                                <div key={idx} className="relative">
                                    <img src={img.url} alt={`Upload ${idx + 1}`} className="w-20 h-20 object-cover rounded-lg border border-theme" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(idx)}
                                        className="absolute -top-2 -right-2 bg-[var(--error)] text-white rounded-full p-1"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Location with Auto-detect */}
                <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">
                        Location <span className="text-[var(--error)]">*</span>
                    </label>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-3 text-theme-muted" size={18} />
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full pl-10 pr-32 p-3 input-theme rounded-lg focus:ring-2 focus:ring-[var(--input-focus)] outline-none"
                            placeholder="Enter exact location or use auto-detect"
                        />
                        <button
                            type="button"
                            onClick={getAutoLocation}
                            disabled={locationLoading}
                            className="absolute right-2 top-2 bg-[var(--primary-light)] hover:bg-[var(--primary)] hover:text-white text-[var(--primary)] px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1 transition disabled:opacity-50"
                        >
                            {locationLoading ? (
                                <Loader2 className="animate-spin" size={14} />
                            ) : (
                                <Navigation size={14} />
                            )}
                            Auto-detect
                        </button>
                    </div>
                </div>

                {/* Ward */}
                <div>
                    <label className="block text-sm font-medium text-theme-secondary mb-1">Ward / Zone (Optional)</label>
                    <input
                        type="text"
                        value={ward}
                        onChange={(e) => setWard(e.target.value)}
                        className="w-full p-3 input-theme rounded-lg focus:ring-2 focus:ring-[var(--input-focus)] outline-none"
                        placeholder="E.g., Ward 12, Zone A"
                    />
                </div>

                {/* Public Toggle */}
                <div className="flex items-center gap-3 bg-theme-tertiary p-3 rounded-lg">
                    <input
                        type="checkbox"
                        id="isPublic"
                        checked={isPublic}
                        onChange={(e) => setIsPublic(e.target.checked)}
                        className="w-5 h-5 text-[var(--primary)] rounded"
                    />
                    <label htmlFor="isPublic" className="text-sm text-theme-secondary">
                        Make this complaint visible in community feed (others can upvote to boost priority)
                    </label>
                </div>

                {error && (
                    <div className="text-[var(--error)] text-sm bg-[var(--error-bg)] p-3 rounded-lg flex items-center gap-2">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!description || !location || loading}
                    className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed font-bold py-3.5 rounded-lg shadow-lg transition flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <Loader2 className="animate-spin" size={18} />
                            Submitting...
                        </>
                    ) : (
                        <>
                            <CheckCircle size={18} />
                            Submit Grievance
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}
