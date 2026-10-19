// Updated messageHandlers.js with OCPP 1.6 compliant authorization
const logger = require("../utils/logger")
const { Op } = require("sequelize")
const {
  Transaction,
  MeterValue,
  ChargingStation,
  Connector,
  MobileUser,
  Wallet,
  PaymentTransaction,
  OcppMessage,
  sequelize,
} = require("../models")
const mqttClient = require("../mqtt/client")
const tagAuthService = require("../services/tagAuthorization")
const chargingSessionTracker = require("../services/chargingSessionTracker")
const { validatePricingSettings } = require("../utils/pricingValidator")
const { billTransaction } = require("../services/billingService")
const { calculatePartnerRevenue } = require("../services/partnerRevenueService")
const { getChargingPricing } = require("../services/chargingPricingService")
const {
  resolveCanonicalOcppTransactionId,
} = require("../services/ocppTransactionResolver")

// Track pending remote starts so we can accept StartTransaction from stations
// that use their own default idTag instead of the one from RemoteStartTransaction
const pendingRemoteStarts = new Map()
// Prevent a wallet stop check from issuing a new command for every MeterValues
// frame while the charger is processing the previous stop request.
const automaticStopRequests = new Map()
const AUTOMATIC_STOP_RETRY_MS = 60 * 1000

function parseBatteryPercentage(value) {
  if (value === null || value === undefined || value === "") return null
  const percentage = Number(value)
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    ? percentage
    : null
}

function parseMeterValueWh(sampledValues) {
  const energy = (Array.isArray(sampledValues) ? sampledValues : []).find(
    (sampledValue) =>
      sampledValue?.measurand === "Energy.Active.Import.Register" ||
      !sampledValue?.measurand
  )
  if (!energy) return null

  const value = Number(energy.value)
  if (!Number.isFinite(value)) return null
  return String(energy.unit || "Wh").toLowerCase() === "kwh"
    ? value * 1000
    : value
}

async function nextRecoveryTransactionId() {
  // OCPP 1.6 transaction IDs are integers. Keep the generated ID in the same
  // range as the rest of this application and check the unique index before
  // returning it so a recovered session is never acknowledged twice.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = Math.floor(Math.random() * 900000) + 100000
    const exists = await Transaction.findOne({
      where: { transactionId: candidate },
      attributes: ["id"]
    })
    if (!exists) return candidate
  }
  throw new Error("Unable to allocate a unique recovery transaction ID")
}

/**
 * Resolve a MeterValues transaction without ever attaching a reading to a
 * different customer's completed record. Some chargers keep transmitting
 * their old OCPP transaction ID after a reconnect or after the CSMS completed
 * the record while the cable remained physically active. In that case:
 *   1. Prefer an active transaction on this exact station/connector.
 *   2. If the reported ID is a completed record and the connector is Charging,
 *      create a new continuation for that record's user, starting at the
 *      first meter reading of the continuation.
 *   3. If neither is safe, return null; raw OCPP telemetry remains available
 *      for audit but is not billed to an arbitrary user.
 */
async function resolveMeterValuesTransaction({
  chargePointId,
  connectorId,
  reportedTransactionId,
  meterValueWh,
  meterTimestamp,
  chargingSignal = false
}) {
  const reported = reportedTransactionId
    ? await Transaction.findOne({
        where: { transactionId: reportedTransactionId, chargePointId }
      })
    : null

  if (reported?.status === "InProgress") {
    return { transaction: reported, reportedTransactionId, recovered: false }
  }

  // A charger can change its transaction ID while the CSMS is still handling
  // the previous message. Never let that stale ID override an active session
  // on the same physical connector.
  const active = await Transaction.findOne({
    where: { chargePointId, connectorId, status: "InProgress" },
    order: [["startTime", "DESC"]]
  })
  if (active) {
    // A recovery row can be created from the old OCPP transaction before the
    // durable RemoteStart history is consulted. When the charger clock is
    // stale, the latest RemoteStart received by the CSMS is stronger user
    // evidence than the idTag attached to that old transaction.
    const remoteStartIntent = await findRecentRemoteStartIntent({
      chargePointId,
      connectorId,
      meterTimestamp,
    })
    const remoteStartMatchesActive = Boolean(
      remoteStartIntent?.idTag &&
      String(remoteStartIntent.idTag) === String(active.idTag)
    )
    const remoteStartSupersedesActive = Boolean(
      active.reason === "OCPP_STALE_TRANSACTION_RECOVERY" &&
      chargingSignal &&
      remoteStartIntent?.idTag &&
      String(remoteStartIntent.idTag) !== String(active.idTag) &&
      remoteStartIntent.createdAt <= new Date(active.startTime)
    )
    if (remoteStartSupersedesActive) {
      await active.update({ idTag: remoteStartIntent.idTag })
      active.idTag = remoteStartIntent.idTag
      logger.warn(
        `Reassigned recovery transaction ${active.transactionId} on ${chargePointId}:${connectorId} ` +
          `to RemoteStart user ${remoteStartIntent.idTag}`
      )
    }
    const activeReadingTime = meterTimestamp ? new Date(meterTimestamp) : null
    const activeStartMeter = Number(active.startMeterValue)
    const activeLatestMeter = Math.max(
      Number.isFinite(activeStartMeter) ? activeStartMeter : 0,
      Number(active.stopMeterValue) || 0
    )
    const reportedUserMatchesActive =
      !reported?.idTag || !active.idTag || String(reported.idTag) === String(active.idTag)
    const monotonicLiveRecovery =
      active.reason === "OCPP_STALE_TRANSACTION_RECOVERY" &&
      chargingSignal &&
      Number.isFinite(meterValueWh) &&
      meterValueWh >= activeLatestMeter &&
      (reportedUserMatchesActive || remoteStartMatchesActive || remoteStartSupersedesActive)
    if (
      active.startTime &&
      activeReadingTime &&
      !Number.isNaN(activeReadingTime.getTime()) &&
      activeReadingTime < new Date(active.startTime)
    ) {
      if (!monotonicLiveRecovery) {
        logger.warn(
          `Ignoring delayed MeterValues ${reportedTransactionId || "(none)"} from ` +
            `${chargePointId}:${connectorId}: sample predates active transaction ${active.transactionId}`
        )
        return { transaction: null, reportedTransactionId, recovered: false }
      }

      // Some chargers keep an incorrect RTC after reconnecting. For a
      // recovery session, the server receipt order plus positive power and a
      // non-decreasing register are stronger evidence than that device clock.
      logger.warn(
        `Accepting live stale-clock MeterValues ${reportedTransactionId || "(none)"} from ` +
          `${chargePointId}:${connectorId} for recovery transaction ${active.transactionId}: ` +
          `${meterValueWh} Wh >= ${activeLatestMeter} Wh with positive power`
      )
    }
    if (reportedTransactionId && String(active.transactionId) !== String(reportedTransactionId)) {
      logger.warn(
        `MeterValues ${reportedTransactionId} from ${chargePointId}:${connectorId} ` +
          `mapped to active transaction ${active.transactionId} (reported ID is stale)`
      )
    }
    return { transaction: active, reportedTransactionId, recovered: false }
  }

  // The offline worker may complete the CSMS row while the charge point keeps
  // charging during a short network outage. When the charger reconnects it
  // continues reporting the original OCPP transaction ID. Reuse that record
  // so the normal session-resume path can reopen it and, crucially, so future
  // RemoteStopTransaction commands use the ID the charger actually knows.
  if (
    reported &&
    ["Completed", "Stopped"].includes(reported.status) &&
    reported.reason === "NetworkDisconnected" &&
    chargingSignal &&
    Number.isFinite(meterValueWh) &&
    meterValueWh >= (Number(reported.stopMeterValue) || Number(reported.startMeterValue) || 0)
  ) {
    const remoteStartIntent = await findRecentRemoteStartIntent({
      chargePointId,
      connectorId,
      meterTimestamp,
    })
    const newerDifferentUser = Boolean(
      remoteStartIntent?.idTag &&
      String(remoteStartIntent.idTag) !== String(reported.idTag) &&
      reported.stopTime &&
      remoteStartIntent.createdAt > new Date(reported.stopTime)
    )

    if (!newerDifferentUser) {
      logger.warn(
        `Resuming network-recovered transaction ${reported.transactionId} on ` +
          `${chargePointId}:${connectorId} from live MeterValues at ${meterValueWh} Wh`
      )
      return { transaction: reported, reportedTransactionId, recovered: true }
    }
  }

  if (!reported || !["Completed", "Stopped"].includes(reported.status)) {
    return { transaction: null, reportedTransactionId, recovered: false }
  }

  const remoteStartIntent = await findRecentRemoteStartIntent({
    chargePointId,
    connectorId,
    meterTimestamp,
  })
  if (remoteStartIntent?.blocked) {
    logger.warn(
      `Ignoring delayed MeterValues ${reportedTransactionId || "(none)"} from ` +
        `${chargePointId}:${connectorId}: sample predates RemoteStart for ${remoteStartIntent.idTag}`
    )
    return { transaction: null, reportedTransactionId, recovered: false }
  }

  const connector = await Connector.findOne({
    where: { chargePointId, connectorId },
    attributes: ["status"]
  })
  // Some chargers leave the connector row as Available after reconnecting.
  // A positive power/current reading is sufficient physical evidence, but only
  // when the sample timestamp is newer than the completed transaction (the
  // guard below rejects delayed offline samples from the old session).
  if (
    (connector?.status !== "Charging" && !chargingSignal) ||
    !Number.isFinite(meterValueWh)
  ) {
    return { transaction: null, reportedTransactionId, recovered: false }
  }

  const readingTime = meterTimestamp ? new Date(meterTimestamp) : new Date()
  if (
    reported.stopTime &&
    !Number.isNaN(readingTime.getTime()) &&
    readingTime <= new Date(reported.stopTime)
  ) {
    logger.warn(
      `Ignoring stale MeterValues ${reportedTransactionId} from ${chargePointId}:` +
        `${connectorId}: meter timestamp predates the completed transaction stop`
    )
    return { transaction: null, reportedTransactionId, recovered: false }
  }

  // When the charger continues reporting a previous customer's transactionId
  // after a new RemoteStart, use the new request's idTag. The sample must be
  // newer than both the previous stop and the new RemoteStart (checked above),
  // and must carry positive power/current evidence (checked before recovery).
  const continuationTag = remoteStartIntent?.idTag || reported.idTag
  const supersededUser = remoteStartIntent && remoteStartIntent.idTag !== reported.idTag
  if (supersededUser) {
    logger.warn(
      `Correlating stale MeterValues ${reportedTransactionId} on ${chargePointId}:${connectorId} ` +
        `to newer RemoteStart user ${remoteStartIntent.idTag} instead of completed user ${reported.idTag}`
    )
  }
  const startTime = Number.isNaN(readingTime.getTime()) ? new Date() : readingTime
  const recoveryTransactionId = await nextRecoveryTransactionId()
  const continuation = await Transaction.create({
    transactionId: recoveryTransactionId,
    chargePointId,
    connectorId,
    idTag: continuationTag,
    startTime,
    startMeterValue: meterValueWh,
    energyDelivered: 0,
    amount: 0,
    status: "InProgress",
    reason: "OCPP_STALE_TRANSACTION_RECOVERY"
  })

  await updateConnectorStatus(chargePointId, connectorId, "Charging", continuation.transactionId)
  await ChargingStation.update(
    { status: "Charging", currentTransaction: continuation.transactionId },
    { where: { chargePointId } }
  )
  if (chargingSessionTracker) {
    chargingSessionTracker.startSession(
      continuation.transactionId,
      [],
      continuation.startMeterValue
    )
  }

  if (remoteStartIntent) pendingRemoteStarts.delete(chargePointId)

  logger.warn(
    `Recovered orphan MeterValues on ${chargePointId}:${connectorId}: ` +
      `reported completed tx ${reported.transactionId} (${reported.idTag}) → ` +
      `new continuation tx ${continuation.transactionId} at ${meterValueWh} Wh`
  )
  return { transaction: continuation, reportedTransactionId, recovered: true }
}

function extractBatteryPercentage(values) {
  const entries = Array.isArray(values) ? values : []
  for (const entry of entries) {
    const sampledValues = Array.isArray(entry?.sampledValue)
      ? entry.sampledValue
      : entry?.measurand
        ? [entry]
        : []
    for (const sampledValue of sampledValues) {
      if (sampledValue?.measurand === "SoC") {
        const percentage = parseBatteryPercentage(sampledValue.value)
        if (percentage !== null) return percentage
      }
    }
  }
  return null
}

