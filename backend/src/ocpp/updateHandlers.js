/**
 * Script to update the main messageHandlers.js to use our new modular handlers
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Define the path to messageHandlers.js
const handlersPath = path.join(__dirname, 'src', 'ocpp', 'messageHandlers.js');

// Import our new handler modules at the top of the file
const importsToAdd = `
// Import modular handlers
const handleHeartbeat = require('./handlers/heartbeat');
const handleStartTransaction = require('./handlers/startTransaction');
const handleStopTransaction = require('./handlers/stopTransaction');
const handleRemoteStartTransaction = require('./handlers/remoteStartTransaction');
const handleRemoteStopTransaction = require('./handlers/remoteStopTransaction');
`;

// Read the current messageHandlers.js content
fs.readFile(handlersPath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err}`);
    return;
  }
  
  // Add imports after the existing requires
  let updatedContent = data.replace(
    /(const\s+(?:logger|sequelize|Transaction|ChargingStation|mqttClient|Model)\s*=\s*require\([^)]+\);[\s\n]*)+/,
    '$&' + importsToAdd
  );
  
  // Update the handleRequest switch case to use our modular handlers
  updatedContent = updatedContent.replace(
    /case 'Heartbeat':\s*return handleHeartbeat\([^)]+\);/,
    "case 'Heartbeat':\n            return handleHeartbeat(chargePointId, uniqueId);"
  );
  
  updatedContent = updatedContent.replace(
    /case 'StartTransaction':\s*return handleStartTransaction\([^)]+\);/,
    "case 'StartTransaction':\n            return handleStartTransaction(chargePointId, uniqueId, payload);"
  );
  
  updatedContent = updatedContent.replace(
    /case 'StopTransaction':\s*return handleStopTransaction\([^)]+\);/,
    "case 'StopTransaction':\n            return handleStopTransaction(chargePointId, uniqueId, payload);"
  );
  
  // For any WebSocket message handlers, also update them
  if (updatedContent.includes('handleRemoteStartTransaction')) {
    updatedContent = updatedContent.replace(
      /function\s+handleRemoteStartTransaction\s*\([^)]*\)\s*\{[\s\S]*?\}/,
      "function handleRemoteStartTransaction(ws, message) {\n  return require('./handlers/remoteStartTransaction')(ws, message);\n}"
    );
  }
  
  if (updatedContent.includes('handleRemoteStopTransaction')) {
    updatedContent = updatedContent.replace(
      /function\s+handleRemoteStopTransaction\s*\([^)]*\)\s*\{[\s\S]*?\}/,
      "function handleRemoteStopTransaction(ws, message) {\n  return require('./handlers/remoteStopTransaction')(ws, message);\n}"
    );
  }
  
  // Backup the original file
  fs.writeFileSync(handlersPath + '.backup', data);
  console.log('Created backup of original messageHandlers.js');
  
  // Write the updated content
  fs.writeFile(handlersPath, updatedContent, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error(`Error writing file: ${writeErr}`);
      return;
    }
    console.log('Successfully updated messageHandlers.js to use modular handlers');
  });
});
