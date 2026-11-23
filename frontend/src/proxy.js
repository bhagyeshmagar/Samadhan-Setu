import { NextResponse } from 'next/server';
import { resolveRouteDecision } from '@/lib/roleRouting';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/sessionCookie';

/**
 * Next.js 16 Proxy Middleware (Node.js runtime).
 * Detects the authenticated user's role from the HMAC-SHA256 signed HttpOnly
 * session cookie and conditionally redirects requests for:
 *  - Canonical officer dashboards (/nodal-dashboard, /inspection-dashboard, /team-dashboard)
 *  - Legacy officer URLs (/nodal, /inspector, /team)
 *  - Unified dispatchers (/dashboard, /department)
 */
export function proxy(request) {
    const { pathname } = request.nextUrl;
    const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value || null;
    const session = verifySessionToken(rawCookie);
    const userRole = session?.role || null;

    const decision = resolveRouteDecision({ pathname, userRole });

    if (decision.action === 'redirect' && decision.destination) {
        const targetUrl = new URL(decision.destination, request.url);
        return NextResponse.redirect(targetUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/dashboard',
        '/department',
        '/nodal',
        '/inspector',
        '/team',
        '/nodal-dashboard',
        '/inspection-dashboard',
        '/team-dashboard',
    ],
};
