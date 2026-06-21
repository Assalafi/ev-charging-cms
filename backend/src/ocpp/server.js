const WebSocket = require('ws');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { ChargingStation, OcppMessage } = require('../models');
const mqttClient = require('../mqtt/client');
const messageHandlers = require('./messageHandlers');
const config = require('../../../config/backend').backend;
const fs = require('fs');
const https = require('https');
const http = require('http');

// Using global singleton pattern to ensure all imports share the same state
let instance = null;

// Create server state object
function createServerState() {
    return {
        // Map of connected charging stations: chargePointId -> WebSocket
        connectedStations: new Map(),
        
        // WebSocket server instance
        wss: null,
        
        // Define supported protocols from config
        SUPPORTED_PROTOCOLS: config.ocpp.supportedVersions || ['ocpp1.6', 'ocpp1.5', 'ocpp2.0.1'],
        
        // Track connection numbers for diagnostics
        connectionCount: 0,
        
        // Whether the server has been initialized
        initialized: false,
        
        // Initialization timestamp
        initTime: null,
        
        // Timers for offline auto-stop (chargePointId -> timeoutId)
        disconnectTimers: new Map(),
        
        // OCPP Configuration
        heartbeatInterval: config.ocpp.heartbeatInterval,
        meterValueSampleInterval: config.ocpp.meterValueSampleInterval,
        defaultConnectorTimeout: config.ocpp.defaultConnectorTimeout
    };
}

// Get the singleton instance
function getInstance() {
    if (!instance) {
        instance = createServerState();
    }
    return instance;
}

// Get the server state for shorter access
const serverState = getInstance();

/**
 * Initialize OCPP WebSocket server
 * @param {http.Server} server - HTTP server to attach WebSocket server to
 */