async function getLatestTransactionBatteryPercentage(transaction) {
  if (!transaction?.id) return null
  const latest = await MeterValue.findOne({
    where: { transactionId: transaction.id, measurand: "SoC" },
    order: [["timestamp", "DESC"]],
    attributes: ["value"]
  })
  return parseBatteryPercentage(latest?.value)
}

async function persistTransactionBatteryPercentage(transactionId, chargePointId, percentage) {
  if (!transactionId || percentage === null) return
  const transaction = await Transaction.findOne({ where: { transactionId, chargePointId } })
  if (!transaction) return

  const updates = { endBatteryPercentage: percentage }
  if (parseBatteryPercentage(transaction.startBatteryPercentage) === null) {
    updates.startBatteryPercentage = percentage
  }
  await transaction.update(updates)
}

/**
 * Register a pending remote start for a station
 */
function registerPendingRemoteStart(chargePointId, idTag, connectorId) {
  pendingRemoteStarts.set(chargePointId, { idTag, connectorId, timestamp: Date.now() })
  logger.info(`Registered pending remote start for ${chargePointId} with tag ${idTag}`)
  // Auto-expire after 60 seconds
  setTimeout(() => {
    if (pendingRemoteStarts.has(chargePointId)) {
      pendingRemoteStarts.delete(chargePointId)
      logger.info(`Expired pending remote start for ${chargePointId}`)
    }
  }, 60000)
}

/**
 * Find the most recent RemoteStart intent for this connector. A few OCPP 1.6
 * chargers keep sending their previous transactionId after reconnecting and
 * never send a fresh StartTransaction. In that case the outbound
 * RemoteStartTransaction is the only authoritative link to the new user.
 *
 * This is deliberately conservative: the meter sample must be newer than the
 * RemoteStart request. If it is older (a delayed/offline replay), return a
 * blocked result so the sample cannot fall back to the previous customer's
 * completed transaction.
 */
async function findRecentRemoteStartIntent({ chargePointId, connectorId, meterTimestamp }) {
  const pending = pendingRemoteStarts.get(chargePointId)
  const sampleTime = meterTimestamp ? new Date(meterTimestamp) : null
  const validSampleTime = sampleTime && !Number.isNaN(sampleTime.getTime())
    ? sampleTime
    : null

  const candidates = []
  if (pending) {
    candidates.push({
      idTag: pending.idTag,
      connectorId: pending.connectorId,
      createdAt: new Date(pending.timestamp),
    })
  }

  // Keep the correlation durable across a PM2 reload/reconnect. The in-memory
  // intent is normally enough, but the OCPP audit row is needed when a charger
  // delivers its buffered meter values after the backend restarts.
  try {
    const recent = await OcppMessage.findAll({
      where: {
        chargePointId,
        message_type: "RemoteStartTransaction",
        direction: "Outbound",
        // A charging session can legitimately run for more than 30 minutes;
        // retain enough RemoteStart history to correlate a stale transaction
        // ID after a charger reconnects later in the same session.
        createdAt: { [Op.gte]: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      order: [["createdAt", "DESC"]],
      limit: 10,
      attributes: ["payload", "createdAt"],
    })

    for (const row of recent) {
      const payload = typeof row.payload === "string"
        ? (() => {
            try { return JSON.parse(row.payload) } catch { return null }
          })()
        : row.payload
      if (!payload) continue
      const requestedConnector = Number(payload.connectorId ?? payload.ConnectorId ?? connectorId)
      if (requestedConnector !== Number(connectorId)) continue
      const idTag = payload.idTag || payload.IdTag
      if (!idTag) continue
      candidates.push({ idTag, connectorId: requestedConnector, createdAt: new Date(row.createdAt) })
    }
  } catch (error) {
    logger.warn(`Could not load recent RemoteStart history for ${chargePointId}: ${error.message}`)
  }

  candidates.sort((a, b) => b.createdAt - a.createdAt)
  const intent = candidates[0]
  if (!intent || !intent.idTag || Number(intent.connectorId) !== Number(connectorId)) return null

  if (
    validSampleTime &&
    validSampleTime.getTime() < intent.createdAt.getTime() - 5000
  ) {
    return { ...intent, blocked: true }
  }

  return intent
}

/**
 * Handle OCPP requests from charging stations
 */
async function handleRequest(chargePointId, action, uniqueId, payload) {
  logger.info(`Handling ${action} request from ${chargePointId}`)

  // Handle different OCPP actions
  switch (action) {
    case "BootNotification":
      return handleBootNotification(chargePointId, uniqueId, payload)
    case "Heartbeat":
      return handleHeartbeat(chargePointId, uniqueId)
    case "StatusNotification":
      return handleStatusNotification(chargePointId, uniqueId, payload)
    case "Authorize":
      return handleAuthorize(chargePointId, uniqueId, payload)
    case "StartTransaction":
      return handleStartTransaction(chargePointId, uniqueId, payload)
    case "StopTransaction":
      return handleStopTransaction(chargePointId, uniqueId, payload)
    case "MeterValues":
      return handleMeterValues(chargePointId, uniqueId, payload)
    case "DiagnosticsStatusNotification":
      return handleDiagnosticsStatusNotification(
        chargePointId,
        uniqueId,
        payload
      )
    case "FirmwareStatusNotification":
      return handleFirmwareStatusNotification(chargePointId, uniqueId, payload)
    case "DataTransfer":
      return handleDataTransfer(chargePointId, uniqueId, payload)
    case "Reset":
      // Reset is normally a server→charger command. If charger sends it, just acknowledge.
      logger.info(`Received Reset request from ${chargePointId} (non-standard)`)
      return [3, uniqueId, { status: "Accepted" }]
    default:
      logger.warn(`Unhandled OCPP action: ${action} from ${chargePointId}`)
      // Send a default response for unhandled actions
      return [
        3,
        uniqueId,
        {
          status: "NotImplemented",
        },
      ]
  }
}

/**
 * Handle Authorize request - OCPP 1.6 COMPLIANT IMPLEMENTATION
 */
async function handleAuthorize(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing Authorize from ${chargePointId}: ${JSON.stringify(payload)}`
    )

    // Extract ID tag from payload
    const idTag = payload.idTag || ""

    if (!idTag) {
      logger.warn(`Missing idTag in Authorize request from ${chargePointId}`)
      return [
        3,
        uniqueId,
        {
          idTagInfo: {
            status: "Invalid",
          },
        },
      ]
    }

    // Check if tag is authorized
    const authResult = await tagAuthService.isAuthorized(idTag)
    logger.info(
      `Authorization result for ${idTag}: ${JSON.stringify(authResult)}`
    )
    // Force 24-hour expiry for all accepted tags
    let expiryDate = null
    if (authResult.status === "Accepted") {
      const now = new Date()
      now.setHours(now.getHours() + 24)
      expiryDate = now.toISOString()
      logger.info(`Set 24-hour expiry for ${idTag}: ${expiryDate}`)
    }

    // Return OCPP 1.6 compliant response
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: authResult.status,
          expiryDate: expiryDate,
          parentIdTag: authResult.parentId,
        },
      },
    ]
  } catch (error) {
    logger.error(`Error handling authorize from ${chargePointId}:`, error)
    // On error, default to Invalid for security reasons
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: "Invalid",
        },
      },
    ]
  }
}

/**
 * Handle StartTransaction request - OCPP 1.6 COMPLIANT IMPLEMENTATION
 */
async function handleStartTransaction1(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing StartTransaction from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Normalize the payload to handle different formats
    const normalizedPayload = {
      // Generate a transactionId if not provided
      transactionId:
        payload.transactionId || Math.floor(Math.random() * 1000000) + 1,
      connectorId: payload.connectorId || 1,
      idTag: payload.idTag,
      timestamp: payload.timestamp || new Date().toISOString(),
      reservationId: payload.reservationId,
    }

    // First check if the tag is authorized for charging
    const authResult = await tagAuthService.isAuthorized(
      normalizedPayload.idTag
    )

    if (authResult.status !== "Accepted") {
      logger.warn(
        `Rejected transaction start from ${chargePointId}: Tag ${normalizedPayload.idTag} status is ${authResult.status}`
      )
      // Force 24-hour expiry for all accepted tags
      let expiryDate = null
      if (authResult.status === "Accepted") {
        const now = new Date()
        now.setHours(now.getHours() + 24)
        expiryDate = now.toISOString()
        logger.info(`Set 24-hour expiry for ${normalizedPayload.idTag}: ${expiryDate}`)
      }

      return [
        3,
        uniqueId,
        {
          transactionId: 0,
          idTagInfo: {
            status: authResult.status,
            expiryDate: expiryDate,
          },
        },
      ]
    }

    // ======== METER VALUE HANDLING - OCPP 1.6 COMPLIANT ========
    // Normalize the meter start value
    normalizedPayload.meterStart =
      payload.meterStart !== undefined ? parseFloat(payload.meterStart) : 0

    // If meterStart is 0, try multiple fallback strategies to get a non-zero value
    if (normalizedPayload.meterStart === 0) {
      logger.info(
        `Received meterStart=0 for ${chargePointId}, trying to find a better value`
      )

      try {
        // 1. First strategy: Check for recent MeterValues messages
        try {
          const { OcppMessage } = require("../models")
          const recentMeterValue = await OcppMessage.findOne({
            where: {
              chargePointId: chargePointId,
              message_type: "MeterValues",
              direction: "Inbound",
            },
            order: [["timestamp", "DESC"]],
          })

          if (recentMeterValue && recentMeterValue.payload) {
            try {
              const meterValuePayload = typeof recentMeterValue.payload === "string"
                ? JSON.parse(recentMeterValue.payload)
                : recentMeterValue.payload
              if (
                meterValuePayload.meterValue &&
                meterValuePayload.meterValue.length > 0
              ) {
                const sampledValues =
                  meterValuePayload.meterValue[0].sampledValue
                if (sampledValues && Array.isArray(sampledValues)) {
                  const energyValue = sampledValues.find(
                    (sv) =>
                      sv.measurand === "Energy.Active.Import.Register" ||
                      !sv.measurand
                  )

                  if (energyValue && energyValue.value !== undefined) {
                    const rawMeterStart = parseFloat(energyValue.value)
                    normalizedPayload.meterStart = String(energyValue.unit || "Wh").toLowerCase() === "kwh"
                      ? rawMeterStart * 1000
                      : rawMeterStart
                    logger.info(
                      `Using recent MeterValues reading: ${normalizedPayload.meterStart} for ${chargePointId}`
                    )
                  }
                }
              }
            } catch (parseError) {
              logger.warn(
                `Error parsing meter value payload: ${parseError.message}`
              )
            }
          }
        } catch (ocppError) {
          logger.warn(
            `Error checking recent meter values: ${ocppError.message}`
          )
        }

        // 2. Second strategy: Use connector's stored meter value as fallback
        if (normalizedPayload.meterStart === 0) {
          const { Connector } = require("../models")
          const connector = await Connector.findOne({
            where: {
              chargePointId: chargePointId,
              connectorId: normalizedPayload.connectorId,
            },
          })

          if (connector && connector.meterValue) {
            normalizedPayload.meterStart = parseFloat(connector.meterValue)
            logger.info(
              `Using connector's stored meter value: ${normalizedPayload.meterStart} for ${chargePointId}`
            )
          } else {
            // 3. Third strategy: Check for previous transactions
            const latestTransaction = await Transaction.findOne({
              where: {
                chargePointId: chargePointId,
                connectorId: normalizedPayload.connectorId,
                status: "Completed",
              },
              order: [["stopTime", "DESC"]],
            })

            if (latestTransaction && latestTransaction.stopMeterValue) {
              normalizedPayload.meterStart = parseFloat(
                latestTransaction.stopMeterValue
              )
              logger.info(
                `Using previous transaction's stop meter value: ${normalizedPayload.meterStart} for ${chargePointId}`
              )
            } else {
              logger.warn(
                `No usable meter value found for ${chargePointId}:${normalizedPayload.connectorId}, using 0`
              )
            }
          }
        }
      } catch (error) {
        logger.error(
          `Error retrieving meter values for ${chargePointId}: ${error.message}`
        )
      }
    } else {
      // Non-zero meterStart was provided, which is good
      logger.info(
        `Using provided non-zero meter start value: ${normalizedPayload.meterStart} for ${chargePointId}`
      )
    }

    // Ensure we have a valid numeric meter value
    normalizedPayload.meterStart = isNaN(normalizedPayload.meterStart)
      ? 0
      : normalizedPayload.meterStart

    // Auto-close any stale InProgress transactions on the same charger+connector
    try {
      const staleTransactions = await Transaction.findAll({
        where: {
          chargePointId,
          connectorId: normalizedPayload.connectorId,
          status: "InProgress",
        },
      })
      if (staleTransactions.length > 0) {
        for (const stale of staleTransactions) {
          const pricing = await getChargingPricing({ chargePointId, idTag: stale.idTag })
          const { pricePerWh, minimumCharge } = pricing
          let staleAmount = parseFloat(stale.amount)
          if (!(staleAmount > 0)) {
            const energy = parseFloat(stale.energyDelivered) || 0
            if (energy > 0) {
              // energyDelivered is normalized to Wh for every transaction;
              // do not infer units from the magnitude (short sessions can be
              // below 100 Wh and would otherwise be overcharged).
              const energyKwh = energy / 1000
              const ratePerKwh = pricePerWh * 1000
              staleAmount = energyKwh * ratePerKwh
            }
            staleAmount = Math.max(staleAmount || 0, minimumCharge)
          }
          await stale.update({
            status: "Completed",
            stopTime: new Date(),
            amount: staleAmount,
          })
          logger.warn(
            `Auto-closed stale transaction ${stale.transactionId} on ${chargePointId}:${normalizedPayload.connectorId} (new session starting) — amount: ₦${staleAmount}`
          )

          // Bill the stale transaction
          try {
            const { billTransaction } = require("../services/billingService")
            await billTransaction(stale.transactionId)
          } catch (billErr) {
            logger.warn(`Failed to bill stale transaction ${stale.transactionId}: ${billErr.message}`)
          }
        }
      }
    } catch (staleErr) {
      logger.error(`Error closing stale transactions on ${chargePointId}: ${staleErr.message}`)
    }

    // Create a new transaction record using Sequelize model
    try {
      const transaction = await Transaction.create({
        transactionId: normalizedPayload.transactionId,
        chargePointId,
        connectorId: normalizedPayload.connectorId,
        idTag: normalizedPayload.idTag,
        startTime: new Date(normalizedPayload.timestamp),
        startMeterValue: normalizedPayload.meterStart,
        currentMeterValue: normalizedPayload.meterStart,
        energyDelivered: 0,
        status: "InProgress",
      })

      logger.info(
        `Created transaction ${transaction.transactionId} for ${chargePointId} with start meter value ${normalizedPayload.meterStart}`
      )

      // Update connector status to Charging
      try {
        await updateConnectorStatus(
          chargePointId,
          normalizedPayload.connectorId,
          "Charging",
          transaction.transactionId
        )
        logger.info(
          `Updated connector ${chargePointId}:${normalizedPayload.connectorId} status to Charging with transaction ${transaction.transactionId}`
        )
      } catch (connError) {
        logger.error(
          `Error updating connector status for ${chargePointId}:`,
          connError
        )
        // Continue with transaction even if connector update fails
      }

      // Update charging station status and current transaction
      try {
        await ChargingStation.update(
          {
            status: "Charging",
            currentTransaction: transaction.transactionId,
          },
          { where: { chargePointId: chargePointId } }
        )
        logger.info(
          `Updated station ${chargePointId} status to Charging with currentTransaction ${transaction.transactionId}`
        )
      } catch (stationError) {
        logger.error(
          `Error updating station status for ${chargePointId}:`,
          stationError
        )
        // Continue with transaction even if station update fails
      }

      // Start tracking in charging session tracker if available
      if (chargingSessionTracker) {
        try {
          chargingSessionTracker.startSession(
            transaction.transactionId,
            [],
            normalizedPayload.meterStart
          )
          logger.info(
            `Started charging session tracking for transaction ${transaction.transactionId}`
          )
        } catch (trackerError) {
          logger.error(
            `Error starting charging session tracker: ${trackerError.message}`
          )
        }
      }

      // Publish transaction start to MQTT
      if (mqttClient) {
        try {
          mqttClient.publish(
            `ocpp/transactions/${transaction.transactionId}/start`,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              chargePointId,
              connectorId: normalizedPayload.connectorId,
              transactionId: transaction.transactionId,
              idTag: normalizedPayload.idTag,
              meterStart: normalizedPayload.meterStart,
            })
          )

          // Also publish status update to MQTT for real-time UI updates
          mqttClient.publish(
            `ocpp/${chargePointId}/status`,
            JSON.stringify({
              connectorId: normalizedPayload.connectorId,
              status: "Charging",
              transactionId: transaction.transactionId,
              meterStart: normalizedPayload.meterStart,
              energy: 0, // Initial energy
              energyDelivered: 0, // For consistency
              power: 0, // Initial power
              timestamp: new Date().toISOString(),
            })
          )

          // Also publish initial energy update to the station-specific topic
          mqttClient.publish(
            `ocpp/stations/${chargePointId}/energy`,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              energy: 0,
              power: Math.round(Math.random() * 3000) + 2000, // Initial power between 2-5kW
              chargePointId,
              transactionId: transaction.transactionId,
              connectorId: normalizedPayload.connectorId,
              status: "Charging",
            })
          )
        } catch (mqttError) {
          logger.error(`Error publishing to MQTT: ${mqttError.message}`)
        }
      }
      // Force 24-hour expiry for all accepted tags
      let expiryDate = null
      if (authResult.status === "Accepted") {
        const now = new Date()
        now.setHours(now.getHours() + 24)
        expiryDate = now.toISOString()
        logger.info(`Set 24-hour expiry for ${normalizedPayload.idTag}: ${expiryDate}`)
      }

      // Return OCPP 1.6 compliant response
      return [
        3,
        uniqueId,
        {
          transactionId: normalizedPayload.transactionId,
          idTagInfo: {
            status: "Accepted",
            expiryDate: expiryDate,
            parentIdTag: authResult.parentId,
          },
        },
      ]
    } catch (dbError) {
      logger.error(
        `Database error during StartTransaction from ${chargePointId}:`,
        dbError
      )
      throw dbError // Re-throw to be caught by outer try-catch
    }
  } catch (error) {
    logger.error(
      `Error handling StartTransaction from ${chargePointId}:`,
      error
    )

    // Generate fallback transaction ID for recovery
    const fallbackTransactionId = Math.floor(Math.random() * 1000000) + 1
    logger.info(
      `Using fallback transaction ID: ${fallbackTransactionId} for error recovery`
    )

    // Return rejection with proper error information
    return [
      3,
      uniqueId,
      {
        transactionId: fallbackTransactionId,
        idTagInfo: {
          status: "Invalid",
          info: "Internal server error",
        },
      },
    ]
  }
}
/**
 * Handle StartTransaction request - OCPP 1.6 COMPLIANT IMPLEMENTATION
 */
