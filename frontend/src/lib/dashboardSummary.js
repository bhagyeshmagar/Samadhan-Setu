/**
 * Pure dashboard summary calculation & filtering helpers for logged-in users.
 * Decoupled from React components for deterministic unit testing.
 */

const RESOLVED_STATUSES = new Set(['resolved', 'closed']);
const TERMINAL_INACTIVE_STATUSES = new Set(['resolved', 'closed', 'rejected']);

const PENDING_REVIEW_BY_ROLE = {
    citizen: new Set([
        'submitted',
        'verified',
        'inspection_submitted',
        'verification_submitted',
        'pending_info',
        'appealed',
        'appealed_l1',
        'appealed_l2',
    ]),
    nodal_officer: new Set([
        'submitted',
        'verified',
        'assigned',
        'inspection_submitted',
        'verification_submitted',
    ]),
    officer: new Set([
        'submitted',
        'verified',
        'assigned',
        'inspection_submitted',
        'verification_submitted',
    ]),
    inspection_officer: new Set([
        'inspection_assigned',
        'inspection_rework',
        'verification_assigned',
    ]),
    team_lead: new Set([
        'team_assigned',
        'redressal_rework',
    ]),
    supervisor: new Set([
        'appealed',
        'appealed_l1',
        'appealed_l2',
        'escalated',
        'pending_info',
    ]),
    admin: new Set([
        'submitted',
        'inspection_submitted',
        'verification_submitted',
        'appealed',
        'appealed_l1',
        'appealed_l2',
        'escalated',
        'pending_info',
    ]),
    super_admin: new Set([
        'submitted',
        'inspection_submitted',
        'verification_submitted',
        'appealed',
        'appealed_l1',
        'appealed_l2',
        'escalated',
        'pending_info',
    ]),
};

export function normalizeStatus(status) {
    if (!status) return '';
    return String(status).trim().toLowerCase().replace(/\s+/g, '_');
}

export function isComplaintResolved(status) {
    return RESOLVED_STATUSES.has(normalizeStatus(status));
}

export function isComplaintActive(status) {
    const clean = normalizeStatus(status);
    if (!clean) return false;
    return !TERMINAL_INACTIVE_STATUSES.has(clean);
}

export function isComplaintPendingReview(status, role = 'citizen') {
    const clean = normalizeStatus(status);
    if (!clean) return false;
    const roleSet = PENDING_REVIEW_BY_ROLE[role] || PENDING_REVIEW_BY_ROLE.citizen;
    return roleSet.has(clean);
}

export function computeDashboardSummaryFromComplaints(complaints = [], role = 'citizen') {
    const list = Array.isArray(complaints) ? complaints : [];
    let activeComplaints = 0;
    let pendingReview = 0;
    let totalResolved = 0;

    for (const item of list) {
        const status = normalizeStatus(item?.status);
        if (isComplaintResolved(status)) {
            totalResolved += 1;
        }
        if (isComplaintActive(status)) {
            activeComplaints += 1;
        }
        if (isComplaintPendingReview(status, role)) {
            pendingReview += 1;
        }
    }

    const totalCount = list.length;
    const resolutionRate = totalCount > 0 ? Math.round((totalResolved / totalCount) * 100) : 0;

    return {
        activeComplaints,
        pendingReview,
        totalResolved,
        totalCount,
        resolutionRate,
    };
}

export function computeDashboardSummaryFromAdminStats(stats) {
    if (!stats || typeof stats !== 'object') {
        return {
            activeComplaints: 0,
            pendingReview: 0,
            totalResolved: 0,
            totalCount: 0,
            resolutionRate: 0,
        };
    }

    const totalCount = Number(stats.total_complaints ?? stats.total ?? 0) || 0;
    const totalResolved =
        Number(stats.resolved_complaints ?? stats.resolved ?? 0) +
        Number(stats.closed_complaints ?? stats.closed ?? 0);
    const activeComplaints =
        stats.open_complaints !== undefined
            ? Number(stats.open_complaints) || 0
            : Math.max(0, totalCount - totalResolved);

    const byStatus = stats.by_status || stats.status_breakdown || {};
    let pendingReview = 0;
    if (byStatus && typeof byStatus === 'object' && Object.keys(byStatus).length > 0) {
        for (const [key, value] of Object.entries(byStatus)) {
            if (isComplaintPendingReview(key, 'admin')) {
                pendingReview += Number(value) || 0;
            }
        }
    } else {
        pendingReview = Number(stats.pending_complaints ?? stats.pending_review ?? stats.escalated_complaints ?? 0) || 0;
    }

    const resolutionRate =
        stats.resolution_rate !== undefined
            ? Math.round(Number(stats.resolution_rate) || 0)
            : totalCount > 0
            ? Math.round((totalResolved / totalCount) * 100)
            : 0;

    return {
        activeComplaints,
        pendingReview,
        totalResolved,
        totalCount,
        resolutionRate,
    };
}

export function filterComplaintsBySummaryBucket(complaints = [], bucket = 'all', role = 'citizen') {
    const list = Array.isArray(complaints) ? complaints : [];
    if (!bucket || bucket === 'all') return list;
    if (bucket === 'active') {
        return list.filter((c) => isComplaintActive(c?.status));
    }
    if (bucket === 'pending_review') {
        return list.filter((c) => isComplaintPendingReview(c?.status, role));
    }
    if (bucket === 'resolved') {
        return list.filter((c) => isComplaintResolved(c?.status));
    }
    return list;
}

export function getRoleDashboardMeta(role) {
    switch (role) {
        case 'nodal_officer':
        case 'officer':
            return {
                href: '/nodal-dashboard',
                ctaLabel: 'Open Nodal Command',
                scopeLabel: 'Department Grievance Queue',
                pendingSubtitle: 'Awaiting inspection review or final sign-off',
            };
        case 'inspection_officer':
            return {
                href: '/inspection-dashboard',
                ctaLabel: 'Open Inspection Desk',
                scopeLabel: 'Your Assigned Field Inspections',
                pendingSubtitle: 'Site inspections & verifications due',
            };
        case 'team_lead':
            return {
                href: '/team-dashboard',
                ctaLabel: 'Open Field Squad Desk',
                scopeLabel: 'Your Field Squad Work Orders',
                pendingSubtitle: 'Assigned or returned for rework',
            };
        case 'supervisor':
            return {
                href: '/supervisor',
                ctaLabel: 'Open Appellate Bench',
                scopeLabel: 'Appellate & Escalated Queue',
                pendingSubtitle: 'Appeals awaiting adjudication',
            };
        case 'admin':
        case 'super_admin':
            return {
                href: '/admin',
                ctaLabel: 'Open Admin Console',
                scopeLabel: 'Citywide Municipal Overview',
                pendingSubtitle: 'Complaints awaiting review or escalation',
            };
        case 'citizen':
        default:
            return {
                href: '/citizen/track',
                ctaLabel: 'View My Grievances',
                scopeLabel: 'Your Personal Grievance Portfolio',
                pendingSubtitle: 'Awaiting inspection review or officer update',
            };
    }
}
