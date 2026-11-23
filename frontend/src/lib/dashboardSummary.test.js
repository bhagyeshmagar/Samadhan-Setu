import test from 'node:test';
import assert from 'node:assert/strict';
import {
    computeDashboardSummaryFromComplaints,
    computeDashboardSummaryFromAdminStats,
    filterComplaintsBySummaryBucket,
    getRoleDashboardMeta,
} from './dashboardSummary.js';

test('computeDashboardSummaryFromComplaints handles empty list cleanly', () => {
    const summary = computeDashboardSummaryFromComplaints([], 'citizen');
    assert.deepEqual(summary, {
        activeComplaints: 0,
        pendingReview: 0,
        totalResolved: 0,
        totalCount: 0,
        resolutionRate: 0,
    });
});

test('computeDashboardSummaryFromComplaints calculates citizen stats accurately', () => {
    const complaints = [
        { id: '1', status: 'submitted' },
        { id: '2', status: 'inspection_submitted' },
        { id: '3', status: 'work_in_progress' },
        { id: '4', status: 'resolved' },
        { id: '5', status: 'closed' },
        { id: '6', status: 'rejected' },
    ];
    const summary = computeDashboardSummaryFromComplaints(complaints, 'citizen');
    assert.equal(summary.activeComplaints, 3);
    assert.equal(summary.pendingReview, 2);
    assert.equal(summary.totalResolved, 2);
    assert.equal(summary.totalCount, 6);
    assert.equal(summary.resolutionRate, 33);
});

test('computeDashboardSummaryFromComplaints respects role-specific pending review statuses', () => {
    const complaints = [
        { id: '1', status: 'inspection_assigned' },
        { id: '2', status: 'inspection_submitted' },
        { id: '3', status: 'team_assigned' },
        { id: '4', status: 'verification_assigned' },
        { id: '5', status: 'verification_submitted' },
        { id: '6', status: 'resolved' },
    ];

    const nodal = computeDashboardSummaryFromComplaints(complaints, 'nodal_officer');
    assert.equal(nodal.activeComplaints, 5);
    assert.equal(nodal.pendingReview, 2); // inspection_submitted + verification_submitted
    assert.equal(nodal.totalResolved, 1);

    const inspector = computeDashboardSummaryFromComplaints(complaints, 'inspection_officer');
    assert.equal(inspector.pendingReview, 2); // inspection_assigned + verification_assigned

    const teamLead = computeDashboardSummaryFromComplaints(complaints, 'team_lead');
    assert.equal(teamLead.pendingReview, 1); // team_assigned
});

test('computeDashboardSummaryFromAdminStats maps status breakdown and totals', () => {
    const summary = computeDashboardSummaryFromAdminStats({
        total_complaints: 12,
        resolved_complaints: 4,
        closed_complaints: 2,
        open_complaints: 6,
        by_status: {
            submitted: 2,
            inspection_submitted: 1,
            work_in_progress: 2,
            appealed_l1: 1,
            resolved: 4,
            closed: 2,
        },
    });
    assert.equal(summary.activeComplaints, 6);
    assert.equal(summary.pendingReview, 4);
    assert.equal(summary.totalResolved, 6);
    assert.equal(summary.resolutionRate, 50);
});

test('filterComplaintsBySummaryBucket filters all, active, pending_review, and resolved', () => {
    const items = [
        { id: 'a', status: 'submitted' },
        { id: 'b', status: 'work_in_progress' },
        { id: 'c', status: 'resolved' },
    ];
    assert.equal(filterComplaintsBySummaryBucket(items, 'all', 'citizen').length, 3);
    assert.deepEqual(
        filterComplaintsBySummaryBucket(items, 'active', 'citizen').map((x) => x.id),
        ['a', 'b']
    );
    assert.deepEqual(
        filterComplaintsBySummaryBucket(items, 'pending_review', 'citizen').map((x) => x.id),
        ['a']
    );
    assert.deepEqual(
        filterComplaintsBySummaryBucket(items, 'resolved', 'citizen').map((x) => x.id),
        ['c']
    );
});

test('getRoleDashboardMeta maps each role to its dedicated route', () => {
    assert.equal(getRoleDashboardMeta('citizen').href, '/citizen/track');
    assert.equal(getRoleDashboardMeta('nodal_officer').href, '/nodal-dashboard');
    assert.equal(getRoleDashboardMeta('inspection_officer').href, '/inspection-dashboard');
    assert.equal(getRoleDashboardMeta('team_lead').href, '/team-dashboard');
    assert.equal(getRoleDashboardMeta('admin').href, '/admin');
});
