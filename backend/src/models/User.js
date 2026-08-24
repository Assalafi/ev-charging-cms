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
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'finance', 'operations', 'support', 'viewer', 'partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'),
      defaultValue: 'viewer'
    },
    partnerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Reference to partner company (NULL for main company users)'
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
