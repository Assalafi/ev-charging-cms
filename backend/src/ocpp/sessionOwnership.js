const { Op } = require("sequelize")
const { OcppMessage, Transaction } = require("../models")
const logger = require("../utils/logger")
const {
  findVerifiedRemoteStartIntent,
  getVerifiedRemoteStartOwner,
  REMOTE_START_SESSION_WINDOW_MS,
} = require("./remoteStartCorrelation")

const START_EVIDENCE_LOOKBACK_MS = Number.parseInt(
  process.env.OCPP_START_EVIDENCE_LOOKBACK_MS || String(45 * 24 * 60 * 60 * 1000),
  10
)

function parseOcppPayload(value) {
  let parsed = value
  for (let attempt = 0; attempt < 2 && typeof parsed === "string"; attempt += 1) {
    try {
      parsed = JSON.parse(parsed)
    } catch (_) {
      return null
    }
  }
  return parsed && typeof parsed === "object" ? parsed : null
}

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function numericConnectorId(value) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function isRecoverySession(transaction) {
  if (!transaction) return false
  return (
    String(transaction.reason || "").startsWith("OCPP_") ||
    String(transaction.ownershipSource || "").includes("recovery") ||
    Boolean(
      transaction.remoteStartMessageId &&
      Number(transaction.ocppTransactionId) !== Number(transaction.transactionId)
    )
  )
}

async function responseForStartRequest(request) {
  const cached = parseOcppPayload(request.responsePayload)
  if (positiveInteger(cached?.transactionId)) return cached

  const outbound = await OcppMessage.findOne({
    where: {
      chargePointId: request.chargePointId,
      messageId: request.messageId,
      message_type: "StartTransaction",
      direction: "Outbound",
      createdAt: {
        [Op.between]: [
          new Date(request.createdAt),
          new Date(new Date(request.createdAt).getTime() + 10 * 60 * 1000),
        ],
      },
    },
    order: [["createdAt", "DESC"]],
    attributes: ["payload"],
  })
  return parseOcppPayload(outbound?.payload)
}

/**
 * Rebuild the immutable session owner from the protocol audit trail.
 *
 * OCPP 1.6 StartTransaction.req carries idTag + connectorId and its matching
 * StartTransaction.conf carries the transactionId used by every subsequent
 * MeterValues/StopTransaction. Their shared messageId is stronger ownership
 * evidence than station status, arrival timing, or "the only active row".
 */
async function findStartTransactionEvidence({
  chargePointId,
  ocppTransactionId = null,
  messageId = null,
  receivedBefore = new Date(),
  lookbackMs = START_EVIDENCE_LOOKBACK_MS,
} = {}) {
  const expectedTransactionId = positiveInteger(ocppTransactionId)
  if (!chargePointId || (!expectedTransactionId && !messageId)) return null

  const before = receivedBefore instanceof Date ? receivedBefore : new Date(receivedBefore)
  const safeBefore = Number.isNaN(before.getTime()) ? new Date() : before
  const where = {
    chargePointId,
    message_type: "StartTransaction",
    direction: "Inbound",
    createdAt: {
      [Op.between]: [new Date(safeBefore.getTime() - lookbackMs), new Date(safeBefore.getTime() + 60 * 1000)],
    },
  }
  if (messageId) where.messageId = String(messageId)

  const requests = await OcppMessage.findAll({
    where,
    order: [["createdAt", "DESC"]],
    limit: messageId ? 5 : 1000,
    attributes: [
      "messageId",
      "chargePointId",
      "payload",
      "responsePayload",
      "createdAt",
      "timestamp",
    ],
  })

  for (const request of requests) {
    const requestPayload = parseOcppPayload(request.payload)
    const responsePayload = await responseForStartRequest(request)
    const responseTransactionId = positiveInteger(responsePayload?.transactionId)
    if (!responseTransactionId) continue
    if (expectedTransactionId && responseTransactionId !== expectedTransactionId) continue
    const authorizationStatus = responsePayload?.idTagInfo?.status
    if (
      authorizationStatus &&
      String(authorizationStatus).toLowerCase() !== "accepted"
    ) continue

    const connectorId = numericConnectorId(
      requestPayload?.connectorId ?? requestPayload?.ConnectorId
    )
    const idTag = requestPayload?.idTag ?? requestPayload?.IdTag
    if (!connectorId || !idTag) continue

    const deviceTimestamp = requestPayload?.timestamp
      ? new Date(requestPayload.timestamp)
      : null

    return {
      chargePointId,
      connectorId,
      idTag: String(idTag),
      meterStart: Number(requestPayload?.meterStart) || 0,
      deviceTimestamp:
        deviceTimestamp && !Number.isNaN(deviceTimestamp.getTime())
          ? deviceTimestamp
          : null,
      receivedAt: new Date(request.createdAt || request.timestamp),
      messageId: String(request.messageId),
      ocppTransactionId: responseTransactionId,
      responseStatus: String(responsePayload?.idTagInfo?.status || "Accepted"),
    }
  }

  return null
}

