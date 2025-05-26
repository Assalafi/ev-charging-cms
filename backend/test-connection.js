/**
 * Test script to establish and maintain a persistent WebSocket connection to the OCPP server
 */
require('dotenv').config();
const WebSocket = require('ws');
const logger = require('./src/utils/logger');

// Configuration
const stationId = 'T001';  // Use any station ID that exists in your database
const serverUrl = `ws://localhost:8080/ocpp/${stationId}`;
const protocol = ['ocpp1.6'];

// Add a utility function to check if the station is registered
async function checkStationRegistration() {
  try {
    // Import directly to avoid circular dependencies
    const ocppServer = require('./src/ocpp/server');
    
    // Check if the station is registered in the server
    const isConnected = ocppServer.isConnected(stationId);
    logger.info(`Connection status in OCPP server: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    // Get all connected stations
    const connectedStations = ocppServer.getConnectedStations();
    logger.info(`All connected stations: ${JSON.stringify(connectedStations)}`);
    
    // Get the internal connection map size
    const connectionMap = ocppServer._getConnectionsForDiagnostics();
    logger.info(`Internal connection map size: ${connectionMap ? connectionMap.size : 'undefined'}`);
    
    if (connectionMap) {
      logger.info('Connection map keys:', Array.from(connectionMap.keys()));
    }
    
    return isConnected;
  } catch (error) {
    logger.error(`Error checking station registration: ${error.message}`);
    return false;
  }
}

// Create the WebSocket connection
logger.info(`Attempting to connect to ${serverUrl} with protocol ${protocol}`);

const ws = new WebSocket(serverUrl, protocol);

// Connection opened
ws.on('open', async () => {
  logger.info(`✅ Connection established for station ${stationId}`);
  
  // Check if we're registered already
  logger.info('Checking initial registration status...');
  await checkStationRegistration();
  
  // Send a BootNotification message to register properly
  const bootNotification = [
    2,  // Message Type ID for CALL
    "boot-" + Date.now(), // Unique ID for this message
    "BootNotification", // Action
    {  // Payload
      chargePointVendor: "Test Vendor",
      chargePointModel: "Test Model",
      chargePointSerialNumber: "SN-123",
      firmwareVersion: "1.0.0"
    }
  ];
  
  // Send the boot notification
  logger.info('Sending BootNotification message');
  ws.send(JSON.stringify(bootNotification));
  
  // Check registration status after a short delay to allow processing
  setTimeout(async () => {
    logger.info('Checking registration status after boot notification...');
    const isRegistered = await checkStationRegistration();
    
    if (!isRegistered) {
      logger.warn('⚠️ Station not registered after boot notification! Attempting to fix...');
      
      try {
        // Try to fix the connection manually
        const ocppServer = require('./src/ocpp/server');
        if (ocppServer._rebuildConnection) {
          logger.info('Manually rebuilding connection...');
          const result = ocppServer._rebuildConnection(stationId, ws);
          logger.info(`Rebuild connection result: ${result}`);
          
          // Check if it worked
          await checkStationRegistration();
        }
      } catch (error) {
        logger.error(`Failed to manually rebuild connection: ${error.message}`);
      }
    }
  }, 2000);
  
  // Setup regular heartbeat
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const heartbeat = [
        2,  // Message Type ID for CALL
        "hb-" + Date.now(), // Unique ID for this message
        "Heartbeat", // Action
        {}  // Empty payload
      ];
      
      logger.info('Sending Heartbeat message');
      ws.send(JSON.stringify(heartbeat));
    }
  }, 60000); // Send heartbeat every minute
});

// Listen for messages
ws.on('message', (data) => {
  const message = JSON.parse(data);
  logger.info(`Received message: ${data}`);
  
  // If we receive a response to a call, log it
  if (message[0] === 3) { // Message Type ID for CALLRESULT
    logger.info(`Received response for message ${message[1]}: ${JSON.stringify(message[2])}`);
  }
});

// Handle errors
ws.on('error', (error) => {
  logger.error(`WebSocket error: ${error.message}`);
});

// Handle connection close
ws.on('close', (code, reason) => {
  logger.warn(`WebSocket connection closed: ${code} - ${reason || 'No reason provided'}`);
  
  // Attempt to reconnect after a short delay
  logger.info('Attempting to reconnect in 5 seconds...');
  setTimeout(() => {
    logger.info('Reconnecting...');
    const newWs = new WebSocket(serverUrl, protocol);
    // Transfer event listeners
    ws.on('open', () => newWs.emit('open'));
    ws.on('message', (data) => newWs.emit('message', data));
    ws.on('error', (error) => newWs.emit('error', error));
    ws.on('close', (code, reason) => newWs.emit('close', code, reason));
  }, 5000);
});

// Keep the script running
process.on('SIGINT', () => {
  logger.info('Terminating connection and exiting');
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(1000, 'Normal closure');
  }
  process.exit(0);
});

logger.info('Test connection script is running. Press Ctrl+C to exit.');
