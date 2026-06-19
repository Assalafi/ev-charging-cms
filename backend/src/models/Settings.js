const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('settings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'settings',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['category', 'key']
      }
    ]
  });
};
