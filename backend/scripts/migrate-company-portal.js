require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_company_portal');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    console.log('Company portal schema is ready.');
  } catch (error) {
    console.error('Company portal migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();

