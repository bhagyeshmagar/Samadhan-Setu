import crypto from 'crypto';
import {
  NOTIFICATION_EVENTS,
  VALID_EVENT_KEYS,
  inferEventTypeFromTitle,
  getDefaultNotificationPreferences,
  formatNotificationPayload,
  buildWhatsAppFallbackUrl,
  normalizeWhatsAppPhone,
  isValidEmail,
  isMetaWhatsAppConfigured,
  dispatchMetaWhatsAppMessage,
} from './notificationChannels';

// Haversine distance in meters between two WGS84 coordinates
export function computeDistanceMeters(lat1, lon1, lat2, lon2) {
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined
  ) {
    return null;
  }
  const a1 = Number(lat1);
  const o1 = Number(lon1);
  const a2 = Number(lat2);
  const o2 = Number(lon2);
  if ([a1, o1, a2, o2].some((v) => Number.isNaN(v))) return null;

  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(a2 - a1);
  const dLon = toRad(o2 - o1);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a1)) * Math.cos(toRad(a2)) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return Math.round(R * c);
}

// Explicit 8-step governance workflow state transitions (including rework & reassignment loops)
export const WORKFLOW_TRANSITIONS = {
  submitted: ['inspection_assigned', 'assigned', 'rejected'],
  verified: ['inspection_assigned', 'assigned', 'rejected'],
  assigned: ['inspection_assigned', 'in_progress', 'rejected'],
  inspection_assigned: ['inspection_submitted', 'inspection_assigned', 'rejected'],
  inspection_submitted: ['inspection_verified', 'inspection_rework', 'inspection_assigned'],
  inspection_rework: ['inspection_submitted', 'inspection_assigned'],
  inspection_verified: ['team_assigned', 'rejected'],
  team_assigned: ['work_in_progress', 'team_assigned'],
  work_in_progress: ['resolution_submitted', 'verification_assigned', 'team_assigned'],
  in_progress: ['verification_assigned', 'resolved', 'escalated'],
  resolution_submitted: ['verification_assigned'],
  verification_assigned: ['verification_submitted', 'redressal_rework', 'verification_assigned'],
  verification_submitted: ['resolved', 'redressal_rework', 'team_assigned', 'verification_assigned'],
  redressal_rework: ['work_in_progress', 'team_assigned'],
  resolved: ['closed', 'reopened', 'appealed_l1'],
  reopened: ['inspection_assigned', 'team_assigned', 'work_in_progress', 'resolved'],
  appealed_l1: ['appealed_l2', 'work_in_progress', 'team_assigned', 'closed', 'resolved'],
  appealed_l2: ['work_in_progress', 'team_assigned', 'closed', 'resolved'],
  escalated: ['inspection_assigned', 'team_assigned', 'work_in_progress', 'resolved'],
  closed: [],
  rejected: [],
};

