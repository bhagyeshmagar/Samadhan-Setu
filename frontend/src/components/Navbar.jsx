'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, ChevronDown, Bell, Mail, MessageCircle, Settings, ExternalLink, CheckCircle2 } from 'lucide-react';
import { useState, useSyncExternalStore, useEffect, useRef } from 'react';
import { notificationsAPI } from '@/lib/api';
import { useGmailAuth } from '@/lib/gmailAuth';
import GmailConfirmModal from './GmailConfirmModal';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';

const emptySubscribe = () => () => {};

/* ── Theme-Aware Civic Bridge Emblem SVG ── */
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
            <rect
                x="0.75"
                y="0.75"
                width="34.5"
                height="34.5"
                rx="7.5"
                style={{ fill: 'var(--emblem-bg)', stroke: 'var(--emblem-border)' }}
                strokeWidth="1.5"
            />
            <path
                d="M6 25C10 16 26 16 30 25"
                style={{ stroke: 'var(--emblem-arch)' }}
                strokeWidth="2.5"
                strokeLinecap="round"
            />
            <path
                d="M5 24H31"
                style={{ stroke: 'var(--emblem-stroke)' }}
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path d="M12 24V28" style={{ stroke: 'var(--emblem-stroke)' }} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M18 24V28" style={{ stroke: 'var(--emblem-stroke)' }} strokeWidth="1.5" strokeLinecap="round" />
            <path d="M24 24V28" style={{ stroke: 'var(--emblem-stroke)' }} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="18" cy="11" r="3" style={{ fill: 'var(--emblem-dot)' }} />
        </svg>
    );
}

/* ── Nav link definitions (translation keys) ── */
const NAV_LINKS = {
    public: [{ href: '/', key: 'home' }],
    citizen: [
        { href: '/citizen/lodge', key: 'lodge_grievance' },
        { href: '/citizen/track', key: 'track_status' },
        { href: '/citizen/community', key: 'community' },
    ],
    nodal_officer: [
        { href: '/nodal-dashboard', key: 'nodal_command' },
        { href: '/department/map', key: 'ward_map' },
    ],
    inspection_officer: [
        { href: '/inspection-dashboard', key: 'my_inspections' },
    ],
    team_lead: [
        { href: '/team-dashboard', key: 'team_work_orders' },
    ],
    officer: [
        { href: '/nodal-dashboard', key: 'nodal_command' },
        { href: '/department/map', key: 'ward_map' },
    ],
    supervisor: [
        { href: '/supervisor', key: 'appellate_desk' },
        { href: '/department/map', key: 'ward_map' },
    ],
    admin: [
        { href: '/admin', key: 'oversight' },
        { href: '/admin/analytics', key: 'analytics' },
        { href: '/admin/officers', key: 'officers' },
        { href: '/admin/departments', key: 'departments' },
        { href: '/admin/map', key: 'districts' },
    ],
    super_admin: [
        { href: '/admin', key: 'oversight' },
        { href: '/admin/analytics', key: 'analytics' },
        { href: '/admin/officers', key: 'officers' },
        { href: '/admin/departments', key: 'departments' },
        { href: '/admin/map', key: 'districts' },
    ],
};

function HeaderShell({ children }) {
    return (
        <header style={{ background: 'var(--bg-header)' }}>
            <div className="tricolor-bar" role="presentation" />
            {children}
        </header>
    );
}

