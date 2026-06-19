const {
    Sequelize
} = require('sequelize');
const logger = require('../utils/logger');

// Initialize Sequelize with PostgreSQL
const sequelize = new Sequelize(
    'ev_charging_cms',
    'abubakar',
    '', {
        host: 'localhost',
        port: 5432,
        dialect: 'postgres',
        logging: msg => logger.debug(msg),
        define: {
            underscored: false,
            timestamps: true
        }
    }
);

// Import models
const User = require('./User')(sequelize);
const ChargingStation = require('./ChargingStation')(sequelize);
const Transaction = require('./Transaction')(sequelize);
const OcppMessage = require('./OcppMessage')(sequelize);
const MeterValue = require('./MeterValue')(sequelize);
const Settings = require('./Settings')(sequelize);
const Connector = require('./Connector')(sequelize);
const AuthorizedTag = require('./AuthorizedTag')(sequelize);

// Define relationships
ChargingStation.hasMany(Transaction, {
    foreignKey: 'chargingStationId'
});
Transaction.belongsTo(ChargingStation, {
    foreignKey: 'chargingStationId'
});

Transaction.hasMany(MeterValue, {
    foreignKey: 'transactionId'
});
MeterValue.belongsTo(Transaction, {
    foreignKey: 'transactionId'
});

ChargingStation.hasMany(OcppMessage, {
    foreignKey: 'chargingStationId'
});
OcppMessage.belongsTo(ChargingStation, {
    foreignKey: 'chargingStationId'
});

// Add Connector relationships
ChargingStation.hasMany(Connector, {
    foreignKey: 'chargePointId',
    sourceKey: 'chargePointId'
});
Connector.belongsTo(ChargingStation, {
    foreignKey: 'chargePointId',
    targetKey: 'chargePointId'
});

// Initialize TimescaleDB hypertable after sync - if available
sequelize.afterSync(async () => {
    try {
        // Check if TimescaleDB extension exists before trying to create hypertable
        const [results] = await sequelize.query(`
      SELECT COUNT(*) FROM pg_extension WHERE extname = 'timescaledb';
    `);

        // Only create hypertable if TimescaleDB extension is available
        if (results[0].count > 0) {
            await sequelize.query(`
        SELECT create_hypertable('meter_values', 'timestamp', if_not_exists => TRUE);
      `);
            logger.info('TimescaleDB hypertable initialized successfully');
        } else {
            logger.warn('TimescaleDB extension not installed - skipping hypertable creation');
            logger.warn('Time-series data will be stored in regular PostgreSQL tables');
        }
    } catch (error) {
        logger.error('Failed to initialize TimescaleDB hypertable:', error);
        logger.warn('Continuing without TimescaleDB support');
    }
});

module.exports = {
    sequelize,
    User,
    ChargingStation,
    Transaction,
    OcppMessage,
    MeterValue,
    Settings,
    Connector,
    AuthorizedTag
};