export function isValidTransition(fromStatus, toStatus) {
  const allowed = WORKFLOW_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function createInitialStore() {
  const now = Date.now();
  const hr = 3600 * 1000;
  const day = 24 * hr;

  const deptRoadsId = 'dept-roads-001';
  const deptWaterId = 'dept-water-002';
  const deptElecId = 'dept-elec-003';
  const deptSanitId = 'dept-sanit-004';
  const deptHealthId = 'dept-health-005';

  const departments = [
    {
      id: deptRoadsId,
      name: 'Roads & Transport',
      code: 'dept_roads',
      description: 'Road maintenance, potholes, footpaths, storm drains, traffic signals, bridges',
      contact_email: 'roads@samadhan.gov.in',
      contact_phone: '022-24301111',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 24,
      sla_medium: 72,
      sla_low: 168,
      is_active: true,
      created_at: new Date(now - 90 * day).toISOString(),
    },
    {
      id: deptWaterId,
      name: 'Water Supply',
      code: 'dept_water',
      description: 'Potable water supply, pipeline leaks, contamination, sewage & drainage',
      contact_email: 'water@samadhan.gov.in',
      contact_phone: '022-24302222',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 12,
      sla_medium: 48,
      sla_low: 120,
      is_active: true,
      created_at: new Date(now - 90 * day).toISOString(),
    },
    {
      id: deptElecId,
      name: 'Electricity',
      code: 'dept_electricity',
      description: 'Power supply, street lighting, transformers, feeder lines',
      contact_email: 'electricity@samadhan.gov.in',
      contact_phone: '022-24303333',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 8,
      sla_medium: 24,
      sla_low: 72,
      is_active: true,
      created_at: new Date(now - 90 * day).toISOString(),
    },
    {
      id: deptSanitId,
      name: 'Sanitation & Waste',
      code: 'dept_sanitation',
      description: 'Solid waste collection, bin clearing, street sweeping, civic cleanliness',
      contact_email: 'sanitation@samadhan.gov.in',
      contact_phone: '022-24304444',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 12,
      sla_medium: 36,
      sla_low: 96,
      is_active: true,
      created_at: new Date(now - 90 * day).toISOString(),
    },
    {
      id: deptHealthId,
      name: 'Health & Safety',
      code: 'dept_health',
      description: 'Public health hazards, vector control, food safety inspection',
      contact_email: 'health@samadhan.gov.in',
      contact_phone: '022-24305555',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 6,
      sla_medium: 24,
      sla_low: 48,
      is_active: true,
      created_at: new Date(now - 90 * day).toISOString(),
    },
  ];

  // Field Teams within departments
  const teams = [
    {
      id: 'team-roads-1',
      name: 'Dadar Quick Response Pothole Squad',
      code: 'ROADS-T1',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_lead_officer_id: 'off-roads-tl1',
      team_lead_user_id: 'user-teamlead-roads-1',
      team_lead_name: 'Suresh Jadhav',
      ward_coverage: ['Ward 12 - Dadar', 'Ward 11 - Prabhadevi'],
      specialization: 'Hot-Mix Asphalt & Road Surface Patching',
      member_count: 8,
      daily_capacity: 10,
      is_active: true,
      created_at: new Date(now - 60 * day).toISOString(),
    },
    {
      id: 'team-roads-2',
      name: 'Mahim Footpath & Drain Squad',
      code: 'ROADS-T2',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_lead_officer_id: 'off-roads-tl2',
      team_lead_user_id: 'user-teamlead-roads-2',
      team_lead_name: 'Deepak Pawar',
      ward_coverage: ['Ward 14 - Mahim', 'Ward 12 - Dadar'],
      specialization: 'Footpath Paving, Storm Drains & Grating',
      member_count: 6,
      daily_capacity: 8,
      is_active: true,
      created_at: new Date(now - 60 * day).toISOString(),
    },
    {
      id: 'team-water-1',
      name: 'Andheri Pipeline Rapid Repair Unit',
      code: 'WATER-T1',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      team_lead_officer_id: 'off-water-tl1',
      team_lead_user_id: 'user-teamlead-water-1',
      team_lead_name: 'Prakash Nair',
      ward_coverage: ['Ward 8 - Andheri', 'Ward 9 - Juhu'],
      specialization: 'Water Main Flushing & Valve Replacement',
      member_count: 7,
      daily_capacity: 10,
      is_active: true,
      created_at: new Date(now - 60 * day).toISOString(),
    },
    {
      id: 'team-elec-1',
      name: 'Bandra Streetlight & Grid Squad',
      code: 'ELEC-T1',
      department_id: deptElecId,
      department_name: 'Electricity',
      team_lead_officer_id: 'off-elec-tl1',
      team_lead_user_id: 'user-teamlead-elec-1',
      team_lead_name: 'Anil Sawant',
      ward_coverage: ['Ward 5 - Bandra', 'Ward 6 - Khar'],
      specialization: 'LED Luminaire & High-Mast Lighting',
      member_count: 5,
      daily_capacity: 12,
      is_active: true,
      created_at: new Date(now - 60 * day).toISOString(),
    },
  ];

  const users = [
    // Citizens
    {
      id: 'user-citizen-1',
      email: 'citizen@demo.com',
      phone: '9876543210',
      name: 'Rajesh Kumar',
      full_name: 'Rajesh Kumar',
      password: 'demo123',
      role: 'citizen',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-citizen-2',
      email: 'priya@demo.com',
      phone: '9876543211',
      name: 'Priya Sharma',
      full_name: 'Priya Sharma',
      password: 'demo123',
      role: 'citizen',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
      is_verified: true,
      is_active: true,
    },

    // Roads & Transport — Multi-Role Departmental Cadre
    {
      id: 'user-nodal-roads',
      email: 'nodal@roads.gov.in',
      phone: '9876543220',
      name: 'Amit Verma',
      full_name: 'Amit Verma',
      password: 'demo123',
      role: 'nodal_officer',
      department_id: deptRoadsId,
      officer_id: 'off-roads-nodal',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-inspector-roads-1',
      email: 'inspector1@roads.gov.in',
      phone: '9876543225',
      name: 'Sneha Kulkarni',
      full_name: 'Sneha Kulkarni',
      password: 'demo123',
      role: 'inspection_officer',
      department_id: deptRoadsId,
      officer_id: 'off-roads-insp1',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-inspector-roads-2',
      email: 'inspector2@roads.gov.in',
      phone: '9876543226',
      name: 'Rohan Patil',
      full_name: 'Rohan Patil',
      password: 'demo123',
      role: 'inspection_officer',
      department_id: deptRoadsId,
      officer_id: 'off-roads-insp2',
      ward: 'Ward 14 - Mahim',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-teamlead-roads-1',
      email: 'teamlead1@roads.gov.in',
      phone: '9876543230',
      name: 'Suresh Jadhav',
      full_name: 'Suresh Jadhav',
      password: 'demo123',
      role: 'team_lead',
      department_id: deptRoadsId,
      officer_id: 'off-roads-tl1',
      team_id: 'team-roads-1',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-teamlead-roads-2',
      email: 'teamlead2@roads.gov.in',
      phone: '9876543231',
      name: 'Deepak Pawar',
      full_name: 'Deepak Pawar',
      password: 'demo123',
      role: 'team_lead',
      department_id: deptRoadsId,
      officer_id: 'off-roads-tl2',
      team_id: 'team-roads-2',
      ward: 'Ward 14 - Mahim',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    // Legacy backward-compatible login alias for Roads officer
    {
      id: 'user-officer-roads',
      email: 'officer@roads.gov.in',
      phone: '9876543220',
      name: 'Amit Verma',
      full_name: 'Amit Verma',
      password: 'demo123',
      role: 'nodal_officer',
      department_id: deptRoadsId,
      officer_id: 'off-roads-nodal',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },

    // Water Supply Cadre
    {
      id: 'user-nodal-water',
      email: 'nodal@water.gov.in',
      phone: '9876543221',
      name: 'Sunita Devi',
      full_name: 'Sunita Devi',
      password: 'demo123',
      role: 'nodal_officer',
      department_id: deptWaterId,
      officer_id: 'off-water-nodal',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-inspector-water-1',
      email: 'inspector@water.gov.in',
      phone: '9876543227',
      name: 'Karan Mehta',
      full_name: 'Karan Mehta',
      password: 'demo123',
      role: 'inspection_officer',
      department_id: deptWaterId,
      officer_id: 'off-water-insp1',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-teamlead-water-1',
      email: 'teamlead@water.gov.in',
      phone: '9876543232',
      name: 'Prakash Nair',
      full_name: 'Prakash Nair',
      password: 'demo123',
      role: 'team_lead',
      department_id: deptWaterId,
      officer_id: 'off-water-tl1',
      team_id: 'team-water-1',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },

    // Electricity Cadre
    {
      id: 'user-nodal-elec',
      email: 'nodal@electricity.gov.in',
      phone: '9876543222',
      name: 'Ramesh Gupta',
      full_name: 'Ramesh Gupta',
      password: 'demo123',
      role: 'nodal_officer',
      department_id: deptElecId,
      officer_id: 'off-elec-nodal',
      ward: 'Ward 5 - Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-teamlead-elec-1',
      email: 'teamlead@electricity.gov.in',
      phone: '9876543233',
      name: 'Anil Sawant',
      full_name: 'Anil Sawant',
      password: 'demo123',
      role: 'team_lead',
      department_id: deptElecId,
      officer_id: 'off-elec-tl1',
      team_id: 'team-elec-1',
      ward: 'Ward 5 - Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },

    // Appellate Supervisor & District Admin
    {
      id: 'user-supervisor-1',
      email: 'supervisor@samadhan.gov.in',
      phone: '9876543205',
      name: 'Vikram Deshmukh',
      full_name: 'Vikram Deshmukh',
      password: 'demo123',
      role: 'supervisor',
      department_id: deptRoadsId,
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-admin-1',
      email: 'admin@samadhan.gov.in',
      phone: '9876543200',
      name: 'District Collector',
      full_name: 'District Collector',
      password: 'demo123',
      role: 'admin',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
  ];

  const officers = [
    {
      id: 'off-roads-nodal',
      user_id: 'user-nodal-roads',
      name: 'Amit Verma',
      email: 'nodal@roads.gov.in',
      phone: '9876543220',
      role: 'nodal_officer',
      officer_role: 'nodal_officer',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_id: null,
      employee_id: 'NODAL-ROADS-001',
      designation: 'Nodal Officer (Executive Engineer - Roads)',
      jurisdiction_wards: ['Ward 12 - Dadar', 'Ward 14 - Mahim', 'Ward 11 - Prabhadevi'],
      max_active_complaints: 40,
      total_resolved: 142,
      rating: 4.8,
      is_active: true,
    },
    {
      id: 'off-roads-insp1',
      user_id: 'user-inspector-roads-1',
      name: 'Sneha Kulkarni',
      email: 'inspector1@roads.gov.in',
      phone: '9876543225',
      role: 'inspection_officer',
      officer_role: 'inspection_officer',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_id: null,
      employee_id: 'INSP-ROADS-001',
      designation: 'Junior Field Inspector (Zone A - Dadar)',
      jurisdiction_wards: ['Ward 12 - Dadar', 'Ward 11 - Prabhadevi'],
      max_active_complaints: 15,
      total_resolved: 68,
      rating: 4.9,
      is_active: true,
    },
    {
      id: 'off-roads-insp2',
      user_id: 'user-inspector-roads-2',
      name: 'Rohan Patil',
      email: 'inspector2@roads.gov.in',
      phone: '9876543226',
      role: 'inspection_officer',
      officer_role: 'inspection_officer',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_id: null,
      employee_id: 'INSP-ROADS-002',
      designation: 'Junior Field Inspector (Zone B - Mahim)',
      jurisdiction_wards: ['Ward 14 - Mahim', 'Ward 12 - Dadar'],
      max_active_complaints: 15,
      total_resolved: 54,
      rating: 4.6,
      is_active: true,
    },
    {
      id: 'off-roads-tl1',
      user_id: 'user-teamlead-roads-1',
      name: 'Suresh Jadhav',
      email: 'teamlead1@roads.gov.in',
      phone: '9876543230',
      role: 'team_lead',
      officer_role: 'team_lead',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_id: 'team-roads-1',
      team_name: 'Dadar Quick Response Pothole Squad',
      employee_id: 'TL-ROADS-001',
      designation: 'Team Lead — Dadar Pothole Squad',
      jurisdiction_wards: ['Ward 12 - Dadar', 'Ward 11 - Prabhadevi'],
      max_active_complaints: 12,
      total_resolved: 91,
      rating: 4.7,
      is_active: true,
    },
    {
      id: 'off-roads-tl2',
      user_id: 'user-teamlead-roads-2',
      name: 'Deepak Pawar',
      email: 'teamlead2@roads.gov.in',
      phone: '9876543231',
      role: 'team_lead',
      officer_role: 'team_lead',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      team_id: 'team-roads-2',
      team_name: 'Mahim Footpath & Drain Squad',
      employee_id: 'TL-ROADS-002',
      designation: 'Team Lead — Mahim Footpath & Drain Squad',
      jurisdiction_wards: ['Ward 14 - Mahim', 'Ward 12 - Dadar'],
      max_active_complaints: 10,
      total_resolved: 74,
      rating: 4.5,
      is_active: true,
    },
    {
      id: 'off-water-nodal',
      user_id: 'user-nodal-water',
      name: 'Sunita Devi',
      email: 'nodal@water.gov.in',
      phone: '9876543221',
      role: 'nodal_officer',
      officer_role: 'nodal_officer',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      team_id: null,
      employee_id: 'NODAL-WATER-001',
      designation: 'Nodal Officer (Executive Engineer - Water Works)',
      jurisdiction_wards: ['Ward 8 - Andheri', 'Ward 9 - Juhu'],
      max_active_complaints: 30,
      total_resolved: 83,
      rating: 4.6,
      is_active: true,
    },
    {
      id: 'off-water-insp1',
      user_id: 'user-inspector-water-1',
      name: 'Karan Mehta',
      email: 'inspector@water.gov.in',
      phone: '9876543227',
      role: 'inspection_officer',
      officer_role: 'inspection_officer',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      team_id: null,
      employee_id: 'INSP-WATER-001',
      designation: 'Water Quality & Pipeline Inspector',
      jurisdiction_wards: ['Ward 8 - Andheri', 'Ward 9 - Juhu'],
      max_active_complaints: 15,
      total_resolved: 41,
      rating: 4.7,
      is_active: true,
    },
    {
      id: 'off-water-tl1',
      user_id: 'user-teamlead-water-1',
      name: 'Prakash Nair',
      email: 'teamlead@water.gov.in',
      phone: '9876543232',
      role: 'team_lead',
      officer_role: 'team_lead',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      team_id: 'team-water-1',
      team_name: 'Andheri Pipeline Rapid Repair Unit',
      employee_id: 'TL-WATER-001',
      designation: 'Team Lead — Andheri Pipeline Unit',
      jurisdiction_wards: ['Ward 8 - Andheri'],
      max_active_complaints: 10,
      total_resolved: 59,
      rating: 4.6,
      is_active: true,
    },
    {
      id: 'off-elec-nodal',
      user_id: 'user-nodal-elec',
      name: 'Ramesh Gupta',
      email: 'nodal@electricity.gov.in',
      phone: '9876543222',
      role: 'nodal_officer',
      officer_role: 'nodal_officer',
      department_id: deptElecId,
      department_name: 'Electricity',
      team_id: null,
      employee_id: 'NODAL-ELEC-001',
      designation: 'Nodal Officer (Sub-Divisional Officer - Electrical)',
      jurisdiction_wards: ['Ward 5 - Bandra'],
      max_active_complaints: 25,
      total_resolved: 112,
      rating: 4.8,
      is_active: true,
    },
    {
      id: 'off-elec-tl1',
      user_id: 'user-teamlead-elec-1',
      name: 'Anil Sawant',
      email: 'teamlead@electricity.gov.in',
      phone: '9876543233',
      role: 'team_lead',
      officer_role: 'team_lead',
      department_id: deptElecId,
      department_name: 'Electricity',
      team_id: 'team-elec-1',
      team_name: 'Bandra Streetlight & Grid Squad',
      employee_id: 'TL-ELEC-001',
      designation: 'Team Lead — Bandra Streetlight Squad',
      jurisdiction_wards: ['Ward 5 - Bandra'],
      max_active_complaints: 12,
      total_resolved: 78,
      rating: 4.7,
      is_active: true,
    },
  ];

  const complaints = [
    // STAGE 1/2 -> Waiting at Nodal Officer Intake (New Submitted)
    {
      id: 'cmp-2026-001010',
      complaint_number: 'SS-2026-001010',
      citizen_id: 'user-citizen-1',
      title: 'Collapsed road shoulder near Shivaji Park Gate 3',
      description: 'Heavy monsoon runoff eroded the road edge near Shivaji Park Gate 3, creating a 2-foot drop along the pedestrian lane and bike path.',
      category: 'Roads & Transport',
      sub_category: 'Road Erosion / Shoulder',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.96,
      ai_summary: 'AI detected severe road edge erosion requiring urgent site inspection and structural stabilization.',
      priority: 'high',
      priority_score: 2.48,
      urgency_score: 4,
      sentiment_score: -0.72,
      upvotes: 17,
      vote_count: 17,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Shivaji Park Gate 3, Veer Savarkar Marg, Dadar West',
      address: 'Shivaji Park Gate 3, Veer Savarkar Marg, Dadar West',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0268,
      longitude: 72.8384,
      status: 'submitted',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-nodal',
      assigned_inspector_id: null,
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 22 * hr).toISOString(),
      sla_deadline: new Date(now + 22 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 2 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/shivaji_park_road_erosion.svg'],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1010-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/shivaji_park_road_erosion.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0268,
          longitude: 72.8384,
          captured_at: new Date(now - 2 * hr).toISOString(),
          notes: 'Photo taken facing south along Shivaji Park Gate 3.',
        },
      ],
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Citizen lodged grievance with geotagged photo proof. AI routed to Roads & Transport (96% confidence).',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 2 * hr).toISOString(),
        },
      ],
    },

    // STAGE 3A -> Assigned ONLY to Inspector 1 (Sneha Kulkarni) — Inspector 2 MUST NOT see this
    {
      id: 'cmp-2026-001011',
      complaint_number: 'SS-2026-001011',
      citizen_id: 'user-citizen-2',
      title: 'Sunken manhole cover causing severe bumps on Gokhale Road',
      description: 'Cast iron manhole cover sits 5 inches below asphalt level in front of Portuguese Church junction, damaging car axles and endangering cyclists.',
      category: 'Roads & Transport',
      sub_category: 'Manhole Leveling',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.94,
      ai_summary: 'Roadway hazard from recessed utility cover on arterial street.',
      priority: 'high',
      priority_score: 2.31,
      urgency_score: 4,
      sentiment_score: -0.64,
      upvotes: 12,
      vote_count: 12,
      upvoted_by: ['user-citizen-2'],
      is_public: true,
      location: 'Gokhale Road North, Near Portuguese Church, Dadar West',
      address: 'Gokhale Road North, Near Portuguese Church, Dadar West',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0196,
      longitude: 72.8398,
      status: 'inspection_assigned',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-insp1',
      assigned_inspector_id: 'off-roads-insp1',
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 18 * hr).toISOString(),
      sla_deadline: new Date(now + 18 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 6 * hr).toISOString(),
      updated_at: new Date(now - 4 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/gokhale_sunken_manhole.svg'],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1011-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/gokhale_sunken_manhole.svg',
          uploaded_by: 'user-citizen-2',
          uploaded_by_name: 'Priya Sharma',
          actor_role: 'citizen',
          latitude: 19.0196,
          longitude: 72.8398,
          captured_at: new Date(now - 6 * hr).toISOString(),
          notes: 'Recessed cover on northbound lane.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Grievance lodged with GPS photo proof.',
          actor_role: 'citizen',
          actor_name: 'Priya Sharma',
          created_at: new Date(now - 6 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          remarks: 'Nodal Officer Amit Verma assigned site inspection to Sneha Kulkarni (Zone A).',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 4 * hr).toISOString(),
        },
      ],
    },

    // STAGE 3B -> Assigned ONLY to Inspector 2 (Rohan Patil) — Inspector 1 MUST NOT see this
    {
      id: 'cmp-2026-001012',
      complaint_number: 'SS-2026-001012',
      citizen_id: 'user-citizen-1',
      title: 'Broken footpath tiles and open stormwater drain on Lady Jamshedji Road',
      description: 'Multiple concrete slabs over the roadside drain near Mahim Church are fractured and shifted, exposing an open drop for commuters.',
      category: 'Roads & Transport',
      sub_category: 'Footpath / Drain Cover',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.93,
      ai_summary: 'Pedestrian safety risk caused by damaged footpath drainage slabs.',
      priority: 'high',
      priority_score: 2.28,
      urgency_score: 4,
      sentiment_score: -0.68,
      upvotes: 15,
      vote_count: 15,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Lady Jamshedji Road, Opposite St. Michael Church, Mahim',
      address: 'Lady Jamshedji Road, Opposite St. Michael Church, Mahim',
      ward: 'Ward 14 - Mahim',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400016',
      latitude: 19.0368,
      longitude: 72.8421,
      status: 'inspection_assigned',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-insp2',
      assigned_inspector_id: 'off-roads-insp2',
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 20 * hr).toISOString(),
      sla_deadline: new Date(now + 20 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 7 * hr).toISOString(),
      updated_at: new Date(now - 3 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/mahim_broken_drain_slabs.svg'],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1012-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/mahim_broken_drain_slabs.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0368,
          longitude: 72.8421,
          captured_at: new Date(now - 7 * hr).toISOString(),
          notes: 'Three consecutive footpath drain covers cracked open.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Grievance lodged by citizen.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 7 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          remarks: 'Nodal Officer Amit Verma assigned site inspection to Rohan Patil (Zone B).',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 3 * hr).toISOString(),
        },
      ],
    },

    // STAGE 4 -> Initial Inspection Submitted by Inspector 1 -> Waiting for Nodal Side-by-Side Confirmation
    {
      id: 'cmp-2026-001013',
      complaint_number: 'SS-2026-001013',
      citizen_id: 'user-citizen-1',
      title: 'Deep crater pothole on Ranade Road bus stop lane',
      description: 'Large waterlogged pothole directly outside the BEST bus bay on Ranade Road is causing buses to swerve and splashing pedestrians.',
      category: 'Roads & Transport',
      sub_category: 'Pothole Repair',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.97,
      ai_summary: 'Verified pothole at high-traffic transit stop requiring cold/hot mix resurfacing.',
      priority: 'high',
      priority_score: 2.52,
      urgency_score: 4,
      sentiment_score: -0.74,
      upvotes: 21,
      vote_count: 21,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Ranade Road, Near Kabutar Khana Bus Stop, Dadar West',
      address: 'Ranade Road, Near Kabutar Khana Bus Stop, Dadar West',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0191,
      longitude: 72.8427,
      status: 'inspection_submitted',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-insp1',
      assigned_inspector_id: 'off-roads-insp1',
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 15 * hr).toISOString(),
      sla_deadline: new Date(now + 15 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 11 * hr).toISOString(),
      updated_at: new Date(now - 1 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/ranade_pothole_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/ranade_pothole_inspected.svg'],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1013-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/ranade_pothole_citizen.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0191,
          longitude: 72.8427,
          captured_at: new Date(now - 11 * hr).toISOString(),
          notes: 'Pothole measures roughly 1.5m wide right in front of bus stop.',
        },
        {
          id: 'prf-1013-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/ranade_pothole_inspected.svg',
          uploaded_by: 'user-inspector-roads-1',
          uploaded_by_name: 'Sneha Kulkarni',
          actor_role: 'inspection_officer',
          latitude: 19.0192,
          longitude: 72.8428,
          captured_at: new Date(now - 1 * hr).toISOString(),
          notes: 'Confirmed on site: 1.6m x 1.2m depression, depth 14cm. Requires ~200kg hot-mix asphalt and roller compaction. Area barricaded.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Citizen reported severe pothole at Ranade Road bus stop.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 11 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          remarks: 'Assigned to Inspection Officer Sneha Kulkarni.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 9 * hr).toISOString(),
        },
        {
          from_status: 'inspection_assigned',
          to_status: 'inspection_submitted',
          remarks: 'Site inspected and geotagged proof uploaded (15m from citizen pin). Confirmed 14cm asphalt cavity.',
          actor_role: 'inspection_officer',
          actor_name: 'Sneha Kulkarni',
          created_at: new Date(now - 1 * hr).toISOString(),
        },
      ],
    },

    // STAGE 5 -> Inspection Verified by Nodal -> Ready to Assign Field Team
    {
      id: 'cmp-2026-001014',
      complaint_number: 'SS-2026-001014',
      citizen_id: 'user-citizen-2',
      title: 'Damaged speed breaker reflectors and crumbled curb near Mahim Causeway',
      description: 'Broken asphalt speed breaker with protruding rebar strips near Mahim Causeway approach causing tire punctures.',
      category: 'Roads & Transport',
      sub_category: 'Speed Breaker / Road Furniture',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.92,
      ai_summary: 'Damaged speed breaker posing immediate vehicle damage hazard.',
      priority: 'medium',
      priority_score: 1.95,
      urgency_score: 3,
      sentiment_score: -0.51,
      upvotes: 9,
      vote_count: 9,
      upvoted_by: ['user-citizen-2'],
      is_public: true,
      location: 'Mahim Causeway South Approach, Mahim West',
      address: 'Mahim Causeway South Approach, Mahim West',
      ward: 'Ward 14 - Mahim',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400016',
      latitude: 19.0412,
      longitude: 72.8403,
      status: 'inspection_verified',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-insp2',
      assigned_inspector_id: 'off-roads-insp2',
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 36 * hr).toISOString(),
      sla_deadline: new Date(now + 36 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 18 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/mahim_speedbreaker_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/mahim_speedbreaker_inspected.svg'],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1014-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/mahim_speedbreaker_citizen.svg',
          uploaded_by: 'user-citizen-2',
          uploaded_by_name: 'Priya Sharma',
          actor_role: 'citizen',
          latitude: 19.0412,
          longitude: 72.8403,
          captured_at: new Date(now - 18 * hr).toISOString(),
          notes: 'Protruding iron pins on speed breaker.',
        },
        {
          id: 'prf-1014-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/mahim_speedbreaker_inspected.svg',
          uploaded_by: 'user-inspector-roads-2',
          uploaded_by_name: 'Rohan Patil',
          actor_role: 'inspection_officer',
          latitude: 19.0413,
          longitude: 72.8404,
          captured_at: new Date(now - 5 * hr).toISOString(),
          notes: 'Inspection confirmed: 3m rubberized rumble strip detached, bolts exposed. Needs replacement and reflective cat-eyes.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Grievance registered by citizen.',
          actor_role: 'citizen',
          actor_name: 'Priya Sharma',
          created_at: new Date(now - 18 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          remarks: 'Assigned to Inspection Officer Rohan Patil.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 14 * hr).toISOString(),
        },
        {
          from_status: 'inspection_assigned',
          to_status: 'inspection_submitted',
          remarks: 'Site inspection completed with geotagged evidence.',
          actor_role: 'inspection_officer',
          actor_name: 'Rohan Patil',
          created_at: new Date(now - 5 * hr).toISOString(),
        },
        {
          from_status: 'inspection_submitted',
          to_status: 'inspection_verified',
          remarks: 'Nodal Officer confirmed inspection proof matches citizen report. Ready for field team dispatch.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 2 * hr).toISOString(),
        },
      ],
    },

    // STAGE 6A -> Assigned ONLY to Team 1 (Suresh Jadhav — Dadar Pothole Squad) — Team 2 MUST NOT see this
    {
      id: 'cmp-2026-001015',
      complaint_number: 'SS-2026-001015',
      citizen_id: 'user-citizen-1',
      title: 'Dangerous pothole on Senapati Bapat Marg near Dadar station',
      description: 'Deep crater-like pothole on the southbound lane causing severe traffic disruption and risks to two-wheelers.',
      category: 'Roads & Transport',
      sub_category: 'Pothole Repair',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.96,
      ai_summary: 'High-severity road surface defect requiring immediate asphalt patching.',
      priority: 'high',
      priority_score: 2.39,
      urgency_score: 4,
      sentiment_score: -0.65,
      upvotes: 14,
      vote_count: 14,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Senapati Bapat Marg, Opp. Dadar Western Station, Dadar West',
      address: 'Senapati Bapat Marg, Opp. Dadar Western Station, Dadar West',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0178,
      longitude: 72.8478,
      status: 'team_assigned',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-tl1',
      assigned_inspector_id: 'off-roads-insp1',
      verification_inspector_id: 'off-roads-insp1',
      assigned_team_id: 'team-roads-1',
      deadline: new Date(now + 16 * hr).toISOString(),
      sla_deadline: new Date(now + 16 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 28 * hr).toISOString(),
      updated_at: new Date(now - 3 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/sbm_pothole_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/sbm_pothole_inspected.svg'],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1015-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/sbm_pothole_citizen.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0178,
          longitude: 72.8478,
          captured_at: new Date(now - 28 * hr).toISOString(),
          notes: 'Southbound lane right after Dadar bridge ramp.',
        },
        {
          id: 'prf-1015-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/sbm_pothole_inspected.svg',
          uploaded_by: 'user-inspector-roads-1',
          uploaded_by_name: 'Sneha Kulkarni',
          actor_role: 'inspection_officer',
          latitude: 19.0179,
          longitude: 72.8477,
          captured_at: new Date(now - 14 * hr).toISOString(),
          notes: 'Verified crater 1.8m x 1.1m. Needs milling and hot-mix bitumen fill.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint submitted with geotagged photo proof.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 28 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'inspection_assigned',
          remarks: 'Assigned to Sneha Kulkarni for initial inspection.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 24 * hr).toISOString(),
        },
        {
          from_status: 'inspection_assigned',
          to_status: 'inspection_submitted',
          remarks: 'Initial site inspection photo and dimensions uploaded.',
          actor_role: 'inspection_officer',
          actor_name: 'Sneha Kulkarni',
          created_at: new Date(now - 14 * hr).toISOString(),
        },
        {
          from_status: 'inspection_submitted',
          to_status: 'inspection_verified',
          remarks: 'Nodal Officer approved inspection proof.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 8 * hr).toISOString(),
        },
        {
          from_status: 'inspection_verified',
          to_status: 'team_assigned',
          remarks: 'Work order dispatched to Dadar Quick Response Pothole Squad (Team Lead: Suresh Jadhav).',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 3 * hr).toISOString(),
        },
      ],
    },

    // STAGE 6B -> Work In Progress ONLY for Team 2 (Deepak Pawar — Mahim Drain Squad) — Team 1 MUST NOT see this
    {
      id: 'cmp-2026-001016',
      complaint_number: 'SS-2026-001016',
      citizen_id: 'user-citizen-2',
      title: 'Missing storm drain grating outside Dadar TT Circle',
      description: 'Heavy iron stormwater drain grate was stolen/displaced outside Dadar TT Circle, leaving an open 2-foot trench along the bus lane.',
      category: 'Roads & Transport',
      sub_category: 'Drain Grate Replacement',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.91,
      ai_summary: 'Pedestrian and cyclist fall hazard from missing storm drain grate.',
      priority: 'high',
      priority_score: 2.34,
      urgency_score: 4,
      sentiment_score: -0.66,
      upvotes: 18,
      vote_count: 18,
      upvoted_by: ['user-citizen-2'],
      is_public: true,
      location: 'Dadar TT Circle, Dr. B. Ambedkar Road, Dadar East',
      address: 'Dadar TT Circle, Dr. B. Ambedkar Road, Dadar East',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400014',
      latitude: 19.0185,
      longitude: 72.8495,
      status: 'work_in_progress',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-tl2',
      assigned_inspector_id: 'off-roads-insp2',
      verification_inspector_id: 'off-roads-insp2',
      assigned_team_id: 'team-roads-2',
      deadline: new Date(now + 14 * hr).toISOString(),
      sla_deadline: new Date(now + 14 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 32 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/dadartt_drain_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/dadartt_drain_inspected.svg'],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1016-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/dadartt_drain_citizen.svg',
          uploaded_by: 'user-citizen-2',
          uploaded_by_name: 'Priya Sharma',
          actor_role: 'citizen',
          latitude: 19.0185,
          longitude: 72.8495,
          captured_at: new Date(now - 32 * hr).toISOString(),
          notes: 'Uncovered stormwater trench right beside pedestrian crossing.',
        },
        {
          id: 'prf-1016-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/dadartt_drain_inspected.svg',
          uploaded_by: 'user-inspector-roads-2',
          uploaded_by_name: 'Rohan Patil',
          actor_role: 'inspection_officer',
          latitude: 19.0186,
          longitude: 72.8494,
          captured_at: new Date(now - 18 * hr).toISOString(),
          notes: 'Verified missing 900x600mm ductile iron grate. Frame collar intact.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint logged by citizen.',
          actor_role: 'citizen',
          actor_name: 'Priya Sharma',
          created_at: new Date(now - 32 * hr).toISOString(),
        },
        {
          from_status: 'inspection_submitted',
          to_status: 'inspection_verified',
          remarks: 'Inspection proof verified by Nodal Officer.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 12 * hr).toISOString(),
        },
        {
          from_status: 'inspection_verified',
          to_status: 'team_assigned',
          remarks: 'Assigned to Mahim Footpath & Drain Squad (Team Lead: Deepak Pawar).',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 6 * hr).toISOString(),
        },
        {
          from_status: 'team_assigned',
          to_status: 'work_in_progress',
          remarks: 'Field crew arrived on site with replacement ductile iron frame and mortar.',
          actor_role: 'team_lead',
          actor_name: 'Deepak Pawar',
          created_at: new Date(now - 2 * hr).toISOString(),
        },
      ],
    },

    // STAGE 7 -> Post-Resolution Verification Assigned to Inspector 1 (Team 1 completed repair)
    {
      id: 'cmp-2026-001017',
      complaint_number: 'SS-2026-001017',
      citizen_id: 'user-citizen-1',
      title: 'Severe asphalt rutting near Tilak Bridge East Ramp',
      description: 'Heavy trucks created deep asphalt ruts along the Tilak Bridge eastbound exit ramp, causing motorcycles to skid during braking.',
      category: 'Roads & Transport',
      sub_category: 'Road Resurfacing',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.95,
      ai_summary: 'Roadway surface rutting on bridge approach requiring cold milling and resurfacing.',
      priority: 'high',
      priority_score: 2.41,
      urgency_score: 4,
      sentiment_score: -0.61,
      upvotes: 16,
      vote_count: 16,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Tilak Bridge East Ramp, Dadar East',
      address: 'Tilak Bridge East Ramp, Dadar East',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400014',
      latitude: 19.0172,
      longitude: 72.8452,
      status: 'verification_assigned',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-insp1',
      assigned_inspector_id: 'off-roads-insp1',
      verification_inspector_id: 'off-roads-insp1',
      assigned_team_id: 'team-roads-1',
      deadline: new Date(now + 10 * hr).toISOString(),
      sla_deadline: new Date(now + 10 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 44 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: 'Milled 12 sq.m damaged asphalt strip, applied tack coat, laid 50mm dense bituminous macadam, and compacted with 8-ton roller.',
      attachments: ['/api/media/proofs/citizen/tilak_bridge_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/tilak_bridge_inspected.svg'],
      resolution_proof: ['/api/media/proofs/resolution/tilak_bridge_repaired.svg'],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1017-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/tilak_bridge_citizen.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0172,
          longitude: 72.8452,
          captured_at: new Date(now - 44 * hr).toISOString(),
          notes: 'Deep wheel ruts near bridge exit lamp post #7.',
        },
        {
          id: 'prf-1017-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/tilak_bridge_inspected.svg',
          uploaded_by: 'user-inspector-roads-1',
          uploaded_by_name: 'Sneha Kulkarni',
          actor_role: 'inspection_officer',
          latitude: 19.0173,
          longitude: 72.8451,
          captured_at: new Date(now - 36 * hr).toISOString(),
          notes: 'Verified 12 sq.m rutted strip. Marked perimeter with yellow chalk.',
        },
        {
          id: 'prf-1017-res',
          stage: 'team_resolution',
          url: '/api/media/proofs/resolution/tilak_bridge_repaired.svg',
          uploaded_by: 'user-teamlead-roads-1',
          uploaded_by_name: 'Suresh Jadhav',
          actor_role: 'team_lead',
          latitude: 19.0172,
          longitude: 72.8453,
          captured_at: new Date(now - 2 * hr).toISOString(),
          notes: 'Milled 12 sq.m damaged asphalt strip, applied tack coat, laid 50mm DBM hot-mix, and compacted with 8-ton roller.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Grievance registered by citizen.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 44 * hr).toISOString(),
        },
        {
          from_status: 'inspection_submitted',
          to_status: 'inspection_verified',
          remarks: 'Initial inspection confirmed by Nodal Officer.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 30 * hr).toISOString(),
        },
        {
          from_status: 'team_assigned',
          to_status: 'work_in_progress',
          remarks: 'Dadar Quick Response Pothole Squad mobilized milling unit.',
          actor_role: 'team_lead',
          actor_name: 'Suresh Jadhav',
          created_at: new Date(now - 10 * hr).toISOString(),
        },
        {
          from_status: 'work_in_progress',
          to_status: 'verification_assigned',
          remarks: 'Team Lead Suresh Jadhav uploaded resolution proof & ATR. Routed to Sneha Kulkarni for post-repair site verification.',
          actor_role: 'team_lead',
          actor_name: 'Suresh Jadhav',
          created_at: new Date(now - 2 * hr).toISOString(),
        },
      ],
    },

    // STAGE 8 -> Post-Resolution Verification Submitted by Inspector 1 -> Waiting for Nodal Final 3-Way Proof Approval!
    {
      id: 'cmp-2026-001018',
      complaint_number: 'SS-2026-001018',
      citizen_id: 'user-citizen-1',
      title: 'Collapsed pedestrian zebra crossing curb at Prabhadevi Junction',
      description: 'Curb stones and tactile paving at the Prabhadevi Siddhivinayak signal crosswalk had crumbled, blocking wheelchair and senior citizen access.',
      category: 'Roads & Transport',
      sub_category: 'Footpath & Accessibility',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.94,
      ai_summary: 'Damaged accessible crosswalk curb at high-footfall temple junction.',
      priority: 'high',
      priority_score: 2.29,
      urgency_score: 4,
      sentiment_score: -0.58,
      upvotes: 24,
      vote_count: 24,
      upvoted_by: ['user-citizen-1', 'user-citizen-2'],
      is_public: true,
      location: 'Siddhivinayak Signal Crosswalk, SK Bole Road, Prabhadevi',
      address: 'Siddhivinayak Signal Crosswalk, SK Bole Road, Prabhadevi',
      ward: 'Ward 11 - Prabhadevi',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0169,
      longitude: 72.8305,
      status: 'verification_submitted',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      nodal_officer_id: 'off-roads-nodal',
      assigned_officer_id: 'off-roads-nodal',
      assigned_inspector_id: 'off-roads-insp1',
      verification_inspector_id: 'off-roads-insp1',
      assigned_team_id: 'team-roads-1',
      deadline: new Date(now + 6 * hr).toISOString(),
      sla_deadline: new Date(now + 6 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 60 * hr).toISOString(),
      updated_at: new Date(now - 1 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: 'Replaced 8 granite curb blocks, installed non-slip yellow tactile ramp tiles, and repainted thermoplastic zebra crossing.',
      verification_verdict: 'verified',
      attachments: ['/api/media/proofs/citizen/prabhadevi_curb_citizen.svg'],
      inspection_images: ['/api/media/proofs/inspection/prabhadevi_curb_inspected.svg'],
      resolution_proof: ['/api/media/proofs/resolution/prabhadevi_curb_repaired.svg'],
      verification_proof: ['/api/media/proofs/verification/prabhadevi_curb_verified.svg'],
      proof_records: [
        {
          id: 'prf-1018-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/prabhadevi_curb_citizen.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0169,
          longitude: 72.8305,
          captured_at: new Date(now - 60 * hr).toISOString(),
          notes: 'Broken curb blocks and missing tactile ramp at crosswalk.',
        },
        {
          id: 'prf-1018-insp',
          stage: 'initial_inspection',
          url: '/api/media/proofs/inspection/prabhadevi_curb_inspected.svg',
          uploaded_by: 'user-inspector-roads-1',
          uploaded_by_name: 'Sneha Kulkarni',
          actor_role: 'inspection_officer',
          latitude: 19.0169,
          longitude: 72.8306,
          captured_at: new Date(now - 48 * hr).toISOString(),
          notes: 'Confirmed 3.2m section of curb damaged; tactile ramp unusable.',
        },
        {
          id: 'prf-1018-res',
          stage: 'team_resolution',
          url: '/api/media/proofs/resolution/prabhadevi_curb_repaired.svg',
          uploaded_by: 'user-teamlead-roads-1',
          uploaded_by_name: 'Suresh Jadhav',
          actor_role: 'team_lead',
          latitude: 19.0168,
          longitude: 72.8305,
          captured_at: new Date(now - 8 * hr).toISOString(),
          notes: 'Replaced 8 granite curb blocks, installed non-slip tactile ramp tiles, and repainted zebra stripes.',
        },
        {
          id: 'prf-1018-ver',
          stage: 'final_verification',
          url: '/api/media/proofs/verification/prabhadevi_curb_verified.svg',
          uploaded_by: 'user-inspector-roads-1',
          uploaded_by_name: 'Sneha Kulkarni',
          actor_role: 'inspection_officer',
          latitude: 19.0169,
          longitude: 72.8305,
          captured_at: new Date(now - 1 * hr).toISOString(),
          notes: 'Post-repair site inspection PASSED. Ramp gradient meets accessibility norms, concrete cured cleanly, and crosswalk markings are crisp.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Citizen reported broken accessibility curb at Prabhadevi Junction.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 60 * hr).toISOString(),
        },
        {
          from_status: 'inspection_submitted',
          to_status: 'inspection_verified',
          remarks: 'Initial inspection verified by Nodal Officer.',
          actor_role: 'nodal_officer',
          actor_name: 'Amit Verma',
          created_at: new Date(now - 40 * hr).toISOString(),
        },
        {
          from_status: 'work_in_progress',
          to_status: 'verification_assigned',
          remarks: 'Team Lead Suresh Jadhav completed curb & tactile ramp restoration and uploaded proof.',
          actor_role: 'team_lead',
          actor_name: 'Suresh Jadhav',
          created_at: new Date(now - 8 * hr).toISOString(),
        },
        {
          from_status: 'verification_assigned',
          to_status: 'verification_submitted',
          remarks: 'Inspection Officer Sneha Kulkarni verified site resolution (PASS) with geotagged proof. Awaiting Nodal Officer final sign-off.',
          actor_role: 'inspection_officer',
          actor_name: 'Sneha Kulkarni',
          created_at: new Date(now - 1 * hr).toISOString(),
        },
      ],
    },

    // Water Supply Department Complaint (Proves department isolation for Roads Nodal Officer)
    {
      id: 'cmp-2026-001002',
      complaint_number: 'SS-2026-001002',
      citizen_id: 'user-citizen-2',
      title: 'Contaminated muddy drinking water supply in Shivaji Nagar',
      description: 'Tap water has been brown and emitting foul odor for 48 hours. Multiple children report gastrointestinal issues.',
      category: 'Water Supply',
      sub_category: 'Contamination / Quality',
      ai_category: 'Water Supply',
      ai_confidence: 0.98,
      ai_summary: 'Urgent public health risk regarding municipal drinking water contamination.',
      priority: 'critical',
      priority_score: 2.82,
      urgency_score: 5,
      sentiment_score: -0.89,
      upvotes: 28,
      vote_count: 28,
      upvoted_by: ['user-citizen-2'],
      is_public: true,
      location: 'Building 4, Shivaji Nagar, Veera Desai Road, Andheri West',
      address: 'Building 4, Shivaji Nagar, Veera Desai Road, Andheri West',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
      latitude: 19.129,
      longitude: 72.836,
      status: 'submitted',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      nodal_officer_id: 'off-water-nodal',
      assigned_officer_id: 'off-water-nodal',
      assigned_inspector_id: null,
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 4 * hr).toISOString(),
      sla_deadline: new Date(now + 4 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 8 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/citizen/water_contamination_andheri.svg'],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1002-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/water_contamination_andheri.svg',
          uploaded_by: 'user-citizen-2',
          uploaded_by_name: 'Priya Sharma',
          actor_role: 'citizen',
          latitude: 19.129,
          longitude: 72.836,
          captured_at: new Date(now - 8 * hr).toISOString(),
          notes: 'Sample glass of turbid tap water collected at 7:00 AM.',
        },
      ],
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Urgent water contamination grievance lodged. AI routed to Water Supply.',
          actor_role: 'citizen',
          actor_name: 'Priya Sharma',
          created_at: new Date(now - 8 * hr).toISOString(),
        },
      ],
    },

    // Resolved Electricity Complaint (Citizen Feedback & Closure Demo)
    {
      id: 'cmp-2026-001003',
      complaint_number: 'SS-2026-001003',
      citizen_id: 'user-citizen-1',
      title: 'Non-functional LED street light pole #42',
      description: 'Street light pole #42 has been completely dark for over two weeks, making the pedestrian crosswalk unsafe at night.',
      category: 'Electricity',
      sub_category: 'Street Light',
      ai_category: 'Electricity',
      ai_confidence: 0.92,
      ai_summary: 'Civic safety hazard due to prolonged streetlight failure.',
      priority: 'medium',
      priority_score: 1.65,
      urgency_score: 2,
      sentiment_score: -0.35,
      upvotes: 6,
      vote_count: 6,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Hill Road, Near Mehboob Studio, Bandra West',
      address: 'Hill Road, Near Mehboob Studio, Bandra West',
      ward: 'Ward 5 - Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400050',
      latitude: 19.0544,
      longitude: 72.8286,
      status: 'resolved',
      department_id: deptElecId,
      department_name: 'Electricity',
      nodal_officer_id: 'off-elec-nodal',
      assigned_officer_id: 'off-elec-nodal',
      assigned_inspector_id: null,
      verification_inspector_id: null,
      assigned_team_id: 'team-elec-1',
      deadline: new Date(now - 10 * hr).toISOString(),
      sla_deadline: new Date(now - 10 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 4 * day).toISOString(),
      updated_at: new Date(now - 12 * hr).toISOString(),
      resolved_at: new Date(now - 12 * hr).toISOString(),
      resolution_remarks: 'Replaced faulty LED fixture and damaged circuit breaker fuse. Verified luminous output during evening audit.',
      attachments: ['/api/media/proofs/citizen/streetlight_before.svg'],
      inspection_images: ['/api/media/proofs/inspection/streetlight_inspected.svg'],
      resolution_proof: ['/api/media/proofs/resolution/streetlight_after.svg'],
      verification_proof: ['/api/media/proofs/verification/streetlight_verified.svg'],
      proof_records: [
        {
          id: 'prf-1003-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/streetlight_before.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0544,
          longitude: 72.8286,
          captured_at: new Date(now - 4 * day).toISOString(),
          notes: 'Pole #42 dark at 8:30 PM.',
        },
        {
          id: 'prf-1003-res',
          stage: 'team_resolution',
          url: '/api/media/proofs/resolution/streetlight_after.svg',
          uploaded_by: 'user-teamlead-elec-1',
          uploaded_by_name: 'Anil Sawant',
          actor_role: 'team_lead',
          latitude: 19.0544,
          longitude: 72.8286,
          captured_at: new Date(now - 14 * hr).toISOString(),
          notes: 'Installed 90W LED luminaire and replaced MCB.',
        },
        {
          id: 'prf-1003-ver',
          stage: 'final_verification',
          url: '/api/media/proofs/verification/streetlight_verified.svg',
          uploaded_by: 'user-nodal-elec',
          uploaded_by_name: 'Ramesh Gupta',
          actor_role: 'nodal_officer',
          latitude: 19.0544,
          longitude: 72.8287,
          captured_at: new Date(now - 12 * hr).toISOString(),
          notes: 'Verified active post-dusk. Approved and notified citizen.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint logged by citizen.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 4 * day).toISOString(),
        },
        {
          from_status: 'work_in_progress',
          to_status: 'verification_submitted',
          remarks: 'Electrical maintenance crew replaced fixture; site check passed.',
          actor_role: 'team_lead',
          actor_name: 'Anil Sawant',
          created_at: new Date(now - 14 * hr).toISOString(),
        },
        {
          from_status: 'verification_submitted',
          to_status: 'resolved',
          remarks: 'Nodal Officer approved final resolution and notified citizen.',
          actor_role: 'nodal_officer',
          actor_name: 'Ramesh Gupta',
          created_at: new Date(now - 12 * hr).toISOString(),
        },
      ],
    },

    // Appealed L1 Complaint (Supervisor Desk Demo)
    {
      id: 'cmp-2026-001004',
      complaint_number: 'SS-2026-001004',
      citizen_id: 'user-citizen-1',
      title: 'Overflowing community garbage bin near Matunga Market',
      description: 'Municipal waste compactor has not collected garbage for 4 days. Foul smell and stray dogs creating sanitation hazard.',
      category: 'Sanitation & Waste',
      sub_category: 'Garbage Collection',
      ai_category: 'Sanitation & Waste',
      ai_confidence: 0.94,
      ai_summary: 'Recurring municipal solid waste accumulation near high-footfall market.',
      priority: 'high',
      priority_score: 2.15,
      urgency_score: 4,
      sentiment_score: -0.71,
      upvotes: 19,
      vote_count: 19,
      upvoted_by: ['user-citizen-1'],
      is_public: true,
      location: 'Matunga Central Market Lane, Matunga East',
      address: 'Matunga Central Market Lane, Matunga East',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400019',
      latitude: 19.0272,
      longitude: 72.8553,
      status: 'appealed_l1',
      appeal_level: 1,
      appeal_remarks: 'Department marked resolved without clearing the back-alley waste pile which is still overflowing.',
      department_id: deptSanitId,
      department_name: 'Sanitation & Waste',
      nodal_officer_id: null,
      assigned_officer_id: 'off-roads-nodal',
      assigned_inspector_id: null,
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: new Date(now + 10 * hr).toISOString(),
      sla_deadline: new Date(now + 10 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 5 * day).toISOString(),
      updated_at: new Date(now - 5 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: 'Initial bin clearing performed; appeal filed for alley cleanup.',
      attachments: ['/api/media/proofs/citizen/matunga_garbage_citizen.svg'],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [
        {
          id: 'prf-1004-cit',
          stage: 'citizen_proof',
          url: '/api/media/proofs/citizen/matunga_garbage_citizen.svg',
          uploaded_by: 'user-citizen-1',
          uploaded_by_name: 'Rajesh Kumar',
          actor_role: 'citizen',
          latitude: 19.0272,
          longitude: 72.8553,
          captured_at: new Date(now - 5 * day).toISOString(),
          notes: 'Overflowing bin and adjacent lane debris.',
        },
      ],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Sanitation grievance filed.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 5 * day).toISOString(),
        },
        {
          from_status: 'resolved',
          to_status: 'appealed_l1',
          remarks: 'Citizen filed L1 Appeal: Department marked resolved without clearing the back-alley waste pile.',
          actor_role: 'citizen',
          actor_name: 'Rajesh Kumar',
          created_at: new Date(now - 5 * hr).toISOString(),
        },
      ],
    },
  ];

  const notifications = [
    {
      id: 'notif-1',
      user_id: 'user-citizen-1',
      event_type: 'status_resolution',
      complaint_id: 'cmp-2026-001003',
      complaint_number: 'SS-2026-001003',
      title: 'Grievance SS-2026-001003 Resolved',
      body: 'Electricity department resolved your streetlight complaint on Hill Road. Please review and submit feedback.',
      is_read: false,
      created_at: new Date(now - 12 * hr).toISOString(),
    },
    {
      id: 'notif-2',
      user_id: 'user-nodal-roads',
      event_type: 'status_resolution',
      complaint_id: 'cmp-2026-001018',
      complaint_number: 'SS-2026-001018',
      title: 'Final Approval Pending (SS-2026-001018)',
      body: 'Inspector Sneha Kulkarni verified repair at Prabhadevi Junction. Compare proofs to approve and notify citizen.',
      is_read: false,
      created_at: new Date(now - 1 * hr).toISOString(),
    },
    {
      id: 'notif-3',
      user_id: 'user-nodal-roads',
      event_type: 'status_resolution',
      complaint_id: 'cmp-2026-001013',
      complaint_number: 'SS-2026-001013',
      title: 'Inspection Proof Submitted (SS-2026-001013)',
      body: 'Sneha Kulkarni uploaded initial inspection photos for Ranade Road pothole. Review side-by-side.',
      is_read: false,
      created_at: new Date(now - 1 * hr).toISOString(),
    },
    {
      id: 'notif-4',
      user_id: 'user-inspector-roads-1',
      event_type: 'assignment',
      complaint_id: 'cmp-2026-001017',
      complaint_number: 'SS-2026-001017',
      title: 'Post-Repair Verification Assigned (SS-2026-001017)',
      body: 'Dadar Pothole Squad completed resurfacing at Tilak Bridge East Ramp. Visit site and verify resolution.',
      is_read: false,
      created_at: new Date(now - 2 * hr).toISOString(),
    },
    {
      id: 'notif-5',
      user_id: 'user-inspector-roads-2',
      event_type: 'assignment',
      complaint_id: 'cmp-2026-001012',
      complaint_number: 'SS-2026-001012',
      title: 'New Site Inspection Assigned (SS-2026-001012)',
      body: 'Nodal Officer assigned you to inspect broken footpath drain slabs on Lady Jamshedji Road, Mahim.',
      is_read: false,
      created_at: new Date(now - 3 * hr).toISOString(),
    },
    {
      id: 'notif-6',
      user_id: 'user-teamlead-roads-1',
      event_type: 'assignment',
      complaint_id: 'cmp-2026-001015',
      complaint_number: 'SS-2026-001015',
      title: 'New Work Order Dispatched (SS-2026-001015)',
      body: 'Nodal Officer assigned Senapati Bapat Marg pothole repair to Dadar Quick Response Pothole Squad.',
      is_read: false,
      created_at: new Date(now - 3 * hr).toISOString(),
    },
    {
      id: 'notif-7',
      user_id: 'user-admin-1',
      event_type: 'sla_escalation',
      complaint_id: 'cmp-2026-001002',
      complaint_number: 'SS-2026-001002',
      title: 'SLA Watch Alert: Ward 8 Water Supply',
      body: 'Critical complaint SS-2026-001002 is within 4 hours of its statutory SLA deadline.',
      is_read: false,
      created_at: new Date(now - 2 * hr).toISOString(),
    },
    {
      id: 'notif-8',
      user_id: 'user-citizen-1',
      event_type: 'appeal_adjudication',
      complaint_id: 'cmp-2026-001004',
      complaint_number: 'SS-2026-001004',
      title: 'Level-1 Appeal Logged (SS-2026-001004)',
      body: 'Your Level-1 Appeal on garbage collection has been escalated to the Appellate Supervisor for review.',
      is_read: false,
      created_at: new Date(now - 6 * hr).toISOString(),
    },
  ];

  // Seed per-user channel preferences & matching delivery logs for initial notifications
  const notificationPreferences = new Map();
  const deliveryLogs = [];

  for (const n of notifications) {
    const recipient = users.find((u) => u.id === n.user_id);
    const prefs = getDefaultNotificationPreferences(recipient);
    if (recipient) {
      notificationPreferences.set(recipient.id, prefs);
    }
    const payload = formatNotificationPayload({
      eventType: n.event_type,
      title: n.title,
      body: n.body,
      complaintNumber: n.complaint_number,
      recipientName: recipient?.name,
    });
    const email = prefs.gmail_address || recipient?.email || '';
    const phone = prefs.whatsapp_phone || normalizeWhatsAppPhone(recipient?.phone || '');
    const waUrl = phone ? buildWhatsAppFallbackUrl(phone, payload.whatsappText) : null;

    n.recipient_email = email || null;
    n.recipient_phone = phone || null;
    n.gmail_status = email ? 'queued' : 'disabled';
    n.whatsapp_status = phone ? 'fallback_ready' : 'disabled';
    n.whatsapp_fallback_url = waUrl;

    if (email) {
      const gmailLogId = `dlog-gmail-${n.id}`;
      n.gmail_log_id = gmailLogId;
      deliveryLogs.push({
        id: gmailLogId,
        notification_id: n.id,
        user_id: n.user_id,
        recipient_name: recipient?.name || 'User',
        complaint_id: n.complaint_id || null,
        complaint_number: n.complaint_number || null,
        event_type: n.event_type,
        channel: 'gmail',
        recipient: email,
        subject: payload.subject,
        message_preview: n.body,
        text_body: payload.textBody,
        html_body: payload.htmlBody,
        status: 'queued',
        mode: 'gmail_api',
        provider_message_id: null,
        fallback_url: null,
        error_message: null,
        created_at: n.created_at,
        dispatched_at: null,
      });
    }

    if (phone) {
      const waLogId = `dlog-wa-${n.id}`;
      n.whatsapp_log_id = waLogId;
      deliveryLogs.push({
        id: waLogId,
        notification_id: n.id,
        user_id: n.user_id,
        recipient_name: recipient?.name || 'User',
        complaint_id: n.complaint_id || null,
        complaint_number: n.complaint_number || null,
        event_type: n.event_type,
        channel: 'whatsapp',
        recipient: phone,
        subject: n.title,
        message_preview: payload.whatsappText,
        text_body: payload.whatsappText,
        html_body: null,
        status: 'fallback_ready',
        mode: isMetaWhatsAppConfigured() ? 'cloud_api' : 'fallback',
        provider_message_id: null,
        fallback_url: waUrl,
        error_message: null,
        created_at: n.created_at,
        dispatched_at: null,
      });
    }
  }

  const mappings = [
    { id: 'map-1', category: 'Roads & Transport', department_id: deptRoadsId },
    { id: 'map-2', category: 'Water Supply', department_id: deptWaterId },
    { id: 'map-3', category: 'Electricity', department_id: deptElecId },
    { id: 'map-4', category: 'Sanitation & Waste', department_id: deptSanitId },
    { id: 'map-5', category: 'Health & Safety', department_id: deptHealthId },
    { id: 'map-6', category: 'General', department_id: deptRoadsId },
  ];

  const slaRules = [
    { id: 'sla-1', category: null, priority: 'Critical', resolution_hours: 72, escalation_hours: 48 },
    { id: 'sla-2', category: null, priority: 'High', resolution_hours: 120, escalation_hours: 72 },
    { id: 'sla-3', category: null, priority: 'Medium', resolution_hours: 168, escalation_hours: 120 },
    { id: 'sla-4', category: null, priority: 'Low', resolution_hours: 504, escalation_hours: 360 },
    { id: 'sla-5', category: 'Health & Safety', priority: null, resolution_hours: 72, escalation_hours: 48 },
  ];

  const auditLogs = [
    {
      id: 'audit-1',
      action: 'complaint_created',
      entity_type: 'complaint',
      entity_id: 'cmp-2026-001010',
      actor_id: 'user-citizen-1',
      actor_role: 'citizen',
      details: { category: 'Roads & Transport', priority: 'high' },
      created_at: new Date(now - 2 * hr).toISOString(),
    },
    {
      id: 'audit-2',
      action: 'verification_submitted',
      entity_type: 'complaint',
      entity_id: 'cmp-2026-001018',
      actor_id: 'user-inspector-roads-1',
      actor_role: 'inspection_officer',
      details: { verdict: 'verified', distance_meters: 4 },
      created_at: new Date(now - 1 * hr).toISOString(),
    },
  ];

  return {
    departments,
    teams,
    users,
    officers,
    complaints,
    notifications,
    notificationPreferences,
    deliveryLogs,
    mappings,
    slaRules,
    auditLogs,
    media: new Map(), // key -> { buffer: Buffer, mimeType: string }
    tokens: new Map(), // token -> userId
    overrideCount: 2,
    acceptedCount: 22,
    inferenceCount: 164,
    seq: 1019,
  };
}

