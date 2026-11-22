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
} from '@/lib/mockBackend';

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeStatusInput(status) {
  const map = {
    pending: 'submitted',
    submitted: 'submitted',
    verified: 'verified',
    assigned: 'assigned',
    'in progress': 'in_progress',
    in_progress: 'in_progress',
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

async function saveUploadedFiles(request, prefix) {
  const store = getStore();
  const savedUrls = [];
  try {
    const formData = await request.formData();
    const files = formData.getAll('files');
    for (const file of files) {
      if (file && typeof file.arrayBuffer === 'function') {
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = (file.name || 'upload.jpg').split('.').pop() || 'jpg';
        const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        store.media.set(key, {
          buffer,
          mimeType: file.type || 'image/jpeg',
        });
        savedUrls.push(`/api/media/${key}`);
      }
    }
  } catch {
    // Fallback if non-multipart
  }
  return savedUrls;
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
    const key = segments.slice(1).join('/');
    const stored = store.media.get(key);
    if (stored) {
      return new NextResponse(stored.buffer, {
        status: 200,
        headers: { 'Content-Type': stored.mimeType, 'Cache-Control': 'private, max-age=3600' },
      });
    }
    const svg = generatePlaceholderSvg(key.split('/').pop() || 'Evidence');
    return new NextResponse(svg, {
      status: 200,
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
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
    return json({ access_token, token_type: 'bearer', user: sanitizeUser(found) });
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
    return json({ access_token, token_type: 'bearer', user: sanitizeUser(newUser) }, 201);
  }

  if (path === '/auth/logout' && method === 'POST') {
    return json({ message: 'Logged out successfully' });
  }

  if (path === '/auth/me' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    return json(sanitizeUser(user));
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
    const n = store.notifications.find((item) => item.id === segments[1]);
    if (n) n.is_read = true;
    return json({ ok: true });
  }

  // ── COMPLAINTS (CITIZEN) ───────────────────────────────────────────────────
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
    return json(list);
  }

  if ((path === '/complaints' || path === '/complaints/') && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const body = await parseJsonBody(request);
    if (!body.title || !body.description) {
      return json({ detail: 'Title and description are required' }, 400);
    }
    const ai = classifyText(`${body.title} ${body.description}`);
    const dept = store.departments.find((d) => d.id === ai.department_id) || store.departments[0];
    const officer = store.officers.find((o) => o.department_id === dept.id) || store.officers[0];
    const nowIso = new Date().toISOString();
    const slaHours = ai.priority === 'High' ? 48 : ai.priority === 'Low' ? 168 : 72;
    const deadlineIso = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
    const num = store.seq++;
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
      ai_summary: `AI classified as ${ai.category} (${Math.round(ai.confidence * 100)}% confidence).`,
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
      latitude: body.latitude ?? 19.076 + (Math.random() - 0.5) * 0.08,
      longitude: body.longitude ?? 72.8777 + (Math.random() - 0.5) * 0.06,
      status: 'assigned',
      department_id: dept.id,
      department_name: dept.name,
      assigned_officer_id: officer?.id || null,
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
      triage_confirmed: false,
      status_history: [
        {
          from_status: null,
          to_status: 'submitted',
          remarks: 'Grievance registered by citizen.',
          actor_role: 'citizen',
          created_at: nowIso,
        },
        {
          from_status: 'submitted',
          to_status: 'assigned',
          remarks: `Auto-routed by AI to ${dept.name} (${Math.round(ai.confidence * 100)}% confidence).`,
          actor_role: 'system',
          created_at: nowIso,
        },
      ],
    };
    store.complaints.unshift(newComplaint);
    store.notifications.unshift({
      id: makeId('notif'),
      user_id: user.id,
      title: `Grievance ${newComplaint.complaint_number} Registered`,
      body: `Routed to ${dept.name} with ${ai.priority} priority.`,
      is_read: false,
      created_at: nowIso,
    });
    return json(newComplaint, 201);
  }

  if (segments[0] === 'complaints' && segments[1] && segments.length === 2 && method === 'GET') {
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    return json(buildComplaintDetail(c, store));
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'history' && method === 'GET') {
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    return json(c.status_history || []);
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'upload-images' && method === 'POST') {
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
    const urls = await saveUploadedFiles(request, `complaints/${c.id}`);
    c.attachments = [...(c.attachments || []), ...urls];
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
      created_at: c.updated_at,
    });
    return json(buildComplaintDetail(c, store));
  }

  if (segments[0] === 'complaints' && segments[1] && segments[2] === 'appeal' && method === 'POST') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const c = store.complaints.find((item) => item.id === segments[1]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);
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
      created_at: c.updated_at,
    });
    return json(buildComplaintDetail(c, store));
  }

  // ── DEPARTMENT / OFFICER / SUPERVISOR ──────────────────────────────────────
  if (path === '/department/tasks' && method === 'GET') {
    if (!user) return json({ detail: 'Could not validate credentials' }, 401);
    const statusFilter = (url.searchParams.get('status_filter') || '').toLowerCase();
    let list = [...store.complaints];
    if (user.role === 'officer' && user.department_id) {
      const deptFiltered = list.filter((c) => c.department_id === user.department_id);
      if (deptFiltered.length > 0) list = deptFiltered;
    }
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
    let list = [...store.complaints];
    if (user.role === 'officer' && user.department_id) {
      const deptFiltered = list.filter((c) => c.department_id === user.department_id);
      if (deptFiltered.length > 0) list = deptFiltered;
    }
    const pending = list.filter((c) => ['submitted', 'verified'].includes(c.status)).length;
    const assigned = list.filter((c) => c.status === 'assigned').length;
    const inProgress = list.filter((c) => ['in_progress', 'reopened'].includes(c.status)).length;
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
      created_at: c.updated_at,
    });
    store.notifications.unshift({
      id: makeId('notif'),
      user_id: c.citizen_id,
      title: `Grievance ${c.complaint_number} Updated`,
      body: `Status changed to ${c.status.replace('_', ' ')}: ${note}`,
      is_read: false,
      created_at: c.updated_at,
    });
    return json(mapComplaintToTask(c, store));
  }

  if (segments[0] === 'department' && segments[1] === 'tasks' && segments[2] && segments[3] === 'inspection-proof' && method === 'POST') {
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Task not found' }, 404);
    const urls = await saveUploadedFiles(request, `inspection/${c.id}`);
    c.inspection_images = [...(c.inspection_images || []), ...urls];
    return json({ uploaded: urls, inspection_images: c.inspection_images });
  }

  if (segments[0] === 'department' && segments[1] === 'tasks' && segments[2] && segments[3] === 'resolution-proof' && method === 'POST') {
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Task not found' }, 404);
    const urls = await saveUploadedFiles(request, `resolution/${c.id}`);
    c.resolution_proof = [...(c.resolution_proof || []), ...urls];
    return json({ uploaded: urls, resolution_proof: c.resolution_proof });
  }

  if (path === '/department/complaints' && method === 'GET') {
    return json(store.complaints);
  }

  if (segments[0] === 'department' && segments[1] === 'complaints' && segments[2]) {
    const c = store.complaints.find((item) => item.id === segments[2]);
    if (!c) return json({ detail: 'Complaint not found' }, 404);

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
        actor_role: user?.role || 'officer',
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
        actor_role: user?.role || 'officer',
        created_at: new Date().toISOString(),
      });
      return json(buildComplaintDetail(c, store));
    }
    if (segments[3] === 'generate-atr' && method === 'POST') {
      return json({
        draft_atr: `Field inspection conducted at ${c.location || c.ward} for Grievance #${c.complaint_number} (${c.category}). Corrective municipal maintenance work has been completed per standard operating procedures and site conditions verified.`,
        summary: 'AI-drafted Action Taken Report',
      });
    }
    if (segments[3] === 'adjudicate-appeal' && method === 'POST') {
      const body = await parseJsonBody(request);
      const prev = c.status;
      if (body.decision === 'final_close') {
        c.status = 'closed';
        c.resolved_at = new Date().toISOString();
      } else {
        c.status = 'in_progress';
        c.deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        c.sla_deadline = c.deadline;
      }
      c.updated_at = new Date().toISOString();
      c.status_history.push({
        from_status: prev,
        to_status: c.status,
        remarks: `Appellate Order (${body.decision}): ${body.notes}`,
        actor_role: user?.role || 'supervisor',
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

  // ── ADMIN ──────────────────────────────────────────────────────────────────
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
    return json({
      warned_75_pct: 1,
      breached_escalated: 0,
      auto_closed_7d: 0,
      swept_at: new Date().toISOString(),
    });
  }

  if (path === '/admin/complaints' && method === 'GET') {
    return json({ complaints: store.complaints, total: store.complaints.length, page: 1 });
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
        support_count: 2,
        count: 2,
        locations: ['Ward 12 - Dadar', 'Senapati Bapat Marg'],
        top_keywords: ['pothole', 'footpath', 'drain cover', 'traffic'],
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
    return json(store.departments);
  }

  if (path === '/admin/departments' && method === 'POST') {
    const body = await parseJsonBody(request);
    const dept = {
      id: makeId('dept'),
      name: body.name,
      code: body.code || `dept_${Date.now()}`,
      description: body.description || '',
      contact_email: body.contact_email || '',
      contact_phone: body.contact_phone || '',
      city: 'Mumbai',
      state: 'Maharashtra',
      sla_high: 24,
      sla_medium: 72,
      sla_low: 168,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    store.departments.unshift(dept);
    return json(dept, 201);
  }

  if (segments[0] === 'admin' && segments[1] === 'departments' && segments[2]) {
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

  if (path === '/admin/officers' && method === 'GET') {
    const deptId = url.searchParams.get('department_id');
    let list = store.officers;
    if (deptId) list = list.filter((o) => o.department_id === deptId);
    return json(list);
  }

  if (path === '/admin/officers' && method === 'POST') {
    const body = await parseJsonBody(request);
    const dept = store.departments.find((d) => d.id === body.department_id);
    const newUserId = makeId('user-off');
    store.users.push({
      id: newUserId,
      email: body.email,
      name: body.name,
      full_name: body.name,
      phone: body.phone || '',
      password: body.password || 'demo123',
      role: 'officer',
      department_id: body.department_id,
      is_active: true,
      is_verified: true,
    });
    const officer = {
      id: makeId('off'),
      user_id: newUserId,
      name: body.name,
      email: body.email,
      phone: body.phone || '',
      department_id: body.department_id,
      department_name: dept?.name || '',
      employee_id: body.employee_id,
      designation: body.designation || 'Field Officer',
      total_resolved: 0,
      rating: 4.5,
      is_active: true,
    };
    store.officers.unshift(officer);
    return json(officer, 201);
  }

  if (segments[0] === 'admin' && segments[1] === 'officers' && segments[2]) {
    const idx = store.officers.findIndex((o) => o.id === segments[2]);
    if (idx === -1) return json({ detail: 'Officer not found' }, 404);
    if (method === 'PUT') {
      const deptId = url.searchParams.get('department_id');
      const designation = url.searchParams.get('designation');
      const isActive = url.searchParams.get('is_active');
      if (deptId) {
        store.officers[idx].department_id = deptId;
        store.officers[idx].department_name = store.departments.find((d) => d.id === deptId)?.name || '';
      }
      if (designation !== null) store.officers[idx].designation = designation;
      if (isActive !== null) store.officers[idx].is_active = isActive === 'true';
      return json(store.officers[idx]);
    }
    if (method === 'DELETE') {
      store.officers[idx].is_active = false;
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
    if (deptId) {
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
        avg_citizen_rating: 4.5,
        feedback_count: 12,
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
        message: 'Multiple active road safety and open drain complaints concentrated within a 500m radius of Dadar station.',
        related_complaint_ids: ['SS-2026-001001', 'SS-2026-001005'],
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
      { ward: 'Ward 12 - Dadar', count: 3, category: 'Roads & Transport', lat: 19.018, lng: 72.848 },
      { ward: 'Ward 8 - Andheri', count: 1, category: 'Water Supply', lat: 19.129, lng: 72.836 },
    ]);
  }

  if (path === '/ai/officer/queue' && method === 'GET') {
    const active = store.complaints
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
        priority: {
          score: c.priority_score || 2.1,
          priority: c.priority,
        },
        routing: {
          department_name: c.department_name || c.category,
          confidence: c.ai_confidence || 0.94,
        },
        sla_risk: {
          risk_level: c.priority === 'critical' ? 'High' : 'Low',
          probability: c.priority === 'critical' ? 0.72 : 0.18,
        },
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