function evidenceMatchesTransaction(evidence, transaction) {
  if (!evidence || !transaction) return false
  if (String(evidence.chargePointId) !== String(transaction.chargePointId)) return false
  if (Number(evidence.connectorId) !== Number(transaction.connectorId)) return false
  if (String(evidence.idTag) !== String(transaction.idTag)) return false

  return (
    Number(transaction.transactionId) === Number(evidence.ocppTransactionId) ||
    Number(transaction.ocppTransactionId) === Number(evidence.ocppTransactionId) ||
    String(transaction.ocppStartMessageId || "") === String(evidence.messageId)
  )
}

async function bindOcppIdentity(transaction, evidence = {}) {
  if (!transaction) return transaction
  const changes = {}
  const ocppTransactionId = positiveInteger(evidence.ocppTransactionId)

  if (!transaction.ocppTransactionId && ocppTransactionId) {
    changes.ocppTransactionId = ocppTransactionId
  }
  if (!transaction.ocppStartMessageId && evidence.startMessageId) {
    changes.ocppStartMessageId = String(evidence.startMessageId)
  }
  if (!transaction.remoteStartMessageId && evidence.remoteStartMessageId) {
    changes.remoteStartMessageId = String(evidence.remoteStartMessageId)
  }
  if (!transaction.ownershipSource && evidence.ownershipSource) {
    changes.ownershipSource = String(evidence.ownershipSource)
  }
  if (!transaction.ownershipVerifiedAt && evidence.ownershipVerifiedAt) {
    changes.ownershipVerifiedAt = evidence.ownershipVerifiedAt
  }

  if (Object.keys(changes).length > 0) await transaction.update(changes)
  return transaction
}

async function findVerifiedRecoveryCandidate({
  chargePointId,
  ocppTransactionId,
  status,
} = {}) {
  const candidates = await Transaction.findAll({
    where: {
      chargePointId,
      status,
      reason: {
        [Op.in]: [
          "OCPP_VERIFIED_REMOTE_START_RECOVERY",
          "OCPP_STALE_TRANSACTION_RECOVERY",
        ],
      },
    },
    order: [[status === "InProgress" ? "startTime" : "stopTime", "DESC"]],
    limit: 10,
  })

  const matches = []
  for (const candidate of candidates) {
    const intent = await findVerifiedRemoteStartIntent({
      chargePointId,
      connectorId: candidate.connectorId,
      requireChargingConfirmation: true,
      maxAgeMs: REMOTE_START_SESSION_WINDOW_MS,
    })
    const owner = getVerifiedRemoteStartOwner(intent, candidate.connectorId)
    if (!owner || owner !== String(candidate.idTag)) continue
    if (
      candidate.startTime &&
      intent.createdAt > new Date(new Date(candidate.startTime).getTime() + 2 * 60 * 1000)
    ) continue

    matches.push({ candidate, intent })
  }

  if (matches.length !== 1) return null
  const { candidate, intent } = matches[0]
  await bindOcppIdentity(candidate, {
    ocppTransactionId,
    remoteStartMessageId: intent.messageId,
    ownershipSource: "verified_remote_start_recovery",
    ownershipVerifiedAt: intent.acceptedAt || intent.createdAt,
  })
  return candidate
}

/**
 * Resolve StopTransaction without guessing by recency or by a station-wide
 * single candidate. The returned transaction already owns the OCPP ID through
 * a persisted link, an exact StartTransaction audit pair, or a previously
 * verified recovery owner on the exact connector.
 */
