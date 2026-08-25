import api from './api';

// Settings service for handling settings-related API calls
const settingsService = {
  getBrandingSettings: async () => {
    const response = await api.get('/settings/branding');
    return response.data;
  },

  updateBrandingSettings: async (settings, logo, favicon, removals = {}) => {
    const form = new FormData();
    Object.entries(settings).forEach(([key, value]) => {
      if (!['logoUrl', 'faviconUrl', 'revision'].includes(key) && value !== undefined && value !== null) form.append(key, value);
    });
    if (logo) form.append('logo', logo);
    if (favicon) form.append('favicon', favicon);
    if (removals.logo) form.append('removeLogo', 'true');
    if (removals.favicon) form.append('removeFavicon', 'true');
    const response = await api.put('/settings/branding', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    return response.data;
  },

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
