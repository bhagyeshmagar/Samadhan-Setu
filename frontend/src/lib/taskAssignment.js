/**
 * Shared Task Assignment policy, priority-to-SLA schedule, and workload sorting helpers.
 * Used by both the reusable TaskAssignment UI component and the Next.js API route handlers.
 */

export const PRIORITY_OPTIONS = [
  {
    value: 'low',
    label: 'Low',
    slaHours: 168,
    slaLabel: '7d SLA (168h)',
    shortSla: '7d',
    score: 1.5,
    accent: '#475569',
  },
  {
    value: 'medium',
    label: 'Medium',
    slaHours: 72,
    slaLabel: '3d SLA (72h)',
    shortSla: '72h',
    score: 2.5,
    accent: '#0369A1',
  },
  {
    value: 'high',
    label: 'High',
    slaHours: 48,
    slaLabel: '48h SLA',
    shortSla: '48h',
    score: 3.5,
    accent: '#C2410C',
  },
  {
    value: 'critical',
    label: 'Critical',
    slaHours: 24,
    slaLabel: '24h SLA',
    shortSla: '24h',
    score: 4.5,
    accent: '#DC2626',
  },
];

export const ALLOWED_PRIORITIES = PRIORITY_OPTIONS.map((p) => p.value);

const PRIORITY_MAP = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p]));
const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

export const INSTRUCTION_PRESETS = {
  inspector: [
    'Verify site dimensions and capture geotagged photo proof.',
    'Check immediate public safety hazard and barricade requirement.',
    'Confirm landmark coordinates match citizen report before sign-off.',
  ],
  team: [
    'Mobilize field crew and upload before/after GPS remediation photos.',
    'Restore safe public access first and log full materials used.',
    'Coordinate barricading and complete permanent repair within SLA.',
  ],
  verifier: [
    'Re-inspect completed site and confirm defect is fully rectified.',
    'Match repair quality against initial citizen and inspection proofs.',
    'Verify debris clearance and capture independent GPS verification photo.',
  ],
};

export function isValidPriority(value) {
  if (typeof value !== 'string') return false;
  return ALLOWED_PRIORITIES.includes(value.trim().toLowerCase());
}

export function normalizePriority(value, fallback = 'medium') {
  if (typeof value === 'string') {
    const clean = value.trim().toLowerCase();
    if (PRIORITY_MAP[clean]) return clean;
  }
  return PRIORITY_MAP[fallback] ? fallback : 'medium';
}

export function getPriorityConfig(priority) {
  return PRIORITY_MAP[normalizePriority(priority)];
}

export function getSlaHoursForPriority(priority) {
  return getPriorityConfig(priority).slaHours;
}

export function getPriorityScore(priority) {
  return getPriorityConfig(priority).score;
}

export function getNowMs() {
  return Date.now();
}

/**
 * Computes the recalculated ISO SLA deadline string from a base timestamp.
 */
export function computeSlaDeadline(priority, fromDate = new Date()) {
  const base = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const slaHours = getSlaHoursForPriority(priority);
  return new Date(safeBase.getTime() + slaHours * 3600 * 1000).toISOString();
}

/**
 * Sorts active Inspection Officers by lowest active workload first, then alphabetically.
 */
