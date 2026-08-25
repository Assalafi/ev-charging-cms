const express = require('express');
const { Op } = require('sequelize');
const {
  Location,
  PartnerCompany,
  ChargingStation,
  Transaction,
  MobileUser,
  sequelize
} = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { requirePermission } = require('../../middleware/permissions');
const { getPartnerDateRange } = require('../../utils/partnerDateRange');
const { applyLocationStateScope, accessibleLocationIds, canAccessState } = require('../../middleware/adminScope');
const logger = require('../../utils/logger');

const router = express.Router();
const ONLINE = new Set(['Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing']);

router.get('/summary', authenticate, requirePermission('dashboard.view'), async (req, res) => {
  try {
    const today = getPartnerDateRange({ range: 'daily' });
    const month = getPartnerDateRange({ range: 'monthly' });
    const year = getPartnerDateRange({ range: 'yearly' });
    const locationIds = await accessibleLocationIds(req.user);
    const scopedStations = locationIds === null || !locationIds.length ? [] : await ChargingStation.findAll({ where: { locationId: { [Op.in]: locationIds } }, attributes: ['chargePointId'], raw: true });
    const scopeSql = locationIds === null ? '' : `WHERE ("locationId" IN (:scopeLocationIds) OR "chargePointId" IN (:scopeChargePointIds))`;
    const [summary] = await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress')) AS lifetime_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress')), 0) AS lifetime_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress')), 0) AS lifetime_charging_value,
        COALESCE(SUM("partnerEarning") FILTER (WHERE status = 'Completed'), 0) AS lifetime_partner_earning,
        COALESCE(SUM("companyEarning") FILTER (WHERE status = 'Completed'), 0) AS lifetime_company_earning,
        COUNT(*) FILTER (WHERE status = 'InProgress') AS active_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status = 'InProgress'), 0) AS active_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status = 'InProgress'), 0) AS active_charging_value,
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd) AS today_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd), 0) AS today_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :todayStart AND :todayEnd), 0) AS today_charging_value,
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd) AS month_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd), 0) AS month_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :monthStart AND :monthEnd), 0) AS month_charging_value,
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :yearStart AND :yearEnd) AS year_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :yearStart AND :yearEnd), 0) AS year_energy_wh,
        COALESCE(SUM(COALESCE(NULLIF("grossAmount", 0), amount, 0)) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :yearStart AND :yearEnd), 0) AS year_charging_value
      FROM transactions
      ${scopeSql}
    `, {
      replacements: {
        todayStart: today.start,
        todayEnd: today.end,
        monthStart: month.start,
        monthEnd: month.end,
        yearStart: year.start,
        yearEnd: year.end,
        scopeLocationIds: locationIds?.length ? locationIds : [-1],
        scopeChargePointIds: scopedStations.length ? scopedStations.map(station => station.chargePointId) : ['__no_station__']
      },
      type: sequelize.QueryTypes.SELECT
    });
    const [totalClients, activeClients] = await Promise.all([
      MobileUser.count({ where: { status: { [Op.ne]: 'deleted' } } }),
      MobileUser.count({ where: { status: 'active' } })
    ]);

    const number = key => Number(summary?.[key]) || 0;
    res.json({
      success: true,
      summary: {
        today: {
          sessions: number('today_sessions'),
          energyWh: number('today_energy_wh'),
          chargingValue: number('today_charging_value')
        },
        month: {
          sessions: number('month_sessions'),
          energyWh: number('month_energy_wh'),
          chargingValue: number('month_charging_value')
        },
        year: {
          sessions: number('year_sessions'),
          energyWh: number('year_energy_wh'),
          chargingValue: number('year_charging_value')
        },
        lifetime: {
          sessions: number('lifetime_sessions'),
          energyWh: number('lifetime_energy_wh'),
          chargingValue: number('lifetime_charging_value'),
          partnerEarning: number('lifetime_partner_earning'),
          companyEarning: number('lifetime_company_earning')
        },
        activeSessions: number('active_sessions'),
        activeEnergyWh: number('active_energy_wh'),
        activeChargingValue: number('active_charging_value'),
        clients: {
          total: totalClients,
          active: activeClients
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching admin dashboard summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard summary' });
  }
});

router.get('/locations', authenticate, requirePermission('monitor.view'), async (req, res) => {
  try {
    const locationWhere = applyLocationStateScope(req.user, {});
    if (req.query.partnerId === 'main') locationWhere.partnerId = null;
    if (req.query.partnerId && !['all', 'main'].includes(req.query.partnerId)) {
      locationWhere.partnerId = Number.parseInt(req.query.partnerId, 10);
    }
    if (req.query.state) {
      if (!canAccessState(req.user, req.query.state)) return res.json({ success: true, locations: [] });
      locationWhere.state = req.query.state;
    }
    if (req.query.city) locationWhere.city = { [Op.iLike]: `%${req.query.city}%` };

    const locations = await Location.findAll({
      where: locationWhere,
      include: [{
        model: PartnerCompany,
        as: 'partner',
        attributes: ['id', 'name', 'businessName', 'status'],
        required: false
      }],
      order: [['name', 'ASC']]
    });
    const locationIds = locations.map(location => location.id);
    const stations = locationIds.length
      ? await ChargingStation.findAll({
        where: { locationId: { [Op.in]: locationIds } },
        attributes: [
          'id', 'chargePointId', 'name', 'status', 'locationId',
          'connectorCount', 'lastHeartbeat', 'errorCode'
        ]
      })
      : [];

    const { start, end } = getPartnerDateRange({ range: 'daily' });
    const transactions = locationIds.length
      ? await Transaction.findAll({
        where: {
          status: 'Completed',
          stopTime: { [Op.between]: [start, end] },
          [Op.or]: [
            { locationId: { [Op.in]: locationIds } },
            { chargePointId: { [Op.in]: stations.map(station => station.chargePointId) } }
          ]
        },
        attributes: [
          'locationId', 'chargePointId', 'energyDelivered', 'amount', 'grossAmount',
          'partnerEarning', 'companyEarning'
        ]
      })
      : [];

    const result = locations.map(location => {
      const locationStations = stations.filter(station => station.locationId === location.id);
      const stationIds = new Set(locationStations.map(station => station.chargePointId));
      const locationTransactions = transactions.filter(transaction =>
        transaction.locationId === location.id ||
        (!transaction.locationId && stationIds.has(transaction.chargePointId))
      );
      const onlineStations = locationStations.filter(station => ONLINE.has(station.status)).length;
      const metrics = locationTransactions.reduce((totals, transaction) => ({
        transactions: totals.transactions + 1,
        energyWh: totals.energyWh + (Number(transaction.energyDelivered) || 0),
        grossRevenue: totals.grossRevenue + (Number(transaction.grossAmount) || Number(transaction.amount) || 0),
        partnerEarning: totals.partnerEarning + (Number(transaction.partnerEarning) || 0),
        companyEarning: totals.companyEarning + (Number(transaction.companyEarning) || 0)
      }), { transactions: 0, energyWh: 0, grossRevenue: 0, partnerEarning: 0, companyEarning: 0 });

      return {
        ...location.toJSON(),
        ownerType: location.partnerId ? 'partner' : 'main',
        stationCount: locationStations.length,
        onlineStations,
        offlineStations: locationStations.length - onlineStations,
        todayTransactions: metrics.transactions,
        todayEnergyWh: metrics.energyWh,
        todayGrossRevenue: metrics.grossRevenue,
        todayPartnerEarning: metrics.partnerEarning,
        todayCompanyEarning: metrics.companyEarning,
        stations: locationStations.map(station => ({
          ...station.toJSON(),
          isOnline: ONLINE.has(station.status)
        }))
      };
    }).filter(location => {
      if (req.query.status === 'online') return location.onlineStations > 0;
      if (req.query.status === 'offline') return location.onlineStations === 0;
      if (req.query.status === 'partial') {
        return location.onlineStations > 0 && location.offlineStations > 0;
      }
      return true;
    });

    res.json({ success: true, locations: result });
  } catch (error) {
    logger.error('Error fetching admin monitor locations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch monitor locations' });
  }
});

module.exports = router;