function init(server) {
    // Don't reinitialize if already initialized
    if (serverState.initialized) {
        logger.info('OCPP WebSocket server already initialized');
        return;
    }
    
    // We'll set the initialized flag at the end of this method

    // Create WebSocket server with no protocol handling
    // We'll handle protocols manually in the connection event
    serverState.wss = new WebSocket.Server({
        noServer: true,
        // Very important: maxPayload must be high enough for OCPP messages
        maxPayload: config.ocpp.maxPayloadSize || 5 * 1024 * 1024, // Default to 5MB
        // Add permissive settings to prevent abnormal closures
        perMessageDeflate: {
            zlibDeflateOptions: {
                chunkSize: 1024,
                memLevel: 7,
                level: 3
            },
            zlibInflateOptions: {
                chunkSize: 10 * 1024
            },
            // Below options specified as default values
            clientNoContextTakeover: true,
            serverNoContextTakeover: true,
            serverMaxWindowBits: 10,
            concurrencyLimit: 10,
            threshold: 1024 // Size below which messages won't be compressed
        }
    });

    // Manual protocol handling via the HTTP server upgrade event
    server.on('upgrade', (request, socket, head) => {
        // Extract station ID from URL
        const parsedUrl = url.parse(request.url, true);
        const pathname = parsedUrl.pathname || '';
        
        // Check if the request matches our expected path pattern
        // Support both direct station IDs and paths with prefixes
        let chargePointId = null;
        
        // Check if request path starts with our configured path
        if (config.ocpp.path !== '/' && pathname.startsWith(config.ocpp.path)) {
            // Extract ID from path: /ocpp/T001 -> T001
            chargePointId = pathname.substring(config.ocpp.path.length).split('/').filter(p => p).shift();
        } else {
            // Legacy behavior: /T001 -> T001
            chargePointId = pathname.split('/').pop();
        }
        
        if (!chargePointId) {
            logger.error('No charge point ID provided in WebSocket connection');
            socket.destroy();
            return;
        }

        // Get the requested protocols
        const protocols = request.headers['sec-websocket-protocol'];
        let protocol = null;

        if (protocols) {
            // Parse the protocol header (multiple protocols are comma-separated)
            const requestedProtocols = protocols.split(',').map(p => p.trim());

            // Find the first supported protocol
            for (const reqProtocol of requestedProtocols) {
                if (serverState.SUPPORTED_PROTOCOLS.includes(reqProtocol)) {
                    protocol = reqProtocol;
                    break;
                }
            }

            logger.debug(`Client requested protocols: ${requestedProtocols.join(', ')}`);
            logger.info(`Selected protocol: ${protocol || 'none'}`);
        }
        
        // Get connection security information for logging
        const isSecure = request.connection.encrypted || request.headers['x-forwarded-proto'] === 'https';
        const protocolType = isSecure ? 'wss' : 'ws';
        
        logger.info(`${protocolType} connection from ${chargePointId} with OCPP protocol: ${protocol || 'none'}`);

        // Perform WebSocket upgrade with the selected protocol
        serverState.wss.handleUpgrade(request, socket, head, (ws) => {
            // Store chargePointId on the WebSocket connection
            ws.chargePointId = chargePointId;
            ws.protocol = protocol;
            ws.isSecure = isSecure;
            
            // Set isAlive flag for heartbeat checks
            ws.isAlive = true;
            ws.connectionStartTime = Date.now(); // Track when connection started
            ws.missedHeartbeats = 0; // Initialize missed heartbeats counter
            
            // Cancel any pending offline auto-stop timer (station came back)
            if (serverState.disconnectTimers.has(chargePointId)) {
                clearTimeout(serverState.disconnectTimers.get(chargePointId));
                serverState.disconnectTimers.delete(chargePointId);
                logger.info(`Station ${chargePointId} reconnected — cancelled offline auto-stop timer`);
            }
            
            // Immediately add to connection map
            serverState.connectedStations.set(chargePointId, ws);
            logger.info(`Added ${chargePointId} to connection map on upgrade, map size: ${serverState.connectedStations.size}`);
            logger.debug(`Connection started at ${new Date().toISOString()} for ${chargePointId}`);
            
            // Emit the connection event with the protocol information
            serverState.wss.emit('connection', ws, request, protocol);
        });
    });

    // Set up heartbeat mechanism to detect dead connections with increased tolerance
    const heartbeatInterval = setInterval(() => {
        if (!serverState.wss || !serverState.wss.clients) {
            logger.warn('WebSocket server not available for heartbeat check');
            return;
        }
        
        // Log the number of active connections for monitoring
        logger.debug(`Heartbeat check: ${serverState.wss.clients.size} active connections`);
        
        serverState.wss.clients.forEach((ws) => {
            // Only check connections that have been established for more than 1 minute
            // This prevents new connections from being terminated too quickly
            const connectionAge = ws.connectionStartTime ? (Date.now() - ws.connectionStartTime) / 1000 : 0;
            
            // More tolerant connection checking - only terminate after 3 missed heartbeats
            if (ws.missedHeartbeats >= 3 && connectionAge > 60) {
                logger.warn(`Terminating inactive connection for ${ws.chargePointId || 'unknown station'} after missing ${ws.missedHeartbeats} heartbeats`);
                if (ws.chargePointId) {
                    serverState.connectedStations.delete(ws.chargePointId);
                    logger.info(`Removed ${ws.chargePointId} from connection map due to inactivity`);
                }
                return ws.terminate();
            }

            if (ws.isAlive === false) {
                // Increment missed heartbeat counter
                ws.missedHeartbeats = (ws.missedHeartbeats || 0) + 1;
                logger.debug(`${ws.chargePointId || 'Unknown station'} missed ${ws.missedHeartbeats} heartbeat(s)`);
            } else {
                // Reset counter if connection is alive
                ws.missedHeartbeats = 0;
            }

            // Mark as not alive until we get a pong response or heartbeat
            ws.isAlive = false;
            
            try {
                ws.ping(() => {});
                logger.debug(`Sent ping to ${ws.chargePointId || 'unknown station'}`);
            } catch (err) {
                logger.error(`Error sending ping to ${ws.chargePointId || 'unknown station'}:`, err);
            }
        });
    }, 45000); // Increased from 30s to 45s to provide more margin

    // Clear interval when server closes
    serverState.wss.on('close', () => {
        clearInterval(heartbeatInterval);
        logger.info('WebSocket server closed, heartbeat stopped');
        serverState.initialized = false;
    });
    
    // Set initialized flag and timestamp
    serverState.initialized = true;
    serverState.initTime = new Date();
    logger.info('OCPP WebSocket server initialized successfully');

    // Handle new WebSocket connections
    serverState.wss.on('connection', (ws, request, protocol) => {
        try {
            // Extract station ID from URL - this should already be stored on ws.chargePointId
            const chargePointId = ws.chargePointId;
            
            // Security protocol used (ws/wss)
            const protocolType = ws.isSecure ? 'wss' : 'ws';
            
            // Log full URL for diagnostic purposes
            logger.info(`New ${protocolType} connection: ${request.url}`);
            
            // Validate station ID
            if (!chargePointId || chargePointId === '') {
                logger.error('Invalid charge point ID in WebSocket connection');
                ws.close(4000, 'Invalid charge point ID');
                return;
            }
            
            logger.info(`WebSocket connection from charge point: ${chargePointId} with protocol: ${protocol || 'none'}`);

            // Set custom properties on the WebSocket object
            ws.isAlive = true;
            ws.chargePointId = chargePointId;
            ws.protocol = protocol;
            
            // Store connection ID for logging
            ws.connectionId = ++serverState.connectionCount;

            // Store the connection - CRITICAL for remote commands to work
            logger.info(`Storing connection for ${chargePointId} with connection ID: ${ws.connectionId}`);
            serverState.connectedStations.set(chargePointId, ws);
            
            // Debug log the current connections
            logger.info(`Current connections: ${Array.from(serverState.connectedStations.keys()).join(', ')}`);

            // Set up WebSocket event handlers
            // Ping handler for WebSocket
            ws.on('pong', () => {
                ws.isAlive = true;
                logger.debug(`Received pong from ${ws.chargePointId}`);
            });
            
            // Handle close event
            ws.on('close', (code, reason) => {
                logger.info(`WebSocket connection closed for ${ws.chargePointId}: ${code} - ${reason}`);
                // Remove from connected stations map
                if (ws.chargePointId && serverState.connectedStations.get(ws.chargePointId) === ws) {
                    serverState.connectedStations.delete(ws.chargePointId);
                    logger.info(`Removed ${ws.chargePointId} from connected stations map`);
                    logger.info(`Remaining connections: ${Array.from(serverState.connectedStations.keys()).join(', ')}`);
                }
            });
            
            // Handle error event
            ws.on('error', (error) => {
                logger.error(`WebSocket error for ${ws.chargePointId}:`, error);
            });

            // Update station connection status in database
            updateStationConnectionStatus(chargePointId, true, request.headers['x-forwarded-for'] ||
                request.connection.remoteAddress ||
                request.socket.remoteAddress);

            // Subscribe to MQTT commands for this station if MQTT is enabled
            if (process.env.MQTT_ENABLED !== 'false') {
                mqttClient.subscribe(`cms/commands/${chargePointId}/#`, async (topic, message) => {
                    try {
                        const command = topic.split('/')[2]; // Extract command type
                        const payload = JSON.parse(message);

                        await sendOcppRequest(chargePointId, command, payload);
                    } catch (error) {
                        logger.error(`Error handling MQTT command for ${chargePointId}:`, error);
                    }
                });
            }

            // Add extra event handlers for connection issues
            ws.on('error', (error) => {
                logger.error(`WebSocket error for ${chargePointId}:`, error);
                // Don't immediately close on error - let the heartbeat mechanism do its job
            });

            ws.on('close', (code, reason) => {
                logger.info(`WebSocket connection closed for ${chargePointId}: code ${code}, reason: ${reason || 'No reason provided'}`);
                // Only clean up if THIS ws is still the active connection (not a stale close)
                const currentWs = serverState.connectedStations.get(chargePointId);
                if (currentWs && currentWs !== ws) {
                    logger.info(`Stale close event for ${chargePointId} (already reconnected), ignoring`);
                    return;
                }
                serverState.connectedStations.delete(chargePointId);
                updateStationConnectionStatus(chargePointId, false).catch(err => {
                    logger.error(`Error updating connection status for ${chargePointId}:`, err);
                });
            });

            // Respond to pongs (part of heartbeat mechanism)
            ws.on('pong', () => {
                logger.debug(`Received pong from ${chargePointId}`);
                ws.isAlive = true; // Mark as alive when pong received
                ws.missedHeartbeats = 0; // Reset missed heartbeat counter
                
                // Send acknowledgement heartbeat message to help keep connection alive
                try {
                    // Send a small ping to acknowledge the pong (helps some clients)
                    ws.ping(() => {});
                } catch (err) {
                    logger.error(`Error sending ping acknowledgment to ${chargePointId}:`, err);
                }
            });

            // Handle pings to keep connection alive
            ws.on('ping', () => {
                logger.debug(`Received ping from ${chargePointId}`);
                ws.isAlive = true; // Mark as alive when ping received
                try {
                    ws.pong();
                } catch (err) {
                    logger.error(`Error sending pong to ${chargePointId}:`, err);
                }
            });

            // Handle messages from charging station
            ws.on('message', async (message) => {
                // Any message from the client indicates the connection is alive
                ws.isAlive = true;
                ws.missedHeartbeats = 0; // Reset missed heartbeat counter
                
                // Ensure station is in connection map (handles race conditions on restart)
                if (!serverState.connectedStations.has(chargePointId) || serverState.connectedStations.get(chargePointId) !== ws) {
                    serverState.connectedStations.set(chargePointId, ws);
                    logger.info(`Re-added ${chargePointId} to connection map via message handler (was missing)`);
                }
                
                try {
                    // Log the raw message for debugging
                    logger.info(`RAW MESSAGE from ${chargePointId}: ${message.toString()}`);

                    // Parse message
                    const data = JSON.parse(message);
                    
                    // Keep connection alive (reset the connection check timer) on any OCPP message
                    ws.isAlive = true;
                    ws.missedHeartbeats = 0;

                    logger.debug(`Received from ${chargePointId}:`);

                    // Enhanced special logging for important messages
                    if (data[2] === 'StartTransaction') {
                        logger.info(`!!! START TRANSACTION DETECTED from ${chargePointId} !!!`);
                        logger.info(`TRANSACTION DETAILS: ${JSON.stringify(data, null, 2)}`);
                        
                        // Log the idTag specifically for debugging authorization issues
                        const payload = data[3] || {};
                        logger.info(`TRANSACTION ID TAG: ${payload.idTag || 'NOT PROVIDED'}`);
                        logger.info(`TRANSACTION METER START: ${payload.meterStart || '0'}`);
                        
                        // Try to trace the full message processing flow
                        logger.info('Beginning transaction processing flow... will log each step');
                    }

                    // For T001 specifically, log even more details
                    if (chargePointId === 'T001') {
                        logger.info(`T001 MESSAGE DETAILS: ${JSON.stringify(data, null, 2)}`);
                    }

                    // Process the message and store in database
                    await handleOcppMessage(chargePointId, data, ws);

                    // Publish to MQTT for real-time updates if MQTT is enabled
                    if (process.env.MQTT_ENABLED !== 'false') {
                        mqttClient.publish(`ocpp/${chargePointId}/message`, JSON.stringify({
                            ...data,
                            timestamp: new Date().toISOString()
                        }));
                    }
                } catch (error) {
                    logger.error(`Error processing message from ${chargePointId}:`, error);

                    // Send error response if possible
                    if (error.messageId) {
                        ws.send(JSON.stringify([4, error.messageId, "FormationViolation", "Invalid message format", {}]));
                    }
                }
            });

            // Handle disconnection
            ws.on('close', async () => {
                logger.info(`Charging station disconnected: ${chargePointId}`);
                // Only process if THIS ws is still the active connection (not a stale close)
                const currentWs = serverState.connectedStations.get(chargePointId);
                if (currentWs && currentWs !== ws) {
                    logger.info(`Stale close event for ${chargePointId} (already reconnected), ignoring disconnect handler`);
                    return;
                }
                serverState.connectedStations.delete(chargePointId);

                // Update station connection status
                await updateStationConnectionStatus(chargePointId, false);

                // Publish disconnection event if MQTT is enabled
                if (process.env.MQTT_ENABLED !== 'false') {
                    mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
                        status: 'Disconnected',
                        timestamp: new Date().toISOString()
                    }));
                }

                // Start 2-minute offline auto-stop timer
                // Give charger time to reconnect before completing transactions
                // The charger will send the real StopTransaction with correct meterStop on reconnect
                if (!serverState.disconnectTimers.has(chargePointId)) {
                    logger.info(`Starting 120s offline auto-stop timer for ${chargePointId}`);
                    const timer = setTimeout(async () => {
                        serverState.disconnectTimers.delete(chargePointId);
                        // Check if station is still offline
                        if (isConnected(chargePointId)) {
                            logger.info(`Station ${chargePointId} is back online — skipping auto-stop`);
                            return;
                        }
                        logger.warn(`Station ${chargePointId} offline for 120s — auto-completing active transactions`);
                        try {
                            const { Transaction, ChargingStation, Connector, sequelize } = require('../models');

                            // Get location pricing
                            let pricePerWh = 0.4;
                            let minimumCharge = 150;
                            try {
                                const [rows] = await sequelize.query(
                                    `SELECT l."pricePerWh", l."minimumCharge" FROM locations l 
                                     JOIN charging_stations cs ON cs."locationId" = l.id 
                                     WHERE cs."chargePointId" = $1 LIMIT 1`,
                                    { bind: [chargePointId] }
                                );
                                if (rows.length > 0) {
                                    if (rows[0].pricePerWh != null) pricePerWh = parseFloat(rows[0].pricePerWh);
                                    if (rows[0].minimumCharge != null) minimumCharge = parseFloat(rows[0].minimumCharge);
                                }
                            } catch (priceErr) {
                                logger.warn(`Could not fetch location pricing for ${chargePointId}: ${priceErr.message}`);
                            }

                            const activeTxs = await Transaction.findAll({
                                where: { chargePointId, status: 'InProgress' }
                            });
                            for (const tx of activeTxs) {
                                // Calculate amount: energy-based if kWh > 0, otherwise minimum charge
                                let txAmount = parseFloat(tx.amount);
                                if (!(txAmount > 0)) {
                                    const energy = parseFloat(tx.energyDelivered) || 0;
                                    if (energy > 0) {
                                        const energyKwh = energy / 1000;
                                        const ratePerKwh = pricePerWh * 1000;
                                        txAmount = energyKwh * ratePerKwh;
                                    }
                                    txAmount = Math.max(txAmount || 0, minimumCharge);
                                }
                                // Mark as completed but DO NOT bill yet — defer billing 60s
                                // to allow the charger to reconnect and send StopTransaction with real meterStop
                                await tx.update({ status: 'Completed', stopTime: new Date(), amount: txAmount });
                                logger.warn(`Auto-completed transaction ${tx.transactionId} (station ${chargePointId} offline) — amount: ₦${txAmount} (billing deferred 60s)`);
                                
                                // Defer billing to give charger time to send real StopTransaction
                                const txId = tx.transactionId;
                                setTimeout(async () => {
                                    try {
                                        const { billTransaction } = require('../services/billingService');
                                        const freshTx = await Transaction.findOne({ where: { transactionId: txId } });
                                        if (freshTx && !freshTx.billedAt) {
                                            await billTransaction(txId);
                                            logger.info(`Deferred billing completed for offline tx ${txId}`);
                                        } else {
                                            logger.info(`Deferred billing skipped for tx ${txId} (already billed or reconciled)`);
                                        }
                                    } catch (billErr) {
                                        logger.warn(`Deferred billing failed for offline tx ${txId}: ${billErr.message}`);
                                    }
                                }, 60000);
                            }
                            // Update connectors to Available
                            await Connector.update(
                                { status: 'Available', transactionId: null },
                                { where: { chargePointId } }
                            );
                        } catch (err) {
                            logger.error(`Error in offline auto-stop for ${chargePointId}: ${err.message}`);
                        }
                    }, 120000);
                    serverState.disconnectTimers.set(chargePointId, timer);
                }
            });

            // Handle WebSocket errors
            ws.on('error', async (error) => {
                logger.error(`WebSocket error for ${chargePointId}:`, error);

                // Clean up on error
                serverState.connectedStations.delete(chargePointId);
                await updateStationConnectionStatus(chargePointId, false);
            });

            // Publish connection event
            mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
                status: 'Connected',
                timestamp: new Date().toISOString(),
                protocol: protocolType
            }));

        } catch (error) {
            logger.error('WebSocket connection error:', error);
            ws.close(1011, 'Internal server error');
        }
    });

    return serverState.wss;
}

