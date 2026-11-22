import crypto from 'crypto';

// In-memory store (persisted on globalThis across Next.js dev reloads)
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
      description: 'Road maintenance, potholes, traffic signals, bridges',
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
      description: 'Water supply, drainage, sewage, pipes',
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
      description: 'Power supply, streetlights, transformers',
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
      description: 'Garbage collection, waste disposal, cleaning',
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
      description: 'Public health, mosquito control, food inspection',
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

  const users = [
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
    {
      id: 'user-officer-roads',
      email: 'officer@roads.gov.in',
      phone: '9876543220',
      name: 'Amit Verma',
      full_name: 'Amit Verma',
      password: 'demo123',
      role: 'officer',
      department_id: deptRoadsId,
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-officer-water',
      email: 'officer@water.gov.in',
      phone: '9876543221',
      name: 'Sunita Devi',
      full_name: 'Sunita Devi',
      password: 'demo123',
      role: 'officer',
      department_id: deptWaterId,
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
    {
      id: 'user-officer-elec',
      email: 'officer@electricity.gov.in',
      phone: '9876543222',
      name: 'Ramesh Gupta',
      full_name: 'Ramesh Gupta',
      password: 'demo123',
      role: 'officer',
      department_id: deptElecId,
      ward: 'Ward 5 - Bandra',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    },
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
      id: 'off-roads-001',
      user_id: 'user-officer-roads',
      name: 'Amit Verma',
      email: 'officer@roads.gov.in',
      phone: '9876543220',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      employee_id: 'OFF-ROADS-001',
      designation: 'Assistant Municipal Engineer',
      jurisdiction_wards: ['Ward 12 - Dadar', 'Ward 14 - Mahim'],
      max_active_complaints: 25,
      current_active_count: 4,
      total_resolved: 89,
      rating: 4.7,
      is_active: true,
    },
    {
      id: 'off-water-001',
      user_id: 'user-officer-water',
      name: 'Sunita Devi',
      email: 'officer@water.gov.in',
      phone: '9876543221',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      employee_id: 'OFF-WATER-001',
      designation: 'Executive Engineer (Water Works)',
      jurisdiction_wards: ['Ward 8 - Andheri', 'Ward 9 - Juhu'],
      max_active_complaints: 20,
      current_active_count: 2,
      total_resolved: 64,
      rating: 4.5,
      is_active: true,
    },
    {
      id: 'off-elec-001',
      user_id: 'user-officer-elec',
      name: 'Ramesh Gupta',
      email: 'officer@electricity.gov.in',
      phone: '9876543222',
      department_id: deptElecId,
      department_name: 'Electricity',
      employee_id: 'OFF-ELEC-001',
      designation: 'Sub-Divisional Officer (Electrical)',
      jurisdiction_wards: ['Ward 5 - Bandra'],
      max_active_complaints: 15,
      current_active_count: 1,
      total_resolved: 112,
      rating: 4.8,
      is_active: true,
    },
  ];

  const complaints = [
    {
      id: 'cmp-2026-001001',
      complaint_number: 'SS-2026-001001',
      citizen_id: 'user-citizen-1',
      title: 'Dangerous pothole on Senapati Bapat Marg near station',
      description: 'Deep crater-like pothole on the southbound lane causing severe traffic disruption and risks to two-wheelers.',
      category: 'Roads & Transport',
      sub_category: 'Pothole Repair',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.96,
      ai_summary: 'High-severity road surface defect requiring immediate asphalt patching.',
      priority: 'high',
      priority_score: 2.35,
      urgency_score: 4,
      sentiment_score: -0.65,
      upvotes: 14,
      vote_count: 14,
      upvoted_by: [],
      is_public: true,
      location: 'Senapati Bapat Marg, Opp. Dadar Western Station, Dadar West',
      address: 'Senapati Bapat Marg, Opp. Dadar Western Station, Dadar West',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400028',
      latitude: 19.0178,
      longitude: 72.8478,
      status: 'in_progress',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      assigned_officer_id: 'off-roads-001',
      deadline: new Date(now + 18 * hr).toISOString(),
      sla_deadline: new Date(now + 18 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 2 * day).toISOString(),
      updated_at: new Date(now - 3 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: ['/api/media/proofs/2026/10/pothole_dadar_proof.jpg'],
      inspection_images: ['/api/media/proofs/2026/10/inspection_dadar.jpg'],
      resolution_proof: [],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint submitted with geotagged photo proof.',
          actor_role: 'citizen',
          created_at: new Date(now - 2 * day).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'assigned',
          remarks: 'AI-routed to Roads & Transport department (96% confidence).',
          actor_role: 'system',
          created_at: new Date(now - 46 * hr).toISOString(),
        },
        {
          from_status: 'assigned',
          to_status: 'in_progress',
          remarks: 'Inspection completed. Maintenance truck dispatched for hot-mix asphalt patching.',
          actor_role: 'officer',
          created_at: new Date(now - 42 * hr).toISOString(),
        },
      ],
    },
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
      upvoted_by: [],
      is_public: true,
      location: 'Building 4, Shivaji Nagar, Veera Desai Road, Andheri West',
      address: 'Building 4, Shivaji Nagar, Veera Desai Road, Andheri West',
      ward: 'Ward 8 - Andheri',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400058',
      latitude: 19.129,
      longitude: 72.836,
      status: 'assigned',
      department_id: deptWaterId,
      department_name: 'Water Supply',
      assigned_officer_id: 'off-water-001',
      deadline: new Date(now + 4 * hr).toISOString(),
      sla_deadline: new Date(now + 4 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 8 * hr).toISOString(),
      updated_at: new Date(now - 2 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: [],
      inspection_images: [],
      resolution_proof: [],
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Urgent water contamination grievance lodged.',
          actor_role: 'citizen',
          created_at: new Date(now - 8 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'assigned',
          remarks: 'Assigned to Executive Engineer (Water Works) with Critical SLA.',
          actor_role: 'system',
          created_at: new Date(now - 7 * hr).toISOString(),
        },
      ],
    },
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
      upvoted_by: [],
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
      assigned_officer_id: 'off-elec-001',
      deadline: new Date(now - 10 * hr).toISOString(),
      sla_deadline: new Date(now - 10 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 4 * day).toISOString(),
      updated_at: new Date(now - 12 * hr).toISOString(),
      resolved_at: new Date(now - 12 * hr).toISOString(),
      resolution_remarks: 'Replaced faulty LED fixture and replaced damaged circuit breaker fuse. Tested and verified active.',
      attachments: [],
      inspection_images: ['/api/media/proofs/2026/10/streetlight_before.jpg'],
      resolution_proof: ['/api/media/proofs/2026/10/streetlight_after.jpg'],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint logged by citizen.',
          actor_role: 'citizen',
          created_at: new Date(now - 4 * day).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'in_progress',
          remarks: 'Electrical maintenance crew dispatched for pole #42 inspection.',
          actor_role: 'officer',
          created_at: new Date(now - 2 * day).toISOString(),
        },
        {
          from_status: 'in_progress',
          to_status: 'resolved',
          remarks: 'Replaced faulty LED fixture and replaced damaged circuit breaker fuse. Tested and verified active.',
          actor_role: 'officer',
          created_at: new Date(now - 12 * hr).toISOString(),
        },
      ],
    },
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
      upvoted_by: [],
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
      assigned_officer_id: 'off-roads-001',
      deadline: new Date(now + 10 * hr).toISOString(),
      sla_deadline: new Date(now + 10 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 5 * day).toISOString(),
      updated_at: new Date(now - 5 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: 'Initial bin clearing performed; appeal filed for alley cleanup.',
      attachments: [],
      inspection_images: [],
      resolution_proof: [],
      triage_confirmed: true,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Sanitation grievance filed.',
          actor_role: 'citizen',
          created_at: new Date(now - 5 * day).toISOString(),
        },
        {
          from_status: 'in_progress',
          to_status: 'resolved',
          remarks: 'Compactor cleared front bin.',
          actor_role: 'officer',
          created_at: new Date(now - 2 * day).toISOString(),
        },
        {
          from_status: 'resolved',
          to_status: 'appealed_l1',
          remarks: 'Citizen filed L1 Appeal: Department marked resolved without clearing the back-alley waste pile.',
          actor_role: 'citizen',
          created_at: new Date(now - 5 * hr).toISOString(),
        },
      ],
    },
    {
      id: 'cmp-2026-001005',
      complaint_number: 'SS-2026-001005',
      citizen_id: 'user-citizen-2',
      title: 'Broken footpath tiles and open stormwater drain cover',
      description: 'Missing iron grate on stormwater drain outside Dadar TT circle poses severe hazard to elderly pedestrians.',
      category: 'Roads & Transport',
      sub_category: 'Footpath / Drain Cover',
      ai_category: 'Roads & Transport',
      ai_confidence: 0.91,
      ai_summary: 'Pedestrian safety risk due to damaged footpath and uncovered drain.',
      priority: 'high',
      priority_score: 2.25,
      urgency_score: 4,
      sentiment_score: -0.62,
      upvotes: 11,
      vote_count: 11,
      upvoted_by: [],
      is_public: true,
      location: 'Dadar TT Circle, Dr. B. Ambedkar Road, Dadar East',
      address: 'Dadar TT Circle, Dr. B. Ambedkar Road, Dadar East',
      ward: 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400014',
      latitude: 19.0185,
      longitude: 72.8495,
      status: 'assigned',
      department_id: deptRoadsId,
      department_name: 'Roads & Transport',
      assigned_officer_id: 'off-roads-001',
      deadline: new Date(now + 20 * hr).toISOString(),
      sla_deadline: new Date(now + 20 * hr).toISOString(),
      sla_breached: false,
      created_at: new Date(now - 14 * hr).toISOString(),
      updated_at: new Date(now - 4 * hr).toISOString(),
      resolved_at: null,
      resolution_remarks: null,
      attachments: [],
      inspection_images: [],
      resolution_proof: [],
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Complaint logged by citizen.',
          actor_role: 'citizen',
          created_at: new Date(now - 14 * hr).toISOString(),
        },
        {
          from_status: 'submitted',
          to_status: 'assigned',
          remarks: 'Routed to Roads & Transport.',
          actor_role: 'system',
          created_at: new Date(now - 13 * hr).toISOString(),
        },
      ],
    },
  ];

  const notifications = [
    {
      id: 'notif-1',
      user_id: 'user-citizen-1',
      title: 'Grievance SS-2026-001003 Resolved',
      body: 'Electricity department has resolved your streetlight complaint on Hill Road. Please review and rate.',
      is_read: false,
      created_at: new Date(now - 12 * hr).toISOString(),
    },
    {
      id: 'notif-2',
      user_id: 'user-citizen-1',
      title: 'Field Team Dispatched (SS-2026-001001)',
      body: 'Inspection completed on Senapati Bapat Marg. Hot-mix asphalt patching is in progress.',
      is_read: false,
      created_at: new Date(now - 3 * hr).toISOString(),
    },
    {
      id: 'notif-3',
      user_id: 'user-officer-roads',
      title: 'High-Priority Task Assigned',
      body: 'Broken footpath tiles and open stormwater drain cover at Dadar TT Circle requires inspection.',
      is_read: false,
      created_at: new Date(now - 4 * hr).toISOString(),
    },
    {
      id: 'notif-4',
      user_id: 'user-admin-1',
      title: 'SLA Watch Alert: Ward 8 Water Supply',
      body: 'Critical complaint SS-2026-001002 is within 4 hours of its statutory SLA deadline.',
      is_read: false,
      created_at: new Date(now - 2 * hr).toISOString(),
    },
  ];

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
      entity_id: 'cmp-2026-001001',
      actor_id: 'user-citizen-1',
      actor_role: 'citizen',
      details: { category: 'Roads & Transport', priority: 'high' },
      created_at: new Date(now - 2 * day).toISOString(),
    },
  ];

  return {
    departments,
    users,
    officers,
    complaints,
    notifications,
    mappings,
    slaRules,
    auditLogs,
    media: new Map(), // key -> { buffer: Buffer, mimeType: string }
    tokens: new Map(), // token -> userId
    overrideCount: 2,
    acceptedCount: 18,
    inferenceCount: 142,
    seq: 1006,
  };
}

