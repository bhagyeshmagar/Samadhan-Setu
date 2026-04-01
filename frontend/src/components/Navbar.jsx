'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Menu, X, User, LogOut } from 'lucide-react';
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
        <header className="glass-navbar flex items-center justify-between px-6 py-3 transition-all duration-300">
            {/* Logo area */}
            <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-3 cursor-pointer group">
                    <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black font-bold text-sm shadow-sm transition-transform group-hover:scale-105">
                        SS
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-theme tracking-tight leading-none">
                            Samadhan
                        </h1>
                    </div>
                </Link>

                {/* Desktop Nav Links */}
                <nav className="hidden md:flex items-center gap-1 ml-4 border-l border-theme pl-6">
                    <Link href="/" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                        Overview
                    </Link>

                    {user?.role === 'citizen' && (
                        <>
                            <Link href="/citizen/lodge" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Lodge Issue
                            </Link>
                            <Link href="/citizen/track" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Track
                            </Link>
                            <Link href="/citizen/community" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Community
                            </Link>
                        </>
                    )}

                    {user?.role === 'officer' && (
                        <>
                            <Link href="/department" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Dashboard
                            </Link>
                            <Link href="/department/map" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Analytics
                            </Link>
                        </>
                    )}

                    {user?.role === 'admin' && (
                        <>
                            <Link href="/admin" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Oversight
                            </Link>
                            <Link href="/admin/map" className="px-3 py-1.5 text-sm font-medium text-theme-muted hover:text-theme rounded-md hover:bg-theme-tertiary transition-colors">
                                Districts
                            </Link>
                        </>
                    )}
                </nav>
            </div>

            {/* Actions area */}
            <div className="flex items-center gap-3">
                <ThemeToggle />
                
                <div className="hidden md:flex items-center gap-3">
                    {user ? (
                        <div className="flex items-center gap-3 pl-3 border-l border-theme object-contain">
                            <span className="text-xs font-semibold px-2 py-1 rounded bg-theme-tertiary text-theme-secondary flex items-center gap-1">
                                <User size={12} /> {user.name}
                            </span>
                            <button
                                onClick={handleLogout}
                                className="text-theme-muted hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Sign out"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <Link
                            href="/login"
                            className="btn-primary text-xs px-4 py-2 rounded-full cursor-pointer transition select-none"
                        >
                            Sign In
                        </Link>
                    )}
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden p-1.5 rounded-md text-theme-secondary hover:bg-theme-tertiary"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Mobile Nav Dropdown */}
            {mobileMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 p-2 bg-theme-secondary border border-theme shadow-xl rounded-xl md:hidden overflow-hidden flex flex-col gap-1 z-50 animate-in slide-in-from-top-2">
                    <Link href="/" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>
                        Overview
                    </Link>
                    
                    {user?.role === 'citizen' && (
                        <>
                            <Link href="/citizen/lodge" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>Lodge Issue</Link>
                            <Link href="/citizen/track" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>Track Status</Link>
                            <Link href="/citizen/community" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>Community</Link>
                        </>
                    )}
                    
                    {user?.role === 'officer' && (
                        <Link href="/department" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>Department Dashboard</Link>
                    )}
                    
                    {user?.role === 'admin' && (
                        <Link href="/admin" className="px-4 py-3 text-sm font-medium text-theme-secondary hover:text-theme hover:bg-theme-tertiary rounded-lg" onClick={() => setMobileMenuOpen(false)}>Admin Dashboard</Link>
                    )}
                    
                    <div className="my-1 border-t border-theme"></div>
                    
                    {user ? (
                        <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="px-4 py-3 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-lg text-left flex items-center gap-2">
                            <LogOut size={16} /> Sign out {user.name}
                        </button>
                    ) : (
                        <Link href="/login" className="px-4 py-3 text-sm font-medium bg-theme text-theme rounded-lg text-center border border-theme" onClick={() => setMobileMenuOpen(false)}>
                            Sign In
                        </Link>
                    )}
                </div>
            )}
        </header>
    );
}
