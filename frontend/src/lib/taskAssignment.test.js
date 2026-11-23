import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_PRIORITIES,
  isValidPriority,
  normalizePriority,
  getPriorityConfig,
  getSlaHoursForPriority,
  getPriorityScore,
  computeSlaDeadline,
  sortInspectorsByWorkload,
  sortTeamsByWorkload,
  getAssignableIntakeComplaints,
  formatSlaDeadline,
  describeSlaDelta,
  formatWorkflowStatusLabel,
  buildTaskHistoryTimeline,
  getTimelineDotModifier,
} from './taskAssignment.js';

test('isValidPriority accepts canonical levels and rejects invalid values', () => {
  for (const level of ALLOWED_PRIORITIES) {
    assert.equal(isValidPriority(level), true);
    assert.equal(isValidPriority(level.toUpperCase()), true);
  }
  assert.equal(isValidPriority('urgent'), false);
  assert.equal(isValidPriority(''), false);
  assert.equal(isValidPriority(null), false);
  assert.equal(isValidPriority(123), false);
});

test('normalizePriority normalizes casing and falls back safely', () => {
  assert.equal(normalizePriority('CRITICAL'), 'critical');
  assert.equal(normalizePriority(' High '), 'high');
  assert.equal(normalizePriority('unknown', 'low'), 'low');
  assert.equal(normalizePriority(undefined), 'medium');
});

test('computeSlaDeadline recalculates exact SLA window for every priority level', () => {
  const base = new Date('2026-11-23T10:00:00.000Z');
  assert.equal(getSlaHoursForPriority('critical'), 24);
  assert.equal(getSlaHoursForPriority('high'), 48);
  assert.equal(getSlaHoursForPriority('medium'), 72);
  assert.equal(getSlaHoursForPriority('low'), 168);

  assert.equal(computeSlaDeadline('critical', base), '2026-11-24T10:00:00.000Z');
  assert.equal(computeSlaDeadline('high', base), '2026-11-25T10:00:00.000Z');
  assert.equal(computeSlaDeadline('medium', base), '2026-11-26T10:00:00.000Z');
  assert.equal(computeSlaDeadline('low', base), '2026-11-30T10:00:00.000Z');

  assert.equal(getPriorityScore('critical'), 4.5);
  assert.equal(getPriorityConfig('high').shortSla, '48h');
});

test('sortInspectorsByWorkload orders active inspectors by lowest task count first', () => {
  const sorted = sortInspectorsByWorkload([
    { id: 'i1', name: 'Zoya', active_inspections: 4, is_active: true },
    { id: 'i2', name: 'Arjun', active_inspections: 1, is_active: true },
    { id: 'i3', name: 'Inactive', active_inspections: 0, is_active: false },
    { id: 'i4', name: 'Bhavna', active_inspections: 1, is_active: true },
  ]);
  assert.deepEqual(
    sorted.map((o) => o.id),
    ['i2', 'i4', 'i1']
  );
});

test('sortTeamsByWorkload orders active teams by lowest utilization ratio', () => {
  const sorted = sortTeamsByWorkload([
    { id: 't1', name: 'Squad Alpha', active_work_orders: 4, daily_capacity: 5, is_active: true },
    { id: 't2', name: 'Squad Beta', active_work_orders: 1, daily_capacity: 5, is_active: true },
    { id: 't3', name: 'Squad Off', active_work_orders: 0, daily_capacity: 5, is_active: false },
    { id: 't4', name: 'Squad Gamma', active_work_orders: 2, daily_capacity: 4, is_active: true },
  ]);
  assert.deepEqual(
    sorted.map((t) => t.id),
    ['t2', 't4', 't1']
  );
});

test('getAssignableIntakeComplaints filters unassigned new intake and orders by priority then age', () => {
  const list = getAssignableIntakeComplaints([
    { id: 'c1', status: 'submitted', priority: 'medium', created_at: '2026-11-22T09:00:00Z' },
    { id: 'c2', status: 'inspection_assigned', priority: 'critical', assigned_inspector_id: 'i1', created_at: '2026-11-22T08:00:00Z' },
    { id: 'c3', status: 'verified', priority: 'critical', created_at: '2026-11-22T12:00:00Z' },
    { id: 'c4', status: 'submitted', priority: 'high', created_at: '2026-11-22T10:00:00Z' },
    { id: 'c5', status: 'assigned', priority: 'high', created_at: '2026-11-22T07:00:00Z' },
  ]);
  assert.deepEqual(
    list.map((c) => c.id),
    ['c3', 'c5', 'c4', 'c1']
  );
});