/**
 * Update charging station connection status in database
 */
async function updateStationConnectionStatus(chargePointId, isConnected, ipAddress = null) {
    try {
        const updateData = {
            lastConnection: new Date(),
        };
        // Only set status to Available on connect; don't immediately set Unavailable on disconnect
        // The station may reconnect quickly (e.g. after StopTransaction reboot)
        // The 2-minute offline timer handles real disconnects
        if (isConnected) {
            updateData.lastHeartbeat = new Date(); // Treat connection as a heartbeat for fallback checks
        }

        if (ipAddress) {
            updateData.ipAddress = ipAddress;
        }

        // Check if station exists in database
        const station = await ChargingStation.findOne({
            where: {
                chargePointId
            }
        });

        if (station) {
            // Update existing station
            await station.update(updateData);
        } else if (isConnected) {
            // Create new station record if connected
            await ChargingStation.create({
                chargePointId,
                name: `Station ${chargePointId}`,
                ...updateData
            });
        }
    } catch (error) {
        logger.error(`Error updating connection status for ${chargePointId}:`, error);
    }
}

/**
 * Handle an OCPP message from a charging station
 * Supports both standard OCPP message format and direct payload objects
 */
async function handleOcppMessage(chargePointId, data, ws) {
    try {
        // Case 1: Handle standard OCPP message format [MessageTypeId, UniqueId, Action, Payload]
        if (Array.isArray(data) && data.length >= 3) {
            try {
                // Look up the charging station to get its ID
                const station = await ChargingStation.findOne({
                    where: {
                        chargePointId
                    }
                });
                if (!station) {
                    logger.error(`Cannot log message: Station ${chargePointId} not found in database`);
                    return;
                }

                const messageTypeId = data[0];
                const uniqueId = data[1];
                const action = data[2];
                const payload = data[3] || {};

                // Process based on message type
                switch (messageTypeId) {
                    case 2: // Request from charging station
                        // Log the incoming request
                        await OcppMessage.create({
                            messageId: uniqueId,
                            chargePointId: chargePointId,
                            message_type: action,
                            status: 'Received',
                            payload: JSON.stringify(payload),
                            direction: 'Inbound',
                            timestamp: new Date()
                        });

                        // Process the request
                        const response = await messageHandlers.handleRequest(chargePointId, action, uniqueId, payload);

                        // Send response back to charging station
                        if (response) {
                            ws.send(JSON.stringify(response));

                            // Log the response
                            await OcppMessage.create({
                                messageId: uniqueId,
                                chargePointId: chargePointId,
                                message_type: action,
                                status: 'Sent',
                                payload: JSON.stringify(response[2] || {}),
                                direction: 'Outbound',
                                timestamp: new Date()
                            });
                        }
                        break;

                    case 3: // Response to our request
                        // Log the response
                        await OcppMessage.create({
                            messageId: uniqueId,
                            chargePointId: chargePointId,
                            message_type: 'Response',
                            status: 'Received',
                            payload: JSON.stringify(data[2] || {}),
                            direction: 'Inbound',
                            timestamp: new Date()
                        });

                        // Handle rejected RemoteStopTransaction — auto-complete in backend
                        if (data[2] && data[2].status === 'Rejected') {
                            try {
                                // Find the original outbound request to check if it was a RemoteStopTransaction
                                const originalMsg = await OcppMessage.findOne({
                                    where: { messageId: uniqueId, chargePointId, direction: 'Outbound', message_type: 'RemoteStopTransaction' }
                                });
                                if (originalMsg) {
                                    const originalPayload = JSON.parse(originalMsg.payload || '{}');
                                    const rejectedTxId = originalPayload.transactionId;
                                    logger.warn(`RemoteStopTransaction rejected by ${chargePointId} for tx ${rejectedTxId} — forcing completion in backend`);
                                    
                                    const { Transaction, Connector, sequelize } = require('../models');
                                    const { billTransaction } = require('../services/billingService');
                                    
                                    const tx = await Transaction.findOne({ where: { transactionId: rejectedTxId, status: 'InProgress' } });
                                    if (tx) {
                                        // Get location pricing for amount calculation
                                        let pricePerWh = 0.4, minimumCharge = 150;
                                        try {
                                            const [rows] = await sequelize.query(
                                                `SELECT l."pricePerWh", l."minimumCharge" FROM locations l 
                                                 JOIN charging_stations cs ON cs."locationId" = l.id 
                                                 WHERE cs."chargePointId" = $1 LIMIT 1`,
                                                { bind: [chargePointId] }
                                            );
                                            if (rows.length > 0) {
                                                if (rows[0].pricePerWh != null) pricePerWh = parseFloat(rows[0].pricePerWh);
                                                if (rows[0].minimumCharge != null) minimumCharge = parseFloat(rows[0].minimumCharge);
                                            }
                                        } catch (_) {}
                                        
                                        let txAmount = parseFloat(tx.amount);
                                        if (!(txAmount > 0)) {
                                            const energy = parseFloat(tx.energyDelivered) || 0;
                                            if (energy > 0) {
                                                const energyKwh = energy / 1000;
                                                txAmount = energyKwh * pricePerWh * 1000;
                                            }
                                            txAmount = Math.max(txAmount || 0, minimumCharge);
                                        }
                                        
                                        await tx.update({ status: 'Completed', stopTime: new Date(), amount: txAmount });
                                        logger.warn(`Force-completed tx ${rejectedTxId} (charger rejected stop) — amount: ₦${txAmount}`);
                                        
                                        try { await billTransaction(rejectedTxId); } catch (e) {
                                            logger.warn(`Failed to bill force-completed tx ${rejectedTxId}: ${e.message}`);
                                        }
                                        
                                        // Reset connector
                                        await Connector.update(
                                            { status: 'Available', transactionId: null },
                                            { where: { chargePointId, connectorId: tx.connectorId } }
                                        );
                                    }
                                }
                            } catch (rejectErr) {
                                logger.error(`Error handling rejected RemoteStop for ${chargePointId}: ${rejectErr.message}`);
                            }
                        }

                        // Publish response to MQTT
                        mqttClient.publish(`ocpp/${chargePointId}/response/${uniqueId}`, JSON.stringify(data[2] || {}));
                        break;

                    case 4: // Error response
                        logger.error(`Error from ${chargePointId}:`, data);
                        await OcppMessage.create({
                            messageId: uniqueId,
                            chargePointId: chargePointId,
                            message_type: 'Error',
                            status: 'Failed',
                            payload: JSON.stringify({
                                error: data[2],
                                description: data[3]
                            }),
                            direction: 'Inbound',
                            timestamp: new Date()
                        });

                        // Publish error to MQTT
                        mqttClient.publish(`ocpp/${chargePointId}/error/${uniqueId}`, JSON.stringify({
                            error: data[2],
                            description: data[3]
                        }));
                        break;

                    default:
                        logger.warn(`Unknown message type from ${chargePointId}: ${messageTypeId}`);
                }
            } catch (error) {
                logger.error(`Error processing OCPP array message for ${chargePointId}:`, error);
            }
            return;
        }

        // Case 2: Handle direct payload object (non-standard, but common in some emulators)
        if (typeof data === 'object' && !Array.isArray(data)) {
            logger.info(`Received direct payload from ${chargePointId}:`, JSON.stringify(data));

            try {
                // Look up the charging station to get its ID
                const station = await ChargingStation.findOne({
                    where: {
                        chargePointId
                    }
                });
                if (!station) {
                    logger.error(`Cannot log message: Station ${chargePointId} not found in database`);
                    return;
                }

                // Check if this looks like a BootNotification payload
                if (data.ChargePointModel || data.ChargePointVendor || data.chargePointModel || data.chargePointVendor) {
                    logger.info(`Processing as BootNotification from ${chargePointId}`);

                    // Generate a unique ID for this message
                    const uniqueId = `direct-${Date.now()}`;

                    // Process through the normal handler
                    const response = await messageHandlers.handleRequest(chargePointId, 'BootNotification', uniqueId, data);

                    // Send response back to charging station
                    if (response) {
                        ws.send(JSON.stringify(response));

                        // Log the response with proper fields
                        await OcppMessage.create({
                            messageId: uniqueId,
                            chargePointId: chargePointId,
                            message_type: 'BootNotification',
                            status: 'Sent',
                            payload: JSON.stringify(response[2] || {}),
                            direction: 'Outbound',
                            timestamp: new Date()
                        });
                    }

                    return;
                }

                // Log generic payload for analysis
                await OcppMessage.create({
                    messageId: `unknown-${Date.now()}`,
                    chargePointId: chargePointId,
                    message_type: 'Unknown',
                    status: 'Received',
                    payload: JSON.stringify(data),
                    direction: 'Inbound',
                    timestamp: new Date()
                });

                logger.warn(`Received unrecognized payload format from ${chargePointId}`);
            } catch (error) {
                logger.error(`Error processing direct payload from ${chargePointId}:`, error);
            }
            return;
        }

        // Case 3: Invalid message format
        logger.error(`Invalid message format from ${chargePointId}:`, JSON.stringify(data));

    } catch (error) {
        logger.error(`Error handling OCPP message for ${chargePointId}:`, error);
    }
}

