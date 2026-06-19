const express = require('express');
const {
    ChargingStation,
    Transaction,
    OcppMessage,
    sequelize
} = require('../models');
const { Op } = require('sequelize');
const {
    authenticate,
    authorize
} = require('../middleware/auth');
const ocppServer = require('../ocpp/server');
const mqttClient = require('../mqtt/client');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/stations/diagnostic
 * @desc    Get all charging stations for diagnostic purposes (no auth required)
 * @access  Public
 */
router.get('/diagnostic', async (req, res) => {
    try {
        const stations = await ChargingStation.findAll({
            order: [
                ['createdAt', 'DESC']
            ]
        });

        // Add connection status to each station
        const stationsWithStatus = stations.map(station => {
            const isConnected = ocppServer.isConnected(station.chargePointId);
            return {
                ...station.toJSON(),
                isConnected
            };
        });

        res.json({
            success: true,
            stations: stationsWithStatus
        });
    } catch (error) {
        logger.error('Error fetching stations for diagnostics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve charging stations'
        });
    }
});

/**
 * @route   GET /api/stations/diagnostic/:id
 * @desc    Get a single charging station for diagnostic purposes (no auth required)
 * @access  Public
 */
router.get('/diagnostic/:id', async (req, res) => {
    try {
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: req.params.id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Add connection status
        const isConnected = ocppServer.isConnected(station.chargePointId);

        res.json({
            success: true,
            station: {
                ...station.toJSON(),
                isConnected
            }
        });
    } catch (error) {
        logger.error(`Error fetching station ${req.params.id} for diagnostics:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve charging station'
        });
    }
});

/**
 * @route   GET /api/stations/diagnostic/:id/connectors
 * @desc    Get connectors for a charging station (no auth required)
 * @access  Public
 */
router.get('/diagnostic/:id/connectors', async (req, res) => {
    try {
        const {
            Connector
        } = require('../models');
        const connectors = await Connector.findAll({
            where: {
                chargePointId: req.params.id
            },
            order: [
                ['connectorId', 'ASC']
            ]
        });

        if (!connectors || connectors.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No connectors found for this charging station'
            });
        }

        res.json({
            success: true,
            connectors: connectors.map(c => c.toJSON())
        });
    } catch (error) {
        logger.error(`Error fetching connectors for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve connectors'
        });
    }
});

/**
 * @route   GET /api/stations/:id/connectors
 * @desc    Get connectors for a charging station with authentication
 * @access  Private
 */
router.get('/:id/connectors', authenticate, async (req, res) => {
    try {
        const {
            Connector
        } = require('../models');
        const connectors = await Connector.findAll({
            where: {
                chargePointId: req.params.id
            },
            order: [
                ['connectorId', 'ASC']
            ]
        });

        // Add extra data such as active transaction info if needed
        let enhancedConnectors = connectors;

        if (connectors && connectors.length > 0) {
            // If there are transactions, we could add that info here
            const {
                Transaction
            } = require('../models');
            const activeTransactions = await Transaction.findAll({
                where: {
                    chargePointId: req.params.id,
                    status: 'InProgress'
                }
            });

            // Map transactions to connectors
            enhancedConnectors = connectors.map(connector => {
                const connectorJson = connector.toJSON();
                const transaction = activeTransactions.find(t =>
                    t.connectorId === connector.connectorId);

                if (transaction) {
                    connectorJson.activeTransaction = transaction.toJSON();
                }

                return connectorJson;
            });
        }

        res.json({
            success: true,
            connectors: enhancedConnectors.map(c => typeof c.toJSON === 'function' ? c.toJSON() : c),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching connectors for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve connectors'
        });
    }
});

/**
 * @route   GET /api/stations/diagnostic/:id/transactions
 * @desc    Get transactions for a charging station (no auth required)
 * @access  Public
 */
