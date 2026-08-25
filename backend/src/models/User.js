const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const User = sequelize.define('user', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'manager', 'operator', 'customer', 'technician', 'finance', 'operations', 'support', 'viewer', 'partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'),
      defaultValue: 'viewer'
    },
    partnerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Reference to partner company (NULL for main company users)'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'NULL uses the role preset; an array is an explicit per-user permission set'
    },
    scopeType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'all',
      validate: { isIn: [['all', 'states']] }
    },
    managedStates: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    lastLogin: {
      type: DataTypes.DATE
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    hooks: {
      beforeCreate: async (user) => {
        user.password = await bcrypt.hash(user.password, 10);
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
      }
    }
  });

  // Method to compare password
  User.prototype.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  return User;
};
