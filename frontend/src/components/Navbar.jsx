'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, ChevronDown } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

/* ── Ashoka Pillar SVG (simplified line-art) ── */
function AshokaPillar({ size = 36 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Ashoka Pillar emblem"
        >
            {/* Capital */}
            <rect x="8" y="6" width="20" height="3" rx="1.5" fill="#003580" />
            {/* Abacus ring */}
            <rect x="10" y="9" width="16" height="2" rx="1" fill="#FF9933" />
            {/* Shaft */}
            <rect x="15" y="11" width="6" height="16" rx="1" fill="#003580" />
            {/* Base */}
            <rect x="9" y="27" width="18" height="2.5" rx="1.25" fill="#003580" />
            {/* Chakra dots on abacus */}
            <circle cx="13" cy="10" r="0.9" fill="white" />
            <circle cx="18" cy="10" r="0.9" fill="white" />
            <circle cx="23" cy="10" r="0.9" fill="white" />
        </svg>
    );
}

/* ── Nav link definitions ── */
const NAV_LINKS = {
    public:  [{ href: '/', label: 'Home', labelHi: 'होम' }],
    citizen: [
        { href: '/citizen/lodge',     label: 'Lodge Grievance', labelHi: 'शिकायत दर्ज करें' },
        { href: '/citizen/track',     label: 'Track Status',    labelHi: 'स्थिति ट्रैक करें' },
        { href: '/citizen/community', label: 'Community',       labelHi: 'समुदाय' },
    ],
    officer: [
        { href: '/department', label: 'Dashboard',  labelHi: 'डैशबोर्ड' },
        { href: '/department/map', label: 'Analytics', labelHi: 'विश्लेषण' },
    ],
    admin: [
        { href: '/admin',              label: 'Oversight',    labelHi: 'निगरानी' },
        { href: '/admin/officers',     label: 'Officers',     labelHi: 'अधिकारी' },
        { href: '/admin/departments',  label: 'Departments',  labelHi: 'विभाग' },
        { href: '/admin/map',          label: 'Districts',    labelHi: 'जिले' },
    ],
};

