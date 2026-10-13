require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_company_billing_controls');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Company debt and billing controls schema is ready.');
  } catch (error) {
    console.error('Company billing controls migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
