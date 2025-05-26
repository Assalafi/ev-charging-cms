import api from './api';

// Station service for handling station-related API calls
const stationService = {
  // Get all stations
  getAll: async () => {
    const response = await api.get('/stations');
    return response.data;
  },
  
  // Get station by ID
  getById: async (stationId) => {
    const response = await api.get(`/stations/${stationId}`);
    return response.data;
  },
  
  // Get station statistics
  getStats: async () => {
    const response = await api.get('/stations/stats/summary');
    return response.data;
  },
  
  // Update station
  update: async (stationId, stationData) => {
    const response = await api.put(`/stations/${stationId}`, stationData);
    return response.data;
  },
  
  // Add station
  add: async (stationData) => {
    const response = await api.post('/stations', stationData);
    return response.data;
  },
  
  // Delete station
  delete: async (stationId) => {
    const response = await api.delete(`/stations/${stationId}`);
    return response.data;
  },
  
  // Get station transactions
  getTransactions: async (stationId, limit = 10) => {
    const response = await api.get(`/stations/${stationId}/transactions?limit=${limit}`);
    return response.data;
  },
  
  // Get station OCPP messages
  getMessages: async (stationId, limit = 20) => {
    const response = await api.get(`/stations/${stationId}/messages?limit=${limit}`);
    return response.data;
  },
  
  // Get station connectors and their status
  getConnectors: async (stationId) => {
    const response = await api.get(`/stations/${stationId}/connectors`);
    return response.data;
  },
  
  // Send remote start transaction
  remoteStart: async (stationId, idTag) => {
    const response = await api.post(`/stations/${stationId}/remote-start`, { idTag });
    return response.data;
  },
  
  // Send remote stop transaction
  remoteStop: async (stationId, transactionId) => {
    const response = await api.post(`/stations/${stationId}/remote-stop`, { transactionId });
    return response.data;
  },
  
  // Send reset command
  reset: async (stationId, type = 'Soft') => {
    const response = await api.post(`/stations/${stationId}/reset`, { type });
    return response.data;
  },
  
  // Send change availability command
  changeAvailability: async (stationId, connectorId = 0, type = 'Operative') => {
    const response = await api.post(`/stations/${stationId}/change-availability`, { connectorId, type });
    return response.data;
  },
  
  // Send get configuration command
  getConfiguration: async (stationId, keys = []) => {
    const response = await api.post(`/stations/${stationId}/get-configuration`, { keys });
    return response.data;
  },
  
  // Send change configuration command
  changeConfiguration: async (stationId, key, value) => {
    const response = await api.post(`/stations/${stationId}/change-configuration`, { key, value });
    return response.data;
  },
  
  // Send clear cache command
  clearCache: async (stationId) => {
    const response = await api.post(`/stations/${stationId}/clear-cache`);
    return response.data;
  }
};

export default stationService;
