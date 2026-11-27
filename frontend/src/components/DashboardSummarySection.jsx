'use client';

import Link from 'next/link';
import { ArrowRight, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { getRoleDashboardMeta } from '@/lib/dashboardSummary';
import { useLanguage } from '@/lib/i18n';

const ROLE_SCOPE_KEYS = {
    citizen: 'my_grievances_scope',
    nodal_officer: 'nodal_scope',
    officer: 'nodal_scope',
    inspection_officer: 'inspector_scope',
    team_lead: 'team_scope',
    supervisor: 'supervisor_scope',
    admin: 'admin_scope',
    super_admin: 'admin_scope',
};

export default function DashboardSummarySection({
    user,
    summary,
    loading = false,
    error = '',
    onRetry,
    showRefreshButton = true,
    activeFilter = 'all',
    onSelectFilter,
    showDashboardLink = false,
    heading,
    subtitle,
}) {
    const { t } = useLanguage();
    const roleMeta = getRoleDashboardMeta(user?.role);
    const activeCount = summary?.activeComplaints ?? 0;
    const pendingCount = summary?.pendingReview ?? 0;
    const resolvedCount = summary?.totalResolved ?? 0;
    const totalCount = summary?.totalCount ?? 0;
    const resolutionRate = summary?.resolutionRate ?? 0;

    const isInteractive = typeof onSelectFilter === 'function';
    const scopeText = t(ROLE_SCOPE_KEYS[user?.role] || 'my_grievances_scope');

    const cards = [
        {
            key: 'active',
            label: t('active_complaints'),
            value: activeCount,
            colorClass: 'mc-navy',
            valueColor: 'var(--navy)',
            detail:
                totalCount > 0
                    ? t('active_open_detail', { active: activeCount, total: totalCount })
                    : t('no_active_grievances'),
        },
        {
            key: 'pending_review',
            label: t('pending_review'),
            value: pendingCount,
            colorClass: 'mc-saffron',
            valueColor: 'var(--saffron-dark)',
            detail: scopeText,
        },
        {
            key: 'resolved',
            label: t('total_resolved'),
            value: resolvedCount,
            colorClass: 'mc-green',
            valueColor: 'var(--india-green)',
            detail:
                totalCount > 0
                    ? t('resolution_rate_detail', { rate: resolutionRate })
                    : t('completed_verified_detail'),
        },
    ];

    const handleCardClick = (key) => {
        if (!isInteractive) return;
        onSelectFilter(activeFilter === key ? 'all' : key);
    };

    return (
        <section
            aria-labelledby="dashboard-summary-heading"
            className="space-y-4 w-full min-w-0"
            data-testid="dashboard-summary-section"
        >
            {/* Section Header */}
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2
                        id="dashboard-summary-heading"
                        className="text-lg font-bold tracking-tight"
                        style={{ color: 'var(--navy)' }}
                    >
                        {heading || t('dashboard_summary')}
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {subtitle || (
                            <>
                                {t('signed_in_as')} <strong style={{ color: 'var(--text-primary)' }}>{user?.name || 'User'}</strong>
                                <span aria-hidden="true"> · </span>
                                <span>{scopeText}</span>
                            </>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    {isInteractive && activeFilter !== 'all' && (
                        <button
                            type="button"
                            onClick={() => onSelectFilter('all')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            style={{
                                background: 'var(--bg-card)',
                                borderColor: 'var(--border-mid)',
                                color: 'var(--text-primary)',
                            }}
                        >
                            <RotateCcw size={12} />
                            <span>{t('show_all_count', { count: totalCount })}</span>
                        </button>
                    )}

                    {showRefreshButton && onRetry && !loading && (
                        <button
                            type="button"
                            onClick={onRetry}
                            aria-label={t('refresh')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            style={{
                                background: 'var(--bg-card)',
                                borderColor: 'var(--border-mid)',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <RefreshCw size={12} />
                            <span>{t('refresh')}</span>
                        </button>
                    )}

                    {showDashboardLink && (
                        <Link
                            href={roleMeta.href}
                            className="btn-primary text-xs px-4 py-2 whitespace-nowrap shrink-0"
                        >
                            <span>{t('open_dashboard')}</span>
                            <ArrowRight size={14} />
                        </Link>
                    )}
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="gov-alert error flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <AlertTriangle size={14} />
                        <span>{error}</span>
                    </div>
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="text-xs font-semibold underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                            {t('try_again')}
                        </button>
                    )}
                </div>
            )}

            {/* Loading Skeletons */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-busy="true" aria-label={t('loading')}>
                    {['mc-navy', 'mc-saffron', 'mc-green'].map((tone) => (
                        <div key={tone} className={`metric-card ${tone} animate-pulse`}>
                            <div className="h-9 w-16 rounded" style={{ background: 'var(--bg-section)' }} />
                            <div className="h-3 w-28 rounded mt-2.5" style={{ background: 'var(--bg-section)' }} />
                            <div className="h-3 w-40 rounded mt-2" style={{ background: 'var(--bg-section)' }} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {cards.map((card) => {
                        const isSelected = isInteractive && activeFilter === card.key;
                        const content = (
                            <>
                                <div className="flex items-baseline justify-between gap-2">
                                    <div
                                        className="metric-number tabular-nums"
                                        style={{ color: card.valueColor }}
                                    >
                                        {card.value}
                                    </div>
                                    {isInteractive && (
                                        <span
                                            className="text-[11px] font-medium"
                                            style={{
                                                color: isSelected ? 'var(--navy)' : 'var(--text-muted)',
                                            }}
                                        >
                                            {isSelected ? t('filtered') : t('filter')}
                                        </span>
                                    )}
                                </div>
                                <div className="metric-label">{card.label}</div>
                                <p
                                    className="text-xs mt-1.5 leading-snug"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    {card.detail}
                                </p>
                            </>
                        );

                        if (isInteractive) {
                            return (
                                <button
                                    key={card.key}
                                    type="button"
                                    onClick={() => handleCardClick(card.key)}
                                    aria-pressed={isSelected}
                                    className={`metric-card ${card.colorClass} text-left w-full cursor-pointer transition-all`}
                                    style={
                                        isSelected
                                            ? {
                                                  boxShadow: '0 0 0 2px var(--navy)',
                                                  background: 'var(--bg-card-hover)',
                                              }
                                            : undefined
                                    }
                                >
                                    {content}
                                </button>
                            );
                        }

                        return (
                            <div
                                key={card.key}
                                className={`metric-card ${card.colorClass}`}
                            >
                                {content}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
