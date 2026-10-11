const { DataTypes } = require('sequelize');

async function tableExists(queryInterface, tableName) {
  try { await queryInterface.describeTable(tableName); return true; } catch (error) { return false; }
}

module.exports = {
  async up(queryInterface) {
    if (await tableExists(queryInterface, 'company_users')) return;
    await queryInterface.createTable('company_users', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'subscription_companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: { type: DataTypes.STRING(160), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
      phone: { type: DataTypes.STRING(60), allowNull: true },
      password: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.ENUM('owner', 'manager', 'viewer'), allowNull: false, defaultValue: 'owner' },
      status: { type: DataTypes.ENUM('active', 'suspended'), allowNull: false, defaultValue: 'active' },
      lastLogin: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addIndex('company_users', ['companyId', 'status']);
  },
  async down(queryInterface) {
    await queryInterface.sequelize.query('SELECT 1');
  }
};

