const { Op } = require("sequelize")
const { OcppMessage } = require("../models")
const logger = require("../utils/logger")

const REMOTE_START_RECOVERY_WINDOW_MS = 15 * 60 * 1000
const REMOTE_START_SESSION_WINDOW_MS = 2 * 60 * 60 * 1000
const DEVICE_CLOCK_TOLERANCE_MS = 5 * 1000
const REMOTE_START_CHARGING_CONFIRM_MS = Number.parseInt(
  process.env.OCPP_REMOTE_START_CONFIRM_MS || String(3 * 60 * 1000),
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

function rowTime(row) {
  const value = row?.createdAt || row?.timestamp
  const parsed = value ? new Date(value) : null
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
}

function payloadConnectorId(payload) {
  const raw = payload?.connectorId ?? payload?.ConnectorId
  if (raw === null || raw === undefined || raw === "") return null
  const connectorId = Number(raw)
  return Number.isFinite(connectorId) ? connectorId : null
}

function isVerifiedRemoteStartIntent(intent, connectorId, { requireChargingConfirmation = true } = {}) {
  if (!intent?.verified || intent.blocked || !intent.idTag) return false
  if (Number(intent.connectorId) !== Number(connectorId)) return false
  if (
    requireChargingConfirmation &&
    (!intent.chargingConfirmed || !intent.safeChargingTransition)
  ) return false
  return true
}

function getVerifiedRemoteStartOwner(intent, connectorId, options) {
  return isVerifiedRemoteStartIntent(intent, connectorId, options)
    ? String(intent.idTag)
    : null
}

/**
 * Return only RemoteStart intents that the charge point explicitly accepted.
 *
 * For stale MeterValues recovery we also require a subsequent Charging status
 * on the same connector. This intentionally prefers quarantining uncertain
 * telemetry over assigning one driver's energy to another driver.
 */
async function findVerifiedRemoteStartIntent({
  chargePointId,
  connectorId,
  meterTimestamp = null,
  requireChargingConfirmation = true,
  maxAgeMs = REMOTE_START_RECOVERY_WINDOW_MS,
  now = new Date(),
}) {
  const targetConnectorId = Number(connectorId)
  if (!chargePointId || !Number.isFinite(targetConnectorId)) return null

  const nowDate = now instanceof Date ? now : new Date(now)
  const sampleTime = meterTimestamp ? new Date(meterTimestamp) : null
  const validSampleTime = sampleTime && !Number.isNaN(sampleTime.getTime())
    ? sampleTime
    : null

  try {
    const recentRequests = await OcppMessage.findAll({
      where: {
        chargePointId,
        message_type: "RemoteStartTransaction",
        direction: "Outbound",
        createdAt: { [Op.gte]: new Date(nowDate.getTime() - maxAgeMs) },
      },
      order: [["createdAt", "DESC"]],
      limit: 250,
      attributes: ["messageId", "payload", "createdAt", "timestamp"],
    })

    let chargingRows = []
    if (requireChargingConfirmation && recentRequests.length > 0) {
      chargingRows = await OcppMessage.findAll({
        where: {
          chargePointId,
          message_type: "StatusNotification",
          direction: "Inbound",
          createdAt: { [Op.gte]: new Date(nowDate.getTime() - maxAgeMs) },
        },
        order: [["createdAt", "DESC"]],
        limit: 500,
        attributes: ["payload", "createdAt", "timestamp"],
      })
    }

    for (const request of recentRequests) {
      const requestPayload = parseOcppPayload(request.payload)
      const requestTime = rowTime(request)
      const requestedConnectorId = payloadConnectorId(requestPayload)
      const idTag = requestPayload?.idTag || requestPayload?.IdTag

      // An omitted connectorId lets the charger choose a connector and is not
      // precise enough to recover billing from stale transaction telemetry.
      if (
        !request.messageId ||
        !requestTime ||
        !idTag ||
        requestedConnectorId !== targetConnectorId
      ) {
        continue
      }

      const response = await OcppMessage.findOne({
        where: {
          chargePointId,
          messageId: request.messageId,
          message_type: "Response",
          direction: "Inbound",
          createdAt: { [Op.gte]: requestTime },
        },
        order: [["createdAt", "DESC"]],
        attributes: ["payload", "createdAt", "timestamp"],
      })
      const responsePayload = parseOcppPayload(response?.payload)
      if (String(responsePayload?.status || "").toLowerCase() !== "accepted") {
        continue
      }

      const acceptedAt = rowTime(response) || requestTime
      const connectorStatuses = requireChargingConfirmation
        ? chargingRows
            .map(row => {
              const payload = parseOcppPayload(row.payload)
              return {
                status: String(payload?.status || payload?.Status || "").toLowerCase(),
                connectorId: payloadConnectorId(payload),
                at: rowTime(row),
              }
            })
            .filter(row => row.at && row.connectorId === targetConnectorId)
        : []
      const chargingConfirmation = connectorStatuses
        .filter(
          row =>
            row.at >= acceptedAt &&
            row.at.getTime() - acceptedAt.getTime() <= REMOTE_START_CHARGING_CONFIRM_MS &&
            row.status === "charging"
        )
        .sort((left, right) => left.at - right.at)[0]
      const priorStatus = connectorStatuses.find(row => row.at < requestTime)
      const safePriorStatuses = new Set(["available", "preparing", "reserved", "finishing"])
      const safeChargingTransition = Boolean(
        chargingConfirmation &&
        priorStatus &&
        safePriorStatuses.has(priorStatus.status)
      )

      // An Accepted response plus a Charging message is not enough if the
      // connector was already Charging for somebody else. Require a visible
      // transition from a state where a new session can legitimately begin.
      if (requireChargingConfirmation && !safeChargingTransition) continue

      const intent = {
        idTag: String(idTag),
        connectorId: requestedConnectorId,
        messageId: request.messageId,
        createdAt: requestTime,
        acceptedAt,
        verified: true,
        chargingConfirmed: requireChargingConfirmation ? true : null,
        chargingConfirmedAt: requireChargingConfirmation
          ? chargingConfirmation.at
          : null,
        safeChargingTransition: requireChargingConfirmation ? true : null,
      }

      if (
        validSampleTime &&
        validSampleTime.getTime() < requestTime.getTime() - DEVICE_CLOCK_TOLERANCE_MS
      ) {
        return { ...intent, blocked: true }
      }

      return intent
    }
  } catch (error) {
    logger.warn(`Could not verify recent RemoteStart history for ${chargePointId}: ${error.message}`)
  }

  return null
}

module.exports = {
  REMOTE_START_RECOVERY_WINDOW_MS,
  REMOTE_START_SESSION_WINDOW_MS,
  REMOTE_START_CHARGING_CONFIRM_MS,
  parseOcppPayload,
  isVerifiedRemoteStartIntent,
  getVerifiedRemoteStartOwner,
  findVerifiedRemoteStartIntent,
}
