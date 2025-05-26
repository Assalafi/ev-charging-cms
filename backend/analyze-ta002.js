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

    // Step 1: Examine the ocpp_messages table structure
    console.log('\n=== Examining Database Schema ===');
    const messageColumns = await sequelize.query(
      `SELECT column_name, data_type 
       FROM information_schema.columns 
       WHERE table_name = 'ocpp_messages'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    console.log('OCPP Messages Table Columns:');
    messageColumns.forEach(col => {
      console.log(`- ${col.column_name} (${col.data_type})`);
    });

    // Find column names for key fields
    const stationIdColumn = messageColumns.find(col => 
      ['charge_point_id', 'chargepoint_id', 'charge_pointid', 'station_id', 'stationid'].includes(col.column_name)
    )?.column_name || 'station_id';
    
    const messageTypeColumn = messageColumns.find(col => 
      ['message_type', 'messagetype', 'type'].includes(col.column_name)
    )?.column_name || 'message_type';
    
    const createdAtColumn = messageColumns.find(col => 
      ['created_at', 'createdat', 'timestamp', 'date'].includes(col.column_name)
    )?.column_name || 'created_at';

    console.log(`\nKey Column Names:`);
    console.log(`- Station ID: ${stationIdColumn}`);
    console.log(`- Message Type: ${messageTypeColumn}`);
    console.log(`- Created At: ${createdAtColumn}`);

    // Step 2: Check for recent RemoteStartTransaction messages
    console.log('\n=== Recent RemoteStartTransaction Messages for TA002 ===');
    const startTransactions = await sequelize.query(
      `SELECT * FROM ocpp_messages 
       WHERE ${stationIdColumn} = 'TA002' 
       AND ${messageTypeColumn} = 'RemoteStartTransaction'
       ORDER BY ${createdAtColumn} DESC
       LIMIT 5`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (startTransactions.length === 0) {
      console.log('No RemoteStartTransaction messages found for TA002');
    } else {
      startTransactions.forEach(tx => {
        const message = typeof tx.message === 'string' ? JSON.parse(tx.message) : tx.message;
        console.log(`\nTimestamp: ${tx[createdAtColumn]}`);
        console.log(`Status: ${tx.status}`);
        console.log(`Payload: ${JSON.stringify(message?.payload || {})}`);
        console.log(`Response: ${JSON.stringify(message?.response || {})}`);
        
        // Check if this is the UNKNOWN_TAG request
        if (message?.payload?.idTag === 'UNKNOWN_TAG') {
          console.log('*** THIS IS YOUR UNKNOWN_TAG REQUEST ***');
        }
      });
    }

    // Step 3: Check for recent StatusNotification messages to determine connector state
    console.log('\n=== Recent StatusNotification Messages for TA002 ===');
    const statusNotifications = await sequelize.query(
      `SELECT * FROM ocpp_messages 
       WHERE ${stationIdColumn} = 'TA002' 
       AND ${messageTypeColumn} = 'StatusNotification'
       ORDER BY ${createdAtColumn} DESC
       LIMIT 3`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (statusNotifications.length === 0) {
      console.log('No StatusNotification messages found for TA002');
    } else {
      statusNotifications.forEach(notification => {
        const message = typeof notification.message === 'string' 
          ? JSON.parse(notification.message) 
          : notification.message;
        
        const payload = message?.payload || {};
        console.log(`\nTimestamp: ${notification[createdAtColumn]}`);
        console.log(`Connector: ${payload.connectorId}`);
        console.log(`Status: ${payload.status}`);
        console.log(`Error Code: ${payload.errorCode || 'None'}`);
      });
    }

    // Step 4: Check for active transactions
    console.log('\n=== Checking for Active Transactions ===');
    
    // First check if transactions table exists
    const transactionsExists = await sequelize.query(
      `SELECT EXISTS (
         SELECT FROM information_schema.tables 
         WHERE table_name = 'transactions'
       )`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (transactionsExists[0].exists) {
      // Check for transaction columns
      const txColumns = await sequelize.query(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'transactions'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      const txIdColumn = txColumns.find(col => 
        ['transactionid', 'transaction_id'].includes(col.column_name.toLowerCase())
      )?.column_name || 'transactionId';
      
      const chargePointIdColumn = txColumns.find(col => 
        ['chargepointid', 'charge_point_id', 'stationid', 'station_id'].includes(col.column_name.toLowerCase())
      )?.column_name || 'chargePointId';
      
      const statusColumn = txColumns.find(col => 
        ['status', 'state'].includes(col.column_name.toLowerCase())
      )?.column_name || 'status';
      
      const idTagColumn = txColumns.find(col => 
        ['idtag', 'id_tag', 'tagid'].includes(col.column_name.toLowerCase())
      )?.column_name || 'idTag';
      
      // Query active transactions
      const activeTransactions = await sequelize.query(
        `SELECT * FROM transactions 
         WHERE ${chargePointIdColumn} = 'TA002'
         AND ${statusColumn} = 'InProgress'
         ORDER BY "startTime" DESC`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log(`Found ${activeTransactions.length} active transactions for TA002`);
      activeTransactions.forEach(tx => {
        console.log(`\nTransaction ID: ${tx[txIdColumn]}`);
        console.log(`ID Tag: ${tx[idTagColumn]}`);
        console.log(`Start Time: ${tx.startTime}`);
        console.log(`Connector ID: ${tx.connectorId}`);
      });
      
      // Check specifically for UNKNOWN_TAG transactions
      const unknownTagTx = await sequelize.query(
        `SELECT * FROM transactions 
         WHERE ${chargePointIdColumn} = 'TA002'
         AND ${idTagColumn} = 'UNKNOWN_TAG'
         ORDER BY "startTime" DESC
         LIMIT 3`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log(`\nFound ${unknownTagTx.length} transactions with UNKNOWN_TAG for TA002`);
      unknownTagTx.forEach(tx => {
        console.log(`Transaction ID: ${tx[txIdColumn]}, Status: ${tx[statusColumn]}`);
      });
    } else {
      console.log('Transactions table not found in database');
    }
    
    // Step 5: Check for authorization status
    console.log('\n=== Recent Authorization Messages ===');
    const authMessages = await sequelize.query(
      `SELECT * FROM ocpp_messages 
       WHERE ${messageTypeColumn} = 'Authorize'
       AND message::text LIKE '%UNKNOWN_TAG%'
       ORDER BY ${createdAtColumn} DESC
       LIMIT 3`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (authMessages.length === 0) {
      console.log('No authorization messages found for UNKNOWN_TAG');
    } else {
      authMessages.forEach(auth => {
        const message = typeof auth.message === 'string' 
          ? JSON.parse(auth.message) 
          : auth.message;
        
        console.log(`\nTimestamp: ${auth[createdAtColumn]}`);
        console.log(`Station: ${auth[stationIdColumn]}`);
        console.log(`Status: ${auth.status}`);
        console.log(`Authorization Status: ${message?.response?.idTagInfo?.status || 'Unknown'}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

analyzeTA002();
