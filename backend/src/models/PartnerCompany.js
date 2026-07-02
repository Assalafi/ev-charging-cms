const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PartnerCompany = sequelize.define('PartnerCompany', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Partner company name'
    },
    businessName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Registered business name'
    },
    registrationNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Business registration number'
    },
    contactPersonName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Primary contact person'
    },
    contactEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Contact email'
    },
    contactPhone: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Contact phone number'
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Business address'
    },
    country: {
      type: DataTypes.STRING,
      defaultValue: 'Nigeria',
      comment: 'Country'
    },
    state: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'State/Region'
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'City'
    },
    logoUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Company logo URL'
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended'),
      defaultValue: 'active',
      comment: 'Partner status'
    },
    defaultPartnerSharePercent: {
      type: DataTypes.FLOAT,
      defaultValue: 50,
      comment: 'Default partner share percentage (0-100)'
    },
    defaultProductionCostPerWh: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
      comment: 'Default production cost per Wh'
    },
    bankName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Bank name for settlement'
    },
    bankAccountName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Bank account name'
    },
    bankAccountNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Bank account number'
    },
    settlementFrequency: {
      type: DataTypes.ENUM('weekly', 'monthly', 'yearly', 'manual'),
      defaultValue: 'monthly',
      comment: 'Settlement frequency'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes'
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Admin user ID who created this partner'
    }
  }, {
    tableName: 'partner_companies',
    timestamps: true,
    indexes: [
      {
        fields: ['status']
      },
      {
        fields: ['settlementFrequency']
      },
      {
        fields: ['state']
      },
      {
        fields: ['city']
      }
    ]
  });

  return PartnerCompany;
};