test('describeSlaDelta computes tightened, extended, and unchanged SLA differences', () => {
  const current = '2026-11-25T10:00:00.000Z';
  assert.equal(describeSlaDelta(current, '2026-11-24T10:00:00.000Z').direction, 'tighter');
  assert.equal(describeSlaDelta(current, '2026-11-24T10:00:00.000Z').label, 'Earlier by 24h');
  assert.equal(describeSlaDelta(current, '2026-11-27T10:00:00.000Z').direction, 'extended');
  assert.equal(describeSlaDelta(current, '2026-11-27T10:00:00.000Z').label, 'Extended by 2d');
  assert.equal(describeSlaDelta(current, current).direction, 'same');
  assert.notEqual(formatSlaDeadline(current), 'Not scheduled');
});

test('buildTaskHistoryTimeline normalizes creation, assignment, and transitions chronologically', () => {
  assert.equal(formatWorkflowStatusLabel('inspection_assigned'), 'Inspection Assigned');
  const events = buildTaskHistoryTimeline({
    id: 'cmp-1',
    complaint_number: 'SS-2026-001015',
    created_at: '2026-11-22T08:00:00.000Z',
    status_history: [
      {
        from_status: 'inspection_assigned',
        to_status: 'inspection_submitted',
        actor_name: 'Sneha Kulkarni',
        actor_role: 'inspection_officer',
        remarks: 'Site photo uploaded.',
        created_at: '2026-11-22T12:00:00.000Z',
      },
      {
        from_status: 'submitted',
        to_status: 'inspection_assigned',
        actor_name: 'Amit Deshmukh',
        actor_role: 'nodal_officer',
        remarks: 'Assigned inspection.',
        created_at: '2026-11-22T09:00:00.000Z',
      },
    ],
  });

  assert.equal(events.length, 3);
  assert.equal(events[0].kind, 'created');
  assert.equal(events[0].title, 'Task Created');
  assert.equal(events[1].kind, 'assigned');
  assert.equal(events[1].title, 'Inspection Assigned');
  assert.equal(events[2].kind, 'transition');
  assert.equal(events[2].title, 'Inspection Assigned → Inspection Submitted');
});

test('buildTaskHistoryTimeline enriches assignments from audit logs and maps .timeline-dot modifiers', () => {
  const events = buildTaskHistoryTimeline(
    {
      id: 'cmp-2',
      complaint_number: 'SS-2026-001016',
      created_at: '2026-11-22T08:00:00.000Z',
      status_history: [
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          actor_name: 'Amit Verma',
          actor_role: 'nodal_officer',
          remarks: 'Assigned inspection to Sneha.',
          created_at: '2026-11-22T09:00:00.000Z',
        },
        {
          from_status: 'verification_submitted',
          to_status: 'resolved',
          actor_name: 'Amit Verma',
          actor_role: 'nodal_officer',
          remarks: 'Final approval granted.',
          created_at: '2026-11-22T15:00:00.000Z',
        },
      ],
    },
    [
      {
        id: 'aud-1',
        action: 'inspector_assigned',
        actor_name: 'Amit Verma',
        actor_role: 'nodal_officer',
        details: {
          assignee_name: 'Sneha Kulkarni',
          priority: 'critical',
          is_reassign: true,
        },
        created_at: '2026-11-22T09:00:01.000Z',
      },
    ]
  );

  assert.equal(events.length, 3);
  assert.equal(events[1].title, 'Inspection Assigned (Reassigned)');
  assert.equal(events[1].assigneeName, 'Sneha Kulkarni');
  assert.equal(events[1].priority, 'critical');
  assert.equal(getTimelineDotModifier(events[0], false), '');
  assert.equal(getTimelineDotModifier(events[1], true), 'active');
  assert.equal(getTimelineDotModifier(events[2], true), 'done');
});