export default function Navbar() {
    const { user, logout } = useAuth();
    const { t, tRole, locale } = useLanguage();
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
                setNotifFeedback({ type: 'success', text: t('whatsapp_sent') });
            } else if (res.fallback_url) {
                setNotifFeedback({
                    type: 'info',
                    text: t('whatsapp_ready'),
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

    const roleBadgeVars = {
        citizen: { bg: 'var(--navy-light)', color: 'var(--text-navy)' },
        nodal_officer: { bg: 'var(--saffron-light)', color: 'var(--text-saffron)' },
        inspection_officer: { bg: 'var(--navy-light)', color: 'var(--text-navy)' },
        team_lead: { bg: 'var(--india-green-light)', color: 'var(--text-green)' },
        officer: { bg: 'var(--saffron-light)', color: 'var(--text-saffron)' },
        supervisor: { bg: 'var(--status-in-progress-bg)', color: 'var(--status-in-progress)' },
        admin: { bg: 'var(--status-appealed-bg)', color: 'var(--status-appealed)' },
        super_admin: { bg: 'var(--status-appealed-bg)', color: 'var(--status-appealed)' },
    };
    const roleTone = user ? (roleBadgeVars[user.role] || roleBadgeVars.citizen) : null;

    if (!mounted) {
        return (
            <HeaderShell>
                <div className="max-w-350 mx-auto px-4 md:px-8 flex items-center justify-between h-14">
                    <BrandLogo t={t} />
                </div>
            </HeaderShell>
        );
    }

    return (
        <HeaderShell>
            <div className="max-w-350 mx-auto px-4 md:px-8">
                <div className="flex items-center justify-between h-14 gap-4">

                    {/* Brand */}
                    <Link href="/" className="shrink-0">
                        <BrandLogo t={t} />
                    </Link>

                    {/* Desktop: Nav links */}
                    <nav
                        className="hidden md:flex items-center gap-1 flex-1 ml-6 overflow-x-auto"
                        aria-label="Main navigation"
                    >
                        {allLinks.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`nav-pill shrink-0 ${isActive(link.href) ? 'active' : ''}`}
                            >
                                {t(link.key)}
                            </Link>
                        ))}
                    </nav>

                    {/* Desktop: User actions */}
                    <div className="hidden md:flex items-center gap-2.5 shrink-0">
                        <LanguageToggle />
                        <ThemeToggle />
                        {user && (
                            <div className="relative" ref={notifRef}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!notifOpen) setNotifLoading(true);
                                        setNotifOpen(!notifOpen);
                                    }}
                                    className="relative p-2 rounded-lg border transition-colors cursor-pointer"
                                    style={{
                                        background: 'var(--bg-card)',
                                        borderColor: 'var(--border-mid)',
                                        color: 'var(--text-secondary)',
                                    }}
                                    aria-label={`${t('notifications')}${unreadCount ? ` (${unreadCount})` : ''}`}
                                >
                                    <Bell size={16} />
                                    {unreadCount > 0 && (
                                        <span
                                            className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1 tabular-nums"
                                            style={{ background: '#DC2626' }}
                                        >
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                    )}
                                </button>

                                {notifOpen && (
                                    <div
                                        className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[480px] flex flex-col rounded-xl shadow-xl border overflow-hidden z-50"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)' }}
                                    >
                                        {/* Header */}
                                        <div
                                            className="px-4 py-2.5 border-b"
                                            style={{ borderColor: 'var(--border)', background: 'var(--bg-section)' }}
                                        >
                                            <div className="flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                                <span>{t('notifications')}</span>
                                                {unreadCount > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleMarkAllRead}
                                                        className="text-xs font-medium hover:underline cursor-pointer"
                                                        style={{ color: 'var(--text-navy)' }}
                                                    >
                                                        {t('mark_all_read')}
                                                    </button>
                                                )}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                                <span>{gmailConnected ? `Gmail: ${googleUser?.email}` : t('gmail_not_connected')}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>{t('whatsapp_ready')}</span>
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
                                                        <span>{t('open_whatsapp')}</span>
                                                        <ExternalLink size={11} />
                                                    </a>
                                                )}
                                            </div>
                                        )}

                                        {/* Body */}
                                        <div className="overflow-y-auto flex-1 divide-y" style={{ borderColor: 'var(--border)' }}>
                                            {notifLoading ? (
                                                <p className="text-xs p-4 text-center" style={{ color: 'var(--text-muted)' }}>{t('loading_notifications')}</p>
                                            ) : notifications.length === 0 ? (
                                                <p className="text-xs p-4 text-center" style={{ color: 'var(--text-muted)' }}>{t('no_notifications')}</p>
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
                                                                {new Date(n.created_at).toLocaleString(locale)}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {n.gmail_status === 'sent' ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-green)' }}>
                                                                        <CheckCircle2 size={11} />
                                                                        {t('gmail_sent')}
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
                                                                        {t('send_gmail')}
                                                                    </button>
                                                                )}

                                                                {n.whatsapp_status === 'sent' ? (
                                                                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: 'var(--text-green)' }}>
                                                                        <CheckCircle2 size={11} />
                                                                        {t('whatsapp_sent')}
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
                                                                        {sendingWaId === n.id ? t('sending') : 'WhatsApp'}
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
                                                <span>{t('preferences_delivery_logs')}</span>
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
                                    type="button"
                                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-(--navy-xlight) transition-colors cursor-pointer"
                                    aria-expanded={userMenuOpen}
                                    aria-haspopup="true"
                                >
                                    {roleTone && (
                                        <span
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap"
                                            style={{ background: roleTone.bg, color: roleTone.color }}
                                        >
                                            {tRole(user.role)}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-(--text-primary) whitespace-nowrap">
                                        <User size={14} className="text-(--text-muted)" />
                                        {user.name?.split(' ')[0]}
                                    </span>
                                    <ChevronDown
                                        size={13}
                                        className={`text-(--text-muted) transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {userMenuOpen && (
                                    <div
                                        className="absolute right-0 top-full mt-1.5 w-56 rounded-xl shadow-lg border overflow-hidden z-50"
                                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-mid)' }}
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
                                            <span>{t('notification_settings')}</span>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors cursor-pointer hover:bg-(--status-critical-bg)"
                                            style={{ color: 'var(--error)' }}
                                        >
                                            <LogOut size={14} />
                                            {t('logout')}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link
                                href="/login"
                                className="btn-primary text-sm px-5 py-2 whitespace-nowrap shrink-0"
                            >
                                {t('login')}
                            </Link>
                        )}
                    </div>

                    {/* Mobile: Notification Bell & Hamburger */}
                    <div className="flex md:hidden items-center gap-1.5">
                        {user && (
                            <Link
                                href="/notifications"
                                onClick={() => setMobileOpen(false)}
                                className="relative p-2 rounded-lg text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                                aria-label={`${t('notifications')}${unreadCount ? ` (${unreadCount})` : ''}`}
                            >
                                <Bell size={18} />
                                {unreadCount > 0 && (
                                    <span
                                        className="absolute top-1 right-1 min-w-[14px] h-3.5 flex items-center justify-center rounded-full text-[8px] font-bold text-white px-0.5 tabular-nums"
                                        style={{ background: '#DC2626' }}
                                    >
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </Link>
                        )}
                        <button
                            type="button"
                            className="p-2 rounded-lg text-(--text-secondary) hover:bg-(--bg-section) transition-colors"
                            onClick={() => {
                                setMobileOpen(!mobileOpen);
                                setNotifOpen(false);
                            }}
                            aria-label={mobileOpen ? t('close') : 'Menu'}
                            aria-expanded={mobileOpen}
                        >
                            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            {allLinks.length > 1 && (
                <div
                    className="hidden md:block border-t"
                    style={{ borderColor: 'var(--border)' }}
                />
            )}

            {/* Mobile Drawer */}
            {mobileOpen && (
                <div
                    className="md:hidden border-t"
                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                >
                    <nav className="max-w-350 mx-auto px-4 py-3 flex flex-col gap-0.5" aria-label="Mobile navigation">
                        {allLinks.map(link => {
                            const active = isActive(link.href);
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors"
                                    style={
                                        active
                                            ? { background: 'var(--navy)', color: 'var(--primary-ink)' }
                                            : { color: 'var(--text-secondary)' }
                                    }
                                    onClick={() => setMobileOpen(false)}
                                >
                                    <span>{t(link.key)}</span>
                                </Link>
                            );
                        })}

                        <div className="my-2 border-t" style={{ borderColor: 'var(--border)' }} />
                        <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="text-xs font-medium text-(--text-muted)">{t('language_label')}</span>
                            <LanguageToggle />
                        </div>
                        <div className="px-3 py-1 flex items-center justify-between">
                            <span className="text-xs font-medium text-(--text-muted)">{t('display_theme')}</span>
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
                                    <span>{t('notification_settings_full')}</span>
                                </Link>
                                <div className="px-3 py-2">
                                    <p className="text-xs font-semibold text-(--text-primary)">{user.name}</p>
                                    <p className="text-[10px] text-(--text-muted)">{user.email}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { handleLogout(); setMobileOpen(false); }}
                                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-(--status-critical-bg)"
                                    style={{ color: 'var(--error)' }}
                                >
                                    <LogOut size={14} />
                                    {t('logout')}
                                </button>
                            </>
                        ) : (
                            <Link
                                href="/login"
                                className="btn-primary text-sm text-center justify-center mx-1 mt-1"
                                onClick={() => setMobileOpen(false)}
                            >
                                {t('login')}
                            </Link>
                        )}
                    </nav>
                </div>
            )}

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

/* ── Theme-Aware & Translated Brand Logo Component ── */
function BrandLogo({ t }) {
    return (
        <div className="flex items-center gap-2.5 cursor-pointer group">
            <div className="shrink-0 transition-transform group-hover:scale-105 duration-200">
                <CivicBridgeEmblem size={36} />
            </div>
            <div className="flex flex-col leading-none">
                <span
                    className="text-base font-bold tracking-tight whitespace-nowrap"
                    style={{ color: 'var(--brand-title)' }}
                >
                    {t('app_name')}
                </span>
                <span
                    className="text-[10px] font-medium mt-0.5 whitespace-nowrap"
                    style={{ color: 'var(--brand-sub)' }}
                >
                    {t('tagline')}
                </span>
            </div>
            <div
                className="hidden lg:flex flex-col justify-center pl-2.5 ml-0.5 border-l h-8"
                style={{ borderColor: 'var(--border-mid)' }}
            >
                <span
                    className="text-[10px] font-semibold tracking-wider leading-tight whitespace-nowrap"
                    style={{ color: 'var(--brand-kicker)' }}
                >
                    {t('brand_kicker_top')}
                </span>
                <span
                    className="text-[10px] font-semibold tracking-wider leading-tight whitespace-nowrap"
                    style={{ color: 'var(--brand-sub)' }}
                >
                    {t('brand_kicker_bottom')}
                </span>
            </div>
        </div>
    );
}
