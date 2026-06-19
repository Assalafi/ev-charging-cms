require('dotenv').config();
const { Sequelize } = require('sequelize');

// Create the database connection
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT || 'postgres',
    logging: false
  }
);

async function analyzeTA002() {
  try {
    await sequelize.authenticate();
    console.log('Connected to the database successfully.');

    // Based on the actual column names we detected
    console.log('\n=== Recent RemoteStartTransaction Messages for TA002 ===');
    const startTransactions = await sequelize.query(
      `SELECT * FROM ocpp_messages 
       WHERE "chargePointId" = 'TA002' 
       AND message_type = 'RemoteStartTransaction'
       ORDER BY "timestamp" DESC
       LIMIT 5`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (startTransactions.length === 0) {
      console.log('No RemoteStartTransaction messages found for TA002');
    } else {
      startTransactions.forEach(tx => {
        console.log(`\nTimestamp: ${tx.timestamp}`);
        console.log(`Status: ${tx.status}`);
        console.log(`Payload: ${JSON.stringify(tx.payload || {})}`);
        
        // Check if this is the UNKNOWN_TAG request
        if (tx.payload?.idTag === 'UNKNOWN_TAG') {
          console.log('*** THIS IS YOUR UNKNOWN_TAG REQUEST ***');
        }
      });
    }

    // Check for recent StatusNotification messages
    console.log('\n=== Recent StatusNotification Messages for TA002 ===');
    const statusNotifications = await sequelize.query(
      `SELECT * FROM ocpp_messages 
       WHERE "chargePointId" = 'TA002' 
       AND message_type = 'StatusNotification'
       ORDER BY "timestamp" DESC
       LIMIT 3`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (statusNotifications.length === 0) {
      console.log('No StatusNotification messages found for TA002');
    } else {
      statusNotifications.forEach(notification => {
        const payload = notification.payload || {};
        console.log(`\nTimestamp: ${notification.timestamp}`);
        console.log(`Connector: ${payload.connectorId}`);
        console.log(`Status: ${payload.status}`);
        console.log(`Error Code: ${payload.errorCode || 'None'}`);
      });
    }

    // Check for active transactions
    console.log('\n=== Checking for Active Transactions ===');
    try {
      const activeTransactions = await sequelize.query(
        `SELECT * FROM transactions 
         WHERE "chargePointId" = 'TA002'
         AND status = 'InProgress'
         ORDER BY "startTime" DESC`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log(`Found ${activeTransactions.length} active transactions for TA002`);
      activeTransactions.forEach(tx => {
        console.log(`\nTransaction ID: ${tx.transactionId}`);
        console.log(`ID Tag: ${tx.idTag}`);
        console.log(`Start Time: ${tx.startTime}`);
        console.log(`Connector ID: ${tx.connectorId}`);
      });
      
      // Check specifically for UNKNOWN_TAG transactions
      const unknownTagTx = await sequelize.query(
        `SELECT * FROM transactions 
         WHERE "chargePointId" = 'TA002'
         AND "idTag" = 'UNKNOWN_TAG'
         ORDER BY "startTime" DESC
         LIMIT 3`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log(`\nFound ${unknownTagTx.length} transactions with UNKNOWN_TAG for TA002`);
      unknownTagTx.forEach(tx => {
        console.log(`Transaction ID: ${tx.transactionId}, Status: ${tx.status}`);
      });
    } catch (err) {
      console.log('Error querying transactions:', err.message);
    }

    // Check for Authorization status
    console.log('\n=== Recent Authorization Messages ===');
    try {
      const authMessages = await sequelize.query(
        `SELECT * FROM ocpp_messages 
         WHERE message_type = 'Authorize'
         AND payload::text LIKE '%UNKNOWN_TAG%'
         ORDER BY "timestamp" DESC
         LIMIT 3`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      if (authMessages.length === 0) {
        console.log('No authorization messages found for UNKNOWN_TAG');
      } else {
        authMessages.forEach(auth => {
          console.log(`\nTimestamp: ${auth.timestamp}`);
          console.log(`Station: ${auth.chargePointId}`);
          console.log(`Status: ${auth.status}`);
          console.log(`Authorization Status: ${auth.payload?.idTagInfo?.status || 'Unknown'}`);
        });
      }
    } catch (err) {
      console.log('Error querying auth messages:', err.message);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

analyzeTA002();
