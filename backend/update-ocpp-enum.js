const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: console.log
  }
);

async function updateOcppEnum() {
  try {
    await sequelize.authenticate();
    console.log('Connection has been established successfully.');
    
    // Check existing enum values
    const checkEnum = await sequelize.query(
      `SELECT enum_range(NULL::enum_ocpp_messages_message_type);`
    );
    console.log('Current enum values:', checkEnum[0][0].enum_range);
    
    // Add new values to the enum
    console.log('Adding new values to enum_ocpp_messages_message_type...');
    
    // Add RemoteStartTransaction
    try {
      await sequelize.query(
        `ALTER TYPE enum_ocpp_messages_message_type ADD VALUE IF NOT EXISTS 'RemoteStartTransaction';`
      );
      console.log('Added RemoteStartTransaction to enum');
    } catch (err) {
      console.log('Could not add RemoteStartTransaction, it might already exist:', err.message);
    }
    
    // Add RemoteStopTransaction
    try {
      await sequelize.query(
        `ALTER TYPE enum_ocpp_messages_message_type ADD VALUE IF NOT EXISTS 'RemoteStopTransaction';`
      );
      console.log('Added RemoteStopTransaction to enum');
    } catch (err) {
      console.log('Could not add RemoteStopTransaction, it might already exist:', err.message);
    }
    
    // Add ChangeAvailability if it doesn't exist
    try {
      await sequelize.query(
        `ALTER TYPE enum_ocpp_messages_message_type ADD VALUE IF NOT EXISTS 'ChangeAvailability';`
      );
      console.log('Added ChangeAvailability to enum');
    } catch (err) {
      console.log('Could not add ChangeAvailability, it might already exist:', err.message);
    }
    
    // Check updated enum values
    const updatedEnum = await sequelize.query(
      `SELECT enum_range(NULL::enum_ocpp_messages_message_type);`
    );
    console.log('Updated enum values:', updatedEnum[0][0].enum_range);
    
    console.log('Enum update completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Unable to connect to the database or update enum:', error);
    process.exit(1);
  }
}

updateOcppEnum();
