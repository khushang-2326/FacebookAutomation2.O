import axios from 'axios';

const API = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('fb_auto_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for handling 401 unauth
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If token expired, clear token
      const isAuthRoute = error.config.url.includes('/auth/');
      if (!isAuthRoute) {
        localStorage.removeItem('fb_auto_token');
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => API.post('/auth/login', data),
  register: (data) => API.post('/auth/register', data),
  getMe: () => API.get('/auth/me'),
};

export const facebookAPI = {
  getAuthUrl: (mock = false) => API.get(`/facebook/auth-url?mock=${mock}`),
  handleCallback: (data) => API.post('/facebook/callback', data),
  mockConnect: () => API.post('/facebook/mock-connect'),
  connectWithToken: (data) => API.post('/facebook/connect-token', data),
  connectStreamKey: (data) => API.post('/facebook/connect-stream-key', data),
  getPages: () => API.get('/facebook/pages'),
  testPageToken: (id) => API.post(`/facebook/pages/${id}/test`),
  deletePage: (id) => API.delete(`/facebook/pages/${id}`),
  disconnectAccount: (id) => API.delete(`/facebook/accounts/${id}`),
};

export const cameraAPI = {
  getList: () => API.get('/cameras'),
  getById: (id) => API.get(`/cameras/${id}`),
  create: (data) => API.post('/cameras', data),
  update: (id, data) => API.put(`/cameras/${id}`, data),
  renameWebcam: (data) => API.put('/cameras/webcams/rename', data),
  deleteWebcamAlias: (data) => API.post('/cameras/webcams/delete', data),
  getWebcamAliases: () => API.get('/cameras/webcams/aliases'),
  testUrl: (data) => API.post('/cameras/test-url', data),
  testCamera: (id) => API.post(`/cameras/${id}/test`),
  discover: () => API.post('/cameras/discover'),
  preparePreviews: () => API.post('/cameras/prepare-previews'),
  deleteCamera: (id) => API.delete(`/cameras/${id}`),
  delete: (id) => API.delete(`/cameras/${id}`),
};

export const mediaAPI = {
  upload: (formData, onProgress) => API.post('/media/upload', formData, {
    headers: { 'Content-Type': undefined },
    onUploadProgress: onProgress,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 0,
  }),
  createSample: (type = 'VIDEO') => API.post('/media/sample', { type }),
  getList: () => API.get('/media'),
  getById: (id) => API.get(`/media/${id}`),
  delete: (id) => API.delete(`/media/${id}`),
};

export const automationAPI = {
  create: (data) => API.post('/automations', data),
  getList: () => API.get('/automations'),
  getAll: () => API.get('/automations'),
  getById: (id) => API.get(`/automations/${id}`),
  update: (id, data) => API.put(`/automations/${id}`, data),
  delete: (id) => API.delete(`/automations/${id}`),
  start: (id) => API.post(`/automations/${id}/start`),
  pause: (id) => API.post(`/automations/${id}/pause`),
  resume: (id) => API.post(`/automations/${id}/resume`),
  stop: (id) => API.post(`/automations/${id}/stop`),
  rotateNow: (id) => API.post(`/automations/${id}/rotate-now`),
  switchCamera: (id, slotIndex) => API.post(`/automations/${id}/switch-camera`, { slotIndex }),
  switchMedia: (id, slotIndex) => API.post(`/automations/${id}/switch-media`, { slotIndex }),
  switchYouTube: (id, slotIndex) => API.post(`/automations/${id}/switch-youtube`, { slotIndex }),
  preflight: (id) => API.post(`/automations/${id}/preflight`),
  emergencyStop: () => API.post('/automations/emergency-stop'),
};

export const broadcastAPI = {
  getList: (params) => API.get('/broadcasts', { params }),
  getById: (id) => API.get(`/broadcasts/${id}`),
  end: (id) => API.post(`/broadcasts/${id}/end`),
};

export const systemAPI = {
  getHealth: () => API.get('/system/health'),
  getTrialStatus: () => API.get('/system/trial-status'),
  getMediaTools: () => API.get('/system/media-tools'),
  getDevices: () => API.get('/system/devices'),
  getGpuDiagnostics: () => API.get('/system/gpu-diagnostics'),
  setGpuMode: (mode) => API.post('/system/gpu-mode', { mode }),
  exportDiagnosticReport: (format = 'markdown') => API.get('/system/export-diagnostic-report', { params: { format }, responseType: 'blob' }),
  getLogs: (params) => API.get('/system/logs', { params }),
  getSettings: () => API.get('/settings'),
  updateSettings: (data) => API.put('/settings', data),
};

export default API;