async function resolveStopTransactionOwnership({
  chargePointId,
  ocppTransactionId,
  status = "InProgress",
  receivedAt = new Date(),
} = {}) {
  const reportedId = positiveInteger(ocppTransactionId)
  if (!chargePointId || !reportedId) return null
  const isActiveLookup = status === "InProgress"

  const exactOcpp = await Transaction.findOne({
    where: {
      chargePointId,
      status,
      ocppTransactionId: reportedId,
    },
    order: [[isActiveLookup ? "startTime" : "stopTime", "DESC"]],
  })
  if (exactOcpp) return exactOcpp

  // Legacy normal sessions used the same ID in the database and on the
  // station. A recovery row's generated internal ID is never a valid OCPP ID
  // unless separate StartTransaction evidence proves otherwise.
  const exactInternal = await Transaction.findOne({
    where: { chargePointId, status, transactionId: reportedId },
    order: [[isActiveLookup ? "startTime" : "stopTime", "DESC"]],
  })
  if (exactInternal && !isRecoverySession(exactInternal)) {
    await bindOcppIdentity(exactInternal, {
      ocppTransactionId: reportedId,
      ownershipSource: exactInternal.ownershipSource || "exact_ocpp_transaction",
      ownershipVerifiedAt: exactInternal.ownershipVerifiedAt || new Date(),
    })
    return exactInternal
  }

  const startEvidence = await findStartTransactionEvidence({
    chargePointId,
    ocppTransactionId: reportedId,
    receivedBefore: receivedAt,
  })
  if (startEvidence) {
    const candidates = await Transaction.findAll({
      where: {
        chargePointId,
        connectorId: startEvidence.connectorId,
        idTag: startEvidence.idTag,
        status,
      },
      order: [[isActiveLookup ? "startTime" : "stopTime", "DESC"]],
      limit: 3,
    })
    const match = candidates.find(candidate => evidenceMatchesTransaction(startEvidence, candidate))
    if (match) {
      await bindOcppIdentity(match, {
        ocppTransactionId: reportedId,
        startMessageId: startEvidence.messageId,
        ownershipSource: "start_transaction_audit",
        ownershipVerifiedAt: startEvidence.receivedAt,
      })
      return match
    }
  }

  if (isActiveLookup) {
    const recovered = await findVerifiedRecoveryCandidate({
      chargePointId,
      ocppTransactionId: reportedId,
      status,
    })
    if (recovered) return recovered
  }

  logger.warn(
    `Quarantined StopTransaction ${reportedId} on ${chargePointId}: ` +
      `no exact OCPP ownership evidence for the requested transaction state`
  )
  return null
}

/**
 * Populate durable links for sessions that were already active when the
 * additive schema was installed. Only exact StartTransaction evidence, or an
 * already classified recovery with matching accepted RemoteStart evidence,
 * is allowed to populate the charge-point transaction ID.
 */
async function backfillActiveSessionOwnership() {
  const active = await Transaction.findAll({
    where: { status: "InProgress", ocppTransactionId: null },
    order: [["startTime", "ASC"]],
  })
  let linked = 0
  let quarantined = 0

  for (const session of active) {
    const startEvidence = await findStartTransactionEvidence({
      chargePointId: session.chargePointId,
      ocppTransactionId: session.transactionId,
    })
    if (evidenceMatchesTransaction(startEvidence, session)) {
      await bindOcppIdentity(session, {
        ocppTransactionId: startEvidence.ocppTransactionId,
        startMessageId: startEvidence.messageId,
        ownershipSource: "start_transaction_audit_backfill",
        ownershipVerifiedAt: startEvidence.receivedAt,
      })
      linked += 1
      continue
    }

    if (![
      "OCPP_VERIFIED_REMOTE_START_RECOVERY",
      "OCPP_STALE_TRANSACTION_RECOVERY",
    ].includes(session.reason)) {
      quarantined += 1
      continue
    }

    const latestMeters = await OcppMessage.findAll({
      where: {
        chargePointId: session.chargePointId,
        message_type: "MeterValues",
        direction: "Inbound",
        createdAt: {
          [Op.gte]: new Date(
            Math.max(
              new Date(session.createdAt || session.startTime).getTime() - 5 * 60 * 1000,
              Date.now() - 7 * 24 * 60 * 60 * 1000
            )
          ),
        },
      },
      order: [["createdAt", "DESC"]],
      limit: 50,
      attributes: ["payload", "createdAt"],
    })
    const meterPayload = latestMeters
      .map(row => parseOcppPayload(row?.payload))
      .find(payload => numericConnectorId(payload?.connectorId) === Number(session.connectorId))
    const reportedId = positiveInteger(meterPayload?.transactionId)
    const reportedConnector = numericConnectorId(meterPayload?.connectorId)
    if (!reportedId || reportedConnector !== Number(session.connectorId)) {
      quarantined += 1
      continue
    }

    const maxAgeMs = Math.min(
      7 * 24 * 60 * 60 * 1000,
      Math.max(
        REMOTE_START_SESSION_WINDOW_MS,
        Date.now() - new Date(session.createdAt || session.startTime).getTime() + 60 * 60 * 1000
      )
    )
    const intent = await findVerifiedRemoteStartIntent({
      chargePointId: session.chargePointId,
      connectorId: session.connectorId,
      requireChargingConfirmation: true,
      maxAgeMs,
    })
    const owner = getVerifiedRemoteStartOwner(intent, session.connectorId)
    if (!owner || owner !== String(session.idTag)) {
      quarantined += 1
      continue
    }

    await bindOcppIdentity(session, {
      ocppTransactionId: reportedId,
      remoteStartMessageId: intent.messageId,
      ownershipSource: "verified_remote_start_backfill",
      ownershipVerifiedAt: intent.acceptedAt || intent.createdAt,
    })
    linked += 1
  }

  return { inspected: active.length, linked, quarantined }
}

module.exports = {
  START_EVIDENCE_LOOKBACK_MS,
  parseOcppPayload,
  positiveInteger,
  findStartTransactionEvidence,
  evidenceMatchesTransaction,
  bindOcppIdentity,
  resolveStopTransactionOwnership,
  backfillActiveSessionOwnership,
}