async function handleStartTransaction(chargePointId, uniqueId, payload) {
  let transaction
  try {
    logger.info(
      `Processing StartTransaction from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Normalize the payload to handle different formats
    const normalizedPayload = {
      connectorId: payload.connectorId || 1,
      idTag: payload.idTag,
      timestamp: payload.timestamp || new Date().toISOString(),
      meterStart: Number.isFinite(Number(payload.meterStart))
        ? Number(payload.meterStart)
        : 0,
      reservationId: payload.reservationId,
    }

    // First check if the tag is authorized for charging
    const authResult = await tagAuthService.isAuthorized(
      normalizedPayload.idTag
    )

    if (authResult.status !== "Accepted") {
      // Check if there's a pending RemoteStart for this station
      // Some chargers (e.g. 7KVA) use their own default tag instead of the one from RemoteStart
      const pendingStart = pendingRemoteStarts.get(chargePointId)
      if (pendingStart) {
        logger.info(
          `Tag ${normalizedPayload.idTag} not authorized, but found pending RemoteStart for ${chargePointId} with tag ${pendingStart.idTag}. Accepting with RemoteStart tag.`
        )
        // Use the authorized tag from the RemoteStart instead
        normalizedPayload.idTag = pendingStart.idTag
        pendingRemoteStarts.delete(chargePointId)
      } else {
        logger.warn(
          `Rejected transaction start from ${chargePointId}: Tag ${normalizedPayload.idTag} status is ${authResult.status}`
        )
        return [
          3,
          uniqueId,
          {
            transactionId: 0,
            idTagInfo: {
              status: authResult.status,
            },
          },
        ]
      }
    } else {
      // Tag was accepted, clear any pending remote start
      pendingRemoteStarts.delete(chargePointId)
    }

    // A charge point may retry the same StartTransaction after the socket
    // drops before the CSMS response is delivered. If the first request made
    // it to the database, reuse that active session instead of creating a
    // second billable transaction. The connector, tag, meter and short time
    // window together keep this conservative for a legitimate later start.
    const requestedStartTime = new Date(normalizedPayload.timestamp)
    if (!Number.isNaN(requestedStartTime.getTime())) {
      const existingWhere = {
        chargePointId,
        connectorId: normalizedPayload.connectorId,
        idTag: normalizedPayload.idTag,
        status: "InProgress",
        startMeterValue: {
          [Op.between]: [
            normalizedPayload.meterStart - 1,
            normalizedPayload.meterStart + 1,
          ],
        },
        startTime: {
          [Op.between]: [
            new Date(requestedStartTime.getTime() - 10 * 60 * 1000),
            new Date(requestedStartTime.getTime() + 2 * 60 * 1000),
          ],
        },
      }
      if (payload.transactionId) {
        existingWhere.transactionId = payload.transactionId
      }

      const existing = await Transaction.findOne({
        where: existingWhere,
        order: [["createdAt", "DESC"]],
      })
      if (existing) {
        logger.warn(
          `Replaying existing StartTransaction ${existing.transactionId} for ` +
          `${chargePointId}:${normalizedPayload.connectorId}`
        )
        return [
          3,
          uniqueId,
          {
            transactionId: existing.transactionId,
            idTagInfo: {
              status: "Accepted",
              parentIdTag: authResult.parentId,
            },
          },
        ]
      }
    }

    // Generate a transaction ID if not provided
    if (!payload.transactionId) {
      normalizedPayload.transactionId = Math.floor(Math.random() * 1000000) + 1
      logger.info(
        `Generated transaction ID: ${normalizedPayload.transactionId}`
      )
    } else {
      normalizedPayload.transactionId = payload.transactionId
    }

    // Handle meter start value
    if (normalizedPayload.meterStart === 0) {
      logger.info(
        `Received meterStart=0 for ${chargePointId}, using 0 as start value`
      )
      // For now, just accept 0 - we'll update with actual values from MeterValues
    }

    // Create a new transaction record
    transaction = await Transaction.create({
      transactionId: normalizedPayload.transactionId,
      chargePointId,
      connectorId: normalizedPayload.connectorId,
      idTag: normalizedPayload.idTag,
      startTime: new Date(normalizedPayload.timestamp),
      startMeterValue: normalizedPayload.meterStart,
      currentMeterValue: normalizedPayload.meterStart,
      energyDelivered: 0,
      status: "InProgress",
    })

    logger.info(
      `Created transaction ${transaction.transactionId} for ${chargePointId}`
    )

    // Update connector status
    await updateConnectorStatus(
      chargePointId,
      normalizedPayload.connectorId,
      "Charging",
      transaction.transactionId
    )

    // Update charging station status
    await ChargingStation.update(
      {
        status: "Charging",
        currentTransaction: transaction.transactionId,
      },
      { where: { chargePointId: chargePointId } }
    )

    // Start charging session tracking
    if (chargingSessionTracker) {
      chargingSessionTracker.startSession(
        transaction.transactionId,
        [],
        normalizedPayload.meterStart
      )
    }

    // Publish to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/transactions/${transaction.transactionId}/start`,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          chargePointId,
          connectorId: normalizedPayload.connectorId,
          transactionId: transaction.transactionId,
          idTag: normalizedPayload.idTag,
          meterStart: normalizedPayload.meterStart,
        })
      )
    }

    // Calculate expiry date for response
    let expiryDate = null
    if (authResult.status === "Accepted") {
      const now = new Date()
      now.setHours(now.getHours() + 24)
      expiryDate = now.toISOString()
    }

    // Return SUCCESS response
    return [
      3,
      uniqueId,
      {
        transactionId: normalizedPayload.transactionId,
        idTagInfo: {
          status: "Accepted",
          expiryDate: expiryDate,
          parentIdTag: authResult.parentId,
        },
      },
    ]
  } catch (error) {
    logger.error(
      `Error handling StartTransaction from ${chargePointId}:`,
      error
    )

    // Never acknowledge a transaction that was not persisted. Returning a
    // random accepted ID creates an unbillable session on the charge point.
    return [
      3,
      uniqueId,
      {
        transactionId: 0,
        idTagInfo: {
          status: "Invalid",
          info: "Transaction could not be persisted; retry after reconnect",
        },
      },
    ]
  }
}

