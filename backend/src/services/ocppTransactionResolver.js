/**
 * Resolve the transaction ID that the charge point itself is using.
 *
 * A recovery transaction is an internal CMS record.  It must never be sent
 * to a charge point as the OCPP transactionId because the charge point only
 * knows the ID it returned in StartTransaction.conf.  The latest inbound
 * MeterValues frame is the most reliable durable source for that canonical
 * ID when a charger keeps reporting an old transaction after reconnecting.
 */
const { OcppMessage, Transaction } = require('../models');
const {
  findStartTransactionEvidence,
  evidenceMatchesTransaction,
  bindOcppIdentity
} = require('../ocpp/sessionOwnership');
const {
  findVerifiedRemoteStartIntent,
  getVerifiedRemoteStartOwner,
  REMOTE_START_SESSION_WINDOW_MS
} = require('../ocpp/remoteStartCorrelation');

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
    const session = fallbackTransactionId
      ? await Transaction.findOne({
          where: {
            transactionId: fallbackTransactionId,
            chargePointId,
            ...(connectorId !== undefined && connectorId !== null ? { connectorId } : {})
          }
        })
      : null;

    if (session?.ocppTransactionId) return session.ocppTransactionId;

    if (session) {
      const startEvidence = await findStartTransactionEvidence({
        chargePointId,
        ocppTransactionId: session.transactionId
      });
      if (evidenceMatchesTransaction(startEvidence, session)) {
        await bindOcppIdentity(session, {
          ocppTransactionId: startEvidence.ocppTransactionId,
          startMessageId: startEvidence.messageId,
          ownershipSource: 'start_transaction_audit',
          ownershipVerifiedAt: startEvidence.receivedAt
        });
        return startEvidence.ocppTransactionId;
      }
    }

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
        if (!session) continue;

        // Normal transactions may use their internal ID directly. Recovery
        // rows need the accepted RemoteStart owner on this exact connector;
        // the latest meter frame alone is never enough to select a customer.
        if (Number(session.transactionId) === transactionId) {
          await bindOcppIdentity(session, {
            ocppTransactionId: transactionId,
            ownershipSource: session.ownershipSource || 'exact_ocpp_transaction',
            ownershipVerifiedAt: session.ownershipVerifiedAt || new Date()
          });
          return transactionId;
        }

        if ([
          'OCPP_VERIFIED_REMOTE_START_RECOVERY',
          'OCPP_STALE_TRANSACTION_RECOVERY'
        ].includes(session.reason)) {
          const intent = await findVerifiedRemoteStartIntent({
            chargePointId,
            connectorId: session.connectorId,
            requireChargingConfirmation: true,
            maxAgeMs: REMOTE_START_SESSION_WINDOW_MS
          });
          const owner = getVerifiedRemoteStartOwner(intent, session.connectorId);
          if (owner && owner === String(session.idTag)) {
            await bindOcppIdentity(session, {
              ocppTransactionId: transactionId,
              remoteStartMessageId: intent.messageId,
              ownershipSource: 'verified_remote_start_recovery',
              ownershipVerifiedAt: intent.acceptedAt || intent.createdAt
            });
            return transactionId;
          }
        }
      }
    }
  } catch (_) {
    // The fallback keeps a normal transaction stop usable if the audit table
    // is temporarily unavailable.
  }

  // An internal recovery ID that the charger never acknowledged must not be
  // sent as RemoteStopTransaction. A normal exact StartTransaction ID remains
  // a safe compatibility fallback for pre-migration rows.
  if (fallbackTransactionId) {
    const evidence = await findStartTransactionEvidence({
      chargePointId,
      ocppTransactionId: fallbackTransactionId
    }).catch(() => null);
    if (evidence) return fallbackTransactionId;
  }
  return null;
}

module.exports = {
  resolveCanonicalOcppTransactionId
};
