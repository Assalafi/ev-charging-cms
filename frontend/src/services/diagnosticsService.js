import api from './api';

// Diagnostics service for handling diagnostic logs-related API calls
const diagnosticsService = {
  // Get all diagnostic logs
  getAll: async (params = {}) => {
    const response = await api.get('/diagnostics', { params });
    return response.data;
  },
  
  // Get diagnostic log by ID
  getById: async (logId) => {
    const response = await api.get(`/diagnostics/${logId}`);
    return response.data;
  },
  
  // Request diagnostic logs from station
  requestLogs: async (requestData) => {
    const response = await api.post('/diagnostics/request', requestData);
    return response.data;
  },
  
  // Get log content
  getLogContent: async (logId) => {
    const response = await api.get(`/diagnostics/${logId}/content`);
    return response.data;
  },
  
  // Download log file
  downloadLog: async (logId) => {
    const response = await api.get(`/diagnostics/${logId}/download`, {
      responseType: 'blob'
    });
    return response.data;
  },
  
  // Delete log
  deleteLog: async (logId) => {
    const response = await api.delete(`/diagnostics/${logId}`);
    return response.data;
  },
  
  // Get log request status
  getRequestStatus: async (requestId) => {
    const response = await api.get(`/diagnostics/request/${requestId}/status`);
    return response.data;
  }
};

export default diagnosticsService;
