const express = require('express');
const http = require('http');
const cors = require('cors');
const { sequelize } = require('./models');
const logger = require('./utils/logger');
const routes = require('./routes');
const ocppServer = require('./ocpp/server');
const mqttClient = require('./mqtt/client');

// Create Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use('/public', express.static('public'));
app.use(express.static('public'));

// API routes
app.use('/api', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OCPP WebSocket server will be initialized in startServer()

// Connect to MQTT broker if enabled
if (process.env.MQTT_ENABLED !== 'false') {
  mqttClient.connect();
} else {
  logger.info('MQTT is disabled by configuration');
}

// Database connection and server start
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;

async function startServer() {
  try {
    // Connect to database and sync models
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Temporarily disable schema alteration to avoid enum casting issues
    await sequelize.sync({ alter: false });
    logger.info('Database models synchronized (without schema alterations)');
    
    // Start HTTP server for REST API
    server.listen(PORT, () => {
      logger.info(`HTTP server running on port ${PORT}`);
    });
    
    // Start dedicated WebSocket server for OCPP
    // This is the single source of truth for OCPP connections
    const wsServer = http.createServer();
    
    // Initialize the OCPP server with this dedicated WebSocket server
    ocppServer.init(wsServer);
    
    // Start listening on the WebSocket port
    wsServer.listen(WS_PORT, () => {
      logger.info(`OCPP WebSocket server running on port ${WS_PORT}`);
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
