require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_pending_status_to_partner_settlements');

async function migrate() {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Partner settlement status migration completed successfully');
  } catch (error) {
    console.error('Partner settlement status migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