/**
 * Process an OCPP message from a charging station (legacy version)
 * @deprecated Use handleOcppMessage instead
 */
async function processOcppMessage(chargePointId, data, ws) {
    try {
        return await handleOcppMessage(chargePointId, data, ws);
    } catch (error) {
        logger.error(`Error in legacy processOcppMessage for ${chargePointId}:`, error);
        throw error;
    }
}

/**
 * Send an OCPP request to a charging station
 */
async function sendOcppRequest(chargePointId, action, payload) {
    try {
        // Check if the station is connected
        if (!isConnected(chargePointId)) {
            logger.error(`Cannot send ${action} to ${chargePointId}: Not connected`);
            return { status: 'Rejected', error: 'Station not connected' };
        }
        
        // Get the WebSocket connection
        const ws = serverState.connectedStations.get(chargePointId);
        
        // OCPP 1.6 spec has different field casing requirements for different commands
        const normalizedPayload = {};
        
        // Handle command-specific payload formatting
        if (action === 'Reset') {
            // Keep original case for Reset command (lowercase 'type')
            Object.keys(payload).forEach(key => {
                normalizedPayload[key] = payload[key];
            });
            // Ensure 'type' exists and is either 'Soft' or 'Hard'
            if (!normalizedPayload.type) {
                normalizedPayload.type = 'Soft'; // Default to Soft reset
            }
            logger.debug(`Reset payload: ${JSON.stringify(normalizedPayload)}`);
        } 
        else if (action === 'RemoteStartTransaction') {
            // Keep camelCase for RemoteStartTransaction per OCPP 1.6 spec
            Object.keys(payload).forEach(key => {
                normalizedPayload[key] = payload[key];
            });
            
            // Ensure connectorId is a number
            if (normalizedPayload.connectorId !== undefined) {
                normalizedPayload.connectorId = parseInt(normalizedPayload.connectorId, 10);
            }
            
            // Add optional chargingProfile if specified
            if (payload.chargingProfile) {
                normalizedPayload.chargingProfile = payload.chargingProfile;
            }
            
            logger.debug(`RemoteStartTransaction payload: ${JSON.stringify(normalizedPayload)}`);
            
            // Register pending remote start so handleStartTransaction can accept
            // stations that use their own default tag instead of the provided one
            const { registerPendingRemoteStart } = require('./messageHandlers');
            registerPendingRemoteStart(chargePointId, normalizedPayload.idTag, normalizedPayload.connectorId);
        }
        else if (action === 'RemoteStopTransaction') {
            // For RemoteStopTransaction, we only need transactionId and it should be camelCase
            normalizedPayload.transactionId = parseInt(payload.transactionId, 10);
            
            logger.debug(`RemoteStopTransaction payload: ${JSON.stringify(normalizedPayload)}`);
        }
        else {
            // Normalize other commands to PascalCase
            Object.keys(payload).forEach(key => {
                // Convert first character to uppercase for PascalCase
                const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
                normalizedPayload[pascalKey] = payload[key];
            });
        }

        // Special case handling for specific commands
        if (action === 'RemoteStartTransaction' && normalizedPayload.ConnectorId !== undefined) {
            // Ensure connectorId is a number
            normalizedPayload.ConnectorId = parseInt(normalizedPayload.ConnectorId, 10);
        }

        const request = [2, uuidv4(), action, normalizedPayload];

        // Log the outgoing request
        await OcppMessage.create({
            chargePointId,
            messageId: request[1],
            message_type: action,
            status: 'Sent',
            payload: JSON.stringify(normalizedPayload),
            direction: 'Outbound',
            timestamp: new Date()
        });

        // Send the request
        ws.send(JSON.stringify(request));

        logger.info(`Sent ${action} request to ${chargePointId}: ${JSON.stringify(normalizedPayload)}`);

        return {
            success: true,
            messageId: request[1]
        };
    } catch (error) {
        logger.error(`Error sending OCPP request to ${chargePointId}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Check if a station is connected
 */
function isConnected(chargePointId) {
    if (!chargePointId) {
        logger.warn('isConnected called with invalid chargePointId');
        return false;
    }
    
    try {
        // Log all connections for debugging
        logger.debug(`Connection map size: ${serverState.connectedStations.size}`);
        logger.debug(`Connection map keys: ${Array.from(serverState.connectedStations.keys()).join(', ')}`);
        
        // Get the connection from the map
        const connection = serverState.connectedStations.get(chargePointId);
        if (!connection) {
            logger.warn(`isConnected(${chargePointId}): No connection in map. Map keys: [${Array.from(serverState.connectedStations.keys()).join(', ')}]`);
            return false;
        }
        
        // Verify the connection is valid and open
        const isOpen = connection.readyState === WebSocket.OPEN;
        logger.debug(`Connection status for ${chargePointId}: readyState=${connection.readyState}, isOpen=${isOpen}`);
        
        // If connection exists but is not open, clean it up
        if (!isOpen && connection.readyState !== WebSocket.CONNECTING) {
            logger.warn(`Found stale connection for ${chargePointId} with readyState ${connection.readyState}. Removing from map.`);
            serverState.connectedStations.delete(chargePointId);
        }
        
        return isOpen;
    } catch (error) {
        logger.error(`Error checking connection status for ${chargePointId}:`, error);
        return false;
    }
}

/**
 * Get all connected stations
 */
function getConnectedStations() {
    const connectedIds = [];
    for (const [id, ws] of serverState.connectedStations.entries()) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            connectedIds.push(id);
        }
    }
    return connectedIds;
}

/**
 * Expose the internal connection map for diagnostics
 * @private
 */
function _getConnectionsForDiagnostics() {
    return serverState.connectedStations;
}

/**
 * Get the WebSocket server instance for diagnostics
 * @private
 */
function _getWebSocketServer() {
    return serverState.wss;
}

/**
 * Check if the server is initialized
 * @private
 */
function _isInitialized() {
    return serverState.initialized;
}

/**
 * Create a standalone WebSocket server for testing or manual connection
 * This can be used when the main application hasn't properly initialized the WebSocket server
 * @private
 */
function _createStandaloneServer() {
    // Don't create a new server if one already exists
    if (serverState.wss) {
        logger.info('WebSocket server already exists, using existing instance');
        return serverState.wss;
    }
    
    logger.info('Creating standalone WebSocket server for testing/diagnostics');
    
    // Create a minimal HTTP server
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OCPP WebSocket Server');
    });
    
    // Initialize the WebSocket server with this HTTP server
    init(server);
    
    // Start listening on configured port
    server.listen(config.websocket.port, config.websocket.host, () => {
        logger.info(`Standalone WebSocket server listening on ${config.websocket.host}:${config.websocket.port}`);
    });
    
    return serverState.wss;
}

/**
 * Rebuild a connection for a specific station
 * @private
 */
function _rebuildConnection(chargePointId, wsClient) {
    if (!chargePointId || !wsClient) {
        logger.error('Cannot rebuild connection: missing station ID or WebSocket client');
        return false;
    }
    
    // Store the connection in our map
    serverState.connectedStations.set(chargePointId, wsClient);
    logger.info(`Rebuilt connection for ${chargePointId}`);
    
    // Make sure the WebSocket has the correct properties
    wsClient.chargePointId = chargePointId;
    wsClient.isAlive = true;
    
    // Update the database
    updateStationConnectionStatus(chargePointId, true, wsClient._socket.remoteAddress);
    
    return true;
}

/**
 * Rebuild the entire connection map
 * @private
 */
function _rebuildConnectionMap() {
    if (!serverState.wss) {
        logger.error('Cannot rebuild connection map: WebSocket server not available');
        return 0;
    }
    
    let rebuildCount = 0;
    
    // Clear the current connection map
    serverState.connectedStations.clear();
    
    // Rebuild from active WebSocket connections
    serverState.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.chargePointId) {
            serverState.connectedStations.set(client.chargePointId, client);
            rebuildCount++;
            logger.info(`Rebuilt connection for ${client.chargePointId}`);
        }
    });
    
    logger.info(`Rebuilt ${rebuildCount} connections from active WebSockets`);
    return rebuildCount;
}

/**
 * Attempt to fix connection mapping issues
 * @param {string} stationId - The station ID to fix
 */
async function fixConnectionMapping(stationId) {
    try {
        const existingConnection = serverState.connectedStations.get(stationId);
        
        if (existingConnection) {
            if (existingConnection.readyState === WebSocket.OPEN) {
                return { 
                    fixed: false, 
                    message: 'Connection already exists and is open' 
                };
            } else {
                // Remove dead connection
                serverState.connectedStations.delete(stationId);
                logger.info(`Removed dead connection for ${stationId}`);
                return { 
                    fixed: true, 
                    message: 'Removed dead connection' 
                };
            }
        }
        
        // Check if the station exists in the database
        const station = await ChargingStation.findOne({
            where: { chargePointId: stationId }
        });
        
        if (!station) {
            return { 
                fixed: false, 
                message: 'Station does not exist in database' 
            };
        }
        
        // The station exists but has no connection - nothing we can do
        // except wait for it to reconnect
        return { 
            fixed: false, 
            message: 'Station exists but is not connected' 
        };
    } catch (error) {
        logger.error(`Error fixing connection for ${stationId}:`, error);
        return { 
            fixed: false, 
            message: `Error: ${error.message}` 
        };
    }
}

/**
 * Check if the OCPP server is initialized
 * @returns {boolean} True if initialized
 */
function _isInitialized() {
    return serverState.initialized;
}

module.exports = {
    init,
    sendOcppRequest,
    isConnected,
    getConnectedStations,
    handleOcppMessage,
    processOcppMessage,
    updateStationConnectionStatus,
    _getConnectionsForDiagnostics,
    _getWebSocketServer,
    _isInitialized,
    _createStandaloneServer,
    _rebuildConnection,
    _rebuildConnectionMap,
    fixConnectionMapping
};