/**
 * Global pricing validation utility
 * Makes sure the system has access to required pricing settings
 */
const logger = require('./logger');
const { Settings } = require('../models');

/**
 * Validates that required pricing settings exist in the database
 * @param {string} context - Where this validation is being performed (for logging)
 * @returns {Promise<{isValid: boolean, settings: Object, error: string|null}>}
 */
async function validatePricingSettings(context = 'unknown') {
  try {
    logger.info(`Validating pricing settings (context: ${context})`);
    
    // Get all pricing settings from the database
    const pricingSettings = await Settings.findAll({
      where: { category: 'pricing' },
      attributes: ['key', 'value']
    });
    
    // Define default pricing values
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

    // Check if any pricing settings exist
    if (!pricingSettings || pricingSettings.length === 0) {
      // Rather than failing, use default settings
      logger.warn(`No pricing settings found in database (context: ${context}), using defaults`);
      return { isValid: true, settings: defaultSettings, error: null };
    }
    
    // Convert to settings object
    const settings = {};
    pricingSettings.forEach(setting => {
      // Handle both data structures (direct value or nested data property)
      if (setting.value?.data !== undefined) {
        settings[setting.key] = setting.value.data;
      } else if (setting.value !== undefined) {
        settings[setting.key] = setting.value;
      }
      
      // Debug logging for troubleshooting
      logger.info(`Pricing setting found: ${setting.key} = ${JSON.stringify(settings[setting.key])}`);
    });
    
    // List of required pricing keys
    const requiredSettings = ['baseRatePerKwh', 'minimumCharge', 'memberDiscount'];
    const missingSettings = [];
    
    // Apply default values for any missing settings
    for (const key of Object.keys(defaultSettings)) {
      if (settings[key] === undefined) {
        settings[key] = defaultSettings[key];
        logger.warn(`Applied default value for missing setting: ${key} = ${settings[key]} (context: ${context})`);
      }
    }
    
    // Ensure all required settings have valid numeric values
    for (const key of requiredSettings) {
      const value = parseFloat(settings[key]);
      if (isNaN(value)) {
        // If invalid, use default value
        settings[key] = defaultSettings[key];
        logger.warn(`Applied default value for invalid setting: ${key} = ${settings[key]} (context: ${context})`);
      } else {
        // Store the parsed numeric value
        settings[key] = value;
      }
    }
    
    // Log what values we're actually using
    logger.info(`Final pricing settings for ${context}:\n${JSON.stringify(settings, null, 2)}`);
    
    // Make sure currency symbol is set
    if (!settings.currencySymbol) {
      settings.currencySymbol = '₦';
    }
    
    // All validations passed
    logger.info(`Pricing validation successful (context: ${context})`);
    return { isValid: true, settings, error: null };
  } catch (error) {
    const errorMsg = `Error validating pricing settings: ${error.message} (context: ${context})`;
    logger.error(errorMsg);
    return { isValid: false, settings: {}, error: errorMsg };
  }
}

module.exports = {
  validatePricingSettings
};
