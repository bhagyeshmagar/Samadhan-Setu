'use client';

import { useLanguage } from '@/lib/i18n';

export default function Badge({ status, size = 'default' }) {
    const { tStatus } = useLanguage();

    const rawKey = status ? String(status).toLowerCase().trim().replace(/\s+/g, '_') : 'pending';
    const displayStatus = tStatus(rawKey);

    const getBadgeVariant = (key) => {
        switch (key) {
            case 'resolved':
            case 'closed':
            case 'completed':
            case 'inspection_verified':
                return 'badge-resolved';
            case 'in_progress':
            case 'work_in_progress':
            case 'assigned':
            case 'inspection_assigned':
            case 'team_assigned':
            case 'verification_assigned':
            case 'resolution_submitted':
            case 'verified':
                return 'badge-progress';
            case 'pending':
            case 'submitted':
            case 'inspection_submitted':
            case 'verification_submitted':
            case 'pending_info':
            case 'reopened':
                return 'badge-pending';
            case 'inspection_rework':
            case 'redressal_rework':
            case 'rejected':
            case 'critical':
            case 'high':
            case 'appealed':
            case 'appealed_l1':
            case 'appealed_l2':
            case 'escalated':
                return 'badge-critical';
            default:
                return 'badge-normal';
        }
    };

    const variantClass = getBadgeVariant(rawKey);

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