router.get('/diagnostic/:id/transactions', async (req, res) => {
    try {
        const status = req.query.status || 'InProgress';

        const transactions = await Transaction.findAll({
            where: {
                chargePointId: req.params.id,
                status
            },
            order: [
                ['startTime', 'DESC']
            ]
        });

        res.json({
            success: true,
            transactions: transactions.map(t => t.toJSON())
        });
    } catch (error) {
        logger.error(`Error fetching transactions for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve transactions'
        });
    }
});

/**
 * @route   POST /api/stations/diagnostic/:id/remote-start
 * @desc    Start a transaction remotely for diagnostic purposes (no auth required)
 * @access  Public
 */
router.post('/diagnostic/:id/remote-start', async (req, res) => {
    try {
        const {
            connectorId = 1, idTag = 'TEST_TAG'
        } = req.body;
        const chargePointId = req.params.id;

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Send RemoteStartTransaction command
        const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStartTransaction', {
            connectorId: parseInt(connectorId),
            idTag
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Failed to start transaction'
            });
        }

        res.json({
            success: true,
            message: `Transaction started on connector ${connectorId}`,
            messageId: result.messageId
        });
    } catch (error) {
        logger.error(`Error starting transaction for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error when starting transaction'
        });
    }
});

/**
 * @route   POST /api/stations/diagnostic/:id/remote-stop
 * @desc    Stop a transaction remotely for diagnostic purposes (no auth required)
 * @access  Public
 */
router.post('/diagnostic/:id/remote-stop', async (req, res) => {
    try {
        let {
            transactionId
        } = req.body;
        const chargePointId = req.params.id;

        // If transactionId is not provided, find the active transaction
        if (!transactionId) {
            const activeTransaction = await Transaction.findOne({
                where: {
                    chargePointId,
                    status: 'InProgress'
                },
                order: [
                    ['startTime', 'DESC']
                ]
            });

            if (!activeTransaction) {
                return res.status(404).json({
                    success: false,
                    message: 'No active transaction found for this station'
                });
            }

            transactionId = activeTransaction.transactionId;
        }

        // Send RemoteStopTransaction command
        const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
            transactionId: parseInt(transactionId)
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Failed to stop transaction'
            });
        }

        res.json({
            success: true,
            message: `Transaction ${transactionId} stopped`,
            messageId: result.messageId
        });
    } catch (error) {
        logger.error(`Error stopping transaction for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error when stopping transaction'
        });
    }
});

/**
 * @route   GET /api/stations
 * @desc    Get all charging stations
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const stations = await ChargingStation.findAll({
            order: [
                ['createdAt', 'DESC']
            ]
        });

        // Add connection status to each station
        const stationsWithStatus = stations.map(station => {
            const isConnected = ocppServer.isConnected(station.chargePointId);
            return {
                ...station.toJSON(),
                isConnected
            };
        });

        res.json({
            success: true,
            stations: stationsWithStatus
        });
    } catch (error) {
        logger.error('Error fetching stations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve charging stations'
        });
    }
});

/**
 * @route   GET /api/stations/:id
 * @desc    Get a single charging station
 * @access  Private
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: req.params.id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Add connection status
        const isConnected = ocppServer.isConnected(station.chargePointId);

        // Get recent transactions
        const transactions = await Transaction.findAll({
            where: {
                chargePointId: req.params.id
            },
            order: [
                ['startTime', 'DESC']
            ],
            limit: 5
        });

        res.json({
            success: true,
            station: {
                ...station.toJSON(),
                isConnected
            },
            transactions
        });
    } catch (error) {
        logger.error(`Error fetching station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve charging station'
        });
    }
});

/**
 * @route   GET /api/stations/:id/connection
 * @desc    Get the real-time connection status of a charging station
 * @access  Private
 */
