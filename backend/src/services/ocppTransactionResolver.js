/**
 * Resolve the transaction ID that the charge point itself is using.
 *
 * A recovery transaction is an internal CMS record.  It must never be sent
 * to a charge point as the OCPP transactionId because the charge point only
 * knows the ID it returned in StartTransaction.conf.  The latest inbound
 * MeterValues frame is the most reliable durable source for that canonical
 * ID when a charger keeps reporting an old transaction after reconnecting.
 */
const { OcppMessage } = require('../models');

function parsePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'object') return payload;
  try {
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

async function resolveCanonicalOcppTransactionId({
  chargePointId,
  connectorId,
  fallbackTransactionId = null,
  maxAgeMs = 5 * 60 * 1000
} = {}) {
  if (!chargePointId) return fallbackTransactionId;

  try {
    const rows = await OcppMessage.findAll({
      where: {
        chargePointId,
        message_type: 'MeterValues',
        direction: 'Inbound'
      },
      order: [['timestamp', 'DESC'], ['createdAt', 'DESC']],
      limit: 20,
      attributes: ['payload', 'timestamp', 'createdAt']
    });

    const now = Date.now();
    for (const row of rows) {
      const receivedAt = new Date(row.timestamp || row.createdAt || 0).getTime();
      if (Number.isFinite(receivedAt) && maxAgeMs > 0 && now - receivedAt > maxAgeMs) {
        continue;
      }

      const payload = parsePayload(row.payload);
      if (!payload || payload.transactionId === undefined || payload.transactionId === null) {
        continue;
      }
      if (connectorId !== undefined && connectorId !== null) {
        const reportedConnector = payload.connectorId ?? 1;
        if (Number(reportedConnector) !== Number(connectorId)) continue;
      }

      const transactionId = Number(payload.transactionId);
      if (Number.isSafeInteger(transactionId) && transactionId > 0) {
        return transactionId;
      }
    }
  } catch (_) {
    // The fallback keeps a normal transaction stop usable if the audit table
    // is temporarily unavailable.
  }

  return fallbackTransactionId;
}

module.exports = {
  resolveCanonicalOcppTransactionId
};
