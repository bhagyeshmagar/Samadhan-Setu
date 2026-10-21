'use client';

import { createContext, useContext, useState, useEffect, useSyncExternalStore } from 'react';

const emptySubscribe = () => () => {};
const ThemeContext = createContext({ theme: 'light', toggleTheme: () => { } });

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState('light');
    const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    // Load theme from localStorage on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                setTheme(savedTheme);
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                setTheme('dark');
            }
        }, 0);
        return () => clearTimeout(timer);
    }, []);

    // Apply theme class to document
    useEffect(() => {
        if (mounted) {
            const root = document.documentElement;
            if (theme === 'dark') {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
            localStorage.setItem('theme', theme);
        }
    }, [theme, mounted]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'light' ? 'dark' : 'light');
    };

    // Always provide context, even before mount (prevents useTheme error)
    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, mounted }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    return context;
}