router.get('/:id/connection', authenticate, async (req, res) => {
    try {
        const stationId = req.params.id;

        // Check if the station exists first
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            },
            attributes: ['chargePointId'] // Only need the ID for verification
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Direct check of connection status from OCPP server
        let isConnected = ocppServer.isConnected(stationId);

        // Get the most recent heartbeat time for this station
        const stationData = await ChargingStation.findOne({
            where: {
                chargePointId: stationId
            },
            attributes: ['lastHeartbeat']
        });

        // If not connected via WebSocket, check if we have a recent heartbeat
        // Stations sending heartbeats are considered connected (within 2 minutes)
        if (!isConnected && stationData?.lastHeartbeat) {
            const now = new Date();
            const lastHeartbeat = new Date(stationData.lastHeartbeat);
            const timeSinceHeartbeat = now - lastHeartbeat;
            const twoMinutes = 2 * 60 * 1000; // 2 minutes in milliseconds

            if (timeSinceHeartbeat < twoMinutes) {
                isConnected = true;
                logger.info(`Station ${stationId} considered connected due to recent heartbeat (${timeSinceHeartbeat / 1000}s ago)`);
            }
        }

        // Respond with connection status and heartbeat info
        res.json({
            success: true,
            isConnected,
            lastHeartbeat: stationData?.lastHeartbeat || null,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error checking connection status for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to check connection status'
        });
    }
});

/**
 * @route   GET /api/stations/:id/status
 * @desc    Get real-time status of a charging station (lightweight endpoint)
 * @access  Private
 */
