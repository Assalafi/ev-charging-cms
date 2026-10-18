require('dotenv').config();

const { Sequelize } = require('sequelize');
const { sequelize } = require('../src/models');
const migration = require('../migrations/add_ocpp_recovery_fields');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('OCPP recovery schema is ready. Existing records were preserved.');
  } catch (error) {
    console.error('OCPP recovery migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
