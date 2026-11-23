/**
 * Shared validation, EXIF GPS extraction, and geofence helpers for
 * Inspection Officer site photo uploads and Team Lead resolution proof uploads.
 */

export const ALLOWED_PROOF_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const ALLOWED_PROOF_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const MAX_PROOF_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PROOF_FILES = 4;

export const ALLOWED_GPS_SOURCES = ['live_gps', 'exif_gps', 'manual_pin', 'manual_fallback'];

export const GEOFENCE_THRESHOLDS_M = {
    ON_SITE: 150,
    NEARBY: 500,
};

/**
 * Detect genuine raster image format from leading magic bytes.
 * Blocks disguised HTML/SVG/script payloads even if Content-Type is spoofed.
 * @param {Uint8Array | Buffer | ArrayBuffer} input
 * @returns {'image/jpeg' | 'image/png' | 'image/webp' | null}
 */
export function detectImageMagicType(input) {
    if (!input) return null;
    const bytes = input instanceof Uint8Array
        ? input
        : input instanceof ArrayBuffer
        ? new Uint8Array(input)
        : new Uint8Array(input.buffer || input);

    if (bytes.length < 12) return null;

    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return 'image/png';
    }

    // WebP: "RIFF" .... "WEBP"
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

/**
 * Validate and normalize GPS coordinate metadata.
 */
export function validateGpsCoordinates(rawLat, rawLng, rawAccuracy = null, { required = true } = {}) {
    const hasLat = rawLat !== null && rawLat !== undefined && String(rawLat).trim() !== '';
    const hasLng = rawLng !== null && rawLng !== undefined && String(rawLng).trim() !== '';

    if (!hasLat && !hasLng) {
        if (!required) {
            return { valid: true, latitude: null, longitude: null, accuracy: null, error: null };
        }
        return {
            valid: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            error: 'GPS latitude and longitude coordinates are required.',
        };
    }

    if (!hasLat || !hasLng) {
        return {
            valid: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            error: 'Both latitude and longitude must be provided together.',
        };
    }

    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return {
            valid: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            error: 'GPS coordinates must be valid decimal numbers.',
        };
    }

    if (lat < -90 || lat > 90) {
        return {
            valid: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            error: 'Latitude must be between -90 and 90 degrees.',
        };
    }

    if (lng < -180 || lng > 180) {
        return {
            valid: false,
            latitude: null,
            longitude: null,
            accuracy: null,
            error: 'Longitude must be between -180 and 180 degrees.',
        };
    }

    let accuracy = null;
    if (rawAccuracy !== null && rawAccuracy !== undefined && String(rawAccuracy).trim() !== '') {
        const parsedAcc = Number(rawAccuracy);
        if (Number.isFinite(parsedAcc) && parsedAcc >= 0 && parsedAcc <= 100000) {
            accuracy = Math.round(parsedAcc * 10) / 10;
        }
    }

    return {
        valid: true,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        accuracy,
        error: null,
    };
}

/**
 * Normalize GPS source tag against allowlist.
 */
export function normalizeGpsSource(source, fallback = 'manual_fallback') {
    const clean = String(source || '').trim().toLowerCase();
    if (ALLOWED_GPS_SOURCES.includes(clean)) return clean;
    if (clean === 'gps') return 'live_gps';
    return fallback;
}

/**
 * Compute Haversine distance in meters between two WGS84 points.
 */
export function computeSiteDistanceMeters(lat1, lon1, lat2, lon2) {
    if (
        lat1 === null || lat1 === undefined ||
        lon1 === null || lon1 === undefined ||
        lat2 === null || lat2 === undefined ||
        lon2 === null || lon2 === undefined
    ) {
        return null;
    }
    const a1 = Number(lat1);
    const o1 = Number(lon1);
    const a2 = Number(lat2);
    const o2 = Number(lon2);
    if ([a1, o1, a2, o2].some((v) => !Number.isFinite(v))) return null;

    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(a2 - a1);
    const dLon = toRad(o2 - o1);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const h = sinLat * sinLat + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    return Math.round(R * c);
}

/**
 * Evaluate geofence status from computed distance in meters.
 */
export function evaluateGeofence(distanceMeters) {
    if (distanceMeters === null || distanceMeters === undefined || !Number.isFinite(Number(distanceMeters))) {
        return {
            status: 'unverified',
            label: 'Site reference pin unavailable',
            tone: 'muted',
        };
    }
    const dist = Math.max(0, Math.round(Number(distanceMeters)));
    if (dist <= GEOFENCE_THRESHOLDS_M.ON_SITE) {
        return {
            status: 'verified_on_site',
            label: dist === 0 ? 'Exact site pin match (0m)' : `Within site radius (${dist}m from pin)`,
            tone: 'success',
        };
    }
    if (dist <= GEOFENCE_THRESHOLDS_M.NEARBY) {
        return {
            status: 'nearby',
            label: `Nearby site (${dist}m from reported pin)`,
            tone: 'info',
        };
    }
    return {
        status: 'offset_warning',
        label: `Offset warning (${dist >= 1000 ? `${(dist / 1000).toFixed(2)}km` : `${dist}m`} from reported pin)`,
        tone: 'warning',
    };
}

/**
 * Format decimal coordinates cleanly for tabular display.
 */
export function formatCoordinates(lat, lng) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return 'Not recorded';
    const a = Number(lat);
    const o = Number(lng);
    if (!Number.isFinite(a) || !Number.isFinite(o)) return 'Not recorded';
    return `${a.toFixed(5)}, ${o.toFixed(5)}`;
}

/**
 * Human-readable GPS source label.
 */
