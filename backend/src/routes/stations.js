const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
    ChargingStation,
    Transaction,
    OcppMessage,
    Connector,
    FirmwareUpdate,
    sequelize
} = require('../models');
const { Op } = require('sequelize');
const { authenticate } = require('../middleware/auth');
const ocppServer = require('../ocpp/server');
const mqttClient = require('../mqtt/client');
const logger = require('../utils/logger');
const { requirePermission } = require('../middleware/permissions');
const { scopedStationWhere, scopedTransactionWhere, accessibleLocationIds } = require('../middleware/adminScope');
const { resolveCanonicalOcppTransactionId } = require('../services/ocppTransactionResolver');

const router = express.Router();

const FIRMWARE_EXTENSIONS = new Set([
    '.bin', '.fw', '.hex', '.img', '.ota', '.zip', '.tar', '.gz', '.tgz'
]);
const FIRMWARE_TERMINAL_STATUSES = ['Installed', 'DownloadFailed', 'InstallationFailed', 'CommandFailed'];
const firmwareMaxBytes = Math.max(
    1,
    Number.parseInt(process.env.FIRMWARE_MAX_FILE_SIZE_MB || '250', 10)
) * 1024 * 1024;

function firmwareDirectory() {
    return path.resolve(process.env.FIRMWARE_DIR || path.join(process.cwd(), 'uploads', 'firmware'));
}

function cleanupFirmwareFile(file) {
    if (!file?.path) return;
    try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
        logger.warn(`Unable to remove rejected firmware file ${file.filename}: ${error.message}`);
    }
}

const firmwareUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            const directory = firmwareDirectory();
            fs.mkdirSync(directory, { recursive: true });
            callback(null, directory);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname || '').toLowerCase();
            callback(null, `firmware-${Date.now()}-${crypto.randomUUID()}${extension}`);
        }
    }),
    limits: { fileSize: firmwareMaxBytes, files: 1 },
    fileFilter: (req, file, callback) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        if (!FIRMWARE_EXTENSIONS.has(extension)) {
            return callback(new Error(`Firmware file must use one of: ${[...FIRMWARE_EXTENSIONS].join(', ')}`));
        }
        callback(null, true);
    }
});

function parseFirmwareUpload(req, res, next) {
    firmwareUpload.single('firmware')(req, res, error => {
        if (!error) return next();
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? `Firmware file must not exceed ${Math.round(firmwareMaxBytes / 1024 / 1024)} MB`
            : error.message || 'Invalid firmware upload';
        return res.status(400).json({ success: false, message });
    });
}

async function sha256File(filename) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const input = fs.createReadStream(filename);
        input.on('error', reject);
        input.on('data', chunk => hash.update(chunk));
        input.on('end', () => resolve(hash.digest('hex')));
    });
}

function publicFirmwareUrl(req, filename) {
    const configuredBase = String(process.env.FIRMWARE_PUBLIC_BASE_URL || '').trim();
    const base = configuredBase || `${req.protocol}://${req.get('host')}/api/firmware`;
    return `${base.replace(/\/$/, '')}/${encodeURIComponent(filename)}`;
}

function parseIntegerInRange(value, fallback, min, max) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function validateFirmwareLocation(value) {
    const location = String(value || '').trim();
    if (!location || location.length > 4096) return null;
    try {
        const parsed = new URL(location);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
        return parsed.toString();
    } catch (_) {
        return null;
    }
}

async function requireSafeFirmwareTarget(req, res, next) {
    try {
        const station = await ChargingStation.findOne({ where: { chargePointId: req.params.id } });
        if (!station) {
            return res.status(404).json({ success: false, message: 'Charging station not found' });
        }
        if (!ocppServer.isConnected(station.chargePointId)) {
            return res.status(409).json({
                success: false,
                code: 'STATION_OFFLINE',
                message: 'The station must be connected before a firmware command can be delivered'
            });
        }
        const activeSessions = await Transaction.count({
            where: { chargePointId: station.chargePointId, status: 'InProgress' }
        });
        if (activeSessions > 0) {
            return res.status(409).json({
                success: false,
                code: 'ACTIVE_CHARGING_SESSION',
                message: 'Stop the active charging session before updating firmware'
            });
        }
        const activeFirmwareUpdate = await FirmwareUpdate.findOne({
            where: {
                chargePointId: station.chargePointId,
                status: { [Op.notIn]: FIRMWARE_TERMINAL_STATUSES },
                [Op.or]: [
                    { requestedAt: { [Op.gte]: new Date(Date.now() - (72 * 60 * 60 * 1000)) } },
                    { retrieveDate: { [Op.gte]: new Date(Date.now() - (60 * 60 * 1000)) } }
                ]
            },
            order: [['requestedAt', 'DESC']]
        });
        if (activeFirmwareUpdate) {
            return res.status(409).json({
                success: false,
                code: 'FIRMWARE_UPDATE_IN_PROGRESS',
                message: `Firmware update #${activeFirmwareUpdate.id} is still ${activeFirmwareUpdate.status}`
            });
        }
        req.firmwareStation = station;
        return next();
    } catch (error) {
        return next(error);
    }
}

