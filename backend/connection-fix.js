/**
 * OCPP Connection Fix Tool
 * 
 * This script diagnoses connection mapping issues between clients and the server
 * and attempts to repair the connection tracking by directly accessing the server state.
 */
require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');
const logger = require('./src/utils/logger');
const { ChargingStation } = require('./src/models');
const ocppServer = require('./src/ocpp/server');

// Diagnostic information
logger.info('======== OCPP Connection Fix Tool ========');

// Get connection state
const connectionMap = ocppServer._getConnectionsForDiagnostics();
const wss = ocppServer._getWebSocketServer();

logger.info(`Server is initialized: ${ocppServer._isInitialized() ? 'Yes' : 'No'}`);
logger.info(`Connection map available: ${connectionMap ? 'Yes' : 'No'}`);
logger.info(`Connection map size: ${connectionMap ? connectionMap.size : 'Unknown'}`);
logger.info(`WebSocket server available: ${wss ? 'Yes' : 'No'}`);

if (wss) {
  logger.info(`WebSocket server clients: ${wss.clients ? wss.clients.size : 0}`);
}

/**
 * Find connected clients that aren't in the connection map
 */
async function detectUnmappedConnections() {
  if (!wss || !wss.clients) {
    logger.error('Cannot access WebSocket server clients');
    return [];
  }
  
  logger.info(`Analyzing ${wss.clients.size} active WebSocket connections...`);
  
  const unmappedClients = [];
  
  wss.clients.forEach(client => {
    // Check if this client has chargePointId
    if (client.chargePointId) {
      logger.info(`Found client with chargePointId: ${client.chargePointId}`);
      
      // Check if this client is in the connection map
      const mappedConnection = connectionMap.get(client.chargePointId);
      
      if (!mappedConnection) {
        logger.warn(`Client ${client.chargePointId} is connected but not in the connection map!`);
        unmappedClients.push(client);
      } else {
        logger.info(`Client ${client.chargePointId} is properly mapped`);
      }
    } else {
      logger.info('Found client without chargePointId (likely in handshake)');
    }
  });
  
  return unmappedClients;
}

/**
 * Fix unmapped connections by adding them to the connection map
 */
async function fixUnmappedConnections(unmappedClients) {
  if (unmappedClients.length === 0) {
    logger.info('No unmapped connections to fix');
    return;
  }
  
  logger.info(`Fixing ${unmappedClients.length} unmapped connections...`);
  
  for (const client of unmappedClients) {
    const chargePointId = client.chargePointId;
    
    logger.info(`Adding ${chargePointId} to connection map...`);
    
    // Add to connection map
    connectionMap.set(chargePointId, client);
    
    // Verify it was added successfully
    const verifyConnection = connectionMap.get(chargePointId);
    
    if (verifyConnection) {
      logger.info(`✅ Successfully added ${chargePointId} to connection map`);
      
      // Update station status in database
      try {
        const station = await ChargingStation.findOne({
          where: { chargePointId }
        });
        
        if (station) {
          await station.update({
            status: 'Available',
            lastConnection: new Date()
          });
          logger.info(`Updated ${chargePointId} status in database to Available`);
        }
      } catch (error) {
        logger.error(`Error updating station status: ${error.message}`);
      }
    } else {
      logger.error(`❌ Failed to add ${chargePointId} to connection map`);
    }
  }
  
  logger.info(`Connection map size after fixes: ${connectionMap.size}`);
}

/**
 * Create a dummy connection to ensure the server is in a valid state
 */
async function createDummyConnection() {
  logger.info('Creating a dummy connection to ensure server state is valid...');
  
  try {
    // Create a simple HTTP server
    const server = http.createServer();
    const wss = new WebSocket.Server({ server });
    
    // Initialize on first connection
    wss.on('connection', (ws, req) => {
      logger.info('Dummy server received connection');
      ws.send('Hello from dummy server');
    });
    
    // Start listening on an unused port
    server.listen(0, () => {
      const port = server.address().port;
      logger.info(`Dummy server listening on port ${port}`);
    });
    
    // Create a client connection to our OCPP server
    const ws = new WebSocket('ws://localhost:8080/ocpp/DUMMY', ['ocpp1.6']);
    
    ws.on('open', () => {
      logger.info('Dummy client connected to OCPP server');
      
      // Close after 1 second
      setTimeout(() => {
        logger.info('Closing dummy connection');
        ws.close();
        server.close();
      }, 1000);
    });
    
    ws.on('message', (data) => {
      logger.info(`Received message from server: ${data}`);
    });
    
    ws.on('error', (error) => {
      logger.warn(`Dummy connection error: ${error.message}`);
    });
    
    ws.on('close', () => {
      logger.info('Dummy connection closed');
    });
    
    // Wait for 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    logger.error(`Error creating dummy connection: ${error.message}`);
  }
}

/**
 * Fix connections for specific station
 */
