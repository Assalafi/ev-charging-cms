import api from './api';

// Pricing service for handling pricing-related API calls
const pricingService = {
  // Get pricing settings
  getPricingSettings: async () => {
    const response = await api.get('/pricing');
    return response.data;
  },
  
  // Update pricing settings
  updatePricingSettings: async (settings) => {
    const response = await api.put('/pricing', settings);
    return response.data;
  }
};

export default pricingService;
