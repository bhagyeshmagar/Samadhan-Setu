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
