const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentSettings = sequelize.define('PaymentSettings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    category: {
      type: DataTypes.ENUM('paystack', 'wallet', 'features'),
      allowNull: false,
      unique: 'category_key_unique'
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: 'category_key_unique'
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    updatedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'payment_settings',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['category', 'key'],
        name: 'category_key_unique'
      },
      {
        fields: ['category']
      },
      {
        fields: ['isActive']
      }
    ]
  });

  PaymentSettings.associate = (models) => {
    PaymentSettings.belongsTo(models.User, {
      foreignKey: 'updatedBy',
      as: 'updater'
    });
  };

  // Static method to get settings by category
  PaymentSettings.getCategorySettings = async (category) => {
    const settings = await PaymentSettings.findAll({
      where: {
        category,
        isActive: true
      },
      order: [['key', 'ASC']]
    });

    const result = {};
    settings.forEach(setting => {
      // Try to parse as JSON, fallback to string
      try {
        result[setting.key] = JSON.parse(setting.value);
      } catch {
        result[setting.key] = setting.value;
      }
    });

    return result;
  };

  // Static method to update settings
  PaymentSettings.updateCategorySettings = async (category, settings, userId) => {
    const transaction = await sequelize.transaction();
    
    try {
      for (const [key, value] of Object.entries(settings)) {
        await PaymentSettings.upsert({
          category,
          key,
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
          updatedBy: userId,
          isActive: true
        }, {
          transaction,
          conflictFields: ['category', 'key'],
          updateOnDuplicate: ['value', 'updatedBy']
        });
      }

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  // Static method to initialize default settings
  PaymentSettings.initializeDefaults = async () => {
    const defaultSettings = [
      // Paystack settings
      { category: 'paystack', key: 'publicKey', value: '', description: 'Paystack Public Key' },
      { category: 'paystack', key: 'secretKey', value: '', description: 'Paystack Secret Key' },
      
      // Wallet settings
      { category: 'wallet', key: 'minFundingAmount', value: '100', description: 'Minimum Funding Amount' },
      { category: 'wallet', key: 'maxFundingAmount', value: '100000', description: 'Maximum Funding Amount' },
      { category: 'wallet', key: 'minWithdrawalAmount', value: '500', description: 'Minimum Withdrawal Amount' },
      { category: 'wallet', key: 'maxWithdrawalAmount', value: '50000', description: 'Maximum Withdrawal Amount' },
      { category: 'wallet', key: 'currency', value: 'NGN', description: 'Wallet Currency' },
      
      // Feature settings
      { category: 'features', key: 'walletEnabled', value: 'true', description: 'Enable Wallet Feature' }
    ];

    for (const setting of defaultSettings) {
      await PaymentSettings.findOrCreate({
        where: {
          category: setting.category,
          key: setting.key
        },
        defaults: setting
      });
    }
  };

  return PaymentSettings;
};
