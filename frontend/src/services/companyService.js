import api from './api';

const companyService = {
  list: async (params = {}) => {
    const response = await api.get('/admin/companies', { params });
    return response.data;
  },
  get: async (id) => {
    const response = await api.get(`/admin/companies/${id}`);
    return response.data;
  },
  create: async (payload) => {
    const response = await api.post('/admin/companies', payload);
    return response.data;
  },
  update: async (id, payload) => {
    const response = await api.put(`/admin/companies/${id}`, payload);
    return response.data;
  },
  archive: async (id) => {
    const response = await api.delete(`/admin/companies/${id}`);
    return response.data;
  },
  setStatus: async (id, status) => {
    const response = await api.post(`/admin/companies/${id}/status`, { status });
    return response.data;
  },
  users: async (id, params = {}) => {
    const response = await api.get(`/admin/companies/${id}/users`, { params });
    return response.data;
  },
  createUser: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/users`, payload);
    return response.data;
  },
  assignUsers: async (id, userIds) => {
    const response = await api.post(`/admin/companies/${id}/users/assign`, { userIds });
    return response.data;
  },
  setUserStatus: async (companyId, userId, status) => {
    const response = await api.put(`/admin/companies/${companyId}/users/${userId}/status`, { status });
    return response.data;
  },
  unassignUser: async (companyId, userId) => {
    const response = await api.delete(`/admin/companies/${companyId}/users/${userId}`);
    return response.data;
  },
  portalUsers: async (id) => {
    const response = await api.get(`/admin/companies/${id}/portal-users`);
    return response.data;
  },
  createPortalUser: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/portal-users`, payload);
    return response.data;
  },
  updatePortalUser: async (companyId, userId, payload) => {
    const response = await api.put(`/admin/companies/${companyId}/portal-users/${userId}`, payload);
    return response.data;
  },
  deletePortalUser: async (companyId, userId) => {
    const response = await api.delete(`/admin/companies/${companyId}/portal-users/${userId}`);
    return response.data;
  },
  fundWallet: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/wallet/fund`, payload);
    return response.data;
  },
  initializePaystackFunding: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/wallet/fund/paystack`, payload);
    return response.data;
  },
  verifyPaystackFunding: async (id, reference) => {
    const response = await api.get(`/admin/companies/${id}/wallet/fund/paystack/verify`, { params: { reference } });
    return response.data;
  },
  transferToUser: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/wallet/transfer`, payload);
    return response.data;
  },
  transactions: async (id, params = {}) => {
    const response = await api.get(`/admin/companies/${id}/wallet/transactions`, { params });
    return response.data;
  },
  activity: async (id, params = {}) => {
    const response = await api.get(`/admin/companies/${id}/activity`, { params });
    return response.data;
  },
  rules: async (id) => {
    const response = await api.get(`/admin/companies/${id}/funding-rules`);
    return response.data;
  },
  createRule: async (id, payload) => {
    const response = await api.post(`/admin/companies/${id}/funding-rules`, payload);
    return response.data;
  },
  updateRule: async (id, ruleId, payload) => {
    const response = await api.put(`/admin/companies/${id}/funding-rules/${ruleId}`, payload);
    return response.data;
  },
  disableRule: async (id, ruleId) => {
    const response = await api.delete(`/admin/companies/${id}/funding-rules/${ruleId}`);
    return response.data;
  }
};

export default companyService;
