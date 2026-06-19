const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Configuration
const stationId = 'TEST001';
const serverUrl = `ws://127.0.0.1:8080/ocpp/${stationId}`;
const protocol = 'ocpp1.6';

console.log(`Connecting to ${serverUrl} with protocol ${protocol}`);

// Create WebSocket connection
const ws = new WebSocket(serverUrl, protocol);

// Connection opened
ws.on('open', () => {
    console.log('Connection established successfully');
    
    // Send a BootNotification message after a short delay
    setTimeout(sendBootNotification, 1000);
});

// Listen for messages
ws.on('message', (data) => {
    try {
        const message = JSON.parse(data);
        console.log('Received message:', JSON.stringify(message, null, 2));
        
        // If we receive a response to our BootNotification, let's send a heartbeat
        if (message[0] === 3) { // CallResult
            setTimeout(sendHeartbeat, 2000);
        }
    } catch (e) {
        console.log('Received non-JSON message:', data);
    }
});

// Connection error
ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
});

// Connection closed
ws.on('close', (code, reason) => {
    console.log(`Connection closed with code ${code}${reason ? `, reason: ${reason}` : ''}`);
});

// Send a boot notification
function sendBootNotification() {
    const uniqueId = uuidv4();
    const bootMessage = [
        2, // Call
        uniqueId,
        "BootNotification",
        {
            chargePointVendor: "Test Vendor",
            chargePointModel: "Test Model",
            chargePointSerialNumber: "SN12345",
            firmwareVersion: "1.0.0"
        }
    ];
    
    console.log('Sending BootNotification:', JSON.stringify(bootMessage, null, 2));
    ws.send(JSON.stringify(bootMessage));
}

// Send a heartbeat
function sendHeartbeat() {
    const uniqueId = uuidv4();
    const heartbeatMessage = [
        2, // Call
        uniqueId,
        "Heartbeat",
        {}
    ];
    
    console.log('Sending Heartbeat:', JSON.stringify(heartbeatMessage, null, 2));
    ws.send(JSON.stringify(heartbeatMessage));
    
    // Close the connection after a short delay
    setTimeout(() => {
        console.log('Test complete, closing connection...');
        ws.close(1000, 'Test complete');
    }, 2000);
}
