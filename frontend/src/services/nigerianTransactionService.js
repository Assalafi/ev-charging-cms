import axios from 'axios';

// Special service optimized for fetching Nigerian transaction data
const nigerianTransactionService = {
  // Get all Nigerian transactions with proper authentication
  getAllTransactions: async (params = {}) => {
    try {
      // Create a clean instance of axios with proper defaults for Nigerian operations
      const apiClient = axios.create({
        baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-mock-token-for-testing'}`
        }
      });
      
      // Make the API call with proper authentication
      const response = await apiClient.get('/transactions', { params });
      
      // Verify response format
      if (response.data && response.data.success) {
        return {
          success: true,
          transactions: response.data.transactions || [],
          count: response.data.count || 0
        };
      } else {
        console.error('Invalid response format from Nigerian transactions API:', response);
        return {
          success: false,
          transactions: [],
          error: 'Invalid response format from server'
        };
      }
    } catch (error) {
      console.error('Error fetching Nigerian transactions:', error);
      return {
        success: false,
        transactions: [],
        error: error.message || 'Error connecting to transaction server'
      };
    }
  },
  
  // Get transaction by ID with proper authentication
  getTransactionById: async (transactionId) => {
    try {
      // Create a clean instance of axios with proper defaults for Nigerian operations
      const apiClient = axios.create({
        baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || 'dev-mock-token-for-testing'}`
        }
      });
      
      const response = await apiClient.get(`/transactions/${transactionId}`);
      
      if (response.data && response.data.success) {
        return {
          success: true,
          transaction: response.data.transaction
        };
      } else {
        return {
          success: false,
          error: 'Transaction not found'
        };
      }
    } catch (error) {
      console.error(`Error fetching Nigerian transaction ${transactionId}:`, error);
      return {
        success: false,
        error: error.message || 'Error connecting to transaction server'
      };
    }
  }
};

export default nigerianTransactionService;
