require('dotenv').config();
const { sequelize, OcppMessage, Transaction } = require('./src/models');
const logger = require('./src/utils/logger');

// Script to analyze recent OCPP messages for a station
async function analyzeStationMessages() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database successfully.');
    
    const stationId = 'TA002';
    console.log(`Analyzing recent OCPP messages for station ${stationId}...`);
    
    // Find StartTransaction and StopTransaction messages
    const startTransactionMessages = await OcppMessage.findAll({
      where: {
        chargePointId: stationId,
        message_type: 'StartTransaction',
        direction: 'Inbound'
      },
      order: [['timestamp', 'DESC']],
      limit: 5
    });
    
    console.log(`\nFound ${startTransactionMessages.length} StartTransaction messages:`);
    if (startTransactionMessages.length > 0) {
      for (const msg of startTransactionMessages) {
        console.log(`Message ID: ${msg.messageId}`);
        console.log(`Timestamp: ${msg.timestamp}`);
        
        try {
          const payload = JSON.parse(msg.payload);
          console.log(`Transaction ID: ${payload.transactionId || 'N/A'}`);
          console.log(`Connector ID: ${payload.connectorId || 'N/A'}`);
          console.log(`ID Tag: ${payload.idTag || 'N/A'}`);
        } catch (e) {
          console.log(`Payload (could not parse): ${msg.payload}`);
        }
        console.log('-----------------------------------');
      }
    } else {
      console.log('No StartTransaction messages found.');
    }
    
    // Check for active transactions in the database
    const activeTransactions = await Transaction.findAll({
      where: {
        chargePointId: stationId,
        status: 'InProgress'
      },
      order: [['startTime', 'DESC']]
    });
    
    console.log(`\nActive transactions in database: ${activeTransactions.length}`);
    if (activeTransactions.length > 0) {
      for (const tx of activeTransactions) {
        console.log(`Transaction ID: ${tx.transactionId}`);
        console.log(`Start Time: ${tx.startTime}`);
        console.log('-----------------------------------');
      }
    }
    
    // Check OCPP status notification messages to see current connector status
    const statusMessages = await OcppMessage.findAll({
      where: {
        chargePointId: stationId,
        message_type: 'StatusNotification',
        direction: 'Inbound'
      },
      order: [['timestamp', 'DESC']],
      limit: 5
    });
    
    console.log(`\nRecent StatusNotification messages: ${statusMessages.length}`);
    if (statusMessages.length > 0) {
      for (const msg of statusMessages) {
        console.log(`Timestamp: ${msg.timestamp}`);
        
        try {
          const payload = JSON.parse(msg.payload);
          console.log(`Connector ID: ${payload.connectorId || 'N/A'}`);
          console.log(`Status: ${payload.status || 'N/A'}`);
          console.log(`Error Code: ${payload.errorCode || 'N/A'}`);
        } catch (e) {
          console.log(`Payload (could not parse): ${msg.payload}`);
        }
        console.log('-----------------------------------');
      }
    }
    
    // Look for any errors or rejections
    const errorMessages = await OcppMessage.findAll({
      where: {
        chargePointId: stationId,
        status: 'Failed'
      },
      order: [['timestamp', 'DESC']],
      limit: 5
    });
    
    console.log(`\nRecent error messages: ${errorMessages.length}`);
    if (errorMessages.length > 0) {
      for (const msg of errorMessages) {
        console.log(`Message Type: ${msg.message_type}`);
        console.log(`Timestamp: ${msg.timestamp}`);
        console.log(`Payload: ${msg.payload}`);
        console.log('-----------------------------------');
      }
    }
    
    console.log('\nAnalysis complete. Based on the results:');
    console.log('1. Check if there are any active transactions shown in the StartTransaction messages');
    console.log('2. Compare those transaction IDs with what you\'re using in RemoteStopTransaction');
    console.log('3. Verify the connector status is in a state that allows stopping (e.g., "Charging" or "SuspendedEVSE")');
    
    process.exit(0);
  } catch (error) {
    console.error('Error analyzing messages:', error);
    process.exit(1);
  }
}

// Run the analysis
analyzeStationMessages();
