const WebSocket = require('ws');

// Configuration
const stationId = 'TA002';
const serverUrl = `ws://127.0.0.1:8080/ocpp/${stationId}`;
const protocol = 'ocpp1.6';

// Create WebSocket connection
console.log(`Connecting to ${serverUrl} with protocol ${protocol}`);
const socket = new WebSocket(serverUrl, protocol);

// Connection opened
socket.on('open', () => {
  console.log('Connection established successfully');
  
  // Generate a unique transaction ID
  const transactionId = Math.floor(Math.random() * 1000000) + 1;
  
  // Send StartTransaction message
  const startTransactionMessage = [
    2, // Call
    `test-${Date.now()}`, // Unique ID
    "StartTransaction", 
    {
      connectorId: 1,
      idTag: "TEST_TAG_TA002",
      meterStart: 0,
      timestamp: new Date().toISOString()
    }
  ];
  
  socket.send(JSON.stringify(startTransactionMessage));
  console.log(`Sent StartTransaction: ${JSON.stringify(startTransactionMessage, null, 2)}`);
  
  // Wait for response
  setTimeout(() => {
    console.log("Test complete, closing connection...");
    socket.close(1000, "Test complete");
  }, 3000);
});

// Listen for messages
socket.on('message', (data) => {
  console.log(`Received message: ${data}`);
  const message = JSON.parse(data);
  
  // Check if this is a response to our StartTransaction
  if (message[0] === 3) {
    console.log('StartTransaction response:', JSON.stringify(message[2], null, 2));
  }
});

// Handle errors
socket.on('error', (error) => {
  console.error(`WebSocket error: ${error.message}`);
});

// Connection closed
socket.on('close', (code, reason) => {
  console.log(`Connection closed with code ${code}, reason: ${reason}`);
});
