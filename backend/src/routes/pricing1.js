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
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Get pricing settings from database
    const settings = await Settings.findAll({ 
      where: { category: 'pricing' },
      attributes: ['key', 'value']
    });
    
    // Transform to key-value object
    const settingsObj = {};
    
    if (settings.length === 0) {
      // Create default pricing settings if not found
      const defaultSettings = {
        baseRatePerKwh: 120,
        peakHourRate: 150,
        offPeakRate: 100,
        memberDiscount: 10,
        minimumCharge: 100
      };
      
      // Save default settings to database
      const transaction = await sequelize.transaction();
      try {
        for (const [key, value] of Object.entries(defaultSettings)) {
          await Settings.create({
            category: 'pricing',
            key,
            value: { data: value }
          }, { transaction });
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
        settingsObj[setting.key] = setting.value?.data;
      });
    }
    
    res.json({
      success: true,
      settings: settingsObj
    });
  } catch (error) {
    logger.error('Error fetching pricing settings:', error);
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
router.put('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const updatedSettings = req.body;
    
    // Update settings using transaction
    const transaction = await sequelize.transaction();
    try {
      for (const [key, value] of Object.entries(updatedSettings)) {
        await Settings.upsert({
          category: 'pricing',
          key,
          value: { data: value }
        }, { transaction });
      }
      await transaction.commit();
      
      res.json({
        success: true,
        settings: updatedSettings,
        message: 'Pricing settings updated successfully'
      });
    } catch (err) {
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
