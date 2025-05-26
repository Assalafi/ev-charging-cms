import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api',
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  }
});

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    // In development mode, always use the dev token for easier testing
    if (process.env.NODE_ENV === 'development') {
      console.log('Using development mock token for API request');
      config.headers.Authorization = `Bearer dev-mock-token-for-testing`;
      return config;
    }
    
    // Production mode - get token from localStorage
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Enhanced error handling
    if (error.response) {
      // The request was made and the server responded with an error status
      if (error.response.status === 401) {
        // Handle unauthorized access - could redirect to login
        console.error('Unauthorized access. Please log in again.', error);
        // You could use localStorage.removeItem('token') and redirect to login page here
        localStorage.removeItem('token');
        window.location.href = '/login';
      } else if (error.response.status === 404) {
        console.error('Resource not found:', error);
      } else {
        console.error(`Server error (${error.response.status}):`, error.response.data);
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server:', error.request);
    } else {
      // Something happened in setting up the request
      console.error('Error setting up request:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;
