'use client';

import { useTheme } from '@/lib/theme';
import { useLanguage } from '@/lib/i18n';
import { Sun, Moon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const { t } = useLanguage();
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    if (!mounted) {
        return <div className="w-8 h-8" aria-hidden="true" />;
    }

    const isDark = theme === 'dark';
    const label = isDark ? t('switch_to_light') : t('switch_to_dark');

    return (
        <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border transition-colors cursor-pointer"
            style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-mid)',
                color: isDark ? 'var(--saffron)' : 'var(--text-secondary)',
            }}
            aria-label={label}
            title={label}
        >
            {isDark ? (
                <Sun size={15} strokeWidth={2.25} />
            ) : (
                <Moon size={15} strokeWidth={2.25} />
            )}
        </button>
    );
}
