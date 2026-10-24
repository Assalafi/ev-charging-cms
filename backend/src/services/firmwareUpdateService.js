const { Op } = require('sequelize');
const { FirmwareUpdate } = require('../models');
const logger = require('../utils/logger');

const OCPP_FIRMWARE_STATUSES = new Set([
  'Idle',
  'Downloading',
  'Downloaded',
  'DownloadFailed',
  'Installing',
  'Installed',
  'InstallationFailed'
]);

const TERMINAL_STATUSES = ['Installed', 'DownloadFailed', 'InstallationFailed', 'CommandFailed'];

function statusChanges(status, at = new Date()) {
  const changes = { status, lastStatusAt: at, statusMessage: null };
  if (status === 'Downloading') changes.downloadStartedAt = at;
  if (status === 'Downloaded') changes.downloadedAt = at;
  if (status === 'Installing') changes.installationStartedAt = at;
  if (status === 'Installed') changes.completedAt = at;
  if (status === 'DownloadFailed' || status === 'InstallationFailed') changes.failedAt = at;
  return changes;
}

async function findActiveUpdate(chargePointId) {
  return FirmwareUpdate.findOne({
    where: {
      chargePointId,
      status: { [Op.notIn]: TERMINAL_STATUSES }
    },
    order: [['requestedAt', 'DESC'], ['id', 'DESC']]
  });
}

async function recordFirmwareStatus(chargePointId, status, at = new Date()) {
  if (!OCPP_FIRMWARE_STATUSES.has(status)) {
    logger.warn(`Ignoring invalid FirmwareStatusNotification status ${status} from ${chargePointId}`);
    return null;
  }

  const update = await findActiveUpdate(chargePointId);
  if (!update) {
    logger.info(`Firmware status ${status} from ${chargePointId} has no active CMS update request`);
    return null;
  }

  await update.update(statusChanges(status, at));
  return update;
}

async function recordCommandResponse(chargePointId, messageId, { success = true, message = null } = {}) {
  const update = await FirmwareUpdate.findOne({
    where: { chargePointId, requestMessageId: messageId }
  });
  if (!update) return null;

  if (!success) {
    await update.update({
      status: 'CommandFailed',
      statusMessage: message || 'The charge point rejected the OCPP command',
      failedAt: new Date(),
      lastStatusAt: new Date()
    });
    return update;
  }

  if (!TERMINAL_STATUSES.includes(update.status) && ['Dispatching', 'CommandSent'].includes(update.status)) {
    await update.update({
      status: 'Acknowledged',
      acknowledgedAt: new Date(),
      lastStatusAt: new Date(),
      statusMessage: null
    });
  }
  return update;
}

async function recordBootFirmwareVersion(chargePointId, firmwareVersion, at = new Date()) {
  if (!firmwareVersion) return null;
  const update = await FirmwareUpdate.findOne({
    where: { chargePointId },
    order: [['requestedAt', 'DESC'], ['id', 'DESC']]
  });
  if (!update) return null;

  const changes = { currentFirmwareVersion: String(firmwareVersion), lastStatusAt: at };
  if (
    update.targetVersion &&
    String(update.targetVersion).trim().toLowerCase() === String(firmwareVersion).trim().toLowerCase() &&
    !TERMINAL_STATUSES.includes(update.status)
  ) {
    Object.assign(changes, {
      status: 'Installed',
      completedAt: at,
      statusMessage: 'Target version confirmed by BootNotification'
    });
  }
  await update.update(changes);
  return update;
}

module.exports = {
  OCPP_FIRMWARE_STATUSES,
  TERMINAL_STATUSES,
  statusChanges,
  findActiveUpdate,
  recordFirmwareStatus,
  recordCommandResponse,
  recordBootFirmwareVersion
};
