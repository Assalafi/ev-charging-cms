import api from './api';

const adminUserService = {
  list: params => api.get('/admin/users', { params }).then(response => response.data),
  metadata: () => api.get('/admin/users/metadata').then(response => response.data),
  create: payload => api.post('/admin/users', payload).then(response => response.data),
  update: (id, payload) => api.put(`/admin/users/${id}`, payload).then(response => response.data),
  remove: id => api.delete(`/admin/users/${id}`).then(response => response.data)
};

export default adminUserService;
