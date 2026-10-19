import companyApi from './companyApi';

const companyPortalService = {
  dashboard: () => companyApi.get('/company/dashboard'),
  monitor: () => companyApi.get('/company/monitor'),
  users: (params = {}) => companyApi.get('/company/users', { params }),
  userActivity: (id, params = {}) => companyApi.get(`/company/users/${id}/activity`, { params }),
  createUser: payload => companyApi.post('/company/users', payload),
  setUserStatus: (id, status) => companyApi.put(`/company/users/${id}/status`, { status }),
  fundUser: (id, payload) => companyApi.post(`/company/users/${id}/fund`, payload),
  recoverUser: (id, payload) => companyApi.post(`/company/users/${id}/recover`, payload),
  wallet: () => companyApi.get('/company/wallet'),
  transactions: (params = {}) => companyApi.get('/company/wallet/transactions', { params }),
  initializeFunding: payload => companyApi.post('/company/wallet/fund/paystack', payload),
  verifyFunding: reference => companyApi.get('/company/wallet/fund/paystack/verify', { params: { reference } }),
  rules: () => companyApi.get('/company/funding-rules'),
  createRule: payload => companyApi.post('/company/funding-rules', payload),
  updateRule: (id, payload) => companyApi.put(`/company/funding-rules/${id}`, payload),
  disableRule: id => companyApi.delete(`/company/funding-rules/${id}`)
};

export default companyPortalService;
