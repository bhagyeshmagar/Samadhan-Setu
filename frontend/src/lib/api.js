// API client for Samadhan Setu Phase 1

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

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
        return user ? JSON.parse(user) : null;
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
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail || 'Request failed');
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
    getProfile: () => apiRequest('/api/auth/me'),
};

// Complaints API
export const complaintsAPI = {
    submit: (data) => apiRequest('/api/complaints/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    uploadImages: async (complaintId, files) => {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/complaints/${complaintId}/upload-images`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) throw new Error('Failed to upload images');
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

    previewAI: (description) => apiRequest(`/api/complaints/preview-ai?description=${encodeURIComponent(description)}`),
};

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

    getComplaintHistory: (id) => apiRequest(`/api/department/complaints/${id}/history`),

    uploadProof: async (complaintId, files) => {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${API_BASE_URL}/api/department/complaints/${complaintId}/upload-proof`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (!response.ok) throw new Error('Failed to upload proof');
        return response.json();
    },
};

// Admin API
export const adminAPI = {
    getStats: () => apiRequest('/api/admin/stats'),
    getSummary: () => apiRequest('/api/admin/stats/summary'),

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

    getOfficers: (departmentId) => {
        const params = departmentId ? `?department_id=${departmentId}` : '';
        return apiRequest(`/api/admin/officers${params}`);
    },
    createOfficer: (data) => apiRequest('/api/admin/officers', {
        method: 'POST',
        body: JSON.stringify(data),
    }),
    updateOfficer: (officerId, params) => {
        const qs = new URLSearchParams();
        if (params.department_id) qs.append('department_id', params.department_id);
        if (params.designation !== undefined) qs.append('designation', params.designation);
        if (params.is_active !== undefined) qs.append('is_active', params.is_active);
        return apiRequest(`/api/admin/officers/${officerId}?${qs}`, { method: 'PUT' });
    },
    deleteOfficer: (officerId) => apiRequest(`/api/admin/officers/${officerId}`, { method: 'DELETE' }),

    updateDepartment: (deptId, data) => apiRequest(`/api/admin/departments/${deptId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),
    deleteDepartment: (deptId) => apiRequest(`/api/admin/departments/${deptId}`, { method: 'DELETE' }),

    deleteMapping: (mappingId) => apiRequest(`/api/admin/mappings/${mappingId}`, { method: 'DELETE' }),
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
    getOfficerQueue: (priorityBand) => {
        const params = priorityBand ? `?priority_band=${priorityBand}` : '';
        return apiRequest(`/api/ai/officer/queue${params}`);
    },

    // Admin AI insights
    getModelHealth: () => apiRequest('/api/ai/admin/model-health'),
    getHotspots: (days = 30, minSize = 3) =>
        apiRequest(`/api/ai/admin/hotspots?days=${days}&min_size=${minSize}`),
    getOverrideStats: () => apiRequest('/api/ai/admin/override-stats'),
};

export default apiRequest;
