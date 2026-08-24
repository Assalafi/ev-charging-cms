const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AdsBoard = sequelize.define('AdsBoard', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    title: {
      type: DataTypes.STRING(15),
      allowNull: false,
      validate: {
        len: [1, 15]
      }
    },
    body: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: [1, 50]
      }
    },
    photo: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'URL or path to the ad image'
    },
    order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Display order (ascending)'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active',
      allowNull: false
    }
  }, {
    tableName: 'ads_board',
    timestamps: true,
    createdAt: 'createdat',
    updatedAt: 'updatedat',
    indexes: [
      {
        fields: ['order']
      },
      {
        fields: ['status']
      },
      {
        fields: ['order', 'status']
      }
    ]
  });

  AdsBoard.associate = function(models) {
    // No associations needed for now
  };

  return AdsBoard;
};