/**
 * Handle StopTransaction request - OCPP 1.6 COMPLIANT IMPLEMENTATION
 */
async function handleStopTransaction(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing StopTransaction from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Normalize the payload to handle different formats
    const normalizedPayload = {
      transactionId: payload.transactionId,
      meterStop: payload.meterStop || 0,
      timestamp: payload.timestamp || new Date().toISOString(),
      reason: payload.reason || "Local",
      idTag: payload.idTag || null,
      transactionData: payload.transactionData,
    }

    // Validate required fields
    if (!normalizedPayload.transactionId) {
      logger.error(
        `Missing required field transactionId in StopTransaction from ${chargePointId}`
      )
      return [3, uniqueId, {}] // Empty response as per OCPP 1.6
    }

    // Find the transaction to update
    let transaction
    try {
      // Find the transaction using Sequelize model
      transaction = await Transaction.findOne({
        where: {
          transactionId: normalizedPayload.transactionId,
          chargePointId,
          status: "InProgress",
        },
      })

      // Some charge points generate a local transaction ID while offline and
      // later send a StopTransaction that does not match the CSMS-issued ID.
      // Correlate only when there is exactly one safe active candidate; never
      // guess between multiple connectors/users.
      if (!transaction) {
        const candidateWhere = { chargePointId, status: "InProgress" }
        if (normalizedPayload.idTag) candidateWhere.idTag = normalizedPayload.idTag
        const candidates = await Transaction.findAll({
          where: candidateWhere,
          order: [["startTime", "DESC"]],
          limit: 2
        })
        if (candidates.length === 1) {
          transaction = candidates[0]
          logger.warn(
            `Correlated offline StopTransaction ${normalizedPayload.transactionId} ` +
            `to active transaction ${transaction.transactionId} on ${chargePointId}`
          )
          normalizedPayload.transactionId = transaction.transactionId
        }
      }

      if (!transaction) {
        logger.warn(
          `Transaction ${normalizedPayload.transactionId} not found or not in progress for ${chargePointId}`
        )

        // Even if transaction not found/already completed, reset station status
        // This handles the case where auto-stop completed the transaction before charger sent StopTransaction
        const remainingActive = await Transaction.count({
          where: { chargePointId, status: "InProgress" }
        })
        if (remainingActive === 0) {
          await sequelize.query(
            `UPDATE connectors SET status = 'Available', "transactionId" = NULL, "updatedAt" = NOW() WHERE "chargePointId" = $1 AND status != 'Available'`,
            { bind: [chargePointId], type: sequelize.QueryTypes.UPDATE }
          )
          await ChargingStation.update(
            { status: "Available", currentTransaction: null },
            { where: { chargePointId } }
          )
        }
        logger.info(`Reset station ${chargePointId} to Available on StopTransaction (transaction already completed)`)

        // ═══ RECONCILE: Charger sent real meterStop for an already-completed transaction ═══
        // This happens when network dropped, offline auto-stop completed the transaction with stale data,
        // then charger reconnected and sent StopTransaction with the real final meter value
        if (normalizedPayload.meterStop > 0) {
          try {
            let completedTx = await Transaction.findOne({
              where: { transactionId: normalizedPayload.transactionId, chargePointId }
            })
            if (!completedTx) {
              const completedCandidates = await Transaction.findAll({
                where: {
                  chargePointId,
                  status: ["Completed", "Stopped"],
                  ...(normalizedPayload.idTag ? { idTag: normalizedPayload.idTag } : {}),
                  stopTime: { [Op.gte]: new Date(Date.now() - 15 * 60 * 1000) }
                },
                order: [["stopTime", "DESC"]],
                limit: 2
              })
              if (completedCandidates.length === 1) {
                completedTx = completedCandidates[0]
                normalizedPayload.transactionId = completedTx.transactionId
                logger.warn(
                  `Correlated offline StopTransaction to recently completed transaction ` +
                  `${completedTx.transactionId} on ${chargePointId}`
                )
              }
            }
            if (completedTx && !completedTx.billedAt) {
              // Transaction completed but not yet billed — update with correct meter values
              const startMeterValue = completedTx.startMeterValue || 0
              const realEnergy = Math.max(0, normalizedPayload.meterStop - startMeterValue)

              // Recalculate correct amount with real energy
              let correctedAmount = 0
              let pricing = null
              try {
                pricing = await getChargingPricing({ chargePointId, idTag: completedTx.idTag })
                const { pricePerWh, minimumCharge } = pricing
                const ratePerKwh = pricePerWh * 1000
                const energyInKwh = realEnergy / 1000
                correctedAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge)
              } catch (priceErr) {
                logger.error(`Reconcile price calc error: ${priceErr.message}`)
                correctedAmount = completedTx.amount // Keep existing if calc fails
              }

              const oldAmount = parseFloat(completedTx.amount) || 0
              const reconciledRevenue = await calculatePartnerRevenue({
                chargePointId,
                energyWh: realEnergy,
                billableAmount: correctedAmount,
                idTag: completedTx.idTag,
                pricing
              })
              await completedTx.update({
                stopMeterValue: normalizedPayload.meterStop,
                energyDelivered: realEnergy,
                amount: correctedAmount,
                stopTime: new Date(normalizedPayload.timestamp),
                grossAmount: reconciledRevenue.grossAmount,
                sellingPricePerWh: reconciledRevenue.sellingPricePerWh,
                productionCostPerWh: reconciledRevenue.productionCostPerWh,
                partnerSharePercent: reconciledRevenue.partnerSharePercent,
                minimumChargeApplied: reconciledRevenue.minimumChargeApplied,
                productionCostAmount: reconciledRevenue.productionCostAmount,
                profitAmount: reconciledRevenue.profitAmount,
                partnerEarning: reconciledRevenue.partnerEarning,
                companyEarning: reconciledRevenue.companyEarning,
                partnerId: reconciledRevenue.partnerId,
                locationId: reconciledRevenue.locationId,
                settlementStatus: reconciledRevenue.settlementStatus
              })
              logger.info(
                `RECONCILED tx ${normalizedPayload.transactionId}: ` +
                `energy ${completedTx.energyDelivered}→${realEnergy} Wh, ` +
                `amount ₦${oldAmount.toFixed(2)}→₦${correctedAmount.toFixed(2)}`
              )

              // Now bill with the corrected amount
              const { billTransaction } = require("../services/billingService")
              const billingResult = await billTransaction(normalizedPayload.transactionId)
              if (billingResult.success) {
                logger.info(`Reconciled billing SUCCESS for tx ${normalizedPayload.transactionId}`)
              }
            } else if (completedTx && completedTx.billedAt) {
              // Already billed — recalculate with real meterStop and adjust wallet
              const startMeterValue = completedTx.startMeterValue || 0
              const realEnergy = Math.max(0, normalizedPayload.meterStop - startMeterValue)
              const oldEnergy = parseFloat(completedTx.energyDelivered) || 0
              
              // The final StopTransaction meter is authoritative. A fixed
              // 50-Wh tolerance can silently under/over-bill short sessions
              // (and the 24 Wh gap observed on tx 15275 is already ₦9.60 at
              // the current tariff), so reconcile any non-zero difference.
              if (Math.abs(realEnergy - oldEnergy) > 0.0001) {
                // Recalculate the correct amount
                let correctAmount = 0
                let pricing = null
                try {
                  pricing = await getChargingPricing({ chargePointId, idTag: completedTx.idTag })
                  const { pricePerWh, minimumCharge } = pricing
                  const ratePerKwh = pricePerWh * 1000
                  const energyInKwh = realEnergy / 1000
                  correctAmount = Math.max(energyInKwh * ratePerKwh, minimumCharge)
                } catch (priceErr) {
                  logger.error(`Reconcile price calc error (post-billing): ${priceErr.message}`)
                  correctAmount = parseFloat(completedTx.amount) || 0
                }

                const billedAmount = parseFloat(completedTx.amount) || 0
                const difference = correctAmount - billedAmount
                const reconciledRevenue = await calculatePartnerRevenue({
                  chargePointId,
                  energyWh: realEnergy,
                  billableAmount: correctAmount,
                  idTag: completedTx.idTag,
                  pricing
                })

                // Keep the billing and partner commission snapshots aligned with the real meter reading.
                await completedTx.update({
                  stopMeterValue: normalizedPayload.meterStop,
                  energyDelivered: realEnergy,
                  amount: correctAmount,
                  ...(!completedTx.settlementId && {
                    grossAmount: reconciledRevenue.grossAmount,
                    sellingPricePerWh: reconciledRevenue.sellingPricePerWh,
                    productionCostPerWh: reconciledRevenue.productionCostPerWh,
                    partnerSharePercent: reconciledRevenue.partnerSharePercent,
                    minimumChargeApplied: reconciledRevenue.minimumChargeApplied,
                    productionCostAmount: reconciledRevenue.productionCostAmount,
                    profitAmount: reconciledRevenue.profitAmount,
                    partnerEarning: reconciledRevenue.partnerEarning,
                    companyEarning: reconciledRevenue.companyEarning,
                    partnerId: reconciledRevenue.partnerId,
                    locationId: reconciledRevenue.locationId,
                    settlementStatus: reconciledRevenue.settlementStatus
                  })
                })

                // Adjust the wallet: positive diff = charge more, negative diff = refund
                if (Math.abs(difference) > 1) {
                  let adjDbTx = null
                  try {
                    const { MobileUser, Wallet, PaymentTransaction } = require("../models")
                    adjDbTx = await sequelize.transaction()
                    const user = await MobileUser.findOne({ where: { tagId: completedTx.idTag }, transaction: adjDbTx })
                    if (user) {
                      const wallet = await Wallet.findOne({ where: { userId: user.id }, lock: adjDbTx.LOCK.UPDATE, transaction: adjDbTx })
                      if (wallet) {
                        const currentBalance = parseFloat(wallet.balance)
                        const newBalance = currentBalance - difference // subtract positive diff (charge more) or add negative diff (refund)
                        await wallet.update({ balance: newBalance }, { transaction: adjDbTx })

                        // Create adjustment record
                        await PaymentTransaction.create({
                          userId: user.id,
                          walletId: wallet.id,
                          type: difference > 0 ? 'DEBIT' : 'CREDIT',
                          amount: Math.abs(difference),
                          currency: 'NGN',
                          reference: `ADJ-${normalizedPayload.transactionId}-${Date.now()}`,
                          gateway: 'internal',
                          status: 'SUCCESS',
                          description: difference > 0
                            ? `Billing adjustment: additional charge for session ${normalizedPayload.transactionId} (network reconciliation)`
                            : `Billing adjustment: refund for session ${normalizedPayload.transactionId} (network reconciliation)`,
                          metadata: {
                            transactionId: normalizedPayload.transactionId,
                            chargePointId,
                            billedEnergy: oldEnergy,
                            realEnergy: realEnergy,
                            billedAmount: billedAmount,
                            correctAmount: correctAmount,
                            adjustment: difference,
                            previousBalance: currentBalance,
                            newBalance: newBalance
                          }
                        }, { transaction: adjDbTx })

                        await adjDbTx.commit()
                        logger.info(
                          `WALLET ADJUSTED tx ${normalizedPayload.transactionId}: ` +
                          `${difference > 0 ? 'Charged' : 'Refunded'} ₦${Math.abs(difference).toFixed(2)} ` +
                          `(energy: ${oldEnergy}→${realEnergy} Wh, amount: ₦${billedAmount.toFixed(2)}→₦${correctAmount.toFixed(2)}). ` +
                          `User ${user.email} balance: ₦${currentBalance.toFixed(2)}→₦${newBalance.toFixed(2)}`
                        )
                      } else {
                        await adjDbTx.rollback()
                      }
                    } else {
                      await adjDbTx.rollback()
                    }
                  } catch (walletErr) {
                    if (adjDbTx) { try { await adjDbTx.rollback() } catch (_) {} }
                    logger.error(`Wallet adjustment error for tx ${normalizedPayload.transactionId}: ${walletErr.message}`)
                  }
                } else {
                  logger.info(
                    `RECONCILED tx ${normalizedPayload.transactionId} (post-billing): ` +
                    `energy ${oldEnergy}→${realEnergy} Wh, amount diff ₦${difference.toFixed(2)} (too small to adjust)`
                  )
                }
              }
            }
          } catch (reconcileErr) {
            logger.error(`Reconciliation error for tx ${normalizedPayload.transactionId}: ${reconcileErr.message}`)
          }
        }

        // Per OCPP 1.6, we still return a success response even if transaction not found
        return [3, uniqueId, {}]
      }

      // Validate meter values
      const startMeterValue = transaction.startMeterValue || 0
      if (normalizedPayload.meterStop < startMeterValue) {
        logger.warn(
          `Invalid meter values: start=${startMeterValue}, stop=${normalizedPayload.meterStop}`
        )
        // We'll still continue with the transaction
      }

      // Calculate energy delivered
      const energyDelivered = Math.max(
        0,
        normalizedPayload.meterStop - startMeterValue
      )

      // Calculate the transaction amount using company pricing when configured,
      // otherwise use the station location tariff.
      let transactionAmount = 0
      let sellingPricePerWh = 0.4
      let minimumCharge = 150
      let grossAmount = 0
      let isUsingMinimumCharge = false
      let pricing = null
      try {
        pricing = await getChargingPricing({ chargePointId, idTag: transaction.idTag })
        sellingPricePerWh = pricing.pricePerWh
        minimumCharge = pricing.minimumCharge

        const ratePerKwh = sellingPricePerWh * 1000 // Convert ₦/Wh to ₦/kWh

        // Always convert from Wh to kWh (energyDelivered from OCPP is always in Wh)
        const energyInKwh = energyDelivered / 1000
        logger.debug(
          `StopTransaction ENERGY CHECK: Original value=${energyDelivered} Wh, converted to=${energyInKwh} kWh`
        )

        // Add detailed debug logging for troubleshooting
        logger.debug(
          `StopTransaction EFFECTIVE PRICING (${pricing.source}): ` +
            `pricePerWh=${sellingPricePerWh}, ` +
            `ratePerKwh=${ratePerKwh}, ` +
            `minimumCharge=${minimumCharge}`
        )

        // Calculate raw amount
        grossAmount = energyInKwh * ratePerKwh

        // Log calculation
        logger.debug(
          `StopTransaction CALCULATION: ${energyInKwh} kWh * ${ratePerKwh} Naira/kWh = ${grossAmount} Naira`
        )

        // Apply minimum charge if raw amount is less
        isUsingMinimumCharge = grossAmount < minimumCharge
        const amount = isUsingMinimumCharge ? minimumCharge : grossAmount

        transactionAmount = amount
        logger.info(
          `Calculated transaction amount: ${transactionAmount} for transaction ${
            transaction.transactionId
          } (${energyInKwh} kWh, raw: ${grossAmount.toFixed(
            2
          )} Naira, min charge: ${minimumCharge} Naira${
            isUsingMinimumCharge ? " - APPLIED" : ""
          })`
        )
      } catch (priceError) {
        logger.error(`Error calculating transaction amount:`, priceError)
        // Do not proceed with transaction completion if we can't calculate the price from database settings
        throw new Error(`Cannot complete transaction: ${priceError.message}`)
      }

      // ═══ PARTNER REVENUE CALCULATION ═══
      let partnerRevenue = null
      try {
        partnerRevenue = await calculatePartnerRevenue({
          chargePointId,
          energyWh: energyDelivered,
          billableAmount: transactionAmount,
          idTag: transaction.idTag,
          pricing
        })
        logger.info(`Partner revenue calculated for tx ${transaction.transactionId}:`, partnerRevenue)
      } catch (partnerError) {
        logger.error(`Error calculating partner revenue for tx ${transaction.transactionId}:`, partnerError)
        // Continue with default values if partner revenue calculation fails
        partnerRevenue = {
          locationId: null,
          partnerId: null,
          sellingPricePerWh,
          grossAmount,
          productionCostPerWh: 0,
          partnerSharePercent: 0,
          productionCostAmount: 0,
          profitAmount: transactionAmount,
          partnerEarning: 0,
          companyEarning: transactionAmount,
          settlementStatus: null
        }
      }

      // First update the connector status to "Finishing" to indicate transition
      await updateConnectorStatus(
        chargePointId,
        transaction.connectorId,
        "Finishing",
        null
      )

      // StopTransaction may include a final SoC sample. If it does not, use
      // the latest persisted SoC sample for this transaction. A missing value
      // remains null; never infer battery percentage from energy delivered.
      const transactionDataBatteryPercentage = extractBatteryPercentage(normalizedPayload.transactionData)
      const finalBatteryPercentage = transactionDataBatteryPercentage !== null
        ? transactionDataBatteryPercentage
        : await getLatestTransactionBatteryPercentage(transaction)
      const batteryUpdate = finalBatteryPercentage === null
        ? {}
        : {
            endBatteryPercentage: finalBatteryPercentage,
            ...(parseBatteryPercentage(transaction.startBatteryPercentage) === null
              ? { startBatteryPercentage: finalBatteryPercentage }
              : {})
          }

      // Update the transaction with all fields including partner revenue
      await transaction.update({
        status: "Completed",
        stopTime: new Date(normalizedPayload.timestamp),
        stopMeterValue: normalizedPayload.meterStop,
        energyDelivered: energyDelivered,
        amount: transactionAmount,
        grossAmount: partnerRevenue.grossAmount ?? grossAmount,
        reason: normalizedPayload.reason,
        // Partner revenue snapshot fields
        sellingPricePerWh: partnerRevenue.sellingPricePerWh,
        productionCostPerWh: partnerRevenue.productionCostPerWh,
        partnerSharePercent: partnerRevenue.partnerSharePercent,
        minimumChargeApplied: isUsingMinimumCharge,
        productionCostAmount: partnerRevenue.productionCostAmount,
        profitAmount: partnerRevenue.profitAmount,
        partnerEarning: partnerRevenue.partnerEarning,
        companyEarning: partnerRevenue.companyEarning,
        partnerId: partnerRevenue.partnerId,
        locationId: partnerRevenue.locationId,
        settlementStatus: partnerRevenue.settlementStatus,
        ...batteryUpdate
      })

      logger.info(
        `Completed transaction ${transaction.transactionId} for ${chargePointId} with energy delivered ${energyDelivered} Wh and amount ${transactionAmount}`
      )

      // ═══ WALLET DEDUCTION (atomic, idempotent, crash-safe) ═══
      try {
        const billingResult = await billTransaction(normalizedPayload.transactionId)
        if (!billingResult.success) {
          logger.warn(`Billing not completed for tx ${normalizedPayload.transactionId}: ${billingResult.message}`)
        }
      } catch (billError) {
        // Billing failure must NOT block the OCPP response — reconciliation will retry
        logger.error(`Billing error for tx ${normalizedPayload.transactionId}:`, billError)
      }

      // Stop the charging session tracking
      if (chargingSessionTracker) {
        chargingSessionTracker.endSession(
          normalizedPayload.transactionId,
          normalizedPayload.meterStop
        )
        logger.info(
          `Stopped real-time tracking for transaction ${normalizedPayload.transactionId}`
        )
      }

      // Emit stop-transaction event for the remote stop flow
      const eventEmitter = require("../utils/eventEmitter")
      eventEmitter.emit("stop-transaction", {
        transactionId: normalizedPayload.transactionId,
        chargePointId,
        connectorId: transaction.connectorId,
        meterStop: normalizedPayload.meterStop,
        energyDelivered,
        amount: transactionAmount,
        timestamp: new Date().toISOString(),
        reason: normalizedPayload.reason,
      })
      logger.info(
        `Emitted stop-transaction event for transaction ${normalizedPayload.transactionId}`
      )

      // Immediately reset connector and station status after transaction completes
      await updateConnectorStatus(chargePointId, transaction.connectorId, "Available", null)
      await ChargingStation.update(
        { status: "Available", currentTransaction: null },
        { where: { chargePointId } }
      )
      logger.info(`Reset connector ${transaction.connectorId} and station ${chargePointId} to Available after StopTransaction`)

      // Publish transaction stop event to MQTT
      if (mqttClient) {
        // 1. First publish "Finishing" status
        mqttClient.publish(
          `ocpp/${chargePointId}/status`,
          JSON.stringify({
            connectorId: transaction.connectorId,
            status: "Finishing",
            transactionId: normalizedPayload.transactionId,
            timestamp: new Date().toISOString(),
          })
        )

        // 2. Publish detailed transaction stop event
        mqttClient.publish(
          `ocpp/transactions/${normalizedPayload.transactionId}/stop`,
          JSON.stringify({
            timestamp: normalizedPayload.timestamp,
            chargePointId,
            connectorId: transaction.connectorId,
            transactionId: normalizedPayload.transactionId,
            meterStart: transaction.startMeterValue,
            meterStop: normalizedPayload.meterStop,
            energy: energyDelivered, // Add energy field for frontend consistency
            energyDelivered,
            amount: transactionAmount,
            reason: normalizedPayload.reason,
            batteryPercentage: finalBatteryPercentage,
            startBatteryPercentage: transaction.startBatteryPercentage,
            endBatteryPercentage: finalBatteryPercentage,
            status: "Completed",
          })
        )

        // Also publish final energy update to the station-specific topic
        mqttClient.publish(
          `ocpp/stations/${chargePointId}/energy`,
          JSON.stringify({
            timestamp: normalizedPayload.timestamp,
            energy: energyDelivered,
            power: 0, // Power is 0 when transaction stops
            chargePointId,
            transactionId: normalizedPayload.transactionId,
            connectorId: transaction.connectorId,
            batteryPercentage: finalBatteryPercentage,
            endBatteryPercentage: finalBatteryPercentage,
            status: "Completed",
          })
        )

        // 3. After a short delay, publish final Available status
        setTimeout(() => {
          mqttClient.publish(
            `ocpp/${chargePointId}/status`,
            JSON.stringify({
              connectorId: transaction.connectorId,
              status: "Available",
              timestamp: new Date().toISOString(),
            })
          )

          // Update connector status to Available in database
          updateConnectorStatus(
            chargePointId,
            transaction.connectorId,
            "Available",
            null
          ).catch((error) =>
            logger.error(
              `Failed to update connector status to Available: ${error.message}`
            )
          )

          // Update charging station status and reset current transaction
          ChargingStation.update(
            {
              status: "Available",
              currentTransaction: null,
            },
            { where: { chargePointId: chargePointId } }
          )
            .then(() => {
              logger.info(
                `Updated station ${chargePointId} status to Available and cleared currentTransaction`
              )
            })
            .catch((stationError) => {
              logger.error(
                `Error updating station status after transaction completion for ${chargePointId}:`,
                stationError
              )
            })
        }, 1500) // 1.5 second delay for UI transition
      }
    } catch (dbError) {
      logger.error(
        `Database error during StopTransaction from ${chargePointId}:`,
        dbError
      )
      // Continue with response even if update fails
    }

    // Check if idTag is provided and verify it
    let authResult = {
      status: "Accepted",
    }

    if (normalizedPayload.idTag) {
      try {
        authResult = await tagAuthService.isAuthorized(normalizedPayload.idTag)
      } catch (authError) {
        logger.error(
          `Error checking authorization during StopTransaction:`,
          authError
        )
        // Use default Accepted status
      }
    }
    // Force 24-hour expiry for all accepted tags
    let expiryDate = null
    if (authResult.status === "Accepted") {
      const now = new Date()
      now.setHours(now.getHours() + 24)
      expiryDate = now.toISOString()
      logger.info(`Set 24-hour expiry for ${normalizedPayload.idTag}: ${expiryDate}`)
    }

    // Return OCPP 1.6 compliant response
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: authResult.status,
          expiryDate: expiryDate,
          parentIdTag: authResult.parentId,
        },
      },
    ]
  } catch (error) {
    logger.error(`Error handling StopTransaction from ${chargePointId}:`, error)
    // Return accepted response even on error to allow charge point to continue
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: "Accepted",
        },
      },
    ]
  }
}

