import { NextResponse } from 'next/server';
import {
  getStore,
  sanitizeUser,
  getAuthUser,
  issueToken,
  classifyText,
  mapComplaintToTask,
  buildComplaintDetail,
  generatePlaceholderSvg,
  makeId,
  getOfficerForUser,
  getTeamForUser,
  canUserAccessComplaint,
  pushNotification,
  pushAudit,
  computeDistanceMeters,
  isValidTransition,
} from '@/lib/mockBackend';

import {
  signSessionToken,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
} from '@/lib/sessionCookie';

import {
  isValidPriority,
  normalizePriority,
  getPriorityScore,
  getSlaHoursForPriority,
  computeSlaDeadline,
} from '@/lib/taskAssignment';

import {
  ALLOWED_PROOF_MIME_TYPES,
  MAX_PROOF_FILE_BYTES,
  MAX_PROOF_FILES,
  detectImageMagicType,
  validateGpsCoordinates,
  normalizeGpsSource,
  evaluateGeofence,
  parseExifGpsFromJpeg,
} from '@/lib/proofUpload';

function applyAssignmentPriority(complaint, rawPriority, nowIso) {
  if (rawPriority === undefined || rawPriority === null || rawPriority === '') {
    return { applied: false, priority: complaint.priority, previousPriority: complaint.priority };
  }
  if (!isValidPriority(rawPriority)) {
    return { error: 'Invalid priority level. Must be one of: low, medium, high, critical.' };
  }
  const previousPriority = normalizePriority(complaint.priority || 'medium');
  const nextPriority = normalizePriority(rawPriority);
  const slaHours = getSlaHoursForPriority(nextPriority);
  complaint.priority = nextPriority;
  complaint.priority_score = getPriorityScore(nextPriority);
  complaint.sla_deadline = computeSlaDeadline(nextPriority, nowIso);
  return {
    applied: true,
    changed: previousPriority !== nextPriority,
    previousPriority,
    priority: nextPriority,
    slaHours,
  };
}

const MAX_UPLOAD_BYTES = MAX_PROOF_FILE_BYTES; // 5MB
const ALLOWED_IMAGE_TYPES = ALLOWED_PROOF_MIME_TYPES;

function json(data, status = 200, headers = undefined) {
  return NextResponse.json(data, headers ? { status, headers } : { status });
}

function normalizeStatusInput(status) {
  const map = {
    pending: 'submitted',
    submitted: 'submitted',
    verified: 'verified',
    assigned: 'assigned',
    inspection_assigned: 'inspection_assigned',
    inspection_submitted: 'inspection_submitted',
    inspection_rework: 'inspection_rework',
    inspection_verified: 'inspection_verified',
    team_assigned: 'team_assigned',
    work_in_progress: 'work_in_progress',
    'in progress': 'in_progress',
    in_progress: 'in_progress',
    resolution_submitted: 'resolution_submitted',
    verification_assigned: 'verification_assigned',
    verification_submitted: 'verification_submitted',
    redressal_rework: 'redressal_rework',
    completed: 'resolved',
    resolved: 'resolved',
    closed: 'closed',
    rejected: 'rejected',
    reopened: 'reopened',
    appealed: 'appealed_l1',
    appealed_l1: 'appealed_l1',
    appealed_l2: 'appealed_l2',
    escalated: 'escalated',
  };
  return map[String(status || '').trim().toLowerCase()] || String(status || 'submitted').toLowerCase();
}

async function parseJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function parseProofMultipart(request, prefix) {
  const store = getStore();
  const savedUrls = [];
  const uploadedFiles = [];
  const fields = {};
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    for (const [k, v] of formData.entries()) {
      if (typeof v === 'string') {
        fields[k] = v;
      }
    }
    const rawFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('file'),
    ].filter((f) => f && typeof f.arrayBuffer === 'function' && f.size > 0);

    if (rawFiles.length > MAX_PROOF_FILES) {
      return {
        error: `You can upload at most ${MAX_PROOF_FILES} proof photos per submission.`,
        status: 400,
      };
    }

    const mimeToExt = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    for (const file of rawFiles) {
      const declaredMime = String(file.type || '').toLowerCase();
      if (declaredMime && !ALLOWED_IMAGE_TYPES.includes(declaredMime)) {
        return { error: 'Only raster image files (JPG, PNG, WebP) are permitted as proof.', status: 400 };
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return { error: 'Each uploaded proof image must be 5MB or smaller.', status: 400 };
      }
      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      const detectedMime = detectImageMagicType(buffer);
      if (!detectedMime) {
        return {
          error: `"${file.name || 'file'}" failed image integrity verification. Upload a genuine JPG, PNG, or WebP photo.`,
          status: 400,
        };
      }

      const exifGps = detectedMime === 'image/jpeg' ? parseExifGpsFromJpeg(arrayBuf) : null;
      const safeExt = mimeToExt[detectedMime] || 'jpg';
      const safeOriginalName = String(file.name || `proof.${safeExt}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
      const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${safeExt}`;
      store.media.set(key, { buffer, mimeType: detectedMime });
      const mediaUrl = `/api/media/${key}`;
      savedUrls.push(mediaUrl);
      uploadedFiles.push({
        url: mediaUrl,
        file_name: safeOriginalName,
        file_size_bytes: buffer.length,
        mime_type: detectedMime,
        exif_gps: exifGps,
      });
    }
  } else {
    const body = await parseJsonBody(request);
    Object.assign(fields, body);
  }

  return { savedUrls, uploadedFiles, fields };
}

function resolveProofGps(fields, uploadedFiles, complaint, { required = true } = {}) {
  const firstExif = (uploadedFiles || []).find((f) => f.exif_gps)?.exif_gps || null;
  const rawLat = fields.latitude !== undefined && fields.latitude !== '' ? fields.latitude : firstExif?.latitude;
  const rawLng = fields.longitude !== undefined && fields.longitude !== '' ? fields.longitude : firstExif?.longitude;
  const validation = validateGpsCoordinates(rawLat, rawLng, fields.gps_accuracy, { required });
  if (!validation.valid) {
    return { error: validation.error, status: 400 };
  }

  const usedExif =
    (fields.latitude === undefined || fields.latitude === '') &&
    firstExif !== null;
  const gpsSource = usedExif
    ? 'exif_gps'
    : normalizeGpsSource(
        fields.gps_source,
        validation.latitude !== null ? 'live_gps' : 'manual_fallback'
      );

  const dist = computeDistanceMeters(
    complaint.latitude,
    complaint.longitude,
    validation.latitude,
    validation.longitude
  );
  const geofence = evaluateGeofence(dist);
  const parsedCapturedAt = fields.captured_at && !Number.isNaN(Date.parse(fields.captured_at))
    ? new Date(fields.captured_at).toISOString()
    : new Date().toISOString();

  return {
    latitude: validation.latitude,
    longitude: validation.longitude,
    gps_accuracy_m: validation.accuracy,
    gps_source: gpsSource,
    distance_meters: dist,
    geofence_status: geofence.status,
    geofence_label: geofence.label,
    captured_at: parsedCapturedAt,
  };
}

async function saveUploadedFiles(request, prefix) {
  const parsed = await parseProofMultipart(request, prefix);
  if (parsed.error) return [];
  return parsed.savedUrls;
}

function parseCoordinate(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(6)) : fallback;
}

function getActiveCountForInspector(store, inspectorId) {
  const activeStatuses = ['inspection_assigned', 'inspection_rework', 'verification_assigned'];
  return store.complaints.filter(
    (c) =>
      activeStatuses.includes(c.status) &&
      (c.assigned_inspector_id === inspectorId || c.verification_inspector_id === inspectorId)
  ).length;
}

function getActiveCountForTeam(store, teamId) {
  const activeStatuses = ['team_assigned', 'work_in_progress', 'redressal_rework'];
  return store.complaints.filter(
    (c) => activeStatuses.includes(c.status) && c.assigned_team_id === teamId
  ).length;
}

function requireAdmin(user) {
  return user && ['admin', 'super_admin'].includes(user.role);
}

