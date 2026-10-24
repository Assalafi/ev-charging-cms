require('dotenv').config();

const { sequelize } = require('../src/models');
const migration = require('../migrations/add_ocpp_session_ownership');

(async () => {
  try {
    await sequelize.authenticate();
    await migration.up(sequelize.getQueryInterface());
    const { backfillActiveSessionOwnership } = require('../src/ocpp/sessionOwnership');
    const result = await backfillActiveSessionOwnership();
    console.log(
      `OCPP session ownership schema is ready. Existing records were preserved. ` +
      `Active sessions inspected=${result.inspected}, linked=${result.linked}, ` +
      `quarantined=${result.quarantined}.`
    );
  } catch (error) {
    console.error('OCPP session ownership migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
