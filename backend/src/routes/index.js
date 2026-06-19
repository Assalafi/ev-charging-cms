const express = require('express');
const authRoutes = require('./auth');
const stationRoutes = require('./stations');
const transactionRoutes = require('./transactions');
const { authenticate } = require('../middleware/auth'); // Import the authenticate middleware
const ocppRoutes = require('./ocpp');
const settingsRoutes = require('./settings');
const pricingRoutes = require('./pricing');
const remoteCommandsRoutes = require('./remoteCommands');
const remoteControlRoutes = require('./remoteControl');
const meterValuesRoutes = require('./meterValues');
const tagsRoutes = require('./tags');
const reconciliationRoutes = require('./admin/reconciliation');
const mobileRoutes = require('./mobile');
const adminMobileUsersRoutes = require('./admin/mobileUsers');
const adminLocationsRoutes = require('./admin/locations');
const adminPaymentsRoutes = require('./admin/payments');
const adminAdsBoardRoutes = require('./admin/adsBoard');
// Temporarily commenting out simulator routes due to import issues
// const simulatorRoutes = require('./simulator');

const router = express.Router();

// API routes
router.use('/auth', authRoutes);
router.use('/stations', stationRoutes);
router.use('/transactions', transactionRoutes);
router.use('/ocpp', ocppRoutes);

// Direct route for marking transactions as complete (to avoid routing conflicts)
router.post('/complete-transaction/:id', authenticate, require('./completeTransaction'));
router.use('/settings', settingsRoutes);
router.use('/pricing', pricingRoutes);
router.use('/remote-commands', remoteCommandsRoutes);
router.use('/remote', remoteControlRoutes); // New OCPP 1.6 compliant remote control endpoints
router.use('/meter-values', meterValuesRoutes);
router.use('/tags', tagsRoutes);
router.use('/admin/reconciliation', reconciliationRoutes);
router.use('/admin/mobile-users', adminMobileUsersRoutes);
router.use('/admin/locations', adminLocationsRoutes);
router.use('/admin/payments', adminPaymentsRoutes);
router.use('/admin/ads-board', adminAdsBoardRoutes);
router.use('/mobile', mobileRoutes);
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