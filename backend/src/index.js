const express = require('express');
const http = require('http');
const cors = require('cors');
const { sequelize } = require('./models');
const logger = require('./utils/logger');
const routes = require('./routes');
const ocppServer = require('./ocpp/server');
const mqttClient = require('./mqtt/client');

// Load configuration
const config = require('../../config/backend').backend;

// Debug configuration
logger.info('Configuration loaded:', {
  http: config.http,
  websocket: config.websocket,
  database: config.database
});

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use('/public', express.static(config.static.publicDir));
app.use(express.static(config.static.publicDir));

// API routes
app.use(config.http.apiPrefix, routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OCPP WebSocket server will be initialized in startServer()

// Connect to MQTT broker if enabled
if (config.mqtt.enabled) {
  mqttClient.connect(config.mqtt.broker, config.mqtt.options);
} else {
  logger.info('MQTT is disabled by configuration');
}

// Get port configuration
const PORT = config.http.port;
const WS_PORT = config.websocket.port;

async function startServer() {
  try {
    // Connect to database and sync models
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync database with configured options
    await sequelize.sync(config.database.sync);
    logger.info('Database models synchronized');
    
    // Start HTTP server for REST API
    server.listen(PORT, config.http.host, () => {
      logger.info(`HTTP server running on ${config.http.baseUrl}`);
    });
    
    // Start dedicated WebSocket server for OCPP
    // This is the single source of truth for OCPP connections
    const wsServer = http.createServer();
    
    // Initialize the OCPP server with this dedicated WebSocket server
    ocppServer.init(wsServer, { path: config.websocket.path });
    
    // Start listening on the WebSocket port
    const wsHost = config.websocket.host || 'localhost';
    wsServer.listen(WS_PORT, wsHost, () => {
      logger.info(`OCPP WebSocket server running on ws://${wsHost}:${WS_PORT}${config.websocket.path}`);
      logger.info(`OCPP server initialized successfully: ${ocppServer._isInitialized() ? 'Yes' : 'No'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server...');
  await mqttClient.disconnect();
  await sequelize.close();
  process.exit(0);
});

// Export app for testing
module.exports = app;
