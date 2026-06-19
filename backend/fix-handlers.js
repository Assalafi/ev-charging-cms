/**
 * Direct fix for messageHandlers.js to solve the StartTransaction issue
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Create the handlers directory if it doesn't exist
const handlersDir = path.join(__dirname, 'src', 'ocpp', 'handlers');
if (!fs.existsSync(handlersDir)) {
  fs.mkdirSync(handlersDir, { recursive: true });
  console.log(`Created directory: ${handlersDir}`);
}

// Define paths
const messageHandlersPath = path.join(__dirname, 'src', 'ocpp', 'messageHandlers.js');

// Fix the Heartbeat handler directly in messageHandlers.js
const fixHeartbeatHandler = (content) => {
  const heartbeatHandlerPattern = /async function handleHeartbeat\([^)]+\)\s*\{[\s\S]*?try\s*\{[\s\S]*?\/\/ Update last heartbeat time[^}]*sequelize\.query[\s\S]*?}catch\s*\([^)]+\)\s*\{[\s\S]*?}\s*\/\/ Publish[\s\S]*?return\s*\[[^\]]+\];\s*}\s*catch/;
  
  const fixedHeartbeatHandler = `async function handleHeartbeat(chargePointId, uniqueId) {
    try {
        logger.debug(\`Received Heartbeat from \${chargePointId}\`);

        // Update last seen time in the database using ChargingStation model
        try {
            const station = await ChargingStation.findOne({ 
                where: { chargePointId }
            });
            
            if (station) {
                await station.update({ 
                    lastSeen: new Date(),
                    status: 'Connected'
                });
            } else {
                await ChargingStation.create({
                    chargePointId,
                    status: 'Connected',
                    lastSeen: new Date()
                });
            }
        } catch (dbError) {
            logger.error(\`Database error during Heartbeat from \${chargePointId}:\`, dbError);
            // Continue even if DB update fails
        }

        // Publish heartbeat to MQTT
        mqttClient.publish(\`ocpp/\${chargePointId}/heartbeat\`, JSON.stringify({
            timestamp: new Date().toISOString()
        }));

        // Return standard heartbeat response as per OCPP 1.6
        return [3, uniqueId, {
            currentTime: new Date().toISOString()
        }];
    } catch`;
  
  return content.replace(heartbeatHandlerPattern, fixedHeartbeatHandler);
};

// Fix the StartTransaction handler directly in messageHandlers.js
const fixStartTransactionHandler = (content) => {
  const startTransactionHandlerPattern = /async function handleStartTransaction\([^)]+\)\s*\{[\s\S]*?try\s*\{[\s\S]*?\/\/ Normalize[\s\S]*?const normalizedPayload[\s\S]*?\/\/ Verify that the ID tag[\s\S]*?}/;
  
  const fixedStartTransactionHandler = `async function handleStartTransaction(chargePointId, uniqueId, payload) {
    try {
        logger.info(\`Processing StartTransaction from \${chargePointId}: \${JSON.stringify(payload)}\`);

        // Normalize the payload to handle different formats
        const normalizedPayload = {
            // Generate a transactionId if not provided
            transactionId: payload.transactionId || Math.floor(Math.random() * 1000000) + 1,
            connectorId: payload.connectorId || 1,
            idTag: payload.idTag,
            timestamp: payload.timestamp || new Date().toISOString(),
            meterStart: payload.meterStart || 0,
            reservationId: payload.reservationId
        };

        // Create a new transaction record using Sequelize model
        try {
            const transaction = await Transaction.create({
                transactionId: normalizedPayload.transactionId,
                chargePointId,
                connectorId: normalizedPayload.connectorId,
                idTag: normalizedPayload.idTag,
                startTime: new Date(normalizedPayload.timestamp),
                startMeterValue: normalizedPayload.meterStart,
                status: 'InProgress'
            });
            
            logger.info(\`Created transaction \${transaction.transactionId} for \${chargePointId}\`);
            
            // Publish transaction start to MQTT
            mqttClient.publish(\`ocpp/\${chargePointId}/transaction/start\`, JSON.stringify({
                ...normalizedPayload,
                timestamp: new Date().toISOString()
            }));

            // Return OCPP 1.6 compliant response
            return [3, uniqueId, {
                transactionId: normalizedPayload.transactionId,
                idTagInfo: {
                    status: 'Accepted'
                }
            }];
        } catch (dbError) {
            logger.error(\`Database error during StartTransaction from \${chargePointId}:\`, dbError);
            throw dbError; // Re-throw to be caught by outer try-catch
        }`;
  
  return content.replace(startTransactionHandlerPattern, fixedStartTransactionHandler);
};

// Read and fix the messageHandlers.js file
fs.readFile(messageHandlersPath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading file: ${err}`);
    return;
  }
  
  // Make a backup
  fs.writeFileSync(messageHandlersPath + '.bak', data);
  console.log(`Created backup at ${messageHandlersPath}.bak`);
  
  // Apply fixes
  let fixedContent = data;
  fixedContent = fixHeartbeatHandler(fixedContent);
  fixedContent = fixStartTransactionHandler(fixedContent);
  
  // Write the fixed content
  fs.writeFile(messageHandlersPath, fixedContent, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error(`Error writing file: ${writeErr}`);
      return;
    }
    console.log(`Successfully updated ${messageHandlersPath}`);
  });
});