/**
 * Handle MeterValues request
 */
async function handleMeterValues(chargePointId, uniqueId, payload) {
  try {
    logger.debug(
      `Processing MeterValues from ${chargePointId}: ${JSON.stringify(payload)}`
    )

    // Extract data from payload
    const connectorId = payload.connectorId || 1
    const reportedTransactionId = payload.transactionId || null
    let transactionId = reportedTransactionId
    const meterValues = payload.meterValue || []
    let internalTransactionId = null

    if (meterValues.length > 0) {
      const firstSampledValues = meterValues[0]?.sampledValue || []
      const firstMeterValueWh = parseMeterValueWh(firstSampledValues)
      const chargingSignal = meterValues.some((meterValue) =>
        (meterValue?.sampledValue || []).some((sampledValue) => {
          if (sampledValue?.measurand === "Power.Active.Import") {
            return Number(sampledValue.value) > 0
          }
          if (sampledValue?.measurand === "Current.Import") {
            return Number(sampledValue.value) > 0
          }
          return false
        })
      )
      const resolution = await resolveMeterValuesTransaction({
        chargePointId,
        connectorId,
        reportedTransactionId,
        meterValueWh: firstMeterValueWh,
        meterTimestamp: meterValues[0]?.timestamp,
        chargingSignal
      })
      if (resolution.transaction) {
        transactionId = resolution.transaction.transactionId
        internalTransactionId = resolution.transaction.id
      } else if (reportedTransactionId) {
        logger.warn(
          `Ignoring billable MeterValues ${reportedTransactionId} from ${chargePointId}:${connectorId}: ` +
            `no active transaction and no safe user correlation`
        )
      }
    }

    if (meterValues.length === 0) {
      logger.warn(
        `Empty meterValue array in MeterValues request from ${chargePointId}`
      )
    } else {
      // Process meter values
      if (internalTransactionId && transactionId && chargingSessionTracker) {
        logger.info(`Processing meter values for transaction ${transactionId}`)
        chargingSessionTracker.updateMeterValue(transactionId, meterValues)
      }

      // Store meter values in database
      try {
        for (const meterValue of meterValues) {
          // Each meterValue has a timestamp and sampledValue array
          const timestamp = meterValue.timestamp
          const sampledValues = meterValue.sampledValue || []

          // Preserve normalized meter history as well as the raw OCPP
          // message. The model uses the internal transaction primary key for
          // its association, so map the OCPP ID before inserting.
          for (const sampledValue of sampledValues) {
            try {
              await MeterValue.create({
                chargePointId,
                connectorId: connectorId || 1,
                transactionId: internalTransactionId,
                timestamp: timestamp ? new Date(timestamp) : new Date(),
                value: parseFloat(sampledValue.value),
                unit: sampledValue.unit || "Wh",
                measurand: sampledValue.measurand || "Energy.Active.Import.Register",
                phase: sampledValue.phase || null,
                location: sampledValue.location || null,
                context: sampledValue.context || "Sample.Periodic"
              })
            } catch (meterPersistError) {
              logger.warn(`Could not persist meter sample from ${chargePointId}: ${meterPersistError.message}`)
            }
          }

          // Extract important values from meter readings
          let batteryPercentage = null
          let powerValue = null

          for (const sampledValue of sampledValues) {
            // Check for SoC (battery percentage)
            if (sampledValue.measurand === "SoC") {
              batteryPercentage = parseBatteryPercentage(sampledValue.value)
              if (batteryPercentage !== null) {
                logger.info(
                  `Found SoC: ${batteryPercentage}% for transaction ${transactionId} on ${chargePointId}`
                )
              }
            }

            // Check for Power readings
            if (
              sampledValue.measurand === "Power.Active.Import" &&
              sampledValue.unit === "W"
            ) {
              powerValue = parseInt(sampledValue.value, 10)
              logger.debug(
                `Found Power: ${powerValue}W for transaction ${transactionId} on ${chargePointId}`
              )
            }

            // Extract energy values
            if (
              sampledValue.measurand === "Energy.Active.Import.Register" ||
              !sampledValue.measurand
            ) {
              const energyValue = parseFloat(sampledValue.value)
              const unit = sampledValue.unit || "Wh"
              const meterValueWh = String(unit).toLowerCase() === "kwh"
                ? energyValue * 1000
                : energyValue

              if (!isNaN(energyValue)) {
                // Update connector's meter value
                try {
                  await sequelize.query(
                    `UPDATE connectors 
                                         SET "meterValue" = $1, "lastUpdated" = NOW() 
                                         WHERE "chargePointId" = $2 AND "connectorId" = $3`,
                    {
                      bind: [meterValueWh, chargePointId, connectorId],
                      type: sequelize.QueryTypes.UPDATE,
                    }
                  )
                } catch (connectorError) {
                  // Ignore connector table errors
                  logger.debug(
                    `Failed to update connector meter value: ${connectorError.message}`
                  )
                }

                // If part of a transaction, update its current energy
                if (internalTransactionId && transactionId) {
                  try {
                    // Fetch transaction fresh to get latest currentMeterValue
                    let transaction = await Transaction.findOne({
                      where: {
                        transactionId,
                        status: "InProgress",
                      },
                    })

                    // ═══ SESSION RESUMPTION: Charger still charging after premature system completion ═══
                    if (!transaction) {
                      const completedTx = await Transaction.findOne({
                        where: { transactionId, status: "Completed" },
                      })
                      if (completedTx && meterValueWh > (completedTx.stopMeterValue || 0)) {
                        logger.warn(
                          `SESSION RESUME via MeterValues: tx ${transactionId} is Completed but charger sent energy=${meterValueWh} Wh ` +
                          `(prev stopMeter=${completedTx.stopMeterValue}). Reopening transaction.`
                        )

                        // Refund premature billing if it was already billed
                        if (completedTx.billedAt) {
                          try {
                            const user = await MobileUser.findOne({ where: { tagId: completedTx.idTag } })
                            if (user) {
                              const wallet = await Wallet.findOne({ where: { userId: user.id } })
                              if (wallet) {
                                const billedAmount = parseFloat(completedTx.amount) || 0
                                if (billedAmount > 0) {
                                  const currentBalance = parseFloat(wallet.balance)
                                  const newBalance = currentBalance + billedAmount
                                  await wallet.update({ balance: newBalance })
                                  await PaymentTransaction.create({
                                    userId: user.id,
                                    walletId: wallet.id,
                                    type: 'CREDIT',
                                    amount: billedAmount,
                                    currency: 'NGN',
                                    reference: `RESUME-REFUND-${transactionId}-${Date.now()}`,
                                    gateway: 'internal',
                                    status: 'SUCCESS',
                                    description: `Refund: session ${transactionId} resumed — charger still charging after network drop`,
                                    metadata: {
                                      transactionId,
                                      chargePointId,
                                      refundedAmount: billedAmount,
                                      previousBalance: currentBalance,
                                      newBalance
                                    }
                                  })
                                  logger.info(
                                    `SESSION RESUME REFUND: tx ${transactionId} — refunded ₦${billedAmount.toFixed(2)} ` +
                                    `to ${user.email}. Balance: ₦${currentBalance.toFixed(2)} → ₦${newBalance.toFixed(2)}`
                                  )
                                }
                              }
                            }
                          } catch (refundErr) {
                            logger.error(`Session resume refund error for tx ${transactionId}: ${refundErr.message}`)
                          }
                        }

                        // Reopen the transaction
                        await completedTx.update({
                          status: 'InProgress',
                          stopTime: null,
                          billedAt: null,
                          reason: null,
                        })

                        // Update station and connector status
                        await ChargingStation.update(
                          { status: 'Charging', currentTransaction: transactionId },
                          { where: { chargePointId } }
                        )
                        await updateConnectorStatus(chargePointId, completedTx.connectorId, 'Charging', transactionId)

                        // Restart session tracking
                        if (chargingSessionTracker) {
                          chargingSessionTracker.startSession(transactionId, [], completedTx.startMeterValue || 0)
                        }

                        // Publish resumption event via MQTT
                        if (mqttClient) {
                          mqttClient.publish(`ocpp/${chargePointId}/session-resumed`, JSON.stringify({
                            transactionId,
                            chargePointId,
                            reason: 'charger_still_charging',
                            timestamp: new Date().toISOString()
                          }))
                        }

                        transaction = completedTx
                        logger.info(`SESSION RESUMED: tx ${transactionId} on ${chargePointId} — back to InProgress`)
                      }
                    }

                    if (transaction) {
                      // Simple calculation: energyDelivered = currentMeterValue - startMeterValue
                      // This eliminates delta accumulation issues
                      const startMeterValue = parseFloat(transaction.startMeterValue) || 0;
                      const energyDelivered = Math.max(0, meterValueWh - startMeterValue);

                      // Debug: log energy calculation
                      logger.info(`MeterValues tx ${transactionId}: energyValue=${meterValueWh} Wh (reported ${energyValue} ${unit}), startMeterValue=${startMeterValue} Wh, energyDelivered=${energyDelivered} Wh`);

                      // Calculate real-time price based on the effective tariff.
                      let currentPrice = 0
                      let amount = 0
                      let pricing = null
                      try {
                        pricing = await getChargingPricing({ chargePointId, idTag: transaction.idTag })
                        const { pricePerWh: effectivePricePerWh } = pricing

                        const pricePerWh = effectivePricePerWh
                        const ratePerKwh = pricePerWh * 1000 // Convert ₦/Wh to ₦/kWh

                        // Store and calculate all cumulative meter values in Wh.
                        // OCPP 1.6 permits both Wh and kWh on the wire.
                        const energyInKwh = energyDelivered / 1000

                        logger.debug(
                          `MeterValues ENERGY CHECK: Original value=${energyDelivered}, unit=${unit}, interpreted as=${energyInKwh} kWh`
                        )

                        logger.debug(
                          `MeterValues EFFECTIVE PRICING (${pricing.source}): pricePerWh=${pricePerWh}, ratePerKwh=${ratePerKwh}`
                        )

                        // Calculate price
                        currentPrice = energyInKwh * ratePerKwh
                        amount = currentPrice

                        logger.debug(
                          `MeterValues CALCULATION: ${energyInKwh} kWh * ${ratePerKwh} Naira/kWh = ${currentPrice} Naira`
                        )
                      } catch (priceError) {
                        logger.error(
                          `Error calculating price for transaction ${transactionId}:`,
                          priceError
                        )
                        // Do not set price if we can't get it from the database
                        currentPrice = null
                        amount = null
                      }

                      // Update transaction with energy and price
                      await transaction.update({
                        currentMeterValue: meterValueWh,
                        stopMeterValue: meterValueWh,
                        energyDelivered: energyDelivered,
                        amount: amount,
                      })

                      // Update connector SoC if battery percentage was reported
                      if (batteryPercentage !== null) {
                        const { Connector } = require("../models")
                        const socConnectorId = connectorId || transaction.connectorId || 1
                        await Connector.update(
                          { soc: batteryPercentage },
                          { where: { chargePointId, connectorId: socConnectorId } }
                        )
                        logger.info(`Updated connector ${chargePointId}:${socConnectorId} SoC to ${batteryPercentage}%`)
                      }

                      // ═══ AUTO-STOP: Check if TOTAL cost of ALL active sessions exceeds wallet ═══
                      if (amount && amount > 0) {
                        try {
                          const user = await MobileUser.findOne({ where: { tagId: transaction.idTag } })
                          if (user) {
                            const wallet = await Wallet.findOne({ where: { userId: user.id } })
                            if (wallet) {
                              const walletBalance = parseFloat(wallet.balance)

                              // Sum cost of ALL active sessions for this user
                              const activeSessions = await Transaction.findAll({
                                where: { idTag: transaction.idTag, status: 'InProgress' },
                                attributes: ['transactionId', 'chargePointId', 'amount']
                              })
                              const totalCost = activeSessions.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)

                              if (totalCost >= walletBalance) {
                                logger.warn(
                                  `AUTO-STOP: Wallet exhausted for user ${user.email}. ` +
                                  `Total cost: ₦${totalCost.toFixed(2)} across ${activeSessions.length} session(s), ` +
                                  `Balance: ₦${walletBalance.toFixed(2)}. Stopping ALL sessions.`
                                )
                                const ocppServer = require("./server")
                                // Stop ALL active sessions for this user
                                for (const session of activeSessions) {
                                  if (ocppServer.isConnected(session.chargePointId)) {
                                    const stopKey = `${session.chargePointId}:${session.connectorId}`
                                    const previousStop = automaticStopRequests.get(stopKey)
                                    if (previousStop && Date.now() - previousStop < AUTOMATIC_STOP_RETRY_MS) {
                                      continue
                                    }

                                    const commandTransactionId = await resolveCanonicalOcppTransactionId({
                                      chargePointId: session.chargePointId,
                                      connectorId: session.connectorId,
                                      fallbackTransactionId: session.transactionId,
                                    })
                                    if (!commandTransactionId) {
                                      logger.warn(
                                        `AUTO-STOP: No canonical OCPP transaction ID for ` +
                                          `${session.chargePointId}:${session.connectorId}; not sending a blind stop`
                                      )
                                      continue
                                    }

                                    automaticStopRequests.set(stopKey, Date.now())
                                    ocppServer.sendOcppRequest(session.chargePointId, 'RemoteStopTransaction', {
                                      transactionId: commandTransactionId
                                    }).then(() => {
                                      logger.info(
                                        `AUTO-STOP: RemoteStopTransaction sent for OCPP tx ${commandTransactionId} ` +
                                          `(internal tx ${session.transactionId}) at ${session.chargePointId}`
                                      )
                                    }).catch(err => {
                                      automaticStopRequests.delete(stopKey)
                                      logger.error(`AUTO-STOP: Failed to send RemoteStop for OCPP tx ${commandTransactionId}:`, err)
                                    })
                                  }
                                }
                              }
                            }
                          }
                        } catch (autoStopErr) {
                          logger.error(`AUTO-STOP check error for tx ${transactionId}:`, autoStopErr)
                        }
                      }

                      // Publish energy update to MQTT
                      if (mqttClient) {
                        // Important: Use the directly calculated values rather than
                        // fetching from transaction model which might have old values
                        const mqttPrice = currentPrice || 0
                        const mqttAmount = amount || 0

                        // The frontend needs the raw values without modification
                        logger.debug(
                          `MQTT PUBLISH VALUES (original): price=${mqttPrice}, amount=${mqttAmount}, energy=${energyDelivered}`
                        )

                        // DEBUG: Check if the price is unusually small - this helps identify scaling issues
                        if (mqttPrice > 0 && mqttPrice < 10) {
                          logger.warn(
                            `WARNING: Price ${mqttPrice} for ${energyInKwh} kWh seems unusually low! Expected ~${
                              energyInKwh * 200
                            }`
                          )
                        }

                        // Include the 'energy' property that frontend is expecting
                        mqttClient.publish(
                          `ocpp/transactions/${transactionId}/energy`,
                          JSON.stringify({
                            timestamp,
                            energy: energyDelivered, // Add this property for the frontend
                            energyDelivered,
                            meterValue: energyValue,
                            unit,
                            // Don't convert the price and amount fields - send raw calculated values
                            price: mqttPrice,
                            amount: mqttAmount,
                            chargePointId, // Add station ID for filtering
                            transactionId, // Include transaction ID for reference
                            soc: batteryPercentage, // Battery percentage for real-time updates
                            batteryPercentage,
                          })
                        )

                        // Also publish to station-specific topic for StationDetail component
                        mqttClient.publish(
                          `ocpp/stations/${chargePointId}/energy`,
                          JSON.stringify({
                            timestamp,
                            energy: energyDelivered, // This is what frontend expects
                            power:
                              powerValue ||
                              Math.round(Math.random() * 7000) + 3000, // Use actual power or fallback to simulation
                            // Don't convert the price and amount fields - send raw calculated values
                            price: mqttPrice,
                            amount: mqttAmount,
                            chargePointId,
                            transactionId,
                            connectorId,
                            soc: batteryPercentage, // Battery percentage for dashboard display
                            batteryPercentage,
                          })
                        )
                      }
                    }
                  } catch (txError) {
                    logger.warn(
                      `Error updating transaction energy: ${txError.message}`
                    )
                  }
                }
              }
            }
          }

          // ═══ Persist SoC to connector (runs after all sampledValues are processed) ═══
          if (batteryPercentage !== null) {
            try {
              const { Connector } = require("../models")
              const socConnId = connectorId || 1
              await Connector.update(
                { soc: batteryPercentage },
                { where: { chargePointId, connectorId: socConnId } }
              )
              logger.info(`SoC persisted: ${chargePointId}:${socConnId} → ${batteryPercentage}%`)
            } catch (socErr) {
              logger.warn(`Failed to persist SoC for ${chargePointId}: ${socErr.message}`)
            }

            try {
              await persistTransactionBatteryPercentage(transactionId, chargePointId, batteryPercentage)
            } catch (transactionSocError) {
              logger.warn(`Failed to persist transaction SoC for ${transactionId}: ${transactionSocError.message}`)
            }
          }
        }
      } catch (dbError) {
        logger.error(
          `Database error during MeterValues from ${chargePointId}:`,
          dbError
        )
      }
    }

    // Return OCPP 1.6 compliant response (empty payload)
    return [3, uniqueId, {}]
  } catch (error) {
    logger.error(`Error handling MeterValues from ${chargePointId}:`, error)
    // Return empty response even on error
    return [3, uniqueId, {}]
  }
}

