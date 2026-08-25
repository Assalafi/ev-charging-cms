require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize } = require('../src/models');
const migration = require('../migrations/add_admin_access_control');

(async () => {
  await sequelize.authenticate();
  await migration.up(sequelize.getQueryInterface(), DataTypes);
  console.log('Administrative access-control schema is ready.');
  await sequelize.close();
})().catch(async error => {
  console.error(error);
  await sequelize.close();
  process.exit(1);
});
