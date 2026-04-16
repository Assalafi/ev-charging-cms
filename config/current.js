const defaultConfig = require('./default');

const productionConfig = {
  ...defaultConfig,
  
  // Override server configuration for production
  server: {
    ...defaultConfig.server,
    backend: {
      ...defaultConfig.server.backend,
      host: '0.0.0.0',
      baseUrl: process.env.BACKEND_URL || 'https://evcharging.eride.ng',
    },
    frontend: {
      ...defaultConfig.server.frontend,
      host: '0.0.0.0',
      baseUrl: process.env.FRONTEND_URL || 'https://evcharging.eride.ng',
    },
  },

  // Production database configuration
  database: {
    ...defaultConfig.database,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'ev_charging_prod',
    user: process.env.DB_USER || 'assalafi',
    password: process.env.DB_PASSWORD || 'Assalafi@139',
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 10000,
    },
  },

  // Production security settings
  security: {
    ...defaultConfig.security,
    jwtSecret: process.env.JWT_SECRET || 'your-production-jwt-secret',
    // CORS settings for production
    cors: {
      ...defaultConfig.security.cors,
      allowedOrigins: [
        'https://evcharging.eride.ng',
        'https://www.evcharging.eride.ng'
      ],
    },
  },

  // Production logging
  logging: {
    ...defaultConfig.logging,
    level: 'warn',
    format: 'json',
  },

  // Production monitoring
  monitoring: {
    ...defaultConfig.monitoring,
    enabled: true,
    interval: 30000, // 30 seconds
  },

  // Production rate limiting
  rateLimit: {
    ...defaultConfig.rateLimit,
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // limit each IP to 50 requests per windowMs
  },

  // Production dashboard settings
  dashboard: {
    ...defaultConfig.dashboard,
    port: process.env.DASHBOARD_PORT || 3002,
    host: '0.0.0.0',
    baseUrl: process.env.DASHBOARD_URL || 'https://evcharging.eride.ng',
    updateInterval: 10000, // 10 seconds in production
  },
};

module.exports = productionConfig;