export function sortInspectorsByWorkload(inspectors = []) {
  return [...(inspectors || [])]
    .filter((officer) => officer && officer.is_active !== false)
    .sort((a, b) => {
      const loadA = Number(a.active_inspections ?? a.active_tasks ?? 0);
      const loadB = Number(b.active_inspections ?? b.active_tasks ?? 0);
      if (loadA !== loadB) return loadA - loadB;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/**
 * Sorts active Field Teams by lowest load ratio (active_work_orders / daily_capacity), then lowest count.
 */
export function sortTeamsByWorkload(teams = []) {
  return [...(teams || [])]
    .filter((team) => team && team.is_active !== false)
    .sort((a, b) => {
      const loadA = Number(a.active_work_orders ?? a.active_tasks ?? 0);
      const loadB = Number(b.active_work_orders ?? b.active_tasks ?? 0);
      const capA = Math.max(1, Number(a.daily_capacity || 1));
      const capB = Math.max(1, Number(b.daily_capacity || 1));
      const ratioA = loadA / capA;
      const ratioB = loadB / capB;
      if (ratioA !== ratioB) return ratioA - ratioB;
      if (loadA !== loadB) return loadA - loadB;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

/**
 * Returns newly arrived intake grievances awaiting initial inspection officer assignment,
 * ordered by highest priority first and then earliest creation time.
 */
export function getAssignableIntakeComplaints(complaints = []) {
  const newIntakeStatuses = new Set(['submitted', 'verified', 'assigned']);
  return [...(complaints || [])]
    .filter((c) => c && newIntakeStatuses.has(c.status) && !c.assigned_inspector_id)
    .sort((a, b) => {
      const rankA = PRIORITY_RANK[normalizePriority(a.priority)] || 0;
      const rankB = PRIORITY_RANK[normalizePriority(b.priority)] || 0;
      if (rankA !== rankB) return rankB - rankA;
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });
}

const WORKFLOW_STATUS_LABELS = {
  submitted: 'New Intake',
  verified: 'Verified',
  assigned: 'Assigned',
  inspection_assigned: 'Inspection Assigned',
  inspection_submitted: 'Inspection Submitted',
  inspection_rework: 'Inspection Rework',
  inspection_verified: 'Inspection Verified',
  team_assigned: 'Field Team Assigned',
  work_in_progress: 'Work In Progress',
  redressal_rework: 'Redressal Rework',
  resolution_submitted: 'Resolution Submitted',
  verification_assigned: 'Verification Assigned',
  verification_submitted: 'Verification Submitted',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
};

export function formatWorkflowStatusLabel(status) {
  if (!status) return 'Updated';
  const key = String(status).trim().toLowerCase();
  if (WORKFLOW_STATUS_LABELS[key]) return WORKFLOW_STATUS_LABELS[key];
  return key
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

export function formatSlaDeadline(isoString) {
  if (!isoString) return 'Not scheduled';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTimelineTimestamp(isoString) {
  if (!isoString) return 'Pending timestamp';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return 'Pending timestamp';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Compares the complaint's current SLA deadline against a recalculated deadline ISO string.
 */
export function describeSlaDelta(currentDeadlineIso, nextDeadlineIso) {
  const nextDate = nextDeadlineIso ? new Date(nextDeadlineIso) : null;
  if (!nextDate || Number.isNaN(nextDate.getTime())) {
    return { direction: 'same', diffHours: 0, label: 'Scheduled from dispatch' };
  }
  const currentDate = currentDeadlineIso ? new Date(currentDeadlineIso) : null;
  if (!currentDate || Number.isNaN(currentDate.getTime())) {
    return { direction: 'new', diffHours: 0, label: 'New statutory deadline' };
  }
  const diffHours = Math.round((nextDate.getTime() - currentDate.getTime()) / (3600 * 1000));
  if (Math.abs(diffHours) < 1) {
    return { direction: 'same', diffHours: 0, label: 'Matches current deadline' };
  }
  const absHours = Math.abs(diffHours);
  const formattedSpan =
    absHours >= 48 && absHours % 24 === 0 ? `${absHours / 24}d` : `${absHours}h`;
  if (diffHours < 0) {
    return {
      direction: 'tighter',
      diffHours,
      label: `Earlier by ${formattedSpan}`,
    };
  }
  return {
    direction: 'extended',
    diffHours,
    label: `Extended by ${formattedSpan}`,
  };
}

function classifyHistoryEvent(toStatus, fromStatus, action = '') {
  const act = String(action || '').toLowerCase();
  const to = String(toStatus || '').toLowerCase();
  if (act === 'complaint_created' || (!fromStatus && (to === 'submitted' || to === 'created'))) return 'created';
  if (
    act.includes('assigned') ||
    act.includes('reassigned') ||
    to === 'inspection_assigned' ||
    to === 'team_assigned' ||
    to === 'verification_assigned' ||
    to === 'assigned'
  ) {
    return 'assigned';
  }
  if (act.includes('rework') || to === 'inspection_rework' || to === 'redressal_rework' || to === 'rejected') {
    return 'rework';
  }
  if (to === 'resolved' || to === 'closed') {
    return 'resolved';
  }
  return 'transition';
}

/**
 * Maps a timeline event to the .timeline-dot modifier class defined in globals.css:
 *  - 'done'   -> var(--india-green) for completed/verified/resolved milestones
 *  - 'active' -> var(--saffron) for the current active milestone or rework alert
 *  - ''       -> default var(--navy) for standard historical entries
 */
export function getTimelineDotModifier(event, isLatest = false) {
  if (!event) return '';
  if (event.kind === 'resolved') return 'done';
  if (event.kind === 'rework') return 'active';
  if (isLatest) return 'active';
  const to = String(event.toStatus || '').toLowerCase();
  if (to === 'inspection_verified' || to === 'resolution_submitted' || to === 'verification_submitted') {
    return 'done';
  }
  return '';
}

function formatAuditActionTitle(action) {
  const map = {
    complaint_created: 'Task Created',
    inspector_assigned: 'Inspection Officer Assigned',
    inspection_reassigned: 'Inspection Officer Reassigned',
    team_assigned: 'Field Team Assigned',
    verifier_assigned: 'Post-Repair Verifier Assigned',
    inspection_approved: 'Inspection Proof Verified',
    inspection_rework: 'Inspection Returned for Rework',
    final_approved: 'Final Resolution Approved',
  };
  const key = String(action || '').toLowerCase();
  return map[key] || formatWorkflowStatusLabel(key);
}

/**
 * Normalizes complaint creation, timestamped assignments, status transitions, and
 * audit log records into a chronological Task History timeline.
 */
export function buildTaskHistoryTimeline(complaint, auditLogs = []) {
  if (!complaint) return [];

  const rawHistory = Array.isArray(complaint.status_history)
    ? complaint.status_history
    : Array.isArray(complaint.timeline)
    ? complaint.timeline
    : [];

  const logs = Array.isArray(auditLogs)
    ? auditLogs
    : Array.isArray(complaint.audit_logs)
    ? complaint.audit_logs
    : [];

  const matchedAuditIds = new Set();

  const events = rawHistory.map((entry, idx) => {
    const fromStatus = entry.from_status ?? entry.status_from ?? null;
    const toStatus = entry.to_status ?? entry.status_to ?? complaint.status ?? 'submitted';
    const timestamp = entry.created_at || entry.timestamp || complaint.created_at || null;
    const kind = classifyHistoryEvent(toStatus, fromStatus);
    const toLabel = formatWorkflowStatusLabel(toStatus);
    const fromLabel = fromStatus ? formatWorkflowStatusLabel(fromStatus) : null;

    // Match nearby audit log within 5 seconds to attach structured assignment metadata (assignee, priority, SLA)
    const entryMs = timestamp ? new Date(timestamp).getTime() : 0;
    const matchedLog = logs.find((log) => {
      if (!log || matchedAuditIds.has(log.id)) return false;
      const logMs = log.created_at ? new Date(log.created_at).getTime() : 0;
      const closeInTime = entryMs && logMs && Math.abs(entryMs - logMs) <= 5000;
      if (!closeInTime) return false;
      const logKind = classifyHistoryEvent(toStatus, fromStatus, log.action);
      return logKind === kind || (kind === 'created' && log.action === 'complaint_created');
    });

    if (matchedLog) {
      matchedAuditIds.add(matchedLog.id);
    }

    let title = toLabel;
    if (kind === 'created') {
      title = 'Task Created';
    } else if (kind === 'assigned') {
      title = matchedLog?.details?.is_reassign ? `${toLabel} (Reassigned)` : toLabel;
    } else if (fromLabel && fromLabel !== toLabel) {
      title = `${fromLabel} → ${toLabel}`;
    }

    return {
      id: entry.id || `${complaint.id || 'task'}-hist-${idx}`,
      kind,
      title,
      fromStatus,
      toStatus,
      fromLabel,
      toLabel,
      actorName: entry.actor_name || entry.changed_by_name || matchedLog?.actor_name || null,
      actorRole: entry.actor_role || matchedLog?.actor_role || null,
      remarks: entry.remarks || entry.notes || '',
      assigneeName: entry.assignee_name || matchedLog?.details?.assignee_name || null,
      priority: entry.priority || matchedLog?.details?.priority || null,
      slaDeadline: entry.sla_deadline || matchedLog?.details?.sla_deadline || null,
      timestamp,
    };
  });

  // Include any standalone audit log events (e.g., assignment/priority audits not already attached to a status row)
  logs.forEach((log, idx) => {
    if (!log || matchedAuditIds.has(log.id)) return;
    const kind = classifyHistoryEvent(null, null, log.action);
    const details = log.details || {};
    const detailParts = [];
    if (details.assignee_name) detailParts.push(`Assigned to ${details.assignee_name}`);
    if (details.priority) detailParts.push(`Priority: ${String(details.priority).toUpperCase()}`);
    if (details.notes) detailParts.push(details.notes);

    events.push({
      id: log.id || `${complaint.id || 'task'}-audit-${idx}`,
      kind,
      title: formatAuditActionTitle(log.action),
      fromStatus: null,
      toStatus: log.action || null,
      fromLabel: null,
      toLabel: formatAuditActionTitle(log.action),
      actorName: log.actor_name || 'System',
      actorRole: log.actor_role || null,
      remarks: detailParts.join(' · '),
      assigneeName: details.assignee_name || null,
      priority: details.priority || null,
      slaDeadline: details.sla_deadline || null,
      timestamp: log.created_at || null,
    });
  });

  const hasCreatedEvent = events.some((ev) => ev.kind === 'created');
  if (!hasCreatedEvent && complaint.created_at) {
    events.unshift({
      id: `${complaint.id || 'task'}-created`,
      kind: 'created',
      title: 'Task Created',
      fromStatus: null,
      toStatus: 'submitted',
      fromLabel: null,
      toLabel: 'New Intake',
      actorName: complaint.citizen?.name || complaint.citizen?.full_name || 'Citizen Portal',
      actorRole: 'citizen',
      remarks: `Grievance ${complaint.complaint_number || ''} logged and routed for departmental triage.`.trim(),
      assigneeName: null,
      priority: complaint.priority || null,
      slaDeadline: null,
      timestamp: complaint.created_at,
    });
  }

  return events.sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });
}
