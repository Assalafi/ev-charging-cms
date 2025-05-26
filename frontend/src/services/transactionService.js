import api from './api';

// Transaction service for handling transaction-related API calls
const transactionService = {
  // Get all transactions
  getAll: async (params = {}) => {
    console.log('transactionService.getAll called with params:', params);
    try {
      const response = await api.get('/transactions', { params });
      console.log('transactionService.getAll raw response:', response);
      console.log('transactionService.getAll returning data:', response.data);
      return response.data;
    } catch (error) {
      console.error('transactionService.getAll error:', error);
      throw error;
    }
  },
  
  // Get transaction by ID
  getById: async (transactionId) => {
    const response = await api.get(`/transactions/${transactionId}`);
    return response.data;
  },
  
  // Get transaction statistics
  getStats: async (type = 'energy', period = 'day') => {
    const response = await api.get(`/transactions/stats/${type}?period=${period}`);
    return response.data;
  },
  
  // Get station usage statistics
  getStationUsage: async (period = 'month') => {
    const response = await api.get(`/transactions/stats/usage?period=${period}`);
    return response.data;
  },
  
  // Get transaction meter values
  getMeterValues: async (transactionId) => {
    const response = await api.get(`/transactions/${transactionId}/meter-values`);
    return response.data;
  }
};

export default transactionService;
