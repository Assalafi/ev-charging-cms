const { DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');

module.exports = (sequelize) => {
  const MobileUser = sequelize.define('mobile_user', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    phone: {
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
    tagId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      comment: 'OCPP idTag linked to authorized_tags table, derived from phone number'
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended', 'deleted'),
      defaultValue: 'active'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deletedat'
    },
    lastLogin: {
      type: DataTypes.DATE
    }
  }, {
    tableName: 'mobile_users',
    timestamps: true,
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

  MobileUser.prototype.comparePassword = async function(password) {
    return await bcrypt.compare(password, this.password);
  };

  // Soft delete method
  MobileUser.prototype.softDelete = async function() {
    await this.update({
      status: 'deleted',
      active: false,
      deletedAt: new Date()
    });
  };

  // Restore method
  MobileUser.prototype.restore = async function() {
    await this.update({
      status: 'active',
      active: true,
      deletedAt: null
    });
  };

  MobileUser.associate = function(models) {
    MobileUser.hasOne(models.AuthorizedTag, {
      foreignKey: 'tagId',
      sourceKey: 'tagId',
      as: 'authorizedTag'
    });
    MobileUser.hasMany(models.Transaction, {
      foreignKey: 'idTag',
      sourceKey: 'tagId',
      as: 'transactions'
    });
  };

  return MobileUser;
};
