const { Transaction } = require('../models');
const logger = require('../utils/logger');

/**
 * Route handler for completing transactions manually
 * This is a specialized route to avoid conflicts with other routes
 */
module.exports = async (req, res) => {
  try {
    const transactionId = req.params.id;
    
    // Try to find by transactionId first (which may be a numeric ID)
    let transaction = await Transaction.findOne({
      where: { transactionId: parseInt(transactionId) || transactionId }
    });
    
    // If not found, try looking up by the database ID
    if (!transaction) {
      transaction = await Transaction.findByPk(transactionId);
    }
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    // Only update if transaction is in progress or has no status
    if (transaction.status !== 'InProgress' && transaction.status !== null) {
      return res.status(400).json({
        success: false,
        message: `Cannot complete transaction with status: ${transaction.status}`
      });
    }
    
    // Set end time if not already set
    const endTime = transaction.stopTime || new Date();
    
    // Update the transaction
    await transaction.update({
      status: 'Completed',
      stopTime: endTime,
      stopReason: req.body.reason || 'Manually completed due to error',
      updatedAt: new Date()
    });
    
    logger.info(`Transaction ${transactionId} manually marked as complete through dedicated endpoint`);
    
    res.json({
      success: true,
      message: 'Transaction marked as complete',
      transaction
    });
  } catch (error) {
    logger.error(`Error marking transaction ${req.params.id} as complete:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark transaction as complete'
    });
  }
};
