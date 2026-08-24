require('dotenv').config();

const { Sequelize } = require('sequelize');
const { sequelize } = require('../src/models');
const addGrossAmount = require('../migrations/add_gross_amount_to_transactions');

async function migrate() {
  try {
    await sequelize.authenticate();
    await addGrossAmount.up(sequelize.getQueryInterface(), Sequelize);
    console.log('Partner schema migration completed successfully');
  } catch (error) {
    console.error('Partner schema migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
