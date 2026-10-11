require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_company_subscriptions');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Company subscription schema is ready.');
  } catch (error) {
    console.error('Company subscription migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