export function getStore() {
  if (!globalThis.__samadhanStoreV2) {
    globalThis.__samadhanStoreV2 = createInitialStore();
  }
  return globalThis.__samadhanStoreV2;
}

export function sanitizeUser(u) {
  if (!u) return null;
  const { password: _password, ...rest } = u;
  return rest;
}

export function getAuthUser(request) {
  const store = getStore();
  const authHeader = request.headers.get('authorization') || '';
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : queryToken || '';

  if (!token) return null;

  const mappedUserId = store.tokens.get(token);
  if (mappedUserId) {
    return store.users.find((u) => u.id === mappedUserId) || null;
  }
  if (token.startsWith('samadhan-tok-')) {
    const uid = token.replace('samadhan-tok-', '');
    return store.users.find((u) => u.id === uid) || null;
  }
  return null;
}

export function issueToken(user) {
  const store = getStore();
  const token = `samadhan-tok-${user.id}`;
  store.tokens.set(token, user.id);
  return token;
}

export function getOfficerForUser(user, store) {
  if (!user) return null;
  if (user.officer_id) {
    const byId = store.officers.find((o) => o.id === user.officer_id);
    if (byId) return byId;
  }
  return store.officers.find((o) => o.user_id === user.id || o.email === user.email) || null;
}

export function getTeamForUser(user, store) {
  if (!user) return null;
  if (user.team_id) {
    const byId = store.teams.find((t) => t.id === user.team_id);
    if (byId) return byId;
  }
  const officer = getOfficerForUser(user, store);
  if (officer?.team_id) {
    const byOffTeam = store.teams.find((t) => t.id === officer.team_id);
    if (byOffTeam) return byOffTeam;
  }
  return store.teams.find((t) => t.team_lead_user_id === user.id || (officer && t.team_lead_officer_id === officer.id)) || null;
}

