const { DataTypes } = require('sequelize');

async function tableExists(queryInterface, tableName) {
  try {
    await queryInterface.describeTable(tableName);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  async up(queryInterface) {
    if (!(await tableExists(queryInterface, 'subscription_companies'))) {
      await queryInterface.createTable('subscription_companies', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        name: { type: DataTypes.STRING(160), allowNull: false },
        email: { type: DataTypes.STRING(160), allowNull: true },
        phone: { type: DataTypes.STRING(60), allowNull: true },
        address: { type: DataTypes.TEXT, allowNull: true },
        city: { type: DataTypes.STRING(100), allowNull: true },
        state: { type: DataTypes.STRING(100), allowNull: true },
        country: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Nigeria' },
        status: { type: DataTypes.ENUM('active', 'suspended', 'inactive'), allowNull: false, defaultValue: 'active' },
        notes: { type: DataTypes.TEXT, allowNull: true },
        createdBy: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
      await queryInterface.addIndex('subscription_companies', ['status']);
      await queryInterface.addIndex('subscription_companies', ['state']);
      await queryInterface.addIndex('subscription_companies', ['name']);
    }

    const mobileUsers = await queryInterface.describeTable('mobile_users');
    if (!mobileUsers.companyId) {
      await queryInterface.addColumn('mobile_users', 'companyId', {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'subscription_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Subscription company that owns or manages this mobile user'
      });
      await queryInterface.addIndex('mobile_users', ['companyId']);
    }

    if (!(await tableExists(queryInterface, 'company_wallets'))) {
      await queryInterface.createTable('company_wallets', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'subscription_companies', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        balance: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'NGN' },
        isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
    }

    if (!(await tableExists(queryInterface, 'company_wallet_transactions'))) {
      await queryInterface.createTable('company_wallet_transactions', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        companyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'subscription_companies', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        walletId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'company_wallets', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        beneficiaryUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'mobile_users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
        fundingRuleId: { type: DataTypes.INTEGER, allowNull: true },
        type: { type: DataTypes.ENUM('CREDIT', 'DEBIT'), allowNull: false },
        amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'NGN' },
        reference: { type: DataTypes.STRING(180), allowNull: false, unique: true },
        method: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'internal' },
        status: { type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REVERSED'), allowNull: false, defaultValue: 'SUCCESS' },
        description: { type: DataTypes.STRING(255), allowNull: true },
        metadata: { type: DataTypes.JSONB, allowNull: true },
        performedBy: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
      await queryInterface.addIndex('company_wallet_transactions', ['companyId', 'createdAt']);
      await queryInterface.addIndex('company_wallet_transactions', ['beneficiaryUserId']);
      await queryInterface.addIndex('company_wallet_transactions', ['status']);
    }

    if (!(await tableExists(queryInterface, 'company_funding_rules'))) {
      await queryInterface.createTable('company_funding_rules', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        companyId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'subscription_companies', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        mobileUserId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'mobile_users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        frequency: { type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'yearly'), allowNull: false },
        amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
        startDate: { type: DataTypes.DATEONLY, allowNull: false },
        endDate: { type: DataTypes.DATEONLY, allowNull: true },
        nextRunAt: { type: DataTypes.DATE, allowNull: false },
        lastRunAt: { type: DataTypes.DATE, allowNull: true },
        active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        notes: { type: DataTypes.STRING(255), allowNull: true },
        createdBy: { type: DataTypes.INTEGER, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
      });
      await queryInterface.addIndex('company_funding_rules', ['companyId', 'active']);
      await queryInterface.addIndex('company_funding_rules', ['nextRunAt']);
      await queryInterface.addIndex('company_funding_rules', ['mobileUserId']);
    }
  },

  async down(queryInterface) {
    // Do not drop company data in a production rollback. The migration is
    // intentionally additive; administrators can archive companies instead.
    await queryInterface.sequelize.query('SELECT 1');
  }
};
