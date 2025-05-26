require('dotenv').config();
const { sequelize } = require('./src/models');
const ocppServer = require('./src/ocpp/server');
const logger = require('./src/utils/logger');

// Script to check which charging stations are connected
function checkConnections() {
  try {
    // Get the list of connected stations from the OCPP server
    const connectedStations = ocppServer.getConnectedStations ? 
      ocppServer.getConnectedStations() : 
      { error: "getConnectedStations method not available" };
    
    if (connectedStations.error) {
      console.log("Cannot get connected stations list directly.");
      console.log("Checking individual stations...");
      
      // Try specific stations
      const stations = ['TA002', 'T001'];
      stations.forEach(stationId => {
        const isConnected = ocppServer.isConnected(stationId);
        console.log(`Station ${stationId} connected: ${isConnected ? 'Yes' : 'No'}`);
      });
      
      console.log("\nIf your station is not listed above, try the following:");
      console.log("1. Make sure your simulator is running and connected to ws://localhost:8080");
      console.log("2. Check the OCPP server logs for connection messages");
      console.log("3. Try reconnecting your simulator");
    } else {
      console.log("Connected stations:");
      console.log(connectedStations);
    }
    
    console.log("\nChecking server status...");
    const serverInfo = {
      initialized: !!ocppServer.init,
      isConnected: !!ocppServer.isConnected,
      sendOcppRequest: !!ocppServer.sendOcppRequest
    };
    console.log(serverInfo);
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking connections:', error);
    process.exit(1);
  }
}

// Run the check
checkConnections();
