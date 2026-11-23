import test from 'node:test';
import assert from 'node:assert/strict';

import {
    detectImageMagicType,
    validateGpsCoordinates,
    normalizeGpsSource,
    computeSiteDistanceMeters,
    evaluateGeofence,
    parseExifGpsFromJpeg,
    validateClientImageFile,
    formatFileSize,
} from './proofUpload.js';

function buildMinimalJpegWithExifGps(latDeg, latMin, latSec, latRef, lngDeg, lngMin, lngSec, lngRef) {
    // Build a valid minimal JPEG with APP1 Exif (big-endian MM) containing GPS IFD
    const buf = new ArrayBuffer(256);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);

    // JPEG SOI
    view.setUint16(0, 0xffd8, false);
    // APP1 marker
    view.setUint16(2, 0xffe1, false);
    // APP1 segment length (placeholder 240 bytes)
    view.setUint16(4, 240, false);
    // "Exif\0\0"
    u8[6] = 0x45; u8[7] = 0x78; u8[8] = 0x69; u8[9] = 0x66; u8[10] = 0x00; u8[11] = 0x00;

    const tiff = 12;
    // Big-endian 'MM'
    view.setUint16(tiff, 0x4d4d, false);
    view.setUint16(tiff + 2, 42, false);
    // IFD0 at offset 8
    view.setUint32(tiff + 4, 8, false);

    // IFD0: 1 entry (GPSInfoIFDPointer = 0x8825)
    const ifd0 = tiff + 8;
    view.setUint16(ifd0, 1, false);
    view.setUint16(ifd0 + 2, 0x8825, false);
    view.setUint16(ifd0 + 4, 4, false); // LONG
    view.setUint32(ifd0 + 6, 1, false);
    const gpsRel = 26; // relative to tiff
    view.setUint32(ifd0 + 10, gpsRel, false);
    view.setUint32(ifd0 + 14, 0, false); // next IFD

    // GPS IFD: 4 entries
    const gps = tiff + gpsRel;
    view.setUint16(gps, 4, false);
    const latDataRel = gpsRel + 2 + 4 * 12 + 4;
    const lngDataRel = latDataRel + 24;

    // Entry 0: GPSLatitudeRef (0x0001)
    let e = gps + 2;
    view.setUint16(e, 0x0001, false);
    view.setUint16(e + 2, 2, false);
    view.setUint32(e + 4, 2, false);
    u8[e + 8] = latRef.charCodeAt(0);

    // Entry 1: GPSLatitude (0x0002)
    e += 12;
    view.setUint16(e, 0x0002, false);
    view.setUint16(e + 2, 5, false); // RATIONAL
    view.setUint32(e + 4, 3, false);
    view.setUint32(e + 8, latDataRel, false);

    // Entry 2: GPSLongitudeRef (0x0003)
    e += 12;
    view.setUint16(e, 0x0003, false);
    view.setUint16(e + 2, 2, false);
    view.setUint32(e + 4, 2, false);
    u8[e + 8] = lngRef.charCodeAt(0);

    // Entry 3: GPSLongitude (0x0004)
    e += 12;
    view.setUint16(e, 0x0004, false);
    view.setUint16(e + 2, 5, false);
    view.setUint32(e + 4, 3, false);
    view.setUint32(e + 8, lngDataRel, false);

    // Write rationals for lat
    let p = tiff + latDataRel;
    view.setUint32(p, latDeg, false); view.setUint32(p + 4, 1, false);
    view.setUint32(p + 8, latMin, false); view.setUint32(p + 12, 1, false);
    view.setUint32(p + 16, Math.round(latSec * 100), false); view.setUint32(p + 20, 100, false);

    // Write rationals for lng
    p = tiff + lngDataRel;
    view.setUint32(p, lngDeg, false); view.setUint32(p + 4, 1, false);
    view.setUint32(p + 8, lngMin, false); view.setUint32(p + 12, 1, false);
    view.setUint32(p + 16, Math.round(lngSec * 100), false); view.setUint32(p + 20, 100, false);

    // EOI
    view.setUint16(246, 0xffd9, false);
    return buf;
}

test('detectImageMagicType recognizes JPEG, PNG, and WebP and rejects SVG/text', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    assert.equal(detectImageMagicType(jpeg), 'image/jpeg');
    assert.equal(detectImageMagicType(png), 'image/png');
    assert.equal(detectImageMagicType(webp), 'image/webp');
    assert.equal(detectImageMagicType(svg), null);
});

test('validateGpsCoordinates enforces valid latitude and longitude ranges', () => {
    const ok = validateGpsCoordinates('19.0196123', '72.8398456', '12.44');
    assert.equal(ok.valid, true);
    assert.equal(ok.latitude, 19.019612);
    assert.equal(ok.longitude, 72.839846);
    assert.equal(ok.accuracy, 12.4);

    assert.equal(validateGpsCoordinates('', '').valid, false);
    assert.equal(validateGpsCoordinates('', '', null, { required: false }).valid, true);
    assert.equal(validateGpsCoordinates(95, 72.8).valid, false);
    assert.equal(validateGpsCoordinates(19.0, 185).valid, false);
    assert.equal(validateGpsCoordinates('abc', '72.8').valid, false);
});

test('normalizeGpsSource allowlists GPS sources', () => {
    assert.equal(normalizeGpsSource('live_gps'), 'live_gps');
    assert.equal(normalizeGpsSource('gps'), 'live_gps');
    assert.equal(normalizeGpsSource('exif_gps'), 'exif_gps');
    assert.equal(normalizeGpsSource('unknown_src'), 'manual_fallback');
});

test('computeSiteDistanceMeters and evaluateGeofence classify site proximity', () => {
    const exact = computeSiteDistanceMeters(19.0196, 72.8398, 19.0196, 72.8398);
    assert.equal(exact, 0);
    assert.equal(evaluateGeofence(exact).status, 'verified_on_site');

    const near = computeSiteDistanceMeters(19.0196, 72.8398, 19.0205, 72.8398);
    assert.ok(near > 80 && near < 120);
    assert.equal(evaluateGeofence(near).status, 'verified_on_site');

    const mid = evaluateGeofence(320);
    assert.equal(mid.status, 'nearby');

    const far = evaluateGeofence(1450);
    assert.equal(far.status, 'offset_warning');
    assert.match(far.label, /1\.45km/);
});

test('parseExifGpsFromJpeg extracts decimal GPS coordinates from JPEG EXIF', () => {
    // 19° 1' 10.56" N, 72° 50' 23.28" E -> ~19.0196, 72.8398
    const buf = buildMinimalJpegWithExifGps(19, 1, 10.56, 'N', 72, 50, 23.28, 'E');
    const coords = parseExifGpsFromJpeg(buf);
    assert.ok(coords);
    assert.ok(Math.abs(coords.latitude - 19.0196) < 0.0001);
    assert.ok(Math.abs(coords.longitude - 72.8398) < 0.0001);
});

test('validateClientImageFile blocks SVGs and oversized files', () => {
    assert.equal(validateClientImageFile({ name: 'site.jpg', type: 'image/jpeg', size: 120000 }), null);
    assert.match(validateClientImageFile({ name: 'bad.svg', type: 'image/svg+xml', size: 1000 }), /JPG, PNG, or WebP/);
    assert.match(validateClientImageFile({ name: 'huge.png', type: 'image/png', size: 6 * 1024 * 1024 }), /5 MB/);
    assert.equal(formatFileSize(1536), '2 KB');
});
