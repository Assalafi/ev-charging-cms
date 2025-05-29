const defaultConfig = require('./default');

const developmentConfig = {
  ...defaultConfig,

  // Development-specific overrides
  database: {
    ...defaultConfig.database,
    logging: true, // Enable SQL query logging in development
  },

  // Development logging
  logging: {
    ...defaultConfig.logging,
    level: 'debug',
  },

  // Development monitoring
  monitoring: {
    ...defaultConfig.monitoring,
    enabled: false,
  },

  // Development rate limiting
  rateLimit: {
    ...defaultConfig.rateLimit,
    max: 1000, // Higher limit for development
  },

  // Development dashboard settings
  dashboard: {
    ...defaultConfig.dashboard,
    port: process.env.DASHBOARD_PORT || 3002,
    host: 'localhost',
    baseUrl: process.env.DASHBOARD_URL || 'http://localhost:3002',
    updateInterval: 2000, // 2 seconds in development for faster updates
  },
};

module.exports = developmentConfig;
