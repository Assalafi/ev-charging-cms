const { DataTypes } = require('sequelize');

module.exports = sequelize => sequelize.define('firmware_update', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chargePointId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  requestMessageId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  location: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'HTTP(S) URL sent in the OCPP UpdateFirmware request'
  },
  source: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'url'
  },
  targetVersion: {
    type: DataTypes.STRING,
    allowNull: true
  },
  originalFilename: {
    type: DataTypes.STRING,
    allowNull: true
  },
  storageFilename: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fileSize: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  checksumSha256: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  retrieveDate: {
    type: DataTypes.DATE,
    allowNull: false
  },
  retries: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  retryInterval: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  status: {
    type: DataTypes.STRING(40),
    allowNull: false,
    defaultValue: 'Dispatching'
  },
  statusMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  requestedBy: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  requestedByName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  requestedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  acknowledgedAt: DataTypes.DATE,
  downloadStartedAt: DataTypes.DATE,
  downloadedAt: DataTypes.DATE,
  installationStartedAt: DataTypes.DATE,
  completedAt: DataTypes.DATE,
  failedAt: DataTypes.DATE,
  lastStatusAt: DataTypes.DATE,
  currentFirmwareVersion: DataTypes.STRING,
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true
  }
}, {
  tableName: 'firmware_updates',
  timestamps: true,
  indexes: [
    { fields: ['chargePointId', 'requestedAt'] },
    { fields: ['status'] },
    { unique: true, fields: ['requestMessageId'] }
  ]
});
