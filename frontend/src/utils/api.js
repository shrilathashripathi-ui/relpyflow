import axios from 'axios';

// Use environment variable or fallback to localhost
// For ngrok: set VITE_API_URL in .env or .env.local
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only logout on 401 if it's a token/session issue, not a failed login attempt
    // Don't logout on login/register/instagram-login failures
    const isAuthEndpoint = error.config?.url?.includes('/auth/login') ||
                           error.config?.url?.includes('/auth/register') ||
                           error.config?.url?.includes('/instagram/direct-login');

    if (error.response?.status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth endpoints
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
};

// Instagram endpoints
export const instagramAPI = {
  getAuthUrl: () => api.get('/instagram/auth'),
  saveAccount: (data) => api.post('/instagram/account', data),
  getAccounts: () => api.get('/instagram/accounts'),
  getMedia: (accountId) => api.get(`/instagram/accounts/${accountId}/media`),
  deleteAccount: (accountId) => api.delete(`/instagram/account/${accountId}`),
};

// Automation endpoints
export const automationAPI = {
  create: (data) => api.post('/automation', data),
  getAll: () => api.get('/automation'),
  getById: (id) => api.get(`/automation/${id}`),
  getOne: (id) => api.get(`/automation/${id}`),
  update: (id, data) => api.put(`/automation/${id}`, data),
  delete: (id) => api.delete(`/automation/${id}`),
  toggle: (id) => api.patch(`/automation/${id}/toggle`),
  getTriggers: (id) => api.get(`/automation/${id}/triggers`),
  retrigger: (id, mediaId) => api.post(`/automation/${id}/retrigger`, { mediaId }),
  getLeads: (id) => api.get(`/automation/${id}/leads`),
  getPendingDMs: (id) => api.get(`/automation/${id}/pending-dms`),
  exportLeads: (id) => api.get(`/automation/${id}/leads/export`, { responseType: 'blob' }),
  deleteLead: (id, leadId) => api.delete(`/automation/${id}/leads/${leadId}`),
};

// Subscription endpoints
export const subscriptionAPI = {
  getPlans: () => api.get('/subscription/plans'),
  getStatus: () => api.get('/subscription/status'),
  checkFeature: (feature) => api.get(`/subscription/check-feature/${feature}`),
  checkLimits: () => api.get('/subscription/check-limits'),
  upgrade: () => api.post('/subscription/upgrade'),
  cancel: () => api.post('/subscription/cancel'),
  startTrial: () => api.post('/subscription/start-trial'),
};

export default api;
