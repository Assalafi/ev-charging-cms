/**
 * OCPP Client Simulator
 * 
 * This script simulates an OCPP charging station connecting to the WebSocket server
 * It helps diagnose connection issues between the CMS and charging stations
 */
require('dotenv').config();
const WebSocket = require('ws');
const logger = require('./src/utils/logger');
const { ChargingStation } = require('./src/models');

// Configuration options
const config = {
  // Connection details
  serverUrl: 'ws://localhost:8080',
  chargePointId: 'T001',  // Default station ID
  protocol: 'ocpp1.6',    // OCPP protocol version
  
  // Behavior settings
  reconnectDelay: 5000,   // Delay between reconnection attempts in ms
  heartbeatInterval: 60000, // Interval between heartbeats in ms
  verbose: true,          // Whether to log detailed information
  
  // Test parameters
  autoSendBoot: true,     // Whether to automatically send boot notification
  autoSendHeartbeat: true // Whether to automatically send heartbeats
};

// Global variables
let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let messageCounter = 0;
let connected = false;
let bootAccepted = false;
let serverSessionId = null;

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--station' || arg === '-s') {
      if (i + 1 < args.length) {
        config.chargePointId = args[i + 1];
        i++;
      }
    } else if (arg === '--url' || arg === '-u') {
      if (i + 1 < args.length) {
        config.serverUrl = args[i + 1];
        i++;
      }
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--quiet' || arg === '-q') {
      config.verbose = false;
    }
  }
  
  logger.info(`OCPP Client Simulator for ${config.chargePointId}`);
  logger.info(`Server URL: ${config.serverUrl}`);
  logger.info(`Protocol: ${config.protocol}`);
}

/**
 * Connect to the OCPP server
 */
function connect() {
  try {
    logger.info(`Connecting to ${config.serverUrl}/ocpp/${config.chargePointId} with protocol ${config.protocol}...`);
    
    // Create WebSocket connection
    ws = new WebSocket(`${config.serverUrl}/ocpp/${config.chargePointId}`, [config.protocol]);
    
    // Set up event handlers
    ws.on('open', onOpen);
    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
    
    // Set connection timeout
    setTimeout(() => {
      if (!connected) {
        logger.error('Connection timed out');
        closeConnection();
      }
    }, 10000);
  } catch (error) {
    logger.error(`Connection error: ${error.message}`);
    scheduleReconnect();
  }
}

/**
 * Handle WebSocket open event
 */
function onOpen() {
  connected = true;
  logger.info('Connection established');
  
  // Cancel any scheduled reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Send boot notification if auto-send is enabled
  if (config.autoSendBoot) {
    sendBootNotification();
  }
  
  // Start heartbeat timer if auto-heartbeat is enabled
  if (config.autoSendHeartbeat) {
    scheduleHeartbeat();
  }
}

/**
 * Handle WebSocket message event
 */
function onMessage(data) {
  try {
    // Parse message
    const message = JSON.parse(data);
    
    if (config.verbose) {
      logger.info(`Received message: ${data}`);
    }
    
    // Check message type
    const [messageType, messageId, action, payload] = message;
    
    // Handle different message types
    switch (messageType) {
      case 3: // CALLRESULT
        handleCallResult(messageId, payload);
        break;
      case 2: // CALL
        handleCall(messageId, action, payload);
        break;
      case 4: // CALLERROR
        handleCallError(messageId, payload);
        break;
      default:
        logger.warn(`Unknown message type: ${messageType}`);
    }
  } catch (error) {
    logger.error(`Error processing message: ${error.message}`);
  }
}

/**
 * Handle WebSocket close event
 */
function onClose(code, reason) {
  connected = false;
  bootAccepted = false;
  
  logger.info(`Connection closed: ${code} - ${reason || 'No reason provided'}`);
  
  // Clear heartbeat timer
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
  
  // Schedule reconnect
  scheduleReconnect();
}

/**
 * Handle WebSocket error event
 */
function onError(error) {
  logger.error(`WebSocket error: ${error.message}`);
  
  if (connected) {
    closeConnection();
  }
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect() {
  if (!reconnectTimer) {
    logger.info(`Scheduling reconnect in ${config.reconnectDelay / 1000} seconds...`);
    
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, config.reconnectDelay);
  }
}

/**
 * Schedule a heartbeat message
 */
function scheduleHeartbeat() {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
  }
  
  heartbeatTimer = setTimeout(() => {
    if (connected) {
      sendHeartbeat();
    }
    
    // Schedule next heartbeat
    scheduleHeartbeat();
  }, config.heartbeatInterval);
}

/**
 * Close the WebSocket connection
 */
