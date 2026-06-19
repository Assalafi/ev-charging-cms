require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./models');
const logger = require('./utils/logger');
const routes = require('./routes');
const ocppServer = require('./ocpp/server');
const mqttClient = require('./mqtt/client');
const pricingValidationMiddleware = require('./middleware/pricingValidationMiddleware');
// const metricsMiddleware = require('./middleware/metrics');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// ======================
// Security Middleware
// ======================
app.use(helmet());
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '50mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '50mb' }));

// ======================
// CORS Configuration
// ======================
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'https://evcharging.eride.ng',
    'http://localhost:3000'
  ],
  methods: process.env.CORS_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: process.env.CORS_ALLOWED_HEADERS?.split(',') || [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ],
  credentials: process.env.CORS_CREDENTIALS === 'true',
  preflightContinue: process.env.CORS_PREFLIGHT_CONTINUE === 'true'
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ======================
// Rate Limiting
// ======================
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: process.env.RATE_LIMIT_MESSAGE || 'Too many requests, please try again later'
});

app.use(limiter);

// ======================
// Static Files
// ======================
app.use('/public', express.static(process.env.UPLOADS_DIR || './uploads'));
app.use('/firmware', express.static(process.env.FIRMWARE_DIR || './uploads/firmware'));

// ======================
// Monitoring
// ======================
// if (process.env.METRICS_ENABLED === 'true') {
//  app.use(metricsMiddleware);
// }

// ======================
// Global Pricing Validation
// ======================
app.use(pricingValidationMiddleware);

// ======================
// API Routes
// ======================
app.use(process.env.API_PREFIX || '/api', routes);

// ======================
// Health Check
// ======================
app.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    database: {
      status: sequelize.authenticate() ? 'connected' : 'disconnected'
    },
    mqtt: {
      status: mqttClient.connected ? 'connected' : 'disconnected'
    },
    ocpp: {
      status: ocppServer.initialized ? 'initialized' : 'not initialized'
    }
  };
  res.status(200).json(healthcheck);
});

// ======================
// Error Handling
// ======================
app.use((err, req, res, next) => {
  logger.error('Unhandled Error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ======================
// Database Connection
// ======================
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized with alter');
    } else {
      await sequelize.sync();
      logger.info('Database models synchronized');
    }
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
}

// ======================
// MQTT Connection
// ======================
function initializeMQTT() {
  if (process.env.MQTT_ENABLED === 'true') {
    mqttClient.connect({
      host: process.env.MQTT_HOST,
      port: parseInt(process.env.MQTT_PORT),
      clientId: process.env.MQTT_CLIENT_ID,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      protocol: process.env.MQTT_PROTOCOL,
      qos: parseInt(process.env.MQTT_QOS),
      retain: process.env.MQTT_RETAIN === 'true'
    });
  }
}

// ======================
// Server Initialization
// ======================
async function startServer() {
  try {
    // Initialize services
    await initializeDatabase();
    initializeMQTT();

    // Reconcile any unbilled charging transactions from before crash/restart
    const { billUnbilledTransactions } = require('./services/billingService');
    billUnbilledTransactions().catch(err => logger.error('Billing reconciliation startup error:', err));

    // Start HTTP server
    server.listen(process.env.PORT, process.env.HOST, () => {
      logger.info(`HTTP server running on ${process.env.BASE_URL}`);
    });

    // Start OCPP WebSocket server
    const wsServer = http.createServer();
    ocppServer.init(wsServer, {
      path: process.env.OCPP_SERVER_PATH,
      supportedProtocols: process.env.OCPP_SUPPORTED_VERSIONS?.split(',')
    });

    wsServer.listen(process.env.OCPP_SERVER_PORT, process.env.OCPP_SERVER_HOST, () => {
      logger.info(`OCPP WebSocket server running on ws://${process.env.OCPP_SERVER_HOST}:${process.env.OCPP_SERVER_PORT}${process.env.OCPP_SERVER_PATH}`);
    });

    // Start wallet monitor (auto-stop sessions when wallet exhausted)
    const walletMonitor = require('./services/walletMonitor');
    walletMonitor.init(ocppServer);
    walletMonitor.start();

    // Start metrics server if enabled
    // if (process.env.METRICS_ENABLED === 'true') {
    //  const metricsServer = http.createServer();
    //  metricsServer.listen(process.env.METRICS_PORT, () => {
    //    logger.info(`Metrics server running on port ${process.env.METRICS_PORT}`);
    //  });
    // }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ======================
// Graceful Shutdown
// ======================
process.on('SIGINT', async () => {
  logger.info('Shutting down server gracefully...');
  
  try {
    await Promise.all([
      mqttClient.disconnect(),
      sequelize.close(),
      new Promise(resolve => server.close(resolve))
    ]);
    logger.info('Server shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();

module.exports = app;