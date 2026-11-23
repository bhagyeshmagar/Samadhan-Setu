/**
 * Canonical role-based dashboard routing rules for Samadhan Setu.
 * Shared as a single source of truth between Next.js middleware (proxy.js),
 * the client-side `withRoleGuard` HOC, login redirects, and navigation links.
 */

export const ROLE_DASHBOARD_ROUTES = {
    nodal_officer: '/nodal-dashboard',
    officer: '/nodal-dashboard',
    inspection_officer: '/inspection-dashboard',
    team_lead: '/team-dashboard',
    citizen: '/citizen/track',
    supervisor: '/supervisor',
    admin: '/admin',
    super_admin: '/admin',
};

export const LEGACY_ROUTE_REDIRECTS = {
    '/nodal': '/nodal-dashboard',
    '/inspector': '/inspection-dashboard',
    '/team': '/team-dashboard',
};

/**
 * Route-level authorization policies for guarded dashboards.
 * Keys are normalized canonical pathnames (no trailing slash).
 */
export const PROTECTED_ROUTE_POLICIES = {
    '/nodal-dashboard': ['nodal_officer', 'officer', 'admin', 'super_admin'],
    '/inspection-dashboard': ['inspection_officer'],
    '/team-dashboard': ['team_lead'],
};

/**
 * Unified role-dispatcher paths: always redirect authenticated users
 * to their own role-specific dashboard (or /login when unauthenticated).
 */
export const DISPATCHER_ROUTES = new Set(['/dashboard', '/department']);

export function normalizePathname(pathname) {
    if (!pathname || typeof pathname !== 'string') return '/';
    const clean = pathname.split('?')[0].split('#')[0].trim();
    if (!clean || clean === '/') return '/';
    return clean.replace(/\/+$/, '') || '/';
}

export function normalizeRole(role) {
    if (!role || typeof role !== 'string') return null;
    return role.trim().toLowerCase() || null;
}

export function getDashboardForRole(role) {
    const cleanRole = normalizeRole(role);
    if (!cleanRole) return '/login';
    return ROLE_DASHBOARD_ROUTES[cleanRole] || '/';
}

/**
 * Returns the post-login landing path for a user role, honoring a safe
 * `?next=` redirect only if the role is allowed to access that path.
 */
export function getPostLoginDestination(role, rawNextPath) {
    const cleanRole = normalizeRole(role);
    const defaultDest =
        cleanRole === 'citizen' ? '/citizen/track' : getDashboardForRole(cleanRole);

    const safeNext = sanitizeNextPath(rawNextPath);
    if (!safeNext) return defaultDest;

    const decision = resolveRouteDecision({ pathname: safeNext, userRole: cleanRole });
    if (decision.action === 'allow') {
        return safeNext;
    }
    if (decision.action === 'redirect' && decision.destination && decision.destination !== '/login') {
        return decision.destination;
    }
    return defaultDest;
}

/**
 * Prevents open redirects by allowing only single-leading-slash relative app paths
 * (rejecting external URLs, protocol-relative `//`, control chars, and `/login` loops).
 */
export function sanitizeNextPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const trimmed = rawPath.trim();
    if (!trimmed.startsWith('/')) return null;
    if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
    if (/[\r\n\t]/.test(trimmed)) return null;
    if (/^\/(login|api)(\/|$|\?)/i.test(trimmed)) return null;
    return trimmed;
}

export function isRoleAllowedForPath(pathname, userRole, explicitAllowedRoles = null) {
    const cleanRole = normalizeRole(userRole);
    if (!cleanRole) return false;
    if (Array.isArray(explicitAllowedRoles) && explicitAllowedRoles.length > 0) {
        return explicitAllowedRoles.map(normalizeRole).includes(cleanRole);
    }
    const cleanPath = normalizePathname(pathname);
    const policy = PROTECTED_ROUTE_POLICIES[cleanPath];
    if (!policy) return true;
    return policy.includes(cleanRole);
}

/**
 * Pure route policy resolver consumed by both Next.js middleware (proxy.js)
 * and the client-side `withRoleGuard` Higher-Order Component.
 *
 * Returns either:
 *   { action: 'allow' }
 *   { action: 'redirect', destination: string, reason: string }
 */
export function resolveRouteDecision({
    pathname,
    userRole,
    explicitAllowedRoles = null,
    redirectOnly = false,
}) {
    const cleanPath = normalizePathname(pathname);
    const cleanRole = normalizeRole(userRole);

    // 1. Canonicalize legacy officer dashboard URLs first
    const legacyTarget = LEGACY_ROUTE_REDIRECTS[cleanPath];
    if (legacyTarget) {
        if (!cleanRole) {
            return {
                action: 'redirect',
                destination: `/login?next=${encodeURIComponent(legacyTarget)}`,
                reason: 'unauthenticated_legacy_route',
            };
        }
        const targetAllowed = isRoleAllowedForPath(legacyTarget, cleanRole);
        return {
            action: 'redirect',
            destination: targetAllowed ? legacyTarget : getDashboardForRole(cleanRole),
            reason: targetAllowed ? 'legacy_route_redirect' : 'wrong_role_legacy_redirect',
        };
    }

    // 2. Unified dispatcher routes (/dashboard, /department) or redirect-only wrappers
    if (redirectOnly || DISPATCHER_ROUTES.has(cleanPath)) {
        if (!cleanRole) {
            return {
                action: 'redirect',
                destination: `/login?next=${encodeURIComponent(cleanPath)}`,
                reason: 'unauthenticated_dispatcher',
            };
        }
        const destination = getDashboardForRole(cleanRole);
        if (destination !== cleanPath) {
            return {
                action: 'redirect',
                destination,
                reason: 'role_dashboard_dispatch',
            };
        }
        return { action: 'allow' };
    }

    // 3. Explicit HOC roles or canonical protected officer dashboards
    const policy =
        Array.isArray(explicitAllowedRoles) && explicitAllowedRoles.length > 0
            ? explicitAllowedRoles.map(normalizeRole)
            : PROTECTED_ROUTE_POLICIES[cleanPath] || null;

    if (!policy) {
        return { action: 'allow' };
    }

    if (!cleanRole) {
        return {
            action: 'redirect',
            destination: `/login?next=${encodeURIComponent(cleanPath)}`,
            reason: 'unauthenticated_protected_route',
        };
    }

    if (!policy.includes(cleanRole)) {
        return {
            action: 'redirect',
            destination: getDashboardForRole(cleanRole),
            reason: 'wrong_role_redirect',
        };
    }

    return { action: 'allow' };
}
