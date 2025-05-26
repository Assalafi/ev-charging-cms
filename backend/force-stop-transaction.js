require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { sequelize, Transaction, OcppMessage } = require('./src/models');
const logger = require('./src/utils/logger');

// Function to send a RemoteStopTransaction directly via WebSocket
async function sendForceStopTransaction() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    const stationId = 'TA002';
    
    // Find the most recent transaction with InProgress status
    const activeTransaction = await Transaction.findOne({
      where: {
        chargePointId: stationId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    if (!activeTransaction) {
      console.error('No active transaction found for station', stationId);
      process.exit(1);
    }
    
    const transactionId = activeTransaction.transactionId;
    console.log(`Found active transaction ID: ${transactionId}`);
    
    // Create a unique message ID for this request
    const messageId = uuidv4();
    
    // Create the OCPP message in proper format
    const ocppMessage = [
      2, // 2 = Call (request) as per OCPP-J
      messageId,
      "RemoteStopTransaction",
      {
        transactionId: parseInt(transactionId)
      }
    ];
    
    // Convert to JSON string for transmission
    const messageStr = JSON.stringify(ocppMessage);
    
    // Log this outgoing message to the database
    await OcppMessage.create({
      chargePointId: stationId,
      messageId: messageId,
      message_type: 'RemoteStopTransaction',
      status: 'Sent',
      payload: JSON.stringify({ transactionId: parseInt(transactionId) }),
      direction: 'Outbound',
      timestamp: new Date()
    });
    
    console.log(`Logged outgoing message to database with ID: ${messageId}`);
    
    // Use your ws-test.html as reference for correct WebSocket connection
    console.log(`Opening WebSocket connection to ws://localhost:8080/ocpp/${stationId}`);
    const ws = new WebSocket(`ws://localhost:8080/ocpp/${stationId}`);
    
    ws.on('open', () => {
      console.log('WebSocket connection opened.');
      console.log(`Sending RemoteStopTransaction with transaction ID: ${transactionId}`);
      console.log(`Message: ${messageStr}`);
      
      // Send the OCPP message
      ws.send(messageStr);
      
      console.log('Message sent, waiting for response...');
    });
    
    ws.on('message', (data) => {
      console.log(`Received response: ${data.toString()}`);
      
      try {
        const response = JSON.parse(data.toString());
        console.log('Parsed response:', JSON.stringify(response, null, 2));
        
        // Log the response to the database
        OcppMessage.create({
          chargePointId: stationId,
          messageId: messageId,
          message_type: 'RemoteStopTransaction',
          status: response[2].status === 'Accepted' ? 'Received' : 'Failed',
          payload: JSON.stringify(response[2]),
          direction: 'Inbound',
          timestamp: new Date()
        }).then(() => {
          console.log('Response logged to database');
          
          // If the response status is "Accepted", update the transaction status
          if (response[2].status === 'Accepted') {
            console.log('Transaction stop command accepted!');
            console.log('Updating transaction status to Completed...');
            
            // Update the transaction status to Completed
            activeTransaction.update({
              status: 'Completed',
              stopTime: new Date()
            }).then(() => {
              console.log('Transaction status updated to Completed');
              
              // Close the WebSocket connection and exit
              ws.close();
              process.exit(0);
            }).catch(err => {
              console.error('Error updating transaction:', err);
              ws.close();
              process.exit(1);
            });
          } else {
            console.log(`Transaction stop command rejected with status: ${response[2].status}`);
            console.log('Possible reasons:');
            console.log('1. The connector status is not "Charging" (currently shows as "Preparing")');
            console.log('2. The transaction ID from the database does not match the transaction ID on the station');
            console.log('3. The Web Simulator has specific requirements for stopping transactions');
            
            console.log('\nTry the following steps:');
            console.log('1. In the Web Simulator, check if the connector status can be changed from "Preparing" to "Charging"');
            console.log('2. Try starting a new transaction from the simulator, then try stopping it again');
            console.log('3. Check the simulator documentation for specific requirements');
            
            // Close the WebSocket connection and exit
            ws.close();
            process.exit(1);
          }
        }).catch(err => {
          console.error('Error logging response:', err);
          ws.close();
          process.exit(1);
        });
      } catch (e) {
        console.error('Error parsing response:', e);
        ws.close();
        process.exit(1);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      process.exit(1);
    });
    
    // Set a timeout to close the connection if no response is received
    setTimeout(() => {
      console.log('Timeout waiting for response');
      ws.close();
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the function
sendForceStopTransaction();
