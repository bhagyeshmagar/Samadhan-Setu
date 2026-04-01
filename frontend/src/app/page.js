'use client';

import Link from 'next/link';
import { ArrowRight, FileText, CheckCircle, Activity, LayoutGrid } from 'lucide-react';

export default function Home() {
    return (
        <div className="flex flex-col gap-24 py-12 px-2 pb-32">
            {/* Hero Section */}
            <section className="relative pt-16 md:pt-32 pb-12 overflow-hidden flex flex-col items-center text-center">
                {/* Subtle Glow Behind Text */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full bg-gradient-radial from-black/5 to-transparent dark:from-white/10 blur-3xl -z-10 pointer-events-none"></div>

                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-theme bg-theme-secondary/80 backdrop-blur-sm text-xs font-semibold tracking-wider uppercase mb-8 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span> System Online
                </div>

                <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight text-theme mb-6 leading-[1.1] max-w-5xl">
                    Civic resolution,<br /> <span className="opacity-40">reimagined.</span>
                </h1>
                
                <p className="text-lg md:text-xl text-theme-muted mb-10 max-w-2xl mx-auto font-light leading-relaxed">
                    An intelligent infrastructure bridging the gap between citizens and administration 
                    for direct, frictionless grievance resolution.
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md">
                    <Link
                        href="/login"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-theme text-theme border border-primary dark:bg-white dark:text-black dark:border-white font-medium rounded-xl hover:scale-105 active:scale-95 transition-all duration-300 shadow-sm"
                    >
                        Initialize Request <ArrowRight size={16} />
                    </Link>
                    <Link
                        href="/citizen/community"
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-theme-tertiary text-theme font-medium rounded-xl hover:bg-theme-secondary border border-transparent hover:border-theme transition-all duration-300"
                    >
                        View Feed
                    </Link>
                </div>
            </section>

            {/* Architecture / How it works */}
            <section className="max-w-6xl mx-auto w-full">
                <div className="mb-12">
                    <h3 className="text-xs font-bold tracking-widest uppercase text-theme-muted mb-2">Systems Output</h3>
                    <h2 className="text-3xl font-bold tracking-tight text-theme">How it operates.</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                    {/* Card 1 */}
                    <div className="glass-panel p-8 group">
                        <div className="w-12 h-12 rounded-full bg-theme-tertiary border border-theme flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <FileText size={20} className="text-theme opacity-80" />
                        </div>
                        <h4 className="text-xl font-bold text-theme mb-3">01. Ingestion</h4>
                        <p className="text-sm text-theme-secondary leading-relaxed font-light">
                            Submit civic anomalies through our frictionless interface. 
                            Zero paperwork, minimal data entry required.
                        </p>
                    </div>

                    {/* Card 2 */}
                    <div className="glass-panel p-8 group">
                        <div className="w-12 h-12 rounded-full bg-theme-tertiary border border-theme flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <Activity size={20} className="text-theme opacity-80" />
                        </div>
                        <h4 className="text-xl font-bold text-theme mb-3">02. AI Processing</h4>
                        <p className="text-sm text-theme-secondary leading-relaxed font-light">
                            Neural models automatically classify, deduplicate, and assign 
                            urgency metrics to your request in milliseconds.
                        </p>
                    </div>

                    {/* Card 3 */}
                    <div className="glass-panel p-8 group">
                        <div className="w-12 h-12 rounded-full bg-theme-tertiary border border-theme flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                            <CheckCircle size={20} className="text-theme opacity-80" />
                        </div>
                        <h4 className="text-xl font-bold text-theme mb-3">03. Resolution</h4>
                        <p className="text-sm text-theme-secondary leading-relaxed font-light">
                            Direct programmatic routing to the exact municipal official ensures 
                            complete accountability and speed.
                        </p>
                    </div>
                </div>
            </section>

            {/* Feature Metrics - Minimalist */}
            <section className="max-w-6xl mx-auto w-full">
                <div className="card-theme overflow-hidden border border-theme relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <LayoutGrid size={200} />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-theme">
                        <div className="p-8 md:p-12 flex flex-col items-center md:items-start relative z-10">
                            <span className="text-4xl md:text-5xl font-bold text-theme mb-2 tracking-tighter">98<span className="opacity-50">%</span></span>
                            <span className="text-xs font-semibold tracking-wider text-theme-muted uppercase">Routing Accuracy</span>
                        </div>
                        <div className="p-8 md:p-12 flex flex-col items-center md:items-start relative z-10">
                            <span className="text-4xl md:text-5xl font-bold text-theme mb-2 tracking-tighter">{'<'}2<span className="opacity-50">s</span></span>
                            <span className="text-xs font-semibold tracking-wider text-theme-muted uppercase">AI Classification</span>
                        </div>
                        <div className="p-8 md:p-12 flex flex-col items-center md:items-start relative z-10">
                            <span className="text-4xl md:text-5xl font-bold text-theme mb-2 tracking-tighter">0<span className="opacity-50"></span></span>
                            <span className="text-xs font-semibold tracking-wider text-theme-muted uppercase">Data Loss</span>
                        </div>
                        <div className="p-8 md:p-12 flex flex-col items-center md:items-start relative z-10 bg-theme-secondary/50">
                            <span className="text-4xl md:text-5xl font-bold text-theme mb-2 tracking-tighter text-green-500">Live</span>
                            <span className="text-xs font-semibold tracking-wider text-theme-muted uppercase">System Status</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
