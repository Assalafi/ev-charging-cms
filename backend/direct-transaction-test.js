/**
 * Direct Transaction Test
 * 
 * This script bypasses the API authentication to directly test the OCPP transaction functions.
 */
require('dotenv').config();
const logger = require('./src/utils/logger');
const ocppServer = require('./src/ocpp/server');
const { ChargingStation, Transaction } = require('./src/models');

// Configuration
const config = {
  stationId: 'T001',
  connectorId: 1,
  idTag: 'TEST_TAG',
  // Set to true to test transaction start, false to test transaction stop
  startTransaction: true
};

// Parse command line arguments
if (process.argv.length > 2) {
  config.stationId = process.argv[2];
}

if (process.argv.length > 3) {
  config.startTransaction = process.argv[3].toLowerCase() === 'start';
}

/**
 * Start a transaction
 */
async function startTransaction(stationId, connectorId, idTag) {
  logger.info(`Attempting to start transaction for ${stationId}, connector ${connectorId} with tag ${idTag}`);
  
  try {
    // Check if station exists and is connected
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return false;
    }
    
    // Check if station is connected to OCPP server
    const isConnected = ocppServer.isConnected(stationId);
    logger.info(`Station ${stationId} connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    if (!isConnected) {
      logger.error(`Cannot start transaction: Station ${stationId} is not connected`);
      return false;
    }
    
    // Send RemoteStartTransaction request
    const payload = {
      connectorId: connectorId,
      idTag: idTag
    };
    
    logger.info(`Sending RemoteStartTransaction to ${stationId}: ${JSON.stringify(payload)}`);
    const response = await ocppServer.sendOcppRequest(stationId, 'RemoteStartTransaction', payload);
    
    logger.info(`RemoteStartTransaction response: ${JSON.stringify(response)}`);
    
    if (response && response.status === 'Accepted') {
      logger.info(`Transaction successfully started on ${stationId}, connector ${connectorId}`);
      return true;
    } else {
      logger.error(`Transaction start failed: ${JSON.stringify(response)}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error starting transaction: ${error.message}`);
    return false;
  }
}

/**
 * Stop a transaction
 */
async function stopTransaction(stationId) {
  logger.info(`Attempting to stop transaction for ${stationId}`);
  
  try {
    // Check if station exists and is connected
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return false;
    }
    
    // Check if station is connected to OCPP server
    const isConnected = ocppServer.isConnected(stationId);
    logger.info(`Station ${stationId} connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    if (!isConnected) {
      logger.error(`Cannot stop transaction: Station ${stationId} is not connected`);
      return false;
    }
    
    // Find active transaction for the station
    const transaction = await Transaction.findOne({
      where: {
        chargePointId: stationId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    if (!transaction) {
      logger.error(`No active transaction found for ${stationId}`);
      return false;
    }
    
    logger.info(`Found active transaction ${transaction.transactionId} for ${stationId}`);
    
    // Send RemoteStopTransaction request
    const payload = {
      transactionId: transaction.transactionId
    };
    
    logger.info(`Sending RemoteStopTransaction to ${stationId}: ${JSON.stringify(payload)}`);
    const response = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', payload);
    
    logger.info(`RemoteStopTransaction response: ${JSON.stringify(response)}`);
    
    if (response && response.status === 'Accepted') {
      logger.info(`Transaction ${transaction.transactionId} successfully stopped`);
      return true;
    } else {
      logger.error(`Transaction stop failed: ${JSON.stringify(response)}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error stopping transaction: ${error.message}`);
    return false;
  }
}

/**
 * Check connection status
 */
async function checkConnection(stationId) {
  logger.info(`Checking connection status for ${stationId}`);
  
  try {
    // Check if the connection is mapped in the server
    const isConnected = ocppServer.isConnected(stationId);
    const connectedStations = ocppServer.getConnectedStations();
    
    logger.info(`Total connected stations: ${connectedStations.length}`);
    logger.info(`Connected stations: ${connectedStations.join(', ')}`);
    logger.info(`${stationId} connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    return isConnected;
  } catch (error) {
    logger.error(`Error checking connection: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  logger.info('==== Direct Transaction Test ====');
  logger.info(`Target station: ${config.stationId}`);
  logger.info(`Action: ${config.startTransaction ? 'Start' : 'Stop'} transaction`);
  
  // Check connection status first
  const isConnected = await checkConnection(config.stationId);
  
  if (!isConnected) {
    logger.warn(`Station ${config.stationId} is not connected. Running with a simulated station may be required.`);
  }
  
  // Run the appropriate transaction function
  if (config.startTransaction) {
    await startTransaction(config.stationId, config.connectorId, config.idTag);
  } else {
    await stopTransaction(config.stationId);
  }
  
  logger.info('==== Test Complete ====');
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}).finally(() => {
  // Allow time for logs to be written
  setTimeout(() => process.exit(0), 1000);
});
