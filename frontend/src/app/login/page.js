'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLanguage } from '@/lib/i18n';
import { authAPI } from '@/lib/api';
import { getPostLoginDestination } from '@/lib/roleRouting';
import { ShieldCheck, Lock, Mail, User, ArrowRight, CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react';

export default function LoginPage() {
    const [mode, setMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let response;
            if (mode === 'login') {
                response = await authAPI.login(email, password);
            } else {
                response = await authAPI.register({ email, password, name, role: 'citizen' });
            }

            login(response.user, response.access_token);

            const role = response.user.role;
            const params =
                typeof window !== 'undefined'
                    ? new URLSearchParams(window.location.search)
                    : null;
            const nextParam = params?.get('next') || null;
            const destination = getPostLoginDestination(role, nextParam);
            router.push(destination);
        } catch (err) {
            setError(err.message || t('auth_failed'));
        } finally {
            setLoading(false);
        }
    };

    const DEMO_ACCOUNTS = [
        { key: 'citizen', label: t('role_citizen'), sub: 'Rajesh Kumar', email: 'citizen@demo.com' },
        { key: 'nodal', label: t('role_nodal_officer'), sub: 'Roads · Amit', email: 'nodal@roads.gov.in' },
        { key: 'inspector1', label: `${t('role_inspection_officer')} 1`, sub: 'Zone A · Sneha', email: 'inspector1@roads.gov.in' },
        { key: 'inspector2', label: `${t('role_inspection_officer')} 2`, sub: 'Zone B · Rohan', email: 'inspector2@roads.gov.in' },
        { key: 'teamlead1', label: `${t('role_team_lead')} 1`, sub: 'Pothole · Suresh', email: 'teamlead1@roads.gov.in' },
        { key: 'teamlead2', label: `${t('role_team_lead')} 2`, sub: 'Drain · Deepak', email: 'teamlead2@roads.gov.in' },
        { key: 'supervisor', label: t('role_supervisor'), sub: 'Appellate · Vikram', email: 'supervisor@samadhan.gov.in' },
        { key: 'admin', label: t('role_admin'), sub: 'District Collector', email: 'admin@samadhan.gov.in' },
    ];

    const setDemoCredentials = (demoEmail) => {
        setMode('login');
        setError('');
        setEmail(demoEmail);
        setPassword('demo123');
    };

    return (
        <div className="py-10 px-4 min-h-[calc(100vh-140px)] flex flex-col justify-center items-center">
            <div
                className="max-w-4xl w-full rounded-xl shadow-lg border overflow-hidden flex flex-col md:flex-row"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
            >
                {/* Left Brand Panel */}
                <div
                    className="md:w-5/12 p-8 flex flex-col justify-between relative overflow-hidden"
                    style={{
                        background: 'var(--bg-footer)',
                        borderRight: '1px solid var(--footer-border)',
                    }}
                >
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div
                                className="w-12 h-12 rounded-lg p-2 flex items-center justify-center border"
                                style={{
                                    background: 'rgba(255, 148, 66, 0.12)',
                                    borderColor: 'var(--footer-border)',
                                }}
                            >
                                <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                    <path d="M6 25C10 16 26 16 30 25" stroke="#FF9442" strokeWidth="2.5" strokeLinecap="round" />
                                    <path d="M5 24H31" stroke="#FFD6B0" strokeWidth="2" strokeLinecap="round" />
                                    <path d="M12 24V28M18 24V28M24 24V28" stroke="#FFD6B0" strokeWidth="1.5" strokeLinecap="round" />
                                    <circle cx="18" cy="11" r="2.8" fill="#34D399" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: 'var(--footer-muted)' }}>
                                    {t('login_portal_tag')}
                                </div>
                                <h2 className="text-xl font-bold tracking-tight leading-tight" style={{ color: 'var(--footer-heading)' }}>
                                    {t('app_name')}
                                </h2>
                                <div className="text-xs font-medium mt-0.5" style={{ color: 'var(--saffron)' }}>
                                    {t('tagline')}
                                </div>
                            </div>
                        </div>

                        <div className="border-t pt-4 mb-6" style={{ borderColor: 'var(--footer-border)' }}>
                            <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--footer-text)' }}>
                                {t('login_portal_sub')}
                            </p>

                            <ul className="space-y-3 text-xs" style={{ color: 'var(--footer-link)' }}>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--india-green)' }} />
                                    <span>{t('login_feat_1')}</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--india-green)' }} />
                                    <span>{t('login_feat_2')}</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--india-green)' }} />
                                    <span>{t('login_feat_3')}</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="pt-4 border-t text-[11px] space-y-1" style={{ borderColor: 'var(--footer-border)', color: 'var(--footer-muted)' }}>
                        <div className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--footer-text)' }}>
                            <ShieldCheck size={14} style={{ color: 'var(--india-green)' }} />
                            <span>{t('login_demo_title')}</span>
                        </div>
                        <p>{t('login_demo_desc')}</p>
                    </div>
                </div>

                {/* Right Form Panel */}
                <div className="md:w-7/12 p-8 md:p-10 flex flex-col justify-between" style={{ background: 'var(--bg-card)' }}>
                    <div>
                        {/* Mode switcher tabs */}
                        <div className="flex border-b mb-6" style={{ borderColor: 'var(--border)' }}>
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); }}
                                className="pb-3 font-semibold text-sm transition-colors border-b-2 mr-6 cursor-pointer"
                                style={{
                                    borderColor: mode === 'login' ? 'var(--saffron)' : 'transparent',
                                    color: mode === 'login' ? 'var(--navy)' : 'var(--text-muted)',
                                }}
                            >
                                {t('login_tab_signin')}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('register'); setError(''); }}
                                className="pb-3 font-semibold text-sm transition-colors border-b-2 cursor-pointer"
                                style={{
                                    borderColor: mode === 'register' ? 'var(--saffron)' : 'transparent',
                                    color: mode === 'register' ? 'var(--navy)' : 'var(--text-muted)',
                                }}
                            >
                                {t('login_tab_register')}
                            </button>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-xl font-bold" style={{ color: 'var(--navy)' }}>
                                {mode === 'login' ? t('login_heading') : t('register_heading')}
                            </h3>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                                {mode === 'login' ? t('login_sub') : t('register_sub')}
                            </p>
                        </div>

                        {error && (
                            <div className="gov-alert error mb-4 text-xs items-center">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'register' && (
                                <div>
                                    <label className="gov-label flex items-center gap-1.5">
                                        <User size={14} style={{ color: 'var(--text-muted)' }} />
                                        <span>{t('full_name')} <span style={{ color: 'var(--error)' }}>*</span></span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="gov-input w-full text-sm"
                                        placeholder={t('full_name_placeholder')}
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <label className="gov-label flex items-center gap-1.5">
                                    <Mail size={14} style={{ color: 'var(--text-muted)' }} />
                                    <span>{t('email_address')} <span style={{ color: 'var(--error)' }}>*</span></span>
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="gov-input w-full text-sm"
                                    placeholder={t('email_placeholder')}
                                    required
                                />
                            </div>

                            <div>
                                <label className="gov-label flex items-center gap-1.5">
                                    <Lock size={14} style={{ color: 'var(--text-muted)' }} />
                                    <span>{t('password')} <span style={{ color: 'var(--error)' }}>*</span></span>
                                </label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="gov-input w-full text-sm"
                                    placeholder="••••••••"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-gov-primary flex items-center justify-center gap-2 py-2.5 mt-2"
                            >
                                <span>{loading ? t('authenticating') : (mode === 'login' ? t('login') : t('create_profile'))}</span>
                                {!loading && <ArrowRight size={16} />}
                            </button>
                        </form>

                        {/* Quick Demo Credentials Selector */}
                        <div className="mt-6 pt-5 border-t" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between mb-2.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                                    <HelpCircle size={12} /> {t('quick_role_switcher')}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    {t('demo_password')}: <span className="font-mono">demo123</span>
                                </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                {DEMO_ACCOUNTS.map((acc) => {
                                    const selected = email.toLowerCase() === acc.email.toLowerCase();
                                    return (
                                        <button
                                            key={acc.key}
                                            type="button"
                                            onClick={() => setDemoCredentials(acc.email)}
                                            className="px-2 py-1.5 text-left rounded-md border transition-colors cursor-pointer"
                                            style={{
                                                borderColor: selected ? 'var(--navy)' : 'var(--border)',
                                                background: selected ? 'var(--navy-light)' : 'var(--bg-section)',
                                                color: selected ? 'var(--navy)' : 'var(--text-primary)',
                                            }}
                                        >
                                            <div className="text-[11px] font-semibold leading-tight truncate">{acc.label}</div>
                                            <div className="text-[10px] leading-tight truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                                {acc.sub}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: 'var(--border)' }}>
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            {t('login_footer_note')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
