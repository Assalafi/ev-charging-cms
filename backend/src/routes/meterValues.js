const express = require('express');
const router = express.Router();
const { MeterValue, Transaction, sequelize } = require('../models');
const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');

/**
 * Get meter values for a specific transaction
 * GET /api/meter-values/transaction/:transactionId
 */
router.get('/transaction/:transactionId', authenticate, async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    // First find the internal ID from transactionId
    const transaction = await Transaction.findOne({
      where: { transactionId: parseInt(transactionId) },
      attributes: ['id']
    });
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Get meter values associated with this transaction's internal ID
    const meterValues = await MeterValue.findAll({
      where: { transactionId: transaction.id },
      order: [['timestamp', 'ASC']]
    });
    
    // Format timestamps and add derived fields
    const formattedValues = meterValues.map((value, index, array) => {
      const formattedValue = {
        ...value.get({ plain: true }),
        formattedTimestamp: new Date(value.timestamp).toLocaleString()
      };
      
      // Calculate power (rate of change of energy) if possible
      if (index > 0 && 
          value.measurand === 'Energy.Active.Import.Register' && 
          array[index-1].measurand === 'Energy.Active.Import.Register') {
        
        const prevReading = array[index-1];
        const timeDiff = (new Date(value.timestamp) - new Date(prevReading.timestamp)) / 1000; // in seconds
        
        if (timeDiff > 0) {
          const energyDiff = value.value - prevReading.value;
          // Convert to kW if readings are in Wh
          const power = value.unit === 'Wh' ? (energyDiff / timeDiff) * (3600 / 1000) : energyDiff / timeDiff;
          formattedValue.calculatedPower = parseFloat(power.toFixed(2));
          formattedValue.powerUnit = value.unit === 'Wh' ? 'kW' : 'W';
        }
      }
      
      return formattedValue;
    });
    
    res.json(formattedValues);
  } catch (error) {
    logger.error('Error fetching meter values:', error);
    res.status(500).json({ error: 'Error fetching meter values' });
  }
});

/**
 * Get meter values for a specific station
 * GET /api/meter-values/station/:chargePointId
 */
router.get('/station/:chargePointId', authenticate, async (req, res) => {
  try {
    const { chargePointId } = req.params;
    const { startDate, endDate } = req.query;
    
    const whereClause = { chargePointId };
    
    if (startDate && endDate) {
      whereClause.timestamp = {
        [sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
      };
    } else if (startDate) {
      whereClause.timestamp = {
        [sequelize.Op.gte]: new Date(startDate)
      };
    } else if (endDate) {
      whereClause.timestamp = {
        [sequelize.Op.lte]: new Date(endDate)
      };
    }
    
    const meterValues = await MeterValue.findAll({
      where: whereClause,
      order: [['timestamp', 'ASC']]
    });
    
    // Format the response
    const formattedValues = meterValues.map(value => ({
      ...value.get({ plain: true }),
      formattedTimestamp: new Date(value.timestamp).toLocaleString()
    }));
    
    res.json(formattedValues);
  } catch (error) {
    logger.error('Error fetching station meter values:', error);
    res.status(500).json({ error: 'Error fetching station meter values' });
  }
});

module.exports = router;
