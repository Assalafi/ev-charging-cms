/**
 * Transaction Manager for OCPP
 * 
 * This script provides a robust interface for managing OCPP transactions
 * with fallback mechanisms to ensure reliable operation regardless of connection state.
 */
require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('./src/utils/logger');
const { ChargingStation, Connector, Transaction } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const mqttClient = require('./src/mqtt/client');

// Command line arguments
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const stationId = args[1];
const additionalParams = args.slice(2);

/**
 * Print usage information
 */
function printUsage() {
  console.log('Usage:');
  console.log('  node transaction-manager.js start <stationId> <connectorId> <idTag>');
  console.log('  node transaction-manager.js stop <stationId> [transactionId]');
  console.log('  node transaction-manager.js status <stationId>');
  console.log('  node transaction-manager.js list');
  console.log('  node transaction-manager.js fix-connector <stationId> <connectorId> <status>');
  console.log('\nExamples:');
  console.log('  node transaction-manager.js start T001 1 TEST_TAG');
  console.log('  node transaction-manager.js stop T001');
  console.log('  node transaction-manager.js status T001');
  console.log('  node transaction-manager.js list');
  console.log('  node transaction-manager.js fix-connector T001 1 Available');
}

/**
 * Check if a station is connected to the OCPP server
 */
async function checkConnection(stationId) {
  logger.info(`Checking connection for station ${stationId}...`);
  
  try {
    // Try the standard isConnected method first
    const isConnected = ocppServer.isConnected(stationId);
    
    if (isConnected) {
      logger.info(`Station ${stationId} is connected via standard check`);
      return true;
    }
    
    // Check if station exists in database
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return false;
    }
    
    // Get last connection time
    const lastConnection = station.lastConnection;
    const lastConnectionTime = lastConnection ? new Date(lastConnection).getTime() : 0;
    const now = Date.now();
    const timeSinceLastConnection = now - lastConnectionTime;
    
    // If connection was recent (last 5 minutes), we'll assume it's still valid
    const recentConnection = lastConnectionTime > 0 && timeSinceLastConnection < 5 * 60 * 1000;
    
    if (recentConnection) {
      logger.info(`Station ${stationId} had a recent connection (${Math.round(timeSinceLastConnection / 1000)} seconds ago)`);
      return true;
    }
    
    logger.warn(`Station ${stationId} is not connected`);
    return false;
  } catch (error) {
    logger.error(`Error checking connection: ${error.message}`);
    return false;
  }
}

/**
 * Start a transaction
 */
