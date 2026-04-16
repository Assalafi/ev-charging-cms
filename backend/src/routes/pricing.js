const express = require('express');
const { authenticate, authorize } = require('../middleware/auth');
const { Settings, sequelize } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @route   GET /api/pricing
 * @desc    Get pricing settings
 * @access  Private/Admin
 */
// Simple test endpoint that doesn't require database access
router.get('/test', async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Pricing API test endpoint working',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error in test endpoint:', error);
    res.status(500).json({ success: false, message: 'Test endpoint error' });
  }
});

// Pricing endpoint that retrieves values from the database with fallback to defaults
router.get('/', authenticate, async (req, res) => {
  logger.info('Pricing settings GET request received');
  
  try {
    // Default pricing settings to use if database values are missing
    const defaultSettings = {
      baseRatePerKwh: 120,   // Base rate in Naira (₦120/kWh)
      peakHourRate: 20,     // Percentage increase during peak hours
      offPeakRate: 10,      // Percentage discount during off-peak hours
      memberDiscount: 10,   // Percentage discount for members
      minimumCharge: 100,   // Minimum charge in Naira (₦100)
      peakHoursStart: 9,    // Peak hours start (9 AM)
      peakHoursEnd: 22,     // Peak hours end (10 PM)
      currencySymbol: '₦'   // Nigerian Naira symbol
    };
    
    // Get settings from database
    let dbSettings;
    try {
      dbSettings = await Settings.findAll({
        where: { category: 'pricing' }
      });
      logger.info(`Retrieved ${dbSettings.length} pricing settings from database`);
    } catch (dbError) {
      logger.error('Database error when fetching pricing settings:', dbError);
      // If database query fails, fall back to default settings
      return res.json({
        success: true,
        settings: defaultSettings,
        message: 'Using default pricing (database error)'
      });
    }
    
    // If no settings found, return defaults
    if (!dbSettings || dbSettings.length === 0) {
      logger.info('No pricing settings found in database, using defaults');
      return res.json({
        success: true,
        settings: defaultSettings
      });
    }
    
    // Build settings object from database values
    const pricingSettings = {};
    dbSettings.forEach(setting => {
      try {
        if (setting.key) {
          // Handle different data formats that might be stored
          if (setting.value?.data !== undefined) {
            pricingSettings[setting.key] = setting.value.data;
          } else {
            pricingSettings[setting.key] = setting.value;
          }
        }
      } catch (parseError) {
        logger.error(`Error parsing setting ${setting.key}:`, parseError);
      }
    });
    
    // Ensure all required fields exist by applying defaults for missing values
    Object.keys(defaultSettings).forEach(key => {
      if (pricingSettings[key] === undefined) {
        pricingSettings[key] = defaultSettings[key];
      }
    });
    
    logger.info('Returning pricing settings from database with defaults applied where needed');
    
    res.json({
      success: true,
      settings: pricingSettings
    });
  } catch (error) {
    logger.error('Error in simplified pricing endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve pricing settings'
    });
  }
});

/**
 * @route   PUT /api/pricing
 * @desc    Update pricing settings
 * @access  Private/Admin
 */
router.put('/', authenticate, async (req, res) => {
  try {
    const updatedSettings = req.body;
    logger.info('Received pricing settings update:', updatedSettings);
    
    // Update settings using transaction
    const transaction = await sequelize.transaction();
    try {
      for (const [key, value] of Object.entries(updatedSettings)) {
        logger.info(`Updating pricing setting ${key} with value ${value}`);
        
        // Check if setting exists first
        const existingSetting = await Settings.findOne({
          where: {
            category: 'pricing',
            key
          }
        });
        
        if (existingSetting) {
          logger.info(`Setting ${key} exists, updating...`);
          await existingSetting.update({
            value: value
          }, { transaction });
        } else {
          logger.info(`Setting ${key} does not exist, creating...`);
          await Settings.create({
            category: 'pricing',
            key,
            value: value
          }, { transaction });
        }
      }
      await transaction.commit();
      
      // Query the database to confirm updates
      const updatedDbSettings = await Settings.findAll({
        where: { category: 'pricing' }
      });
      
      logger.info(`Updated ${updatedDbSettings.length} pricing settings in database`);
      
      res.json({
        success: true,
        settings: updatedSettings,
        message: 'Pricing settings updated successfully'
      });
    } catch (err) {
      logger.error('Transaction error when updating settings:', err);
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    logger.error('Error updating pricing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update pricing settings'
    });
  }
});

module.exports = router;