router.get('/:id/status', authenticate, async (req, res) => {
    try {
        logger.info(`Fetching station status for: ${req.params.id}`);
        
        // Step 1: Find the station in the database
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: req.params.id
            },
            attributes: ['id', 'chargePointId', 'name', 'status', 'lastHeartbeat', 'firmwareVersion', 'lastConnection', 'currentTransaction']
        });

        if (!station) {
            logger.warn(`Station not found with ID: ${req.params.id}`);
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }
        
        // Step 2: Try to get connection status with proper error handling
        let isConnected = false;
        try {
            isConnected = ocppServer && ocppServer.isConnected ? ocppServer.isConnected(station.chargePointId) : false;
            logger.debug(`Connection status for ${station.chargePointId}: ${isConnected}`);
        } catch (connError) {
            logger.warn(`Failed to get connection status for ${station.chargePointId}`, connError);
            // Continue with isConnected = false instead of crashing
        }

        // Step 3: Get current active transaction if any
        let activeTransaction = null;
        try {
            activeTransaction = await Transaction.findOne({
                where: {
                    chargePointId: req.params.id,
                    status: 'InProgress'
                },
                order: [['startTime', 'DESC']]
            });
            
            if (activeTransaction) {
                logger.debug(`Active transaction found: ${activeTransaction.transactionId}`);
            }
        } catch (txError) {
            logger.warn(`Error fetching transactions for station ${req.params.id}:`, txError);
            // Continue without transaction data
        }

        // Step 4: Get connector status from OCPP server with proper error handling
        let connectorStatus = [];
        try {
            if (ocppServer && ocppServer.getConnectorStatus) {
                connectorStatus = ocppServer.getConnectorStatus(station.chargePointId) || [];
            }
        } catch (connStatusError) {
            logger.warn(`Failed to get connector status for ${station.chargePointId}`, connStatusError);
            // Continue with empty connector status
        }

        // Step 5: Update station status based on active transaction or connector status
        let updatedStatus = station.status;
        if (activeTransaction) {
            updatedStatus = 'Charging';
            logger.debug(`Setting station status to Charging due to active transaction`);
        } else if (connectorStatus.length > 0) {
            // Find available connector
            const availableConnector = connectorStatus.find(c => c.status === 'Available');
            if (availableConnector) {
                updatedStatus = 'Available';
                logger.debug(`Setting station status to Available due to connector availability`);
            }
        }

        // Step 6: Try to update the station status in the database if needed
        try {
            if (updatedStatus !== station.status) {
                logger.debug(`Updating station status from ${station.status} to ${updatedStatus}`);
                await station.update({
                    status: updatedStatus
                });
            }
        } catch (updateError) {
            logger.warn(`Failed to update station status for ${station.chargePointId}:`, updateError);
            // Continue with current status
        }
        
        // Step 7: Include energy consumption data and charging duration if station is charging
        let energyConsumption = null;
        let chargingDuration = 0;
        let batteryPercentage = 0;
        let chargingPower = 0;
        
        if (updatedStatus === 'Charging' && activeTransaction) {
            try {
                // Try to get energy consumption from the active transaction
                energyConsumption = activeTransaction.energyDelivered || '0.00';
                
                // Calculate charging duration in seconds
                if (activeTransaction.startTime) {
                    const startTime = new Date(activeTransaction.startTime);
                    const now = new Date();
                    chargingDuration = Math.floor((now - startTime) / 1000); // in seconds
                    logger.debug(`Calculated charging duration: ${chargingDuration} seconds`);
                    
                    // Estimate charging power (kW) - if we have energy and duration
                    if (parseFloat(energyConsumption) > 0 && chargingDuration > 0) {
                        // energyDelivered is usually in kWh, convert duration to hours
                        const durationHours = chargingDuration / 3600;
                        if (durationHours > 0) {
                            chargingPower = parseFloat(energyConsumption) / durationHours;
                            logger.debug(`Estimated charging power: ${chargingPower} kW`);
                        }
                    }
                }
                
                // Estimate battery percentage based on typical EV battery (60kWh)
                // Starting from 20% and charging to 80% (common charging range)
                const typicalEVBattery = 60; // kWh
                const startingPercentage = 20;
                const chargingRange = 60; // from 20% to 80% = 60% range
                
                // Calculate estimated percentage gain from energy delivered
                const percentageGain = (parseFloat(energyConsumption) / typicalEVBattery) * 100;
                batteryPercentage = Math.min(80, Math.max(20, Math.round(startingPercentage + percentageGain)));
                logger.debug(`Estimated battery percentage: ${batteryPercentage}%`);
                
            } catch (energyError) {
                logger.warn('Error calculating charging metrics:', energyError);
            }
        }

        // Step 8: Return the full station data with all the information we could gather
        res.json({
            success: true,
            station: {
                ...station.toJSON(),
                status: updatedStatus, // Use the latest status even if DB update failed
                isConnected,
                energyConsumption,
                chargingDuration,
                batteryPercentage,
                chargingPower,
                currentTransaction: activeTransaction?.transactionId || null,
                connectors: connectorStatus
            }
        });
    } catch (error) {
        logger.error(`Error fetching station status ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve charging station status'
        });
    }
});

/**
 * @route   GET /api/stations/:id/transactions
 * @desc    Get transactions for a charging station
 * @access  Private
 */
router.get('/:id/transactions', authenticate, async (req, res) => {
    try {
        const {
            limit = 20, offset = 0, status
        } = req.query;

        const where = {
            chargePointId: req.params.id
        };
        if (status) {
            where.status = status;
        }

        const transactions = await Transaction.findAndCountAll({
            where,
            order: [
                ['startTime', 'DESC']
            ],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            count: transactions.count,
            transactions: transactions.rows
        });
    } catch (error) {
        logger.error(`Error fetching transactions for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve transactions'
        });
    }
});

/**
 * @route   GET /api/stations/:id/logs
 * @desc    Get OCPP message logs for a charging station
 * @access  Private
 */
