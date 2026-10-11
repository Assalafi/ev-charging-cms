const express = require('express');
const { Op } = require('sequelize');
const { Location, ChargingStation, Connector, sequelize } = require('../models');
const { getPartnerDateRange } = require('../utils/partnerDateRange');
const logger = require('../utils/logger');

const router = express.Router();
const ONLINE_STATUSES = new Set(['Available', 'Preparing', 'Charging', 'SuspendedEV', 'SuspendedEVSE', 'Finishing']);

function availability(stations) {
  if (!stations.length) return 'empty';
  const online = stations.filter(station => station.isOnline).length;
  if (online === stations.length) return 'online';
  if (online > 0) return 'partial';
  return 'offline';
}

router.get('/network', async (req, res) => {
  try {
    const locations = await Location.findAll({
      where: { active: { [Op.ne]: false } },
      attributes: ['id', 'name', 'address', 'city', 'state', 'country', 'latitude', 'longitude'],
      include: [{
        model: ChargingStation,
        as: 'stations',
        attributes: ['id', 'chargePointId', 'name', 'status', 'locationId', 'connectorCount', 'lastHeartbeat', 'lastConnection'],
        include: [{ model: Connector, attributes: ['connectorId', 'status', 'soc'], required: false }],
        required: false
      }],
      order: [['name', 'ASC']]
    });

    const serializedLocations = locations.map(location => {
      const value = location.toJSON();
      const stations = (value.stations || []).map(station => ({
        id: station.id,
        chargePointId: station.chargePointId,
        name: station.name,
        status: station.status,
        isOnline: ONLINE_STATUSES.has(station.status),
        connectorCount: station.connectorCount,
        lastHeartbeat: station.lastHeartbeat,
        lastConnection: station.lastConnection,
        connectors: (station.connectors || []).map(connector => ({
          connectorId: connector.connectorId,
          status: connector.status,
          soc: connector.soc
        }))
      }));
      return {
        id: value.id,
        name: value.name,
        address: value.address,
        city: value.city,
        state: value.state,
        country: value.country,
        latitude: value.latitude,
        longitude: value.longitude,
        stations,
        stationCount: stations.length,
        onlineStations: stations.filter(station => station.isOnline).length,
        availability: availability(stations)
      };
    });

    const locationIds = serializedLocations.map(location => location.id);
    const chargePointIds = serializedLocations.flatMap(location => location.stations.map(station => station.chargePointId)).filter(Boolean);
    const { start, end } = getPartnerDateRange({ range: 'daily' });
    const [summary] = locationIds.length ? await sequelize.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress')) AS lifetime_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress')), 0) AS lifetime_energy_wh,
        COUNT(*) FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :start AND :end) AS today_sessions,
        COALESCE(SUM("energyDelivered") FILTER (WHERE status IN ('Completed', 'InProgress') AND COALESCE("stopTime", "startTime") BETWEEN :start AND :end), 0) AS today_energy_wh
      FROM transactions
      WHERE ("locationId" IN (:locationIds) OR "chargePointId" IN (:chargePointIds))
    `, { replacements: { locationIds, chargePointIds: chargePointIds.length ? chargePointIds : ['__no_station__'], start, end }, type: sequelize.QueryTypes.SELECT }) : [{}];

    const number = key => Number(summary?.[key]) || 0;
    const stationCount = serializedLocations.reduce((total, location) => total + location.stationCount, 0);
    const onlineStations = serializedLocations.reduce((total, location) => total + location.onlineStations, 0);
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      summary: {
        locations: serializedLocations.length,
        stations: stationCount,
        onlineStations,
        todaySessions: number('today_sessions'),
        todayEnergyWh: number('today_energy_wh'),
        lifetimeSessions: number('lifetime_sessions'),
        lifetimeEnergyWh: number('lifetime_energy_wh')
      },
      locations: serializedLocations
    });
  } catch (error) {
    logger.error('Error fetching public network snapshot:', error);
    res.status(500).json({ success: false, message: 'Failed to load public network snapshot' });
  }
});

module.exports = router;
