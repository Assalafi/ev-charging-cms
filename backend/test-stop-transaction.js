require('dotenv').config();
const { ChargingStation, Transaction } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

// Test script to send a RemoteStopTransaction with automatic transaction ID detection
async function testStopTransaction() {
  try {
    // You can replace this with the specific station ID you want to test
    const stationId = 'T001';
    
    console.log(`Attempting to stop transaction for station: ${stationId}`);
    
    // Step 1: Check if the charging station exists
    const station = await ChargingStation.findOne({
      where: {
        chargePointId: stationId
      }
    });
    
    if (!station) {
      console.error(`Charging station ${stationId} not found`);
      process.exit(1);
    }
    
    console.log(`Found charging station: ${station.name}`);
    
    // Step 2: Check if the station has a current transaction
    let transactionId = null;
    
    if (station.currentTransaction) {
      transactionId = station.currentTransaction;
      console.log(`Using current transaction ID ${transactionId} from station record`);
    } else {
      // Try to find the latest active transaction for this station
      const activeTransaction = await Transaction.findOne({
        where: {
          chargePointId: stationId,
          status: 'InProgress'
        },
        order: [['startTime', 'DESC']]
      });
      
      if (activeTransaction) {
        transactionId = activeTransaction.transactionId;
        console.log(`Using latest active transaction ID ${transactionId} from database`);
      }
    }
    
    if (!transactionId) {
      console.error('No active transaction found for this charging station');
      
      // Create a transaction ID for testing purposes (only use this for testing)
      transactionId = Math.floor(Math.random() * 100000) + 1;
      console.log(`WARNING: Using a random transaction ID ${transactionId} for testing purposes`);
    }
    
    // Step 3: Check if the station is connected
    if (!ocppServer.isConnected(stationId)) {
      console.error(`Charging station ${stationId} is not connected`);
      process.exit(1);
    }
    
    console.log(`Station ${stationId} is connected, sending RemoteStopTransaction command...`);
    
    // Step 4: Send the RemoteStopTransaction command
    const result = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', {
      transactionId: parseInt(transactionId)
    });
    
    if (result.success) {
      console.log(`Successfully sent RemoteStopTransaction command with message ID: ${result.messageId}`);
    } else {
      console.error(`Failed to send RemoteStopTransaction command: ${result.error}`);
    }
    
    // Wait a moment for the response to be logged
    setTimeout(() => {
      console.log('Done. Check the server logs for the response from the charging station.');
      process.exit(0);
    }, 2000);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Connect to the database and run the test
const { sequelize } = require('./src/models');
sequelize.authenticate()
  .then(() => {
    console.log('Database connection established successfully.');
    testStopTransaction();
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
