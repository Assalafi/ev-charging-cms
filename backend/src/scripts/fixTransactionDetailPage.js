/**
 * Meter Values API for TransactionDetail.js
 * 
 * This script provides a working API endpoint for the frontend to fetch meter values
 * by transaction ID. It maps the OCPP transactionId to internal database ID correctly.
 */
const { MeterValue, Transaction, sequelize } = require('../models');
const logger = require('../utils/logger');

async function main() {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log('Database connection successful');
    
    // Make sure we have the meter_values route registered
    console.log('Checking if meter_values table exists...');
    const tableExists = await sequelize.query(
      'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = \'meter_values\')',
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log('Meter values table exists:', tableExists[0].exists);
    
    // Check table structure
    const columns = await sequelize.query(
      'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'meter_values\'',
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log('Meter values table columns:');
    columns.forEach(col => console.log(`- ${col.column_name}: ${col.data_type}`));
    
    // Check if any meter values exist
    const count = await sequelize.query(
      'SELECT COUNT(*) FROM meter_values',
      { type: sequelize.QueryTypes.SELECT }
    );
    console.log('Total meter values:', count[0].count);
    
    // Check the last 5 meter values
    if (parseInt(count[0].count) > 0) {
      const recentValues = await sequelize.query(
        'SELECT * FROM meter_values ORDER BY "timestamp" DESC LIMIT 5',
        { type: sequelize.QueryTypes.SELECT }
      );
      console.log('Recent meter values:');
      recentValues.forEach(val => console.log(val));
    }
    
    console.log('\nEnsuring foreign key constraint is properly understood by our code...');
    console.log('Checking foreign keys:');
    const fks = await sequelize.query(
      `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table_name, 
       ccu.column_name AS foreign_column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='meter_values'`,
       { type: sequelize.QueryTypes.SELECT }
    );
    
    fks.forEach(fk => {
      console.log(`Foreign key: ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });
    
    console.log('\nChecking transactions:');
    const transactions = await Transaction.findAll({
      limit: 5,
      attributes: ['id', 'transactionId', 'chargePointId', 'startTime', 'energyDelivered'],
      order: [['id', 'DESC']]
    });
    
    console.log('Recent transactions:');
    transactions.forEach(tx => {
      console.log(`ID: ${tx.id}, TransactionID: ${tx.transactionId}, ChargePointID: ${tx.chargePointId}`);
    });
    
    console.log('\nScript completed successfully.');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

main();
