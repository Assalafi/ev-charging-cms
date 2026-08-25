const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const {
    Settings,
    sequelize
} = require('../models');
const logger = require('../utils/logger');

const router = express.Router();
const brandingDirectory = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../..', 'uploads'), 'branding');
const BRANDING_DEFAULTS = {
    systemName: 'EV Charge',
    shortName: 'EV Charge',
    loginSubtitle: 'Network management',
    metaTitle: 'EV Charge - Charging Management System',
    metaDescription: 'Smart EV charging network management system',
    metaKeywords: 'EV charging, electric vehicles, charging stations',
    primaryColor: '#2563EB',
    secondaryColor: '#0E9F6E',
    logoUrl: null,
    faviconUrl: null
};

const extensionFor = file => {
    const extensions = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/webp': '.webp',
        'image/x-icon': '.ico',
        'image/vnd.microsoft.icon': '.ico'
    };
    return extensions[file.mimetype];
};

const brandingUpload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            fs.mkdirSync(brandingDirectory, { recursive: true });
            callback(null, brandingDirectory);
        },
        filename: (req, file, callback) => {
            callback(null, `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extensionFor(file) || '.img'}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 2 },
    fileFilter: (req, file, callback) => {
        const allowedByField = {
            logo: new Set(['image/png', 'image/jpeg', 'image/webp']),
            favicon: new Set(['image/png', 'image/x-icon', 'image/vnd.microsoft.icon'])
        };
        if (!allowedByField[file.fieldname]?.has(file.mimetype)) {
            return callback(new Error(file.fieldname === 'favicon'
                ? 'Favicon must be a PNG or ICO image'
                : 'Logo must be a PNG, JPG or WebP image'));
        }
        callback(null, true);
    }
});

function brandingValue(setting) {
    return { ...BRANDING_DEFAULTS, ...(setting?.value?.data || setting?.value || {}) };
}

function cleanBrandingInput(body, current) {
    const text = (key, max) => String(body[key] ?? current[key] ?? '').trim().slice(0, max);
    const color = (key, fallback) => /^#[0-9a-f]{6}$/i.test(String(body[key] || '')) ? String(body[key]).toUpperCase() : fallback;
    return {
        ...current,
        systemName: text('systemName', 80) || BRANDING_DEFAULTS.systemName,
        shortName: text('shortName', 40) || BRANDING_DEFAULTS.shortName,
        loginSubtitle: text('loginSubtitle', 100) || BRANDING_DEFAULTS.loginSubtitle,
        metaTitle: text('metaTitle', 120) || BRANDING_DEFAULTS.metaTitle,
        metaDescription: text('metaDescription', 300) || BRANDING_DEFAULTS.metaDescription,
        metaKeywords: text('metaKeywords', 300),
        primaryColor: color('primaryColor', current.primaryColor || BRANDING_DEFAULTS.primaryColor),
        secondaryColor: color('secondaryColor', current.secondaryColor || BRANDING_DEFAULTS.secondaryColor)
    };
}

async function getBrandingSetting() {
    return Settings.findOne({ where: { category: 'branding', key: 'profile' } });
}

function deleteOwnedBrandingFile(url) {
    if (!url || !String(url).startsWith('/public/branding/')) return;
    const target = path.resolve(brandingDirectory, path.basename(String(url)));
    if (target.startsWith(`${brandingDirectory}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
}

// Public because the login page and browser metadata need branding before sign-in.
router.get('/branding', async (req, res) => {
    try {
        const setting = await getBrandingSetting();
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, settings: brandingValue(setting) });
    } catch (error) {
        logger.error('Error fetching branding settings:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve branding settings' });
    }
});

router.put(
    '/branding',
    authenticate,
    requirePermission('settings.manage'),
    (req, res, next) => brandingUpload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }])(req, res, error => {
        if (error) return res.status(400).json({ success: false, message: error.message });
        next();
    }),
    async (req, res) => {
        try {
            const setting = await getBrandingSetting();
            const current = brandingValue(setting);
            const updated = cleanBrandingInput(req.body, current);
            const logo = req.files?.logo?.[0];
            const favicon = req.files?.favicon?.[0];
            if (logo) updated.logoUrl = `/public/branding/${logo.filename}`;
            if (favicon) updated.faviconUrl = `/public/branding/${favicon.filename}`;
            if (req.body.removeLogo === 'true' && !logo) updated.logoUrl = null;
            if (req.body.removeFavicon === 'true' && !favicon) updated.faviconUrl = null;
            updated.revision = Date.now();

            await Settings.upsert({
                category: 'branding',
                key: 'profile',
                value: { data: updated },
                settings: updated
            });

            if (current.logoUrl && current.logoUrl !== updated.logoUrl) deleteOwnedBrandingFile(current.logoUrl);
            if (current.faviconUrl && current.faviconUrl !== updated.faviconUrl) deleteOwnedBrandingFile(current.faviconUrl);

            res.json({ success: true, message: 'Branding updated successfully', settings: updated });
        } catch (error) {
            logger.error('Error updating branding settings:', error);
            Object.values(req.files || {}).flat().forEach(file => {
                try { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); } catch (_) { /* cleanup only */ }
            });
            res.status(500).json({ success: false, message: 'Failed to update branding settings' });
        }
    }
);

/**
 * @route   GET /api/settings/general
 * @desc    Get general settings
 * @access  Private/Admin
 */
router.get('/general', authenticate, requirePermission('settings.view'), async (req, res) => {
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
router.put('/general', authenticate, requirePermission('settings.manage'), async (req, res) => {
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
router.get('/ocpp', authenticate, requirePermission('settings.view'), async (req, res) => {
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
router.put('/ocpp', authenticate, requirePermission('settings.manage'), async (req, res) => {
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
router.get('/notifications', authenticate, requirePermission('settings.view'), async (req, res) => {
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
router.put('/notifications', authenticate, requirePermission('settings.manage'), async (req, res) => {
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
