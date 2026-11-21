'use client';

import { useState, useEffect } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { getImageUrl } from '@/lib/api';

/**
 * AuthImage — Secure Image Loader for Private Grievance Media (H-02 FIX)
 * Fetches media with authenticated session credentials / query tokens,
 * handles blob conversion, prevents broken <img> tags, and cleans up object URLs on unmount.
 */
export default function AuthImage({
    src,
    alt = 'Grievance Proof',
    className = '',
    style = {},
    onClick = null,
}) {
    const [blobUrl, setBlobUrl] = useState('');
    const [loading, setLoading] = useState(() => Boolean(src));
    const [error, setError] = useState(() => !src);

    useEffect(() => {
        if (!src) return;

        const resolvedUrl = getImageUrl(src);
        let isMounted = true;
        let createdUrl = null;

        fetch(resolvedUrl, {
            credentials: 'include',
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.blob();
            })
            .then((blob) => {
                if (isMounted) {
                    createdUrl = URL.createObjectURL(blob);
                    setBlobUrl(createdUrl);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
            if (createdUrl) {
                URL.revokeObjectURL(createdUrl);
            }
        };
    }, [src]);

    if (loading) {
        return (
            <div
                className={`flex items-center justify-center bg-gray-100 rounded-lg animate-pulse min-h-[120px] ${className}`}
                style={style}
            >
                <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
        );
    }

    if (error || !blobUrl) {
        return (
            <div
                className={`flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-300 rounded-lg p-4 min-h-[120px] text-gray-400 ${className}`}
                style={style}
            >
                <ImageOff size={24} className="mb-1 text-gray-400" />
                <span className="text-[10px] uppercase font-semibold tracking-wider">Image Unavailable</span>
            </div>
        );
    }

    return (
        <img
            src={blobUrl}
            alt={alt}
            className={className}
            style={style}
            onClick={onClick}
            loading="lazy"
        />
    );
}
