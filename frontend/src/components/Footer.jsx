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
                            {/* Civic Bridge Emblem */}
                            <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                <rect width="36" height="36" rx="8" fill="rgba(255,255,255,0.08)" />
                                <path d="M7 25C13 17 23 17 29 25" stroke="#FF9933" strokeWidth="2.5" strokeLinecap="round" />
                                <path d="M9 25L9 20M15 21L15 18M21 21L21 18M27 25L27 20" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                                <circle cx="18" cy="13" r="2" fill="#138808" />
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
                            An open-source, AI-assisted civic grievance redressal prototype designed for
                            transparent workflow tracking and administrative accountability.
                        </p>
                        <p
                            className="text-[11px] text-white/40 leading-relaxed"
                            style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                        >
                            नागरिक शिकायत निवारण अनुसंधान प्रोटोटाइप
                        </p>

                        {/* Project Info */}
                        <div className="mt-5 space-y-2">
                            <span className="flex items-center gap-2 text-xs text-white/60">
                                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                                Demonstration & Prototype Platform
                            </span>
                            <span className="flex items-center gap-2 text-xs text-white/60">
                                <span className="text-[11px]">Academic / Open Source Research Project</span>
                            </span>
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
                        © {year} Samadhan Setu. Prototype & Demonstration System.
                        {' '}Academic & Civic Tech Research Architecture.
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