// Strict server-side RBAC + Task Isolation guard
export function canUserAccessComplaint(user, complaint, store) {
  if (!user || !complaint) return false;
  if (['admin', 'super_admin', 'supervisor'].includes(user.role)) return true;

  if (user.role === 'citizen') {
    return complaint.citizen_id === user.id || complaint.is_public !== false;
  }

  if (user.role === 'nodal_officer' || user.role === 'officer') {
    if (!user.department_id) return false;
    return complaint.department_id === user.department_id;
  }

  if (user.role === 'inspection_officer') {
    const off = getOfficerForUser(user, store);
    if (!off) return false;
    return (
      complaint.assigned_inspector_id === off.id ||
      complaint.verification_inspector_id === off.id
    );
  }

  if (user.role === 'team_lead') {
    const team = getTeamForUser(user, store);
    if (!team) return false;
    return complaint.assigned_team_id === team.id;
  }

  return false;
}

export function getUserNotificationPreferences(store, userId) {
  if (!store.notificationPreferences) {
    store.notificationPreferences = new Map();
  }
  const existing = store.notificationPreferences.get(userId);
  if (existing) return existing;

  const user = store.users.find((u) => u.id === userId) || null;
  const defaults = getDefaultNotificationPreferences(user);
  store.notificationPreferences.set(userId, defaults);
  return defaults;
}

