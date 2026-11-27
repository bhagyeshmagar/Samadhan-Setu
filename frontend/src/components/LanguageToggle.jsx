'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useLanguage, LANGUAGES } from '@/lib/i18n';

export default function LanguageToggle() {
    const { lang, setLang, t } = useLanguage();
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
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap"
                style={{
                    background: 'var(--bg-card)',
                    borderColor: 'var(--border-mid)',
                    color: 'var(--text-primary)',
                }}
                aria-expanded={open}
                aria-label={t('select_language')}
            >
                <Globe size={13} style={{ color: 'var(--saffron)' }} />
                <span className="font-medium">{current.native}</span>
                <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} />
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-1.5 w-40 rounded-xl shadow-lg border z-50 py-1 overflow-hidden"
                    style={{
                        background: 'var(--bg-card)',
                        borderColor: 'var(--border-mid)',
                    }}
                >
                    {Object.values(LANGUAGES).map((item) => {
                        const active = lang === item.code;
                        return (
                            <button
                                key={item.code}
                                type="button"
                                onClick={() => {
                                    setLang(item.code);
                                    setOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs flex items-center justify-between transition-colors cursor-pointer"
                                style={{
                                    background: active ? 'var(--navy-light)' : 'transparent',
                                    color: active ? 'var(--navy)' : 'var(--text-primary)',
                                    fontWeight: active ? 700 : 500,
                                }}
                            >
                                <span>{item.native}</span>
                                <span className="inline-flex items-center gap-1 text-[10px] uppercase font-mono" style={{ color: active ? 'var(--navy)' : 'var(--text-muted)' }}>
                                    {active && <Check size={11} />}
                                    {item.code}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
