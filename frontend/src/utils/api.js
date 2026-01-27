import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

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
    if (error.response?.status === 401) {
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
};

// Automation endpoints
export const automationAPI = {
  create: (data) => api.post('/automation', data),
  getAll: () => api.get('/automation'),
  toggle: (id) => api.patch(`/automation/${id}/toggle`),
  getTriggers: (id) => api.get(`/automation/${id}/triggers`),
};

export default api;
