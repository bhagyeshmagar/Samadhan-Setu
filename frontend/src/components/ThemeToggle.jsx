'use client';

import { useTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-theme-tertiary hover:bg-theme-secondary border border-theme transition-all duration-200 hover:scale-105"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? (
                <Moon size={18} className="text-theme-secondary" />
            ) : (
                <Sun size={18} className="text-yellow-400" />
            )}
        </button>
    );
}
