import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('collab_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('collab_token');
      localStorage.removeItem('collab_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  me:       ()     => api.get('/auth/me')
};

export const sessionAPI = {
  list:   ()       => api.get('/sessions'),
  create: (data)   => api.post('/sessions', data),
  get:    (roomId) => api.get(`/sessions/${roomId}`),
  delete: (roomId) => api.delete(`/sessions/${roomId}`)
};

export const fileAPI = {
  upload:   (formData) => api.post('/files/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  list:     ()         => api.get('/files'),
  get:      (id)       => api.get(`/files/${id}`),
  download: (id)       => api.get(`/files/${id}/download`, { responseType: 'blob' }),
  delete:   (id)       => api.delete(`/files/${id}`)
};

export const inviteAPI = {
  create:   (sessionId) => api.post('/invites', { sessionId }),
  validate: (token)     => api.get(`/invites/${token}`)
};

export default api;