export function updateUserNotificationPreferences(store, userId, patch = {}) {
  const current = getUserNotificationPreferences(store, userId);
  const next = {
    ...current,
    events: { ...current.events },
  };

  if (typeof patch.gmail_enabled === 'boolean') {
    next.gmail_enabled = patch.gmail_enabled;
  }
  if (typeof patch.whatsapp_enabled === 'boolean') {
    next.whatsapp_enabled = patch.whatsapp_enabled;
  }

  if (patch.gmail_address !== undefined) {
    const trimmed = String(patch.gmail_address || '').trim();
    if (trimmed && !isValidEmail(trimmed)) {
      return { error: 'Please enter a valid Gmail or email address.' };
    }
    next.gmail_address = trimmed;
  }

  if (patch.whatsapp_phone !== undefined) {
    const raw = String(patch.whatsapp_phone || '').trim();
    if (raw) {
      const normalized = normalizeWhatsAppPhone(raw);
      if (!normalized) {
        return { error: 'Enter a valid WhatsApp phone number with country code (10–15 digits).' };
      }
      next.whatsapp_phone = normalized;
    } else {
      next.whatsapp_phone = '';
    }
  }

  if (patch.events && typeof patch.events === 'object') {
    for (const key of VALID_EVENT_KEYS) {
      if (patch.events[key] && typeof patch.events[key] === 'object') {
        const currEvt = next.events[key] || { gmail: true, whatsapp: true };
        next.events[key] = {
          gmail: typeof patch.events[key].gmail === 'boolean' ? patch.events[key].gmail : currEvt.gmail,
          whatsapp: typeof patch.events[key].whatsapp === 'boolean' ? patch.events[key].whatsapp : currEvt.whatsapp,
        };
      }
    }
  }

  next.updated_at = new Date().toISOString();
  store.notificationPreferences.set(userId, next);
  return { preferences: next };
}

