import axios from 'axios';

// Configuration constants
const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_URL || 'https://evcharging.eride.ng/api',
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT) || 15000,
  maxRetries: parseInt(process.env.REACT_APP_API_MAX_RETRIES) || 3,
  retryDelay: parseInt(process.env.REACT_APP_API_RETRY_DELAY) || 1000,
};

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  withCredentials: true,
});

// Request interceptor for adding auth token and handling retries
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request ID for tracking
    config.headers['X-Request-ID'] = crypto.randomUUID();

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors and retries
api.interceptors.response.use(
  (response) => {
    // You can transform successful responses here if needed
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // Retry mechanism for network errors or 5xx server errors
    if (
      (!error.response || error.response.status >= 500) && 
      originalRequest.retryCount < API_CONFIG.maxRetries
    ) {
      originalRequest.retryCount = originalRequest.retryCount || 0;
      originalRequest.retryCount++;
      
      // Delay before retrying
      await new Promise(resolve => 
        setTimeout(resolve, API_CONFIG.retryDelay * originalRequest.retryCount)
      );
      
      return api(originalRequest);
    }

    // Handle specific error cases
    if (error.response) {
      switch (error.response.status) {
        case 401: // Unauthorized
          localStorage.removeItem('token');
          sessionStorage.removeItem('token');
          window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
          break;
          
        case 403: // Forbidden
          console.error('Forbidden access:', error);
          break;
          
        case 404: // Not Found
          console.error('Resource not found:', error);
          break;
          
        case 429: // Too Many Requests
          console.error('Rate limit exceeded:', error);
          break;
          
        case 500: // Server Error
          console.error('Server error occurred:', error);
          break;
          
        default:
          console.error(`HTTP error (${error.response.status}):`, error);
      }
      
      // Extract server error message if available
      const serverMessage = error.response.data?.message || 
                           error.response.data?.error ||
                           error.response.statusText;
      
      error.serverMessage = serverMessage;
    } else if (error.request) {
      // Network error - no response received
      console.error('Network error - no response received:', error);
      error.serverMessage = 'Network error - please check your connection';
    } else {
      // Request setup error
      console.error('Request configuration error:', error);
      error.serverMessage = 'Request configuration error';
    }

    // Return a consistent error format
    return Promise.reject({
      status: error.response?.status,
      message: error.message,
      serverMessage: error.serverMessage,
      data: error.response?.data,
      config: error.config,
    });
  }
);

// Add progress tracking for uploads/downloads
api.defaults.onUploadProgress = (progressEvent) => {
  const percentCompleted = Math.round(
    (progressEvent.loaded * 100) / progressEvent.total
  );
  // You can dispatch this to a store or handle it as needed
  console.log(`Upload progress: ${percentCompleted}%`);
};

api.defaults.onDownloadProgress = (progressEvent) => {
  const percentCompleted = Math.round(
    (progressEvent.loaded * 100) / progressEvent.total
  );
  console.log(`Download progress: ${percentCompleted}%`);
};

// Helper methods for common operations
api.getWithCancel = (url, config = {}) => {
  const cancelToken = axios.CancelToken.source();
  const request = api.get(url, {
    ...config,
    cancelToken: cancelToken.token
  });
  return {
    request,
    cancel: () => cancelToken.cancel('Request canceled by user')
  };
};

api.postFormData = (url, data, config = {}) => {
  const formData = new FormData();
  Object.keys(data).forEach(key => {
    formData.append(key, data[key]);
  });
  return api.post(url, formData, {
    ...config,
    headers: {
      ...config.headers,
      'Content-Type': 'multipart/form-data'
    }
  });
};

export default api;