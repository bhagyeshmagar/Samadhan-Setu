// API client configuration for Samadhan Setu

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

// Get token from localStorage
const getToken = () => {
    if (typeof window !== 'undefined') {
        return localStorage.getItem('token');
    }
    return null;
};

// Set token to localStorage
export const setToken = (token) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('token', token);
    }
};

// Remove token
export const removeToken = () => {
    if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }
};

// Get stored user
export const getStoredUser = () => {
    if (typeof window !== 'undefined') {
        const user = localStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    }
    return null;
};

// Store user
export const setStoredUser = (user) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(user));
    }
};

// API request helper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    // Debug: log token presence
    console.log('API Request:', endpoint, 'Token:', token ? 'present' : 'missing');

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
    checkSimilar: (description) => apiRequest(`/api/complaints/check-similar?description=${encodeURIComponent(description)}`, {
        method: 'POST',
    }),

    submit: (data) => apiRequest('/api/complaints/', {
        method: 'POST',
        body: JSON.stringify(data),
    }),

    uploadImages: async (complaintId, files) => {
        const token = localStorage.getItem('token');
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'}/api/complaints/${complaintId}/upload-images`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error('Failed to upload images');
        }
        return response.json();
    },

    getMy: (status) => {
        const params = status ? `?status_filter=${status}` : '';
        return apiRequest(`/api/complaints/my${params}`);
    },

    getPublic: (category, sortBy = 'recent', page = 1) => {
        const params = new URLSearchParams({ sort_by: sortBy, page });
        if (category) params.append('category', category);
        return apiRequest(`/api/complaints/public?${params}`);
    },

    getById: (id) => apiRequest(`/api/complaints/${id}`),

    upvote: (id) => apiRequest(`/api/complaints/${id}/upvote`, {
        method: 'POST',
    }),

    rateResolution: (id, rating) => apiRequest(`/api/complaints/${id}/rate-resolution?rating=${rating}`, {
        method: 'POST',
    }),

    previewAI: (description) => apiRequest(`/api/complaints/preview-ai?description=${encodeURIComponent(description)}`),
};

// Department API
export const departmentAPI = {
    getComplaints: (status, priority, sortBy = 'priority') => {
        const params = new URLSearchParams({ sort_by: sortBy });
        if (status) params.append('status_filter', status);
        if (priority) params.append('priority_filter', priority);
        return apiRequest(`/api/department/complaints?${params}`);
    },

    getPendingCount: () => apiRequest('/api/department/complaints/pending-count'),

    updateStatus: (id, data) => apiRequest(`/api/department/complaints/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
    }),

    addRemarks: (id, remarks) => apiRequest(`/api/department/complaints/${id}/remarks`, {
        method: 'POST',
        body: JSON.stringify({ remarks }),
    }),

    getHistory: (id) => apiRequest(`/api/department/complaints/${id}/history`),
};

// Admin API
export const adminAPI = {
    getStats: () => apiRequest('/api/admin/stats'),
    getSummary: () => apiRequest('/api/admin/stats/summary'),

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
};

// Analytics API
export const analyticsAPI = {
    getMapData: (departmentId, days = 30) => {
        const params = new URLSearchParams({ days: days.toString() });
        if (departmentId) params.append('department_id', departmentId);
        return apiRequest(`/api/analytics/map-data?${params}`);
    },
    getSummary: (days = 30) => apiRequest(`/api/analytics/summary?days=${days}`),
};

export default apiRequest;
