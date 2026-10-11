const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Initialize Sequelize with PostgreSQL
const sequelize = new Sequelize(
  process.env.DB_NAME || 'ev_charging_prod',
  process.env.DB_USER || 'assalafi',
  process.env.DB_PASSWORD || 'Assalafi@139',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
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
const Location = require('./Location')(sequelize);
const MobileUser = require('./MobileUser')(sequelize);
const Wallet = require('./Wallet')(sequelize);
const PaymentTransaction = require('./PaymentTransaction')(sequelize);
const PaymentSettings = require('./PaymentSettings')(sequelize);
const Reservation = require('./Reservation')(sequelize);
const AdsBoard = require('./AdsBoard')(sequelize);

// Company subscription models
const SubscriptionCompany = require('./SubscriptionCompany')(sequelize);
const CompanyWallet = require('./CompanyWallet')(sequelize);
const CompanyWalletTransaction = require('./CompanyWalletTransaction')(sequelize);
const CompanyFundingRule = require('./CompanyFundingRule')(sequelize);
const CompanyUser = require('./CompanyUser')(sequelize);

// Partnership models
const PartnerCompany = require('./PartnerCompany')(sequelize);
const PartnerSettlement = require('./PartnerSettlement')(sequelize);
const PartnerSettlementItem = require('./PartnerSettlementItem')(sequelize);

// Define relationships
ChargingStation.hasMany(Transaction, { foreignKey: 'chargingStationId' });
Transaction.belongsTo(ChargingStation, { foreignKey: 'chargingStationId' });

Transaction.hasMany(MeterValue, { foreignKey: 'transactionId' });
MeterValue.belongsTo(Transaction, { foreignKey: 'transactionId' });

ChargingStation.hasMany(OcppMessage, { foreignKey: 'chargingStationId' });
OcppMessage.belongsTo(ChargingStation, { foreignKey: 'chargingStationId' });

// Add Connector relationships
ChargingStation.hasMany(Connector, { 
  foreignKey: 'chargePointId',
  sourceKey: 'chargePointId' 
});
Connector.belongsTo(ChargingStation, { 
  foreignKey: 'chargePointId',
  targetKey: 'chargePointId' 
});

// Location relationships
ChargingStation.belongsTo(Location, { foreignKey: 'locationId', as: 'locationInfo' });
Location.hasMany(ChargingStation, { foreignKey: 'locationId', as: 'stations' });

// MobileUser and Wallet relationships
MobileUser.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet' });
Wallet.belongsTo(MobileUser, { foreignKey: 'userId', as: 'user' });

// PaymentTransaction relationships
PaymentTransaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
PaymentTransaction.belongsTo(MobileUser, { foreignKey: 'userId', as: 'user' });
Wallet.hasMany(PaymentTransaction, { foreignKey: 'walletId', as: 'transactions' });
MobileUser.hasMany(PaymentTransaction, { foreignKey: 'userId', as: 'payments' });

// Subscription company relationships. These are deliberately separate from
// PartnerCompany so existing partner settlements and ownership remain intact.
SubscriptionCompany.hasMany(MobileUser, { foreignKey: 'companyId', as: 'mobileUsers' });
MobileUser.belongsTo(SubscriptionCompany, { foreignKey: 'companyId', as: 'company' });
SubscriptionCompany.hasOne(CompanyWallet, { foreignKey: 'companyId', as: 'wallet' });
CompanyWallet.belongsTo(SubscriptionCompany, { foreignKey: 'companyId', as: 'company' });
SubscriptionCompany.hasMany(CompanyWalletTransaction, { foreignKey: 'companyId', as: 'walletTransactions' });
CompanyWalletTransaction.belongsTo(SubscriptionCompany, { foreignKey: 'companyId', as: 'company' });
CompanyWallet.hasMany(CompanyWalletTransaction, { foreignKey: 'walletId', as: 'transactions' });
CompanyWalletTransaction.belongsTo(CompanyWallet, { foreignKey: 'walletId', as: 'wallet' });
CompanyWalletTransaction.belongsTo(MobileUser, { foreignKey: 'beneficiaryUserId', as: 'beneficiary' });
SubscriptionCompany.hasMany(CompanyFundingRule, { foreignKey: 'companyId', as: 'fundingRules' });
CompanyFundingRule.belongsTo(SubscriptionCompany, { foreignKey: 'companyId', as: 'company' });
CompanyFundingRule.belongsTo(MobileUser, { foreignKey: 'mobileUserId', as: 'mobileUser' });
MobileUser.hasMany(CompanyFundingRule, { foreignKey: 'mobileUserId', as: 'fundingRules' });
SubscriptionCompany.hasMany(CompanyUser, { foreignKey: 'companyId', as: 'users' });
CompanyUser.belongsTo(SubscriptionCompany, { foreignKey: 'companyId', as: 'company' });

// MobileUser -> AuthorizedTag and Transaction associations (used by admin routes)
MobileUser.hasOne(AuthorizedTag, { foreignKey: 'tagId', sourceKey: 'tagId', as: 'authorizedTag' });
MobileUser.hasMany(Transaction, { foreignKey: 'idTag', sourceKey: 'tagId', as: 'transactions' });

// Reservation relationships
Reservation.belongsTo(ChargingStation, { foreignKey: 'chargePointId', targetKey: 'chargePointId', as: 'station' });
ChargingStation.hasMany(Reservation, { foreignKey: 'chargePointId', sourceKey: 'chargePointId', as: 'reservations' });

// Partnership relationships
PartnerCompany.hasMany(User, { foreignKey: 'partnerId', as: 'users' });
User.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerCompany.hasMany(Location, { foreignKey: 'partnerId', as: 'locations' });
Location.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerCompany.hasMany(Transaction, { foreignKey: 'partnerId', as: 'transactions' });
Transaction.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

Transaction.belongsTo(Location, { foreignKey: 'locationId', as: 'location' });

PartnerCompany.hasMany(PartnerSettlement, { foreignKey: 'partnerId', as: 'settlements' });
PartnerSettlement.belongsTo(PartnerCompany, { foreignKey: 'partnerId', as: 'partner' });

PartnerSettlement.hasMany(PartnerSettlementItem, { foreignKey: 'settlementId', as: 'items' });
PartnerSettlementItem.belongsTo(PartnerSettlement, { foreignKey: 'settlementId', as: 'settlement' });

PartnerSettlementItem.belongsTo(Transaction, { foreignKey: 'transactionId', as: 'transaction' });

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
  AuthorizedTag,
  Location,
  MobileUser,
  Wallet,
  PaymentTransaction,
  PaymentSettings,
  Reservation,
  AdsBoard,
  SubscriptionCompany,
  CompanyWallet,
  CompanyWalletTransaction,
  CompanyFundingRule,
  CompanyUser,
  PartnerCompany,
  PartnerSettlement,
  PartnerSettlementItem
};
