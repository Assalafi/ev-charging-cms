const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize with PostgreSQL configuration
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'ev_charging_local',
  username: 'postgres',
  password: 'postgres',
  logging: console.log
});

// Database schema definition
const ChargingStation = sequelize.define('charging_stations', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  charge_point_id: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  model: Sequelize.STRING,
  vendor: Sequelize.STRING,
  firmware_version: Sequelize.STRING,
  ip_address: Sequelize.STRING,
  latitude: Sequelize.DECIMAL(10, 8),
  longitude: Sequelize.DECIMAL(11, 8),
  last_heartbeat: Sequelize.DATE,
  status: {
    type: Sequelize.STRING,
    defaultValue: 'UNAVAILABLE'
  },
  ocpp_version: Sequelize.STRING,
  created_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  },
  updated_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  }
});

const Connector = sequelize.define('connectors', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  station_id: {
    type: Sequelize.INTEGER,
    references: {
      model: ChargingStation,
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  connector_id: {
    type: Sequelize.INTEGER,
    allowNull: false
  },
  type: Sequelize.STRING,
  status: {
    type: Sequelize.STRING,
    defaultValue: 'UNAVAILABLE'
  },
  power_kw: Sequelize.DECIMAL(10, 2),
  created_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  },
  updated_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  }
});

const Transaction = sequelize.define('transactions', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transaction_id: {
    type: Sequelize.STRING,
    unique: true
  },
  station_id: {
    type: Sequelize.INTEGER,
    references: {
      model: ChargingStation,
      key: 'id'
    }
  },
  connector_id: {
    type: Sequelize.INTEGER,
    allowNull: false
  },
  id_tag: Sequelize.STRING,
  start_time: {
    type: Sequelize.DATE,
    allowNull: false
  },
  stop_time: Sequelize.DATE,
  start_meter_value: Sequelize.DECIMAL(10, 2),
  stop_meter_value: Sequelize.DECIMAL(10, 2),
  total_energy_kwh: Sequelize.DECIMAL(10, 2),
  total_cost: Sequelize.DECIMAL(10, 2),
  status: {
    type: Sequelize.STRING,
    defaultValue: 'IN_PROGRESS'
  },
  created_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  },
  updated_at: {
    type: Sequelize.DATE,
    defaultValue: Sequelize.NOW
  }
});

// Define relationships
ChargingStation.hasMany(Connector, { foreignKey: 'station_id' });
Connector.belongsTo(ChargingStation, { foreignKey: 'station_id' });
ChargingStation.hasMany(Transaction, { foreignKey: 'station_id' });
Transaction.belongsTo(ChargingStation, { foreignKey: 'station_id' });

// Initialize database
async function initDatabase() {
  try {
    console.log('Initializing PostgreSQL database...');
    
    // Test connection
    await sequelize.authenticate();
    console.log('Database connection established successfully!');
    
    // Sync all models with database
    await sequelize.sync({ force: true });
    
    console.log('Database tables created successfully!');
    
    // Create a sample charging station for testing
    const sampleStation = await ChargingStation.create({
      charge_point_id: 'TEST_STATION_001',
      name: 'Test Charging Station',
      model: 'Test Model',
      vendor: 'Test Vendor',
      firmware_version: '1.0.0',
      ip_address: '192.168.1.100',
      latitude: 40.7128,
      longitude: -74.0060,
      status: 'AVAILABLE',
      ocpp_version: '1.6'
    });
    
    console.log('Sample charging station created:', sampleStation.charge_point_id);
    
    // Create sample connectors
    await Connector.bulkCreate([
      {
        station_id: sampleStation.id,
        connector_id: 1,
        type: 'TYPE_2',
        status: 'AVAILABLE',
        power_kw: 22.0
      },
      {
        station_id: sampleStation.id,
        connector_id: 2,
        type: 'CCS',
        status: 'AVAILABLE',
        power_kw: 50.0
      }
    ]);
    
    console.log('Sample connectors created!');
    
    await sequelize.close();
    console.log('Database initialization completed!');
    
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

// Run initialization
initDatabase();
