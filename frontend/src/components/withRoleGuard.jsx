'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { resolveRouteDecision } from '@/lib/roleRouting';

/**
 * Higher-Order Component (`withRoleGuard`) that enforces client-side role
 * detection and conditional dashboard redirection in tandem with Next.js
 * server middleware (`src/proxy.js`).
 *
 * Options:
 *  - allowedRoles?: string[]   Explicit roles permitted to render WrappedComponent
 *  - redirectOnly?: boolean    Always redirect authenticated users to their dashboard (/dashboard, /department)
 *  - loadingLabel?: string     Accessible status label while checking permissions
 */
export default function withRoleGuard(WrappedComponent, options = {}) {
    const {
        allowedRoles = null,
        redirectOnly = false,
        loadingLabel = 'Verifying role permissions…',
    } = options;

    function RoleGuardedComponent(props) {
        const { user, loading } = useAuth();
        const router = useRouter();
        const pathname = usePathname();

        const decision = loading
            ? { action: 'wait' }
            : resolveRouteDecision({
                  pathname,
                  userRole: user?.role || null,
                  explicitAllowedRoles: allowedRoles,
                  redirectOnly,
              });

        useEffect(() => {
            if (loading) return;
            if (decision.action === 'redirect' && decision.destination) {
                router.replace(decision.destination);
            }
        }, [loading, decision.action, decision.destination, router]);

        if (loading || decision.action !== 'allow') {
            const statusText = loading
                ? loadingLabel
                : decision.destination?.startsWith('/login')
                ? 'Redirecting to sign in…'
                : 'Redirecting to your role dashboard…';

            return (
                <div
                    className="w-full max-w-2xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center gap-3"
                    role="status"
                    aria-live="polite"
                    data-testid="role-guard-loading"
                >
                    <div
                        className="w-11 h-11 rounded-lg border flex items-center justify-center"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                    >
                        {loading ? (
                            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--navy)' }} />
                        ) : (
                            <ShieldCheck size={20} style={{ color: 'var(--navy)' }} />
                        )}
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {statusText}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Routing based on your authenticated departmental role.
                    </p>
                </div>
            );
        }

        return <WrappedComponent {...props} />;
    }

    RoleGuardedComponent.displayName = `withRoleGuard(${
        WrappedComponent.displayName || WrappedComponent.name || 'Component'
    })`;

    return RoleGuardedComponent;
}