export function pushNotification(store, userId, title, body, options = {}) {
  if (!userId) return null;
  if (!store.deliveryLogs) store.deliveryLogs = [];

  const recipient = store.users.find((u) => u.id === userId) || null;
  const prefs = getUserNotificationPreferences(store, userId);
  const eventType = options.eventType || inferEventTypeFromTitle(title);
  const complaintId = options.complaintId || null;
  const complaintNumber = options.complaintNumber || null;
  const nowIso = new Date().toISOString();
  const notifId = makeId('notif');

  const eventSetting = prefs.events?.[eventType] || { gmail: true, whatsapp: true };
  const payload = formatNotificationPayload({
    eventType,
    title,
    body,
    complaintNumber,
    recipientName: recipient?.name,
  });

  const targetEmail = prefs.gmail_address || recipient?.email || '';
  const targetPhone = prefs.whatsapp_phone || normalizeWhatsAppPhone(recipient?.phone || '');

  const wantGmail = Boolean(prefs.gmail_enabled && eventSetting.gmail && isValidEmail(targetEmail));
  const wantWhatsApp = Boolean(prefs.whatsapp_enabled && eventSetting.whatsapp && targetPhone);
  const waFallbackUrl = targetPhone ? buildWhatsAppFallbackUrl(targetPhone, payload.whatsappText) : null;

  const notif = {
    id: notifId,
    user_id: userId,
    event_type: eventType,
    complaint_id: complaintId,
    complaint_number: complaintNumber,
    title,
    body,
    is_read: false,
    recipient_email: targetEmail || null,
    recipient_phone: targetPhone || null,
    gmail_status: wantGmail ? 'queued' : 'disabled',
    whatsapp_status: wantWhatsApp ? (isMetaWhatsAppConfigured() ? 'sending' : 'fallback_ready') : 'disabled',
    whatsapp_fallback_url: wantWhatsApp ? waFallbackUrl : null,
    gmail_log_id: null,
    whatsapp_log_id: null,
    created_at: nowIso,
  };

  if (wantGmail) {
    const gmailLog = {
      id: makeId('dlog'),
      notification_id: notifId,
      user_id: userId,
      recipient_name: recipient?.name || 'User',
      complaint_id: complaintId,
      complaint_number: complaintNumber,
      event_type: eventType,
      channel: 'gmail',
      recipient: targetEmail,
      subject: payload.subject,
      message_preview: body,
      text_body: payload.textBody,
      html_body: payload.htmlBody,
      status: 'queued',
      mode: 'gmail_api',
      provider_message_id: null,
      fallback_url: null,
      error_message: null,
      created_at: nowIso,
      dispatched_at: null,
    };
    store.deliveryLogs.unshift(gmailLog);
    notif.gmail_log_id = gmailLog.id;
  }

  if (wantWhatsApp) {
    const waLog = {
      id: makeId('dlog'),
      notification_id: notifId,
      user_id: userId,
      recipient_name: recipient?.name || 'User',
      complaint_id: complaintId,
      complaint_number: complaintNumber,
      event_type: eventType,
      channel: 'whatsapp',
      recipient: targetPhone,
      subject: title,
      message_preview: payload.whatsappText,
      text_body: payload.whatsappText,
      html_body: null,
      status: isMetaWhatsAppConfigured() ? 'sending' : 'fallback_ready',
      mode: isMetaWhatsAppConfigured() ? 'cloud_api' : 'fallback',
      provider_message_id: null,
      fallback_url: waFallbackUrl,
      error_message: null,
      created_at: nowIso,
      dispatched_at: null,
    };
    store.deliveryLogs.unshift(waLog);
    notif.whatsapp_log_id = waLog.id;

    // Fire-and-forget Meta Cloud API dispatch when server credentials are configured
    if (isMetaWhatsAppConfigured()) {
      dispatchMetaWhatsAppMessage({ toPhone: targetPhone, bodyText: payload.whatsappText })
        .then((result) => {
          waLog.status = result.status;
          waLog.mode = result.mode;
          waLog.provider_message_id = result.providerMessageId;
          waLog.error_message = result.error;
          waLog.dispatched_at = result.ok ? new Date().toISOString() : null;
          notif.whatsapp_status = result.status;
        })
        .catch((err) => {
          waLog.status = 'failed';
          waLog.error_message = err?.message || 'WhatsApp dispatch failed';
          notif.whatsapp_status = 'failed';
        });
    }
  }

  store.notifications.unshift(notif);
  return notif;
}

