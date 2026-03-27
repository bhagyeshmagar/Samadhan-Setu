'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { authAPI } from '@/lib/api';
import { CheckCircle } from 'lucide-react';

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
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] bg-theme flex items-center justify-center py-12 px-4">
            <div className="max-w-4xl w-full card-theme-elevated rounded-xl overflow-hidden flex flex-col md:flex-row">
                {/* Left Side - Info */}
                <div
                    className="md:w-1/2 p-8 text-white flex flex-col justify-center"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <h3 className="text-2xl font-bold mb-4">Welcome to Samadhan Setu</h3>
                    <p className="mb-6 opacity-90">Please login to continue using the grievance redressal services.</p>
                    <ul className="space-y-3 text-sm opacity-80">
                        <li className="flex items-center gap-2"><CheckCircle size={16} /> 24/7 Grievance Submission</li>
                        <li className="flex items-center gap-2"><CheckCircle size={16} /> Real-time Status Tracking</li>
                        <li className="flex items-center gap-2"><CheckCircle size={16} /> AI-Powered Classification</li>
                        <li className="flex items-center gap-2"><CheckCircle size={16} /> Direct Department Connect</li>
                    </ul>
                </div>

                {/* Right Side - Forms */}
                <div className="md:w-1/2 p-8 bg-theme-card">
                    <h3 className="text-xl font-bold text-theme mb-6">
                        {mode === 'login' ? 'Login to Your Account' : 'Create New Account'}
                    </h3>

                    {/* Login/Register Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {mode === 'register' && (
                            <div>
                                <label className="block text-sm font-medium text-theme-secondary mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full p-2 input-theme rounded focus:ring-2 focus:ring-[var(--input-focus)] outline-none"
                                    placeholder="Enter your name"
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-theme-secondary mb-1">Email</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full p-2 input-theme rounded focus:ring-2 focus:ring-[var(--input-focus)] outline-none"
                                placeholder="Enter your email"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-theme-secondary mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full p-2 input-theme rounded focus:ring-2 focus:ring-[var(--input-focus)] outline-none"
                                placeholder="Enter your password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-[var(--error)] text-sm bg-[var(--error-bg)] p-2 rounded">{error}</div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed font-bold py-2 rounded transition"
                        >
                            {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Register')}
                        </button>
                    </form>

                    <div className="mt-4 text-center text-sm text-theme-secondary">
                        {mode === 'login' ? (
                            <>
                                Don&apos;t have an account?{' '}
                                <button onClick={() => setMode('register')} className="text-[var(--primary)] font-semibold hover:underline">
                                    Register
                                </button>
                            </>
                        ) : (
                            <>
                                Already have an account?{' '}
                                <button onClick={() => setMode('login')} className="text-[var(--primary)] font-semibold hover:underline">
                                    Login
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
