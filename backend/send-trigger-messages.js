require('dotenv').config();
const { sequelize } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

// Script to send various trigger messages to help change station state
async function sendTriggerMessages() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    const stationId = 'TA002';
    
    console.log(`Sending TriggerMessage commands to ${stationId} to help change state...`);
    
    // First, send StatusNotification trigger to get the current status
    console.log('\n1. Requesting StatusNotification:');
    const statusResult = await ocppServer.sendOcppRequest(stationId, 'TriggerMessage', {
      requestedMessage: 'StatusNotification',
      connectorId: 1
    });
    
    console.log(`  Result: ${statusResult.success ? 'Success' : 'Failed'}`);
    if (statusResult.success) {
      console.log(`  Message ID: ${statusResult.messageId}`);
    } else {
      console.log(`  Error: ${statusResult.error}`);
    }
    
    // Wait a bit for the status notification to come in
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now try to trigger a MeterValues message
    console.log('\n2. Requesting MeterValues:');
    const meterResult = await ocppServer.sendOcppRequest(stationId, 'TriggerMessage', {
      requestedMessage: 'MeterValues',
      connectorId: 1
    });
    
    console.log(`  Result: ${meterResult.success ? 'Success' : 'Failed'}`);
    if (meterResult.success) {
      console.log(`  Message ID: ${meterResult.messageId}`);
    } else {
      console.log(`  Error: ${meterResult.error}`);
    }
    
    // Wait a bit for the meter values to come in
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to directly change availability to prepare for stopping transaction
    console.log('\n3. Sending ChangeAvailability to make connector "Operative":');
    const availabilityResult = await ocppServer.sendOcppRequest(stationId, 'ChangeAvailability', {
      connectorId: 1,
      type: 'Operative'
    });
    
    console.log(`  Result: ${availabilityResult.success ? 'Success' : 'Failed'}`);
    if (availabilityResult.success) {
      console.log(`  Message ID: ${availabilityResult.messageId}`);
    } else {
      console.log(`  Error: ${availabilityResult.error}`);
    }
    
    // Wait a bit for the availability change
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Now try sending the RemoteStopTransaction command with the transactionId from the database
    console.log('\n4. Sending RemoteStopTransaction:');
    const stopResult = await ocppServer.sendOcppRequest(stationId, 'RemoteStopTransaction', {
      transactionId: 785020
    });
    
    console.log(`  Result: ${stopResult.success ? 'Success' : 'Failed'}`);
    if (stopResult.success) {
      console.log(`  Message ID: ${stopResult.messageId}`);
    } else {
      console.log(`  Error: ${stopResult.error}`);
    }
    
    console.log('\nAll trigger messages sent. Check the server logs for responses.');
    console.log('If RemoteStopTransaction is still being rejected, try:');
    console.log('1. Using the Web Simulator interface to manually change the connector state to "Charging"');
    console.log('2. Verifying that transaction 785020 is actually active on the simulator');
    console.log('3. Starting a new transaction through the simulator and then trying to stop it');
    
    setTimeout(() => process.exit(0), 1000);
  } catch (error) {
    console.error('Error sending trigger messages:', error);
    process.exit(1);
  }
}

// Connect to the database and run the script
sequelize.authenticate()
  .then(() => {
    sendTriggerMessages();
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
    process.exit(1);
  });
