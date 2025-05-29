const express = require('express');
const {
    authenticate,
    authorize
} = require('../middleware/auth');
const {
    Settings,
    sequelize
} = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/settings/general
 * @desc    Get general settings
 * @access  Private/Admin
 */
router.get('/general', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get general settings from database
        const settings = await Settings.findAll({
            where: {
                category: 'general'
            },
            attributes: ['key', 'value']
        });

        // Transform to key-value object
        const settingsObj = {};

        if (settings.length === 0) {
            // Create default general settings if not found
            const defaultSettings = {
                companyName: 'EV Charging Company Nigeria',
                defaultCurrency: 'NGN',
                defaultLanguage: 'en',
                timeZone: 'Africa/Lagos',
                dateFormat: 'DD/MM/YYYY',
                timeFormat: '24h'
            };

            // Save default settings to database
            const transaction = await sequelize.transaction();
            try {
                for (const [key, value] of Object.entries(defaultSettings)) {
                    await Settings.create({
                        category: 'general',
                        key,
                        value: {
                            data: value
                        }
                    }, {
                        transaction
                    });
                    settingsObj[key] = value;
                }
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } else {
            // Map existing settings
            settings.forEach(setting => {
                settingsObj[setting.key] = setting.value && setting.value.data ? setting.value.data : undefined;
            });
        }

        res.json({
            success: true,
            settings: settingsObj
        });
    } catch (error) {
        logger.error('Error fetching general settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve general settings'
        });
    }
});

/**
 * @route   PUT /api/settings/general
 * @desc    Update general settings
 * @access  Private/Admin
 */
router.put('/general', authenticate, authorize('admin'), async (req, res) => {
    try {
        const updatedSettings = req.body;

        // Update settings using transaction
        const transaction = await sequelize.transaction();
        try {
            for (const [key, value] of Object.entries(updatedSettings)) {
                await Settings.upsert({
                    category: 'general',
                    key,
                    value: {
                        data: value
                    }
                }, {
                    transaction
                });
            }
            await transaction.commit();

            res.json({
                success: true,
                settings: updatedSettings,
                message: 'General settings updated successfully'
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        logger.error('Error updating general settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update general settings'
        });
    }
});

/**
 * @route   GET /api/settings/ocpp
 * @desc    Get OCPP settings
 * @access  Private/Admin
 */
router.get('/ocpp', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get OCPP settings from database
        const settings = await Settings.findAll({
            where: {
                category: 'ocpp'
            },
            attributes: ['key', 'value']
        });

        // Transform to key-value object
        const settingsObj = {};

        if (settings.length === 0) {
            // Create default OCPP settings if not found
            const defaultSettings = {
                heartbeatInterval: 60,
                meterValueInterval: 60,
                meterValueSampleInterval: 60,
                connectionTimeoutSecs: 30,
                resetRetries: 3
            };

            // Save default settings to database
            const transaction = await sequelize.transaction();
            try {
                for (const [key, value] of Object.entries(defaultSettings)) {
                    await Settings.create({
                        category: 'ocpp',
                        key,
                        value: {
                            data: value
                        }
                    }, {
                        transaction
                    });
                    settingsObj[key] = value;
                }
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } else {
            // Map existing settings
            settings.forEach(setting => {
                settingsObj[setting.key] = setting.value && setting.value.data ? setting.value.data : undefined;
            });
        }

        res.json({
            success: true,
            settings: settingsObj
        });
    } catch (error) {
        logger.error('Error fetching OCPP settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve OCPP settings'
        });
    }
});

/**
 * @route   PUT /api/settings/ocpp
 * @desc    Update OCPP settings
 * @access  Private/Admin
 */
router.put('/ocpp', authenticate, authorize('admin'), async (req, res) => {
    try {
        const updatedSettings = req.body;

        // Update settings using transaction
        const transaction = await sequelize.transaction();
        try {
            for (const [key, value] of Object.entries(updatedSettings)) {
                await Settings.upsert({
                    category: 'ocpp',
                    key,
                    value: {
                        data: value
                    }
                }, {
                    transaction
                });
            }
            await transaction.commit();

            res.json({
                success: true,
                settings: updatedSettings,
                message: 'OCPP settings updated successfully'
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        logger.error('Error updating OCPP settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update OCPP settings'
        });
    }
});

/**
 * @route   GET /api/settings/notifications
 * @desc    Get notification settings
 * @access  Private/Admin
 */
router.get('/notifications', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get notification settings from database
        const settings = await Settings.findAll({
            where: {
                category: 'notifications'
            },
            attributes: ['key', 'value']
        });

        // Transform to key-value object
        const settingsObj = {};

        if (settings.length === 0) {
            // Create default notification settings if not found
            const defaultSettings = {
                emailNotifications: true,
                stationStatusAlerts: true,
                transactionAlerts: false,
                errorAlerts: true,
                dailyReports: false,
                weeklyReports: true,
                monthlyReports: true
            };

            // Save default settings to database
            const transaction = await sequelize.transaction();
            try {
                for (const [key, value] of Object.entries(defaultSettings)) {
                    await Settings.create({
                        category: 'notifications',
                        key,
                        value: {
                            data: value
                        }
                    }, {
                        transaction
                    });
                    settingsObj[key] = value;
                }
                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } else {
            // Map existing settings
            settings.forEach(setting => {
                settingsObj[setting.key] = setting.value && setting.value.data ? setting.value.data : undefined;
            });
        }

        res.json({
            success: true,
            settings: settingsObj
        });
    } catch (error) {
        logger.error('Error fetching notification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve notification settings'
        });
    }
});

/**
 * @route   PUT /api/settings/notifications
 * @desc    Update notification settings
 * @access  Private/Admin
 */
router.put('/notifications', authenticate, authorize('admin'), async (req, res) => {
    try {
        const updatedSettings = req.body;

        // Update settings using transaction
        const transaction = await sequelize.transaction();
        try {
            for (const [key, value] of Object.entries(updatedSettings)) {
                await Settings.upsert({
                    category: 'notifications',
                    key,
                    value: {
                        data: value
                    }
                }, {
                    transaction
                });
            }
            await transaction.commit();

            res.json({
                success: true,
                settings: updatedSettings,
                message: 'Notification settings updated successfully'
            });
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (error) {
        logger.error('Error updating notification settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification settings'
        });
    }
});

module.exports = router;