'use client';

import { useState, useEffect, createContext, useContext } from 'react';

/**
 * i18n.js — Trilingual Civic Localization Engine (Track B Upgrade)
 * Supports:
 * - English (en) — Official Admin & Pan-India
 * - Hindi (hi - हिन्दी) — National Official
 * - Marathi (mr - मराठी) — Maharashtra State Municipal Default
 */

export const LANGUAGES = {
    en: { code: 'en', name: 'English', native: 'English' },
    hi: { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
    mr: { code: 'mr', name: 'Marathi', native: 'मराठी' },
};

export const DICTIONARY = {
    en: {
        app_name: 'Samadhan Setu',
        tagline: 'AI Grievance Redressal Platform',
        prototype_badge: 'Civic Grievance Redressal System · Prototype',
        system_online: 'System Online',
        home: 'Home',
        lodge_grievance: 'Lodge Grievance',
        track_status: 'Track Status',
        community: 'Community',
        department: 'Department',
        dashboard: 'Dashboard',
        appeals: 'Appeals Desk',
        analytics: 'Analytics',
        oversight: 'Oversight',
        officers: 'Officers',
        departments: 'Departments',
        districts: 'Districts',
        login: 'Sign In',
        logout: 'Sign Out',
        profile: 'Profile',
        statutory_sla: 'Statutory SLA',
        adjudicate: 'Adjudicate',
        appeal_level_1: 'Level 1 Appeal (Nodal Authority)',
        appeal_level_2: 'Level 2 Appeal (Appellate Authority)',
        status: 'Status',
        priority: 'Priority',
        category: 'Category',
        ward: 'Ward',
        action_taken_report: 'Action Taken Report (ATR)',
        submit_grievance: 'Submit Grievance',
        describe_issue: 'Describe your issue in detail',
        upload_proof: 'Upload Proof / Photo',
        dpdp_compliance: 'DPDP Act 2023 Compliant',
    },
    hi: {
        app_name: 'समाधान सेतु',
        tagline: 'एआई नागरिक शिकायत निवारण मंच',
        prototype_badge: 'नागरिक शिकायत निवारण प्रणाली · प्रोटोटाइप',
        system_online: 'सिस्टम सक्रिय',
        home: 'होम',
        lodge_grievance: 'शिकायत दर्ज करें',
        track_status: 'स्थिति ट्रैक करें',
        community: 'समुदाय',
        department: 'विभाग',
        dashboard: 'डैशबोर्ड',
        appeals: 'अपील डेस्क',
        analytics: 'विश्लेषण',
        oversight: 'निगरानी',
        officers: 'अधिकारी',
        departments: 'विभाग सूची',
        districts: 'जिले',
        login: 'लॉग इन करें',
        logout: 'लॉग आउट',
        profile: 'प्रोफाइल',
        statutory_sla: 'वैधानिक समयसीमा',
        adjudicate: 'अपील निर्णय',
        appeal_level_1: 'स्तर-1 अपील (नोडल प्राधिकारी)',
        appeal_level_2: 'स्तर-2 अपील (अपीलीय प्राधिकारी)',
        status: 'स्थिति',
        priority: 'प्राथमिकता',
        category: 'श्रेणी',
        ward: 'प्रभाग / वार्ड',
        action_taken_report: 'कार्रवाई रिपोर्ट (ATR)',
        submit_grievance: 'शिकायत जमा करें',
        describe_issue: 'अपनी समस्या का विस्तार से वर्णन करें',
        upload_proof: 'साक्ष्य / फोटो अपलोड करें',
        dpdp_compliance: 'डिजिटल डेटा संरक्षण (DPDP) अनुपालन',
    },
    mr: {
        app_name: 'समाधान सेतू',
        tagline: 'एआय-सक्षम नागरिक तक्रार निवारण व्यासपीठ',
        prototype_badge: 'नागरी तक्रार निवारण प्रणाली · प्रोटोटाइप',
        system_online: 'प्रणाली कार्यरत',
        home: 'मुख्यपृष्ठ',
        lodge_grievance: 'तक्रार नोंदवा',
        track_status: 'स्थिती तपासा',
        community: 'नागरिक समुदाय',
        department: 'विभाग',
        dashboard: 'डॅशबोर्ड',
        appeals: 'अपिल कक्ष',
        analytics: 'विश्लेषण',
        oversight: 'प्रशासकीय देखरेख',
        officers: 'अधिकारी वर्ग',
        departments: 'महानगरपालिका विभाग',
        districts: 'जिल्हा कार्यक्षेत्र',
        login: 'प्रवेश करा',
        logout: 'बाहेर पडा',
        profile: 'माझे खाते',
        statutory_sla: 'वैधानिक निवारण मुदत',
        adjudicate: 'अपिल निकाल',
        appeal_level_1: 'स्तर १ अपिल (नोडल अधिकारी)',
        appeal_level_2: 'स्तर २ अपिल (अपीलीय प्राधिकरण)',
        status: 'सद्यस्थिती',
        priority: 'प्राधान्यक्रम',
        category: 'तक्रार प्रकार',
        ward: 'प्रभाग / वॉर्ड',
        action_taken_report: 'कारवाई अहवाल (ATR)',
        submit_grievance: 'तक्रार सादर करा',
        describe_issue: 'आपल्या समस्येचे सविस्तर वर्णन करा',
        upload_proof: 'पुरावा / फोटो जोडा',
        dpdp_compliance: 'माहिती संरक्षण (DPDP) अधिनियम सुसंगत',
    },
};

const LanguageContext = createContext({
    lang: 'en',
    setLang: () => {},
    t: (key) => key,
});

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('samadhan_lang');
            if (stored && LANGUAGES[stored]) return stored;
        }
        return 'en';
    });

    const setLang = (newLang) => {
        if (LANGUAGES[newLang]) {
            setLangState(newLang);
            if (typeof window !== 'undefined') {
                localStorage.setItem('samadhan_lang', newLang);
            }
        }
    };

    const t = (key) => {
        return DICTIONARY[lang]?.[key] || DICTIONARY.en?.[key] || key;
    };

    return (
        <LanguageContext.Provider value={{ lang, setLang, t, languages: LANGUAGES }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    return useContext(LanguageContext);
}
