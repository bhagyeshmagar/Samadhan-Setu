'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { complaintsAPI } from '@/lib/api';
import Badge from '@/components/Badge';
import { MapPin, Loader2, ArrowRight, ExternalLink } from 'lucide-react';

export default function TrackGrievance() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();

    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!authLoading && !user) {
            router.push('/login');
        }
    }, [user, authLoading, router]);

    useEffect(() => {
        if (user) {
            fetchComplaints();
        }
    }, [user]);

    const fetchComplaints = async () => {
        try {
            const data = await complaintsAPI.getMy();
            // Sort by newest first
            const sortedData = (data || []).sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            setComplaints(sortedData);
        } catch (err) {
            setError(err.message || 'Failed to fetch complaints');
        } finally {
            setLoading(false);
        }
    };

    // Helper to get correct image URL
    const getImageUrl = (img) => {
        if (!img) return '';
        if (typeof img === 'string') {
            if (img.startsWith('{') || img.startsWith('[')) {
                try {
                    const parsed = JSON.parse(img);
                    return getImageUrl(parsed);
                } catch (e) { }
            }
            if (img.startsWith('http')) return img;
            return `http://127.0.0.1:8000${img}`;
        }
        if (img && typeof img === 'object') {
            if (img.path) return `http://127.0.0.1:8000${img.path}`;
            if (img.url) return img.url;
        }
        return '';
    };

    const getResolutionProof = (proof) => {
        if (!proof) return [];
        if (Array.isArray(proof)) return proof;
        if (typeof proof === 'string') {
            try {
                const parsed = JSON.parse(proof);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    };

    // Define standard steps for timeline
    const STEPS = ['Pending', 'In Progress', 'Resolved'];

    if (authLoading || loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <Loader2 className="animate-spin opacity-50 text-theme" size={32} />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto my-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10">
                <h2 className="text-3xl font-bold tracking-tight text-theme mb-2">Request Log</h2>
                <p className="text-sm text-theme-muted">Monitor the progression of your active civic anomalies.</p>
            </div>

            {error && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm mb-6">
                    {error}
                </div>
            )}

            {complaints.length === 0 ? (
                <div className="glass-panel p-16 text-center text-theme-muted rounded-xl border-dashed border-2">
                    <p className="mb-4">No active requests logged in the system.</p>
                    <a href="/citizen/lodge" className="inline-flex items-center gap-2 text-theme font-semibold hover:underline border-b border-theme pb-1 uppercase tracking-wider text-xs">
                        Initiate Request <ArrowRight size={14} />
                    </a>
                </div>
            ) : (
                <div className="space-y-6">
                    {complaints.map((complaint) => {
                        const currentStatus = String(complaint.status || 'Pending').toLowerCase().replace(/_/g, ' ');
                        const isResolved = currentStatus === 'resolved' || currentStatus === 'closed';
                        const isRejected = currentStatus === 'rejected';
                        
                        // Determine active step index
                        let activeStepIndex = 0;
                        if (isResolved) activeStepIndex = 2;
                        else if (currentStatus.includes('progress') || currentStatus.includes('assigned')) activeStepIndex = 1;
                        else if (isRejected) activeStepIndex = -1; // special case

                        return (
                            <div key={complaint.id} className="glass-panel p-8 md:p-10 card-hover-effect rounded-2xl relative overflow-hidden">
                                
                                {/* Background Accent based on status */}
                                {isResolved && <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>}
                                {isRejected && <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none"></div>}
                                
                                <div className="flex flex-col md:flex-row gap-8 md:gap-16">
                                    
                                    {/* Left Side: Details */}
                                    <div className="flex-grow z-10 w-full md:w-1/2">
                                        <div className="flex items-center gap-3 mb-4">
                                            <span className="font-mono text-xs font-bold px-2 py-1 bg-theme-tertiary text-theme rounded border border-theme tracking-widest uppercase">
                                                ID-{complaint.id.substring?.(0, 6) || complaint.id}
                                            </span>
                                            <Badge status={complaint.status} />
                                        </div>
                                        
                                        <h3 className="text-xl font-bold text-theme mb-2 leading-tight">
                                            {complaint.category || 'General Issue'}
                                        </h3>
                                        
                                        <p className="text-sm font-light text-theme-secondary mb-6 leading-relaxed">
                                            {complaint.description}
                                        </p>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-2 text-xs text-theme-muted font-medium">
                                                <MapPin size={14} className="mt-0.5 opacity-60" />
                                                <span className="leading-snug">{complaint.location}</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-[10px] tracking-widest uppercase font-semibold text-theme-secondary">
                                                <span>Logged: {new Date(complaint.created_at).toLocaleDateString()}</span>
                                                <span className="opacity-30">|</span>
                                                <span className={`flex items-center gap-1 ${complaint.priority === 'High' ? 'text-red-500' : ''}`}>
                                                    Priority: {complaint.priority}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Attachments */}
                                        {complaint.attachments && complaint.attachments.length > 0 && (
                                            <div className="mt-6 pt-6 border-t border-theme border-dashed">
                                                <h4 className="text-[10px] font-bold tracking-widest uppercase text-theme-muted mb-3">Telemetry Data</h4>
                                                <div className="flex gap-2">
                                                    {complaint.attachments.map((img, idx) => (
                                                        <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg border border-theme hover:border-theme-muted transition-colors">
                                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                                                <ExternalLink size={14} className="text-white" />
                                                            </div>
                                                            <img src={getImageUrl(img)} alt="Data" className="w-16 h-16 object-cover" />
                                                        </a>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Side: Timeline UI */}
                                    <div className="w-full md:w-1/3 border-l-2 border-theme border-dashed pl-0 md:pl-8 pt-8 md:pt-0 relative z-10">
                                        <h4 className="text-[10px] font-bold tracking-widest uppercase text-theme-muted mb-6">Execution Log</h4>
                                        
                                        <div className="relative border-l border-theme ml-3 space-y-8">
                                            {STEPS.map((step, idx) => {
                                                const isActive = idx === activeStepIndex;
                                                const isCompleted = idx <= activeStepIndex && !isRejected;
                                                const isRejectedStatus = isRejected && idx === 1; // Show rejected in middle
                                                
                                                if (isRejected && idx > 1) return null; // hide resolved step if rejected
                                                
                                                const stepLabel = isRejectedStatus ? 'Rejected' : step;
                                                const stepColor = isRejectedStatus ? 'bg-red-500 border-red-500' : (isCompleted ? 'bg-theme text-theme border-theme' : 'bg-theme-secondary border-theme text-transparent');

                                                return (
                                                    <div key={idx} className="relative pl-6">
                                                        {/* Timeline Dot */}
                                                        <div className={`absolute top-0 -left-[5px] w-2.5 h-2.5 rounded-full border-2 ${stepColor} transition-colors duration-500 shadow-[0_0_0_4px_var(--background)]`}></div>
                                                        
                                                        {/* Content */}
                                                        <div className={`-mt-1.5 ${isActive || isCompleted ? 'opacity-100' : 'opacity-40'} transition-opacity duration-300`}>
                                                            <h5 className={`text-xs font-bold tracking-wider uppercase ${isRejectedStatus ? 'text-red-500' : 'text-theme'}`}>
                                                                {stepLabel}
                                                            </h5>
                                                            
                                                            {/* Show details for the active or completed step if there's log data */}
                                                            {idx === 0 && (
                                                                <p className="text-[10px] text-theme-secondary mt-1 max-w-[200px] leading-relaxed">
                                                                    Logged at {new Date(complaint.created_at).toLocaleString()}
                                                                </p>
                                                            )}
                                                            {idx === 1 && !isRejected && isActive && (
                                                                <p className="text-[10px] text-theme-secondary mt-1 max-w-[200px] leading-relaxed flex items-center gap-1">
                                                                    <Loader2 size={10} className="animate-spin" /> Assigned to execution team
                                                                </p>
                                                            )}
                                                            {idx === 2 && isResolved && (
                                                                <div className="text-[10px] text-theme-secondary mt-1 max-w-[200px] leading-relaxed">
                                                                    <span className="text-green-600 dark:text-green-400 font-semibold mb-1 block">Task Complete</span>
                                                                    {complaint.resolution_remarks && (
                                                                         <span className="italic block mt-1">"{complaint.resolution_remarks}"</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Resolution Proof for Resolved */}
                                        {isResolved && getResolutionProof(complaint.resolution_proof).length > 0 && (
                                            <div className="mt-8 pt-6 border-t border-theme border-dashed">
                                                <h4 className="text-[10px] font-bold tracking-widest uppercase text-theme-muted mb-3 flex items-center gap-2">
                                                    OUTPUT ARTIFACTS
                                                </h4>
                                                <div className="flex gap-2">
                                                    {getResolutionProof(complaint.resolution_proof).map((img, idx) => (
                                                        <a key={idx} href={getImageUrl(img)} target="_blank" rel="noopener noreferrer" className="group relative block overflow-hidden rounded-lg border border-green-500/30 ring-1 ring-green-500/20 shadow-sm">
                                                            <div className="absolute inset-0 bg-green-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                                                <ExternalLink size={14} className="text-white" />
                                                            </div>
                                                            <img src={getImageUrl(img)} alt="Proof" className="w-16 h-16 object-cover grayscale-[30%]" />
                                                        </a>
                                                    ))}
                                                </div>

                                                {/* Rating Section - Minimalist */}
                                                {!complaint.rating_done && (
                                                    <div className="mt-4 flex items-center gap-2">
                                                        <span className="text-[10px] uppercase tracking-wider font-semibold text-theme-muted">Verify?</span>
                                                        <button
                                                            onClick={async () => {
                                                                try { await complaintsAPI.rateResolution(complaint.id, 'satisfied'); fetchComplaints(); } catch (err) {}
                                                            }}
                                                            className="px-3 py-1 bg-theme-secondary border border-theme rounded text-[10px] font-bold text-theme hover:border-green-500 hover:text-green-600 transition-colors"
                                                        >
                                                            YES
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                try { await complaintsAPI.rateResolution(complaint.id, 'unsatisfied'); fetchComplaints(); } catch (err) {}
                                                            }}
                                                            className="px-3 py-1 bg-theme-secondary border border-theme rounded text-[10px] font-bold text-theme hover:border-red-500 hover:text-red-600 transition-colors"
                                                        >
                                                            ERROR
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