async function fixStationConnection(stationId) {
  logger.info(`Attempting to fix connection for station ${stationId}...`);
  
  // First, create a WebSocket connection
  try {
    const ws = new WebSocket(`ws://localhost:8080/ocpp/${stationId}`, ['ocpp1.6']);
    
    ws.on('open', () => {
      logger.info(`Successfully connected to server as ${stationId}`);
      
      // Send boot notification
      const bootNotification = [
        2, // Call
        `boot-${Date.now()}`,
        'BootNotification',
        {
          chargePointVendor: 'Fix Script',
          chargePointModel: 'Connection Fixer',
          chargePointSerialNumber: `FIX-${stationId}`
        }
      ];
      
      ws.send(JSON.stringify(bootNotification));
      logger.info(`Sent BootNotification for ${stationId}`);
      
      // Check if added to connection map after 1 second
      setTimeout(async () => {
        const mappedConnection = connectionMap.get(stationId);
        
        if (mappedConnection) {
          logger.info(`✅ ${stationId} is now in the connection map`);
        } else {
          logger.warn(`${stationId} still not in connection map, attempting direct add...`);
          
          // Try to add it directly
          connectionMap.set(stationId, ws);
          
          // Verify
          const verifyConnection = connectionMap.get(stationId);
          if (verifyConnection) {
            logger.info(`✅ Successfully added ${stationId} to connection map manually`);
          } else {
            logger.error(`❌ Failed to add ${stationId} to connection map manually`);
          }
        }
        
        // Close the connection after 2 more seconds
        setTimeout(() => {
          logger.info(`Closing connection for ${stationId}`);
          ws.close();
        }, 2000);
      }, 1000);
    });
    
    ws.on('message', (data) => {
      logger.info(`Received message from server: ${data}`);
    });
    
    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${stationId}: ${error.message}`);
    });
    
    ws.on('close', () => {
      logger.info(`Connection for ${stationId} closed`);
    });
    
    // Wait for 4 seconds total
    await new Promise(resolve => setTimeout(resolve, 4000));
    
  } catch (error) {
    logger.error(`Error fixing connection for ${stationId}: ${error.message}`);
  }
}

/**
 * Check the connection status of a station
 */
function isConnected(stationId) {
  const isConnected = ocppServer.isConnected(stationId);
  logger.info(`Connection status for ${stationId}: ${isConnected ? 'Connected' : 'Disconnected'}`);
  return isConnected;
}

/**
 * Direct rebuild of the connection map using the WebSocket server clients
 * This bypasses any module inconsistencies with the singleton pattern
 */
async function directRebuildConnectionMap() {
  if (!wss || !wss.clients) {
    logger.error('Cannot access WebSocket server clients');
    return false;
  }
  
  logger.info('Performing direct rebuild of connection map from WebSocket server clients...');
  
  // Clear the current connection map
  connectionMap.clear();
  
  // Track rebuild results
  let successCount = 0;
  let unknownCount = 0;
  
  // Process each WebSocket client
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      if (client.chargePointId) {
        // Add to connection map
        connectionMap.set(client.chargePointId, client);
        logger.info(`Added client ${client.chargePointId} to connection map`);
        successCount++;
        
        // Make sure all required properties are set
        client.isAlive = true;
        if (!client.protocol) {
          client.protocol = 'ocpp1.6';
        }
      } else {
        logger.warn('Found connected client without chargePointId');
        unknownCount++;
      }
    }
  });
  
  logger.info(`Rebuilt connection map with ${successCount} stations`);
  if (unknownCount > 0) {
    logger.warn(`Found ${unknownCount} connected clients without station IDs`);
  }
  
  // Export a global reference to make sure it's accessible across modules
  global.ocppConnectionMap = connectionMap;
  
  // Also create a proxy access method
  if (!global.getOcppConnection) {
    global.getOcppConnection = (stationId) => connectionMap.get(stationId);
    logger.info('Created global getOcppConnection accessor function');
  }
  
  return successCount > 0;
}

/**
 * Fix the server module's connection map
 */
async function fixConnectionMap() {
  try {
    // First try direct rebuild from WebSocket clients
    const directRebuildSuccess = await directRebuildConnectionMap();
    
    if (directRebuildSuccess) {
      logger.info('Successfully rebuilt connection map directly from WebSocket server clients');
    } else {
      // If direct rebuild fails, try the regular process
      logger.warn('Direct rebuild unsuccessful, trying alternative methods...');
      
      // Check for unmapped connections
      const unmappedClients = await detectUnmappedConnections();
      
      // Fix any unmapped connections
      await fixUnmappedConnections(unmappedClients);
      
      // If still no connections, create a dummy connection to ensure server state
      if (connectionMap.size === 0) {
        await createDummyConnection();
      }
    }
    
    // Check status of specific stations
    const t001Connected = isConnected('T001');
    logger.info(`T001 connection status: ${t001Connected ? 'Connected' : 'Disconnected'}`);
    
    const ta002Connected = isConnected('TA002');
    logger.info(`TA002 connection status: ${ta002Connected ? 'Connected' : 'Disconnected'}`);
    
    // Try to fix specific stations if needed
    if (!t001Connected && wss && wss.clients && wss.clients.size > 0) {
      await fixStationConnection('T001');
    }
    
    if (!ta002Connected && wss && wss.clients && wss.clients.size > 0) {
      await fixStationConnection('TA002');
    }
    
    // Final connection map status
    logger.info(`Final connection map size: ${connectionMap.size}`);
    logger.info(`Final connection map keys: ${Array.from(connectionMap.keys()).join(', ')}`);
    
  } catch (error) {
    logger.error(`Error in fix process: ${error.message}`);
  }
}

// Run the fix process
fixConnectionMap().then(() => {
  logger.info('======== Connection Fix Tool Complete ========');
}).catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
}).finally(() => {
  // Give time for logs to be written
  setTimeout(() => process.exit(0), 1000);
});