export function getStore() {
  if (!globalThis.__samadhanStore) {
    globalThis.__samadhanStore = createInitialStore();
  }
  return globalThis.__samadhanStore;
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

  // Accept stored session tokens or deterministic demo tokens `demo-token:<userId>`
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

// Heuristic NLP classifier mimicking DistilBERT + Priority Engine
export function classifyText(text = '') {
  const store = getStore();
  store.inferenceCount += 1;
  const lower = String(text).toLowerCase();

  let category = 'General';
  let confidence = 0.84;

  if (/(pothole|road|footpath|traffic|bridge|signal|highway|asphalt|street\s*repair)/.test(lower)) {
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
    in_progress: 'In Progress',
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
  const task = mapComplaintToTask(complaint, store);
  return {
    ...complaint,
    department_name: dept?.name || complaint.department_name || complaint.category,
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

export function generatePlaceholderSvg(label) {
  const safeLabel = String(label || 'Field Evidence Photo').replace(/[<>&"']/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#003580"/>
      <stop offset="100%" stop-color="#0047AB"/>
    </linearGradient>
  </defs>
  <rect width="640" height="400" fill="url(#g)"/>
  <rect x="24" y="24" width="592" height="352" rx="12" fill="none" stroke="#FF9933" stroke-width="3" stroke-dasharray="8 6"/>
  <text x="320" y="185" fill="#FFFFFF" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle">Samadhan Setu Civic Evidence</text>
  <text x="320" y="220" fill="#FFD199" font-family="sans-serif" font-size="15" text-anchor="middle">${safeLabel}</text>
  <text x="320" y="255" fill="#C7D7F5" font-family="sans-serif" font-size="12" text-anchor="middle">Geotagged Prototype Media Artifact • Mumbai Municipal Ward</text>
</svg>`;
}

export function makeId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
