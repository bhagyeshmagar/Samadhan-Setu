// API client for Samadhan Setu Phase 1

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

const getToken = () => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('token');
    }
    return null;
};

export const setToken = (token) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
    }
};

export const removeToken = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }
};

export const getStoredUser = () => {
    if (typeof window !== 'undefined') {
        const user = localStorage.getItem('user');
        if (!user) return null;
        try {
            return JSON.parse(user);
        } catch {
            localStorage.removeItem('user');
            return null;
        }
    }
    return null;
};

export const setStoredUser = (user) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
    }
};

async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers,
    });

    if (response.status === 401) {
        removeToken();
        if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
            window.location.href = '/login?expired=true';
        }
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        let message = 'Request failed';
        if (typeof error.detail === 'string') {
            message = error.detail;
        } else if (Array.isArray(error.detail)) {
            message = error.detail
                .map(err => {
                    const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : '';
                    return field ? `${field}: ${err.msg}` : (err.msg || JSON.stringify(err));
                })
                .join('; ');
        } else if (error.message) {
            message = error.message;
        }
        throw new Error(message);
    }

    return response.json();
}

// Auth API
export const authAPI = {
    register: (data) => apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    login: (email, password) => apiRequest('/api/auth/login/json', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    }),
    logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
    getProfile: () => apiRequest('/api/auth/me'),
};

// Complaints API
export const complaintsAPI = {
    submit: (data) => apiRequest('/api/complaints/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    uploadImages: async (complaintId, files) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/complaints/${complaintId}/upload-images`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload images');
        }
        return response.json();
    },

    getMy: (statusFilter) => {
        const params = statusFilter ? `?status_filter=${statusFilter}` : '';
        return apiRequest(`/api/complaints/my${params}`);
    },

    getPublicFeed: (category, sortBy = 'recent', page = 1) => {
        const params = new URLSearchParams({ sort_by: sortBy, page });
        if (category) params.append('category', category);
        return apiRequest(`/api/complaints/public/feed?${params}`);
    },

    getById: (id) => apiRequest(`/api/complaints/${id}`),

    getHistory: (id) => apiRequest(`/api/complaints/${id}/history`),

    upvote: (id) => apiRequest(`/api/complaints/${id}/upvote`, { method: 'POST' }),

    submitFeedback: (id, data) => apiRequest(`/api/complaints/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify(data)
    }),

    appealComplaint: (id, reason) => apiRequest(`/api/complaints/${id}/appeal`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    }),

    previewAI: (description) => apiRequest(`/api/complaints/preview-ai?description=${encodeURIComponent(description)}`),
};

export const citizenApi = complaintsAPI;


// Department/Officer API
export const departmentAPI = {
    // Task-based endpoints
    getTasks: (statusFilter) => {
        const params = statusFilter ? `?status_filter=${statusFilter}` : '';
        return apiRequest(`/api/department/tasks${params}`);
    },

    getTaskDetail: (taskId) => apiRequest(`/api/department/tasks/${taskId}`),

    updateTaskStatus: (taskId, data) => apiRequest(`/api/department/tasks/${taskId}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),

    assignTask: (taskId, officerId) => apiRequest(`/api/department/tasks/${taskId}/assign?officer_id=${officerId}`, {
        method: 'POST',
    }),

    getDashboardMetrics: () => apiRequest('/api/department/dashboard/metrics'),

    // Complaint endpoints
    getComplaints: (statusFilter, priority, sortBy = 'priority') => {
        const params = new URLSearchParams({ sort_by: sortBy });
        if (statusFilter) params.append('status_filter', statusFilter);
        if (priority) params.append('priority_filter', priority);
        return apiRequest(`/api/department/complaints?${params}`);
    },

    getComplaintDetail: (id) => apiRequest(`/api/department/complaints/${id}`),

    updateComplaintStatus: (id, data) => apiRequest(`/api/department/complaints/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),

    updateStatus: (id, data) => departmentAPI.updateComplaintStatus(id, data),

    getComplaintHistory: (id) => apiRequest(`/api/department/complaints/${id}/history`),

    confirmTriage: (complaintId, data) => apiRequest(`/api/department/complaints/${complaintId}/confirm-triage`, {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    generateAtrDraft: (complaintId) => apiRequest(`/api/department/complaints/${complaintId}/generate-atr`, {
        method: 'POST',
    }),

    adjudicateAppeal: (complaintId, decision, notes) => apiRequest(`/api/department/complaints/${complaintId}/adjudicate-appeal`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes }),
    }),


    uploadProof: async (complaintId, files) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/department/complaints/${complaintId}/upload-proof`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload proof');
        }
        return response.json();
    },

    uploadInspectionProof: async (taskId, files) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/department/tasks/${taskId}/inspection-proof`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload inspection proof');
        }
        return response.json();
    },

    uploadResolutionProof: async (taskId, files) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/department/tasks/${taskId}/resolution-proof`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: formData,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload completion proof');
        }
        return response.json();
    },

    swarmResolve: (complaintId) => apiRequest(`/api/department/complaints/${complaintId}/swarm-resolve`, {
        method: 'POST',
    }),
};

