/**
 * Script to check and fix database models
 */
require('dotenv').config();
const { sequelize } = require('./src/models');
const logger = require('./src/utils/logger');

async function checkModels() {
  logger.info('Checking database models...');
  
  try {
    // List all models in the Sequelize instance
    const modelNames = Object.keys(sequelize.models);
    logger.info(`Available models: ${modelNames.join(', ')}`);
    
    // Specifically check for Connector model
    if (!modelNames.includes('Connector')) {
      logger.error('Connector model is missing!');
      
      // Define it if missing
      logger.info('Creating Connector model definition...');
      
      const { DataTypes } = require('sequelize');
      
      const Connector = sequelize.define('Connector', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        chargePointId: {
          type: DataTypes.STRING,
          allowNull: false
        },
        connectorId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'Available'
        },
        errorCode: {
          type: DataTypes.STRING,
          allowNull: true
        },
        info: {
          type: DataTypes.STRING,
          allowNull: true
        },
        vendorId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        vendorErrorCode: {
          type: DataTypes.STRING,
          allowNull: true
        },
        transactionId: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        lastStatusUpdate: {
          type: DataTypes.DATE,
          allowNull: true
        }
      }, {
        tableName: 'connectors',
        indexes: [
          {
            unique: true,
            fields: ['chargePointId', 'connectorId']
          }
        ]
      });
      
      // Associate with ChargingStation if it exists
      if (sequelize.models.ChargingStation) {
        Connector.belongsTo(sequelize.models.ChargingStation, { 
          foreignKey: 'chargePointId',
          targetKey: 'chargePointId'
        });
      }
      
      // Sync the model with the database
      await Connector.sync();
      logger.info('Connector model created and synced with database');
    } else {
      logger.info('Connector model exists');
    }
    
    // Check Transaction model
    if (!modelNames.includes('Transaction')) {
      logger.error('Transaction model is missing!');
      
      logger.info('Creating Transaction model definition...');
      
      const { DataTypes } = require('sequelize');
      
      const Transaction = sequelize.define('Transaction', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        transactionId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        chargePointId: {
          type: DataTypes.STRING,
          allowNull: false
        },
        connectorId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        idTag: {
          type: DataTypes.STRING,
          allowNull: false
        },
        startTime: {
          type: DataTypes.DATE,
          allowNull: false
        },
        startMeterValue: {
          type: DataTypes.FLOAT,
          allowNull: true
        },
        stopTime: {
          type: DataTypes.DATE,
          allowNull: true
        },
        stopMeterValue: {
          type: DataTypes.FLOAT,
          allowNull: true
        },
        stopReason: {
          type: DataTypes.STRING,
          allowNull: true
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'InProgress'
        },
        meterValues: {
          type: DataTypes.JSONB,
          defaultValue: []
        }
      }, {
        tableName: 'transactions',
        indexes: [
          {
            fields: ['transactionId']
          },
          {
            fields: ['chargePointId', 'connectorId']
          },
          {
            fields: ['status']
          }
        ]
      });
      
      // Associate with ChargingStation if it exists
      if (sequelize.models.ChargingStation) {
        Transaction.belongsTo(sequelize.models.ChargingStation, { 
          foreignKey: 'chargePointId',
          targetKey: 'chargePointId'
        });
      }
      
      // Sync the model with the database
      await Transaction.sync();
      logger.info('Transaction model created and synced with database');
    } else {
      logger.info('Transaction model exists');
    }
    
    logger.info('Model check complete');
  } catch (error) {
    logger.error('Error checking models:', error);
  }
}

// Run the check
checkModels()
  .then(() => {
    logger.info('Model verification complete');
    process.exit(0);
  })
  .catch(error => {
    logger.error('Model verification failed:', error);
    process.exit(1);
  });
