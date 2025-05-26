const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('authorized_tag', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tagId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'tag_id'
    },
    status: {
      type: DataTypes.ENUM('Active', 'Blocked', 'Expired', 'Invalid'),
      defaultValue: 'Active'
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expiry_date'
    },
    parentTagId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'parent_tag_id'
    },
    // OCPP 1.6 compliant fields
    blocked: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'valid_from'
    },
    validTo: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'valid_to'
    }
  }, {
    tableName: 'authorized_tags',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['tag_id'] }
    ]
  });
};
