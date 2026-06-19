require('dotenv').config();
const path = require('path');
const { sequelize } = require('./src/models');

// Import the OCPP server from your existing implementation
const ocppServer = require('./src/ocpp/server');

// Transaction to stop
const TRANSACTION_ID = 230234;
const STATION_ID = 'TA002';

async function stopTransaction() {
  try {
    console.log(`Attempting to stop transaction ${TRANSACTION_ID} on station ${STATION_ID}...`);
    
    // Verify transaction exists and is active
    const [transaction] = await sequelize.query(
      `SELECT * FROM transactions WHERE "transactionId" = ? AND "chargePointId" = ?`,
      { 
        replacements: [TRANSACTION_ID, STATION_ID],
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!transaction) {
      console.error(`Transaction ${TRANSACTION_ID} not found for station ${STATION_ID}`);
      return;
    }
    
    console.log(`Found transaction: ID=${transaction.transactionId}, Status=${transaction.status}, ConnectorId=${transaction.connectorId}`);
    
    // Send RemoteStopTransaction command using the OCPP server
    console.log(`Sending RemoteStopTransaction command...`);
    const result = await ocppServer.sendOcppRequest(STATION_ID, 'RemoteStopTransaction', {
      transactionId: parseInt(TRANSACTION_ID)
    });
    
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.status === 'Accepted') {
      console.log(`✅ Successfully stopped transaction ${TRANSACTION_ID}`);
      
      // Update transaction in database
      await sequelize.query(
        `UPDATE transactions 
         SET status = 'Completed', "stopTime" = NOW() 
         WHERE "transactionId" = ?`,
        { 
          replacements: [TRANSACTION_ID],
          type: sequelize.QueryTypes.UPDATE
        }
      );
      console.log(`Updated transaction status to Completed`);
    } else {
      console.error(`❌ Failed to stop transaction. Status: ${result.status}`);
      console.error(`Error code: ${result.errorCode || 'None'}`);
      
      // Check connector status to diagnose the issue
      const [connectorStatus] = await sequelize.query(
        `SELECT message_type, payload, "timestamp" 
         FROM ocpp_messages 
         WHERE "chargePointId" = ? 
         AND message_type = 'StatusNotification'
         ORDER BY "timestamp" DESC
         LIMIT 1`,
        {
          replacements: [STATION_ID],
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (connectorStatus) {
        console.log(`\nLatest connector status (${connectorStatus.timestamp}):`);
        const payload = typeof connectorStatus.payload === 'string' 
          ? JSON.parse(connectorStatus.payload) 
          : connectorStatus.payload;
        
        console.log(`Connector ${payload?.connectorId || 1}: ${payload?.status || 'Unknown'}`);
        console.log(`According to OCPP 1.6, RemoteStopTransaction is only valid when connector is in 'Charging' state`);
      }
      
      // Alternative approach: Force transaction completion
      console.log('\nWould you like to force-complete this transaction in the database?');
      console.log('Run: node force-complete-tx.js');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close database connection
    await sequelize.close();
  }
}

stopTransaction();
