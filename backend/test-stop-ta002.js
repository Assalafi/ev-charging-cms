require('dotenv').config();
const { sequelize } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

// Test script to send a RemoteStopTransaction command to TA002
async function testStopTA002Transaction() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    const stationId = 'TA002';
    const transactionId = 785020; // Using the transaction ID we identified
    
    console.log(`Attempting to stop transaction ${transactionId} for station: ${stationId}`);
    
    // Check if the station is connected
    if (!ocppServer.isConnected(stationId)) {
      console.error(`Charging station ${stationId} is not connected`);
      process.exit(1);
    }
    
    console.log(`Station ${stationId} is connected, sending RemoteStopTransaction command...`);
    
    // Send the RemoteStopTransaction command
    const result = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', {
      transactionId: parseInt(transactionId)
    });
    
    if (result.success) {
      console.log(`Successfully sent RemoteStopTransaction command with message ID: ${result.messageId}`);
      console.log('Check the server logs to see the response from the charging station.');
    } else {
      console.error(`Failed to send RemoteStopTransaction command: ${result.error}`);
    }
    
    setTimeout(() => process.exit(0), 2000);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Connect to the database and run the test
sequelize.authenticate()
  .then(() => {
    testStopTA002Transaction();
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
