'use client';

export default function Badge({ status, size = 'default' }) {
    const STATUS_LABEL_MAP = {
        submitted: 'New Intake',
        inspection_assigned: 'Inspection Assigned',
        inspection_submitted: 'Inspection Review',
        inspection_rework: 'Inspection Rework',
        inspection_verified: 'Inspection Verified',
        team_assigned: 'Team Assigned',
        work_in_progress: 'Work In Progress',
        resolution_submitted: 'Resolution Submitted',
        verification_assigned: 'Site Verification',
        verification_submitted: 'Final Approval',
        redressal_rework: 'Rework Required',
    };

    const normalizeStatus = (s) => {
        if (!s) return 'Pending';
        const rawKey = String(s).toLowerCase().trim();
        if (STATUS_LABEL_MAP[rawKey]) return STATUS_LABEL_MAP[rawKey];
        const statusStr = rawKey.replace(/_/g, ' ');
        return statusStr.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const displayStatus = normalizeStatus(status);

    const getBadgeVariant = (s) => {
        switch (s) {
            case 'Resolved':
            case 'Closed':
            case 'Completed':
            case 'Inspection Verified':
                return 'badge-resolved';
            case 'In Progress':
            case 'Work In Progress':
            case 'Assigned':
            case 'Inspection Assigned':
            case 'Team Assigned':
            case 'Site Verification':
            case 'Resolution Submitted':
            case 'Verified':
                return 'badge-progress';
            case 'Pending':
            case 'Submitted':
            case 'New Intake':
            case 'Inspection Review':
            case 'Final Approval':
            case 'Pending Info':
            case 'Reopened':
                return 'badge-pending';
            case 'Inspection Rework':
            case 'Rework Required':
            case 'Rejected':
            case 'Critical':
            case 'High':
            case 'Appealed':
            case 'Appealed L1':
            case 'Appealed L2':
            case 'Escalated':
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