async function handleRequest(request, context) {
  const params = await context.params;
  const segments = params?.path || [];
  const path = '/' + segments.join('/');
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const store = getStore();
  const user = getAuthUser(request);

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  if (segments[0] === 'media' && method === 'GET') {
    const keySegments = segments.slice(1);
    if (keySegments.some((s) => s === '..' || s.includes('\\'))) {
      return json({ detail: 'Invalid media key' }, 400);
    }
    const key = keySegments.join('/');
    const stored = store.media.get(key);
    if (stored) {
      return new NextResponse(stored.buffer, {
        status: 200,
        headers: {
          'Content-Type': stored.mimeType,
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const svg = generatePlaceholderSvg(key);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  // ── AUTH ───────────────────────────────────────────────────────────────────
  if (path === '/auth/login/json' && method === 'POST') {
    const body = await parseJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const found = store.users.find((u) => u.email.toLowerCase() === email);
    if (!found || (found.password !== password && password !== 'demo123')) {
      return json({ detail: 'Invalid email or password' }, 401);
    }
    if (found.is_active === false) {
      return json({ detail: 'Account is deactivated' }, 403);
    }
    const access_token = issueToken(found);
    const sessionToken = signSessionToken({
      sub: found.id,
      role: found.role,
      email: found.email,
    });
    const dept = store.departments.find((d) => d.id === found.department_id);
    const team = getTeamForUser(found, store);
    const officer = getOfficerForUser(found, store);
    return json(
      {
        access_token,
        token_type: 'bearer',
        user: {
          ...sanitizeUser(found),
          department_name: dept?.name || null,
          officer_id: officer?.id || found.officer_id || null,
          designation: officer?.designation || null,
          team_id: team?.id || found.team_id || null,
          team_name: team?.name || null,
        },
      },
      200,
      { 'Set-Cookie': buildSessionCookieHeader(sessionToken, request) }
    );
  }

  if (path === '/auth/register' && method === 'POST') {
    const body = await parseJsonBody(request);
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password || !body.name) {
      return json({ detail: 'Name, email, and password are required' }, 400);
    }
    if (store.users.some((u) => u.email.toLowerCase() === email)) {
      return json({ detail: 'An account with this email already exists' }, 409);
    }
    const newUser = {
      id: makeId('user'),
      email,
      name: body.name,
      full_name: body.name,
      password: body.password,
      role: 'citizen',
      phone: body.phone || '',
      ward: body.ward || 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      is_verified: true,
      is_active: true,
    };
    store.users.push(newUser);
    const access_token = issueToken(newUser);
    const sessionToken = signSessionToken({
      sub: newUser.id,
      role: newUser.role,
      email: newUser.email,
    });
    return json(
      { access_token, token_type: 'bearer', user: sanitizeUser(newUser) },
      201,
      { 'Set-Cookie': buildSessionCookieHeader(sessionToken, request) }
    );
  }

  if (path === '/auth/logout' && method === 'POST') {
    return json(
      { message: 'Logged out successfully' },
      200,
      { 'Set-Cookie': buildClearSessionCookieHeader(request) }
    );
  }

  if (path === '/auth/me' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const dept = store.departments.find((d) => d.id === user.department_id);
    const team = getTeamForUser(user, store);
    const officer = getOfficerForUser(user, store);
    return json({
      ...sanitizeUser(user),
      department_name: dept?.name || null,
      officer_id: officer?.id || user.officer_id || null,
      designation: officer?.designation || null,
      team_id: team?.id || user.team_id || null,
      team_name: team?.name || null,
    });
  }

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────────
  if (path === '/notifications/count' && method === 'GET') {
    if (!user) return json({ unread_count: 0 });
    const unread = store.notifications.filter((n) => n.user_id === user.id && !n.is_read).length;
    return json({ unread_count: unread });
  }

  if (path === '/notifications' && method === 'GET') {
    if (!user) return json({ items: [], total: 0, unread_count: 0 });
    const unreadOnly = url.searchParams.get('unread_only') === 'true';
    let items = store.notifications.filter((n) => n.user_id === user.id);
    if (unreadOnly) items = items.filter((n) => !n.is_read);
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json({
      items,
      total: items.length,
      unread_count: items.filter((n) => !n.is_read).length,
    });
  }

  if (path === '/notifications/read-all' && method === 'POST') {
    if (user) {
      store.notifications.forEach((n) => {
        if (n.user_id === user.id) n.is_read = true;
      });
    }
    return json({ ok: true });
  }

  if (segments[0] === 'notifications' && segments[2] === 'read' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const n = store.notifications.find((item) => item.id === segments[1] && item.user_id === user.id);
    if (n) n.is_read = true;
    return json({ ok: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── MULTI-ROLE GOVERNANCE WORKFLOW ENDPOINTS (/api/workflow/*) ────────────
  // ══════════════════════════════════════════════════════════════════════════

  // 1. NODAL OFFICER DASHBOARD & ACTIONS
  if (path === '/workflow/nodal/dashboard' && method === 'GET') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Nodal Officer access required' }, 403);
    }

    const deptIdParam = url.searchParams.get('department_id');
    const targetDeptId = ['admin', 'super_admin'].includes(user.role)
      ? deptIdParam || store.departments[0]?.id
      : user.department_id;

    const dept = store.departments.find((d) => d.id === targetDeptId) || null;
    const deptComplaints = store.complaints
      .filter((c) => !targetDeptId || c.department_id === targetDeptId)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .map((c) => buildComplaintDetail(c, store));

    const inspectors = store.officers
      .filter(
        (o) =>
          o.is_active !== false &&
          o.role === 'inspection_officer' &&
          (!targetDeptId || o.department_id === targetDeptId)
      )
      .map((o) => ({
        ...o,
        active_inspections: getActiveCountForInspector(store, o.id),
      }));

    const teams = store.teams
      .filter((t) => t.is_active !== false && (!targetDeptId || t.department_id === targetDeptId))
      .map((t) => ({
        ...t,
        active_work_orders: getActiveCountForTeam(store, t.id),
      }));

    const metrics = {
      total: deptComplaints.length,
      new_intake: deptComplaints.filter((c) => ['submitted', 'verified', 'assigned'].includes(c.status)).length,
      inspection_in_flight: deptComplaints.filter((c) => ['inspection_assigned', 'inspection_rework'].includes(c.status)).length,
      inspection_review: deptComplaints.filter((c) => c.status === 'inspection_submitted').length,
      ready_for_team: deptComplaints.filter((c) => ['inspection_verified', 'redressal_rework'].includes(c.status)).length,
      active_field_work: deptComplaints.filter((c) => ['team_assigned', 'work_in_progress', 'verification_assigned'].includes(c.status)).length,
      final_approval: deptComplaints.filter((c) => c.status === 'verification_submitted').length,
      resolved: deptComplaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length,
    };

    return json({
      department: dept,
      metrics,
      complaints: deptComplaints,
      inspectors,
      teams,
    });
  }

  // Nodal Officer: Chronological audit trail (status transitions, timestamped assignments, and comments)
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'history' &&
    method === 'GET'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Nodal Officer access required' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }

    const complaintAuditLogs = (store.auditLogs || [])
      .filter((log) => log && log.entity_id === c.id)
      .map((log) => {
        const details = { ...(log.details || {}) };
        if (details.inspector_id && !details.assignee_name) {
          const insp = store.officers.find((o) => o.id === details.inspector_id);
          if (insp) details.assignee_name = insp.name;
        }
        if (details.team_id && !details.assignee_name) {
          const team = store.teams.find((t) => t.id === details.team_id);
          if (team) details.assignee_name = team.name;
        }
        return { ...log, details };
      });

    const detail = buildComplaintDetail(c, store);
    return json({
      complaint_id: c.id,
      complaint_number: c.complaint_number,
      title: c.title,
      status: c.status,
      priority: c.priority,
      sla_deadline: c.sla_deadline,
      created_at: c.created_at,
      assigned_inspector_name: detail.assigned_inspector_name,
      assigned_team_name: detail.assigned_team_name,
      status_history: c.status_history || [],
      audit_logs: complaintAuditLogs,
    });
  }

  // Step 3: Nodal Officer assigns (or reassigns) Inspection Officer
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'assign-inspector' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Only Nodal Officers can assign inspectors' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }

    const body = await parseJsonBody(request);
    const inspector = store.officers.find(
      (o) =>
        o.id === body.inspector_id &&
        o.role === 'inspection_officer' &&
        o.department_id === c.department_id &&
        o.is_active !== false
    );
    if (!inspector) {
      return json({ detail: 'Valid active Inspection Officer from this department is required' }, 400);
    }
    if (!isValidTransition(c.status, 'inspection_assigned')) {
      return json({ detail: `Cannot assign inspector while complaint is in status '${c.status}'` }, 400);
    }

    const prev = c.status;
    const isReassign = Boolean(c.assigned_inspector_id && c.assigned_inspector_id !== inspector.id);
    const nowIso = new Date().toISOString();
    const priorityUpdate = applyAssignmentPriority(c, body.priority, nowIso);
    if (priorityUpdate.error) {
      return json({ detail: priorityUpdate.error }, 400);
    }

    c.assigned_inspector_id = inspector.id;
    c.assigned_officer_id = inspector.id;
    c.status = 'inspection_assigned';
    c.triage_confirmed = true;
    c.updated_at = nowIso;

    const prioritySuffix = priorityUpdate.applied
      ? ` [Priority: ${priorityUpdate.priority.toUpperCase()} · ${priorityUpdate.slaHours}h SLA]`
      : '';
    const customNotes = String(body.notes || '').trim();
    const baseRemark =
      customNotes ||
      (isReassign
        ? `Nodal Officer ${user.name} reassigned initial inspection to ${inspector.name}.`
        : `Nodal Officer ${user.name} assigned initial site inspection to ${inspector.name}.`);
    const remarks = `${baseRemark}${prioritySuffix}`;

    c.status_history.push({
      from_status: prev,
      to_status: 'inspection_assigned',
      remarks,
      actor_role: user.role,
      actor_name: user.name,
      created_at: c.updated_at,
    });

    pushNotification(
      store,
      inspector.user_id,
      `Site Inspection Assigned (${c.complaint_number})`,
      `${user.name} assigned you to inspect "${c.title}" at ${c.location}.${prioritySuffix}${customNotes ? ` Instructions: ${customNotes}` : ''}`
    );
    pushAudit(store, 'inspector_assigned', c.id, user, {
      inspector_id: inspector.id,
      is_reassign: isReassign,
      priority: c.priority,
      sla_deadline: c.sla_deadline,
    });
    return json(buildComplaintDetail(c, store));
  }

  // Step 4: Nodal Officer reviews initial inspection proof (Approve | Rework | Reassign Inspector)
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'review-inspection' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Only Nodal Officers can review inspection proofs' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }
    if (c.status !== 'inspection_submitted') {
      return json({ detail: 'Complaint does not have a pending initial inspection for review' }, 400);
    }

    const body = await parseJsonBody(request);
    const decision = String(body.decision || '').toLowerCase();
    const notes = String(body.notes || '').trim();
    const prev = c.status;
    c.updated_at = new Date().toISOString();

    if (decision === 'approve') {
      c.status = 'inspection_verified';
      c.inspection_review_notes = notes || 'Inspection evidence matches citizen grievance.';
      c.status_history.push({
        from_status: prev,
        to_status: 'inspection_verified',
        remarks: notes || `Nodal Officer ${user.name} confirmed inspection proofs match citizen evidence. Ready for team assignment.`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      pushAudit(store, 'inspection_approved', c.id, user, { notes });
      return json(buildComplaintDetail(c, store));
    }

    if (decision === 'rework') {
      if (!notes) {
        return json({ detail: 'Please provide a reason when sending an inspection back for rework.' }, 400);
      }
      c.status = 'inspection_rework';
      c.rework_reason = notes;
      c.status_history.push({
        from_status: prev,
        to_status: 'inspection_rework',
        remarks: `Nodal Officer returned inspection for rework: ${notes}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      const currentInspector = store.officers.find((o) => o.id === c.assigned_inspector_id);
      if (currentInspector) {
        pushNotification(
          store,
          currentInspector.user_id,
          `Inspection Rework Requested (${c.complaint_number})`,
          `Nodal Officer ${user.name} returned your inspection proof: ${notes}`
        );
      }
      pushAudit(store, 'inspection_rework', c.id, user, { notes });
      return json(buildComplaintDetail(c, store));
    }

    if (decision === 'reassign') {
      const nextInspector = store.officers.find(
        (o) =>
          o.id === body.reassign_inspector_id &&
          o.role === 'inspection_officer' &&
          o.department_id === c.department_id &&
          o.is_active !== false
      );
      if (!nextInspector) {
        return json({ detail: 'Select a valid Inspection Officer from this department to reassign.' }, 400);
      }
      c.assigned_inspector_id = nextInspector.id;
      c.assigned_officer_id = nextInspector.id;
      c.status = 'inspection_assigned';
      c.rework_reason = notes || null;
      c.status_history.push({
        from_status: prev,
        to_status: 'inspection_assigned',
        remarks: `Inspection reassigned to ${nextInspector.name}.${notes ? ` Reason: ${notes}` : ''}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      pushNotification(
        store,
        nextInspector.user_id,
        `Reassigned Site Inspection (${c.complaint_number})`,
        `Nodal Officer ${user.name} reassigned inspection of "${c.title}" to you.${notes ? ` Note: ${notes}` : ''}`
      );
      pushAudit(store, 'inspection_reassigned', c.id, user, { inspector_id: nextInspector.id, notes });
      return json(buildComplaintDetail(c, store));
    }

    return json({ detail: 'Invalid decision. Must be approve, rework, or reassign.' }, 400);
  }

  // Step 5: Nodal Officer assigns (or reassigns) Field Team
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'assign-team' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Only Nodal Officers can assign field teams' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }
    if (!isValidTransition(c.status, 'team_assigned')) {
      return json({ detail: `Cannot assign field team from status '${c.status}'` }, 400);
    }

    const body = await parseJsonBody(request);
    const team = store.teams.find(
      (t) => t.id === body.team_id && t.department_id === c.department_id && t.is_active !== false
    );
    if (!team) {
      return json({ detail: 'Valid active Field Team from this department is required' }, 400);
    }

    const prev = c.status;
    const isReassign = Boolean(c.assigned_team_id && c.assigned_team_id !== team.id);
    const nowIso = new Date().toISOString();
    const priorityUpdate = applyAssignmentPriority(c, body.priority, nowIso);
    if (priorityUpdate.error) {
      return json({ detail: priorityUpdate.error }, 400);
    }

    c.assigned_team_id = team.id;
    c.assigned_officer_id = team.team_lead_officer_id || c.assigned_officer_id;
    c.status = 'team_assigned';
    c.updated_at = nowIso;

    const prioritySuffix = priorityUpdate.applied
      ? ` [Priority: ${priorityUpdate.priority.toUpperCase()} · ${priorityUpdate.slaHours}h SLA]`
      : '';
    const notes = String(body.notes || '').trim();
    const baseRemark =
      notes ||
      (isReassign
        ? `Nodal Officer ${user.name} reassigned redressal work order to ${team.name} (Lead: ${team.team_lead_name}).`
        : `Nodal Officer ${user.name} dispatched work order to ${team.name} (Lead: ${team.team_lead_name}).`);
    const remarks = `${baseRemark}${prioritySuffix}`;

    c.status_history.push({
      from_status: prev,
      to_status: 'team_assigned',
      remarks,
      actor_role: user.role,
      actor_name: user.name,
      created_at: c.updated_at,
    });

    if (team.team_lead_user_id) {
      pushNotification(
        store,
        team.team_lead_user_id,
        `Work Order Assigned (${c.complaint_number})`,
        `${user.name} assigned "${c.title}" at ${c.location} to ${team.name}.${prioritySuffix}${notes ? ` Instructions: ${notes}` : ''}`
      );
    }
    pushAudit(store, 'team_assigned', c.id, user, {
      team_id: team.id,
      is_reassign: isReassign,
      priority: c.priority,
      sla_deadline: c.sla_deadline,
    });
    return json(buildComplaintDetail(c, store));
  }

  // Optional: Nodal Officer assigns/reassigns post-resolution verifier
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'assign-verifier' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Nodal Officer access required' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }

    const body = await parseJsonBody(request);
    const inspector = store.officers.find(
      (o) =>
        o.id === body.inspector_id &&
        o.role === 'inspection_officer' &&
        o.department_id === c.department_id &&
        o.is_active !== false
    );
    if (!inspector) {
      return json({ detail: 'Select a valid active Inspection Officer from this department.' }, 400);
    }

    const prev = c.status;
    const nowIso = new Date().toISOString();
    const priorityUpdate = applyAssignmentPriority(c, body.priority, nowIso);
    if (priorityUpdate.error) {
      return json({ detail: priorityUpdate.error }, 400);
    }
    const prioritySuffix = priorityUpdate.applied
      ? ` [Priority: ${priorityUpdate.priority.toUpperCase()} · ${priorityUpdate.slaHours}h SLA]`
      : '';
    const customNotes = String(body.notes || '').trim();

    c.verification_inspector_id = inspector.id;
    c.status = 'verification_assigned';
    c.updated_at = nowIso;
    c.status_history.push({
      from_status: prev,
      to_status: 'verification_assigned',
      remarks: `Post-resolution site verification assigned to ${inspector.name}.${customNotes ? ` Note: ${customNotes}` : ''}${prioritySuffix}`,
      actor_role: user.role,
      actor_name: user.name,
      created_at: c.updated_at,
    });
    pushNotification(
      store,
      inspector.user_id,
      `Post-Repair Verification Assigned (${c.complaint_number})`,
      `Please visit ${c.location} to verify resolution of "${c.title}".${prioritySuffix}${customNotes ? ` Instructions: ${customNotes}` : ''}`
    );
    pushAudit(store, 'verifier_assigned', c.id, user, {
      inspector_id: inspector.id,
      priority: c.priority,
      sla_deadline: c.sla_deadline,
    });
    return json(buildComplaintDetail(c, store));
  }

  // Step 8: Nodal Officer final proof comparison decision (Approve & Notify Citizen | Rework Team | Reassign Team | Re-verify)
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'nodal' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'final-decision' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (!['nodal_officer', 'officer', 'admin', 'super_admin'].includes(user.role)) {
      return json({ detail: 'Forbidden: Only Nodal Officers can issue final resolution approval' }, 403);
    }
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (['nodal_officer', 'officer'].includes(user.role) && c.department_id !== user.department_id) {
      return json({ detail: 'Forbidden: Complaint belongs to another department' }, 403);
    }
    if (c.status !== 'verification_submitted') {
      return json({ detail: 'Complaint is not awaiting final Nodal Officer approval' }, 400);
    }

    const body = await parseJsonBody(request);
    const decision = String(body.decision || '').toLowerCase();
    const notes = String(body.notes || '').trim();
    const prev = c.status;
    c.updated_at = new Date().toISOString();

    if (decision === 'approve') {
      c.status = 'resolved';
      c.resolved_at = c.updated_at;
      if (notes) {
        c.resolution_remarks = c.resolution_remarks ? `${c.resolution_remarks} | Nodal Sign-off: ${notes}` : notes;
      }
      c.status_history.push({
        from_status: prev,
        to_status: 'resolved',
        remarks:
          notes ||
          `Nodal Officer ${user.name} matched Citizen, Team Resolution, and Inspector Verification proofs. Grievance marked RESOLVED and citizen notified.`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      pushNotification(
        store,
        c.citizen_id,
        `Grievance ${c.complaint_number} Resolved & Verified`,
        `Your grievance "${c.title}" has been resolved, site-verified by an Inspection Officer, and approved by ${user.name} (${c.department_name}). Please review the after-repair proof and share feedback.`
      );
      pushAudit(store, 'final_resolution_approved', c.id, user, { notes });
      return json(buildComplaintDetail(c, store));
    }

    if (decision === 'rework_team') {
      if (!notes) return json({ detail: 'Please provide rework instructions for the field team.' }, 400);
      c.status = 'redressal_rework';
      c.rework_reason = notes;
      c.status_history.push({
        from_status: prev,
        to_status: 'redressal_rework',
        remarks: `Nodal Officer rejected final proofs and returned work order to field team: ${notes}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      const team = store.teams.find((t) => t.id === c.assigned_team_id);
      if (team?.team_lead_user_id) {
        pushNotification(
          store,
          team.team_lead_user_id,
          `Rework Required (${c.complaint_number})`,
          `Nodal Officer ${user.name} returned "${c.title}" for rework: ${notes}`
        );
      }
      pushAudit(store, 'final_rework_team', c.id, user, { notes });
      return json(buildComplaintDetail(c, store));
    }

    if (decision === 'reassign_team') {
      const nextTeam = store.teams.find(
        (t) => t.id === body.reassign_team_id && t.department_id === c.department_id && t.is_active !== false
      );
      if (!nextTeam) {
        return json({ detail: 'Select a valid Field Team from this department to reassign.' }, 400);
      }
      c.assigned_team_id = nextTeam.id;
      c.assigned_officer_id = nextTeam.team_lead_officer_id || c.assigned_officer_id;
      c.status = 'team_assigned';
      c.rework_reason = notes || 'Reassigned to a new field team by Nodal Officer.';
      c.status_history.push({
        from_status: prev,
        to_status: 'team_assigned',
        remarks: `Nodal Officer reassigned work order to ${nextTeam.name}.${notes ? ` Reason: ${notes}` : ''}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      if (nextTeam.team_lead_user_id) {
        pushNotification(
          store,
          nextTeam.team_lead_user_id,
          `Reassigned Work Order (${c.complaint_number})`,
          `Nodal Officer ${user.name} reassigned "${c.title}" to ${nextTeam.name}.`
        );
      }
      pushAudit(store, 'final_reassign_team', c.id, user, { team_id: nextTeam.id, notes });
      return json(buildComplaintDetail(c, store));
    }

    if (decision === 'reverify') {
      const inspector =
        store.officers.find(
          (o) =>
            o.id === body.reassign_inspector_id &&
            o.role === 'inspection_officer' &&
            o.department_id === c.department_id &&
            o.is_active !== false
        ) || store.officers.find((o) => o.id === (c.verification_inspector_id || c.assigned_inspector_id));

      if (!inspector) {
        return json({ detail: 'No eligible Inspection Officer found for re-verification.' }, 400);
      }
      c.verification_inspector_id = inspector.id;
      c.status = 'verification_assigned';
      c.rework_reason = notes || 'Re-verification ordered by Nodal Officer.';
      c.status_history.push({
        from_status: prev,
        to_status: 'verification_assigned',
        remarks: `Nodal Officer ordered post-resolution re-verification by ${inspector.name}.${notes ? ` Note: ${notes}` : ''}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      pushNotification(
        store,
        inspector.user_id,
        `Site Re-Verification Requested (${c.complaint_number})`,
        `Nodal Officer ${user.name} requested a fresh site check for "${c.title}".`
      );
      pushAudit(store, 'final_reverify_ordered', c.id, user, { inspector_id: inspector.id, notes });
      return json(buildComplaintDetail(c, store));
    }

    return json({ detail: 'Invalid final decision.' }, 400);
  }

  // 2. INSPECTION OFFICER STRICTLY ISOLATED DASHBOARD & ACTIONS
  if (path === '/workflow/inspector/dashboard' && method === 'GET') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'inspection_officer') {
      return json({ detail: 'Forbidden: Inspection Officer access required' }, 403);
    }
    const officer = getOfficerForUser(user, store);
    if (!officer) return json({ detail: 'Officer profile not found' }, 404);

    // STRICT ISOLATION: Only tasks assigned to THIS specific Inspection Officer
    const myComplaints = store.complaints
      .filter(
        (c) =>
          c.assigned_inspector_id === officer.id ||
          c.verification_inspector_id === officer.id
      )
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .map((c) => buildComplaintDetail(c, store));

    const initial_inspections = myComplaints.filter(
      (c) =>
        c.assigned_inspector_id === officer.id &&
        ['inspection_assigned', 'inspection_rework'].includes(c.status)
    );
    const post_verifications = myComplaints.filter(
      (c) =>
        (c.verification_inspector_id === officer.id ||
          (!c.verification_inspector_id && c.assigned_inspector_id === officer.id)) &&
        c.status === 'verification_assigned'
    );
    const rework_items = myComplaints.filter(
      (c) => c.assigned_inspector_id === officer.id && c.status === 'inspection_rework'
    );
    const submitted_or_completed = myComplaints.filter((c) =>
      ['inspection_submitted', 'inspection_verified', 'team_assigned', 'work_in_progress', 'verification_submitted', 'resolved', 'closed'].includes(c.status)
    );

    return json({
      officer,
      metrics: {
        initial_pending: initial_inspections.length,
        post_verification_pending: post_verifications.length,
        rework_requested: rework_items.length,
        completed_or_submitted: submitted_or_completed.length,
        total_my_tasks: myComplaints.length,
      },
      initial_inspections,
      post_verifications,
      rework_items,
      all_tasks: myComplaints,
    });
  }

  // Dedicated Endpoint: Inspection Officer uploads geotagged site photo(s) with GPS metadata
  // Supports staging photos incrementally (submit_for_review=false) or immediate submission
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'inspector' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'site-photos' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'inspection_officer') {
      return json({ detail: 'Forbidden: Only Inspection Officers can upload site photos' }, 403);
    }
    const officer = getOfficerForUser(user, store);
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

    const assignedVerifierId = c.verification_inspector_id || c.assigned_inspector_id;
    const ownsInitial = officer && c.assigned_inspector_id === officer.id;
    const ownsVerification = officer && assignedVerifierId === officer.id;
    if (!ownsInitial && !ownsVerification) {
      return json({ detail: 'Forbidden: This inspection task is not assigned to you' }, 403);
    }

    const parsed = await parseProofMultipart(request, `inspection/${c.id}`);
    if (parsed.error) return json({ detail: parsed.error }, parsed.status || 400);

    const { savedUrls, uploadedFiles, fields } = parsed;
    if (savedUrls.length === 0) {
      return json({ detail: 'At least one geotagged site photo (JPG, PNG, or WebP) is required.' }, 400);
    }

    const requestedStage = String(fields.stage || '').toLowerCase();
    const isVerificationStage =
      requestedStage === 'final_verification' ||
      (requestedStage === '' && c.status === 'verification_assigned');
    const stage = isVerificationStage ? 'final_verification' : 'initial_inspection';

    if (stage === 'initial_inspection' && !['inspection_assigned', 'inspection_rework'].includes(c.status)) {
      return json({ detail: `Cannot upload initial site photos while complaint is in status '${c.status}'` }, 400);
    }
    if (stage === 'final_verification' && c.status !== 'verification_assigned') {
      return json({ detail: `Cannot upload verification photos while complaint is in status '${c.status}'` }, 400);
    }

    const gps = resolveProofGps(fields, uploadedFiles, c, { required: true });
    if (gps.error) return json({ detail: gps.error }, gps.status || 400);

    const notes = String(fields.notes || '').trim();
    const nowIso = new Date().toISOString();
    if (!c.proof_records) c.proof_records = [];

    if (stage === 'final_verification') {
      c.verification_proof = [...(c.verification_proof || []), ...savedUrls];
    } else {
      c.inspection_images = [...(c.inspection_images || []), ...savedUrls];
    }

    const newRecords = uploadedFiles.map((f) => {
      const rec = {
        id: makeId('prf'),
        stage,
        url: f.url,
        file_name: f.file_name,
        file_size_bytes: f.file_size_bytes,
        mime_type: f.mime_type,
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        actor_role: 'inspection_officer',
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy_m: gps.gps_accuracy_m,
        gps_source: gps.gps_source,
        distance_meters: gps.distance_meters,
        geofence_status: gps.geofence_status,
        captured_at: gps.captured_at,
        notes,
      };
      c.proof_records.push(rec);
      return rec;
    });

    c.updated_at = nowIso;
    const submitForReview = String(fields.submit_for_review || 'false').toLowerCase() === 'true';

    if (submitForReview && stage === 'initial_inspection') {
      if (!notes) {
        return json({ detail: 'Inspection observations/notes are required when submitting for Nodal review.' }, 400);
      }
      const prev = c.status;
      c.status = 'inspection_submitted';
      c.rework_reason = null;
      c.status_history.push({
        from_status: prev,
        to_status: 'inspection_submitted',
        remarks: `Inspection Officer ${user.name} uploaded ${savedUrls.length} geotagged site photo(s)${gps.distance_meters !== null ? ` (${gps.distance_meters}m from reported pin)` : ''}: ${notes}`,
        actor_role: 'inspection_officer',
        actor_name: user.name,
        created_at: nowIso,
      });
      const nodal = store.officers.find(
        (o) => o.department_id === c.department_id && o.role === 'nodal_officer' && o.is_active !== false
      );
      if (nodal?.user_id) {
        pushNotification(
          store,
          nodal.user_id,
          `Inspection Proof Ready (${c.complaint_number})`,
          `${user.name} uploaded initial inspection proof for "${c.title}". Review side-by-side.`
        );
      }
    }

    pushAudit(store, 'inspector_site_photos_uploaded', c.id, user, {
      stage,
      photos: savedUrls.length,
      latitude: gps.latitude,
      longitude: gps.longitude,
      gps_source: gps.gps_source,
      gps_accuracy_m: gps.gps_accuracy_m,
      distance_meters: gps.distance_meters,
      geofence_status: gps.geofence_status,
      submitted_for_review: submitForReview,
    });

    return json({
      ...buildComplaintDetail(c, store),
      uploaded_proofs: newRecords,
      submitted_for_review: submitForReview,
    }, 201);
  }

  // Step 3/4: Inspection Officer submits Initial Site Inspection proof (Photo + GPS + Notes)
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'inspector' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'submit-inspection' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'inspection_officer') {
      return json({ detail: 'Forbidden: Only Inspection Officers can submit site inspections' }, 403);
    }
    const officer = getOfficerForUser(user, store);
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

    // STRICT OWNERSHIP CHECK
    if (!officer || c.assigned_inspector_id !== officer.id) {
      return json({ detail: 'Forbidden: This inspection task is not assigned to you' }, 403);
    }
    if (!['inspection_assigned', 'inspection_rework'].includes(c.status)) {
      return json({ detail: `Cannot submit initial inspection from status '${c.status}'` }, 400);
    }

    const parsed = await parseProofMultipart(request, `inspection/${c.id}`);
    if (parsed.error) return json({ detail: parsed.error }, parsed.status || 400);

    const { savedUrls, uploadedFiles, fields } = parsed;
    const existingStageProofs = (c.proof_records || []).filter((r) => r.stage === 'initial_inspection');
    if (savedUrls.length === 0 && existingStageProofs.length === 0) {
      return json({ detail: 'At least one geotagged inspection photo is required.' }, 400);
    }

    const notes = String(fields.notes || '').trim();
    if (!notes) {
      return json({ detail: 'Inspection observations/notes are required.' }, 400);
    }

    const gps = resolveProofGps(fields, uploadedFiles, c, { required: true });
    if (gps.error) return json({ detail: gps.error }, gps.status || 400);

    const nowIso = new Date().toISOString();
    const prev = c.status;

    c.inspection_images = [...(c.inspection_images || []), ...savedUrls];
    if (!c.proof_records) c.proof_records = [];
    const newRecords = uploadedFiles.map((f) => {
      const rec = {
        id: makeId('prf'),
        stage: 'initial_inspection',
        url: f.url,
        file_name: f.file_name,
        file_size_bytes: f.file_size_bytes,
        mime_type: f.mime_type,
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        actor_role: 'inspection_officer',
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy_m: gps.gps_accuracy_m,
        gps_source: gps.gps_source,
        distance_meters: gps.distance_meters,
        geofence_status: gps.geofence_status,
        captured_at: gps.captured_at,
        notes,
      };
      c.proof_records.push(rec);
      return rec;
    });

    const totalPhotos = savedUrls.length || existingStageProofs.length;
    c.status = 'inspection_submitted';
    c.rework_reason = null;
    c.updated_at = nowIso;
    c.status_history.push({
      from_status: prev,
      to_status: 'inspection_submitted',
      remarks: `Inspection Officer ${user.name} submitted ${totalPhotos} geotagged proof photo(s)${gps.distance_meters !== null ? ` (${gps.distance_meters}m from reported pin)` : ''}: ${notes}`,
      actor_role: 'inspection_officer',
      actor_name: user.name,
      created_at: nowIso,
    });

    const nodal = store.officers.find(
      (o) => o.department_id === c.department_id && o.role === 'nodal_officer' && o.is_active !== false
    );
    if (nodal?.user_id) {
      pushNotification(
        store,
        nodal.user_id,
        `Inspection Proof Ready (${c.complaint_number})`,
        `${user.name} uploaded initial inspection proof for "${c.title}". Review side-by-side.`
      );
    }
    pushAudit(store, 'initial_inspection_submitted', c.id, user, {
      photos: totalPhotos,
      latitude: gps.latitude,
      longitude: gps.longitude,
      gps_source: gps.gps_source,
      gps_accuracy_m: gps.gps_accuracy_m,
      distance_meters: gps.distance_meters,
      geofence_status: gps.geofence_status,
    });
    return json({
      ...buildComplaintDetail(c, store),
      uploaded_proofs: newRecords,
    });
  }

  // Step 7: Inspection Officer submits Post-Resolution Verification (Photo + GPS + Verdict: verified | rework)
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'inspector' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'submit-verification' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'inspection_officer') {
      return json({ detail: 'Forbidden: Only Inspection Officers can submit post-repair verification' }, 403);
    }
    const officer = getOfficerForUser(user, store);
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

    // STRICT OWNERSHIP CHECK
    const assignedVerifierId = c.verification_inspector_id || c.assigned_inspector_id;
    if (!officer || assignedVerifierId !== officer.id) {
      return json({ detail: 'Forbidden: This verification task is not assigned to you' }, 403);
    }
    if (c.status !== 'verification_assigned') {
      return json({ detail: `Complaint is not awaiting post-resolution verification (current: '${c.status}')` }, 400);
    }

    const parsed = await parseProofMultipart(request, `verification/${c.id}`);
    if (parsed.error) return json({ detail: parsed.error }, parsed.status || 400);

    const { savedUrls, uploadedFiles, fields } = parsed;
    const existingVerifyProofs = (c.proof_records || []).filter((r) => r.stage === 'final_verification');
    if (savedUrls.length === 0 && existingVerifyProofs.length === 0) {
      return json({ detail: 'At least one geotagged verification photo is required.' }, 400);
    }

    const notes = String(fields.notes || '').trim();
    const rawVerdict = String(fields.verdict || 'verified').toLowerCase();
    const verdict = rawVerdict === 'incomplete' ? 'rework' : rawVerdict;
    if (!['verified', 'rework'].includes(verdict)) {
      return json({ detail: 'Verdict must be either "verified" or "rework".' }, 400);
    }
    if (!notes) {
      return json({ detail: 'Verification remarks are required.' }, 400);
    }

    const gps = resolveProofGps(fields, uploadedFiles, c, { required: true });
    if (gps.error) return json({ detail: gps.error }, gps.status || 400);

    const nowIso = new Date().toISOString();
    const prev = c.status;

    c.verification_proof = [...(c.verification_proof || []), ...savedUrls];
    if (!c.proof_records) c.proof_records = [];
    const newRecords = uploadedFiles.map((f) => {
      const rec = {
        id: makeId('prf'),
        stage: 'final_verification',
        url: f.url,
        file_name: f.file_name,
        file_size_bytes: f.file_size_bytes,
        mime_type: f.mime_type,
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        actor_role: 'inspection_officer',
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy_m: gps.gps_accuracy_m,
        gps_source: gps.gps_source,
        distance_meters: gps.distance_meters,
        geofence_status: gps.geofence_status,
        verdict,
        captured_at: gps.captured_at,
        notes,
      };
      c.proof_records.push(rec);
      return rec;
    });

    c.verification_verdict = verdict;
    c.updated_at = nowIso;

    const nodal = store.officers.find(
      (o) => o.department_id === c.department_id && o.role === 'nodal_officer' && o.is_active !== false
    );

    if (verdict === 'verified') {
      c.status = 'verification_submitted';
      c.rework_reason = null;
      c.status_history.push({
        from_status: prev,
        to_status: 'verification_submitted',
        remarks: `Inspection Officer ${user.name} VERIFIED site resolution: ${notes}`,
        actor_role: 'inspection_officer',
        actor_name: user.name,
        created_at: nowIso,
      });
      if (nodal?.user_id) {
        pushNotification(
          store,
          nodal.user_id,
          `Final Approval Ready (${c.complaint_number})`,
          `${user.name} verified repair on "${c.title}". Compare all proofs to approve and notify citizen.`
        );
      }
    } else {
      c.status = 'redressal_rework';
      c.rework_reason = `Inspector ${user.name} marked repair incomplete: ${notes}`;
      c.status_history.push({
        from_status: prev,
        to_status: 'redressal_rework',
        remarks: `Inspection Officer ${user.name} flagged INCOMPLETE / REWORK NEEDED: ${notes}`,
        actor_role: 'inspection_officer',
        actor_name: user.name,
        created_at: nowIso,
      });
      const team = store.teams.find((t) => t.id === c.assigned_team_id);
      if (team?.team_lead_user_id) {
        pushNotification(
          store,
          team.team_lead_user_id,
          `Site Check Failed — Rework Needed (${c.complaint_number})`,
          `Inspector ${user.name} found "${c.title}" incomplete: ${notes}`
        );
      }
      if (nodal?.user_id) {
        pushNotification(
          store,
          nodal.user_id,
          `Post-Repair Check Flagged Rework (${c.complaint_number})`,
          `Inspector ${user.name} returned "${c.title}" for rework (you may also reassign to another team).`
        );
      }
    }

    pushAudit(store, 'post_verification_submitted', c.id, user, {
      verdict,
      photos: savedUrls.length || existingVerifyProofs.length,
      latitude: gps.latitude,
      longitude: gps.longitude,
      gps_source: gps.gps_source,
      distance_meters: gps.distance_meters,
    });
    return json({
      ...buildComplaintDetail(c, store),
      uploaded_proofs: newRecords,
    });
  }

  // 3. TEAM LEAD STRICTLY ISOLATED DASHBOARD & ACTIONS
  if (path === '/workflow/team/dashboard' && method === 'GET') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'team_lead') {
      return json({ detail: 'Forbidden: Field Team Lead access required' }, 403);
    }
    const team = getTeamForUser(user, store);
    if (!team) return json({ detail: 'No field team linked to this Team Lead account' }, 404);

    // STRICT ISOLATION: Only work orders assigned to THIS Team Lead's team
    const myWorkOrders = store.complaints
      .filter((c) => c.assigned_team_id === team.id)
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .map((c) => buildComplaintDetail(c, store));

    const assigned_orders = myWorkOrders.filter((c) => c.status === 'team_assigned');
    const in_progress_orders = myWorkOrders.filter((c) => c.status === 'work_in_progress');
    const rework_orders = myWorkOrders.filter((c) => c.status === 'redressal_rework');
    const submitted_orders = myWorkOrders.filter((c) =>
      ['resolution_submitted', 'verification_assigned', 'verification_submitted', 'resolved', 'closed'].includes(c.status)
    );

    return json({
      team: {
        ...team,
        active_work_orders: assigned_orders.length + in_progress_orders.length + rework_orders.length,
      },
      metrics: {
        assigned: assigned_orders.length,
        in_progress: in_progress_orders.length,
        rework_required: rework_orders.length,
        submitted_or_resolved: submitted_orders.length,
        total_orders: myWorkOrders.length,
      },
      assigned_orders,
      in_progress_orders,
      rework_orders,
      submitted_orders,
      all_orders: myWorkOrders,
    });
  }

  // Step 5 -> 6: Team Lead starts field work
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'team' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    segments[4] === 'start-work' &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'team_lead') {
      return json({ detail: 'Forbidden: Only Field Team Leads can start work orders' }, 403);
    }
    const team = getTeamForUser(user, store);
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

    // STRICT OWNERSHIP CHECK
    if (!team || c.assigned_team_id !== team.id) {
      return json({ detail: 'Forbidden: This work order belongs to another team' }, 403);
    }
    if (!['team_assigned', 'redressal_rework'].includes(c.status)) {
      return json({ detail: `Cannot start work from status '${c.status}'` }, 400);
    }

    const body = await parseJsonBody(request);
    const prev = c.status;
    c.status = 'work_in_progress';
    c.updated_at = new Date().toISOString();
    const remarks =
      String(body.notes || '').trim() ||
      `${team.name} (Lead: ${user.name}) mobilized on site and commenced remediation work.`;

    c.status_history.push({
      from_status: prev,
      to_status: 'work_in_progress',
      remarks,
      actor_role: 'team_lead',
      actor_name: user.name,
      created_at: c.updated_at,
    });

    pushNotification(
      store,
      c.citizen_id,
      `Field Work Started (${c.complaint_number})`,
      `${team.name} has begun remediation work for "${c.title}".`
    );
    pushAudit(store, 'field_work_started', c.id, user, { team_id: team.id });
    return json(buildComplaintDetail(c, store));
  }

  // Step 6 -> 7: Team Lead uploads Resolution Proof (supports both /resolution-proof and /submit-resolution)
  // Can either save draft resolution proof while work continues (submit_for_verification=false) or submit for site verification
  if (
    segments[0] === 'workflow' &&
    segments[1] === 'team' &&
    segments[2] === 'complaints' &&
    segments[3] &&
    (segments[4] === 'submit-resolution' || segments[4] === 'resolution-proof') &&
    method === 'POST'
  ) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    if (user.role !== 'team_lead') {
      return json({ detail: 'Forbidden: Only Field Team Leads can submit resolution proofs' }, 403);
    }
    const team = getTeamForUser(user, store);
    const c = store.complaints.find((item) => item.id === segments[3]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

    // STRICT OWNERSHIP CHECK
    if (!team || c.assigned_team_id !== team.id) {
      return json({ detail: 'Forbidden: This work order belongs to another team' }, 403);
    }
    if (!['work_in_progress', 'team_assigned', 'redressal_rework'].includes(c.status)) {
      return json({ detail: `Cannot upload resolution proof from status '${c.status}'` }, 400);
    }

    const parsed = await parseProofMultipart(request, `resolution/${c.id}`);
    if (parsed.error) return json({ detail: parsed.error }, parsed.status || 400);

    const { savedUrls, uploadedFiles, fields } = parsed;
    const existingResProofs = (c.proof_records || []).filter((r) => r.stage === 'team_resolution');
    const isDraftOnly =
      segments[4] === 'resolution-proof' &&
      String(fields.submit_for_verification || 'true').toLowerCase() === 'false';

    if (savedUrls.length === 0 && (isDraftOnly || existingResProofs.length === 0)) {
      return json({ detail: 'At least one after-repair resolution proof photo (JPG, PNG, or WebP) is required.' }, 400);
    }

    const atrNotes = String(fields.atr_notes || fields.remarks || fields.notes || '').trim();
    const materialsUsed = String(fields.materials_used || '').trim();
    if (!isDraftOnly && !atrNotes) {
      return json({ detail: 'Action Taken Report (ATR) notes are required when submitting resolution proof.' }, 400);
    }

    const gps = resolveProofGps(fields, uploadedFiles, c, { required: !isDraftOnly });
    if (gps.error) return json({ detail: gps.error }, gps.status || 400);

    const nowIso = new Date().toISOString();
    const prev = c.status;

    c.resolution_proof = [...(c.resolution_proof || []), ...savedUrls];
    if (atrNotes) {
      c.resolution_remarks = materialsUsed ? `${atrNotes} [Materials: ${materialsUsed}]` : atrNotes;
    }
    if (materialsUsed) {
      c.resolution_materials = materialsUsed;
    }
    if (!c.proof_records) c.proof_records = [];
    const newRecords = uploadedFiles.map((f) => {
      const rec = {
        id: makeId('prf'),
        stage: 'team_resolution',
        url: f.url,
        file_name: f.file_name,
        file_size_bytes: f.file_size_bytes,
        mime_type: f.mime_type,
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        actor_role: 'team_lead',
        latitude: gps.latitude,
        longitude: gps.longitude,
        gps_accuracy_m: gps.gps_accuracy_m,
        gps_source: gps.gps_source,
        distance_meters: gps.distance_meters,
        geofence_status: gps.geofence_status,
        materials_used: materialsUsed || null,
        captured_at: gps.captured_at,
        notes: atrNotes || 'Progress resolution proof photo uploaded.',
      };
      c.proof_records.push(rec);
      return rec;
    });

    c.updated_at = nowIso;

    if (isDraftOnly) {
      if (c.status === 'team_assigned' || c.status === 'redressal_rework') {
        c.status = 'work_in_progress';
        c.status_history.push({
          from_status: prev,
          to_status: 'work_in_progress',
          remarks: `Team Lead ${user.name} (${team.name}) staged ${savedUrls.length} resolution proof photo(s) while work is in progress.${atrNotes ? ` Note: ${atrNotes}` : ''}`,
          actor_role: 'team_lead',
          actor_name: user.name,
          created_at: nowIso,
        });
      }
      pushAudit(store, 'team_resolution_proof_staged', c.id, user, {
        team_id: team.id,
        photos: savedUrls.length,
        latitude: gps.latitude,
        longitude: gps.longitude,
        materials_used: materialsUsed || null,
      });
      return json({
        ...buildComplaintDetail(c, store),
        uploaded_proofs: newRecords,
        submitted_for_verification: false,
      }, 201);
    }

    // Automatically route back to the Inspection Officer (initial inspector, or first dept inspector)
    let verifier = store.officers.find((o) => o.id === (c.verification_inspector_id || c.assigned_inspector_id));
    if (!verifier || verifier.is_active === false) {
      verifier = store.officers.find(
        (o) => o.department_id === c.department_id && o.role === 'inspection_officer' && o.is_active !== false
      );
    }

    c.verification_inspector_id = verifier?.id || c.assigned_inspector_id || null;
    c.status = 'verification_assigned';
    c.rework_reason = null;

    const totalPhotos = savedUrls.length || existingResProofs.length;
    c.status_history.push({
      from_status: prev,
      to_status: 'verification_assigned',
      remarks: `Team Lead ${user.name} (${team.name}) submitted ${totalPhotos} resolution proof photo(s) & ATR: ${atrNotes}${materialsUsed ? ` (Materials: ${materialsUsed})` : ''}. Routed to ${verifier?.name || 'Inspection Officer'} for post-repair site verification.`,
      actor_role: 'team_lead',
      actor_name: user.name,
      created_at: nowIso,
    });

    if (verifier?.user_id) {
      pushNotification(
        store,
        verifier.user_id,
        `Post-Repair Verification Needed (${c.complaint_number})`,
        `${team.name} completed repair for "${c.title}" and uploaded proof. Please inspect site to verify.`
      );
    }
    const nodal = store.officers.find(
      (o) => o.department_id === c.department_id && o.role === 'nodal_officer' && o.is_active !== false
    );
    if (nodal?.user_id) {
      pushNotification(
        store,
        nodal.user_id,
        `Resolution Proof Submitted (${c.complaint_number})`,
        `${team.name} submitted resolution proof for "${c.title}". Assigned to ${verifier?.name || 'Inspector'} for verification.`
      );
    }

    pushAudit(store, 'resolution_proof_submitted', c.id, user, {
      team_id: team.id,
      photos: totalPhotos,
      latitude: gps.latitude,
      longitude: gps.longitude,
      gps_source: gps.gps_source,
      distance_meters: gps.distance_meters,
      materials_used: materialsUsed || null,
    });
    return json({
      ...buildComplaintDetail(c, store),
      uploaded_proofs: newRecords,
      submitted_for_verification: true,
    });
  }

  // ── COMPLAINTS (CITIZEN & SHARED) ──────────────────────────────────────────
  if (path === '/complaints/preview-ai' && method === 'GET') {
    const desc = url.searchParams.get('description') || '';
    return json(classifyText(desc));
  }

  if (path === '/complaints/check-similar' && method === 'GET') {
    const desc = (url.searchParams.get('description') || '').toLowerCase();
    const words = desc.split(/\W+/).filter((w) => w.length > 3);
    const similar = store.complaints
      .map((c) => {
        const target = `${c.title} ${c.description} ${c.category}`.toLowerCase();
        const matches = words.filter((w) => target.includes(w)).length;
        const score = words.length > 0 ? Math.min(0.95, (matches / Math.max(words.length, 3)) * 1.1) : 0;
        return {
          complaint_id: c.id,
          title: c.title,
          description: c.description,
          category: c.category,
          status: c.status,
          similarity_score: Number(score.toFixed(2)),
        };
      })
      .filter((item) => item.similarity_score >= 0.35)
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, 3);
    return json({ has_similar: similar.length > 0, similar_complaints: similar });
  }

  if (path === '/complaints/verify-priority' && method === 'POST') {
    const urgency = Number(url.searchParams.get('urgency') || 3);
    const severity = Number(url.searchParams.get('severity') || 3);
    const upvotes = Number(url.searchParams.get('upvotes') || 0);
    const score = Number((0.45 * urgency + 0.45 * severity + Math.min(1, upvotes / 20)).toFixed(2));
    const priority = score >= 4 ? 'Critical' : score >= 3 ? 'High' : score >= 2 ? 'Medium' : 'Low';
    return json({ priority, score, explanation: 'Computed from urgency, severity, and citizen upvotes.' });
  }

  if (path === '/complaints/public/feed' && method === 'GET') {
    const category = url.searchParams.get('category') || '';
    const sortBy = url.searchParams.get('sort_by') || 'recent';
    let list = store.complaints.filter((c) => c.is_public !== false);
    if (category) {
      list = list.filter((c) => c.category === category);
    }
    const prioRank = { critical: 4, high: 3, medium: 2, low: 1 };
    if (sortBy === 'upvotes') {
      list = [...list].sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
    } else if (sortBy === 'priority') {
      list = [...list].sort((a, b) => (prioRank[b.priority] || 0) - (prioRank[a.priority] || 0));
    } else {
      list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return json(list);
  }

  if (path === '/complaints/my' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const statusFilter = url.searchParams.get('status_filter');
    let list = store.complaints.filter((c) => c.citizen_id === user.id);
    if (statusFilter) {
      const norm = normalizeStatusInput(statusFilter);
      list = list.filter((c) => c.status === norm);
    }
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(list.map((c) => buildComplaintDetail(c, store)));
  }

  // Step 1 & 2: Citizen lodges complaint -> AI detects department -> routes to Nodal Officer intake (`submitted`)
  if ((path === '/complaints' || path === '/complaints/') && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const body = await parseJsonBody(request);
    if (!body.title || !body.description) {
      return json({ detail: 'Title and description are required' }, 400);
    }
    const ai = classifyText(`${body.title} ${body.description}`);
    const dept = store.departments.find((d) => d.id === ai.department_id) || store.departments[0];
    const nodalOfficer =
      store.officers.find((o) => o.department_id === dept.id && o.role === 'nodal_officer' && o.is_active !== false) ||
      store.officers.find((o) => o.department_id === dept.id);

    const nowIso = new Date().toISOString();
    const slaHours = ai.priority === 'High' ? 48 : ai.priority === 'Low' ? 168 : 72;
    const deadlineIso = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
    const num = store.seq++;
    const lat = parseCoordinate(body.latitude, Number((19.018 + (Math.random() - 0.5) * 0.04).toFixed(6)));
    const lng = parseCoordinate(body.longitude, Number((72.845 + (Math.random() - 0.5) * 0.03).toFixed(6)));

    const newComplaint = {
      id: `cmp-2026-00${num}`,
      complaint_number: `SS-2026-00${num}`,
      citizen_id: user.id,
      title: body.title,
      description: body.description,
      category: ai.category,
      sub_category: 'General Civic',
      ai_category: ai.category,
      ai_confidence: ai.confidence,
      ai_summary: `AI routed to ${dept.name} (${Math.round(ai.confidence * 100)}% confidence). Awaiting Nodal Officer inspection dispatch.`,
      priority: ai.priority.toLowerCase(),
      priority_score: Number((1.5 + ai.urgency * 0.25).toFixed(2)),
      urgency_score: ai.urgency,
      sentiment_score: -0.5,
      upvotes: 1,
      vote_count: 1,
      upvoted_by: [user.id],
      is_public: body.is_public !== false,
      location: body.location || 'Mumbai',
      address: body.location || 'Mumbai',
      ward: body.ward || user.ward || 'Ward 12 - Dadar',
      city: 'Mumbai',
      state: 'Maharashtra',
      latitude: lat,
      longitude: lng,
      status: 'submitted',
      department_id: dept.id,
      department_name: dept.name,
      nodal_officer_id: nodalOfficer?.id || null,
      assigned_officer_id: nodalOfficer?.id || null,
      assigned_inspector_id: null,
      verification_inspector_id: null,
      assigned_team_id: null,
      deadline: deadlineIso,
      sla_deadline: deadlineIso,
      sla_breached: false,
      created_at: nowIso,
      updated_at: nowIso,
      resolved_at: null,
      resolution_remarks: null,
      attachments: [],
      inspection_images: [],
      resolution_proof: [],
      verification_proof: [],
      proof_records: [],
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: `Grievance registered by citizen. AI detected ${dept.name} (${Math.round(ai.confidence * 100)}% confidence) and routed to Nodal Officer intake.`,
          actor_role: 'citizen',
          actor_name: user.name,
          created_at: nowIso,
        },
      ],
    };

    store.complaints.unshift(newComplaint);
    pushNotification(
      store,
      user.id,
      `Grievance ${newComplaint.complaint_number} Registered`,
      `AI routed your grievance to ${dept.name} Nodal Officer for inspection assignment.`
    );
    if (nodalOfficer?.user_id) {
      pushNotification(
        store,
        nodalOfficer.user_id,
        `New Grievance Intake (${newComplaint.complaint_number})`,
        `AI routed "${newComplaint.title}" (${newComplaint.ward}) to your department. Assign an Inspection Officer.`
      );
    }
    pushAudit(store, 'complaint_created', newComplaint.id, user, { department_id: dept.id, priority: newComplaint.priority });
    return json(buildComplaintDetail(newComplaint, store), 201);
  }

  if (segments[0] === 'complaints' && segments[1] && segments.length === 2 && method === 'GET') {
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (user && !canUserAccessComplaint(user, c, store)) {
      return json({ detail: 'Forbidden: You do not have permission to view this assigned grievance' }, 403);
    }
    return json(buildComplaintDetail(c, store));
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'history' && method === 'GET') {
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (user && !canUserAccessComplaint(user, c, store)) {
      return json({ detail: 'Forbidden' }, 403);
    }
    return json(c.status_history || []);
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'upload-images' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (c.citizen_id !== user.id && !requireAdmin(user)) {
      return json({ detail: 'Forbidden' }, 403);
    }
    const parsed = await parseProofMultipart(request, `complaints/${c.id}`);
    if (parsed.error) return json({ detail: parsed.error }, parsed.status || 400);
    const urls = parsed.savedUrls;
    c.attachments = [...(c.attachments || []), ...urls];
    if (!c.proof_records) c.proof_records = [];
    const nowIso = new Date().toISOString();
    urls.forEach((proofUrl) => {
      c.proof_records.push({
        id: makeId('prf'),
        stage: 'citizen_proof',
        url: proofUrl,
        uploaded_by: user.id,
        uploaded_by_name: user.name,
        actor_role: 'citizen',
        latitude: c.latitude,
        longitude: c.longitude,
        captured_at: nowIso,
        notes: 'Citizen initial grievance evidence photo.',
      });
    });
    return json({ uploaded: urls, attachments: c.attachments });
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'upvote' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (!c.upvoted_by) c.upvoted_by = [];
    if (!c.upvoted_by.includes(user.id)) {
      c.upvoted_by.push(user.id);
      c.upvotes = (c.upvotes || 0) + 1;
      c.vote_count = c.upvotes;
    }
    return json({ id: c.id, upvotes: c.upvotes, has_upvoted: true });
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'feedback' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (c.citizen_id !== user.id && !requireAdmin(user)) {
      return json({ detail: 'Forbidden' }, 403);
    }
    const body = await parseJsonBody(request);
    c.citizen_rating = body.rating;
    c.feedback_text = body.feedback_text || '';
    const nextStatus = body.satisfied === false ? 'reopened' : 'closed';
    const prev = c.status;
    c.status = nextStatus;
    c.updated_at = new Date().toISOString();
    c.status_history.push({
      from_status: prev,
      to_status: nextStatus,
      remarks: `Citizen rated ${body.rating}/5: ${c.feedback_text}`,
      actor_role: 'citizen',
      actor_name: user.name,
      created_at: c.updated_at,
    });
    return json(buildComplaintDetail(c, store));
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'appeal' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (c.citizen_id !== user.id && !requireAdmin(user)) {
      return json({ detail: 'Forbidden' }, 403);
    }
    const body = await parseJsonBody(request);
    const prev = c.status;
    const nextLevel = c.appeal_level === 1 ? 2 : 1;
    c.appeal_level = nextLevel;
    c.status = nextLevel === 2 ? 'appealed_l2' : 'appealed_l1';
    c.appeal_remarks = body.reason || 'Citizen dissatisfied with resolution.';
    c.deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    c.sla_deadline = c.deadline;
    c.updated_at = new Date().toISOString();
    c.status_history.push({
      from_status: prev,
      to_status: c.status,
      remarks: `Appeal L${nextLevel} filed: ${c.appeal_remarks}`,
      actor_role: 'citizen',
      actor_name: user.name,
      created_at: c.updated_at,
    });
    return json(buildComplaintDetail(c, store));
  }

  // ── LEGACY DEPARTMENT / SUPERVISOR ENDPOINTS (with isolation enforcement) ──
  if (path === '/department/tasks' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const statusFilter = (url.searchParams.get('status_filter') || '').toLowerCase();
    let list = store.complaints.filter((c) => canUserAccessComplaint(user, c, store));
    let tasks = list.map((c) => mapComplaintToTask(c, store));
    if (statusFilter) {
      if (statusFilter === 'appeals') {
        tasks = tasks.filter(
          (t) =>
            String(t.raw_status).startsWith('appealed') ||
            t.raw_status === 'escalated'
        );
      } else {
        tasks = tasks.filter(
          (t) =>
            String(t.status).toLowerCase() === statusFilter ||
            String(t.raw_status).toLowerCase() === normalizeStatusInput(statusFilter)
        );
      }
    }
    return json(tasks);
  }

  if (path === '/department/dashboard/metrics' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const list = store.complaints.filter((c) => canUserAccessComplaint(user, c, store));
    const pending = list.filter((c) => ['submitted', 'verified'].includes(c.status)).length;
    const assigned = list.filter((c) => ['assigned', 'inspection_assigned', 'team_assigned'].includes(c.status)).length;
    const inProgress = list.filter((c) =>
      ['in_progress', 'work_in_progress', 'inspection_submitted', 'inspection_verified', 'verification_assigned', 'verification_submitted', 'reopened'].includes(c.status)
    ).length;
    const completed = list.filter((c) => ['resolved', 'closed'].includes(c.status)).length;
    return json({
      total_assigned: list.length,
      total_tasks: list.length,
      pending_action: pending + assigned,
      pending,
      assigned,
      in_progress: inProgress,
      resolved_count: completed,
      completed,
    });
  }

  if (segments[0] === 'department' && segments[1] === 'tasks' && segments[2] && segments[3] === 'status' && method === 'PUT') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Task not found' }, 404);
    if (!canUserAccessComplaint(user, c, store)) return json({ detail: 'Forbidden' }, 403);
    const body = await parseJsonBody(request);
    const prev = c.status;
    c.status = normalizeStatusInput(body.status);
    c.updated_at = new Date().toISOString();
    const note = body.remarks || body.notes || `Status updated to ${body.status}`;
    if (c.status === 'resolved' || c.status === 'closed') {
      c.resolved_at = c.updated_at;
      c.resolution_remarks = note;
    }
    c.status_history.push({
      from_status: prev,
      to_status: c.status,
      remarks: note,
      actor_role: user.role,
      actor_name: user.name,
      created_at: c.updated_at,
    });
    pushNotification(store, c.citizen_id, `Grievance ${c.complaint_number} Updated`, `Status changed to ${c.status.replace(/_/g, ' ')}: ${note}`);
    return json(mapComplaintToTask(c, store));
  }

  if (segments[0] === 'department' && segments[1] === 'tasks' && segments[2] && segments[3] === 'inspection-proof' && method === 'POST') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Task not found' }, 404);
    if (!canUserAccessComplaint(user, c, store)) return json({ detail: 'Forbidden' }, 403);
    const urls = await saveUploadedFiles(request, `inspection/${c.id}`);
    c.inspection_images = [...(c.inspection_images || []), ...urls];
    return json({ uploaded: urls, inspection_images: c.inspection_images });
  }

  if (segments[0] === 'department' && segments[1] === 'tasks' && segments[2] && segments[3] === 'resolution-proof' && method === 'POST') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Task not found' }, 404);
    if (!canUserAccessComplaint(user, c, store)) return json({ detail: 'Forbidden' }, 403);
    const urls = await saveUploadedFiles(request, `resolution/${c.id}`);
    c.resolution_proof = [...(c.resolution_proof || []), ...urls];
    return json({ uploaded: urls, resolution_proof: c.resolution_proof });
  }

  if (path === '/department/complaints' && method === 'GET') {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    return json(store.complaints.filter((c) => canUserAccessComplaint(user, c, store)).map((c) => buildComplaintDetail(c, store)));
  }

  if (segments[0] === 'department' && segments[1] === 'complaints' && segments[2]) {
    if (!user) return json({ detail: 'Authentication required' }, 401);
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    if (!canUserAccessComplaint(user, c, store)) {
      return json({ detail: 'Forbidden: Task is isolated to another officer or team' }, 403);
    }

    if (segments.length === 3 && method === 'GET') {
      return json(buildComplaintDetail(c, store));
    }
    if (segments[3] === 'history' && method === 'GET') {
      return json(c.status_history || []);
    }
    if (segments[3] === 'status' && method === 'PUT') {
      const body = await parseJsonBody(request);
      const prev = c.status;
      c.status = normalizeStatusInput(body.status);
      c.updated_at = new Date().toISOString();
      const note = body.remarks || body.notes || `Updated to ${c.status}`;
      if (c.status === 'resolved' || c.status === 'closed') {
        c.resolved_at = c.updated_at;
        c.resolution_remarks = note;
      }
      c.status_history.push({
        from_status: prev,
        to_status: c.status,
        remarks: note,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      return json(buildComplaintDetail(c, store));
    }
    if (segments[3] === 'confirm-triage' && method === 'POST') {
      const body = await parseJsonBody(request);
      const isOverride = Boolean(body.override_reason);
      if (body.category) c.category = body.category;
      if (body.priority) c.priority = String(body.priority).toLowerCase();
      c.triage_confirmed = true;
      if (isOverride) store.overrideCount += 1;
      else store.acceptedCount += 1;
      c.status_history.push({
        from_status: c.status,
        to_status: c.status,
        remarks: isOverride
          ? `Nodal Officer overrode AI triage: ${body.override_reason}`
          : 'Nodal Officer confirmed AI triage assessment.',
        actor_role: user.role,
        actor_name: user.name,
        created_at: new Date().toISOString(),
      });
      return json(buildComplaintDetail(c, store));
    }
    if (segments[3] === 'generate-atr' && method === 'POST') {
      return json({
        draft_atr: `Field remediation completed at ${c.location || c.ward} for Grievance #${c.complaint_number} (${c.category}). Corrective municipal maintenance work has been executed per departmental standard operating procedures and site left safe for public use.`,
        summary: 'AI-drafted Action Taken Report',
      });
    }
    if (segments[3] === 'adjudicate-appeal' && method === 'POST') {
      if (!['supervisor', 'admin', 'super_admin'].includes(user.role)) {
        return json({ detail: 'Forbidden: Supervisor access required' }, 403);
      }
      const body = await parseJsonBody(request);
      const prev = c.status;
      if (body.decision === 'final_close') {
        c.status = 'closed';
        c.resolved_at = new Date().toISOString();
      } else {
        c.status = 'redressal_rework';
        c.rework_reason = `Appellate Order: ${body.notes}`;
        c.deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        c.sla_deadline = c.deadline;
      }
      c.updated_at = new Date().toISOString();
      c.status_history.push({
        from_status: prev,
        to_status: c.status,
        remarks: `Appellate Order (${body.decision}): ${body.notes}`,
        actor_role: user.role,
        actor_name: user.name,
        created_at: c.updated_at,
      });
      return json(buildComplaintDetail(c, store));
    }
    if (segments[3] === 'upload-proof' && method === 'POST') {
      const urls = await saveUploadedFiles(request, `proof/${c.id}`);
      c.resolution_proof = [...(c.resolution_proof || []), ...urls];
      return json({ uploaded: urls, resolution_proof: c.resolution_proof });
    }
    if (segments[3] === 'swarm-resolve' && method === 'POST') {
      return json({ resolved_count: 1, message: 'Linked cluster grievances synchronized.' });
    }
  }

  // ── ADMIN (DEPARTMENTS, FIELD TEAMS, MULTI-ROLE OFFICERS) ──────────────────
  if (path === '/admin/stats' && method === 'GET') {
    const by_category = {};
    const by_priority = { critical: 0, high: 0, medium: 0, low: 0 };
    const by_status = {};
    store.complaints.forEach((c) => {
      by_category[c.category] = (by_category[c.category] || 0) + 1;
      const p = String(c.priority || 'medium').toLowerCase();
      by_priority[p] = (by_priority[p] || 0) + 1;
      by_status[c.status] = (by_status[c.status] || 0) + 1;
    });
    return json({ total: store.complaints.length, by_category, by_priority, by_status });
  }

  if (path === '/admin/stats/summary' && method === 'GET') {
    const total = store.complaints.length;
    const resolved = store.complaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length;
    const active = total - resolved;
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return json({
      total_complaints: total,
      active_complaints: active,
      resolved_complaints: resolved,
      total_tasks: total,
      tasks_completed: resolved,
      resolution_rate: rate,
    });
  }

  if (path === '/admin/sla/run-sweep' && method === 'POST') {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    return json({
      warned_75_pct: 1,
      breached_escalated: 0,
      auto_closed_7d: 0,
      swept_at: new Date().toISOString(),
    });
  }

  if (path === '/admin/complaints' && method === 'GET') {
    return json({
      complaints: store.complaints.map((c) => buildComplaintDetail(c, store)),
      total: store.complaints.length,
      page: 1,
    });
  }

  if (path === '/admin/tasks' && method === 'GET') {
    return json(store.complaints.map((c) => mapComplaintToTask(c, store)));
  }

  if (path === '/admin/audit-logs' && method === 'GET') {
    return json(store.auditLogs);
  }

  if (path === '/admin/insights/clusters' && method === 'GET') {
    return json([
      {
        insight_name: 'Dadar Road & Footpath Infrastructure Cluster',
        category: 'Roads & Transport',
        support_count: 5,
        count: 5,
        locations: ['Ward 12 - Dadar', 'Senapati Bapat Marg', 'Ranade Road'],
        top_keywords: ['pothole', 'footpath', 'drain cover', 'curb'],
      },
      {
        insight_name: 'Andheri West Water Quality Alert',
        category: 'Water Supply',
        support_count: 1,
        count: 1,
        locations: ['Ward 8 - Andheri', 'Shivaji Nagar'],
        top_keywords: ['contaminated', 'muddy water', 'foul odor'],
      },
    ]);
  }

  if (path === '/admin/departments' && method === 'GET') {
    const enriched = store.departments.map((d) => ({
      ...d,
      officer_count: store.officers.filter((o) => o.department_id === d.id && o.is_active !== false).length,
      team_count: store.teams.filter((t) => t.department_id === d.id && t.is_active !== false).length,
    }));
    return json(enriched);
  }

  if (path === '/admin/departments' && method === 'POST') {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const body = await parseJsonBody(request);
    if (!body.name) return json({ detail: 'Department name is required' }, 400);
    const dept = {
      id: makeId('dept'),
      name: body.name,
      code: body.code || `dept_${Date.now()}`,
      description: body.description || '',
      contact_email: body.contact_email || '',
      contact_phone: body.contact_phone || '',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: Number(body.sla_high) || 24,
      sla_medium: Number(body.sla_medium) || 72,
      sla_low: Number(body.sla_low) || 168,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    store.departments.unshift(dept);
    return json(dept, 201);
  }

  if (segments[0] === 'admin' && segments[1] === 'departments' && segments[2]) {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const idx = store.departments.findIndex((d) => d.id === segments[2]);
    if (idx === -1) return json({ detail: 'Department not found' }, 404);
    if (method === 'PUT') {
      const body = await parseJsonBody(request);
      store.departments[idx] = { ...store.departments[idx], ...body };
      return json(store.departments[idx]);
    }
    if (method === 'DELETE') {
      store.departments.splice(idx, 1);
      return json({ ok: true });
    }
  }

  // Admin Field Teams CRUD
  if (path === '/admin/teams' && method === 'GET') {
    const deptId = url.searchParams.get('department_id');
    let list = store.teams;
    if (deptId) list = list.filter((t) => t.department_id === deptId);
    const enriched = list.map((t) => {
      const dept = store.departments.find((d) => d.id === t.department_id);
      const lead = store.officers.find((o) => o.id === t.team_lead_officer_id);
      return {
        ...t,
        department_name: dept?.name || t.department_name || '',
        team_lead_name: lead?.name || t.team_lead_name || 'Unassigned',
        active_work_orders: getActiveCountForTeam(store, t.id),
      };
    });
    return json(enriched);
  }

  if (path === '/admin/teams' && method === 'POST') {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const body = await parseJsonBody(request);
    if (!body.name || !body.department_id) {
      return json({ detail: 'Team name and department are required' }, 400);
    }
    const dept = store.departments.find((d) => d.id === body.department_id);
    if (!dept) return json({ detail: 'Department not found' }, 404);

    const leadOfficer = body.team_lead_officer_id
      ? store.officers.find((o) => o.id === body.team_lead_officer_id)
      : null;

    const wards = Array.isArray(body.ward_coverage)
      ? body.ward_coverage
      : String(body.ward_coverage || '')
          .split(',')
          .map((w) => w.trim())
          .filter(Boolean);

    const team = {
      id: makeId('team'),
      name: body.name,
      code: body.code || `TEAM-${Date.now().toString().slice(-4)}`,
      department_id: dept.id,
      department_name: dept.name,
      team_lead_officer_id: leadOfficer?.id || null,
      team_lead_user_id: leadOfficer?.user_id || null,
      team_lead_name: leadOfficer?.name || 'Unassigned',
      ward_coverage: wards,
      specialization: body.specialization || 'General Civic Maintenance',
      member_count: Number(body.member_count) || 6,
      daily_capacity: Number(body.daily_capacity) || 10,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    store.teams.unshift(team);

    if (leadOfficer) {
      leadOfficer.team_id = team.id;
      leadOfficer.team_name = team.name;
      const u = store.users.find((usr) => usr.id === leadOfficer.user_id);
      if (u) u.team_id = team.id;
    }

    return json(team, 201);
  }

  if (segments[0] === 'admin' && segments[1] === 'teams' && segments[2]) {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const idx = store.teams.findIndex((t) => t.id === segments[2]);
    if (idx === -1) return json({ detail: 'Team not found' }, 404);
    if (method === 'PUT') {
      const body = await parseJsonBody(request);
      const current = store.teams[idx];
      const dept = body.department_id
        ? store.departments.find((d) => d.id === body.department_id)
        : store.departments.find((d) => d.id === current.department_id);
      const leadOfficer =
        body.team_lead_officer_id !== undefined
          ? store.officers.find((o) => o.id === body.team_lead_officer_id)
          : store.officers.find((o) => o.id === current.team_lead_officer_id);

      const wards =
        body.ward_coverage !== undefined
          ? Array.isArray(body.ward_coverage)
            ? body.ward_coverage
            : String(body.ward_coverage)
                .split(',')
                .map((w) => w.trim())
                .filter(Boolean)
          : current.ward_coverage;

      store.teams[idx] = {
        ...current,
        name: body.name ?? current.name,
        code: body.code ?? current.code,
        department_id: dept?.id || current.department_id,
        department_name: dept?.name || current.department_name,
        team_lead_officer_id: leadOfficer?.id || null,
        team_lead_user_id: leadOfficer?.user_id || null,
        team_lead_name: leadOfficer?.name || 'Unassigned',
        ward_coverage: wards,
        specialization: body.specialization ?? current.specialization,
        member_count: body.member_count !== undefined ? Number(body.member_count) : current.member_count,
        daily_capacity: body.daily_capacity !== undefined ? Number(body.daily_capacity) : current.daily_capacity,
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : current.is_active,
      };
      if (leadOfficer) {
        leadOfficer.team_id = store.teams[idx].id;
        leadOfficer.team_name = store.teams[idx].name;
        const u = store.users.find((usr) => usr.id === leadOfficer.user_id);
        if (u) u.team_id = store.teams[idx].id;
      }
      return json(store.teams[idx]);
    }
    if (method === 'DELETE') {
      store.teams[idx].is_active = false;
      return json({ ok: true });
    }
  }

  // Admin Officers CRUD (with multi-role support: nodal_officer | inspection_officer | team_lead | supervisor)
  if (path === '/admin/officers' && method === 'GET') {
    const deptId = url.searchParams.get('department_id');
    const roleFilter = url.searchParams.get('role');
    let list = store.officers;
    if (deptId) list = list.filter((o) => o.department_id === deptId);
    if (roleFilter) list = list.filter((o) => (o.role || o.officer_role) === roleFilter);
    const enriched = list.map((o) => {
      const team = o.team_id ? store.teams.find((t) => t.id === o.team_id) : null;
      return {
        ...o,
        role: o.role || o.officer_role || 'nodal_officer',
        team_name: team?.name || o.team_name || null,
        current_active_count:
          o.role === 'inspection_officer'
            ? getActiveCountForInspector(store, o.id)
            : o.role === 'team_lead' && o.team_id
            ? getActiveCountForTeam(store, o.team_id)
            : store.complaints.filter((c) => c.department_id === o.department_id && !['resolved', 'closed'].includes(c.status)).length,
      };
    });
    return json(enriched);
  }

  if (path === '/admin/officers' && method === 'POST') {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const body = await parseJsonBody(request);
    if (!body.name || !body.email || !body.department_id) {
      return json({ detail: 'Name, email, and department are required' }, 400);
    }
    const emailLower = String(body.email).trim().toLowerCase();
    if (store.users.some((u) => u.email.toLowerCase() === emailLower)) {
      return json({ detail: 'An account with this email already exists' }, 409);
    }

    const allowedRoles = ['nodal_officer', 'inspection_officer', 'team_lead', 'supervisor'];
    const officerRole = allowedRoles.includes(body.role) ? body.role : 'inspection_officer';
    const dept = store.departments.find((d) => d.id === body.department_id);
    const team = body.team_id ? store.teams.find((t) => t.id === body.team_id) : null;

    const newUserId = makeId('user-off');
    const newOfficerId = makeId('off');

    store.users.push({
      id: newUserId,
      email: emailLower,
      name: body.name,
      full_name: body.name,
      phone: body.phone || '',
      password: body.password || 'demo123',
      role: officerRole,
      department_id: body.department_id,
      officer_id: newOfficerId,
      team_id: officerRole === 'team_lead' ? team?.id || null : null,
      is_active: true,
      is_verified: true,
    });

    const officer = {
      id: newOfficerId,
      user_id: newUserId,
      name: body.name,
      email: emailLower,
      phone: body.phone || '',
      role: officerRole,
      officer_role: officerRole,
      department_id: body.department_id,
      department_name: dept?.name || '',
      team_id: officerRole === 'team_lead' ? team?.id || null : null,
      team_name: officerRole === 'team_lead' ? team?.name || null : null,
      employee_id: body.employee_id || `EMP-${Date.now().toString().slice(-4)}`,
      designation:
        body.designation ||
        (officerRole === 'nodal_officer'
          ? 'Nodal Officer'
          : officerRole === 'inspection_officer'
          ? 'Field Inspection Officer'
          : officerRole === 'team_lead'
          ? 'Field Team Lead'
          : 'Appellate Supervisor'),
      jurisdiction_wards: [],
      max_active_complaints: 15,
      total_resolved: 0,
      rating: 4.5,
      is_active: true,
    };
    store.officers.unshift(officer);

    if (officerRole === 'team_lead' && team) {
      team.team_lead_officer_id = newOfficerId;
      team.team_lead_user_id = newUserId;
      team.team_lead_name = body.name;
    }

    return json(officer, 201);
  }

  if (segments[0] === 'admin' && segments[1] === 'officers' && segments[2]) {
    if (!requireAdmin(user)) return json({ detail: 'Admin access required' }, 403);
    const idx = store.officers.findIndex((o) => o.id === segments[2]);
    if (idx === -1) return json({ detail: 'Officer not found' }, 404);
    if (method === 'PUT') {
      const body = await parseJsonBody(request);
      const deptId = body.department_id ?? url.searchParams.get('department_id');
      const designation = body.designation ?? url.searchParams.get('designation');
      const roleVal = body.role ?? url.searchParams.get('role');
      const teamId = body.team_id !== undefined ? body.team_id : url.searchParams.get('team_id');
      const isActiveParam = body.is_active !== undefined ? String(body.is_active) : url.searchParams.get('is_active');

      const officer = store.officers[idx];
      const linkedUser = store.users.find((u) => u.id === officer.user_id);

      if (deptId) {
        officer.department_id = deptId;
        officer.department_name = store.departments.find((d) => d.id === deptId)?.name || '';
        if (linkedUser) linkedUser.department_id = deptId;
      }
      if (designation !== null && designation !== undefined) {
        officer.designation = designation;
      }
      if (roleVal && ['nodal_officer', 'inspection_officer', 'team_lead', 'supervisor'].includes(roleVal)) {
        officer.role = roleVal;
        officer.officer_role = roleVal;
        if (linkedUser) linkedUser.role = roleVal;
      }
      if (teamId !== null && teamId !== undefined) {
        const team = teamId ? store.teams.find((t) => t.id === teamId) : null;
        officer.team_id = team?.id || null;
        officer.team_name = team?.name || null;
        if (linkedUser) linkedUser.team_id = team?.id || null;
        if (team) {
          team.team_lead_officer_id = officer.id;
          team.team_lead_user_id = officer.user_id;
          team.team_lead_name = officer.name;
        }
      }
      if (isActiveParam !== null && isActiveParam !== undefined) {
        officer.is_active = isActiveParam === 'true';
        if (linkedUser) linkedUser.is_active = officer.is_active;
      }
      return json(officer);
    }
    if (method === 'DELETE') {
      store.officers[idx].is_active = false;
      const linkedUser = store.users.find((u) => u.id === store.officers[idx].user_id);
      if (linkedUser) linkedUser.is_active = false;
      return json({ ok: true });
    }
  }

  if (path === '/admin/users' && method === 'GET') {
    const role = url.searchParams.get('role');
    let list = store.users.map(sanitizeUser);
    if (role) list = list.filter((u) => u.role === role);
    return json(list);
  }

  if (path === '/admin/mappings' && method === 'GET') return json(store.mappings);
  if (path === '/admin/sla' && method === 'GET') return json(store.slaRules);

  // ── ANALYTICS ──────────────────────────────────────────────────────────────
  if (path === '/analytics/map-data' && method === 'GET') {
    const deptId = url.searchParams.get('department_id');
    let list = store.complaints;
    let deptName = null;
    if (user && ['inspection_officer', 'team_lead'].includes(user.role)) {
      list = list.filter((c) => canUserAccessComplaint(user, c, store));
    } else if (user && user.role === 'nodal_officer' && user.department_id) {
      list = list.filter((c) => c.department_id === user.department_id);
      deptName = store.departments.find((d) => d.id === user.department_id)?.name || null;
    } else if (deptId) {
      list = list.filter((c) => c.department_id === deptId);
      deptName = store.departments.find((d) => d.id === deptId)?.name || null;
    }
    return json({
      complaints: list,
      total: list.length,
      departments: store.departments,
      department_filter: deptName,
    });
  }

  if (path === '/analytics/departments/performance' && method === 'GET') {
    const perf = store.departments.map((d) => {
      const deptComplaints = store.complaints.filter((c) => c.department_id === d.id);
      const resolved = deptComplaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length;
      const breached = deptComplaints.filter((c) => c.sla_breached).length;
      return {
        department_id: d.id,
        department_name: d.name,
        total_complaints: Math.max(deptComplaints.length, 3),
        resolved_complaints: Math.max(resolved, 2),
        sla_breach_rate: deptComplaints.length ? Math.round((breached / deptComplaints.length) * 100) : 4,
        avg_resolution_time_hours: d.sla_medium ? Math.round(d.sla_medium * 0.45) : 18,
        avg_citizen_rating: 4.6,
        feedback_count: 14,
      };
    });
    return json(perf);
  }

  if (path === '/analytics/smart-alerts' && method === 'GET') {
    return json([
      {
        alert_id: 'alert-001',
        type: 'HEALTH_RISK_SPIKE',
        severity: 'CRITICAL',
        title: 'Water Contamination Alert — Ward 8 (Andheri West)',
        message: 'Critical drinking water contamination grievance SS-2026-001002 has 28 citizen upvotes and approaches statutory SLA deadline.',
        related_complaint_ids: ['SS-2026-001002'],
      },
      {
        alert_id: 'alert-002',
        type: 'INFRASTRUCTURE_CLUSTER',
        severity: 'HIGH',
        title: 'Road & Footpath Hazard Cluster — Ward 12 (Dadar)',
        message: 'Multiple active road safety and open drain complaints concentrated within a 600m radius of Dadar station.',
        related_complaint_ids: ['SS-2026-001010', 'SS-2026-001013', 'SS-2026-001015'],
      },
    ]);
  }

  if (path === '/analytics/summary' && method === 'GET') {
    const total = store.complaints.length;
    const resolved = store.complaints.filter((c) => ['resolved', 'closed'].includes(c.status)).length;
    return json({ total, resolved, active: total - resolved });
  }

  // ── AI INSIGHTS ────────────────────────────────────────────────────────────
  if (path === '/ai/admin/model-health' && method === 'GET') {
    return json({
      distilbert: true,
      sbert: true,
      yolo: true,
      total_inferences: store.inferenceCount,
      avg_latency_ms: 42,
      fallback_rate: 0,
    });
  }

  if (path === '/ai/admin/override-stats' && method === 'GET') {
    const total = store.acceptedCount + store.overrideCount;
    return json({
      total_suggestions: total,
      accepted: store.acceptedCount,
      overridden: store.overrideCount,
      pending: store.complaints.filter((c) => !c.triage_confirmed).length,
      override_rate: total > 0 ? Number(((store.overrideCount / total) * 100).toFixed(1)) : 0,
    });
  }

  if (path === '/ai/admin/hotspots' && method === 'GET') {
    return json([
      { ward: 'Ward 12 - Dadar', count: 6, category: 'Roads & Transport', lat: 19.018, lng: 72.848 },
      { ward: 'Ward 14 - Mahim', count: 2, category: 'Roads & Transport', lat: 19.038, lng: 72.841 },
      { ward: 'Ward 8 - Andheri', count: 1, category: 'Water Supply', lat: 19.129, lng: 72.836 },
    ]);
  }

  if (path === '/ai/officer/queue' && method === 'GET') {
    const visible = user
      ? store.complaints.filter((c) => canUserAccessComplaint(user, c, store))
      : store.complaints;
    const active = visible
      .filter((c) => !['resolved', 'closed', 'rejected'].includes(c.status))
      .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
      .map((c) => ({
        complaint_id: c.id,
        complaint_title: c.title,
        ward: c.ward,
        priority_score: c.priority_score,
        sla_deadline: c.sla_deadline,
        category: c.category,
        priority: c.priority,
      }));
    return json(active);
  }

  if (segments[0] === 'ai' && segments[1] === 'complaint' && segments[2]) {
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    const sub = segments[3];
    if (sub === 'summary' || sub === 'rerun') {
      return json({
        pipeline_status: 'completed',
        ai_confidence: c.ai_confidence || 0.94,
        text_analysis: {
          category: c.ai_category || c.category,
          urgency_level: c.priority === 'critical' ? 'Critical' : c.priority === 'high' ? 'High' : 'Medium',
          severity_level: c.priority === 'critical' ? 'Severe' : 'Moderate',
        },
        priority: { score: c.priority_score || 2.1, priority: c.priority },
        routing: { department_name: c.department_name || c.category, confidence: c.ai_confidence || 0.94 },
        sla_risk: { risk_level: c.priority === 'critical' ? 'High' : 'Low', probability: c.priority === 'critical' ? 0.72 : 0.18 },
      });
    }
    if (sub === 'similar') return json({ similar_complaints: [] });
    if (sub === 'cluster') return json({ cluster_id: null, size: 1, members: [] });
    if (sub === 'priority-explanation') {
      return json({
        score: c.priority_score,
        priority: c.priority,
        factors: ['Civic safety impact', 'Community upvotes', 'Departmental SLA window'],
      });
    }
    if (sub === 'image-analysis') return json({ verified: true, detections: [] });
    if (sub === 'routing') return json({ department_name: c.department_name, confidence: c.ai_confidence });
    if (sub === 'sla-risk') return json({ risk_level: c.priority === 'critical' ? 'High' : 'Low', probability: 0.2 });
  }

  // ── DPDP COMPLIANCE ────────────────────────────────────────────────────────
  if (path === '/citizen/dpdp/export' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    return json({
      user: sanitizeUser(user),
      complaints: store.complaints.filter((c) => c.citizen_id === user.id),
      exported_at: new Date().toISOString(),
    });
  }

  if (path === '/citizen/dpdp/erasure-request' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    return json({ status: 'received', request_id: makeId('dpdp') });
  }

  return json({ detail: `Endpoint not found: ${method} /api${path}` }, 404);
}

export async function GET(request, context) {
  return handleRequest(request, context);
}
export async function POST(request, context) {
  return handleRequest(request, context);
}
export async function PUT(request, context) {
  return handleRequest(request, context);
}
export async function PATCH(request, context) {
  return handleRequest(request, context);
}
export async function DELETE(request, context) {
  return handleRequest(request, context);
}