function closeConnection() {
  if (ws) {
    try {
      ws.close();
    } catch (error) {
      logger.error(`Error closing connection: ${error.message}`);
    }
    
    ws = null;
  }
  
  connected = false;
  bootAccepted = false;
}

/**
 * Generate a unique message ID
 */
function generateMessageId() {
  messageCounter++;
  return `sim-${config.chargePointId}-${Date.now()}-${messageCounter}`;
}

/**
 * Send a message to the OCPP server
 */
function sendMessage(action, payload) {
  if (!connected || !ws) {
    logger.error(`Cannot send ${action} - not connected`);
    return false;
  }
  
  try {
    const messageId = generateMessageId();
    const message = [2, messageId, action, payload]; // CALL message type
    
    const messageString = JSON.stringify(message);
    logger.info(`Sending ${action}: ${messageString}`);
    
    ws.send(messageString);
    return messageId;
  } catch (error) {
    logger.error(`Error sending ${action}: ${error.message}`);
    return false;
  }
}

/**
 * Send a BootNotification message
 */
function sendBootNotification() {
  const payload = {
    chargePointVendor: "Simulator",
    chargePointModel: "OCPP-JS",
    chargePointSerialNumber: `SIM-${config.chargePointId}`,
    firmwareVersion: "1.0.0",
    iccid: "1234567890",
    imsi: "1234567890",
    meterType: "Simulator",
    meterSerialNumber: `METER-${config.chargePointId}`
  };
  
  logger.info('Sending BootNotification...');
  return sendMessage("BootNotification", payload);
}

/**
 * Send a Heartbeat message
 */
function sendHeartbeat() {
  logger.info('Sending Heartbeat...');
  return sendMessage("Heartbeat", {});
}

/**
 * Send a StatusNotification message
 */
function sendStatusNotification(connectorId, status) {
  const payload = {
    connectorId: connectorId,
    errorCode: "NoError",
    status: status,
    timestamp: new Date().toISOString(),
    info: "Simulator status update"
  };
  
  logger.info(`Sending StatusNotification for connector ${connectorId}: ${status}`);
  return sendMessage("StatusNotification", payload);
}

/**
 * Handle CALLRESULT messages from the server
 */
function handleCallResult(messageId, payload) {
  logger.info(`Received CALLRESULT for message ${messageId}`);
  
  // Check if this is a BootNotification response
  if (messageId.includes('BootNotification')) {
    if (payload.status === 'Accepted') {
      bootAccepted = true;
      logger.info('BootNotification accepted by server');
      
      if (payload.currentTime) {
        logger.info(`Server time: ${payload.currentTime}`);
      }
      
      if (payload.interval) {
        logger.info(`Heartbeat interval: ${payload.interval} seconds`);
        config.heartbeatInterval = payload.interval * 1000;
      }
      
      // Send status notifications for all connectors
      setTimeout(() => {
        sendStatusNotification(0, "Available");
        sendStatusNotification(1, "Available");
      }, 1000);
    } else {
      logger.warn(`BootNotification rejected: ${payload.status}`);
    }
  }
  
  // Check if this is a Heartbeat response
  else if (messageId.includes('Heartbeat')) {
    if (payload.currentTime) {
      logger.info(`Server time: ${payload.currentTime}`);
    }
  }
}

/**
 * Handle CALL messages from the server
 */
function handleCall(messageId, action, payload) {
  logger.info(`Received CALL ${action} with ID ${messageId}`);
  
  // Respond to the message
  switch (action) {
    case 'Reset':
      handleReset(messageId, payload);
      break;
    case 'RemoteStartTransaction':
      handleRemoteStartTransaction(messageId, payload);
      break;
    case 'RemoteStopTransaction':
      handleRemoteStopTransaction(messageId, payload);
      break;
    default:
      // Send a generic accepted response
      sendCallResult(messageId, { status: 'Accepted' });
  }
}

/**
 * Handle CALLERROR messages from the server
 */
function handleCallError(messageId, errorDetails) {
  logger.error(`Received CALLERROR for message ${messageId}: ${JSON.stringify(errorDetails)}`);
}

/**
 * Send a CALLRESULT message to the server
 */
function sendCallResult(messageId, payload) {
  if (!connected || !ws) {
    logger.error('Cannot send CALLRESULT - not connected');
    return false;
  }
  
  try {
    const message = [3, messageId, payload]; // CALLRESULT message type
    
    const messageString = JSON.stringify(message);
    logger.info(`Sending CALLRESULT: ${messageString}`);
    
    ws.send(messageString);
    return true;
  } catch (error) {
    logger.error(`Error sending CALLRESULT: ${error.message}`);
    return false;
  }
}

/**
 * Handle Reset request from the server
 */
