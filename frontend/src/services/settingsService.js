import api from './api';

// Settings service for handling settings-related API calls
const settingsService = {
  // Get general settings
  getGeneralSettings: async () => {
    const response = await api.get('/settings/general');
    return response.data;
  },
  
  // Update general settings
  updateGeneralSettings: async (settings) => {
    const response = await api.put('/settings/general', settings);
    return response.data;
  },
  
  // Get OCPP settings
  getOcppSettings: async () => {
    const response = await api.get('/settings/ocpp');
    return response.data;
  },
  
  // Update OCPP settings
  updateOcppSettings: async (settings) => {
    const response = await api.put('/settings/ocpp', settings);
    return response.data;
  },
  
  // Get notification settings
  getNotificationSettings: async () => {
    const response = await api.get('/settings/notifications');
    return response.data;
  },
  
  // Update notification settings
  updateNotificationSettings: async (settings) => {
    const response = await api.put('/settings/notifications', settings);
    return response.data;
  }
};

export default settingsService;