export function pushAudit(store, action, entityId, user, details = {}) {
  store.auditLogs.unshift({
    id: makeId('audit'),
    action,
    entity_type: 'complaint',
    entity_id: entityId,
    actor_id: user?.id || 'system',
    actor_role: user?.role || 'system',
    details,
    created_at: new Date().toISOString(),
  });
}

export function classifyText(text = '') {
  const store = getStore();
  store.inferenceCount += 1;
  const lower = String(text).toLowerCase();

  let category = 'General';
  let confidence = 0.84;

  if (/(pothole|road|footpath|traffic|bridge|signal|highway|asphalt|street\s*repair|curb|manhole|speed\s*breaker|drain\s*cover)/.test(lower)) {
    category = 'Roads & Transport';
    confidence = 0.95;
  } else if (/(water|pipe|leak|sewage|drain|tap|muddy|contamination|supply)/.test(lower)) {
    category = 'Water Supply';
    confidence = 0.96;
  } else if (/(electric|power|light|pole|transformer|outage|voltage|wire|blackout)/.test(lower)) {
    category = 'Electricity';
    confidence = 0.93;
  } else if (/(garbage|trash|waste|sanit|bin|sweep|dump|smell|clean|litter)/.test(lower)) {
    category = 'Sanitation & Waste';
    confidence = 0.94;
  } else if (/(health|mosquito|dengue|hospital|food|clinic|hazard|toxic|disease|fever)/.test(lower)) {
    category = 'Health & Safety';
    confidence = 0.92;
  }

  let priority = 'Medium';
  let urgency = 3;
  let severity = 3;
  if (/(urgent|emergency|critical|accident|contaminated|children|hospital|fire|live wire|collapse|severe|danger)/.test(lower)) {
    priority = 'High';
    urgency = 5;
    severity = 4;
  } else if (/(broken|overflow|dark|blocked|deep|leak|burst|days|weeks)/.test(lower)) {
    priority = 'High';
    urgency = 4;
    severity = 4;
  } else if (/(minor|small|request|suggestion)/.test(lower)) {
    priority = 'Low';
    urgency = 2;
    severity = 2;
  }

  const dept = store.departments.find((d) => d.name === category) || store.departments[0];
  return {
    category,
    confidence,
    priority,
    urgency,
    severity,
    department: dept?.name || 'Roads & Transport',
    department_id: dept?.id,
  };
}

