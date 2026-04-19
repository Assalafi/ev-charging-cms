const logger = require('../utils/logger');
const { Transaction, ChargingStation, OcppMessage, sequelize } = require('../models');
const { validatePricingSettings } = require('../utils/pricingValidator');

class TransactionMonitor {
  constructor() {
    this.monitoringInterval = null;
    this.checkInterval = 30 * 1000; // Check every 30 seconds
    this.maxInactivityTime = 2 * 60 * 1000; // 2 minutes of inactivity before auto-completion
    this.maxTransactionAge = 24 * 60 * 60 * 1000; // 24 hours max transaction duration
  }

  start() {
    if (this.monitoringInterval) {
      logger.warn('Transaction monitor already running');
      return;
    }

    logger.info('Starting intelligent transaction monitor');
    this.monitoringInterval = setInterval(() => {
      this.checkStuckTransactions();
    }, this.checkInterval);

    // Run initial check
    this.checkStuckTransactions();
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Transaction monitor stopped');
    }
  }

  async checkStuckTransactions() {
    try {
      logger.debug('Checking for stuck transactions...');

      // Find all in-progress transactions
      const inProgressTransactions = await Transaction.findAll({
        where: { status: 'InProgress' },
        include: [{
          model: ChargingStation,
          as: 'charging_station',
          attributes: ['chargePointId', 'status', 'lastHeartbeat', 'lastConnection']
        }]
      });

      logger.info(`Found ${inProgressTransactions.length} in-progress transactions to check`);

      for (const transaction of inProgressTransactions) {
        await this.analyzeTransaction(transaction);
      }

    } catch (error) {
      logger.error('Error checking stuck transactions:', error);
    }
  }

  async analyzeTransaction(transaction) {
    const now = new Date();
    const startTime = new Date(transaction.startTime);
    const transactionAge = now - startTime;
    const station = transaction.charging_station;

    logger.debug(`Analyzing transaction ${transaction.transactionId} for station ${transaction.chargePointId}`);

    // Rule 0: Check if StopTransaction was received for this transaction (most accurate)
    const hasStopTransaction = await this.hasRecentStopTransaction(transaction.chargePointId, transaction.transactionId);
    if (hasStopTransaction) {
      logger.warn(`StopTransaction received for transaction ${transaction.transactionId} but database still shows InProgress`);
      await this.forceCompleteTransaction(transaction, 'StopTransaction message received but database not updated');
      return;
    }

    // Rule 1: Check if transaction is too old (>24 hours)
    if (transactionAge > this.maxTransactionAge) {
      logger.warn(`Transaction ${transaction.transactionId} is older than 24 hours, force completing`);
      await this.forceCompleteTransaction(transaction, 'Transaction timeout - exceeded maximum duration');
      return;
    }

    // Rule 2: Check station status vs transaction status
    if (station && (station.status === 'Available' || station.status === 'Unavailable')) {
      logger.warn(`Station ${transaction.chargePointId} status is ${station.status} but transaction ${transaction.transactionId} is still in progress`);
      await this.forceCompleteTransaction(transaction, `Station status changed to ${station.status} while transaction active`);
      return;
    }

    // Rule 3: Check for recent MeterValues (last 15 minutes)
    const hasRecentMeterValues = await this.hasRecentMeterValues(transaction.chargePointId, 15);
    
    if (!hasRecentMeterValues && station && station.status === 'Charging') {
      logger.warn(`No MeterValues received for station ${transaction.chargePointId} in 15 minutes, but status shows Charging`);
      
      // Check if RemoteStopTransaction commands were sent but ignored
      const ignoredStopCommands = await this.countIgnoredStopCommands(transaction.chargePointId, transaction.transactionId);
      
      if (ignoredStopCommands > 0) {
        logger.warn(`Station ${transaction.chargePointId} ignored ${ignoredStopCommands} RemoteStopTransaction commands`);
        await this.forceCompleteTransaction(transaction, `Station ignored ${ignoredStopCommands} stop commands and stopped sending meter values`);
        return;
      }
    }

    // Rule 4: Check if station is disconnected (no heartbeat for 30 minutes)
    if (station && station.lastHeartbeat) {
      const lastHeartbeat = new Date(station.lastHeartbeat);
      const timeSinceHeartbeat = now - lastHeartbeat;
      
      if (timeSinceHeartbeat > 30 * 60 * 1000) { // 30 minutes
        logger.warn(`Station ${transaction.chargePointId} hasn't sent heartbeat for ${Math.round(timeSinceHeartbeat / 60000)} minutes`);
        await this.forceCompleteTransaction(transaction, 'Station disconnected - no heartbeat received');
        return;
      }
    }

    // Rule 5: Check for zero energy delivery over extended period
    if (transaction.energyDelivered === 0 && transactionAge > 30 * 60 * 1000) { // 30 minutes
      logger.warn(`Transaction ${transaction.transactionId} has delivered 0 energy for ${Math.round(transactionAge / 60000)} minutes`);
      await this.forceCompleteTransaction(transaction, 'No energy delivered for extended period');
      return;
    }

    logger.debug(`Transaction ${transaction.transactionId} appears healthy, no action needed`);
  }

  async hasRecentStopTransaction(chargePointId, transactionId) {
    try {
      // Check if StopTransaction was received for this specific transaction
      const [result] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM ocpp_messages 
        WHERE "chargePointId" = :chargePointId 
        AND message_type = 'StopTransaction'
        AND direction = 'Inbound'
        AND payload::text LIKE :transactionIdPattern
        AND "createdAt" > NOW() - INTERVAL '10 minutes'
      `, {
        replacements: { 
          chargePointId, 
          transactionIdPattern: `%${transactionId}%` 
        },
        type: sequelize.QueryTypes.SELECT
      });

      return parseInt(result.count) > 0;
    } catch (error) {
      logger.error(`Error checking recent StopTransaction for ${chargePointId}:`, error);
      return false;
    }
  }

  async hasRecentMeterValues(chargePointId, minutesBack) {
    try {
      const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);
      
      const [result] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM ocpp_messages 
        WHERE "chargePointId" = :chargePointId 
        AND message_type = 'MeterValues' 
        AND "createdAt" > :cutoffTime
      `, {
        replacements: { chargePointId, cutoffTime },
        type: sequelize.QueryTypes.SELECT
      });

      return parseInt(result.count) > 0;
    } catch (error) {
      logger.error(`Error checking recent meter values for ${chargePointId}:`, error);
      return false;
    }
  }

  async countIgnoredStopCommands(chargePointId, transactionId) {
    try {
      // Count RemoteStopTransaction commands sent without corresponding StopTransaction received
      const [result] = await sequelize.query(`
        SELECT COUNT(*) as count 
        FROM ocpp_messages sent
        WHERE sent."chargePointId" = :chargePointId 
        AND sent.message_type = 'RemoteStopTransaction'
        AND sent.direction = 'Outbound'
        AND sent.payload::text LIKE :transactionIdPattern
        AND NOT EXISTS (
          SELECT 1 FROM ocpp_messages received 
          WHERE received."chargePointId" = sent."chargePointId"
          AND received.message_type = 'StopTransaction'
          AND received.direction = 'Inbound'
          AND received."createdAt" > sent."createdAt"
          AND received."createdAt" < (sent."createdAt" + INTERVAL '10 minutes')
        )
      `, {
        replacements: { 
          chargePointId, 
          transactionIdPattern: `%${transactionId}%` 
        },
        type: sequelize.QueryTypes.SELECT
      });

      return parseInt(result.count);
    } catch (error) {
      logger.error(`Error counting ignored stop commands for ${chargePointId}:`, error);
      return 0;
    }
  }

  async forceCompleteTransaction(transaction, reason) {
    try {
      logger.info(`Force completing transaction ${transaction.transactionId}: ${reason}`);

      // Calculate final amount based on current energy delivered
      let finalAmount = transaction.amount || 0;
      
      if (transaction.energyDelivered > 0 && finalAmount === 0) {
        // Try to calculate amount if not already set
        try {
          const { isValid, settings, error } = await validatePricingSettings(
            `ForceComplete:${transaction.transactionId}`
          );

          if (isValid && settings) {
            const energyInKwh = transaction.energyDelivered > 100 ? 
              transaction.energyDelivered / 1000 : transaction.energyDelivered;
            
            finalAmount = energyInKwh * settings.baseRatePerKwh;
            logger.debug(`Calculated final amount ${finalAmount} for transaction ${transaction.transactionId}`);
          }
        } catch (pricingError) {
          logger.warn(`Could not calculate pricing for forced completion: ${pricingError.message}`);
        }
      }

      // Update transaction
      await transaction.update({
        status: 'Completed',
        stopTime: new Date(),
        stopMeterValue: transaction.stopMeterValue || transaction.startMeterValue || 0,
        energyDelivered: transaction.energyDelivered || 0,
        amount: finalAmount,
        reason: reason
      });

      // Update station status
      await ChargingStation.update(
        { 
          status: 'Available',
          currentTransaction: null
        },
        { where: { chargePointId: transaction.chargePointId } }
      );

      logger.info(`Successfully force completed transaction ${transaction.transactionId} with reason: ${reason}`);

      // Log the action for audit purposes
      await this.logTransactionIntervention(transaction, reason, finalAmount);

    } catch (error) {
      logger.error(`Error force completing transaction ${transaction.transactionId}:`, error);
    }
  }

  async logTransactionIntervention(transaction, reason, finalAmount) {
    try {
      await sequelize.query(`
        INSERT INTO ocpp_messages (
          "chargePointId", 
          messageId, 
          message_type, 
          status, 
          payload, 
          direction, 
          "createdAt", 
          "updatedAt"
        ) VALUES (
          :chargePointId,
          :messageId,
          'SystemIntervention',
          'Completed',
          :payload,
          'System',
          NOW(),
          NOW()
        )
      `, {
        replacements: {
          chargePointId: transaction.chargePointId,
          messageId: `system-${transaction.transactionId}-${Date.now()}`,
          payload: JSON.stringify({
            transactionId: transaction.transactionId,
            reason: reason,
            finalAmount: finalAmount,
            energyDelivered: transaction.energyDelivered,
            interventionTime: new Date().toISOString()
          })
        }
      });
    } catch (error) {
      logger.error('Error logging transaction intervention:', error);
    }
  }

  // Manual method to check a specific transaction
  async checkSpecificTransaction(transactionId) {
    try {
      const transaction = await Transaction.findOne({
        where: { transactionId, status: 'InProgress' },
        include: [{
          model: ChargingStation,
          as: 'charging_station',
          attributes: ['chargePointId', 'status', 'lastHeartbeat', 'lastConnection']
        }]
      });

      if (transaction) {
        await this.analyzeTransaction(transaction);
        return { found: true, transaction };
      } else {
        return { found: false, message: 'Transaction not found or already completed' };
      }
    } catch (error) {
      logger.error(`Error checking specific transaction ${transactionId}:`, error);
      return { found: false, error: error.message };
    }
  }
}

module.exports = new TransactionMonitor();
