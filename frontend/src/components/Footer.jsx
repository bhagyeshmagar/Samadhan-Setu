'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function Footer() {
    const { t, locale } = useLanguage();
    const year = new Date().getFullYear();

    return (
        <footer
            style={{
                background: 'var(--bg-footer)',
                borderTop: '1px solid var(--footer-border)',
                boxShadow: 'inset 0 24px 48px -24px var(--footer-top-glow)',
            }}
            aria-label="Site footer"
        >
            {/* Main footer content */}
            <div className="max-w-350 mx-auto px-4 md:px-8 py-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

                    {/* Brand column */}
                    <div className="md:col-span-1">
                        <div className="flex items-center gap-2.5 mb-4">
                            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                <rect
                                    x="0.75"
                                    y="0.75"
                                    width="34.5"
                                    height="34.5"
                                    rx="7.5"
                                    style={{ fill: 'rgba(255, 148, 66, 0.14)', stroke: 'rgba(255, 148, 66, 0.45)' }}
                                    strokeWidth="1.25"
                                />
                                <path d="M7 25C13 17 23 17 29 25" stroke="#FF9442" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M9 25L9 20M15 21L15 18M21 21L21 18M27 25L27 20" stroke="#FFD6B0" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="18" cy="13" r="2.2" fill="#34D399" />
                            </svg>
                            <div>
                                <p className="font-bold text-sm leading-tight" style={{ color: 'var(--footer-heading)' }}>
                                    {t('app_name')}
                                </p>
                                <p className="text-[11px] leading-tight mt-0.5" style={{ color: 'var(--footer-muted)' }}>
                                    {t('tagline')}
                                </p>
                            </div>
                        </div>
                        <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--footer-text)' }}>
                            {t('footer_desc')}
                        </p>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--footer-muted)' }}>
                            {t('footer_sub')}
                        </p>

                        <div className="mt-5 space-y-1.5 text-xs" style={{ color: 'var(--footer-text)' }}>
                            <div>{t('footer_demo_badge')}</div>
                            <div className="text-[11px]" style={{ color: 'var(--footer-muted)' }}>
                                {t('footer_academic')}
                            </div>
                        </div>
                    </div>

                    {/* Platform links */}
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--footer-heading)' }}>
                            {t('footer_platform')}
                        </h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '/citizen/lodge', key: 'lodge_grievance' },
                                { href: '/citizen/track', key: 'track_status' },
                                { href: '/citizen/community', key: 'community' },
                                { href: '/notifications', key: 'notification_settings' },
                                { href: '/login', key: 'sign_in_register' },
                            ].map(l => (
                                <li key={l.href}>
                                    <Link
                                        href={l.href}
                                        className="text-xs transition-colors hover:underline"
                                        style={{ color: 'var(--footer-link)' }}
                                    >
                                        {t(l.key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Information links */}
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--footer-heading)' }}>
                            {t('footer_information')}
                        </h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '/', key: 'footer_about' },
                                { href: '/citizen/community', key: 'footer_rti' },
                                { href: '/notifications', key: 'footer_accessibility' },
                                { href: '/', key: 'footer_sitemap' },
                            ].map(l => (
                                <li key={l.key}>
                                    <Link
                                        href={l.href}
                                        className="text-xs transition-colors hover:underline flex items-center gap-1"
                                        style={{ color: 'var(--footer-link)' }}
                                    >
                                        {t(l.key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Legal + External */}
                    <div>
                        <h3 className="text-[11px] font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--footer-heading)' }}>
                            {t('footer_legal')}
                        </h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '#', key: 'footer_privacy' },
                                { href: '#', key: 'footer_terms' },
                                { href: '#', key: 'footer_data_guidelines' },
                                { href: '#', key: 'footer_security' },
                            ].map(l => (
                                <li key={l.key}>
                                    <Link
                                        href={l.href}
                                        className="text-xs transition-colors hover:underline"
                                        style={{ color: 'var(--footer-link)' }}
                                    >
                                        {t(l.key)}
                                    </Link>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-6">
                            <h3 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--footer-heading)' }}>
                                {t('footer_external')}
                            </h3>
                            <ul className="space-y-2">
                                {[
                                    { href: 'https://pgportal.gov.in', key: 'footer_central_portal' },
                                    { href: 'https://mygov.in', key: 'footer_mygov' },
                                    { href: 'https://india.gov.in', key: 'footer_india_gov' },
                                ].map(l => (
                                    <li key={l.key}>
                                        <a
                                            href={l.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs transition-colors hover:underline flex items-center gap-1.5"
                                            style={{ color: 'var(--footer-link)' }}
                                        >
                                            <ExternalLink size={10} />
                                            {t(l.key)}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div className="border-t" style={{ borderColor: 'var(--footer-border)' }}>
                <div className="max-w-350 mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <p className="text-[11px] tracking-wide text-center sm:text-left" style={{ color: 'var(--footer-muted)' }}>
                        {t('footer_copyright', { year })}
                    </p>
                    <p className="text-[11px] tracking-wide text-center sm:text-right tabular-nums" style={{ color: 'var(--footer-muted)' }}>
                        {t('footer_last_updated')}: {new Date().toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                </div>
            </div>

            <div className="tricolor-bar" role="presentation" />
        </footer>
    );
}
