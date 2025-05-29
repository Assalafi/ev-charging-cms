import api from './api';

// Transaction service for handling transaction-related API calls
const transactionService = {
  // Get all transactions
  getAll: async (params = {}) => {
    console.log('transactionService.getAll called with params:', params);
    try {
      console.log('Making API call to /transactions with params:', params);
      const response = await api.get('/transactions', { 
        params,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      
      console.log('transactionService.getAll raw response status:', response.status);
      console.log('transactionService.getAll response data:', response.data);
      
      // Handle different response formats
      if (!response.data) {
        console.warn('Empty response data');
        return [];
      }
      
      // If response is an array, return it directly
      if (Array.isArray(response.data)) {
        return response.data;
      }
      
      // If response has a transactions array, return that
      if (response.data.transactions && Array.isArray(response.data.transactions)) {
        return response.data.transactions;
      }
      
      // If response has a data property that's an array, return that
      if (response.data.data && Array.isArray(response.data.data)) {
        return response.data.data;
      }
      
      console.warn('Unexpected response format:', response.data);
      return [];
    } catch (error) {
      console.error('transactionService.getAll error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
      
      // Return empty array instead of throwing to prevent UI crashes
      return [];
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
    console.log(`Fetching meter values for transaction: ${transactionId}`);
    try {
      // Try the transactions endpoint first
      const response = await api.get(`/transactions/${transactionId}/meter-values`);
      console.log('Meter values response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error with first meter values endpoint, trying alternative:', error);
      // Fall back to meter-values endpoint
      try {
        const altResponse = await api.get(`/meter-values/transaction/${transactionId}`);
        console.log('Alternative meter values response:', altResponse.data);
        return altResponse.data;
      } catch (altError) {
        console.error('Error with alternative meter values endpoint:', altError);
        throw altError;
      }
    }
  },
  
  // Mark a transaction as complete (for fixing stuck transactions)
  markAsComplete: async (transactionId, reason = 'Manually completed due to error') => {
    console.log(`Marking transaction ${transactionId} as complete with reason: ${reason}`);
    try {
      // Using the new simpler endpoint with POST body instead of URL parameters
      const response = await api.post('/transactions/complete', { 
        transactionId, 
        reason 
      });
      console.log('Mark as complete response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error in markAsComplete:', error.response?.data || error.message);
      throw error;
    }
  }
};

export default transactionService;
