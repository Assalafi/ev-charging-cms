/**
 * OCPP Connection Diagnostics Tool
 * 
 * This script diagnoses OCPP connection issues and attempts to fix them
 */

require('dotenv').config();
const { ChargingStation } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');
const WebSocket = require('ws');

async function checkConnections() {
  logger.info('==== OCPP Connection Diagnostics ====');
  
  // Check if the OCPP server is initialized
  const isInitialized = ocppServer._isInitialized ? ocppServer._isInitialized() : false;
  logger.info(`OCPP server initialized: ${isInitialized ? 'Yes' : 'No'}`);
  
  // Step 1: Check what stations the server thinks are connected
  const connectedStations = ocppServer.getConnectedStations ? ocppServer.getConnectedStations() : [];
  logger.info(`Number of connected stations: ${connectedStations.length}`);
  
  if (connectedStations.length > 0) {
    logger.info('Connected stations:');
    connectedStations.forEach(stationId => {
      logger.info(`- ${stationId}`);
    });
  } else {
    logger.warn('No stations are currently connected!');
  }
  
  try {
    // Get internal connection map
    const connectionMap = ocppServer._getConnectionsForDiagnostics ? ocppServer._getConnectionsForDiagnostics() : null;
    logger.debug(`Connection map size: ${connectionMap ? connectionMap.size : 0}`);
    logger.debug(`Connection map keys: ${connectionMap ? Array.from(connectionMap.keys()).join(', ') : ''}`);
    
    // Get connections directly from server
    const wss = ocppServer._getWebSocketServer ? ocppServer._getWebSocketServer() : null;
    if (wss) {
      const activeClients = wss.clients;
      logger.info(`WebSocket server active clients: ${activeClients ? activeClients.size : 0}`);
    
      // List all active clients
      if (activeClients && activeClients.size > 0) {
        let clientCount = 0;
        activeClients.forEach(client => {
          clientCount++;
          logger.info(`Client ${clientCount} - Ready state: ${client.readyState} (${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][client.readyState] || 'UNKNOWN'})`);
          logger.info(`  Station ID: ${client.chargePointId || 'unknown'}`);
          logger.info(`  Protocol: ${client.protocol || 'unknown'}`);
          logger.info(`  Is alive: ${client.isAlive || false}`);
        });
        
        // If there are no connected stations in the map but there are active WebSocket clients,
        // try to rebuild the connection map
        if ((!connectionMap || connectionMap.size === 0) && activeClients.size > 0) {
          logger.info('No connected stations in the map, but there are active WebSocket clients. Attempting to rebuild connection map...');
          try {
            if (ocppServer._rebuildConnectionMap) {
              const rebuiltCount = ocppServer._rebuildConnectionMap();
              logger.info(`Rebuilt ${rebuiltCount} connections from active WebSockets`);
            } else {
              logger.warn('_rebuildConnectionMap function not available');
              
              // Manual rebuild attempt if _rebuildConnectionMap is not available
              let manualRebuildCount = 0;
              activeClients.forEach(client => {
                if (client.chargePointId && client.readyState === WebSocket.OPEN) {
                  logger.info(`Manually rebuilding connection for ${client.chargePointId}`);
                  // Use the appropriate method to add to the map
                  if (typeof ocppServer._rebuildConnection === 'function') {
                    ocppServer._rebuildConnection(client.chargePointId, client);
                    manualRebuildCount++;
                  }
                }
              });
              
              if (manualRebuildCount > 0) {
                logger.info(`Manually rebuilt ${manualRebuildCount} connections`);
              }
            }
          } catch (error) {
            logger.error('Error rebuilding connection map:', error);
          }
        }
      }
    } else {
      logger.warn('WebSocket server not available or not initialized');
    }
  
    logger.info(`Internal connection map size: ${connectionMap ? connectionMap.size : 'undefined'}`);
  
    return {
      connectedStations,
      internalConnectionsSize: connectionMap ? connectionMap.size : 0
    };
  } catch (error) {
    logger.error('Error checking connections:', error);
    return {
      connectedStations,
      internalConnectionsSize: 0,
      error: error.message
    };
  }
}

// Function to manually fix connection mapping
async function fixConnectionMapping() {
  try {
    logger.info('==== OCPP Connection Fix ====');
    
    // Get all stations from the database
    const stations = await ChargingStation.findAll({
      attributes: ['chargePointId']
    });
    
    logger.info(`Found ${stations.length} stations in the database`);
    
    let fixedCount = 0;
    
    // Try to fix each station's connection
    for (const station of stations) {
      const stationId = station.chargePointId;
      const isConnected = ocppServer.isConnected(stationId);
      
      logger.info(`Station ${stationId}: ${isConnected ? 'Connected' : 'Disconnected'}`);
      
      if (!isConnected) {
        try {
          // Attempt to fix the connection
          const result = await ocppServer.fixConnectionMapping(stationId);
          
          if (result && result.fixed) {
            logger.info(`Fixed connection for ${stationId}: ${result.message}`);
            fixedCount++;
          } else {
            logger.warn(`Could not fix connection for ${stationId}: ${result ? result.message : 'Unknown error'}`);
          }
        } catch (error) {
          logger.error(`Error fixing connection for ${stationId}:`, error);
        }
      }
    }
    
    logger.info(`Connection fix attempt completed. Fixed ${fixedCount} stations.`);
    return fixedCount;
  } catch (error) {
    logger.error('Error fixing connections:', error);
    throw error;
  }
}

async function runDiagnostic() {
  logger.info('Starting OCPP diagnostics...');
  
  // Step 1: Check current connections
  const connectionInfo = await checkConnections();
  
  // Step 2: Attempt to fix connections if needed
  if (connectionInfo.connectedStations.length === 0 || 
      connectionInfo.connectedStations.length !== connectionInfo.internalConnectionsSize) {
    logger.warn('Connection issues detected, attempting to fix...');
    try {
      await fixConnectionMapping();
      // Check connections again after the fix attempt
      await checkConnections();
    } catch (error) {
      logger.error(`Diagnostic failed with error: ${error.message}`, error);
    }
  }
  
  // Step 3: Test a remote start transaction if requested
  if (process.argv.includes('--test-remote-start')) {
    const stationId = process.argv[process.argv.indexOf('--test-remote-start') + 1] || 'T001';
    const idTag = process.argv[process.argv.indexOf('--test-remote-start') + 2] || 'TAG001';
    
    logger.info(`Testing RemoteStartTransaction for station ${stationId} with tag ${idTag}...`);
    
    try {
      const result = await ocppServer.sendOcppRequest(stationId, 'RemoteStartTransaction', {
        idTag,
        connectorId: 1
      });
      
      if (result.success) {
        logger.info(`RemoteStartTransaction sent successfully! MessageID: ${result.messageId}`);
      } else {
        logger.error(`Failed to send RemoteStartTransaction: ${result.error}`);
      }
    } catch (error) {
      logger.error('Error testing RemoteStartTransaction:', error);
    }
  }
  
  logger.info('OCPP diagnostics completed');
}

// Run the diagnostic
runDiagnostic().catch(error => {
  logger.error('Diagnostic failed with error:', error);
});