// Helper function to update connector status
async function updateConnectorStatus(
  chargePointId,
  connectorId,
  status,
  transactionId = null
) {
  try {
    await sequelize.query(
      `INSERT INTO connectors 
            ("chargePointId", "connectorId", status, "transactionId", "createdAt", "updatedAt") 
            VALUES ($1, $2, $3, $4, NOW(), NOW())
            ON CONFLICT ("chargePointId", "connectorId") 
            DO UPDATE SET 
            status = $3, 
            "transactionId" = $4,
            "lastStatusUpdate" = NOW(),
            "updatedAt" = NOW()`,
      {
        bind: [chargePointId, connectorId, status, transactionId],
        type: sequelize.QueryTypes.INSERT,
      }
    )

    return true
  } catch (error) {
    logger.error(`Error updating connector status: ${error.message}`)
    return false
  }
}

/**
 * Handle Heartbeat request
 */
async function handleHeartbeat(chargePointId, uniqueId) {
  try {
    logger.debug(`Received Heartbeat from ${chargePointId}`)

    // Update last heartbeat time in database
    try {
      // Use the ChargingStation model to update the lastHeartbeat field
      const station = await ChargingStation.findOne({
        where: { chargePointId },
      })

      if (station) {
        // Update the lastHeartbeat time using the model's field name
        await station.update({
          lastHeartbeat: new Date(),
        })
        logger.debug(
          `Updated lastHeartbeat for ${chargePointId} to ${new Date().toISOString()}`
        )

        // If station is Unavailable, update to Available since it's sending heartbeats
        if (station.status === 'Unavailable') {
          await station.update({
            status: 'Available'
          })
          logger.info(
            `Station ${chargePointId} status updated from Unavailable to Available (heartbeat received)`
          )
        }
      } else {
        logger.warn(
          `Station ${chargePointId} not found in database during heartbeat update`
        )
      }
    } catch (dbError) {
      logger.error(
        `Database error during Heartbeat from ${chargePointId}:`,
        dbError
      )
      // Continue even if DB update fails
    }

    // Publish heartbeat to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/${chargePointId}/heartbeat`,
        JSON.stringify({
          timestamp: new Date().toISOString(),
        })
      )
    }

    // Return standard heartbeat response as per OCPP 1.6
    return [
      3,
      uniqueId,
      {
        currentTime: new Date().toISOString(),
      },
    ]
  } catch (error) {
    logger.error(`Error handling heartbeat from ${chargePointId}:`, error)
    return [
      3,
      uniqueId,
      {
        currentTime: new Date().toISOString(),
      },
    ]
  }
}