/* ── Skeleton header shown before hydration ── */
function HeaderShell({ children }) {
    return (
        <header style={{ background: 'var(--bg-header)' }}>
            {/* Tricolor stripe */}
            <div className="tricolor-bar" role="presentation" />
            {children}
        </header>
    );
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [prevPathname, setPrevPathname] = useState(pathname);

    // Close menus on route change without triggering cascading renders in effect
    if (pathname !== prevPathname) {
        setPrevPathname(pathname);
        setMobileOpen(false);
        setUserMenuOpen(false);
    }

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const roleLinks = user ? (NAV_LINKS[user.role] || []) : [];
    const allLinks = [...NAV_LINKS.public, ...roleLinks];

    const isActive = (href) => {
        if (href === '/') return pathname === '/';
        return pathname.startsWith(href);
    };

    const roleBadgeStyle = {
        citizen: { bg: '#EEF3FB', color: '#003580', label: 'Citizen' },
        officer: { bg: '#FFF7ED', color: '#C2410C', label: 'Officer' },
        admin:   { bg: '#F5F3FF', color: '#6D28D9', label: 'Admin' },
    };
    const roleBadge = user ? (roleBadgeStyle[user.role] || roleBadgeStyle.citizen) : null;

    if (!mounted) {
        return (
            <HeaderShell>
                <div className="max-w-350 mx-auto px-4 md:px-8 flex items-center justify-between h-14">
                    <BrandLogo />
                </div>
            </HeaderShell>
        );
    }

    return (
        <HeaderShell>
            {/* ── Row 1: Brand + User ── */}
            <div className="max-w-350 mx-auto px-4 md:px-8">
                <div className="flex items-center justify-between h-14 gap-4">

                    {/* Brand */}
                    <Link href="/" className="shrink-0">
                        <BrandLogo />
                    </Link>

                    {/* Desktop: Nav pills (center/right) */}
                    <nav
                        className="hidden md:flex items-center gap-0.5 flex-1 ml-6"
                        aria-label="Main navigation"
                    >
                        {allLinks.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`nav-pill ${isActive(link.href) ? 'active' : ''}`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    {/* Desktop: User actions */}
                    <div className="hidden md:flex items-center gap-3 shrink-0">
                        {user ? (
                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-(--navy-xlight) transition-colors"
                                    aria-expanded={userMenuOpen}
                                    aria-haspopup="true"
                                >
                                    {/* Role badge */}
                                    {roleBadge && (
                                        <span
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                            style={{ background: roleBadge.bg, color: roleBadge.color }}
                                        >
                                            {roleBadge.label}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-(--text-primary)">
                                        <User size={14} className="text-(--text-muted)" />
                                        {user.name?.split(' ')[0]}
                                    </span>
                                    <ChevronDown
                                        size={13}
                                        className={`text-(--text-muted) transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {/* Dropdown */}
                                {userMenuOpen && (
                                    <div
                                        className="absolute right-0 top-full mt-1.5 w-44 rounded-xl shadow-lg border overflow-hidden z-50"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                    >
                                        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                                            <p className="text-xs font-semibold text-(--text-primary) truncate">{user.name}</p>
                                            <p className="text-[10px] text-(--text-muted) truncate">{user.email}</p>
                                        </div>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <LogOut size={14} />
                                            Sign out
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link
                                href="/login"
                                className="btn-primary text-sm px-5 py-2"
                            >
                                Sign In
                            </Link>
                        )}
                    </div>

                    {/* Mobile hamburger */}
                    <button
                        className="md:hidden p-2 rounded-lg text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileOpen}
                    >
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* ── Nav underline (desktop only) ── */}
            {allLinks.length > 1 && (
                <div
                    className="hidden md:block border-t"
                    style={{ borderColor: 'var(--border)' }}
                />
            )}

            {/* ── Mobile Drawer ── */}
            {mobileOpen && (
                <div
                    className="md:hidden border-t"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    <nav className="max-w-350 mx-auto px-4 py-3 flex flex-col gap-0.5" aria-label="Mobile navigation">
                        {allLinks.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                    isActive(link.href)
                                        ? 'bg-(--navy) text-white'
                                        : 'text-(--text-secondary) hover:bg-(--navy-xlight) hover:text-(--navy)'
                                }`}
                                onClick={() => setMobileOpen(false)}
                            >
                                <span>{link.label}</span>
                                {link.labelHi && (
                                    <span
                                        className="text-[11px] opacity-70"
                                        style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}
                                    >
                                        {link.labelHi}
                                    </span>
                                )}
                            </Link>
                        ))}

                        <div className="my-2 border-t" style={{ borderColor: 'var(--border)' }} />

                        {user ? (
                            <>
                                <div className="px-3 py-2">
                                    <p className="text-xs font-semibold text-(--text-primary)">{user.name}</p>
                                    <p className="text-[10px] text-(--text-muted)">{user.email}</p>
                                </div>
                                <button
                                    onClick={() => { handleLogout(); setMobileOpen(false); }}
                                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                >
                                    <LogOut size={14} />
                                    Sign out
                                </button>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="btn-primary text-sm text-center mx-1"
                                onClick={() => setMobileOpen(false)}
                            >
                                Sign In
                            </Link>
                        )}
                    </nav>
                </div>
            )}
        </HeaderShell>
    );
}

/* ── Brand Logo Component ── */
function BrandLogo() {
    return (
        <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="shrink-0 transition-transform group-hover:scale-105 duration-200">
                <AshokaPillar size={36} />
            </div>
            <div className="flex flex-col leading-none">
                <span
                    className="text-base font-bold tracking-tight"
                    style={{ color: 'var(--navy)' }}
                >
                    Samadhan Setu
                </span>
                <span
                    className="text-[11px] font-medium mt-0.5"
                    style={{
                        color: 'var(--text-muted)',
                        fontFamily: "'Noto Sans Devanagari', sans-serif",
                    }}
                >
                    समाधान सेतु
                </span>
            </div>
            {/* Vertical divider + subtitle */}
            <div
                className="hidden sm:flex flex-col justify-center pl-2.5 ml-0.5 border-l h-8"
                style={{ borderColor: 'var(--border-mid)' }}
            >
                <span
                    className="text-[10px] font-semibold uppercase tracking-wider leading-tight"
                    style={{ color: 'var(--saffron-dark)' }}
                >
                    AI Grievance
                </span>
                <span
                    className="text-[10px] font-semibold uppercase tracking-wider leading-tight"
                    style={{ color: 'var(--text-muted)' }}
                >
                    Redressal Portal
                </span>
            </div>
        </div>
    );
}
