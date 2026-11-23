import crypto from 'node:crypto';

export const SESSION_COOKIE_NAME = 'samadhan_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours

function getSigningSecret() {
    const envSecret = process.env.SESSION_SECRET || process.env.SECRET_KEY;
    if (envSecret && envSecret.trim().length >= 16) {
        return envSecret.trim();
    }
    if (!globalThis.__samadhanSessionSecret) {
        globalThis.__samadhanSessionSecret = crypto.randomBytes(32).toString('hex');
    }
    return globalThis.__samadhanSessionSecret;
}

function toBase64Url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
    return buf
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function fromBase64Url(input) {
    const padded = String(input).replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (padded.length % 4)) % 4;
    return Buffer.from(padded + '='.repeat(padLength), 'base64');
}

/**
 * Creates a compact HMAC-SHA256 signed session token containing minimal
 * identity & role claims for server-side route middleware verification.
 */
export function signSessionToken({ sub, role, email }, ttlSeconds = DEFAULT_TTL_SECONDS) {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
        sub: String(sub || ''),
        role: String(role || '').toLowerCase(),
        email: String(email || '').toLowerCase(),
        iat: nowSec,
        exp: nowSec + ttlSeconds,
    };
    const encodedPayload = toBase64Url(JSON.stringify(payload));
    const sig = crypto
        .createHmac('sha256', getSigningSecret())
        .update(encodedPayload)
        .digest();
    return `${encodedPayload}.${toBase64Url(sig)}`;
}

/**
 * Verifies HMAC-SHA256 signature and expiration of a session cookie value.
 * Returns the parsed payload or null if invalid, tampered, or expired.
 */
export function verifySessionToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encodedPayload, encodedSig] = parts;
    if (!encodedPayload || !encodedSig) return null;

    try {
        const expectedSig = crypto
            .createHmac('sha256', getSigningSecret())
            .update(encodedPayload)
            .digest();
        const providedSig = fromBase64Url(encodedSig);

        if (providedSig.length !== expectedSig.length) return null;
        if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null;

        const parsed = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || !parsed.role || !parsed.sub) {
            return null;
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (typeof parsed.exp !== 'number' || parsed.exp <= nowSec) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function isHttpsRequest(request) {
    try {
        const forwardedProto = request?.headers?.get?.('x-forwarded-proto');
        if (forwardedProto) {
            return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
        }
        const rawUrl = request?.url || '';
        return rawUrl.startsWith('https://');
    } catch {
        return false;
    }
}

export function buildSessionCookieHeader(token, request, maxAge = DEFAULT_TTL_SECONDS) {
    const secure = isHttpsRequest(request);
    const attrs = [
        `${SESSION_COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        `Max-Age=${maxAge}`,
    ];
    if (secure) {
        attrs.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
        attrs.push('SameSite=Lax');
    }
    return attrs.join('; ');
}

export function buildClearSessionCookieHeader(request) {
    const secure = isHttpsRequest(request);
    const attrs = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'Max-Age=0',
    ];
    if (secure) {
        attrs.push('Secure', 'SameSite=None', 'Partitioned');
    } else {
        attrs.push('SameSite=Lax');
    }
    return attrs.join('; ');
}