function requireStationStateAccess(param = 'id') {
    return async (req, res, next) => {
        try {
            const locationIds = await accessibleLocationIds(req.user);
            if (locationIds === null) return next();
            const value = req.params[param];
            const station = await ChargingStation.findOne({
                where: {
                    [Op.or]: [
                        { chargePointId: value },
                        ...(Number.isInteger(Number(value)) ? [{ id: Number(value) }] : [])
                    ]
                },
                attributes: ['locationId']
            });
            if (station && locationIds.includes(station.locationId)) {
                if (req.body?.locationId && !locationIds.includes(Number(req.body.locationId))) {
                    return res.status(403).json({ success: false, message: 'The target location is outside your assigned state scope' });
                }
                return next();
            }
            return res.status(403).json({ success: false, message: 'This station is outside your assigned state scope' });
        } catch (error) {
            next(error);
        }
    };
}

async function requireBulkStationStateAccess(req, res, next) {
    try {
        const locationIds = await accessibleLocationIds(req.user);
        if (locationIds === null) return next();
        const stationIds = Array.isArray(req.body.stationIds) ? req.body.stationIds : [];
        const count = await ChargingStation.count({ where: { chargePointId: { [Op.in]: stationIds }, locationId: { [Op.in]: locationIds } } });
        if (count !== stationIds.length) return res.status(403).json({ success: false, message: 'One or more selected stations are outside your assigned state scope' });
        next();
    } catch (error) {
        next(error);
    }
}

async function requireNewStationStateAccess(req, res, next) {
    try {
        const locationIds = await accessibleLocationIds(req.user);
        if (locationIds === null) return next();
        if (!locationIds.includes(Number(req.body.locationId))) return res.status(403).json({ success: false, message: 'Choose a location within your assigned states' });
        next();
    } catch (error) {
        next(error);
    }
}

async function removeStationById(chargePointId) {
    return sequelize.transaction(async databaseTransaction => {
        const station = await ChargingStation.findOne({
            where: { chargePointId },
            transaction: databaseTransaction,
            lock: databaseTransaction.LOCK.UPDATE
        });

        if (!station) {
            const error = new Error('Charging station not found');
            error.status = 404;
            error.code = 'STATION_NOT_FOUND';
            throw error;
        }

        const activeTransactions = await Transaction.count({
            where: { chargePointId, status: 'InProgress' },
            transaction: databaseTransaction
        });

        if (activeTransactions > 0) {
            const error = new Error('Stop active charging sessions before deleting this station');
            error.status = 409;
            error.code = 'ACTIVE_TRANSACTIONS';
            throw error;
        }

        const historicalTransactions = await Transaction.count({
            where: { chargePointId },
            transaction: databaseTransaction
        });
        // Numeric relationships use ON DELETE SET NULL, so PostgreSQL performs
        // the unlink atomically. The immutable chargePointId snapshot remains on
        // billing and OCPP audit records without rewriting thousands of rows.
        // Connector and reservation relationships use ON DELETE CASCADE.
        await station.destroy({ transaction: databaseTransaction });

        return {
            chargePointId,
            name: station.name,
            preservedTransactions: historicalTransactions
        };
    });
}

/**
 * @route   GET /api/stations/diagnostic
 * @desc    Get all charging stations for diagnostic purposes (no auth required)
 * @access  Public
 */
