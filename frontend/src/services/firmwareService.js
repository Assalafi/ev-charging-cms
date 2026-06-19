import api from './api';

// Firmware service for handling firmware-related API calls
const firmwareService = {
  // Get all firmware versions
  getAll: async () => {
    const response = await api.get('/firmware');
    return response.data;
  },
  
  // Get firmware by ID
  getById: async (firmwareId) => {
    const response = await api.get(`/firmware/${firmwareId}`);
    return response.data;
  },
  
  // Add new firmware
  add: async (firmwareData) => {
    const response = await api.post('/firmware', firmwareData);
    return response.data;
  },
  
  // Update firmware
  update: async (firmwareId, firmwareData) => {
    const response = await api.put(`/firmware/${firmwareId}`, firmwareData);
    return response.data;
  },
  
  // Delete firmware
  delete: async (firmwareId) => {
    const response = await api.delete(`/firmware/${firmwareId}`);
    return response.data;
  },
  
  // Get firmware update history
  getHistory: async () => {
    const response = await api.get('/firmware/history');
    return response.data;
  },
  
  // Schedule firmware update
  scheduleUpdate: async (updateData) => {
    const response = await api.post('/firmware/update', updateData);
    return response.data;
  },
  
  // Check update status
  checkUpdateStatus: async (updateId) => {
    const response = await api.get(`/firmware/update/${updateId}/status`);
    return response.data;
  },
  
  // Cancel scheduled update
  cancelUpdate: async (updateId) => {
    const response = await api.delete(`/firmware/update/${updateId}`);
    return response.data;
  }
};

export default firmwareService;
