/**
 * Test script to send a RemoteStartTransaction request to a connected station
 */
require('dotenv').config();
const logger = require('./src/utils/logger');
const ocppServer = require('./src/ocpp/server');

// Configuration
const stationId = 'T001';  // Use the same station ID as our test-connection.js
const connectorId = 1;     // Use connector ID 1
const idTag = 'TEST_TAG';  // Use a test RFID tag ID

async function testRemoteStartTransaction() {
  try {
    logger.info(`Starting test for RemoteStartTransaction to station ${stationId}`);

    // Check if station is connected
    const isConnected = ocppServer.isConnected(stationId);
    logger.info(`Station ${stationId} connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);

    if (!isConnected) {
      logger.error(`Cannot start transaction: Station ${stationId} is not connected`);
      return;
    }

    // Prepare RemoteStartTransaction payload
    const payload = {
      connectorId: connectorId,
      idTag: idTag
    };

    // Send the RemoteStartTransaction request
    logger.info(`Sending RemoteStartTransaction to station ${stationId} with payload:`, payload);
    
    const response = await ocppServer.sendOcppRequest(
      stationId,
      'RemoteStartTransaction',
      payload
    );

    logger.info(`Received response from RemoteStartTransaction: ${JSON.stringify(response)}`);

    if (response && response.status === 'Accepted') {
      logger.info('✅ RemoteStartTransaction was accepted!');
    } else {
      logger.warn(`⚠️ RemoteStartTransaction was rejected: ${response ? response.status : 'No response'}`);
    }
  } catch (error) {
    logger.error(`Error testing RemoteStartTransaction: ${error.message}`, error);
  }
}

// Run the test
testRemoteStartTransaction().catch(err => {
  logger.error('Test failed with error:', err);
  process.exit(1);
});