router.get('/:id/logs', authenticate, async (req, res) => {
    try {
        const {
            limit = 50, offset = 0, message_type
        } = req.query;
        const chargePointId = req.params.id;

        logger.info(`Fetching logs for station ${chargePointId}, limit: ${limit}, offset: ${offset}`);

        const where = {
            chargePointId
        };
        if (message_type) {
            where.message_type = message_type;
        }

        // Check if any OCPP messages exist for this station
        const messageCount = await OcppMessage.count({
            where: {
                chargePointId
            }
        });
        logger.info(`Found ${messageCount} OCPP messages for station ${chargePointId}`);

        const logs = await OcppMessage.findAndCountAll({
            where,
            order: [
                ['createdAt', 'DESC']
            ],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        logger.info(`Returning ${logs.rows.length} logs out of ${logs.count} total`);

        // Convert logs.rows to plain objects to ensure consistency
        const formattedLogs = logs.rows.map(log => {
            const plainLog = log.get({
                plain: true
            });
            // Ensure the payload is properly parsed if it's a string
            if (plainLog.payload && typeof plainLog.payload === 'string') {
                try {
                    plainLog.payload = JSON.parse(plainLog.payload);
                } catch (e) {
                    // If it's not valid JSON, leave it as is
                }
            }
            return plainLog;
        });

        res.json({
            success: true,
            count: logs.count,
            logs: formattedLogs,
            // Also include as messages for backwards compatibility
            messages: formattedLogs
        });
    } catch (error) {
        logger.error(`Error fetching logs for station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve logs'
        });
    }
});

/**
 * @route   POST /api/stations/:id/remote-start
 * @desc    Send RemoteStartTransaction command
 * @access  Private/Operator
 */
router.post('/:id/remote-start', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            idTag,
            connectorId = 1
        } = req.body;

        if (!idTag) {
            return res.status(400).json({
                success: false,
                message: 'ID tag is required'
            });
        }

        // Check if station exists
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: req.params.id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Send command to station
        const result = await ocppServer.sendOcppRequest(req.params.id, 'RemoteStartTransaction', {
            idTag,
            connectorId: parseInt(connectorId)
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Failed to start transaction'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: 'Remote start command sent'
        });
    } catch (error) {
        logger.error(`Error sending remote start to ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/stations/:id/remote-stop
 * @desc    Send RemoteStopTransaction command
 * @access  Private/Operator
 */
router.post('/:id/remote-stop', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            transactionId
        } = req.body;
        const chargePointId = req.params.id;

        if (!transactionId) {
            return res.status(400).json({
                success: false,
                message: 'Transaction ID is required'
            });
        }

        // 1. Get the active transaction
        const transaction = await Transaction.findOne({
            where: {
                transactionId: parseInt(transactionId),
                status: 'InProgress'
            }
        });

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Active transaction not found'
            });
        }

        // 2. Check if station is connected
        if (!ocppServer.isConnected(chargePointId)) {
            return res.status(503).json({
                success: false,
                message: 'Charging station is not connected'
            });
        }

        // 3. Update connector status to indicate stopping
        try {
            const connector = await Connector.findOne({
                where: {
                    chargePointId: chargePointId,
                    connectorId: transaction.connectorId
                }
            });

            if (connector) {
                await connector.update({
                    status: 'Finishing', // Intermediate state while waiting for stop
                    lastStatusUpdate: new Date()
                });

                // Publish status update to MQTT
                mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
                    connectorId: transaction.connectorId,
                    status: 'Finishing',
                    timestamp: new Date().toISOString()
                }));
            }
        } catch (connError) {
            logger.error(`Error updating connector status for ${chargePointId}:`, connError);
            // Continue with stop request even if status update fails
        }

        // 4. Send RemoteStopTransaction command
        const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
            transactionId: parseInt(transactionId)
        });

        // 5. Handle command result
        if (!result.success) {
            // If command failed, revert connector status
            try {
                const connector = await Connector.findOne({
                    where: {
                        chargePointId: chargePointId,
                        connectorId: transaction.connectorId
                    }
                });

                if (connector && connector.status === 'Finishing') {
                    await connector.update({
                        status: 'Charging',
                        lastStatusUpdate: new Date()
                    });

                    // Publish status update to MQTT
                    mqttClient.publish(`ocpp/${chargePointId}/status`, JSON.stringify({
                        connectorId: transaction.connectorId,
                        status: 'Charging',
                        timestamp: new Date().toISOString()
                    }));
                }
            } catch (error) {
                logger.error(`Error reverting connector status for ${chargePointId}:`, error);
            }

            return res.status(500).json({
                success: false,
                message: result.error || 'Failed to send stop command'
            });
        }

        // 6. Return success response
        // Note: The actual transaction completion will happen when the station sends the StopTransaction message
        res.json({
            success: true,
            messageId: result.messageId,
            message: 'Remote stop command sent',
            status: 'Stopping'
        });
    } catch (error) {
        logger.error(`Error sending remote stop to ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error when stopping transaction'
        });
    }
});

/**
 * @route   POST /api/stations/:id/reset
 * @desc    Send Reset command
 * @access  Private/Admin
 */
router.post('/:id/reset', authorize('admin'), async (req, res) => {
    try {
        const {
            type = 'Soft'
        } = req.body;

        // Validate reset type
        if (type !== 'Soft' && type !== 'Hard') {
            return res.status(400).json({
                success: false,
                message: 'Reset type must be either "Soft" or "Hard"'
            });
        }

        // Send command to station
        const result = await ocppServer.sendOcppRequest(req.params.id, 'Reset', {
            type
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Failed to reset station'
            });
        }

        res.json({
            success: true,
            messageId: result.messageId,
            message: `${type} reset command sent`
        });
    } catch (error) {
        logger.error(`Error sending reset to ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/stations
 * @desc    Create a new charging station
 * @access  Private/Admin
 */
/**
 * @route   DELETE /api/stations/:id
 * @desc    Delete a charging station
 * @access  Private/Admin
 */
/**
 * @route   POST /api/stations/:id/trigger-boot
 * @desc    Manually trigger a boot notification for a station
 * @access  Private/Admin
 */
router.post('/:id/trigger-boot', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const {
            vendor,
            model,
            firmware
        } = req.body;

        // Find the station
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station is connected
        const isConnected = ocppServer.isConnected(id);

        if (!isConnected) {
            return res.status(400).json({
                success: false,
                message: 'Station is not connected, cannot trigger boot notification'
            });
        }

        // Create a mock boot notification payload
        const bootPayload = {
            chargePointVendor: vendor || station.vendor || 'Unknown Vendor',
            chargePointModel: model || station.model || 'Unknown Model',
            firmwareVersion: firmware || station.firmwareVersion || '1.0.0',
            chargePointSerialNumber: station.serialNumber || '',
            iccid: station.iccid || '',
            imsi: station.imsi || '',
            meterType: station.meterType || '',
            meterSerialNumber: station.meterSerialNumber || ''
        };

        // Generate a unique message ID
        const uniqueId = `manual-boot-${Date.now()}`;

        // Process the boot notification through the handler
        await messageHandlers.handleBootNotification(id, uniqueId, bootPayload);

        logger.info(`Manual boot notification triggered for ${id}`);

        res.json({
            success: true,
            message: 'Boot notification triggered successfully',
            bootPayload
        });
    } catch (error) {
        logger.error(`Error triggering boot notification for ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   DELETE /api/stations/:id
 * @desc    Delete a charging station
 * @access  Private/Admin
 */
router.delete('/:id', authorize('admin'), async (req, res) => {
    try {
        const {
            id
        } = req.params;

        // Find the station
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Check if station has active transactions
        const activeTransactions = await Transaction.count({
            where: {
                chargePointId: id,
                status: 'InProgress'
            }
        });

        if (activeTransactions > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete station with active transactions'
            });
        }

        // Delete the station
        await station.destroy();

        logger.info(`Station deleted: ${id}`);

        res.json({
            success: true,
            message: 'Charging station deleted successfully'
        });
    } catch (error) {
        logger.error(`Error deleting station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   POST /api/stations
 * @desc    Create a new charging station
 * @access  Private/Admin
 */
router.post('/', authorize(['admin', 'operator']), async (req, res) => {
    try {
        const {
            chargePointId,
            name,
            vendor,
            model,
            firmwareVersion,
            powerOutput,
            address,
            location
        } = req.body;

        // Validate required fields
        if (!chargePointId || !name) {
            return res.status(400).json({
                success: false,
                message: 'Station ID and name are required'
            });
        }

        // Check if station with this ID already exists
        const existingStation = await ChargingStation.findOne({
            where: {
                chargePointId
            }
        });

        if (existingStation) {
            return res.status(400).json({
                success: false,
                message: 'A station with this ID already exists'
            });
        }

        // Format location data as a string if it's an object
        let locationStr = location;
        if (location && typeof location === 'object') {
            try {
                // Convert location object to string format
                if (location.latitude !== undefined && location.longitude !== undefined) {
                    locationStr = `${location.latitude},${location.longitude}`;
                } else {
                    locationStr = JSON.stringify(location);
                }
            } catch (e) {
                logger.error('Error parsing location data:', e);
                locationStr = null;
            }
        }

        // Create the new station
        const station = await ChargingStation.create({
            chargePointId,
            name,
            vendor,
            model,
            firmwareVersion,
            powerOutput,
            address,
            location: locationStr,
            status: 'Available',
            lastHeartbeat: new Date()
        });

        logger.info(`New station created: ${chargePointId}`);

        res.status(201).json({
            success: true,
            station,
            message: 'Charging station created successfully'
        });
    } catch (error) {
        logger.error('Error creating station:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   PUT /api/stations/:id
 * @desc    Update a charging station
 * @access  Private/Admin
 */
router.put('/:id', authorize('admin'), async (req, res) => {
    try {
        const {
            id
        } = req.params;

        // Find the station
        const station = await ChargingStation.findOne({
            where: {
                chargePointId: id
            }
        });

        if (!station) {
            return res.status(404).json({
                success: false,
                message: 'Charging station not found'
            });
        }

        // Fields that can be updated
        const allowedFields = ['name', 'description', 'location', 'notes', 'vendor', 'model'];

        // Update only allowed fields
        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        // Update the station
        await station.update(updateData);

        // Get the updated station
        const updatedStation = await ChargingStation.findOne({
            where: {
                chargePointId: id
            }
        });

        // Add connection status
        const stationWithStatus = {
            ...updatedStation.toJSON(),
            isConnected: ocppServer.isConnected(id)
        };

        res.json({
            success: true,
            station: stationWithStatus,
            message: 'Station updated successfully'
        });
    } catch (error) {
        logger.error(`Error updating station ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

/**
 * @route   GET /api/stations/stats/summary
 * @desc    Get summary statistics for all stations
 * @access  Private
 */
router.get('/stats/summary', authenticate, async (req, res) => {
    try {
        // Get count of all stations (with error handling)
        let totalStations = 0;
        try {
            totalStations = await ChargingStation.count();
        } catch (error) {
            logger.error('Error counting stations:', error);
        }

        // Get count of connected stations (with null check)
        let connectedStations = 0;
        try {
            const connectedList = ocppServer.getConnectedStations();
            connectedStations = Array.isArray(connectedList) ? connectedList.length : 0;
        } catch (error) {
            logger.error('Error getting connected stations:', error);
        }

        // Get count of active transactions (with error handling)
        let activeTransactions = 0;
        try {
            activeTransactions = await Transaction.count({
                where: {
                    status: 'InProgress'
                }
            });
        } catch (error) {
            logger.error('Error counting active transactions:', error);
        }

        // Get total energy delivered today
        let energyToday = 0;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const energy = await Transaction.sum('energyDelivered', {
                where: {
                    [Op.or]: [{
                            startTime: {
                                [Op.gte]: today
                            }
                        },
                        {
                            stopTime: {
                                [Op.gte]: today
                            }
                        }
                    ]
                }
            });

            energyToday = energy || 0;
        } catch (error) {
            logger.error('Error calculating energy delivered today:', error);
        }

        res.json({
            success: true,
            stats: {
                totalStations,
                connectedStations,
                activeTransactions,
                energyToday
            }
        });
    } catch (error) {
        logger.error('Error fetching station stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve statistics'
        });
    }
});

module.exports = router;
