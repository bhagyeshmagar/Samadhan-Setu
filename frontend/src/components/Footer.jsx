'use client';

import Link from 'next/link';
import { Phone, Mail, ExternalLink } from 'lucide-react';

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer style={{ background: 'var(--bg-footer)' }} aria-label="Site footer">

            {/* ── Main footer content ── */}
            <div className="max-w-350 mx-auto px-4 md:px-8 py-10">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

                    {/* Brand column */}
                    <div className="md:col-span-1">
                        <div className="flex items-center gap-2.5 mb-4">
                            {/* Minimal Ashoka Pillar in white */}
                            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                <rect x="8"  y="6"  width="20" height="3"   rx="1.5"  fill="white" />
                                <rect x="10" y="9"  width="16" height="2"   rx="1"    fill="#FF9933" />
                                <rect x="15" y="11" width="6"  height="16"  rx="1"    fill="white" />
                                <rect x="9"  y="27" width="18" height="2.5" rx="1.25" fill="white" />
                                <circle cx="13" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                                <circle cx="18" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                                <circle cx="23" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                            </svg>
                            <div>
                                <p className="font-bold text-sm text-white leading-tight">Samadhan Setu</p>
                                <p
                                    className="text-[11px] text-white/60 leading-tight"
                                    style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                                >
                                    समाधान सेतु
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-white/55 leading-relaxed mb-4">
                            An AI-powered initiative for transparent, accountable
                            grievance redressal at the civic level.
                        </p>
                        <p
                            className="text-[11px] text-white/40 leading-relaxed"
                            style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                        >
                            नागरिक शिकायत निवारण मंच
                        </p>

                        {/* Helpline */}
                        <div className="mt-5 space-y-2">
                            <a
                                href="tel:18001234567"
                                className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
                            >
                                <Phone size={12} />
                                Helpline: 1800-123-4567 (Toll Free)
                            </a>
                            <a
                                href="mailto:support@samadhan.gov.in"
                                className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors"
                            >
                                <Mail size={12} />
                                support@samadhan.gov.in
                            </a>
                        </div>
                    </div>

                    {/* Platform links */}
                    <div>
                        <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">Platform</h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '/citizen/lodge',     label: 'Lodge Grievance' },
                                { href: '/citizen/track',     label: 'Track Status' },
                                { href: '/citizen/community', label: 'Community' },
                                { href: '/login',             label: 'Sign In / Register' },
                            ].map(l => (
                                <li key={l.href}>
                                    <Link
                                        href={l.href}
                                        className="text-xs text-white/55 hover:text-white transition-colors"
                                    >
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Information links */}
                    <div>
                        <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">Information</h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '#', label: 'About the Portal' },
                                { href: '#', label: 'RTI Information' },
                                { href: '#', label: 'Accessibility Statement' },
                                { href: '#', label: 'Sitemap' },
                            ].map(l => (
                                <li key={l.label}>
                                    <Link
                                        href={l.href}
                                        className="text-xs text-white/55 hover:text-white transition-colors flex items-center gap-1"
                                    >
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Legal + External */}
                    <div>
                        <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-4">Legal</h3>
                        <ul className="space-y-2.5">
                            {[
                                { href: '#', label: 'Privacy Policy' },
                                { href: '#', label: 'Terms of Service' },
                                { href: '#', label: 'Data Guidelines' },
                                { href: '#', label: 'Security Policy' },
                            ].map(l => (
                                <li key={l.label}>
                                    <Link href={l.href} className="text-xs text-white/55 hover:text-white transition-colors">
                                        {l.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>

                        {/* External Gov Links */}
                        <div className="mt-6">
                            <h3 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-3">External</h3>
                            <ul className="space-y-2">
                                {[
                                    { href: 'https://pgportal.gov.in', label: 'Central Grievance Portal' },
                                    { href: 'https://mygov.in',       label: 'MyGov India' },
                                    { href: 'https://india.gov.in',   label: 'India.gov.in' },
                                ].map(l => (
                                    <li key={l.label}>
                                        <a
                                            href={l.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-white/55 hover:text-white transition-colors flex items-center gap-1"
                                        >
                                            <ExternalLink size={10} />
                                            {l.label}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Bottom bar ── */}
            <div
                className="border-t"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
                <div className="max-w-350 mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <p className="text-[10px] text-white/40 tracking-wide text-center sm:text-left">
                        © {year} Samadhan Setu. All Rights Reserved.
                        {' '}Designed under Digital India Programme guidelines.
                    </p>
                    <p className="text-[10px] text-white/30 tracking-wide text-center sm:text-right">
                        Last Updated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        {' '}| v2.0 (Phase 2)
                    </p>
                </div>
            </div>

            {/* ── Tricolor bottom strip ── */}
            <div className="tricolor-bar" role="presentation" />
        </footer>
    );
}
