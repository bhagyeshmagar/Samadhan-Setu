'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

const STATUTORY_HOURS = {
    critical: 72,   // 3 days
    high: 120,     // 5 days
    medium: 168,   // 7 days
    low: 504,      // 21 days
};

export default function DeadlineTimer({
    deadline,
    createdAt,
    priority = 'medium',
    status = 'submitted',
    resolvedAt = null,
    compact = false,
    showProgressBar = false,
    className = '',
}) {
    const [now, setNow] = useState(Date.now());

    // 1-second interval ticker
    useEffect(() => {
        const timer = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Resolve target deadline date
    const priorityKey = (priority || 'medium').toLowerCase();
    const statutoryHours = STATUTORY_HOURS[priorityKey] || 168;
    const statutoryDays = Math.round(statutoryHours / 24);

    let targetDate = deadline ? new Date(deadline) : null;
    let startDate = createdAt ? new Date(createdAt) : null;

    if (!targetDate && startDate) {
        targetDate = new Date(startDate.getTime() + statutoryHours * 3600 * 1000);
    }

    // Normalized status
    const statusLower = (status || '').toLowerCase().replace(/\s+/g, '_');
    const isCompleted = ['resolved', 'closed', 'completed'].includes(statusLower);

    if (!targetDate) {
        return (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 ${className}`}>
                <Clock size={12} />
                <span>SLA: {statutoryDays}d target</span>
            </span>
        );
    }

    const targetMs = targetDate.getTime();
    const startMs = startDate ? startDate.getTime() : (targetMs - statutoryHours * 3600 * 1000);

    // If already resolved, show resolution outcome
    if (isCompleted) {
        const resolvedMs = resolvedAt ? new Date(resolvedAt).getTime() : now;
        const wasOnTime = resolvedMs <= targetMs;

        if (compact) {
            return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    wasOnTime 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                } ${className}`}>
                    <CheckCircle2 size={11} className={wasOnTime ? 'text-emerald-600' : 'text-amber-600'} />
                    <span>{wasOnTime ? 'In SLA' : 'Late'}</span>
                </span>
            );
        }

        return (
            <div className={`inline-flex flex-col gap-1 ${className}`}>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    wasOnTime 
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                    <CheckCircle2 size={13} className={wasOnTime ? 'text-emerald-600' : 'text-amber-600'} />
                    <span>{wasOnTime ? `Resolved within ${statutoryDays}d statutory SLA` : 'Resolved (exceeded statutory deadline)'}</span>
                </div>
            </div>
        );
    }

    // Active countdown calculation
    const diffMs = targetMs - now;
    const isOverdue = diffMs < 0;
    const absDiff = Math.abs(diffMs);

    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((absDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((absDiff % (1000 * 60)) / 1000);

    // Formatted countdown string with fixed padding
    const pad = (n) => String(n).padStart(2, '0');
    let timeStr = '';
    if (days > 0) {
        timeStr = `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
    } else if (hours > 0) {
        timeStr = `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
    } else {
        timeStr = `${minutes}m ${pad(seconds)}s`;
    }

    // Urgency brackets
    const hoursLeft = diffMs / (1000 * 3600);
    let theme = {
        badgeBg: 'bg-emerald-50',
        badgeText: 'text-emerald-800',
        badgeBorder: 'border-emerald-300',
        icon: <Clock size={12} className="text-emerald-600 animate-pulse" />,
        label: 'Statutory SLA Target',
        barColor: 'bg-emerald-500',
    };

    if (isOverdue) {
        theme = {
            badgeBg: 'bg-red-50',
            badgeText: 'text-red-800',
            badgeBorder: 'border-red-400',
            icon: <ShieldAlert size={13} className="text-red-600 animate-bounce" />,
            label: 'SLA Breached',
            barColor: 'bg-red-600',
        };
    } else if (hoursLeft <= 24) {
        theme = {
            badgeBg: 'bg-rose-50',
            badgeText: 'text-rose-900',
            badgeBorder: 'border-rose-300',
            icon: <AlertTriangle size={12} className="text-rose-600 animate-pulse" />,
            label: 'Statutory Deadline Urgency',
            barColor: 'bg-rose-500',
        };
    } else if (hoursLeft <= 48) {
        theme = {
            badgeBg: 'bg-amber-50',
            badgeText: 'text-amber-800',
            badgeBorder: 'border-amber-300',
            icon: <AlertTriangle size={12} className="text-amber-600" />,
            label: 'Statutory SLA Target',
            barColor: 'bg-amber-500',
        };
    }

    // Elapsed percentage
    const totalDuration = Math.max(1, targetMs - startMs);
    const elapsed = Math.max(0, now - startMs);
    const percentConsumed = Math.min(100, Math.round((elapsed / totalDuration) * 100));

    if (compact) {
        return (
            <span
                title={`Statutory Deadline: ${statutoryDays} days (${priorityKey} priority). Ends ${targetDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder} ${className}`}
            >
                {theme.icon}
                <span className="font-mono tracking-tight">
                    {isOverdue ? `Overdue by ${days}d ${hours}h` : `${timeStr} left`}
                </span>
            </span>
        );
    }

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}>
                {theme.icon}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                        {theme.label} ({statutoryDays}d):
                    </span>
                    <span className="font-mono font-bold text-xs tracking-tight">
                        {isOverdue ? `Overdue by ${days}d ${hours}h ${minutes}m ${seconds}s` : `${timeStr} remaining`}
                    </span>
                </div>
            </div>

            {showProgressBar && (
                <div className="w-full">
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-medium mb-0.5">
                        <span>Submitted {startDate ? startDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : ''}</span>
                        <span className="font-mono font-semibold">
                            {isOverdue ? '100% time elapsed' : `${percentConsumed}% window consumed`}
                        </span>
                        <span>Deadline: {targetDate.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-1000 ${theme.barColor}`}
                            style={{ width: `${percentConsumed}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
