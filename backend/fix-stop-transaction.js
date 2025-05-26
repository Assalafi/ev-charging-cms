require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Transaction } = require('./src/models');

// Function to send a message directly via WebSocket
async function sendWebSocketMessage(action, payload) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8080/ocpp/TA002');
    
    ws.on('open', () => {
      console.log('WebSocket connection opened');
      
      // Create OCPP message
      const messageId = uuidv4();
      const message = [2, messageId, action, payload];
      const messageStr = JSON.stringify(message);
      
      console.log(`Sending ${action} message: ${messageStr}`);
      ws.send(messageStr);
      
      // Set a timeout to close the connection if no response
      const timeout = setTimeout(() => {
        console.log('Response timeout');
        ws.close();
        resolve({ success: false, error: 'Timeout waiting for response' });
      }, 10000);
      
      // Listen for the response
      ws.on('message', (data) => {
        clearTimeout(timeout);
        console.log(`Received response: ${data}`);
        
        try {
          const response = JSON.parse(data.toString());
          ws.close();
          resolve({ success: true, response });
        } catch (e) {
          console.error('Error parsing response:', e);
          ws.close();
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      reject(error);
    });
  });
}

async function findActiveTransaction() {
  try {
    // Connect to the database
    await sequelize.authenticate();
    
    // Find the most recent active transaction for TA002
    const activeTransaction = await Transaction.findOne({
      where: {
        chargePointId: 'TA002',
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    if (activeTransaction) {
      return activeTransaction.transactionId;
    } else {
      console.log('No active transaction found in database');
      return null;
    }
  } catch (error) {
    console.error('Database error:', error);
    return null;
  }
}

async function main() {
  try {
    console.log('Starting fix-stop-transaction script...');
    
    // Step 1: Find active transaction ID
    const transactionId = await findActiveTransaction();
    if (!transactionId) {
      console.log('Cannot proceed without an active transaction ID');
      process.exit(1);
    }
    
    console.log(`Found active transaction ID: ${transactionId}`);
    
    // Step 2: First try to get status update
    console.log('\nStep 1: Requesting status notification...');
    const statusResult = await sendWebSocketMessage('TriggerMessage', {
      requestedMessage: 'StatusNotification',
      connectorId: 1
    });
    
    // Give some time for the status notification to come in
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Step 3: Try to send RemoteStopTransaction
    console.log('\nStep 2: Sending RemoteStopTransaction...');
    const stopResult = await sendWebSocketMessage('RemoteStopTransaction', {
      transactionId: parseInt(transactionId)
    });
    
    console.log('\nScript completed. Check the responses above to see if the stop transaction was successful.');
    console.log('If the stop transaction was rejected, try these steps:');
    console.log('1. In the Web Simulator, start a new charging session');
    console.log('2. Ensure the connector status changes to "Charging"');
    console.log('3. Run this script again to stop the new transaction');
    
    process.exit(0);
  } catch (error) {
    console.error('Error in main function:', error);
    process.exit(1);
  }
}

// Run the main function
main();
