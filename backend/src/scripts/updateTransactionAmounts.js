/**
 * One-time script to update all existing transaction records with calculated amounts
 * based on current pricing settings.
 */
const { sequelize, Transaction, Settings } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

// Main function to update all transaction amounts
async function updateTransactionAmounts() {
  logger.info('Starting to update transaction amounts...');
  
  try {
    // Get current pricing settings
    const pricingSettings = await Settings.findAll({ 
      where: { category: 'pricing' },
      attributes: ['key', 'value']
    });
    
    // Convert to settings object
    const settings = {};
    pricingSettings.forEach(setting => {
      settings[setting.key] = setting.value?.data;
    });
    
    // Set default values if settings are missing
    const baseRate = settings.baseRate || 120; // Default to 120 if not set
    const minimumCharge = settings.minimumCharge || 500; // Default to 500 if not set
    const memberDiscount = settings.memberDiscount || 10; // Default to 10% if not set
    
    logger.info(`Using pricing settings: baseRate=${baseRate}, minimumCharge=${minimumCharge}, memberDiscount=${memberDiscount}`);
    
    // Get all transactions with amount = 0 or null
    const transactions = await Transaction.findAll({
      where: {
        // Only update transactions that haven't had their amount set yet
        amount: {
          [Op.or]: [0, null]
        },
        // Only update completed transactions (with energyDelivered value)
        status: {
          [Op.ne]: 'InProgress'
        }
      }
    });
    
    logger.info(`Found ${transactions.length} transactions to update`);
    
    // Loop through each transaction and update it
    let successCount = 0;
    let errorCount = 0;
    
    for (const transaction of transactions) {
      try {
        // Get energy delivered
        // OCPP meter values are in Wh (Watt-hours), convert to kWh by dividing by 1000
        const energy = (parseFloat(transaction.energyDelivered) || 0) / 1000;
        
        // Calculate the transaction amount
        let amount = energy * baseRate;
        
        // Apply minimum charge
        amount = Math.max(amount, minimumCharge);
        
        // Apply member discount if applicable
        const isMember = transaction.idTag && transaction.idTag.includes('MEMBER');
        if (isMember) {
          amount = amount * (1 - memberDiscount / 100);
        }
        
        // Update the transaction with the calculated amount
        await transaction.update({ amount });
        
        logger.info(`Updated transaction ${transaction.transactionId}: energy=${energy}, amount=${amount}`);
        successCount++;
      } catch (error) {
        logger.error(`Error updating transaction ${transaction.transactionId}:`, error);
        errorCount++;
      }
    }
    
    logger.info(`Completed updating transaction amounts. Success: ${successCount}, Errors: ${errorCount}`);
    return { success: successCount, errors: errorCount };
  } catch (error) {
    logger.error('Error in updateTransactionAmounts:', error);
    throw error;
  } finally {
    // Close the database connection when done
    sequelize.close();
  }
}

// Execute the function if this script is run directly
if (require.main === module) {
  updateTransactionAmounts()
    .then(result => {
      logger.info(`Script completed. Updated ${result.success} transactions with ${result.errors} errors.`);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Script failed:', error);
      process.exit(1);
    });
} else {
  // Export for use in other modules
  module.exports = { updateTransactionAmounts };
}
