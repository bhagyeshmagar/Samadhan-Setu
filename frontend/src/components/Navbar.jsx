'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Menu, X, Home, Globe, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import ThemeToggle from './ThemeToggle';

export default function Navbar() {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    return (
        <header className="w-full shadow-md z-50">
            {/* Top Strip */}
            <div className="bg-theme-tertiary text-xs py-1 px-4 border-b border-theme flex justify-between items-center text-theme-muted">
                <div className="flex gap-4">
                    <span>Samadhan Setu Portal</span>
                </div>
                <div className="flex gap-4 items-center">
                    {/* <span className="cursor-pointer hover:text-[var(--primary)] hidden sm:inline">Skip to Main Content</span>
                        <span className="text-theme-muted hidden sm:inline">|</span>
                        <button className="hover:text-theme font-bold">A+</button>
                        <button className="hover:text-theme">A</button>
                        <button className="hover:text-theme text-xs">A-</button> */}
                    {/* <span className="text-theme-muted">|</span> */}
                    <ThemeToggle />
                    <span className="text-theme-muted hidden sm:inline">|</span>
                    <button className="flex items-center gap-1 hover:text-[var(--primary)] hidden sm:flex">
                        <Globe size={12} /> English <ChevronDown size={10} />
                    </button>
                </div>
            </div>

            {/* Main Header */}
            <div className="bg-theme-secondary px-4 py-3 md:px-8 flex justify-between items-center border-b border-theme">
                <Link href="/" className="flex items-center gap-4 cursor-pointer">
                    {/* Logo */}
                    <div className="w-10 h-10 bg-gradient-to-b from-blue-600 to-blue-800 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-md">
                        SS
                    </div>

                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-[var(--primary)] tracking-tight">
                            Samadhan Setu
                        </h1>
                        <p className="text-xs md:text-sm text-[var(--accent)] font-semibold tracking-wide">
                            AI-Powered Grievance Platform
                        </p>
                    </div>
                </Link>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-2 text-theme"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Navigation Bar */}
            <nav className="nav-theme px-4 md:px-8 py-0 shadow-lg overflow-x-auto">
                <ul className="hidden md:flex items-center gap-1 min-w-max">
                    <li>
                        <Link href="/" className="px-4 py-3 hover:bg-[var(--nav-text)] hover:text-[var(--nav-bg)] cursor-pointer text-sm font-medium flex items-center gap-2 border-b-4 border-transparent hover:border-[var(--accent)] transition-all">
                            <Home size={16} /> Home
                        </Link>
                    </li>

                    {user?.role === 'citizen' && (
                        <>
                            <li>
                                <Link href="/citizen/lodge" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    Lodge Grievance
                                </Link>
                            </li>
                            <li>
                                <Link href="/citizen/track" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    My Status
                                </Link>
                            </li>
                            <li>
                                <Link href="/citizen/community" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    Community Feed
                                </Link>
                            </li>
                        </>
                    )}

                    {user?.role === 'officer' && (
                        <>
                            <li>
                                <Link href="/department" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    Department Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link href="/department/map" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    Issue Map
                                </Link>
                            </li>
                        </>
                    )}

                    {user?.role === 'admin' && (
                        <>
                            <li>
                                <Link href="/admin" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    Admin Dashboard
                                </Link>
                            </li>
                            <li>
                                <Link href="/admin/map" className="px-4 py-3 hover:bg-[var(--nav-hover)] cursor-pointer text-sm font-medium border-b-4 border-transparent hover:border-[var(--accent)] transition-all block">
                                    District Map
                                </Link>
                            </li>
                        </>
                    )}

                    <div className="flex-grow"></div>

                    {user ? (
                        <li className="px-4 py-3 bg-[var(--background-tertiary)] flex items-center gap-3">
                            <div className="flex flex-col text-right leading-tight">
                                <span className="text-xs text-theme-muted">Welcome,</span>
                                <span className="font-semibold text-sm text-theme">{user.name}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs ml-2 transition shadow-sm font-medium"
                            >
                                Logout
                            </button>
                        </li>
                    ) : (
                        <li>
                            <Link
                                href="/login"
                                className="px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] cursor-pointer font-bold text-sm tracking-wide border-b-4 border-orange-800 block transition"
                            >
                                LOGIN / REGISTER
                            </Link>
                        </li>
                    )}
                </ul>

                {/* Mobile Menu */}
                {mobileMenuOpen && (
                    <ul className="md:hidden flex flex-col py-2">
                        <li>
                            <Link href="/" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>
                                Home
                            </Link>
                        </li>
                        {user?.role === 'citizen' && (
                            <>
                                <li><Link href="/citizen/lodge" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>Lodge Grievance</Link></li>
                                <li><Link href="/citizen/track" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>My Status</Link></li>
                                <li><Link href="/citizen/community" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>Community Feed</Link></li>
                            </>
                        )}
                        {user?.role === 'officer' && (
                            <li><Link href="/department" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link></li>
                        )}
                        {user?.role === 'admin' && (
                            <li><Link href="/admin" className="px-4 py-3 hover:bg-[var(--nav-hover)] block" onClick={() => setMobileMenuOpen(false)}>Admin</Link></li>
                        )}
                        {user ? (
                            <li>
                                <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="px-4 py-3 text-red-300 hover:bg-[var(--nav-hover)] w-full text-left">
                                    Logout ({user.name})
                                </button>
                            </li>
                        ) : (
                            <li><Link href="/login" className="px-4 py-3 bg-[var(--accent)] block" onClick={() => setMobileMenuOpen(false)}>Login / Register</Link></li>
                        )}
                    </ul>
                )}
            </nav>
        </header>
    );
}
