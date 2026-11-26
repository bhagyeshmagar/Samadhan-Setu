'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, ChevronDown, Bell, Mail, MessageCircle, Settings, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useState, useSyncExternalStore, useEffect, useRef } from 'react';
import { notificationsAPI } from '@/lib/api';
import { useGmailAuth } from '@/lib/gmailAuth';
import GmailConfirmModal from './GmailConfirmModal';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';

const emptySubscribe = () => () => {};

/* ── Civic Bridge Emblem SVG ── */
function CivicBridgeEmblem({ size = 36 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 36 36"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Civic bridge emblem"
        >
            <rect width="36" height="36" rx="8" fill="#003580" />
            <path
                d="M6 25C10 16 26 16 30 25"
                stroke="#FF9933"
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <path
                d="M5 24H31"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path d="M12 24V28" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M18 24V28" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M24 24V28" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="11" r="3" fill="#138808" />
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
    nodal_officer: [
        { href: '/nodal-dashboard', label: 'Nodal Command', labelHi: 'नोडल डेस्क' },
        { href: '/department/map', label: 'Ward Map', labelHi: 'मानचित्र' },
    ],
    inspection_officer: [
        { href: '/inspection-dashboard', label: 'My Inspections', labelHi: 'निरीक्षण' },
    ],
    team_lead: [
        { href: '/team-dashboard', label: 'Team Work Orders', labelHi: 'कार्य आदेश' },
    ],
    officer: [
        { href: '/nodal-dashboard', label: 'Nodal Command', labelHi: 'डैशबोर्ड' },
        { href: '/department/map', label: 'Ward Map', labelHi: 'मानचित्र' },
    ],
    supervisor: [
        { href: '/supervisor', label: 'Appellate Desk', labelHi: 'अपील' },
        { href: '/department/map', label: 'Ward Map', labelHi: 'विश्लेषण' },
    ],
    admin: [
        { href: '/admin',              label: 'Oversight',    labelHi: 'निगरानी' },
        { href: '/admin/analytics',    label: 'Analytics',    labelHi: 'विश्लेषण' },
        { href: '/admin/officers',     label: 'Officers',     labelHi: 'अधिकारी' },
        { href: '/admin/departments',  label: 'Departments',  labelHi: 'विभाग' },
        { href: '/admin/map',          label: 'Districts',    labelHi: 'जिले' },
    ],
    super_admin: [
        { href: '/admin',              label: 'Oversight',    labelHi: 'निगरानी' },
        { href: '/admin/analytics',    label: 'Analytics',    labelHi: 'विश्लेषण' },
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

    // ── Notification bell state ──────────────────────────────────────────────
    const { isConnected: gmailConnected, googleUser, markTokenExpired } = useGmailAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifOpen, setNotifOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [notifLoading, setNotifLoading] = useState(false);
    const [notifFeedback, setNotifFeedback] = useState(null);
    const [sendingWaId, setSendingWaId] = useState(null);
    const [gmailModalNotif, setGmailModalNotif] = useState(null);
    const notifRef = useRef(null);

    // Poll unread count every 30 s when user is logged in
    useEffect(() => {
        let active = true;
        const checkCount = async () => {
            if (!user) return;
            try {
                const data = await notificationsAPI.getCount();
                if (active) setUnreadCount(data?.unread_count ?? 0);
            } catch { /* silent */ }
        };
        checkCount();
        const interval = setInterval(checkCount, 30_000);
        return () => {
            active = false;
            clearInterval(interval);
        };
    }, [user, pathname]);

    // Load notification items when dropdown opens
    useEffect(() => {
        if (!notifOpen || !user) return;
        let active = true;
        notificationsAPI.getNotifications(1, 10)
            .then(data => {
                if (active) {
                    setNotifications(data?.items ?? []);
                    setNotifLoading(false);
                }
            })
            .catch(() => {
                if (active) setNotifLoading(false);
            });
        return () => { active = false; };
    }, [notifOpen, user]);

    // Close notification dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleMarkAllRead = async () => {
        await notificationsAPI.markAllRead().catch(() => {});
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
    };

    const handleMarkOneRead = async (id) => {
        await notificationsAPI.markRead(id).catch(() => {});
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const handleConfirmBellGmail = async ({ toEmail, accessToken }) => {
        if (!gmailModalNotif) return;
        try {
            const res = await notificationsAPI.dispatchGmail(
                { notification_id: gmailModalNotif.id, to_email: toEmail },
                accessToken
            );
            setNotifications(prev =>
                prev.map(item =>
                    item.id === gmailModalNotif.id
                        ? { ...item, gmail_status: 'sent', recipient_email: toEmail }
                        : item
                )
            );
            setNotifFeedback({ type: 'success', text: res?.detail || `Sent via Gmail to ${toEmail}.` });
        } catch (err) {
            if (String(err?.message || '').toLowerCase().includes('expired')) {
                markTokenExpired();
            }
            throw err;
        }
    };

    const handleBellWhatsApp = async (notif) => {
        setSendingWaId(notif.id);
        setNotifFeedback(null);
        try {
            const res = await notificationsAPI.dispatchWhatsApp({ notification_id: notif.id });
            setNotifications(prev =>
                prev.map(item =>
                    item.id === notif.id
                        ? {
                            ...item,
                            whatsapp_status: res.status,
                            whatsapp_fallback_url: res.fallback_url || item.whatsapp_fallback_url,
                        }
                        : item
                )
            );
            if (res.status === 'sent') {
                setNotifFeedback({ type: 'success', text: 'WhatsApp message sent via Meta Cloud API.' });
            } else if (res.fallback_url) {
                setNotifFeedback({
                    type: 'info',
                    text: 'WhatsApp message link ready — click Open WhatsApp to send.',
                    url: res.fallback_url,
                });
            } else if (res.error) {
                setNotifFeedback({ type: 'error', text: res.error });
            }
        } catch (err) {
            setNotifFeedback({ type: 'error', text: err?.message || 'Unable to prepare WhatsApp alert.' });
        } finally {
            setSendingWaId(null);
        }
    };

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
        citizen:            { bg: '#EEF3FB', color: '#003580', label: 'Citizen' },
        nodal_officer:      { bg: '#FFF7ED', color: '#C2410C', label: 'Nodal Officer' },
        inspection_officer: { bg: '#E0F2FE', color: '#0369A1', label: 'Inspector' },
        team_lead:          { bg: '#ECFDF5', color: '#047857', label: 'Team Lead' },
        officer:            { bg: '#FFF7ED', color: '#C2410C', label: 'Officer' },
        supervisor:         { bg: '#FEF3C7', color: '#B45309', label: 'Supervisor' },
        admin:              { bg: '#F5F3FF', color: '#6D28D9', label: 'Admin' },
        super_admin:        { bg: '#F5F3FF', color: '#6D28D9', label: 'Super Admin' },
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
                        <LanguageToggle />
                        <ThemeToggle />
                        {user && (
                            /* ── Notification Bell ── */
                            <div className="relative" ref={notifRef}>
                                <button
                                    onClick={() => {
                                        if (!notifOpen) setNotifLoading(true);
                                        setNotifOpen(!notifOpen);
                                    }}
                                    className="relative p-1.5 rounded-lg text-(--text-secondary) hover:bg-(--navy-xlight) transition-colors"
                                    aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
                                >
                                    <Bell size={18} />
                                    {unreadCount > 0 && (
                                        <span
                                            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
                                            style={{ background: '#DC2626' }}
                                        >
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                {notifOpen && (
                                    <div
                                        className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[480px] flex flex-col rounded-xl shadow-xl border overflow-hidden z-50"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                    >
                                        {/* Header */}
                                        <div
                                            className="px-4 py-2.5 border-b"
                                            style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
                                        >
                                            <div className="flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                <span>Notifications</span>
                                                {unreadCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleMarkAllRead}
                                                        className="text-xs font-medium hover:underline cursor-pointer"
                                                        style={{ color: 'var(--text-navy)' }}
                                                    >
                                                        Mark all read
                                                    </button>
                                                )}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                <span>{gmailConnected ? `Gmail: ${googleUser?.email}` : 'Gmail: Not connected'}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>WhatsApp: Ready</span>
                                            </div>
                                        </div>

                                        {notifFeedback && (
                                            <div
                                                className="px-3.5 py-2 border-b text-[11px] flex items-center justify-between gap-2"
                                                style={{
                                                    borderColor: 'var(--border)',
                                                    background: notifFeedback.type === 'error'
                                                        ? 'var(--status-critical-bg)'
                                                        : notifFeedback.type === 'success'
                                                            ? 'var(--status-resolved-bg)'
                                                            : 'var(--navy-xlight)',
                                                    color: notifFeedback.type === 'error'
                                                        ? 'var(--error)'
                                                        : notifFeedback.type === 'success'
                                                            ? 'var(--text-green)'
                                                            : 'var(--text-navy)',
                                                }}
                                            >
                                                <span className="truncate">{notifFeedback.text}</span>
                                                {notifFeedback.url && (
                                                    <a
                                                        href={notifFeedback.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 font-semibold underline shrink-0"
                                                    >
                                                        <span>Open WhatsApp</span>
                                                        <ExternalLink size={11} />
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Body */}
                                        <div className="overflow-y-auto flex-1 divide-y" style={{ borderColor: 'var(--border)' }}>
                                            {notifLoading ? (
                                                <p className="text-xs p-4 text-center" style={{ color: 'var(--text-muted)' }}>Loading notifications…</p>
                                            ) : notifications.length === 0 ? (
                                                <p className="text-xs p-4 text-center" style={{ color: 'var(--text-muted)' }}>No notifications yet.</p>
                                            ) : (
                                                notifications.map(n => (
                                                    <div
                                                        key={n.id}
                                                        className="px-4 py-3 transition-colors"
                                                        style={{
                                                            background: !n.is_read ? 'var(--navy-xlight)' : 'transparent',
                                                            borderColor: 'var(--border)',
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => !n.is_read && handleMarkOneRead(n.id)}
                                                            className="w-full text-left cursor-pointer"
                                                        >
                                                            <p
                                                                className="text-xs font-semibold truncate"
                                                                style={{ color: !n.is_read ? 'var(--text-navy)' : 'var(--text-primary)' }}
                                                            >
                                                                {n.title}
                                                            </p>
                                                            <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                                                                {n.body}
                                                            </p>
                                                        </button>

                                                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                                                            <div className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                                                                {new Date(n.created_at).toLocaleString()}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {n.gmail_status === 'sent' ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-green)' }}>
                                                                        <CheckCircle2 size={11} />
                                                                        Gmail sent
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setGmailModalNotif(n);
                                                                            setNotifOpen(false);
                                                                        }}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                                                                        style={{
                                                                            borderColor: 'var(--border-mid)',
                                                                            color: 'var(--text-navy)',
                                                                            background: 'var(--bg-card)',
                                                                        }}
                                                                    >
                                                                        <Mail size={11} />
                                                                        Send Gmail
                                                                    </button>
                                                                )}

                                                                {n.whatsapp_status === 'sent' ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-green)' }}>
                                                                        <CheckCircle2 size={11} />
                                                                        WhatsApp sent
                                                                    </span>
                                                                ) : n.whatsapp_fallback_url && n.whatsapp_status === 'fallback_ready' ? (
                                                                    <a
                                                                        href={n.whatsapp_fallback_url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors whitespace-nowrap"
                                                                        style={{
                                                                            borderColor: 'var(--border-mid)',
                                                                            color: 'var(--text-green)',
                                                                            background: 'var(--bg-card)',
                                                                        }}
                                                                    >
                                                                        <MessageCircle size={11} />
                                                                        WhatsApp
                                                                        <ExternalLink size={9} />
                                                                    </a>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        disabled={sendingWaId === n.id}
                                                                        onClick={() => handleBellWhatsApp(n)}
                                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                                                                        style={{
                                                                            borderColor: 'var(--border-mid)',
                                                                            color: 'var(--text-green)',
                                                                            background: 'var(--bg-card)',
                                                                        }}
                                                                    >
                                                                        <MessageCircle size={11} />
                                                                        {sendingWaId === n.id ? 'Sending…' : 'WhatsApp'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div
                                            className="px-4 py-2.5 border-t flex items-center justify-between"
                                            style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
                                        >
                                            <Link
                                                href="/notifications"
                                                onClick={() => setNotifOpen(false)}
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                                                style={{ color: 'var(--text-navy)' }}
                                            >
                                                <Settings size={13} />
                                                <span>Preferences &amp; Delivery Logs</span>
                                            </Link>
                                            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                                Gmail · WhatsApp
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
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
                                        className="absolute right-0 top-full mt-1.5 w-52 rounded-xl shadow-lg border overflow-hidden z-50"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                                    >
                                        <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                                            <p className="text-xs font-semibold text-(--text-primary) truncate">{user.name}</p>
                                            <p className="text-[10px] text-(--text-muted) truncate">{user.email}</p>
                                        </div>
                                        <Link
                                            href="/notifications"
                                            onClick={() => setUserMenuOpen(false)}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm border-b transition-colors hover:bg-(--bg-section)"
                                            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                                        >
                                            <Settings size={14} style={{ color: 'var(--text-secondary)' }} />
                                            <span>Notification Settings</span>
                                        </Link>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
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

                    {/* Mobile: Notification Bell & Hamburger (M-21 fix) */}
                    <div className="flex md:hidden items-center gap-1.5">
                        {user && (
                            <Link
                                href="/notifications"
                                onClick={() => setMobileOpen(false)}
                                className="relative p-2 rounded-lg text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                                aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span
                                        className="absolute top-1 right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white px-0.5"
                                        style={{ background: '#DC2626' }}
                                    >
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </Link>
                        )}
                        <button
                            className="p-2 rounded-lg text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                            onClick={() => {
                                setMobileOpen(!mobileOpen);
                                setNotifOpen(false);
                            }}
                            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                            aria-expanded={mobileOpen}
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
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
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="text-xs font-medium text-(--text-muted)">Language / भाषा</span>
                            <LanguageToggle />
                        </div>
                        <div className="px-3 py-1 flex items-center justify-between">
                            <span className="text-xs font-medium text-(--text-muted)">Display Theme</span>
                            <ThemeToggle />
                        </div>

                        {user ? (
                            <>
                                <Link
                                    href="/notifications"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-(--bg-section)"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    <Settings size={14} style={{ color: 'var(--text-secondary)' }} />
                                    <span>Notification Settings (Gmail &amp; WhatsApp)</span>
                                </Link>
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

            {/* Explicit confirmation modal for Gmail dispatch triggered from the bell dropdown */}
            <GmailConfirmModal
                isOpen={Boolean(gmailModalNotif)}
                onClose={() => setGmailModalNotif(null)}
                onConfirm={handleConfirmBellGmail}
                mode="single"
                recipientEmail={gmailModalNotif?.recipient_email || googleUser?.email || user?.email || ''}
                subject={gmailModalNotif ? `[Samadhan Setu] ${gmailModalNotif.title}` : ''}
                previewBody={gmailModalNotif?.body || ''}
                allowEditRecipient
            />
        </HeaderShell>
    );
}

/* ── Brand Logo Component ── */
function BrandLogo() {
    return (
        <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="shrink-0 transition-transform group-hover:scale-105 duration-200">
                <CivicBridgeEmblem size={36} />
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
