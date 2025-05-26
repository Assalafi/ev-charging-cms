/**
 * OCPP Station Simulator and Diagnostic Tool
 * 
 * This script simulates a charging station connecting to the OCPP server
 * and tests the transaction management functions.
 */
require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const logger = require('./src/utils/logger');
const { ChargingStation, Connector, Transaction, OcppMessage } = require('./src/models');

// Configuration
const config = {
  serverUrl: 'ws://localhost:8080',
  chargePointId: 'T001',
  protocol: 'ocpp1.6',
  connectorId: 1,
  idTag: 'TEST_TAG'
};

// Parse command line arguments
if (process.argv.length > 2) {
  config.chargePointId = process.argv[2];
}

// Global state
let ws = null;
let connected = false;
let bootNotificationAccepted = false;
let currentTransactionId = null;

/**
 * Create a websocket connection to the OCPP server
 */
function connect() {
  logger.info(`Connecting to ${config.serverUrl}/ocpp/${config.chargePointId}...`);
  
  try {
    // Create WebSocket connection
    ws = new WebSocket(`${config.serverUrl}/ocpp/${config.chargePointId}`, [config.protocol]);
    
    // Set up event handlers
    ws.on('open', onConnectionOpen);
    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.on('close', onClose);
    
    // Set connection timeout
    setTimeout(() => {
      if (!connected) {
        logger.error('Connection timeout');
        process.exit(1);
      }
    }, 10000);
  } catch (error) {
    logger.error(`Connection error: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Handle connection open event
 */
function onConnectionOpen() {
  connected = true;
  logger.info('WebSocket connection established successfully');
  
  // Send boot notification
  sendBootNotification();
}

/**
 * Handle message received event
 */
function onMessage(data) {
  logger.info(`Received message: ${data}`);
  
  try {
    const message = JSON.parse(data);
    
    // Extract message components based on message type
    const messageType = message[0];
    const messageId = message[1];
    
    // Handle message based on type
    switch(messageType) {
      case 2: // CALL from server
        const action = message[2];
        const callPayload = message[3];
        handleServerCall(messageId, action, callPayload);
        break;
      case 3: // CALLRESULT from server
        const resultPayload = message[2];
        handleCallResult(messageId, resultPayload);
        break;
      case 4: // CALLERROR from server
        const errorCode = message[2];
        const errorDescription = message[3];
        const errorDetails = message[4];
        handleCallError(messageId, { errorCode, errorDescription, errorDetails });
        break;
      default:
        logger.warn(`Unsupported message type: ${messageType}`);
    }
  } catch (error) {
    logger.error(`Error processing message: ${error.message}`);
  }
}

/**
 * Handle server-initiated calls
 */
function handleServerCall(messageId, action, payload) {
  logger.info(`Received ${action} request from server`);
  
  switch(action) {
    case 'RemoteStartTransaction':
      handleRemoteStartTransaction(messageId, payload);
      break;
    case 'RemoteStopTransaction':
      handleRemoteStopTransaction(messageId, payload);
      break;
    case 'Reset':
      handleReset(messageId, payload);
      break;
    default:
      // Default response for other actions
      sendCallResult(messageId, { status: 'Accepted' });
  }
}

/**
 * Handle RemoteStartTransaction from server
 */
function handleRemoteStartTransaction(messageId, payload) {
  const { connectorId, idTag } = payload;
  
  logger.info(`RemoteStartTransaction request: connector=${connectorId}, idTag=${idTag}`);
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Wait a bit and then simulate starting transaction
  setTimeout(() => {
    // Send status notification: Preparing
    sendStatusNotification(connectorId, 'Preparing');
    
    // Then start the transaction
    setTimeout(() => {
      startTransaction(connectorId, idTag);
    }, 2000);
  }, 1000);
}

/**
 * Handle RemoteStopTransaction from server
 */
function handleRemoteStopTransaction(messageId, payload) {
  const { transactionId } = payload;
  
  logger.info(`RemoteStopTransaction request: transactionId=${transactionId}`);
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Wait a bit and then stop the transaction
  setTimeout(() => {
    stopTransaction(transactionId);
  }, 1000);
}

/**
 * Handle Reset from server
 */
function handleReset(messageId, payload) {
  // OCPP 1.6 standard uses lowercase 'type' field for Reset
  // Extract the type field from the payload
  let resetType = 'Soft'; // Default to Soft reset
  
  if (payload) {
    if (payload.type !== undefined) {
      // Standard OCPP 1.6 format (lowercase 'type')
      resetType = payload.type;
      logger.debug(`Found standard OCPP 1.6 lowercase type: ${resetType}`);
    } else if (payload.Type !== undefined) {
      // Alternative format (PascalCase 'Type')
      resetType = payload.Type;
      logger.debug(`Found PascalCase Type: ${resetType}`);
    }
  }
  
  logger.debug(`Reset request received: ${resetType}`);
  
  // Send positive response
  sendCallResult(messageId, { status: 'Accepted' });
  
  // Simulate reset behavior
  setTimeout(() => {
    logger.info(`Reset chargePoint: ${config.chargePointId}`);
    
    // For a Hard reset, we would shut down and restart
    // For a Soft reset, we would just restart the software
    
    // Re-send boot notification to simulate restart
    sendBootNotification();
    
    // Update connector statuses
    sendStatusNotification(1, 'Available');
  }, 5000); // Simulate 5 second reset time
}

/**
 * Handle call result
 */
function handleCallResult(messageId, payload) {
  logger.info(`Received call result for ${messageId}: ${JSON.stringify(payload)}`);
  
  // Handle BootNotification response
  if (messageId.includes('boot')) {
    if (payload && payload.status === 'Accepted') {
      bootNotificationAccepted = true;
      logger.info('BootNotification accepted by server');
      
      // Send status notifications for connectors
      setTimeout(() => {
        sendStatusNotification(0, 'Available');
        sendStatusNotification(1, 'Available');
      }, 1000);
    } else if (payload) {
      logger.warn(`BootNotification rejected: ${payload.status}`);
    } else {
      logger.warn('Received empty or invalid payload for BootNotification response');
    }
  }
  
  // Handle StartTransaction response
  else if (messageId.includes('start')) {
    if (payload.idTagInfo && payload.idTagInfo.status === 'Accepted') {
      currentTransactionId = payload.transactionId;
      logger.info(`Transaction started with ID: ${currentTransactionId}`);
      
      // Send status notification: Charging
      sendStatusNotification(config.connectorId, 'Charging');
    } else {
      logger.warn(`StartTransaction rejected: ${JSON.stringify(payload)}`);
    }
  }
  
  // Handle StopTransaction response
  else if (messageId.includes('stop')) {
    logger.info(`Transaction stopped`);
    currentTransactionId = null;
    
    // Send status notification: Available
    sendStatusNotification(config.connectorId, 'Available');
  }
}

/**
 * Handle call error
 */
function handleCallError(messageId, errorDetails) {
  logger.error(`Received error for ${messageId}: ${JSON.stringify(errorDetails)}`);
}

/**
 * Handle WebSocket error
 */
function onError(error) {
  logger.error(`WebSocket error: ${error.message}`);
}

/**
 * Handle WebSocket close
 */
function onClose(code, reason) {
  connected = false;
  logger.info(`WebSocket connection closed: ${code} - ${reason || 'No reason'}`);
  process.exit(0);
}

/**
 * Generate unique message ID
 */
function generateMessageId(prefix) {
  return `${prefix}-${uuidv4().slice(0, 8)}`;
}

/**
 * Send OCPP call message
 */
function sendCall(action, payload) {
  if (!connected) {
    logger.error(`Cannot send ${action} - not connected`);
    return null;
  }
  
  try {
    const messageId = generateMessageId(action.toLowerCase());
    const message = [2, messageId, action, payload]; // CALL message type
    
    logger.info(`Sending ${action}: ${JSON.stringify(message)}`);
    ws.send(JSON.stringify(message));
    
    return messageId;
  } catch (error) {
    logger.error(`Error sending ${action}: ${error.message}`);
    return null;
  }
}

/**
 * Send OCPP call result message
 */
function sendCallResult(messageId, payload) {
  if (!connected) {
    logger.error('Cannot send call result - not connected');
    return false;
  }
  
  try {
    const message = [3, messageId, payload]; // CALLRESULT message type
    
    logger.info(`Sending call result: ${JSON.stringify(message)}`);
    ws.send(JSON.stringify(message));
    
    return true;
  } catch (error) {
    logger.error(`Error sending call result: ${error.message}`);
    return false;
  }
}

/**
 * Send BootNotification message
 */
function sendBootNotification() {
  const payload = {
    chargePointVendor: 'Simulator',
    chargePointModel: 'OCPP-Test',
    chargePointSerialNumber: `SIM-${config.chargePointId}`,
    firmwareVersion: '1.0.0'
  };
  
  logger.info('Sending BootNotification...');
  return sendCall('BootNotification', payload);
}

/**
 * Send StatusNotification message
 */
function sendStatusNotification(connectorId, status) {
  const payload = {
    connectorId: connectorId,
    errorCode: 'NoError',
    status: status,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Sending StatusNotification for connector ${connectorId}: ${status}`);
  return sendCall('StatusNotification', payload);
}

// Track simulated meter values globally
let simulatedEnergy = 0;
let meterValueInterval = null;

/**
 * Start a transaction
 */
function startTransaction(connectorId, idTag) {
  // Start with a random meter value between 10000-20000 Wh
  simulatedEnergy = 10000 + Math.floor(Math.random() * 10000);
  
  const payload = {
    connectorId: connectorId,
    idTag: idTag,
    meterStart: simulatedEnergy,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Sending StartTransaction for connector ${connectorId} with idTag ${idTag}, meterStart: ${simulatedEnergy}`);
  
  // First send StartTransaction message
  const messageId = sendCall('StartTransaction', payload);
  
  // After StartTransaction, update status to Charging
  setTimeout(() => {
    logger.info(`Updating connector ${connectorId} status to Charging`);
    sendStatusNotification(connectorId, 'Charging');
    
    // Start sending meter values periodically
    startMeterValueUpdates(connectorId);
  }, 1000);
  
  return messageId;
}

/**
 * Send periodic meter values during charging
 */
function startMeterValueUpdates(connectorId) {
  // Clear any existing interval
  if (meterValueInterval) {
    clearInterval(meterValueInterval);
  }
  
  meterValueInterval = setInterval(() => {
    if (!currentTransactionId || !connected) {
      clearInterval(meterValueInterval);
      meterValueInterval = null;
      return;
    }
    
    // Increase energy by a random amount (50-150 Wh)
    simulatedEnergy += 50 + Math.floor(Math.random() * 100);
    
    // Calculate power (in Watts) - between 7000-11000 W
    const simulatedPower = 7000 + Math.floor(Math.random() * 4000);
    
    // Send meter values
    sendMeterValues(connectorId, currentTransactionId, simulatedEnergy, simulatedPower);
  }, 5000); // Every 5 seconds
}

/**
 * Send meter values during a transaction
 */
function sendMeterValues(connectorId, transactionId, energy, power) {
  const timestamp = new Date().toISOString();
  
  const payload = {
    connectorId: connectorId,
    transactionId: transactionId,
    meterValue: [
      {
        timestamp: timestamp,
        sampledValue: [
          {
            value: energy.toString(),
            context: "Sample.Periodic",
            format: "Raw",
            measurand: "Energy.Active.Import.Register",
            unit: "Wh"
          },
          {
            value: power.toString(),
            context: "Sample.Periodic",
            format: "Raw",
            measurand: "Power.Active.Import",
            unit: "W"
          }
        ]
      }
    ]
  };
  
  logger.debug(`Sending MeterValues for transaction ${transactionId}: energy=${energy}Wh, power=${power}W`);
  return sendCall('MeterValues', payload);
}

/**
 * Stop a transaction
 */
function stopTransaction(transactionId) {
  // Clear meter value updates
  if (meterValueInterval) {
    clearInterval(meterValueInterval);
    meterValueInterval = null;
  }
  
  const payload = {
    transactionId: transactionId,
    meterStop: simulatedEnergy,
    timestamp: new Date().toISOString()
  };
  
  logger.info(`Sending StopTransaction for transaction ${transactionId}, meterStop: ${simulatedEnergy}`);
  return sendCall('StopTransaction', payload);
}

/**
 * Test the transaction workflow
 */
async function testTransactionWorkflow() {
  // Wait for boot notification to be accepted
  let attempts = 0;
  while (!bootNotificationAccepted && attempts < 10) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (!bootNotificationAccepted) {
    logger.error('Boot notification not accepted, cannot test transactions');
    return;
  }
  
  logger.info('Starting transaction workflow test...');
  
  // Start transaction
  const transactionId = startTransaction(config.connectorId, config.idTag);
  logger.info(`Transaction initiated with ID: ${transactionId}`);
  
  // Wait a bit and then stop the transaction
  setTimeout(() => {
    if (currentTransactionId) {
      logger.info(`Stopping transaction ${currentTransactionId}`);
      stopTransaction(currentTransactionId);
    } else {
      logger.warn('No active transaction to stop');
    }
  }, 10000);
}

/**
 * Check database for station and connectors
 */
async function checkDatabase() {
  try {
    // Check if station exists in database
    const station = await ChargingStation.findOne({
      where: { chargePointId: config.chargePointId }
    });
    
    if (station) {
      logger.info(`Station ${config.chargePointId} found in database`);
      logger.info(`Station status: ${station.status}`);
      logger.info(`Last connection: ${station.lastConnection}`);
      
      // Update station status
      await station.update({
        status: 'Available',
        lastConnection: new Date()
      });
      
      logger.info('Station status updated to Available');
    } else {
      logger.warn(`Station ${config.chargePointId} not found in database`);
      
      // Create station
      const newStation = await ChargingStation.create({
        chargePointId: config.chargePointId,
        vendor: 'Simulator',
        model: 'OCPP-Test',
        serialNumber: `SIM-${config.chargePointId}`,
        firmwareVersion: '1.0.0',
        status: 'Available',
        lastConnection: new Date()
      });
      
      logger.info(`Created station ${config.chargePointId} in database`);
    }
    
    // Check connectors for this station
    const connectors = await Connector.findAll({
      where: { chargePointId: config.chargePointId }
    });
    
    if (connectors.length > 0) {
      logger.info(`Found ${connectors.length} connectors for station ${config.chargePointId}`);
      
      // Update connector status
      for (const connector of connectors) {
        await connector.update({
          status: 'Available',
          lastUpdated: new Date()
        });
      }
      
      logger.info('Connector statuses updated to Available');
    } else {
      logger.warn(`No connectors found for station ${config.chargePointId}`);
      
      // Create connectors
      await Connector.create({
        chargePointId: config.chargePointId,
        connectorId: 0,
        status: 'Available',
        lastUpdated: new Date()
      });
      
      await Connector.create({
        chargePointId: config.chargePointId,
        connectorId: 1,
        status: 'Available',
        lastUpdated: new Date()
      });
      
      logger.info(`Created connectors for station ${config.chargePointId}`);
    }
    
    // Check for incomplete transactions
    const activeTransactions = await Transaction.findAll({
      where: { 
        chargePointId: config.chargePointId,
        status: 'InProgress'
      }
    });
    
    if (activeTransactions.length > 0) {
      logger.warn(`Found ${activeTransactions.length} active transactions for station ${config.chargePointId}`);
      
      // Complete incomplete transactions
      for (const tx of activeTransactions) {
        await tx.update({
          status: 'Completed',
          stopTime: new Date()
        });
      }
      
      logger.info('Completed all active transactions');
    } else {
      logger.info(`No active transactions found for station ${config.chargePointId}`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Database check error: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  logger.info('====== OCPP Station Simulator and Diagnostic Tool ======');
  logger.info(`Target station: ${config.chargePointId}`);
  logger.info(`Server URL: ${config.serverUrl}`);
  logger.info(`Protocol: ${config.protocol}`);
  
  // Check database first
  await checkDatabase();
  
  // Connect to OCPP server
  connect();
  
  // Wait a bit and then test the transaction workflow
  setTimeout(testTransactionWorkflow, 5000);
}

// Run the main function
main().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});
