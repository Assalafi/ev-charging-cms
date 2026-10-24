const { DataTypes } = require('sequelize');

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  return tables.some(table => {
    const name = typeof table === 'string' ? table : table.tableName;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, 'firmware_updates'))) {
      await queryInterface.createTable('firmware_updates', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        chargePointId: { type: DataTypes.STRING, allowNull: false },
        requestMessageId: { type: DataTypes.STRING, allowNull: true },
        location: { type: DataTypes.TEXT, allowNull: false },
        source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'url' },
        targetVersion: { type: DataTypes.STRING, allowNull: true },
        originalFilename: { type: DataTypes.STRING, allowNull: true },
        storageFilename: { type: DataTypes.STRING, allowNull: true },
        fileSize: { type: DataTypes.BIGINT, allowNull: true },
        checksumSha256: { type: DataTypes.STRING(64), allowNull: true },
        retrieveDate: { type: DataTypes.DATE, allowNull: false },
        retries: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        retryInterval: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'Dispatching' },
        statusMessage: { type: DataTypes.TEXT, allowNull: true },
        requestedBy: { type: DataTypes.INTEGER, allowNull: true },
        requestedByName: { type: DataTypes.STRING, allowNull: true },
        requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        acknowledgedAt: { type: DataTypes.DATE, allowNull: true },
        downloadStartedAt: { type: DataTypes.DATE, allowNull: true },
        downloadedAt: { type: DataTypes.DATE, allowNull: true },
        installationStartedAt: { type: DataTypes.DATE, allowNull: true },
        completedAt: { type: DataTypes.DATE, allowNull: true },
        failedAt: { type: DataTypes.DATE, allowNull: true },
        lastStatusAt: { type: DataTypes.DATE, allowNull: true },
        currentFirmwareVersion: { type: DataTypes.STRING, allowNull: true },
        metadata: { type: DataTypes.JSONB, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    const indexes = await queryInterface.showIndex('firmware_updates');
    const names = new Set(indexes.map(index => index.name));
    if (!names.has('firmware_updates_station_requested_idx')) {
      await queryInterface.addIndex('firmware_updates', ['chargePointId', 'requestedAt'], {
        name: 'firmware_updates_station_requested_idx'
      });
    }
    if (!names.has('firmware_updates_status_idx')) {
      await queryInterface.addIndex('firmware_updates', ['status'], {
        name: 'firmware_updates_status_idx'
      });
    }
    const requestMessageAlreadyUnique = indexes.some(index =>
      index.unique && index.fields?.some(field => field.attribute === 'requestMessageId')
    );
    if (!names.has('firmware_updates_request_message_unique') && !requestMessageAlreadyUnique) {
      await queryInterface.addIndex('firmware_updates', ['requestMessageId'], {
        name: 'firmware_updates_request_message_unique',
        unique: true
      });
    }
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'firmware_updates')) {
      await queryInterface.dropTable('firmware_updates');
    }
  }
};
