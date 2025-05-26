/**
 * Direct diagnostic tool to fix OCPP WebSocket connection issues
 */
require('dotenv').config();
const WebSocket = require('ws');
const { ChargingStation } = require('./src/models');
const logger = require('./src/utils/logger');

// Get references to the OCPP server module
const ocppServerModule = require('./src/ocpp/server');
const connectionMap = ocppServerModule._getConnectionsForDiagnostics();
let wss = ocppServerModule._getWebSocketServer();

logger.info('======== OCPP Connection Repair Tool ========');
logger.info(`Server initialized: ${ocppServerModule._isInitialized ? 'Yes' : 'No'}`);
logger.info(`WebSocket server available: ${wss ? 'Yes' : 'No'}`);
logger.info(`Connection map available: ${connectionMap ? 'Yes' : 'No'}`);
logger.info(`Connection map size: ${connectionMap ? connectionMap.size : 'Unknown'}`);

// The WebSocket server is running (port 8080 is in use), but our module doesn't have a reference to it
// This is a special case that can happen when the server is started by another process
if (!wss) {
  logger.info('WebSocket server is running but not accessible through our module.');
  logger.info('This is normal if the server was started by another process.');
  logger.info('We will still be able to connect to it as a client.');
} else {
  logger.info(`WebSocket server active clients: ${wss.clients ? wss.clients.size : 0}`);
}

// List all charging stations from the database
async function listAllStations() {
  try {
    const stations = await ChargingStation.findAll({
      attributes: ['id', 'chargePointId', 'status', 'lastConnection']
    });
    
    logger.info(`Found ${stations.length} stations in the database:`);
    
    stations.forEach(station => {
      logger.info(`- ID: ${station.id}, ChargePointId: ${station.chargePointId}, Status: ${station.status}, Last Connection: ${station.lastConnection}`);
    });
    
    return stations;
  } catch (error) {
    logger.error('Error fetching stations:', error);
    return [];
  }
}

// Create a direct WebSocket connection to test connectivity
async function createTestConnection(stationId) {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`Attempting to create test connection for ${stationId}...`);
      
      const ws = new WebSocket(`ws://localhost:8080/ocpp/${stationId}`, ['ocpp1.6']);
      
      // Set a timeout in case the connection hangs
      const timeout = setTimeout(() => {
        logger.warn(`Connection timeout for ${stationId}`);
        ws.terminate();
        reject(new Error('Connection timeout'));
      }, 5000);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        logger.info(`✅ WebSocket connection established for ${stationId}`);
        
        // Send a BootNotification message
        const bootNotification = [
          2, // Message Type ID for CALL
          "boot-test-" + Date.now(),
          "BootNotification",
          {
            chargePointVendor: "Test Vendor",
            chargePointModel: "Test Model",
            chargePointSerialNumber: "TEST-SN",
            firmwareVersion: "1.0.0"
          }
        ];
        
        ws.send(JSON.stringify(bootNotification));
        logger.info(`Sent boot notification for ${stationId}`);
        
        // Check if the connection is properly tracked
        setTimeout(() => {
          const trackedConnection = connectionMap.get(stationId);
          
          if (trackedConnection) {
            logger.info(`✅ Connection is properly tracked for ${stationId}`);
            resolve(true);
          } else {
            logger.warn(`⚠️ Connection established but not tracked for ${stationId}`);
            
            // Try to manually add the connection to the server state
            logger.info(`Attempting to manually add connection for ${stationId}...`);
            
            // Use the rebuild connection function from the server module
            if (ocppServerModule._rebuildConnection) {
              // Set chargePointId property required by the server
              ws.chargePointId = stationId;
              ws.isAlive = true;
              
              const rebuildResult = ocppServerModule._rebuildConnection(stationId, ws);
              logger.info(`Rebuild connection result: ${rebuildResult}`);
            } else {
              logger.warn('_rebuildConnection function not available, trying direct set');
              // Manually add to the connection map as fallback
              connectionMap.set(stationId, ws);
            }
            
            logger.info(`Manual connection tracking attempted for ${stationId}`);
            logger.info(`Connection map size after manual addition: ${connectionMap.size}`);
            
            // Verify it worked
            const verifyTracked = connectionMap.get(stationId);
            if (verifyTracked) {
              logger.info(`✅ Connection successfully added manually for ${stationId}`);
              resolve(true);
            } else {
              logger.error(`❌ Failed to manually add connection for ${stationId}`);
              reject(new Error('Failed to manually add connection'));
            }
          }
        }, 1000);
      });
      
      ws.on('message', (data) => {
        logger.info(`Received message from server: ${data}`);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        logger.error(`WebSocket error for ${stationId}:`, error);
        reject(error);
      });
      
      ws.on('close', (code, reason) => {
        if (!timeout._destroyed) clearTimeout(timeout);
        logger.info(`WebSocket connection closed for ${stationId}: ${code} - ${reason || 'No reason'}`);
      });
    } catch (error) {
      logger.error(`Error creating test connection: ${error.message}`);
      reject(error);
    }
  });
}

// Test connection for specific station
async function testConnection(stationId) {
  try {
    await createTestConnection(stationId);
    return true;
  } catch (error) {
    logger.error(`Connection test failed for ${stationId}: ${error.message}`);
    return false;
  }
}

// Test transaction with station
async function testTransaction(stationId) {
  try {
    logger.info(`Testing RemoteStartTransaction for ${stationId}...`);
    
    // Verify connection first
    const isConnected = ocppServerModule.isConnected(stationId);
    logger.info(`Connection status before test: ${isConnected ? 'Connected' : 'Disconnected'}`);
    
    if (!isConnected) {
      logger.warn(`Station ${stationId} is not connected, cannot test transaction`);
      return false;
    }
    
    // Prepare transaction payload
    const payload = {
      connectorId: 1,
      idTag: 'TEST_TAG'
    };
    
    // Send remote start transaction request
    const response = await ocppServerModule.sendOcppRequest(stationId, 'RemoteStartTransaction', payload);
    
    logger.info(`RemoteStartTransaction response: ${JSON.stringify(response)}`);
    
    if (response && (response.success || response.status === 'Accepted')) {
      logger.info(`✅ RemoteStartTransaction successful for ${stationId}`);
      return true;
    } else {
      logger.warn(`⚠️ RemoteStartTransaction failed for ${stationId}: ${JSON.stringify(response)}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error testing transaction: ${error.message}`);
    return false;
  }
}

// Main function
async function main() {
  try {
    // List all stations
    const stations = await listAllStations();
    
    if (stations.length === 0) {
      logger.warn('No stations found in the database');
      return;
    }
    
    // Find station T001 specifically
    const targetStationId = 'T001';
    const testStation = stations.find(s => s.chargePointId === targetStationId);
    
    if (!testStation) {
      logger.warn(`Station ${targetStationId} not found in database`);  
      return;
    }
    
    const stationId = testStation.chargePointId;
    
    logger.info(`Selected station for testing: ${stationId}`);
    
    // Test connection
    const connectionSuccessful = await testConnection(stationId);
    
    if (connectionSuccessful) {
      // If connection was successful, test transaction
      await testTransaction(stationId);
    }
    
    logger.info('======== Repair Tool Complete ========');
  } catch (error) {
    logger.error('Error in main process:', error);
  }
}

// Run the main function
main().catch(error => {
  logger.error('Unhandled error in main process:', error);
  process.exit(1);
});