// Admin API
export const adminAPI = {
    getStats: () => apiRequest('/api/admin/stats'),
    getSummary: () => apiRequest('/api/admin/stats/summary'),
    runSlaSweep: () => apiRequest('/api/admin/sla/run-sweep', { method: 'POST' }),

    getComplaints: (statusFilter, category, page = 1) => {
        const params = new URLSearchParams({ page });
        if (statusFilter) params.append('status_filter', statusFilter);
        if (category) params.append('category', category);
        return apiRequest(`/api/admin/complaints?${params}`);
    },

    getTasks: (statusFilter, departmentId) => {
        const params = new URLSearchParams();
        if (statusFilter) params.append('status_filter', statusFilter);
        if (departmentId) params.append('department_id', departmentId);
        return apiRequest(`/api/admin/tasks?${params}`);
    },

    getAuditLogs: (entityType, entityId, action, limit = 100) => {
        const params = new URLSearchParams({ limit });
        if (entityType) params.append('entity_type', entityType);
        if (entityId) params.append('entity_id', entityId);
        if (action) params.append('action', action);
        return apiRequest(`/api/admin/audit-logs?${params}`);
    },

    getDepartments: () => apiRequest('/api/admin/departments'),
    createDepartment: (data) => apiRequest('/api/admin/departments', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getMappings: () => apiRequest('/api/admin/mappings'),
    createMapping: (data) => apiRequest('/api/admin/mappings', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getSLARules: () => apiRequest('/api/admin/sla'),
    createSLARule: (data) => apiRequest('/api/admin/sla', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    getUsers: (role) => {
        const params = role ? `?role=${role}` : '';
        return apiRequest(`/api/admin/users${params}`);
    },

    getOfficers: (departmentId, role) => {
        const params = new URLSearchParams();
        if (departmentId) params.append('department_id', departmentId);
        if (role) params.append('role', role);
        const qs = params.toString();
        return apiRequest(`/api/admin/officers${qs ? `?${qs}` : ''}`);
    },
    createOfficer: (data) => apiRequest('/api/admin/officers', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateOfficer: (officerId, data) => apiRequest(`/api/admin/officers/${officerId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deleteOfficer: (officerId) => apiRequest(`/api/admin/officers/${officerId}`, { method: 'DELETE' }),

    // Field Teams Management
    getTeams: (departmentId) => {
        const params = departmentId ? `?department_id=${departmentId}` : '';
        return apiRequest(`/api/admin/teams${params}`);
    },
    createTeam: (data) => apiRequest('/api/admin/teams', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateTeam: (teamId, data) => apiRequest(`/api/admin/teams/${teamId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deleteTeam: (teamId) => apiRequest(`/api/admin/teams/${teamId}`, { method: 'DELETE' }),

    updateDepartment: (deptId, data) => apiRequest(`/api/admin/departments/${deptId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deleteDepartment: (deptId) => apiRequest(`/api/admin/departments/${deptId}`, { method: 'DELETE' }),

    deleteMapping: (mappingId) => apiRequest(`/api/admin/mappings/${mappingId}`, { method: 'DELETE' }),
};

// Multi-Role Governance Workflow API (Strictly Role-Isolated)
export const workflowAPI = {
    // Nodal Officer
    getNodalDashboard: (departmentId) => {
        const qs = departmentId ? `?department_id=${departmentId}` : '';
        return apiRequest(`/api/workflow/nodal/dashboard${qs}`);
    },
    getComplaintAuditTrail: (complaintId) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/history`),
    assignInspector: (complaintId, inspectorId, notes = '', priority = undefined) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/assign-inspector`, {
            method: 'POST',
            body: JSON.stringify({
                inspector_id: inspectorId,
                notes,
                ...(priority ? { priority } : {}),
            }),
        }),
    reviewInspection: (complaintId, payload) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/review-inspection`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    assignTeam: (complaintId, teamId, notes = '', priority = undefined) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/assign-team`, {
            method: 'POST',
            body: JSON.stringify({
                team_id: teamId,
                notes,
                ...(priority ? { priority } : {}),
            }),
        }),
    assignVerifier: (complaintId, inspectorId, notes = '', priority = undefined) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/assign-verifier`, {
            method: 'POST',
            body: JSON.stringify({
                inspector_id: inspectorId,
                notes,
                ...(priority ? { priority } : {}),
            }),
        }),
    finalDecision: (complaintId, payload) =>
        apiRequest(`/api/workflow/nodal/complaints/${complaintId}/final-decision`, {
            method: 'POST',
            body: JSON.stringify(payload),
        }),

    // Inspection Officer (Isolated)
    getInspectorDashboard: () => apiRequest('/api/workflow/inspector/dashboard'),
    uploadInspectorSitePhotos: async (
        complaintId,
        {
            files = [],
            notes = '',
            stage = 'initial_inspection',
            latitude,
            longitude,
            gps_accuracy,
            gps_source,
            captured_at,
            submit_for_review = false,
        }
    ) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        formData.append('stage', stage);
        if (notes) formData.append('notes', notes);
        if (latitude !== null && latitude !== undefined && latitude !== '') formData.append('latitude', String(latitude));
        if (longitude !== null && longitude !== undefined && longitude !== '') formData.append('longitude', String(longitude));
        if (gps_accuracy !== null && gps_accuracy !== undefined && gps_accuracy !== '') formData.append('gps_accuracy', String(gps_accuracy));
        if (gps_source) formData.append('gps_source', gps_source);
        if (captured_at) formData.append('captured_at', captured_at);
        formData.append('submit_for_review', String(Boolean(submit_for_review)));

        const response = await fetch(`${API_BASE_URL}/api/workflow/inspector/complaints/${complaintId}/site-photos`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (response.status === 401) {
            removeToken();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload geotagged site photos');
        }
        return response.json();
    },
    submitInitialInspection: async (
        complaintId,
        { files = [], notes, latitude, longitude, gps_accuracy, gps_source, captured_at }
    ) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        formData.append('notes', notes || '');
        if (latitude !== null && latitude !== undefined && latitude !== '') formData.append('latitude', String(latitude));
        if (longitude !== null && longitude !== undefined && longitude !== '') formData.append('longitude', String(longitude));
        if (gps_accuracy !== null && gps_accuracy !== undefined && gps_accuracy !== '') formData.append('gps_accuracy', String(gps_accuracy));
        if (gps_source) formData.append('gps_source', gps_source);
        if (captured_at) formData.append('captured_at', captured_at);

        const response = await fetch(`${API_BASE_URL}/api/workflow/inspector/complaints/${complaintId}/submit-inspection`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (response.status === 401) {
            removeToken();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to submit inspection proof');
        }
        return response.json();
    },
    submitPostVerification: async (
        complaintId,
        { files = [], notes, verdict, latitude, longitude, gps_accuracy, gps_source, captured_at }
    ) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        formData.append('notes', notes || '');
        formData.append('verdict', verdict || 'verified');
        if (latitude !== null && latitude !== undefined && latitude !== '') formData.append('latitude', String(latitude));
        if (longitude !== null && longitude !== undefined && longitude !== '') formData.append('longitude', String(longitude));
        if (gps_accuracy !== null && gps_accuracy !== undefined && gps_accuracy !== '') formData.append('gps_accuracy', String(gps_accuracy));
        if (gps_source) formData.append('gps_source', gps_source);
        if (captured_at) formData.append('captured_at', captured_at);

        const response = await fetch(`${API_BASE_URL}/api/workflow/inspector/complaints/${complaintId}/submit-verification`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (response.status === 401) {
            removeToken();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to submit post-repair verification');
        }
        return response.json();
    },

    // Field Team Lead (Isolated)
    getTeamDashboard: () => apiRequest('/api/workflow/team/dashboard'),
    startFieldWork: (complaintId, notes = '') =>
        apiRequest(`/api/workflow/team/complaints/${complaintId}/start-work`, {
            method: 'POST',
            body: JSON.stringify({ notes }),
        }),
    uploadTeamResolutionProof: async (
        complaintId,
        {
            files = [],
            atr_notes = '',
            materials_used = '',
            latitude,
            longitude,
            gps_accuracy,
            gps_source,
            captured_at,
            submit_for_verification = true,
        }
    ) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        if (atr_notes) formData.append('atr_notes', atr_notes);
        if (materials_used) formData.append('materials_used', materials_used);
        if (latitude !== null && latitude !== undefined && latitude !== '') formData.append('latitude', String(latitude));
        if (longitude !== null && longitude !== undefined && longitude !== '') formData.append('longitude', String(longitude));
        if (gps_accuracy !== null && gps_accuracy !== undefined && gps_accuracy !== '') formData.append('gps_accuracy', String(gps_accuracy));
        if (gps_source) formData.append('gps_source', gps_source);
        if (captured_at) formData.append('captured_at', captured_at);
        formData.append('submit_for_verification', String(Boolean(submit_for_verification)));

        const response = await fetch(`${API_BASE_URL}/api/workflow/team/complaints/${complaintId}/resolution-proof`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (response.status === 401) {
            removeToken();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to upload resolution proof');
        }
        return response.json();
    },
    submitResolutionProof: async (
        complaintId,
        { files = [], atr_notes, materials_used = '', latitude, longitude, gps_accuracy, gps_source, captured_at }
    ) => {
        const token = getToken();
        const formData = new FormData();
        files.forEach((f) => formData.append('files', f));
        formData.append('atr_notes', atr_notes || '');
        if (materials_used) formData.append('materials_used', materials_used);
        if (latitude !== null && latitude !== undefined && latitude !== '') formData.append('latitude', String(latitude));
        if (longitude !== null && longitude !== undefined && longitude !== '') formData.append('longitude', String(longitude));
        if (gps_accuracy !== null && gps_accuracy !== undefined && gps_accuracy !== '') formData.append('gps_accuracy', String(gps_accuracy));
        if (gps_source) formData.append('gps_source', gps_source);
        if (captured_at) formData.append('captured_at', captured_at);

        const response = await fetch(`${API_BASE_URL}/api/workflow/team/complaints/${complaintId}/submit-resolution`, {
            method: 'POST',
            credentials: 'include',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData,
        });
        if (response.status === 401) {
            removeToken();
            if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
                window.location.href = '/login?expired=true';
            }
        }
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to submit resolution proof');
        }
        return response.json();
    },
};

// Analytics API
export const analyticsAPI = {
    getMapData: (departmentId, days = 30) => {
        const params = new URLSearchParams({ days: days.toString() });
        if (departmentId) params.append('department_id', departmentId);
        return apiRequest(`/api/analytics/map-data?${params}`);
    },
    getSummary: (days = 30) => apiRequest(`/api/analytics/summary?days=${days}`),
    getDepartmentPerformance: (days = 30) => apiRequest(`/api/analytics/departments/performance?days=${days}`),
    getSmartAlerts: (days = 7) => apiRequest(`/api/analytics/smart-alerts?days=${days}`),
};

// Notifications API (H7 + Gmail API & Meta WhatsApp Cloud API channels)
export const notificationsAPI = {
    getNotifications: (page = 1, per_page = 20, unread_only = false) =>
        apiRequest(`/api/notifications?page=${page}&per_page=${per_page}&unread_only=${unread_only}`),
    getCount: () => apiRequest('/api/notifications/count'),
    markRead: (id) => apiRequest(`/api/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () => apiRequest('/api/notifications/read-all', { method: 'POST' }),
    getPreferences: () => apiRequest('/api/notifications/preferences'),
    updatePreferences: (data) => apiRequest('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    getDeliveryLogs: ({ channel = '', status = '', event_type = '', scope = 'mine', q = '' } = {}) => {
        const params = new URLSearchParams();
        if (channel) params.append('channel', channel);
        if (status) params.append('status', status);
        if (event_type) params.append('event_type', event_type);
        if (scope) params.append('scope', scope);
        if (q) params.append('q', q);
        const qs = params.toString();
        return apiRequest(`/api/notifications/logs${qs ? `?${qs}` : ''}`);
    },
    dispatchGmail: (payload, gmailAccessToken) => apiRequest('/api/notifications/dispatch/gmail', {
        method: 'POST',
        headers: gmailAccessToken ? { 'X-Gmail-Access-Token': gmailAccessToken } : {},
        body: JSON.stringify(payload),
    }),
    dispatchWhatsApp: (payload) => apiRequest('/api/notifications/dispatch/whatsapp', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    sendTest: (channel, payload = {}, gmailAccessToken = null) => apiRequest('/api/notifications/test', {
        method: 'POST',
        headers: gmailAccessToken ? { 'X-Gmail-Access-Token': gmailAccessToken } : {},
        body: JSON.stringify({ channel, ...payload }),
    }),
};

// AI Insights API (Phase 2)
export const aiAPI = {
    // Complaint AI analysis
    getSummary: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/summary`),
    rerunAnalysis: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/rerun`, { method: 'POST' }),
    getSimilar: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/similar`),
    getCluster: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/cluster`),
    getPriorityExplanation: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/priority-explanation`),
    getImageAnalysis: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/image-analysis`),
    getRouting: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/routing`),
    getSLARisk: (complaintId) => apiRequest(`/api/ai/complaint/${complaintId}/sla-risk`),
    overrideRouting: (complaintId, reason) => apiRequest(
        `/api/ai/complaint/${complaintId}/routing/override?reason=${encodeURIComponent(reason)}`,
        { method: 'POST' }
    ),

    // Officer AI queue
    getOfficerQueue: () => apiRequest('/api/ai/officer/queue'),

    // Admin AI insights
    getModelHealth: () => apiRequest('/api/ai/admin/model-health'),
    getHotspots: (days = 30, minSize = 3) =>
        apiRequest(`/api/ai/admin/hotspots?days=${days}&min_size=${minSize}`),
    getOverrideStats: () => apiRequest('/api/ai/admin/override-stats'),
};

// DPDP Act Compliance API (H-12 / L-11 FIX)
export const dpdpAPI = {
    exportData: () => apiRequest('/api/citizen/dpdp/export'),
    requestErasure: (reason) => apiRequest('/api/citizen/dpdp/erasure-request', {
        method: 'POST',
        body: JSON.stringify({ reason }),
    }),
};

// Authenticated Media URL Generator (H-02 FIX)
export const getImageUrl = (img) => {
    const raw = typeof img === 'string' ? img : (img?.url || img?.path || img?.s3_key);
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    let url = raw;
    if (url.startsWith('/api/')) url = `${API_BASE_URL}${url}`;
    else if (url.startsWith('/uploads/')) url = `${API_BASE_URL}${url}`;
    else url = `${API_BASE_URL}/api/media/${url.replace(/^\//, '')}`;

    const token = getToken();
    if (token && !url.includes('token=')) {
        url += (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
    }
    return url;
};

export default apiRequest;
