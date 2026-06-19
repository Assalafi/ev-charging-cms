const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const { reconcileStation, reconcileAllStations } = require('../../services/reconciliationService');

/**
 * @route   GET /api/admin/reconciliation/station/:chargePointId
 * @desc    Preview reconciliation for a specific station (no auto-correct)
 * @access  Admin
 */
router.get('/station/:chargePointId', async (req, res) => {
  try {
    const { chargePointId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    logger.info(`Reconciliation preview requested for station ${chargePointId}`);

    const report = await reconcileStation(
      chargePointId,
      start,
      end,
      false // Never auto-correct on preview
    );

    res.json({
      success: true,
      report
    });
  } catch (error) {
    logger.error('Station reconciliation preview error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/admin/reconciliation/station/:chargePointId
 * @desc    Reconcile transactions for a specific station
 * @access  Admin
 */
router.post('/station/:chargePointId', async (req, res) => {
  try {
    const { chargePointId } = req.params;
    const { startDate, endDate, autoCorrect } = req.body;

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    logger.info(`Reconciliation requested for station ${chargePointId}`);

    const report = await reconcileStation(
      chargePointId,
      start,
      end,
      autoCorrect === true
    );

    res.json({
      success: true,
      report
    });
  } catch (error) {
    logger.error('Station reconciliation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route   POST /api/admin/reconciliation/all
 * @desc    Reconcile transactions for all stations (last 3 days)
 * @access  Admin
 */
router.post('/all', async (req, res) => {
  try {
    const { autoCorrect } = req.body;

    logger.info('Reconciliation requested for all stations');

    const report = await reconcileAllStations(autoCorrect === true);

    res.json({
      success: true,
      report
    });
  } catch (error) {
    logger.error('All stations reconciliation error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
