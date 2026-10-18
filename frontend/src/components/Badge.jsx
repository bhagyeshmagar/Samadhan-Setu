'use client';

export default function Badge({ status, size = 'default' }) {
    // Normalize status - handle both uppercase (from backend) and title case
    const normalizeStatus = (s) => {
        if (!s) return 'Pending';
        const statusStr = String(s).toLowerCase().replace(/_/g, ' ');
        return statusStr.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const displayStatus = normalizeStatus(status);

    const getBadgeVariant = (s) => {
        switch (s) {
            case 'Resolved':
            case 'Closed':
            case 'Completed':
                return 'badge-resolved';
            case 'In Progress':
            case 'Assigned':
            case 'Verified':
                return 'badge-progress';
            case 'Pending':
            case 'Submitted':
                return 'badge-pending';
            case 'Rejected':
            case 'Critical':
            case 'High':
                return 'badge-critical';
            default:
                return 'badge-normal';
        }
    };

    const variantClass = getBadgeVariant(displayStatus);

    const sizeClasses = {
        small: 'text-[9px] py-0.5 px-1.5',
        default: 'text-[10px] py-0.5 px-2',
        large: 'text-xs py-1 px-2.5',
    };

    return (
        <span className={`badge ${variantClass} ${sizeClasses[size] || sizeClasses.default}`}>
            <span className="badge-dot" />
            <span>{displayStatus}</span>
        </span>
    );
}
