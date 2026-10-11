import axios from 'axios';

const companyApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
});

companyApi.interceptors.request.use(config => {
  const token = localStorage.getItem('company_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

companyApi.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && window.location.pathname.startsWith('/company')) {
    localStorage.removeItem('company_token');
    window.location.href = `/company/login?redirect=${encodeURIComponent(window.location.pathname)}`;
  }
  const normalized = new Error(error.response?.data?.message || error.message || 'Company portal request failed');
  normalized.status = error.response?.status;
  normalized.serverMessage = error.response?.data?.message || error.message;
  return Promise.reject(normalized);
});

export default companyApi;

