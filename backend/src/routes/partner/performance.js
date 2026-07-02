const express = require('express');
const router = express.Router();
const { Location, Transaction, sequelize } = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const logger = require('../../utils/logger');

/**
 * @route   GET /api/partner/performance
 * @desc    Get partner performance statistics with date range filtering
 * @access  Private (partner)
 */
router.get('/', authenticate, partnerOnly, async (req, res) => {
  try {
    const partnerId = req.user.partnerId;
    const { range = 'monthly', startDate, endDate } = req.query;

    let dateStart, dateEnd;
    const now = new Date();

    if (startDate && endDate) {
      // Custom date range
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
      dateEnd.setHours(23, 59, 59, 999);
    } else {
      // Predefined ranges
      dateEnd = new Date();
      switch (range) {
        case 'daily':
          dateStart = new Date();
          dateStart.setHours(0, 0, 0, 0);
          break;
        case 'weekly':
          dateStart = new Date();
          dateStart.setDate(now.getDate() - 7);
          break;
        case 'yearly':
          dateStart = new Date();
          dateStart.setFullYear(now.getFullYear() - 1);
          break;
        case 'monthly':
        default:
          dateStart = new Date();
          dateStart.setMonth(now.getMonth() - 1);
          break;
      }
    }

    // Get partner's locations
    const locations = await Location.findAll({
      where: { partnerId },
      attributes: ['id']
    });
    const locationIds = locations.map(l => l.id);

    // Get totals for the period
    const totals = await sequelize.query(`
      SELECT 
        COUNT(*) as transactions,
        COALESCE(SUM("energyDelivered"), 0) as energy_wh,
        COALESCE(SUM(amount), 0) as gross_revenue,
        COALESCE(SUM("productionCostAmount"), 0) as production_cost,
        COALESCE(SUM("profitAmount"), 0) as profit_amount,
        COALESCE(SUM("partnerEarning"), 0) as partner_earning,
        COALESCE(SUM("companyEarning"), 0) as company_earning
      FROM transactions
      WHERE "partnerId" = $1 
        AND status = 'Completed'
        AND "stopTime" >= $2 
        AND "stopTime" <= $3
    `, {
      replacements: [partnerId, dateStart, dateEnd],
      type: sequelize.QueryTypes.SELECT
    });

    // Get time series data (by day)
    const series = await sequelize.query(`
      SELECT 
        DATE("stopTime") as label,
        COUNT(*) as transactions,
        COALESCE(SUM("energyDelivered"), 0) as energy_wh,
        COALESCE(SUM(amount), 0) as gross_revenue,
        COALESCE(SUM("partnerEarning"), 0) as partner_earning
      FROM transactions
      WHERE "partnerId" = $1 
        AND status = 'Completed'
        AND "stopTime" >= $2 
        AND "stopTime" <= $3
      GROUP BY DATE("stopTime")
      ORDER BY label ASC
    `, {
      replacements: [partnerId, dateStart, dateEnd],
      type: sequelize.QueryTypes.SELECT
    });

    // Get performance by location
    const byLocation = await sequelize.query(`
      SELECT 
        l.id as location_id,
        l.name as location_name,
        l.city,
        COUNT(t.id) as transactions,
        COALESCE(SUM(t."energyDelivered"), 0) as energy_wh,
        COALESCE(SUM(t."partnerEarning"), 0) as partner_earning
      FROM locations l
      LEFT JOIN charging_stations c ON l.id = c."locationId"
      LEFT JOIN transactions t ON c."chargePointId" = t."chargePointId" 
        AND t.status = 'Completed' 
        AND t."stopTime" >= $2 
        AND t."stopTime" <= $3
        AND t."partnerId" = $1
      WHERE l."partnerId" = $1
      GROUP BY l.id, l.name, l.city
      ORDER BY partner_earning DESC
    `, {
      replacements: [partnerId, dateStart, dateEnd],
      type: sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      range: startDate && endDate ? 'custom' : range,
      period: {
        start: dateStart,
        end: dateEnd
      },
      totals: {
        transactions: parseInt(totals[0].transactions),
        energyWh: parseFloat(totals[0].energy_wh),
        grossRevenue: parseFloat(totals[0].gross_revenue),
        productionCost: parseFloat(totals[0].production_cost),
        partnerEarning: parseFloat(totals[0].partner_earning),
        companyEarning: parseFloat(totals[0].company_earning)
      },
      series: series.map(s => ({
        label: s.label,
        transactions: parseInt(s.transactions),
        energyWh: parseFloat(s.energy_wh),
        grossRevenue: parseFloat(s.gross_revenue),
        partnerEarning: parseFloat(s.partner_earning)
      })),
      byLocation
    });
  } catch (error) {
    logger.error('Error fetching partner performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance data: ' + error.message
    });
  }
});

module.exports = router;
