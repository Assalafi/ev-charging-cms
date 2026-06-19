import api from './api';

// Station service for handling station-related API calls
const stationService = {
  /**
   * Get all stations with optional filters
   * @param {Object} filters - Optional filters (status, location, etc.)
   * @param {Object} config - Additional axios config
   * @returns {Promise<Array>} Array of stations
   */
  getAll: async (filters = {}, config = {}) => {
    try {
      const response = await api.get('/stations', {
        params: filters,
        ...config
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching stations:', error);
      throw error;
    }
  },

  /**
   * Get station by ID with detailed information
   * @param {string} stationId - Station ID
   * @param {Object} options - Additional options (includeConnectors, includeTransactions, etc.)
   * @returns {Promise<Object>} Station details
   */
  getById: async (stationId, options = {}) => {
    try {
      const response = await api.get(`/stations/${stationId}`, {
        params: options
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station statistics with optional time range
   * @param {Object} timeRange - {startDate, endDate}
   * @returns {Promise<Object>} Statistics data
   */
  getStats: async (timeRange = {}) => {
    try {
      const response = await api.get('/stations/stats/summary', {
        params: timeRange
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching station stats:', error);
      throw error;
    }
  },

  /**
   * Update station details
   * @param {string} stationId - Station ID
   * @param {Object} stationData - Updated station data
   * @param {Object} config - Additional axios config
   * @returns {Promise<Object>} Updated station data
   */
  update: async (stationId, stationData, config = {}) => {
    try {
      const response = await api.put(`/stations/${stationId}`, stationData, config);
      return response.data;
    } catch (error) {
      console.error(`Error updating station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Add new station
   * @param {Object} stationData - New station data
   * @param {Object} config - Additional axios config
   * @returns {Promise<Object>} Created station data
   */
  add: async (stationData, config = {}) => {
    try {
      const response = await api.post('/stations', stationData, config);
      return response.data;
    } catch (error) {
      console.error('Error adding station:', error);
      throw error;
    }
  },

  /**
   * Delete station
   * @param {string} stationId - Station ID
   * @param {Object} config - Additional axios config
   * @returns {Promise<Object>} Deletion result
   */
  delete: async (stationId, config = {}) => {
    try {
      const response = await api.delete(`/stations/${stationId}`, config);
      return response.data;
    } catch (error) {
      console.error(`Error deleting station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station transactions with pagination
   * @param {string} stationId - Station ID
   * @param {Object} pagination - {page, limit}
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} {transactions, total, page, limit}
   */
  getTransactions: async (stationId, pagination = {}, filters = {}) => {
    try {
      const { page = 1, limit = 10 } = pagination;
      const response = await api.get(`/stations/${stationId}/transactions`, {
        params: {
          page,
          limit,
          ...filters
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching transactions for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station OCPP messages with pagination
   * @param {string} stationId - Station ID
   * @param {Object} pagination - {page, limit}
   * @param {Object} filters - Additional filters
   * @returns {Promise<Object>} {messages, total, page, limit}
   */
  getMessages: async (stationId, pagination = {}, filters = {}) => {
    try {
      const { page = 1, limit = 20 } = pagination;
      const response = await api.get(`/stations/${stationId}/messages`, {
        params: {
          page,
          limit,
          ...filters
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching messages for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station connectors and their status
   * @param {string} stationId - Station ID
   * @param {Object} config - Additional axios config
   * @returns {Promise<Array>} Array of connectors
   */
  getConnectors: async (stationId, config = {}) => {
    try {
      const response = await api.get(`/stations/${stationId}/connectors`, config);
      return response.data;
    } catch (error) {
      console.error(`Error fetching connectors for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Send remote start transaction command
   * @param {string} stationId - Station ID
   * @param {string} idTag - RFID tag ID
   * @param {Object} options - Additional options {connectorId}
   * @returns {Promise<Object>} Command result
   */
  remoteStart: async (stationId, idTag, options = {}) => {
    try {
      const response = await api.post(`/stations/${stationId}/remote-start`, {
        idTag,
        ...options
      });
      return response.data;
    } catch (error) {
      console.error(`Error starting transaction on station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Send remote stop transaction command
   * @param {string} stationId - Station ID
   * @param {number} transactionId - Transaction ID
   * @returns {Promise<Object>} Command result
   */
  remoteStop: async (stationId, transactionId) => {
    try {
      const response = await api.post(`/stations/${stationId}/remote-stop`, {
        transactionId
      });
      return response.data;
    } catch (error) {
      console.error(`Error stopping transaction on station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Send reset command to station
   * @param {string} stationId - Station ID
   * @param {string} type - Reset type ('Soft' or 'Hard')
   * @returns {Promise<Object>} Command result
   */
  reset: async (stationId, type = 'Soft') => {
    try {
      const response = await api.post(`/stations/${stationId}/reset`, { type });
      return response.data;
    } catch (error) {
      console.error(`Error resetting station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Change station/connector availability
   * @param {string} stationId - Station ID
   * @param {number} connectorId - Connector ID (0 for whole station)
   * @param {string} type - Availability type ('Operative' or 'Inoperative')
   * @returns {Promise<Object>} Command result
   */
  changeAvailability: async (stationId, connectorId = 0, type = 'Operative') => {
    try {
      const response = await api.post(`/stations/${stationId}/change-availability`, {
        connectorId,
        type
      });
      return response.data;
    } catch (error) {
      console.error(`Error changing availability for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station configuration
   * @param {string} stationId - Station ID
   * @param {Array<string>} keys - Configuration keys to fetch
   * @returns {Promise<Object>} Configuration values
   */
  getConfiguration: async (stationId, keys = []) => {
    try {
      const response = await api.post(`/stations/${stationId}/get-configuration`, { keys });
      return response.data;
    } catch (error) {
      console.error(`Error getting configuration for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Change station configuration
   * @param {string} stationId - Station ID
   * @param {string} key - Configuration key
   * @param {string} value - New value
   * @returns {Promise<Object>} Configuration result
   */
  changeConfiguration: async (stationId, key, value) => {
    try {
      const response = await api.post(`/stations/${stationId}/change-configuration`, {
        key,
        value
      });
      return response.data;
    } catch (error) {
      console.error(`Error changing configuration for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Clear station cache
   * @param {string} stationId - Station ID
   * @returns {Promise<Object>} Command result
   */
  clearCache: async (stationId) => {
    try {
      const response = await api.post(`/stations/${stationId}/clear-cache`);
      return response.data;
    } catch (error) {
      console.error(`Error clearing cache for station ${stationId}:`, error);
      throw error;
    }
  },

  /**
   * Get station real-time status (with cancellation support)
   * @param {string} stationId - Station ID
   * @returns {{request: Promise, cancel: Function}} Request object with cancel method
   */
  getRealtimeStatus: (stationId) => {
    return api.getWithCancel(`/stations/${stationId}/status`);
  },

  /**
   * Upload station firmware
   * @param {string} stationId - Station ID
   * @param {File} firmwareFile - Firmware file
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Upload result
   */
  uploadFirmware: async (stationId, firmwareFile, onProgress) => {
    try {
      const formData = new FormData();
      formData.append('firmware', firmwareFile);

      const response = await api.post(`/stations/${stationId}/firmware`, formData, {
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error uploading firmware to station ${stationId}:`, error);
      throw error;
    }
  }
};

export default stationService;