/**
 * Handle BootNotification request
 */
async function handleBootNotification(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing BootNotification from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Store or update charging station info in database
    const stationData = {
      vendor: payload.chargePointVendor,
      model: payload.chargePointModel,
      firmwareVersion: payload.firmwareVersion,
      chargePointSerialNumber: payload.chargePointSerialNumber,
      iccid: payload.iccid,
      imsi: payload.imsi,
      meterType: payload.meterType,
      meterSerialNumber: payload.meterSerialNumber,
    }

    // Generate a name for the station using model and vendor
    const stationName = payload.chargePointModel
      ? `${payload.chargePointVendor || "Unknown"} ${payload.chargePointModel}`
      : `Station ${chargePointId}`

    try {
      // Update or insert charging station record
      await sequelize.query(
        `INSERT INTO charging_stations 
                ("chargePointId", "name", "vendor", "model", "firmwareVersion", "lastConnection", "lastHeartbeat", "status", "createdAt", "updatedAt") 
                VALUES ($1, $5, $2, $3, $4, NOW(), NOW(), 'Available', NOW(), NOW())
                ON CONFLICT ("chargePointId") 
                DO UPDATE SET 
                "vendor" = $2, 
                "model" = $3, 
                "firmwareVersion" = $4,
                "lastConnection" = NOW(),
                "lastHeartbeat" = NOW(),
                "name" = COALESCE("charging_stations"."name", $5),
                "updatedAt" = NOW(),
                "status" = CASE
                  WHEN "charging_stations"."status" = 'Charging' THEN "charging_stations"."status"
                  ELSE 'Available'
                END`,
        {
          bind: [
            chargePointId,
            payload.chargePointVendor || "Unknown",
            payload.chargePointModel || "Unknown",
            payload.firmwareVersion || "",
            stationName, // Add the generated name as the 5th parameter
          ],
          type: sequelize.QueryTypes.INSERT,
        }
      )
    } catch (dbError) {
      logger.error(
        `Database error during BootNotification from ${chargePointId}:`,
        dbError
      )
      // Continue even if DB update fails
    }

    // Publish boot notification to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/${chargePointId}/boot`,
        JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
        })
      )
    }

    // Return standard boot confirmation as per OCPP 1.6
    return [
      3,
      uniqueId,
      {
        status: "Accepted",
        currentTime: new Date().toISOString(),
        interval: 30, // Heartbeat interval in seconds - matching real station behavior
      },
    ]
  } catch (error) {
    logger.error(
      `Error handling boot notification from ${chargePointId}:`,
      error
    )
    return [
      3,
      uniqueId,
      {
        status: "Rejected",
        currentTime: new Date().toISOString(),
        interval: 60, // Shorter interval on error
      },
    ]
  }
}

/**
 * Handle StatusNotification request
 */
