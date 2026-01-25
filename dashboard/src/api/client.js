import axios from 'axios';

// Use relative URL in production (same origin), localhost for development
const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8080');

const api = axios.create({
  baseURL: `${API_BASE_URL}/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.put('/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  shareLocation: async (latitude, longitude, accuracy) => {
    const response = await api.post('/users/me/location', {
      latitude,
      longitude,
      accuracy,
      timestamp: new Date().toISOString(),
    });
    return response.data;
  },

  getUserLocations: async () => {
    const response = await api.get('/users/locations');
    return response.data;
  },
};

// Devices API
export const devicesApi = {
  list: async () => {
    const response = await api.get('/devices');
    return response.data;
  },

  get: async (id) => {
    const response = await api.get(`/devices/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/devices', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/devices/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    await api.delete(`/devices/${id}`);
  },

  getLatestPosition: async (id) => {
    const response = await api.get(`/devices/${id}/position`);
    return response.data;
  },

  getPositions: async (id, params = {}) => {
    const response = await api.get(`/devices/${id}/positions`, { params });
    return response.data;
  },

  getDatesWithData: async (id) => {
    const response = await api.get(`/devices/${id}/dates-with-data`);
    return response.data;
  },
};

// Geofences API
export const geofencesApi = {
  list: async (deviceId) => {
    const response = await api.get(`/devices/${deviceId}/geofences`);
    return response.data;
  },

  create: async (deviceId, data) => {
    const response = await api.post(`/devices/${deviceId}/geofences`, data);
    return response.data;
  },

  delete: async (id) => {
    await api.delete(`/geofences/${id}`);
  },
};

// Commands API
export const commandsApi = {
  list: async (deviceId, status) => {
    const params = status ? { status } : {};
    const response = await api.get(`/devices/${deviceId}/commands`, { params });
    return response.data;
  },

  send: async (deviceId, data) => {
    const response = await api.post(`/devices/${deviceId}/commands`, data);
    return response.data;
  },
};

export default api;
