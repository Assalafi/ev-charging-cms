/**
 * Debug WebSocket connections in the OCPP server
 */
require('dotenv').config();
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

// Get internal connection map (exposed by our server.js fixes)
const connectionMap = ocppServer._getConnectionsForDiagnostics();

logger.info(`Connection map size: ${connectionMap ? connectionMap.size : 'undefined'}`);
logger.info('-----------------------------------');

// If we have a connection map, show details about each connection
if (connectionMap && connectionMap.size > 0) {
  logger.info('Connected stations:');
  
  // Iterate through all entries in the map
  for (const [stationId, ws] of connectionMap.entries()) {
    const readyState = ws ? ws.readyState : 'undefined';
    const readyStateText = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][readyState] || 'UNKNOWN';
    const isAlive = ws ? ws.isAlive : false;
    
    logger.info(`Station: ${stationId}`);
    logger.info(`  WebSocket Ready State: ${readyState} (${readyStateText})`);
    logger.info(`  isAlive: ${isAlive}`);
    logger.info(`  protocol: ${ws ? ws.protocol : 'undefined'}`);
    
    // Check if it's detected as connected by our API
    const isConnected = ocppServer.isConnected(stationId);
    logger.info(`  Reported as connected: ${isConnected}`);
    logger.info('-----------------------------------');
  }
} else {
  logger.info('No connections found in the map.');
}

// Check the public API as well
const connectedStations = ocppServer.getConnectedStations();
logger.info(`Public API reports ${connectedStations.length} connected stations:`);
if (connectedStations.length > 0) {
  connectedStations.forEach(stationId => {
    logger.info(`  - ${stationId}`);
  });
}

// Attempt to connect to simulator URL to test connection
const WebSocket = require('ws');

try {
  logger.info('Testing WebSocket connection to localhost:8080/ocpp/T001...');
  const testWs = new WebSocket('ws://localhost:8080/ocpp/T001', ['ocpp1.6']);
  
  testWs.on('open', () => {
    logger.info('✅ Test connection successful!');
    
    // Send a boot notification to test full cycle
    const bootMessage = [2, "test-1", "BootNotification", {
      chargePointVendor: "Vendor",
      chargePointModel: "Model"
    }];
    
    testWs.send(JSON.stringify(bootMessage));
    logger.info('Sent test BootNotification message');
    
    // Close after a brief delay
    setTimeout(() => {
      testWs.close();
      logger.info('Test connection closed');
      process.exit(0);
    }, 2000);
  });
  
  testWs.on('message', (data) => {
    logger.info(`Received response: ${data}`);
  });
  
  testWs.on('error', (error) => {
    logger.error(`Test connection error: ${error.message}`);
    process.exit(1);
  });
  
  testWs.on('close', () => {
    logger.info('Test connection closed');
  });
} catch (error) {
  logger.error(`Failed to create test connection: ${error.message}`);
}
