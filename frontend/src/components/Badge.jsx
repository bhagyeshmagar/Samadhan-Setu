export default function Badge({ status, size = 'default' }) {
    // Normalize status - handle both uppercase (from backend) and title case
    const normalizeStatus = (s) => {
        if (!s) return 'Pending';
        const statusStr = String(s).toLowerCase().replace(/_/g, ' ');
        return statusStr.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const displayStatus = normalizeStatus(status);

    const colors = {
        'Pending': 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]',
        'In Progress': 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]',
        'Assigned': 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]',
        'Resolved': 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]',
        'Rejected': 'bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.5)]',
        'Closed': 'bg-zinc-500 shadow-[0_0_8px_rgba(113,113,122,0.5)]',
        'High': 'bg-red-500',
        'Medium': 'bg-amber-500',
        'Low': 'bg-blue-500',
    };

    const dotClass = colors[displayStatus] || colors['Pending'];

    const sizeClasses = {
        small: 'px-2 py-0.5 text-[9px] gap-1.5',
        default: 'px-2.5 py-1 text-[10px] gap-2',
        large: 'px-3 py-1.5 text-xs gap-2',
    };

    const dotSizes = {
        small: 'w-1 h-1',
        default: 'w-1.5 h-1.5',
        large: 'w-2 h-2',
    };

    return (
        <span
            className={`
                inline-flex items-center rounded border border-theme bg-theme-secondary/50 backdrop-blur-sm
                font-bold tracking-widest uppercase text-theme
                ${sizeClasses[size]}
            `}
        >
            <span className={`${dotSizes[size]} rounded-full ${dotClass}`}></span>
            {displayStatus}
        </span>
    );
}
