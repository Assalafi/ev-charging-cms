import api from './api';

/**
 * Service for sending remote commands to charging stations
 */
const remoteCommandService = {
  /**
   * Reset a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} type - Reset type ('Soft' or 'Hard')
   * @returns {Promise} - Promise resolving to command result
   */
  reset: async (stationId, type = 'Soft') => {
    return api.post(`/remote-commands/${stationId}/reset`, { type });
  },

  /**
   * Change configuration of a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} key - Configuration key
   * @param {string|number|boolean} value - Configuration value
   * @returns {Promise} - Promise resolving to command result
   */
  changeConfiguration: async (stationId, key, value) => {
    return api.post(`/remote-commands/${stationId}/change-configuration`, { key, value });
  },

  /**
   * Get configuration from a charging station
   * @param {string} stationId - ID of the charging station
   * @param {Array<string>} keys - Optional specific configuration keys to retrieve
   * @returns {Promise} - Promise resolving to command result
   */
  getConfiguration: async (stationId, keys = []) => {
    return api.post(`/remote-commands/${stationId}/get-configuration`, { keys });
  },

  /**
   * Unlock a connector on a charging station
   * @param {string} stationId - ID of the charging station
   * @param {number} connectorId - ID of the connector to unlock
   * @returns {Promise} - Promise resolving to command result
   */
  unlockConnector: async (stationId, connectorId = 1) => {
    return api.post(`/remote-commands/${stationId}/unlock-connector`, { connectorId });
  },

  /**
   * Trigger a message from a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} requestedMessage - Type of message to request
   * @param {number} connectorId - Optional connector ID for relevant messages
   * @returns {Promise} - Promise resolving to command result
   */
  triggerMessage: async (stationId, requestedMessage, connectorId) => {
    const payload = { requestedMessage };
    if (connectorId !== undefined) {
      payload.connectorId = connectorId;
    }
    return api.post(`/remote-commands/${stationId}/trigger-message`, payload);
  },

  /**
   * Start a transaction remotely on a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} idTag - ID tag for authorization
   * @param {number} connectorId - Connector ID to start charging on
   * @returns {Promise} - Promise resolving to command result
   */
  remoteStart: async (stationId, idTag, connectorId = 1) => {
    return api.post(`/remote-commands/${stationId}/remote-start`, {
      idTag,
      connectorId
    });
  },

  /**
   * Stop a transaction remotely on a charging station
   * @param {string} stationId - ID of the charging station
   * @param {number} transactionId - ID of transaction to stop
   * @returns {Promise} - Promise resolving to command result
   */
  remoteStop: async (stationId, transactionId) => {
    return api.post(`/remote-commands/${stationId}/remote-stop`, {
      transactionId
    });
  },

  /**
   * Send a data transfer to a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} vendorId - Vendor ID for the data transfer
   * @param {string} messageId - Optional message ID
   * @param {any} data - Data to send
   * @returns {Promise} - Promise resolving to command result
   */
  dataTransfer: async (stationId, vendorId, messageId = null, data = null) => {
    const payload = { vendorId };
    if (messageId) payload.messageId = messageId;
    if (data) payload.data = data;
    return api.post(`/remote-commands/${stationId}/data-transfer`, payload);
  },
  
  /**
   * Trigger a boot notification for a charging station
   * @param {string} stationId - ID of the charging station
   * @param {string} vendor - Vendor name for the station
   * @param {string} model - Model name for the station
   * @param {string} firmware - Firmware version for the station
   * @returns {Promise} - Promise resolving to command result
   */
  triggerBoot: async (stationId, vendor, model, firmware) => {
    return api.post(`/stations/${stationId}/trigger-boot`, {
      vendor,
      model,
      firmware
    });
  }
};

export default remoteCommandService;