router.get('/diagnostic', authenticate, requirePermission('stations.monitor'), async (req, res) => {
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
router.get('/diagnostic/:id', authenticate, requirePermission('stations.monitor'), requireStationStateAccess(), async (req, res) => {
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
router.get('/diagnostic/:id/connectors', authenticate, requirePermission('stations.monitor'), requireStationStateAccess(), async (req, res) => {
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
router.get('/:id/connectors', authenticate, requireStationStateAccess(), async (req, res) => {
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
router.get('/diagnostic/:id/transactions', authenticate, requirePermission('stations.monitor'), requireStationStateAccess(), async (req, res) => {
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
router.post('/diagnostic/:id/remote-start', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
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
router.post('/diagnostic/:id/remote-stop', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
    try {
        let {
            transactionId
        } = req.body;
        const chargePointId = req.params.id;
        let activeTransaction = null;

        // If transactionId is not provided, find the active transaction
        if (!transactionId) {
            activeTransaction = await Transaction.findOne({
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

        if (!activeTransaction && transactionId) {
            activeTransaction = await Transaction.findOne({
                where: {
                    chargePointId,
                    transactionId: Number(transactionId)
                }
            });
        }

        const commandTransactionId = await resolveCanonicalOcppTransactionId({
            chargePointId,
            connectorId: activeTransaction?.connectorId,
            fallbackTransactionId: transactionId
        });
        if (!Number.isSafeInteger(Number(commandTransactionId)) || Number(commandTransactionId) <= 0) {
            return res.status(409).json({
                success: false,
                message: 'The charger transaction ID is not available yet; please retry shortly'
            });
        }

        // Send RemoteStopTransaction command using the ID owned by the charger.
        const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
            transactionId: Number(commandTransactionId)
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error || 'Failed to stop transaction'
            });
        }

        res.json({
            success: true,
            transactionId: Number(transactionId),
            ocppTransactionId: Number(commandTransactionId),
            message: `Transaction ${transactionId} stop command sent`,
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
        const where = await scopedStationWhere(req.user);
        const stations = await ChargingStation.findAll({
            where,
            order: [
                ['lastHeartbeat', 'DESC NULLS LAST']
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
router.get('/:id', authenticate, requireStationStateAccess(), async (req, res) => {
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
router.get('/:id/connection', authenticate, requireStationStateAccess(), async (req, res) => {
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
router.get('/:id/status', authenticate, requireStationStateAccess(), async (req, res) => {
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
                // Transaction energy is normalized to Wh throughout the
                // backend. This station-status response is a UI contract, so
                // expose the display value in kWh and retain the raw Wh value
                // explicitly for clients that need it.
                const energyWh = Math.max(Number(activeTransaction.energyDelivered) || 0, 0);
                const energyKwh = energyWh / 1000;
                energyConsumption = energyKwh;
                
                // Calculate charging duration in seconds
                if (activeTransaction.startTime) {
                    const startTime = new Date(activeTransaction.startTime);
                    const now = new Date();
                    chargingDuration = Math.floor((now - startTime) / 1000); // in seconds
                    logger.debug(`Calculated charging duration: ${chargingDuration} seconds`);
                    
                    // Estimate charging power (kW) - if we have energy and duration
                    if (energyKwh > 0 && chargingDuration > 0) {
                        const durationHours = chargingDuration / 3600;
                        if (durationHours > 0) {
                            chargingPower = energyKwh / durationHours;
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
                const percentageGain = (energyKwh / typicalEVBattery) * 100;
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
                energyConsumptionWh: updatedStatus === 'Charging' && activeTransaction
                    ? Math.max(Number(activeTransaction.energyDelivered) || 0, 0)
                    : 0,
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
router.get('/:id/transactions', authenticate, requireStationStateAccess(), async (req, res) => {
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
router.get('/:id/logs', authenticate, requireStationStateAccess(), async (req, res) => {
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
 * @route   GET /api/stations/:id/activity
 * @desc    Return a unified, read-only station activity timeline
 * @access  Private
 */
router.get('/:id/activity', authenticate, requireStationStateAccess(), async (req, res) => {
    try {
        const chargePointId = req.params.id;
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 40, 1), 100);
        const [transactions, messages] = await Promise.all([
            Transaction.findAll({
                where: { chargePointId },
                attributes: ['id', 'transactionId', 'idTag', 'connectorId', 'status', 'startTime', 'stopTime', 'energyDelivered', 'amount', 'reason', 'stopReason', 'billedAt'],
                order: [['startTime', 'DESC']],
                limit
            }),
            OcppMessage.findAll({
                where: { chargePointId },
                attributes: ['id', 'messageId', 'message_type', 'status', 'direction', 'timestamp', 'createdAt', 'errorCode', 'errorDescription', 'payload'],
                order: [['createdAt', 'DESC']],
                limit
            })
        ]);
        const events = [
            ...transactions.map(row => ({
                id: `transaction-${row.id}`,
                type: 'transaction',
                timestamp: row.stopTime || row.startTime || row.createdAt,
                title: row.status === 'InProgress' ? 'Charging session started' : `Charging session ${String(row.status || 'unknown').toLowerCase()}`,
                detail: `Transaction #${row.transactionId} · ${row.idTag}`,
                status: row.status,
                transaction: row
            })),
            ...messages.map(row => ({
                id: `message-${row.id}`,
                type: 'ocpp',
                timestamp: row.timestamp || row.createdAt,
                title: row.message_type,
                detail: `${row.direction} message${row.errorCode ? ` · ${row.errorCode}` : ''}`,
                status: row.status || row.direction,
                message: row
            }))
        ].sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0)).slice(0, limit * 2);
        res.json({ success: true, events, count: events.length, generatedAt: new Date().toISOString() });
    } catch (error) {
        logger.error(`Error fetching activity for station ${req.params.id}:`, error);
        res.status(500).json({ success: false, message: 'Failed to retrieve station activity' });
    }
});

/**
 * @route   GET /api/stations/:id/firmware
 * @desc    Get durable firmware update state and OCPP firmware status history
 * @access  Private
 */
router.get('/:id/firmware', authenticate, requirePermission('stations.view'), requireStationStateAccess(), async (req, res) => {
    try {
        const chargePointId = req.params.id;
        const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
        const station = await ChargingStation.findOne({
            where: { chargePointId },
            attributes: ['chargePointId', 'name', 'model', 'vendor', 'firmwareVersion', 'currentTransaction']
        });
        if (!station) {
            return res.status(404).json({ success: false, message: 'Charging station not found' });
        }

        const [updates, latestUpdate, statusEvents, activeSessions] = await Promise.all([
            FirmwareUpdate.findAndCountAll({
                where: { chargePointId },
                order: [['requestedAt', 'DESC'], ['id', 'DESC']],
                limit,
                offset: (page - 1) * limit
            }),
            FirmwareUpdate.findOne({
                where: { chargePointId },
                order: [['requestedAt', 'DESC'], ['id', 'DESC']]
            }),
            OcppMessage.findAll({
                where: {
                    chargePointId,
                    direction: 'Inbound',
                    message_type: 'FirmwareStatusNotification'
                },
                attributes: ['id', 'messageId', 'status', 'payload', 'createdAt', 'processedAt', 'processingError'],
                order: [['createdAt', 'DESC']],
                limit: 30
            }),
            Transaction.count({ where: { chargePointId, status: 'InProgress' } })
        ]);

        return res.json({
            success: true,
            station: {
                ...station.toJSON(),
                isConnected: ocppServer.isConnected(chargePointId),
                hasActiveSession: activeSessions > 0
            },
            latest: latestUpdate,
            updates: updates.rows,
            count: updates.count,
            page,
            limit,
            statusEvents,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching firmware history for ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: 'Failed to retrieve firmware history' });
    }
});

/**
 * @route   POST /api/stations/:id/firmware/update
 * @desc    Upload or reference firmware and dispatch an OCPP 1.6 UpdateFirmware request
 * @access  Private/Station managers
 */
router.post(
    '/:id/firmware/update',
    authenticate,
    requirePermission('stations.update'),
    requireStationStateAccess(),
    requireSafeFirmwareTarget,
    parseFirmwareUpload,
    async (req, res) => {
        let update = null;
        try {
            const chargePointId = req.params.id;
            const uploadedLocation = req.file ? publicFirmwareUrl(req, req.file.filename) : null;
            const location = uploadedLocation || validateFirmwareLocation(req.body.location);
            if (!location) {
                cleanupFirmwareFile(req.file);
                return res.status(400).json({
                    success: false,
                    message: 'Provide a valid HTTP(S) firmware URL or select a supported firmware file'
                });
            }

            const retries = parseIntegerInRange(req.body.retries, 0, 0, 10);
            const retryInterval = parseIntegerInRange(req.body.retryInterval, 0, 0, 86400);
            if (retries === null || retryInterval === null) {
                cleanupFirmwareFile(req.file);
                return res.status(400).json({
                    success: false,
                    message: 'Retries must be 0–10 and retry interval must be 0–86,400 seconds'
                });
            }

            const now = Date.now();
            let retrieveDate = req.body.retrieveDate ? new Date(req.body.retrieveDate) : new Date(now + 10000);
            if (Number.isNaN(retrieveDate.getTime())) {
                cleanupFirmwareFile(req.file);
                return res.status(400).json({ success: false, message: 'Retrieve date is invalid' });
            }
            if (retrieveDate.getTime() < now - 60000) {
                cleanupFirmwareFile(req.file);
                return res.status(400).json({ success: false, message: 'Retrieve date cannot be in the past' });
            }
            if (retrieveDate.getTime() < now) retrieveDate = new Date(now + 10000);
            if (retrieveDate.getTime() > now + (365 * 24 * 60 * 60 * 1000)) {
                cleanupFirmwareFile(req.file);
                return res.status(400).json({ success: false, message: 'Retrieve date cannot be more than one year ahead' });
            }

            const targetVersion = String(req.body.targetVersion || '').trim().slice(0, 255) || null;
            const releaseNotes = String(req.body.releaseNotes || '').trim().slice(0, 2000) || null;
            const checksumSha256 = req.file ? await sha256File(req.file.path) : null;

            const requestMessageId = crypto.randomUUID();
            update = await FirmwareUpdate.create({
                chargePointId,
                requestMessageId,
                location,
                source: req.file ? 'upload' : 'url',
                targetVersion,
                originalFilename: req.file?.originalname || null,
                storageFilename: req.file?.filename || null,
                fileSize: req.file?.size || null,
                checksumSha256,
                retrieveDate,
                retries,
                retryInterval,
                status: 'Dispatching',
                requestedBy: req.user?.id || null,
                requestedByName: req.user?.name || req.user?.username || null,
                requestedAt: new Date(),
                currentFirmwareVersion: req.firmwareStation.firmwareVersion || null,
                metadata: releaseNotes ? { releaseNotes } : null
            });

            const result = await ocppServer.sendOcppRequest(
                chargePointId,
                'UpdateFirmware',
                {
                    location,
                    retrieveDate: retrieveDate.toISOString(),
                    retries,
                    retryInterval
                },
                { messageId: requestMessageId }
            );

            if (!result.success) {
                await update.update({
                    status: 'CommandFailed',
                    statusMessage: result.error || 'The firmware command could not be delivered',
                    failedAt: new Date(),
                    lastStatusAt: new Date()
                });
                return res.status(409).json({
                    success: false,
                    message: result.error || 'The firmware command could not be delivered',
                    update
                });
            }

            await FirmwareUpdate.update(
                {
                    status: 'CommandSent',
                    statusMessage: 'OCPP UpdateFirmware command delivered to the station socket',
                    lastStatusAt: new Date()
                },
                { where: { id: update.id, status: 'Dispatching' } }
            );
            await update.reload();

            return res.status(202).json({
                success: true,
                message: 'Firmware update command sent. Progress will update when the station reports its status.',
                update
            });
        } catch (error) {
            if (!update) cleanupFirmwareFile(req.file);
            if (update) {
                await update.update({
                    status: 'CommandFailed',
                    statusMessage: String(error.message || error).slice(0, 2000),
                    failedAt: new Date(),
                    lastStatusAt: new Date()
                }).catch(() => {});
            }
            logger.error(`Error dispatching firmware update for ${req.params.id}:`, error);
            return res.status(500).json({ success: false, message: 'Failed to dispatch firmware update' });
        }
    }
);

/**
 * @route   POST /api/stations/:id/remote-start
 * @desc    Send RemoteStartTransaction command
 * @access  Private/Operator
 */
router.post('/:id/remote-start', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
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
router.post('/:id/remote-stop', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
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

        const commandTransactionId = await resolveCanonicalOcppTransactionId({
            chargePointId,
            connectorId: transaction.connectorId,
            fallbackTransactionId: transaction.transactionId
        });
        if (!Number.isSafeInteger(Number(commandTransactionId)) || Number(commandTransactionId) <= 0) {
            return res.status(409).json({
                success: false,
                message: 'The charger transaction ID is not available yet; please retry shortly'
            });
        }

        // 4. Send RemoteStopTransaction command using the charger transaction ID.
        const result = await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
            transactionId: Number(commandTransactionId)
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
            transactionId: Number(transactionId),
            ocppTransactionId: Number(commandTransactionId),
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
router.post('/:id/reset', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
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
router.post('/:id/trigger-boot', authenticate, requirePermission('stations.remote_control'), requireStationStateAccess(), async (req, res) => {
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
 * @route   POST /api/stations/bulk-delete
 * @desc    Delete multiple stations while retaining billing and OCPP history
 * @access  Private/Admin
 */
router.post('/bulk-delete', authenticate, requirePermission('stations.delete'), requireBulkStationStateAccess, async (req, res) => {
    const stationIds = [...new Set(
        (Array.isArray(req.body?.stationIds) ? req.body.stationIds : [])
            .map(value => String(value).trim())
            .filter(Boolean)
    )];

    if (!stationIds.length || stationIds.length > 100) {
        return res.status(400).json({
            success: false,
            message: 'Select between 1 and 100 charging stations'
        });
    }

    const outcomes = await Promise.all(stationIds.map(async stationId => {
        try {
            const station = await removeStationById(stationId);
            logger.info(`Station deleted through bulk action: ${stationId}`);
            return { success: true, station };
        } catch (error) {
            if (error.code === 'STATION_NOT_FOUND') {
                return {
                    success: true,
                    station: { chargePointId: stationId, alreadyDeleted: true }
                };
            }
            const failure = {
                chargePointId: stationId,
                code: error.code || 'DELETE_FAILED',
                message: error.status ? error.message : 'Could not delete this station'
            };
            logger.error(`Bulk station deletion failed for ${stationId}: ${error.message}`);
            return { success: false, failure };
        }
    }));
    const deleted = outcomes.filter(outcome => outcome.success).map(outcome => outcome.station);
    const failed = outcomes.filter(outcome => !outcome.success).map(outcome => outcome.failure);

    res.json({
        success: failed.length === 0,
        message: failed.length
            ? `${deleted.length} station${deleted.length === 1 ? '' : 's'} deleted; ${failed.length} could not be deleted`
            : `${deleted.length} station${deleted.length === 1 ? '' : 's'} deleted successfully`,
        deleted,
        failed
    });
});

/**
 * @route   DELETE /api/stations/:id
 * @desc    Delete a charging station while retaining billing and OCPP history
 * @access  Private/Admin
 */
router.delete('/:id', authenticate, requirePermission('stations.delete'), requireStationStateAccess(), async (req, res) => {
    try {
        logger.info(`DELETE station request received for: ${req.params.id}`);
        const result = await removeStationById(req.params.id);
        logger.info(`Station deleted: ${req.params.id}`);

        res.json({
            success: true,
            message: 'Charging station deleted successfully; historical sessions were preserved',
            station: result
        });
    } catch (error) {
        logger.error(`Error deleting station ${req.params.id}: ${error.message}`);
        res.status(error.status || 500).json({
            success: false,
            code: error.code || 'DELETE_FAILED',
            message: error.status ? error.message : 'Could not delete the charging station safely'
        });
    }
});

/**
 * @route   POST /api/stations
 * @desc    Create a new charging station
 * @access  Private/Admin
 */
router.post('/', authenticate, requirePermission('stations.create'), requireNewStationStateAccess, async (req, res) => {
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
router.put('/:id', authenticate, requirePermission('stations.update'), requireStationStateAccess(), async (req, res) => {
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
        const stationWhere = await scopedStationWhere(req.user);
        const scopedStations = await ChargingStation.findAll({ where: stationWhere, attributes: ['chargePointId'], raw: true });
        // Get count of all stations (with error handling)
        const totalStations = scopedStations.length;

        // Get count of connected stations (with null check)
        let connectedStations = 0;
        try {
            connectedStations = scopedStations.filter(station => ocppServer.isConnected(station.chargePointId)).length;
        } catch (error) {
            logger.error('Error getting connected stations:', error);
        }

        // Get count of active transactions (with error handling)
        let activeTransactions = 0;
        try {
            activeTransactions = await Transaction.count({
                where: await scopedTransactionWhere(req.user, { status: 'InProgress' })
            });
        } catch (error) {
            logger.error('Error counting active transactions:', error);
        }

        // Get total energy delivered today
        let energyToday = 0;
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const energyWhere = await scopedTransactionWhere(req.user, {
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
                });
            const energy = await Transaction.sum('energyDelivered', { where: energyWhere });

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
