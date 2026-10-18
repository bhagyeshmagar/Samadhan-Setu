'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';
import { ShieldCheck, Lock, Mail, User, ArrowRight, CheckCircle2, AlertCircle, HelpCircle, PhoneCall } from 'lucide-react';

export default function LoginPage() {
    const [mode, setMode] = useState('login'); // 'login' or 'register'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const { login } = useAuth();
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

            // Redirect based on role
            if (response.user.role === 'citizen') {
                router.push('/citizen/lodge');
            } else if (response.user.role === 'officer') {
                router.push('/department');
            } else if (response.user.role === 'admin') {
                router.push('/admin');
            }
        } catch (err) {
            setError(err.message || 'Authentication failed. Please verify your credentials.');
        } finally {
            setLoading(false);
        }
    };

    // Quick demo autofill helper for easy review
    const setDemoCredentials = (demoRole) => {
        if (demoRole === 'citizen') {
            setEmail('citizen@demo.gov.in');
            setPassword('citizen123');
        } else if (demoRole === 'officer') {
            setEmail('officer@demo.gov.in');
            setPassword('officer123');
        } else if (demoRole === 'admin') {
            setEmail('admin@demo.gov.in');
            setPassword('admin123');
        }
    };

    return (
        <div className="py-10 px-4 min-h-[calc(100vh-140px)] flex flex-col justify-center items-center">
            {/* National Identity Card Container */}
            <div className="max-w-4xl w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-col md:flex-row">
                
                {/* Left Brand Panel - Navy with Tricolor highlight */}
                <div 
                    className="md:w-5/12 p-8 text-white flex flex-col justify-between relative overflow-hidden"
                    style={{ backgroundColor: '#002060', background: 'linear-gradient(170deg, #002060 0%, #003580 100%)' }}
                >
                    {/* Top Ashoka Emblem & Heading */}
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 rounded-lg bg-white/10 p-2 flex items-center justify-center border border-white/20">
                                <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                                    <rect x="8"  y="6"  width="20" height="3"   rx="1.5"  fill="white" />
                                    <rect x="10" y="9"  width="16" height="2"   rx="1"    fill="#FF9933" />
                                    <rect x="15" y="11" width="6"  height="16"  rx="1"    fill="white" />
                                    <rect x="9"  y="27" width="18" height="2.5" rx="1.25" fill="white" />
                                    <circle cx="13" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                                    <circle cx="18" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                                    <circle cx="23" cy="10" r="0.9" fill="rgba(0,53,128,0.5)" />
                                </svg>
                            </div>
                            <div>
                                <div className="text-xs uppercase tracking-widest text-white/70 font-semibold">Government of India</div>
                                <h2 className="text-xl font-bold tracking-tight text-white leading-tight">Samadhan Setu</h2>
                                <div className="text-xs text-saffron font-medium" style={{ color: '#FF9933', fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                                    समाधान सेतु • नागरिक पोर्टल
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-white/10 pt-4 mb-6">
                            <p className="text-sm text-white/85 leading-relaxed mb-4">
                                Unified Civic Grievance Redressal and AI-Assisted Accountability Platform.
                            </p>

                            <ul className="space-y-3 text-xs text-white/80">
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                                    <span>Single Sign-On access for Citizens, Field Officers & Admins</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                                    <span>Real-time tracking with SLA statutory deadlines</span>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
                                    <span>Encrypted & secure citizen grievance repository</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom Security / Support note */}
                    <div className="pt-4 border-t border-white/10 text-[11px] text-white/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/80 font-medium">
                            <ShieldCheck size={14} className="text-green-400" />
                            <span>CERT-In Compliant & Encrypted</span>
                        </div>
                        <p>Toll Free Citizen Helpline: 1800-123-4567</p>
                    </div>
                </div>

                {/* Right Form Panel */}
                <div className="md:w-7/12 p-8 md:p-10 flex flex-col justify-between bg-white">
                    <div>
                        {/* Mode switcher tabs */}
                        <div className="flex border-b border-gray-200 mb-6">
                            <button
                                type="button"
                                onClick={() => { setMode('login'); setError(''); }}
                                className={`pb-3 font-semibold text-sm transition-colors border-b-2 mr-6 ${
                                    mode === 'login'
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                Sign In / प्रवेश
                            </button>
                            <button
                                type="button"
                                onClick={() => { setMode('register'); setError(''); }}
                                className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
                                    mode === 'register'
                                        ? 'border-accent text-accent'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                New Registration / नया पंजीकरण
                            </button>
                        </div>

                        {/* Title & subtitle */}
                        <div className="mb-6">
                            <h3 className="text-xl font-bold text-gray-900">
                                {mode === 'login' ? 'Citizen & Officer Login' : 'Register Citizen Account'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                {mode === 'login' 
                                    ? 'Enter your registered email address and password to continue.' 
                                    : 'Create an official citizen profile to lodge and track civic grievances.'}
                            </p>
                        </div>

                        {/* Error Alert */}
                        {error && (
                            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                                <AlertCircle size={16} className="s hrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'register' && (
                                <div>
                                    <label className="gov-label flex items-center gap-1.5 mb-1 text-xs font-semibold text-gray-700">
                                        <User size={14} className="text-gray-400" />
                                        <span>Full Name <span className="text-red-500">*</span></span>
                                        <span className="text-[10px] text-gray-400 font-normal" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                                            (पूरा नाम)
                                        </span>
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="gov-input w-full text-sm"
                                        placeholder="e.g. Ramesh Sharma"
                                        required
                                    />
                                </div>
                            )}

                            <div>
                                <label className="gov-label flex items-center gap-1.5 mb-1 text-xs font-semibold text-gray-700">
                                    <Mail size={14} className="text-gray-400" />
                                    <span>Email Address <span className="text-red-500">*</span></span>
                                    <span className="text-[10px] text-gray-400 font-normal" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                                        (ईमेल पता)
                                    </span>
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="gov-input w-full text-sm"
                                    placeholder="name@example.gov.in"
                                    required
                                />
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="gov-label flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                                        <Lock size={14} className="text-gray-400" />
                                        <span>Password <span className="text-red-500">*</span></span>
                                        <span className="text-[10px] text-gray-400 font-normal" style={{ fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
                                            (पासवर्ड)
                                        </span>
                                    </label>
                                </div>
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
                                <span>{loading ? 'Authenticating…' : (mode === 'login' ? 'Sign In / प्रवेश करें' : 'Create Profile / खाता बनाएं')}</span>
                                {!loading && <ArrowRight size={16} />}
                            </button>
                        </form>

                        {/* Quick Demo Credentials Selector */}
                        <div className="mt-6 pt-5 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    <HelpCircle size={12} /> Quick Demo Fill
                                </span>
                                <span className="text-[10px] text-gray-400">Click to autofill</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDemoCredentials('citizen')}
                                    className="px-2.5 py-1.5 text-xs rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium text-center transition-colors"
                                >
                                    Citizen
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDemoCredentials('officer')}
                                    className="px-2.5 py-1.5 text-xs rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 font-medium text-center transition-colors"
                                >
                                    Officer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDemoCredentials('admin')}
                                    className="px-2.5 py-1.5 text-xs rounded border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-800 font-medium text-center transition-colors"
                                >
                                    Admin
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer note */}
                    <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                        <p className="text-[11px] text-gray-500">
                            Protected by NIC / National e-Governance Security Protocols.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
