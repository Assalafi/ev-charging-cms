/**
 * HTTP-based OCPP Diagnostic Tool
 * 
 * This script uses HTTP calls to the running server to diagnose connection issues
 */

require('dotenv').config();
const axios = require('axios');
const logger = require('./src/utils/logger');
const { ChargingStation } = require('./src/models');

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';

async function getServerStatus() {
  try {
    logger.info('==== OCPP HTTP Diagnostics ====');
    
    // Get server health status
    const healthResponse = await axios.get('http://localhost:3000/health');
    logger.info(`Server health: ${healthResponse.data.status}`);
    logger.info(`Server timestamp: ${healthResponse.data.timestamp}`);
    
    // Add an API endpoint to get OCPP status
    const ocppStatusResponse = await axios.get(`${API_BASE_URL}/ocpp/status`);
    
    const { initialized, connectionCount, connectedStations } = ocppStatusResponse.data;
    
    logger.info(`OCPP server initialized: ${initialized ? 'Yes' : 'No'}`);
    logger.info(`Connection count: ${connectionCount}`);
    
    if (connectedStations && connectedStations.length > 0) {
      logger.info(`Connected stations (${connectedStations.length}):`);
      connectedStations.forEach(station => {
        logger.info(`- ${station}`);
      });
    } else {
      logger.warn('No stations connected via OCPP');
    }
    
    return ocppStatusResponse.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      logger.error('Server is not running or not accessible');
    } else {
      logger.error(`Error getting server status: ${error.message}`);
    }
    return null;
  }
}

async function getChargingStationStatus(stationId) {
  try {
    // Get station details from the API using the diagnostic endpoint
    const stationResponse = await axios.get(`${API_BASE_URL}/stations/diagnostic/${stationId}`);
    const station = stationResponse.data.station;
    
    logger.info(`\nStation: ${stationId}`);
    logger.info(`Status: ${station.status}`);
    logger.info(`Last connection: ${station.lastConnection}`);
    logger.info(`OCPP connection: ${station.isConnected ? 'Connected' : 'Disconnected'}`);
    
    // Get connectors for this station using the diagnostic endpoint
    const connectorsResponse = await axios.get(`${API_BASE_URL}/stations/diagnostic/${stationId}/connectors`);
    const connectors = connectorsResponse.data.connectors;
    
    if (connectors && connectors.length > 0) {
      logger.info(`\nConnectors (${connectors.length}):`);
      connectors.forEach(connector => {
        logger.info(`  Connector #${connector.connectorId}: ${connector.status}`);
        if (connector.transactionId) {
          logger.info(`    Transaction: ${connector.transactionId}`);
        }
      });
    } else {
      logger.warn('No connectors found for this station');
    }
    
    // Get active transactions using the diagnostic endpoint
    const transactionsResponse = await axios.get(`${API_BASE_URL}/stations/diagnostic/${stationId}/transactions?status=InProgress`);
    const transactions = transactionsResponse.data.transactions;
    
    if (transactions && transactions.length > 0) {
      logger.info(`\nActive transactions (${transactions.length}):`);
      transactions.forEach(tx => {
        logger.info(`  Transaction #${tx.transactionId} on connector ${tx.connectorId}`);
        logger.info(`    Started: ${tx.startTime}`);
        logger.info(`    Tag: ${tx.idTag}`);
      });
    } else {
      logger.info('No active transactions for this station');
    }
    
    return { station, connectors, transactions };
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logger.error(`Station ${stationId} not found`);
    } else {
      logger.error(`Error getting station status: ${error.message}`);
    }
    return null;
  }
}

async function testRemoteStart(stationId, connectorId, idTag) {
  try {
    logger.info(`\nTesting RemoteStartTransaction for ${stationId}...`);
    
    const startResponse = await axios.post(`${API_BASE_URL}/stations/diagnostic/${stationId}/remote-start`, {
      connectorId: connectorId || 1,
      idTag: idTag || 'TEST_TAG'
    });
    
    if (startResponse.data.success) {
      logger.info(`RemoteStartTransaction success! Message ID: ${startResponse.data.messageId}`);
      logger.info(`${startResponse.data.message}`);
    } else {
      logger.error(`RemoteStartTransaction failed: ${startResponse.data.message}`);
    }
    
    return startResponse.data;
  } catch (error) {
    logger.error(`Error sending RemoteStartTransaction: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testRemoteStop(stationId, transactionId) {
  try {
    logger.info(`\nTesting RemoteStopTransaction for ${stationId}...`);
    
    // If transactionId is not provided, get the active transaction
    if (!transactionId) {
      const transactionsResponse = await axios.get(`${API_BASE_URL}/stations/diagnostic/${stationId}/transactions?status=InProgress`);
      const transactions = transactionsResponse.data.transactions;
      
      if (transactions && transactions.length > 0) {
        transactionId = transactions[0].transactionId;
        logger.info(`Found active transaction: ${transactionId}`);
      } else {
        logger.error('No active transactions found to stop');
        return { success: false, message: 'No active transactions' };
      }
    }
    
    const stopResponse = await axios.post(`${API_BASE_URL}/stations/diagnostic/${stationId}/remote-stop`, {
      transactionId
    });
    
    if (stopResponse.data.success) {
      logger.info(`RemoteStopTransaction success! ${stopResponse.data.message}`);
    } else {
      logger.error(`RemoteStopTransaction failed: ${stopResponse.data.message}`);
    }
    
    return stopResponse.data;
  } catch (error) {
    logger.error(`Error sending RemoteStopTransaction: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    // Process command line arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'status') {
      // Get overall server status
      await getServerStatus();
      
      // If station ID is provided, get that station's status
      if (args[1]) {
        await getChargingStationStatus(args[1]);
      }
    } else if (args[0] === 'start' && args[1]) {
      await getServerStatus();
      await getChargingStationStatus(args[1]);
      await testRemoteStart(args[1], args[2], args[3]);
    } else if (args[0] === 'stop' && args[1]) {
      await getServerStatus();
      await getChargingStationStatus(args[1]);
      await testRemoteStop(args[1], args[2]);
    } else {
      console.log(`
Usage:
  node http-ocpp-diag.js [command] [options]

Commands:
  status [stationId]         Get server status and optionally station status
  start <stationId> [connectorId] [idTag]   Start a transaction
  stop <stationId> [transactionId]   Stop a transaction

Examples:
  node http-ocpp-diag.js status
  node http-ocpp-diag.js status T001
  node http-ocpp-diag.js start T001 1 TEST_TAG
  node http-ocpp-diag.js stop T001
      `);
    }
  } catch (error) {
    logger.error('Error in main program:', error);
  }
}

main().catch(error => {
  logger.error('Fatal error:', error);
});
