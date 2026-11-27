'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { resolveRouteDecision } from '@/lib/roleRouting';

export default function withRoleGuard(WrappedComponent, options = {}) {
    const {
        allowedRoles = null,
        redirectOnly = false,
        loadingLabel,
    } = options;

    function RoleGuardedComponent(props) {
        const { user, loading } = useAuth();
        const { t } = useLanguage();
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
                ? (loadingLabel || t('verifying_permissions'))
                : decision.destination?.startsWith('/login')
                ? t('redirecting_signin')
                : t('redirecting_dashboard');

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
                        {t('routing_role_note')}
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
