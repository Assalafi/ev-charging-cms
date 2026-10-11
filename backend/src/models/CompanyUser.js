const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const CompanyUser = sequelize.define('CompanyUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  companyId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  email: { type: DataTypes.STRING(160), allowNull: false, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING(60), allowNull: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('owner', 'manager', 'viewer'), allowNull: false, defaultValue: 'owner' },
  status: { type: DataTypes.ENUM('active', 'suspended'), allowNull: false, defaultValue: 'active' },
  lastLogin: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'company_users',
  indexes: [
    { unique: true, fields: ['email'] },
    { fields: ['companyId', 'status'] }
  ],
  hooks: {
    beforeCreate: async (user) => { user.password = await bcrypt.hash(user.password, 10); },
    beforeUpdate: async (user) => {
      if (user.changed('password')) user.password = await bcrypt.hash(user.password, 10);
    }
  }
  });

  CompanyUser.prototype.comparePassword = async function comparePassword(password) {
    return bcrypt.compare(password, this.password);
  };

  return CompanyUser;
};
