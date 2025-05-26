const express = require('express');
const authRoutes = require('./auth');
const stationRoutes = require('./stations');
const transactionRoutes = require('./transactions');
const ocppRoutes = require('./ocpp');
const settingsRoutes = require('./settings');
const pricingRoutes = require('./pricing');
const remoteCommandsRoutes = require('./remoteCommands');
const remoteControlRoutes = require('./remoteControl');
const meterValuesRoutes = require('./meterValues');
// Temporarily commenting out simulator routes due to import issues
// const simulatorRoutes = require('./simulator');

const router = express.Router();

// API routes
router.use('/auth', authRoutes);
router.use('/stations', stationRoutes);
router.use('/transactions', transactionRoutes);
router.use('/ocpp', ocppRoutes);
router.use('/settings', settingsRoutes);
router.use('/pricing', pricingRoutes);
router.use('/remote-commands', remoteCommandsRoutes);
router.use('/remote', remoteControlRoutes); // New OCPP 1.6 compliant remote control endpoints
router.use('/meter-values', meterValuesRoutes);
// Temporarily commenting out simulator routes due to import issues
// router.use('/simulator', simulatorRoutes);

// Default route
router.get('/', (req, res) => {
    res.json({
        message: 'EV Charging Station CMS API',
        version: '1.0.0'
    });
});

module.exports = router;