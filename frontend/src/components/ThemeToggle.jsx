    'use client';

import { useTheme } from '@/lib/theme';
import { Sun, Moon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    if (!mounted) {
        return <div className="w-7 h-7" aria-hidden="true" />;
    }

    return (
        <button
            onClick={toggleTheme}
            className="p-1.5 rounded-full text-theme-muted hover:text-theme hover:bg-theme-tertiary transition-colors"
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
            {theme === 'light' ? (
                <Moon size={16} strokeWidth={2.5} />
            ) : (
                <Sun size={16} strokeWidth={2.5} />
            )}
        </button>
    );
}
