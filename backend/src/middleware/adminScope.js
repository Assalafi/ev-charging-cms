const { Op } = require('sequelize');
const { Location, ChargingStation } = require('../models');

function normalizedStates(user) {
  return Array.isArray(user?.managedStates)
    ? [...new Set(user.managedStates.map(state => String(state).trim()).filter(Boolean))]
    : [];
}

function isStateRestricted(user) {
  return user?.scopeType === 'states';
}

function canAccessState(user, state) {
  if (!isStateRestricted(user)) return true;
  return normalizedStates(user).some(allowed => allowed.toLowerCase() === String(state || '').trim().toLowerCase());
}

function applyLocationStateScope(user, where = {}) {
  if (!isStateRestricted(user)) return where;
  const states = normalizedStates(user);
  return { ...where, state: { [Op.in]: states } };
}

async function accessibleLocationIds(user) {
  if (!isStateRestricted(user)) return null;
  const rows = await Location.findAll({
    where: applyLocationStateScope(user),
    attributes: ['id'],
    raw: true
  });
  return rows.map(row => row.id);
}

async function scopedStationWhere(user, where = {}) {
  const locationIds = await accessibleLocationIds(user);
  if (locationIds === null) return where;
  return { [Op.and]: [where, { locationId: { [Op.in]: locationIds.length ? locationIds : [-1] } }] };
}

async function scopedTransactionWhere(user, where = {}) {
  const locationIds = await accessibleLocationIds(user);
  if (locationIds === null) return where;
  const stations = locationIds.length ? await ChargingStation.findAll({
    where: { locationId: { [Op.in]: locationIds } },
    attributes: ['chargePointId'],
    raw: true
  }) : [];
  const chargePointIds = stations.map(station => station.chargePointId);
  return {
    [Op.and]: [
      where,
      {
        [Op.or]: [
          { locationId: { [Op.in]: locationIds.length ? locationIds : [-1] } },
          { chargePointId: { [Op.in]: chargePointIds.length ? chargePointIds : ['__no_station__'] } }
        ]
      }
    ]
  };
}

function requireStateAccess(getState) {
  return async (req, res, next) => {
    try {
      const state = await getState(req);
      if (!canAccessState(req.user, state)) {
        return res.status(403).json({ success: false, message: 'This record is outside your assigned state scope' });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  normalizedStates,
  isStateRestricted,
  canAccessState,
  applyLocationStateScope,
  accessibleLocationIds,
  scopedStationWhere,
  scopedTransactionWhere,
  requireStateAccess
};