function handleReset(messageId, payload) {
  logger.info(`Handling Reset: ${JSON.stringify(payload)}`);
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Simulate reset by reconnecting
  setTimeout(() => {
    logger.info('Simulating reset by reconnecting...');
    closeConnection();
    setTimeout(connect, 1000);
  }, 2000);
}

/**
 * Handle RemoteStartTransaction request from the server
 */
function handleRemoteStartTransaction(messageId, payload) {
  logger.info(`Handling RemoteStartTransaction: ${JSON.stringify(payload)}`);
  
  // Extract information from payload
  const { connectorId, idTag } = payload;
  
  if (!connectorId || !idTag) {
    logger.warn('Missing required fields in RemoteStartTransaction request');
    sendCallResult(messageId, { status: 'Rejected' });
    return;
  }
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Simulate starting a transaction
  setTimeout(() => {
    // Change connector status to Preparing
    sendStatusNotification(connectorId, "Preparing");
    
    // Then change to Charging and start transaction
    setTimeout(() => {
      // Send StatusNotification
      sendStatusNotification(connectorId, "Charging");
      
      // Send StartTransaction
      const transactionId = Math.floor(Math.random() * 1000000) + 1;
      
      const startPayload = {
        connectorId: connectorId,
        idTag: idTag,
        meterStart: 0,
        timestamp: new Date().toISOString(),
        transactionId: transactionId
      };
      
      sendMessage("StartTransaction", startPayload);
      
      logger.info(`Started transaction ${transactionId} for connector ${connectorId} with idTag ${idTag}`);
    }, 2000);
  }, 1000);
}

/**
 * Handle RemoteStopTransaction request from the server
 */
function handleRemoteStopTransaction(messageId, payload) {
  logger.info(`Handling RemoteStopTransaction: ${JSON.stringify(payload)}`);
  
  // Extract information from payload
  const { transactionId } = payload;
  
  if (!transactionId) {
    logger.warn('Missing transactionId in RemoteStopTransaction request');
    sendCallResult(messageId, { status: 'Rejected' });
    return;
  }
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Simulate stopping a transaction
  setTimeout(() => {
    // Send StopTransaction
    const stopPayload = {
      meterStop: 1000,
      timestamp: new Date().toISOString(),
      transactionId: transactionId,
      reason: "Remote"
    };
    
    sendMessage("StopTransaction", stopPayload);
    
    // Change connector status back to Available
    setTimeout(() => {
      sendStatusNotification(1, "Available");
      logger.info(`Stopped transaction ${transactionId} and set connector status to Available`);
    }, 1000);
  }, 1000);
}

/**
 * Update station status in the database
 */
async function updateStationStatus(status) {
  try {
    const station = await ChargingStation.findOne({
      where: { chargePointId: config.chargePointId }
    });
    
    if (station) {
      await station.update({ 
        status: status,
        lastConnection: new Date()
      });
      
      logger.info(`Updated station ${config.chargePointId} status to ${status} in database`);
    } else {
      logger.warn(`Station ${config.chargePointId} not found in database`);
    }
  } catch (error) {
    logger.error(`Error updating station status: ${error.message}`);
  }
}

/**
 * Display help information
 */
function showHelp() {
  console.log('\nOCPP Client Simulator Commands:');
  console.log('-------------------------------');
  console.log('boot              - Send BootNotification');
  console.log('status <id> <st>  - Send StatusNotification for connector <id> with status <st>');
  console.log('heartbeat         - Send Heartbeat');
  console.log('reconnect         - Close and reopen the connection');
  console.log('quit              - Exit the simulator');
  console.log('help              - Show this help');
  console.log('\nExample: status 1 Available\n');
}

/**
 * Set up command-line interface
 */
function setupCLI() {
  const readline = require('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.on('line', (input) => {
    const args = input.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    
    switch (command) {
      case 'boot':
        sendBootNotification();
        break;
      case 'status':
        if (args.length >= 3) {
          const connectorId = parseInt(args[1], 10);
          const status = args[2];
          sendStatusNotification(connectorId, status);
        } else {
          console.log('Usage: status <connectorId> <status>');
        }
        break;
      case 'heartbeat':
        sendHeartbeat();
        break;
      case 'reconnect':
        logger.info('Manually reconnecting...');
        closeConnection();
        setTimeout(connect, 1000);
        break;
      case 'quit':
      case 'exit':
        logger.info('Exiting...');
        closeConnection();
        process.exit(0);
        break;
      case 'help':
        showHelp();
        break;
      default:
        console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
    }
  });
  
  rl.on('close', () => {
    logger.info('CLI closed');
    closeConnection();
    process.exit(0);
  });
  
  // Display help on startup
  showHelp();
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  parseArgs();
  
  // Connect to the OCPP server
  connect();
  
  // Set up interactive CLI
  setupCLI();
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