async function handleStatusNotification(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing StatusNotification from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Store connector status in database
    const { connectorId, errorCode } = payload
    let status = payload.status
    let statusTransactionId = null

    try {
      // Special handling for status transitions based on the standard flow
      if (status === "Charging") {
        // Check if there's an active transaction for this connector
        const transaction = await Transaction.findOne({
          where: {
            chargePointId,
            connectorId,
            status: "InProgress",
          },
          order: [["createdAt", "DESC"]],
        })

        if (transaction) {
          statusTransactionId = transaction.transactionId
          logger.info(
            `Station ${chargePointId} connector ${connectorId} started charging transaction ${transaction.transactionId}`
          )

          // Start tracking energy if not already started
          if (
            chargingSessionTracker &&
            !chargingSessionTracker.activeTransactions.has(transaction.id)
          ) {
            logger.info(
              `Starting energy tracking for transaction ${transaction.id}`
            )
            chargingSessionTracker.startSession(
              transaction.transactionId,
              [],
              transaction.startMeterValue
            )
          }

          // Make sure transaction is marked as InProgress
          await transaction.update({ status: "InProgress" })
          await ChargingStation.update(
            { status: "Charging", currentTransaction: transaction.transactionId },
            { where: { chargePointId } }
          )

          // Publish comprehensive status update including transaction info
          if (mqttClient) {
            mqttClient.publish(
              `ocpp/${chargePointId}/status`,
              JSON.stringify({
                connectorId,
                status: "Charging",
                transactionId: transaction.transactionId,
                meterStart: transaction.startMeterValue,
                energy: transaction.energyDelivered || 0,
                power: 0, // Initial power until meter values arrive
                timestamp: new Date().toISOString(),
              })
            )
          }
        } else {
          // Charger reports Charging but no active transaction
          // This happens when: offline timer completed the transaction but charger kept charging
          // RESUME the session — reopen the transaction and continue tracking
          logger.warn(`Station ${chargePointId}:${connectorId} reports Charging but no active transaction — attempting to resume session`)
          
          // First, check the connector's transactionId (most accurate source)
          const { Connector } = require("../models")
          const connector = await Connector.findOne({
            where: { chargePointId, connectorId }
          })
          
          let resumeTx = null
          if (connector && connector.transactionId) {
            // Connector has the transaction ID — use it
            resumeTx = await Transaction.findOne({
              where: { transactionId: connector.transactionId }
            })
            logger.info(`Found transaction ID from connector: ${connector.transactionId}`)
          }
          
          // If the timer already completed this same connector's session,
          // resume only a recent network-recovered record. Never reopen the
          // most recent transaction from another connector or user.
          if (!resumeTx) {
            const recentRecovered = await Transaction.findAll({
              where: {
                chargePointId,
                connectorId,
                status: ['Completed', 'Stopped'],
                offlineSince: { [Op.ne]: null },
                stopTime: { [Op.gte]: new Date(Date.now() - 15 * 60 * 1000) }
              },
              order: [["stopTime", "DESC"]],
              limit: 2
            })
            if (recentRecovered.length === 1) resumeTx = recentRecovered[0]
          }
          
          if (resumeTx) {
            statusTransactionId = resumeTx.transactionId
            // Reopen the transaction — set back to InProgress
            const wasBilled = !!resumeTx.billedAt
            const previousAmount = parseFloat(resumeTx.amount) || 0
            
            await resumeTx.update({
              status: 'InProgress',
              stopTime: null,
              billedAt: null,
            })
            
            logger.info(
              `RESUMED session: tx ${resumeTx.transactionId} on ${chargePointId} ` +
              `reopened to InProgress (was billed: ${wasBilled}, amount: ₦${previousAmount.toFixed(2)})`
            )
            
            // If it was already billed, refund the wallet so billing is clean when it actually stops
            if (wasBilled && previousAmount > 0) {
              try {
                const { MobileUser, Wallet, PaymentTransaction } = require("../models")
                const user = await MobileUser.findOne({ where: { tagId: resumeTx.idTag } })
                if (user) {
                  const wallet = await Wallet.findOne({ where: { userId: user.id } })
                  if (wallet) {
                    const currentBalance = parseFloat(wallet.balance)
                    const newBalance = currentBalance + previousAmount
                    await wallet.update({ balance: newBalance })
                    
                    await PaymentTransaction.create({
                      userId: user.id,
                      walletId: wallet.id,
                      type: 'CREDIT',
                      amount: previousAmount,
                      currency: 'NGN',
                      reference: `RESUME-${resumeTx.transactionId}-${Date.now()}`,
                      gateway: 'internal',
                      status: 'SUCCESS',
                      description: `Session resumed: refund for tx ${resumeTx.transactionId} (will be re-billed on actual stop)`,
                      metadata: {
                        transactionId: resumeTx.transactionId,
                        chargePointId,
                        reason: 'session_resumed_after_network_drop',
                        previousBalance: currentBalance,
                        newBalance: newBalance
                      }
                    })
                    
                    logger.info(
                      `WALLET REFUND for resumed session tx ${resumeTx.transactionId}: ` +
                      `₦${previousAmount.toFixed(2)} refunded to user ${user.email}. ` +
                      `Balance: ₦${currentBalance.toFixed(2)}→₦${newBalance.toFixed(2)}`
                    )
                  }
                }
              } catch (refundErr) {
                logger.error(`Refund error for resumed tx ${resumeTx.transactionId}: ${refundErr.message}`)
              }
            }
            
            // Update station status to Charging
            await ChargingStation.update(
              { status: "Charging", currentTransaction: resumeTx.transactionId },
              { where: { chargePointId } }
            )
            
            // Restart energy tracking
            if (chargingSessionTracker) {
              chargingSessionTracker.startSession(
                resumeTx.transactionId,
                [],
                resumeTx.startMeterValue
              )
            }
            
            // Publish resumed Charging status to MQTT
            if (mqttClient) {
              mqttClient.publish(
                `ocpp/${chargePointId}/status`,
                JSON.stringify({
                  connectorId,
                  status: "Charging",
                  transactionId: resumeTx.transactionId,
                  resumed: true,
                  energy: resumeTx.energyDelivered || 0,
                  timestamp: new Date().toISOString(),
                })
              )
            }
          } else {
            // Do not stop a charger that is actively sending meter values just
            // because its StartTransaction was lost. MeterValues reconciliation
            // can safely create a continuation for the exact reported user; a
            // blanket RemoteStop here used to leave the vehicle charging while
            // also making it impossible to bill the session.
            const recentTelemetry = await MeterValue.findOne({
              where: {
                chargePointId,
                connectorId,
                createdAt: { [Op.gte]: new Date(Date.now() - 2 * 60 * 1000) }
              },
              order: [["createdAt", "DESC"]],
              attributes: ["id", "timestamp", "transactionId"]
            })

            if (recentTelemetry) {
              logger.warn(
                `Station ${chargePointId}:${connectorId} is Charging without an active ` +
                  `transaction but has fresh MeterValues; waiting for safe reconciliation`
              )
            } else {
              // No telemetry and no transaction is a genuinely orphaned charge.
              // Keep the safety stop for that case only.
              logger.warn(`Station ${chargePointId}:${connectorId} charging with NO transaction or recent telemetry — sending RemoteStop`)
              try {
                const ocppServer = require("./server")
                if (ocppServer.isConnected(chargePointId)) {
                  await ocppServer.sendOcppRequest(chargePointId, 'RemoteStopTransaction', {
                    transactionId: 0
                  })
                }
              } catch (stopErr) {
                logger.error(`Failed to send RemoteStop for orphaned charging on ${chargePointId}: ${stopErr.message}`)
              }
            }
          }
        }
      } else if (status === "Preparing") {
        // Log the preparing status - this is temporary before charging starts
        logger.info(
          `Station ${chargePointId} connector ${connectorId} is preparing to charge`
        )

        // Set a timeout to check if still in preparing after 30 seconds
        setTimeout(async () => {
          try {
            const connector = await sequelize.query(
              `SELECT status FROM connectors WHERE "chargePointId" = $1 AND "connectorId" = $2`,
              {
                bind: [chargePointId, connectorId],
                type: sequelize.QueryTypes.SELECT,
              }
            )

            if (connector.length > 0 && connector[0].status === "Preparing") {
              logger.warn(
                `Station ${chargePointId} connector ${connectorId} stuck in Preparing state for 30s - resetting to Available`
              )
              await updateConnectorStatus(
                chargePointId,
                connectorId,
                "Available"
              )

              // Publish timeout notification
              if (mqttClient) {
                mqttClient.publish(
                  `ocpp/${chargePointId}/status`,
                  JSON.stringify({
                    connectorId,
                    status: "Available",
                    errorCode: "PrepareTimeout",
                    timestamp: new Date().toISOString(),
                  })
                )
              }
            }
          } catch (timeoutError) {
            logger.error(
              `Error handling Preparing timeout: ${timeoutError.message}`
            )
          }
        }, 30000) // 30 second timeout as recommended
      }

      // If charger reports Finishing but no active transaction, force Available (user hasn't unplugged but session is done)
      if (status === "Finishing") {
        const activeTx = await Transaction.findOne({
          where: { chargePointId, connectorId, status: "InProgress" }
        });
        if (!activeTx) {
          logger.info(`Station ${chargePointId}:${connectorId} reports Finishing but no active transaction — forcing Available`);
          status = "Available";
        }
      }

      // Update connector status in database
      await updateConnectorStatus(chargePointId, connectorId, status, status === "Charging" ? statusTransactionId : null)

      if (status !== "Charging") {
        // A station may have one charging connector and another connector in
        // Faulted/Unavailable state. Do not let the secondary connector mask
        // the active session in the station-level dashboard.
        const activeTransaction = await Transaction.findOne({
          where: { chargePointId, status: "InProgress" },
          order: [["createdAt", "DESC"]],
          attributes: ["transactionId"]
        })
        const otherCharging = await Connector.findOne({
          where: {
            chargePointId,
            status: "Charging",
            ...(connectorId ? { connectorId: { [Op.ne]: connectorId } } : {})
          },
          attributes: ["transactionId"]
        })
        const aggregateStatus = activeTransaction || otherCharging
          ? "Charging"
          : status === "Available"
            ? "Available"
            : status
        await ChargingStation.update(
          {
            status: aggregateStatus,
            ...(aggregateStatus === "Available"
              ? { currentTransaction: null }
              : activeTransaction?.transactionId
                ? { currentTransaction: activeTransaction.transactionId }
                : {})
          },
          { where: { chargePointId } }
        )
      }

      // If charger reports Available/Finishing but we have InProgress transactions — session is dead
      if (status === "Available" || status === "Finishing" || status === "SuspendedEV") {
        try {
          const staleTxs = await Transaction.findAll({
            where: { chargePointId, connectorId, status: "InProgress" }
          })
          if (staleTxs.length > 0) {
            logger.warn(`Station ${chargePointId}:${connectorId} reports ${status} but has ${staleTxs.length} InProgress transaction(s) — auto-completing`)

            const offlineRecovery = require("../services/offlineTransactionRecovery")
            for (const staleTx of staleTxs) {
              const result = await offlineRecovery.completeOfflineTransaction(
                staleTx,
                new Date(),
                { reason: 'ChargerReportedUnavailable' }
              )
              if (result.completed) {
                logger.warn(
                  `Auto-completed orphan tx ${staleTx.transactionId} on ` +
                  `${chargePointId}:${connectorId} (charger reported ${status})`
                )
              }
            }
          }
        } catch (orphanErr) {
          logger.error(`Error checking orphan transactions on ${chargePointId}:${connectorId}: ${orphanErr.message}`)
        }
      }

      // Publish status notification to MQTT
      if (mqttClient) {
        mqttClient.publish(
          `ocpp/${chargePointId}/status`,
          JSON.stringify({
            connectorId,
            status,
            errorCode,
            timestamp: new Date().toISOString(),
          })
        )
      }
    } catch (dbError) {
      logger.error(
        `Database error during StatusNotification from ${chargePointId}:`,
        dbError
      )
    }

    // Return OCPP 1.6 compliant response (empty payload)
    return [3, uniqueId, {}]
  } catch (error) {
    logger.error(
      `Error handling StatusNotification from ${chargePointId}:`,
      error
    )
    // Return empty response even on error
    return [3, uniqueId, {}]
  }
}

/**
 * Handle DataTransfer request
 */
async function handleDataTransfer(chargePointId, uniqueId, payload) {
  try {
    logger.info(
      `Processing DataTransfer from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Extract data from payload
    const vendorId = payload.vendorId || ""
    const messageId = payload.messageId || ""
    const data = payload.data || {}

    // Publish data transfer to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/${chargePointId}/dataTransfer`,
        JSON.stringify({
          vendorId,
          messageId,
          data,
          timestamp: new Date().toISOString(),
        })
      )
    }

    // Return OCPP 1.6 compliant response
    return [
      3,
      uniqueId,
      {
        status: "Accepted",
        data: {},
      },
    ]
  } catch (error) {
    logger.error(`Error handling DataTransfer from ${chargePointId}:`, error)
    // Return error response
    return [
      3,
      uniqueId,
      {
        status: "Rejected",
        data: {},
      },
    ]
  }
}

/**
 * Handle DiagnosticsStatusNotification request
 */
async function handleDiagnosticsStatusNotification(
  chargePointId,
  uniqueId,
  payload
) {
  try {
    logger.info(
      `Processing DiagnosticsStatusNotification from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Extract status from payload
    const status = payload.status || "Idle"

    // Publish diagnostics status to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/${chargePointId}/diagnosticsStatus`,
        JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
        })
      )
    }

    // Return OCPP 1.6 compliant response (empty payload)
    return [3, uniqueId, {}]
  } catch (error) {
    logger.error(
      `Error handling DiagnosticsStatusNotification from ${chargePointId}:`,
      error
    )
    // Return empty response even on error
    return [3, uniqueId, {}]
  }
}

/**
 * Handle FirmwareStatusNotification request
 */
async function handleFirmwareStatusNotification(
  chargePointId,
  uniqueId,
  payload
) {
  try {
    logger.info(
      `Processing FirmwareStatusNotification from ${chargePointId}: ${JSON.stringify(
        payload
      )}`
    )

    // Extract status from payload
    const status = payload.status || "Idle"

    // Publish firmware status to MQTT
    if (mqttClient) {
      mqttClient.publish(
        `ocpp/${chargePointId}/firmwareStatus`,
        JSON.stringify({
          status,
          timestamp: new Date().toISOString(),
        })
      )
    }

    // Return OCPP 1.6 compliant response (empty payload)
    return [3, uniqueId, {}]
  } catch (error) {
    logger.error(
      `Error handling FirmwareStatusNotification from ${chargePointId}:`,
      error
    )
    // Return empty response even on error
    return [3, uniqueId, {}]
  }
}

// Export functions
module.exports = {
  handleRequest,
  handleBootNotification,
  handleHeartbeat,
  handleStatusNotification,
  handleAuthorize,
  handleStartTransaction,
  handleStopTransaction,
  handleMeterValues,
  handleDataTransfer,
  handleDiagnosticsStatusNotification,
  handleFirmwareStatusNotification,
  updateConnectorStatus,
  registerPendingRemoteStart,
}
