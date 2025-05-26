require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
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

// Define OcppMessage model
const OcppMessage = sequelize.define('ocpp_message', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chargePointId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message_type: {
    type: DataTypes.ENUM(
      'Authorize', 'BootNotification', 'DataTransfer', 'Heartbeat',
      'MeterValues', 'StartTransaction', 'StatusNotification', 'StopTransaction',
      'ClearChargingProfile', 'GetCompositeSchedule', 'SetChargingProfile',
      'TriggerMessage', 'GetDiagnostics', 'DiagnosticsStatusNotification',
      'FirmwareStatusNotification', 'UpdateFirmware', 'GetLocalListVersion',
      'SendLocalList', 'CancelReservation', 'ReserveNow', 'ChangeAvailability',
      'ChangeConfiguration', 'ClearCache', 'GetConfiguration', 'Reset',
      'UnlockConnector', 'RemoteStartTransaction', 'RemoteStopTransaction',
      'Error', 'InternalError'
    ),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('Sent', 'Received', 'Failed', 'Pending', 'Timeout'),
    allowNull: false
  },
  message: DataTypes.JSONB,
  created_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'ocpp_messages',
  timestamps: false,
  underscored: true
});

async function checkRemoteStartTransaction() {
  try {
    await sequelize.authenticate();
    console.log('Connected to the database successfully.');

    // Check recent RemoteStartTransaction messages for TA002
    const remoteStartMessages = await OcppMessage.findAll({
      where: {
        chargePointId: 'TA002',
        message_type: 'RemoteStartTransaction'
      },
      order: [['created_at', 'DESC']],
      limit: 10
    });

    console.log(`\nFound ${remoteStartMessages.length} RemoteStartTransaction messages for TA002:`);
    
    if (remoteStartMessages.length === 0) {
      console.log('No RemoteStartTransaction messages found.');
      return;
    }

    remoteStartMessages.forEach(msg => {
      const payload = msg.message?.payload || {};
      const response = msg.message?.response || {};
      console.log(`\n[${msg.created_at.toISOString()}] Status: ${msg.status}`);
      console.log(`ID Tag: ${payload.idTag || 'Not specified'}`);
      console.log(`Response Status: ${response.status || 'No response'}`);
      
      if (response.status === 'Rejected') {
        console.log(`Rejection Reason: ${response.errorCode || 'Not specified'}`);
      }
      
      // Check if this matches the UNKNOWN_TAG request
      if (payload.idTag === 'UNKNOWN_TAG') {
        console.log('*** THIS IS YOUR UNKNOWN_TAG REQUEST ***');
      }
    });

    // Check if any transactions were started
    const transactions = await sequelize.query(
      `SELECT * FROM transactions 
       WHERE "chargePointId" = 'TA002' 
       AND "idTag" = 'UNKNOWN_TAG'
       ORDER BY "startTime" DESC
       LIMIT 5`,
      { type: sequelize.QueryTypes.SELECT }
    );

    console.log(`\nFound ${transactions.length} transactions with UNKNOWN_TAG:`);
    transactions.forEach(tx => {
      console.log(`\nTransaction ID: ${tx.transactionId}`);
      console.log(`Status: ${tx.status}`);
      console.log(`Start Time: ${tx.startTime}`);
      console.log(`Stop Time: ${tx.stopTime || 'Not stopped'}`);
    });

    // Check connector status
    const connectors = await sequelize.query(
      `SELECT * FROM connectors WHERE "chargePointId" = 'TA002'`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (connectors.length > 0) {
      console.log(`\nConnector Status for TA002:`);
      connectors.forEach(conn => {
        console.log(`Connector ${conn.connectorId}: ${conn.status}`);
      });
    } else {
      // Check if we have status notifications instead
      const statusNotifications = await OcppMessage.findAll({
        where: {
          chargePointId: 'TA002',
          message_type: 'StatusNotification'
        },
        order: [['created_at', 'DESC']],
        limit: 3
      });
      
      console.log(`\nRecent Connector Status Notifications for TA002:`);
      statusNotifications.forEach(notification => {
        const payload = notification.message?.payload || {};
        console.log(`Connector ${payload.connectorId}: ${payload.status} (${notification.created_at.toISOString()})`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

checkRemoteStartTransaction();