async function startTransaction(stationId, connectorId, idTag) {
  logger.info(`Starting transaction for station ${stationId}, connector ${connectorId}, tag ${idTag}`);
  
  try {
    // Check if station exists
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return { success: false, message: 'Station not found' };
    }
    
    // Check connection
    const isConnected = await checkConnection(stationId);
    
    // Determine if we should use OCPP or direct database approach
    const useOcpp = isConnected;
    
    if (useOcpp) {
      logger.info(`Using OCPP to start transaction for ${stationId}`);
      
      try {
        // Prepare payload
        const payload = { 
          connectorId: parseInt(connectorId, 10), 
          idTag
        };
        
        // Send RemoteStartTransaction request
        const response = await ocppServer.sendOcppRequest(stationId, 'RemoteStartTransaction', payload);
        
        if (response && response.status === 'Accepted') {
          logger.info(`RemoteStartTransaction accepted for ${stationId}`);
          
          // Transaction will be created by the station's StartTransaction message
          return { 
            success: true, 
            message: 'Transaction started via OCPP',
            method: 'ocpp'
          };
        } else {
          logger.warn(`RemoteStartTransaction rejected for ${stationId}: ${JSON.stringify(response)}`);
          
          // Fall back to direct database approach
          logger.info('Falling back to direct database approach');
        }
      } catch (error) {
        logger.error(`Error sending RemoteStartTransaction: ${error.message}`);
        logger.info('Falling back to direct database approach');
      }
    }
    
    // Direct database approach as fallback
    logger.info(`Using direct database approach to start transaction for ${stationId}`);
    
    // Create transaction ID
    const transactionId = Math.floor(Math.random() * 1000000) + 1;
    
    // Create transaction record
    const transaction = await Transaction.create({
      transactionId,
      chargePointId: stationId,
      connectorId: parseInt(connectorId, 10),
      idTag,
      startTime: new Date(),
      startMeterValue: 0,
      status: 'InProgress'
    });
    
    // Update connector status
    try {
      // Find connector
      const connector = await Connector.findOne({
        where: { 
          chargePointId: stationId,
          connectorId: parseInt(connectorId, 10)
        }
      });
      
      if (connector) {
        // Update status to Charging
        await connector.update({
          status: 'Charging',
          transactionId,
          lastStatusUpdate: new Date()
        });
        
        logger.info(`Updated connector ${connectorId} status to Charging`);
      } else {
        // Create connector if it doesn't exist
        await Connector.create({
          chargePointId: stationId,
          connectorId: parseInt(connectorId, 10),
          status: 'Charging',
          transactionId,
          lastStatusUpdate: new Date()
        });
        
        logger.info(`Created connector ${connectorId} with status Charging`);
      }
    } catch (error) {
      logger.error(`Error updating connector: ${error.message}`);
    }
    
    // Publish to MQTT if available
    try {
      await mqttClient.publish(`ocpp/${stationId}/transaction/start`, {
        transactionId,
        connectorId: parseInt(connectorId, 10),
        idTag,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Published transaction start to MQTT for ${stationId}`);
    } catch (error) {
      logger.error(`Error publishing to MQTT: ${error.message}`);
    }
    
    return {
      success: true,
      message: 'Transaction started via database',
      method: 'database',
      transactionId
    };
  } catch (error) {
    logger.error(`Error starting transaction: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Stop a transaction
 */
async function stopTransaction(stationId, specificTransactionId = null) {
  logger.info(`Stopping transaction for station ${stationId}${specificTransactionId ? `, transaction ${specificTransactionId}` : ''}`);
  
  try {
    // Check if station exists
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return { success: false, message: 'Station not found' };
    }
    
    // Find active transaction
    const whereClause = {
      chargePointId: stationId,
      status: 'InProgress'
    };
    
    if (specificTransactionId) {
      whereClause.transactionId = specificTransactionId;
    }
    
    const transaction = await Transaction.findOne({
      where: whereClause,
      order: [['startTime', 'DESC']]
    });
    
    if (!transaction) {
      logger.error(`No active transaction found for ${stationId}${specificTransactionId ? ` with ID ${specificTransactionId}` : ''}`);
      return { success: false, message: 'No active transaction found' };
    }
    
    const transactionId = transaction.transactionId;
    logger.info(`Found active transaction ${transactionId} for ${stationId}`);
    
    // Check connection
    const isConnected = await checkConnection(stationId);
    
    // Determine if we should use OCPP or direct database approach
    const useOcpp = isConnected;
    
    if (useOcpp) {
      logger.info(`Using OCPP to stop transaction ${transactionId} for ${stationId}`);
      
      try {
        // Prepare payload
        const payload = { transactionId };
        
        // Send RemoteStopTransaction request
        const response = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', payload);
        
        if (response && response.status === 'Accepted') {
          logger.info(`RemoteStopTransaction accepted for transaction ${transactionId}`);
          
          // Transaction will be updated by the station's StopTransaction message
          return { 
            success: true, 
            message: 'Transaction stop request sent via OCPP',
            method: 'ocpp',
            transactionId
          };
        } else {
          logger.warn(`RemoteStopTransaction rejected for transaction ${transactionId}: ${JSON.stringify(response)}`);
          
          // Fall back to direct database approach
          logger.info('Falling back to direct database approach');
        }
      } catch (error) {
        logger.error(`Error sending RemoteStopTransaction: ${error.message}`);
        logger.info('Falling back to direct database approach');
      }
    }
    
    // Direct database approach as fallback
    logger.info(`Using direct database approach to stop transaction ${transactionId}`);
    
    // Update transaction record
    await transaction.update({
      status: 'Completed',
      stopTime: new Date(),
      stopMeterValue: transaction.startMeterValue + 1000, // Simulated meter value
      energyDelivered: 1.0 // Simulated energy
    });
    
    logger.info(`Updated transaction ${transactionId} status to Completed`);
    
    // Update connector status
    try {
      // Find connector
      const connector = await Connector.findOne({
        where: { 
          chargePointId: stationId,
          connectorId: transaction.connectorId
        }
      });
      
      if (connector) {
        // Update status to Available
        await connector.update({
          status: 'Available',
          transactionId: null,
          lastStatusUpdate: new Date()
        });
        
        logger.info(`Updated connector ${transaction.connectorId} status to Available`);
      }
    } catch (error) {
      logger.error(`Error updating connector: ${error.message}`);
    }
    
    // Publish to MQTT if available
    try {
      await mqttClient.publish(`ocpp/${stationId}/transaction/stop`, {
        transactionId,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Published transaction stop to MQTT for ${stationId}`);
    } catch (error) {
      logger.error(`Error publishing to MQTT: ${error.message}`);
    }
    
    return {
      success: true,
      message: 'Transaction stopped via database',
      method: 'database',
      transactionId
    };
  } catch (error) {
    logger.error(`Error stopping transaction: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Get transaction status
 */
async function getTransactionStatus(stationId) {
  logger.info(`Getting transaction status for station ${stationId}`);
  
  try {
    // Check if station exists
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return { success: false, message: 'Station not found' };
    }
    
    // Check connection status
    const isConnected = await checkConnection(stationId);
    
    // Get connector status
    const connectors = await Connector.findAll({
      where: { chargePointId: stationId },
      order: [['connectorId', 'ASC']]
    });
    
    // Get active transactions
    const activeTransactions = await Transaction.findAll({
      where: {
        chargePointId: stationId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    // Format connector info
    const connectorInfo = connectors.map(c => ({
      connectorId: c.connectorId,
      status: c.status,
      errorCode: c.errorCode || 'NoError',
      transactionId: c.transactionId,
      lastUpdated: c.lastStatusUpdate
    }));
    
    // Format transaction info
    const transactionInfo = activeTransactions.map(t => ({
      transactionId: t.transactionId,
      connectorId: t.connectorId,
      idTag: t.idTag,
      startTime: t.startTime,
      startMeterValue: t.startMeterValue,
      status: t.status
    }));
    
    return {
      success: true,
      station: {
        id: station.id,
        chargePointId: station.chargePointId,
        status: station.status,
        isConnected,
        lastConnection: station.lastConnection
      },
      connectors: connectorInfo,
      transactions: transactionInfo
    };
  } catch (error) {
    logger.error(`Error getting transaction status: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * List all stations with active transactions
 */
async function listStations() {
  logger.info('Listing all stations with transaction status');
  
  try {
    // Get all stations
    const stations = await ChargingStation.findAll({
      order: [['chargePointId', 'ASC']]
    });
    
    // Get active transactions
    const activeTransactions = await Transaction.findAll({
      where: { status: 'InProgress' },
      order: [['startTime', 'DESC']]
    });
    
    // Map transactions by station
    const transactionsByStation = {};
    activeTransactions.forEach(t => {
      if (!transactionsByStation[t.chargePointId]) {
        transactionsByStation[t.chargePointId] = [];
      }
      transactionsByStation[t.chargePointId].push({
        transactionId: t.transactionId,
        connectorId: t.connectorId,
        idTag: t.idTag,
        startTime: t.startTime
      });
    });
    
    // Format station info
    const stationInfo = await Promise.all(stations.map(async (s) => {
      // Check connection status
      const isConnected = ocppServer.isConnected(s.chargePointId);
      
      return {
        id: s.id,
        chargePointId: s.chargePointId,
        status: s.status,
        isConnected,
        lastConnection: s.lastConnection,
        activeTransactions: transactionsByStation[s.chargePointId] || []
      };
    }));
    
    return {
      success: true,
      stations: stationInfo
    };
  } catch (error) {
    logger.error(`Error listing stations: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Fix connector status
 */
async function fixConnectorStatus(stationId, connectorId, status) {
  logger.info(`Fixing connector ${connectorId} status to ${status} for station ${stationId}`);
  
  try {
    // Check if station exists
    const station = await ChargingStation.findOne({
      where: { chargePointId: stationId }
    });
    
    if (!station) {
      logger.error(`Station ${stationId} not found in database`);
      return { success: false, message: 'Station not found' };
    }
    
    // Find connector
    let connector = await Connector.findOne({
      where: { 
        chargePointId: stationId,
        connectorId: parseInt(connectorId, 10)
      }
    });
    
    if (connector) {
      // Update status
      await connector.update({
        status,
        lastStatusUpdate: new Date()
      });
      
      logger.info(`Updated connector ${connectorId} status to ${status}`);
    } else {
      // Create connector if it doesn't exist
      connector = await Connector.create({
        chargePointId: stationId,
        connectorId: parseInt(connectorId, 10),
        status,
        lastStatusUpdate: new Date()
      });
      
      logger.info(`Created connector ${connectorId} with status ${status}`);
    }
    
    // If setting to Available, clear any active transactions
    if (status === 'Available') {
      // Find active transactions for this connector
      const activeTransactions = await Transaction.findAll({
        where: {
          chargePointId: stationId,
          connectorId: parseInt(connectorId, 10),
          status: 'InProgress'
        }
      });
      
      // Complete all active transactions
      for (const transaction of activeTransactions) {
        await transaction.update({
          status: 'Completed',
          stopTime: new Date(),
          stopMeterValue: transaction.startMeterValue + 1000,
          energyDelivered: 1.0
        });
        
        logger.info(`Completed transaction ${transaction.transactionId} for connector ${connectorId}`);
      }
    }
    
    // Publish to MQTT if available
    try {
      await mqttClient.publish(`ocpp/${stationId}/status`, {
        connectorId: parseInt(connectorId, 10),
        status,
        timestamp: new Date().toISOString()
      });
      
      logger.info(`Published connector status update to MQTT for ${stationId}`);
    } catch (error) {
      logger.error(`Error publishing to MQTT: ${error.message}`);
    }
    
    return {
      success: true,
      message: `Connector ${connectorId} status updated to ${status}`,
      connector: {
        chargePointId: stationId,
        connectorId: parseInt(connectorId, 10),
        status,
        lastUpdated: new Date()
      }
    };
  } catch (error) {
    logger.error(`Error fixing connector status: ${error.message}`);
    return { success: false, message: `Error: ${error.message}` };
  }
}

/**
 * Main function
 */
async function main() {
  if (!command || !stationId && command !== 'list') {
    printUsage();
    return;
  }
  
  let result;
  
  switch (command) {
    case 'start':
      // Extract parameters
      const connectorId = additionalParams[0];
      const idTag = additionalParams[1];
      
      if (!connectorId || !idTag) {
        console.log('Error: Missing required parameters for start command');
        printUsage();
        return;
      }
      
      result = await startTransaction(stationId, connectorId, idTag);
      break;
      
    case 'stop':
      // Extract optional transaction ID
      const transactionId = additionalParams[0];
      result = await stopTransaction(stationId, transactionId);
      break;
      
    case 'status':
      result = await getTransactionStatus(stationId);
      break;
      
    case 'list':
      result = await listStations();
      break;
      
    case 'fix-connector':
      // Extract parameters
      const fixConnectorId = additionalParams[0];
      const fixStatus = additionalParams[1];
      
      if (!fixConnectorId || !fixStatus) {
        console.log('Error: Missing required parameters for fix-connector command');
        printUsage();
        return;
      }
      
      result = await fixConnectorStatus(stationId, fixConnectorId, fixStatus);
      break;
      
    default:
      console.log(`Error: Unknown command '${command}'`);
      printUsage();
      return;
  }
  
  // Pretty print the result
  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}).finally(() => {
  // Allow time for logs to be written
  setTimeout(() => process.exit(0), 1000);
});