export function formatGpsSourceLabel(source) {
    const map = {
        live_gps: 'Live Device GPS',
        gps: 'Live Device GPS',
        exif_gps: 'Photo EXIF GPS',
        manual_pin: 'Reported Site Pin',
        manual_fallback: 'Manual Coordinates',
    };
    return map[String(source || '').toLowerCase()] || 'GPS Metadata';
}

/**
 * Format byte size as KB or MB.
 */
export function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return '0 KB';
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * Validate a client-selected image File before upload.
 */
export function validateClientImageFile(file) {
    if (!file) return 'Missing file.';
    const mime = String(file.type || '').toLowerCase();
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mimeOk = ALLOWED_PROOF_MIME_TYPES.includes(mime);
    const extOk = ALLOWED_PROOF_EXTENSIONS.includes(ext);

    if (!mimeOk && !(mime === '' && extOk)) {
        return `"${file.name}" must be a JPG, PNG, or WebP photo.`;
    }
    if (file.size <= 0) {
        return `"${file.name}" is empty.`;
    }
    if (file.size > MAX_PROOF_FILE_BYTES) {
        return `"${file.name}" exceeds the 5 MB file size limit.`;
    }
    return null;
}

/**
 * Lightweight, zero-dependency EXIF GPS extractor for JPEG ArrayBuffers.
 * Reads APP1 (0xFFE1) TIFF header + GPS IFD (tag 0x8825) to extract decimal
 * latitude & longitude when present in camera-captured site photos.
 *
 * @param {ArrayBuffer} buffer
 * @returns {{ latitude: number, longitude: number } | null}
 */
export function parseExifGpsFromJpeg(buffer) {
    try {
        if (!buffer || buffer.byteLength < 24) return null;
        const view = new DataView(buffer);
        // Must start with JPEG SOI (0xFFD8)
        if (view.getUint16(0, false) !== 0xffd8) return null;

        let offset = 2;
        const len = view.byteLength;

        while (offset + 4 < len) {
            const marker = view.getUint16(offset, false);
            offset += 2;

            // Stop at Start of Scan (SOS) or End of Image (EOI)
            if (marker === 0xffda || marker === 0xffd9) break;
            // Standalone markers without length
            if (marker >= 0xffd0 && marker <= 0xffd7) continue;

            const segmentLength = view.getUint16(offset, false);
            if (segmentLength < 2 || offset + segmentLength > len) break;

            // APP1 EXIF marker
            if (marker === 0xffe1 && segmentLength >= 16) {
                const headerOffset = offset + 2;
                // Check "Exif\0\0"
                if (
                    view.getUint32(headerOffset, false) === 0x45786966 &&
                    view.getUint16(headerOffset + 4, false) === 0x0000
                ) {
                    const tiffStart = headerOffset + 6;
                    const byteOrder = view.getUint16(tiffStart, false);
                    const littleEndian = byteOrder === 0x4949;
                    if (!littleEndian && byteOrder !== 0x4d4d) return null;
                    if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return null;

                    const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
                    const ifd0Pos = tiffStart + ifd0Offset;
                    if (ifd0Pos + 2 > len) return null;

                    const entryCount = view.getUint16(ifd0Pos, littleEndian);
                    let gpsIfdRelOffset = null;

                    for (let i = 0; i < entryCount; i++) {
                        const entryPos = ifd0Pos + 2 + i * 12;
                        if (entryPos + 12 > len) break;
                        const tag = view.getUint16(entryPos, littleEndian);
                        if (tag === 0x8825) {
                            gpsIfdRelOffset = view.getUint32(entryPos + 8, littleEndian);
                            break;
                        }
                    }

                    if (gpsIfdRelOffset === null) return null;
                    const gpsPos = tiffStart + gpsIfdRelOffset;
                    if (gpsPos + 2 > len) return null;

                    const gpsEntries = view.getUint16(gpsPos, littleEndian);
                    let latRef = null;
                    let lngRef = null;
                    let latDms = null;
                    let lngDms = null;

                    const readRational3 = (relOffset) => {
                        const pos = tiffStart + relOffset;
                        if (pos + 24 > len) return null;
                        const vals = [];
                        for (let j = 0; j < 3; j++) {
                            const num = view.getUint32(pos + j * 8, littleEndian);
                            const den = view.getUint32(pos + j * 8 + 4, littleEndian);
                            if (den === 0) return null;
                            vals.push(num / den);
                        }
                        return vals;
                    };

                    for (let i = 0; i < gpsEntries; i++) {
                        const entryPos = gpsPos + 2 + i * 12;
                        if (entryPos + 12 > len) break;
                        const tag = view.getUint16(entryPos, littleEndian);
                        if (tag === 0x0001) {
                            latRef = String.fromCharCode(view.getUint8(entryPos + 8));
                        } else if (tag === 0x0002) {
                            latDms = readRational3(view.getUint32(entryPos + 8, littleEndian));
                        } else if (tag === 0x0003) {
                            lngRef = String.fromCharCode(view.getUint8(entryPos + 8));
                        } else if (tag === 0x0004) {
                            lngDms = readRational3(view.getUint32(entryPos + 8, littleEndian));
                        }
                    }

                    if (!latDms || !lngDms) return null;
                    let lat = latDms[0] + latDms[1] / 60 + latDms[2] / 3600;
                    let lng = lngDms[0] + lngDms[1] / 60 + lngDms[2] / 3600;
                    if (latRef === 'S') lat = -lat;
                    if (lngRef === 'W') lng = -lng;

                    const validated = validateGpsCoordinates(lat, lng);
                    if (!validated.valid) return null;
                    return {
                        latitude: validated.latitude,
                        longitude: validated.longitude,
                    };
                }
            }

            offset += segmentLength;
        }
        return null;
    } catch {
        return null;
    }
}
