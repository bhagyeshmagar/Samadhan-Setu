'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import { useLanguage, LANGUAGES } from '@/lib/i18n';

export default function LanguageToggle({ compact = false }) {
    const { lang, setLang } = useLanguage();
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const current = LANGUAGES[lang] || LANGUAGES.en;

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-750 transition shadow-2xs"
                aria-expanded={open}
                aria-label="Select Language"
            >
                <Globe size={13} className="text-saffron" />
                <span className="font-medium">{current.native}</span>
                <ChevronDown size={11} className="text-gray-400" />
            </button>

            {open && (
                <div className="absolute right-0 mt-1.5 w-36 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-50 py-1 overflow-hidden animate-fade-in">
                    {Object.values(LANGUAGES).map((item) => (
                        <button
                            key={item.code}
                            onClick={() => {
                                setLang(item.code);
                                setOpen(false);
                            }}
                            className={`w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition ${
                                lang === item.code
                                    ? 'bg-navy/10 text-navy dark:text-navy-light font-bold'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            <span>{item.native}</span>
                            <span className="text-[10px] uppercase font-mono text-gray-400">{item.code}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