export function mapComplaintToTask(complaint, store) {
  const citizen = store.users.find((u) => u.id === complaint.citizen_id);
  const statusMap = {
    submitted: 'Pending',
    verified: 'Pending',
    assigned: 'Assigned',
    inspection_assigned: 'Assigned',
    inspection_submitted: 'In Progress',
    inspection_rework: 'In Progress',
    inspection_verified: 'Assigned',
    team_assigned: 'Assigned',
    work_in_progress: 'In Progress',
    in_progress: 'In Progress',
    resolution_submitted: 'In Progress',
    verification_assigned: 'In Progress',
    verification_submitted: 'In Progress',
    redressal_rework: 'In Progress',
    resolved: 'Completed',
    closed: 'Completed',
    rejected: 'Rejected',
    appealed_l1: 'appealed_l1',
    appealed_l2: 'appealed_l2',
    appealed: 'appealed_l1',
    escalated: 'escalated',
    reopened: 'In Progress',
  };

  return {
    id: complaint.id,
    complaint_id: complaint.id,
    complaint_number: complaint.complaint_number,
    title: complaint.title,
    description: complaint.description,
    complaint_title: complaint.title,
    complaint_description: complaint.description,
    complaint_location: complaint.location || complaint.address,
    complaint_priority: complaint.priority,
    priority: complaint.priority,
    category: complaint.category,
    department_id: complaint.department_id,
    department_name: complaint.department_name || complaint.category,
    status: statusMap[complaint.status] || complaint.status,
    raw_status: complaint.status,
    notes: complaint.resolution_remarks || complaint.status_history?.[complaint.status_history.length - 1]?.remarks || '',
    appeal_remarks: complaint.appeal_remarks || null,
    appeal_level: complaint.appeal_level || null,
    attachments: complaint.attachments || [],
    inspection_images: complaint.inspection_images || [],
    proof_images: complaint.resolution_proof || [],
    verification_proof: complaint.verification_proof || [],
    deadline: complaint.deadline,
    sla_deadline: complaint.sla_deadline,
    sla_breached: Boolean(complaint.sla_breached),
    created_at: complaint.created_at,
    completed_at: complaint.resolved_at,
    resolved_at: complaint.resolved_at,
    ward: complaint.ward,
    citizen: citizen ? { full_name: citizen.name, name: citizen.name, email: citizen.email, phone: citizen.phone } : null,
  };
}

export function buildComplaintDetail(complaint, store) {
  const citizen = store.users.find((u) => u.id === complaint.citizen_id);
  const dept = store.departments.find((d) => d.id === complaint.department_id);
  const nodalOfficer = store.officers.find((o) => o.id === complaint.nodal_officer_id);
  const inspector = store.officers.find((o) => o.id === complaint.assigned_inspector_id);
  const verifier = store.officers.find((o) => o.id === complaint.verification_inspector_id);
  const team = store.teams.find((t) => t.id === complaint.assigned_team_id);
  const task = mapComplaintToTask(complaint, store);

  const enrichedProofs = (complaint.proof_records || []).map((p) => ({
    ...p,
    distance_meters:
      p.stage === 'citizen_proof'
        ? 0
        : computeDistanceMeters(complaint.latitude, complaint.longitude, p.latitude, p.longitude),
  }));

  return {
    ...complaint,
    department_name: dept?.name || complaint.department_name || complaint.category,
    nodal_officer_name: nodalOfficer?.name || null,
    assigned_inspector_name: inspector?.name || null,
    assigned_inspector_employee_id: inspector?.employee_id || null,
    verification_inspector_name: verifier?.name || inspector?.name || null,
    assigned_team_name: team?.name || null,
    assigned_team_code: team?.code || null,
    assigned_team_lead_name: team?.team_lead_name || null,
    proof_records: enrichedProofs,
    citizen: citizen
      ? {
          id: citizen.id,
          name: citizen.name,
          full_name: citizen.name,
          email: citizen.email,
          phone: citizen.phone,
        }
      : null,
    tasks: [task],
    status_history: complaint.status_history || [],
  };
}

export function generatePlaceholderSvg(keyPath) {
  const escapeXml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const raw = String(keyPath || 'Field Evidence Photo');
  const lower = raw.toLowerCase();
  const safeName = raw.split('/').pop().replace(/\.svg$/i, '').replace(/[_-]+/g, ' ').replace(/[<>&"']/g, '');

  let stageLabel = 'CITIZEN PROOF';
  let accent = '#FF9933';
  let bgStart = '#14294A';
  let bgEnd = '#214275';
  let detailLine = 'Geotagged Initial Civic Report • Mumbai Municipal Ward';

  if (lower.includes('inspection')) {
    stageLabel = 'INITIAL SITE INSPECTION';
    accent = '#00A3E0';
    bgStart = '#0F2E44';
    bgEnd = '#164E63';
    detailLine = 'Field Inspector Verified Dimensions & Site Hazard';
  } else if (lower.includes('resolution') || lower.includes('repaired') || lower.includes('after')) {
    stageLabel = 'TEAM RESOLUTION PROOF';
    accent = '#22C55E';
    bgStart = '#10342A';
    bgEnd = '#14532D';
    detailLine = 'Remediation Completed by Assigned Municipal Field Squad';
  } else if (lower.includes('verification') || lower.includes('verified')) {
    stageLabel = 'POST-REPAIR SITE VERIFICATION';
    accent = '#10B981';
    bgStart = '#0B2F26';
    bgEnd = '#065F46';
    detailLine = 'Independent Inspector Sign-Off • Quality Confirmed';
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgStart}"/>
      <stop offset="100%" stop-color="${bgEnd}"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="640" height="400" fill="url(#bg)"/>
  <rect width="640" height="400" fill="url(#grid)"/>
  <rect x="24" y="24" width="592" height="352" rx="10" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.7"/>
  <rect x="44" y="44" width="236" height="28" rx="4" fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-width="1"/>
  <text x="58" y="63" fill="${accent}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" font-weight="700" letter-spacing="1">${escapeXml(stageLabel)}</text>
  <circle cx="576" cy="58" r="7" fill="${accent}"/>
  <text x="320" y="182" fill="#FFFFFF" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" text-anchor="middle">${escapeXml(safeName || 'Civic Field Evidence')}</text>
  <text x="320" y="216" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif" font-size="14" text-anchor="middle">${escapeXml(detailLine)}</text>
  <line x1="80" y1="264" x2="560" y2="264" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>
  <text x="320" y="294" fill="#94A3B8" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" text-anchor="middle">SAMADHAN SETU • GEO-VERIFIED GOVERNANCE EVIDENCE ARTIFACT</text>
</svg>`;
}

export function makeId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
