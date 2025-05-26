require('dotenv').config();
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Direct WebSocket client to send a RemoteStopTransaction command
async function sendDirectWebSocketCommand() {
  const stationId = 'TA002';
  const transactionId = 785020; // The transaction ID we've identified
  
  console.log(`Preparing to send RemoteStopTransaction to ${stationId} with transaction ID ${transactionId}`);
  
  // Create a WebSocket connection to the server
  const ws = new WebSocket('ws://localhost:8080');
  
  ws.on('open', function open() {
    console.log('WebSocket connection established');
    
    // In OCPP, we need to include the station ID in the URL path
    // But since we're connecting to our server directly, we'll send a message
    // that identifies which station we want to communicate with
    
    // Generate a unique ID for this message
    const messageId = uuidv4();
    
    // OCPP message format: [MessageTypeId, UniqueId, Action, Payload]
    // MessageTypeId 2 = Request
    const ocppMessage = [
      2,
      messageId,
      'RemoteStopTransaction',
      {
        transactionId: parseInt(transactionId)
      }
    ];
    
    // Convert to JSON string
    const messageStr = JSON.stringify(ocppMessage);
    
    console.log(`Sending message: ${messageStr}`);
    
    // Send the message
    ws.send(messageStr);
    
    // Set a timeout to close the connection after waiting for a response
    setTimeout(() => {
      console.log('Closing connection after timeout');
      ws.close();
    }, 5000);
  });
  
  ws.on('message', function incoming(data) {
    console.log(`Received response: ${data}`);
    
    try {
      const response = JSON.parse(data);
      console.log('Parsed response:', response);
      
      // After receiving a response, close the connection
      ws.close();
    } catch (e) {
      console.error('Error parsing response:', e);
    }
  });
  
  ws.on('error', function error(err) {
    console.error('WebSocket error:', err);
  });
  
  ws.on('close', function close() {
    console.log('WebSocket connection closed');
    process.exit(0);
  });
}

// Run the function
sendDirectWebSocketCommand();
