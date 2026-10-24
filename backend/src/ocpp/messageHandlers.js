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
const {
  billTransaction,
  reconcileCompletedBilling,
  reopenNetworkDisconnectedTransaction,
} = require("../services/billingService")
const { calculatePartnerRevenue } = require("../services/partnerRevenueService")
const { getChargingPricing } = require("../services/chargingPricingService")
const {
  resolveCanonicalOcppTransactionId,
} = require("../services/ocppTransactionResolver")
const {
  REMOTE_START_RECOVERY_WINDOW_MS,
  REMOTE_START_SESSION_WINDOW_MS,
  findVerifiedRemoteStartIntent,
  getVerifiedRemoteStartOwner,
} = require("./remoteStartCorrelation")
const {
  findStartTransactionEvidence,
  evidenceMatchesTransaction,
  bindOcppIdentity,
  resolveStopTransactionOwnership,
  parseOcppPayload,
} = require("./sessionOwnership")

// Track pending RemoteStart requests for diagnostics/cleanup. This map is not
// financial ownership evidence; accepted OCPP audit history is authoritative.
const pendingRemoteStarts = new Map()
const meterResolutionLocks = new Map()
const stationSessionLocks = new Map()
const terminalRecoveryTimers = new Map()
// Prevent a wallet stop check from issuing a new command for every MeterValues
// frame while the charger is processing the previous stop request.
const automaticStopRequests = new Map()
const AUTOMATIC_STOP_RETRY_MS = 60 * 1000
const NETWORK_SESSION_RESUME_WINDOW_MS = Number.parseInt(
  process.env.OCPP_NETWORK_SESSION_RESUME_WINDOW_MS || String(7 * 24 * 60 * 60 * 1000),
  10
)
const TERMINAL_STATUS_GRACE_MS = Number.parseInt(
  process.env.OCPP_TERMINAL_STATUS_GRACE_MS || "30000",
  10
)

async function withStationSessionLock(chargePointId, operation) {
  const key = String(chargePointId)
  const previous = stationSessionLocks.get(key) || Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  stationSessionLocks.set(key, current)
  try {
    return await current
  } finally {
    if (stationSessionLocks.get(key) === current) stationSessionLocks.delete(key)
  }
}

function clearTerminalRecovery(chargePointId, connectorId) {
  const key = `${chargePointId}:${connectorId}`
  const timer = terminalRecoveryTimers.get(key)
  if (timer) clearTimeout(timer)
  terminalRecoveryTimers.delete(key)
}

function scheduleTerminalRecovery(chargePointId, connectorId, terminalStatus) {
  clearTerminalRecovery(chargePointId, connectorId)
  const key = `${chargePointId}:${connectorId}`
  const timer = setTimeout(() => {
    terminalRecoveryTimers.delete(key)
    withStationSessionLock(chargePointId, async () => {
      const connector = await Connector.findOne({
        where: { chargePointId, connectorId },
        attributes: ["status"],
      })
      if (!connector || !["Available", "Finishing"].includes(connector.status)) return

      const active = await Transaction.findAll({
        where: { chargePointId, connectorId, status: "InProgress" },
        order: [["startTime", "DESC"]],
        limit: 2,
      })
      if (active.length !== 1) {
        if (active.length > 1) {
          logger.error(
            `Terminal recovery quarantined on ${chargePointId}:${connectorId}: ` +
              `${active.length} active transactions require manual review`
          )
        }
        return
      }

      const offlineRecovery = require("../services/offlineTransactionRecovery")
      const result = await offlineRecovery.completeOfflineTransaction(
        active[0],
        new Date(),
        {
          reason: "ChargerReportedTerminalStatus",
          stopReason: terminalStatus,
        }
      )
      if (result.completed) {
        logger.warn(
          `Finalized transaction ${active[0].transactionId} after ${terminalStatus} remained ` +
            `unconfirmed by StopTransaction for ${TERMINAL_STATUS_GRACE_MS}ms`
        )
      }
    }).catch(error => {
      logger.error(`Terminal recovery failed on ${key}: ${error.message}`)
    })
  }, TERMINAL_STATUS_GRACE_MS)
  timer.unref?.()
  terminalRecoveryTimers.set(key, timer)
}

function parseBatteryPercentage(value) {
  if (value === null || value === undefined || value === "") return null
  const percentage = Number(value)
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
    ? percentage
    : null
}

function parseMeterValueWh(sampledValues) {
  const values = Array.isArray(sampledValues) ? sampledValues : []
  // Billing must use the connector's aggregate cumulative register. Phase
  // readings remain in the audit history, but one phase is not session total.
  const energy = values.find(
    (sampledValue) =>
      !sampledValue?.phase &&
      sampledValue?.measurand === "Energy.Active.Import.Register"
  ) || values.find(
    (sampledValue) => !sampledValue?.phase && !sampledValue?.measurand
  )
  if (!energy) return null

  const value = Number(energy.value)
  if (!Number.isFinite(value)) return null
  return String(energy.unit || "Wh").toLowerCase() === "kwh"
    ? value * 1000
    : value
}

async function getSessionPricing(transaction, { chargePointId, idTag } = {}) {
  const current = await getChargingPricing({
    chargePointId: chargePointId || transaction?.chargePointId,
    idTag: idTag || transaction?.idTag,
  })
  const snapshotRate = Number(transaction?.sellingPricePerWh)
  const snapshotMinimum = Number(transaction?.minimumChargeAmount)
  const historicalAppliedMinimum = Number(transaction?.amount)
  const hasSnapshotRate = Number.isFinite(snapshotRate) && snapshotRate > 0
  const hasSnapshotMinimum =
    transaction?.minimumChargeAmount !== null &&
    transaction?.minimumChargeAmount !== undefined &&
    Number.isFinite(snapshotMinimum) &&
    snapshotMinimum >= 0

  return {
    ...current,
    pricePerWh: hasSnapshotRate ? snapshotRate : current.pricePerWh,
    minimumCharge: hasSnapshotMinimum
      ? snapshotMinimum
      : transaction?.minimumChargeApplied &&
          Number.isFinite(historicalAppliedMinimum) &&
          historicalAppliedMinimum >= 0
        ? historicalAppliedMinimum
        : current.minimumCharge,
    source: hasSnapshotRate ? `${current.source}:session-snapshot` : current.source,
  }
}

async function determineRecoveryStartMeter({
  chargePointId,
  connectorId,
  reportedTransactionId,
  remoteStartIntent,
  previousFinalMeter,
  currentMeterValueWh,
}) {
  const evidenceStart =
    remoteStartIntent?.chargingConfirmedAt ||
    remoteStartIntent?.acceptedAt ||
    remoteStartIntent?.createdAt
  if (!evidenceStart) return currentMeterValueWh >= previousFinalMeter
    ? previousFinalMeter
    : 0

  try {
    const rows = await OcppMessage.findAll({
      where: {
        chargePointId,
        message_type: "MeterValues",
        direction: "Inbound",
        createdAt: { [Op.gte]: new Date(new Date(evidenceStart).getTime() - 5 * 1000) },
      },
      order: [["createdAt", "ASC"]],
      limit: 250,
      attributes: ["payload", "createdAt"],
    })
    const observed = []
    for (const row of rows) {
      const meterPayload = parseOcppPayload(row.payload)
      if (!meterPayload) continue
      if (Number(meterPayload.connectorId) !== Number(connectorId)) continue
      if (
        reportedTransactionId &&
        Number(meterPayload.transactionId) !== Number(reportedTransactionId)
      ) continue
      for (const meterValue of meterPayload.meterValue || []) {
        const valueWh = parseMeterValueWh(meterValue?.sampledValue || [])
        if (Number.isFinite(valueWh) && valueWh <= currentMeterValueWh) observed.push(valueWh)
      }
    }

    const minimumObserved = observed.length > 0 ? Math.min(...observed) : null
    if (minimumObserved !== null && minimumObserved < previousFinalMeter) return 0
    if (minimumObserved !== null && minimumObserved <= 250) return 0
    if (currentMeterValueWh >= previousFinalMeter) return previousFinalMeter
    return 0
  } catch (error) {
    logger.warn(
      `Could not inspect recovery meter baseline for ${chargePointId}:${connectorId}: ${error.message}`
    )
    return currentMeterValueWh >= previousFinalMeter ? previousFinalMeter : 0
  }
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
 *   2. If the reported ID is completed, create a continuation only for a newer
 *      accepted RemoteStart owner on this exact connector.
 *   3. If neither is safe, return null; raw OCPP telemetry remains available
 *      for audit but is not billed to an arbitrary user.
 */
async function resolveMeterValuesTransactionUnlocked({
  chargePointId,
  connectorId,
  reportedTransactionId,
  meterValueWh,
  meterTimestamp,
  chargingSignal = false
}) {
  let reported = reportedTransactionId
    ? await Transaction.findOne({
        where: {
          chargePointId,
          connectorId,
          [Op.or]: [
            { transactionId: reportedTransactionId },
            { ocppTransactionId: reportedTransactionId },
          ],
        }
      })
    : null
  if (
    reported &&
    Number(reported.transactionId) === Number(reportedTransactionId) &&
    Number(reported.ocppTransactionId) !== Number(reportedTransactionId) &&
    (
      String(reported.reason || "").startsWith("OCPP_") ||
      String(reported.ownershipSource || "").includes("recovery") ||
      reported.remoteStartMessageId
    )
  ) {
    // The station cannot know a CMS-only recovery ID. Do not let an unlikely
    // numeric collision turn that internal key into ownership evidence.
    reported = null
  }

  // A charger can change its transaction ID while the CSMS is still handling
  // the previous message. Never let that stale ID override an active session
  // on the same physical connector.
  const active = await Transaction.findOne({
    where: { chargePointId, connectorId, status: "InProgress" },
    order: [["startTime", "DESC"]]
  })
  if (active) {
    // Re-check durable OCPP history even when the in-memory pending map was
    // lost in a process restart. This is intentionally done before every
    // billable frame: safety takes precedence over guessing that ownership is
    // unchanged after a reconnect.
    const remoteStartIntent = await findVerifiedRemoteStartIntent({
      chargePointId,
      connectorId,
      requireChargingConfirmation: true,
      maxAgeMs: REMOTE_START_SESSION_WINDOW_MS,
    })
    const verifiedIntentOwner = getVerifiedRemoteStartOwner(remoteStartIntent, connectorId)
    const activeStartedAt = active.startTime ? new Date(active.startTime) : null
    const conflictingNewIntent = Boolean(
      verifiedIntentOwner &&
      active.idTag &&
      verifiedIntentOwner !== String(active.idTag) &&
      activeStartedAt &&
      remoteStartIntent.createdAt > activeStartedAt
    )

    // Transaction ownership is immutable after creation. A later accepted
    // RemoteStart for another user is a conflict to investigate, never a
    // reason to transfer the existing session (and its energy) to that user.
    if (conflictingNewIntent) {
      logger.error(
        `Quarantining MeterValues on ${chargePointId}:${connectorId}: active transaction ` +
          `${active.transactionId} belongs to ${active.idTag}, but newer accepted RemoteStart ` +
          `${remoteStartIntent.messageId} belongs to ${verifiedIntentOwner}`
      )
      return { transaction: null, reportedTransactionId, recovered: false, quarantined: true }
    }

    const remoteStartMatchesActive = verifiedIntentOwner === String(active.idTag)
    const immutableVerifiedRecovery =
      active.reason === "OCPP_VERIFIED_REMOTE_START_RECOVERY" ||
      (active.reason === "OCPP_STALE_TRANSACTION_RECOVERY" && remoteStartMatchesActive)
    const recoveryOwned =
      String(active.reason || "").startsWith("OCPP_") ||
      String(active.ownershipSource || "").includes("recovery") ||
      Boolean(active.remoteStartMessageId)
    const directlyLinked = Boolean(
      reportedTransactionId &&
      (
        (!recoveryOwned && Number(active.transactionId) === Number(reportedTransactionId)) ||
        Number(active.ocppTransactionId) === Number(reportedTransactionId)
      )
    )
    let startEvidence = null
    if (reportedTransactionId && !directlyLinked) {
      startEvidence = await findStartTransactionEvidence({
        chargePointId,
        ocppTransactionId: reportedTransactionId,
      })
    }
    const startEvidenceMatchesActive = evidenceMatchesTransaction(startEvidence, active)
    const verifiedRecoveryLink = Boolean(
      immutableVerifiedRecovery && remoteStartMatchesActive
    )

    if (directlyLinked && !active.ocppTransactionId) {
      await bindOcppIdentity(active, {
        ocppTransactionId: reportedTransactionId,
        ownershipSource: active.ownershipSource || "exact_ocpp_transaction",
        ownershipVerifiedAt: active.ownershipVerifiedAt || new Date(),
      })
    }

    // Connector status and a station-wide single active record are not owner
    // evidence. If the reported OCPP ID is different, require the original
    // StartTransaction pair or an immutable, accepted RemoteStart recovery.
    if (
      reportedTransactionId &&
      !directlyLinked &&
      !startEvidenceMatchesActive &&
      !verifiedRecoveryLink
    ) {
      logger.error(
        `Quarantining MeterValues ${reportedTransactionId} on ${chargePointId}:${connectorId}: ` +
          `active transaction ${active.transactionId} has no matching StartTransaction/RemoteStart ownership link`
      )
      return { transaction: null, reportedTransactionId, recovered: false, quarantined: true }
    }

    if (reportedTransactionId && (startEvidenceMatchesActive || verifiedRecoveryLink)) {
      await bindOcppIdentity(active, {
        ocppTransactionId: reportedTransactionId,
        startMessageId: startEvidence?.messageId,
        remoteStartMessageId: remoteStartIntent?.messageId,
        ownershipSource: startEvidenceMatchesActive
          ? "start_transaction_audit"
          : "verified_remote_start_recovery",
        ownershipVerifiedAt:
          startEvidence?.receivedAt || remoteStartIntent?.acceptedAt || remoteStartIntent?.createdAt,
      })
    }
    const activeReadingTime = meterTimestamp ? new Date(meterTimestamp) : null
    const activeStartMeter = Number(active.startMeterValue)
    const activeLatestMeter = Math.max(
      Number.isFinite(activeStartMeter) ? activeStartMeter : 0,
      Number(active.stopMeterValue) || 0
    )
    const reportedUserMatchesActive = Boolean(
      reported?.idTag && active.idTag && String(reported.idTag) === String(active.idTag)
    )
    const monotonicLiveRecovery =
      ["OCPP_STALE_TRANSACTION_RECOVERY", "OCPP_VERIFIED_REMOTE_START_RECOVERY"].includes(active.reason) &&
      chargingSignal &&
      Number.isFinite(meterValueWh) &&
      meterValueWh >= activeLatestMeter &&
      (reportedUserMatchesActive || immutableVerifiedRecovery)
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
    reported.offlineSince &&
    reported.stopTime &&
    Date.now() - new Date(reported.stopTime).getTime() <= NETWORK_SESSION_RESUME_WINDOW_MS &&
    chargingSignal &&
    Number.isFinite(meterValueWh) &&
    meterValueWh >= (Number(reported.stopMeterValue) || Number(reported.startMeterValue) || 0)
  ) {
    const remoteStartIntent = await findVerifiedRemoteStartIntent({
      chargePointId,
      connectorId,
      meterTimestamp,
      // Any newer accepted RemoteStart for a different user makes resuming the
      // old network-disconnected record ambiguous, even before a safe new
      // Charging transition is proven.
      requireChargingConfirmation: false,
      maxAgeMs: NETWORK_SESSION_RESUME_WINDOW_MS,
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

  const remoteStartIntent = await findVerifiedRemoteStartIntent({
    chargePointId,
    connectorId,
    meterTimestamp,
    requireChargingConfirmation: true,
    maxAgeMs: REMOTE_START_RECOVERY_WINDOW_MS,
  })
  if (remoteStartIntent?.blocked) {
    if (!chargingSignal) {
      logger.warn(
        `Ignoring delayed MeterValues ${reportedTransactionId || "(none)"} from ` +
          `${chargePointId}:${connectorId}: sample predates RemoteStart for ${remoteStartIntent.idTag}`
      )
      return { transaction: null, reportedTransactionId, recovered: false }
    }
    logger.warn(
      `Using server receipt order for ${chargePointId}:${connectorId}: charger clock predates ` +
        `verified RemoteStart ${remoteStartIntent.messageId}, but live power and the safe ` +
        `connector transition confirm the current session`
    )
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
    if (!chargingSignal) {
      logger.warn(
        `Ignoring stale MeterValues ${reportedTransactionId} from ${chargePointId}:` +
          `${connectorId}: meter timestamp predates the completed transaction stop`
      )
      return { transaction: null, reportedTransactionId, recovered: false }
    }
  }

  // A completed transaction ID is never sufficient evidence of the current
  // driver's identity. Only a charger-accepted RemoteStart for this exact
  // connector may own a recovered session; otherwise retain telemetry solely
  // for audit and do not bill it.
  const continuationTag = getVerifiedRemoteStartOwner(
    remoteStartIntent?.blocked && chargingSignal
      ? { ...remoteStartIntent, blocked: false }
      : remoteStartIntent,
    connectorId
  )
  if (!continuationTag) {
    logger.error(
      `Quarantining orphan MeterValues ${reportedTransactionId} on ${chargePointId}:${connectorId}: ` +
        `no accepted, connector-matched RemoteStart ownership proof`
    )
    return { transaction: null, reportedTransactionId, recovered: false, quarantined: true }
  }
  const supersededUser = continuationTag !== String(reported.idTag)
  if (supersededUser) {
    logger.warn(
      `Correlating stale MeterValues ${reportedTransactionId} on ${chargePointId}:${connectorId} ` +
        `to newer RemoteStart user ${remoteStartIntent.idTag} instead of completed user ${reported.idTag}`
    )
  }
  const startTime = remoteStartIntent.acceptedAt || remoteStartIntent.createdAt || new Date()
  const previousFinalMeter = Math.max(
    Number(reported.stopMeterValue) || 0,
    Number(reported.startMeterValue) || 0
  )
  // Chargers in this fleet use both session-reset and cumulative registers.
  // If the new reading is above the previous final register, continue from
  // that exact baseline; otherwise the register reset and the safe baseline is
  // zero. Starting at the first recovered reading would silently discard the
  // energy delivered before that frame reached the CMS.
  const recoveryStartMeter = await determineRecoveryStartMeter({
    chargePointId,
    connectorId,
    reportedTransactionId,
    remoteStartIntent,
    previousFinalMeter,
    currentMeterValueWh: meterValueWh,
  })
  const recoveryTransactionId = await nextRecoveryTransactionId()
  const recoveryPricing = await getChargingPricing({
    chargePointId,
    idTag: continuationTag,
  })
  const continuation = await Transaction.create({
    transactionId: recoveryTransactionId,
    chargePointId,
    connectorId,
    idTag: continuationTag,
    startTime,
    startMeterValue: recoveryStartMeter,
    energyDelivered: Math.max(0, meterValueWh - recoveryStartMeter),
    amount: 0,
    status: "InProgress",
    reason: "OCPP_VERIFIED_REMOTE_START_RECOVERY",
    sellingPricePerWh: recoveryPricing.pricePerWh,
    minimumChargeAmount: recoveryPricing.minimumCharge,
    ocppTransactionId: reportedTransactionId || null,
    remoteStartMessageId: remoteStartIntent.messageId,
    ownershipSource: "verified_remote_start_recovery",
    ownershipVerifiedAt: remoteStartIntent.acceptedAt || remoteStartIntent.createdAt,
    lastMeterValueWh: meterValueWh,
    lastMeterTimestamp:
      readingTime && !Number.isNaN(readingTime.getTime()) ? readingTime : null,
    lastMeterReceivedAt: new Date(),
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
      `new continuation tx ${continuation.transactionId} at ${meterValueWh} Wh ` +
      `(baseline ${recoveryStartMeter} Wh)`
  )
  return { transaction: continuation, reportedTransactionId, recovered: true }
}

async function resolveMeterValuesTransaction(args) {
  const key = `${args.chargePointId}:${args.connectorId}`
  const previous = meterResolutionLocks.get(key) || Promise.resolve()
  const current = previous
    .catch(() => {})
    .then(() => resolveMeterValuesTransactionUnlocked(args))
  meterResolutionLocks.set(key, current)

  try {
    return await current
  } finally {
    if (meterResolutionLocks.get(key) === current) meterResolutionLocks.delete(key)
  }
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
function registerPendingRemoteStart(chargePointId, idTag, connectorId, messageId = null) {
  const pending = {
    idTag,
    connectorId,
    messageId,
    timestamp: Date.now(),
  }
  pendingRemoteStarts.set(chargePointId, pending)
  logger.info(`Registered pending remote start for ${chargePointId} with tag ${idTag}`)
  // Keep this only as a short-lived hint for diagnostics. Billing ownership is
  // established from the persisted accepted OCPP response, never this map.
  const expiry = setTimeout(() => {
    if (pendingRemoteStarts.get(chargePointId) === pending) {
      pendingRemoteStarts.delete(chargePointId)
      logger.info(`Expired pending remote start for ${chargePointId}`)
    }
  }, REMOTE_START_RECOVERY_WINDOW_MS)
  expiry.unref?.()
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
      return withStationSessionLock(chargePointId, () =>
        handleStatusNotification(chargePointId, uniqueId, payload)
      )
    case "Authorize":
      return handleAuthorize(chargePointId, uniqueId, payload)
    case "StartTransaction":
      return withStationSessionLock(chargePointId, () =>
        handleStartTransaction(chargePointId, uniqueId, payload)
      )
    case "StopTransaction":
      return withStationSessionLock(chargePointId, () =>
        handleStopTransaction(chargePointId, uniqueId, payload)
      )
    case "MeterValues":
      return withStationSessionLock(chargePointId, () =>
        handleMeterValues(chargePointId, uniqueId, payload)
      )
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
    const parsedConnectorId = Number(payload.connectorId)
    if (!Number.isSafeInteger(parsedConnectorId) || parsedConnectorId <= 0) {
      logger.error(
        `Rejected StartTransaction ${uniqueId} from ${chargePointId}: invalid connectorId ${payload.connectorId}`
      )
      return [3, uniqueId, { transactionId: 0, idTagInfo: { status: "Invalid" } }]
    }
    const parsedStartTime = payload.timestamp ? new Date(payload.timestamp) : new Date()
    const normalizedPayload = {
      connectorId: parsedConnectorId,
      idTag: payload.idTag,
      timestamp: Number.isNaN(parsedStartTime.getTime())
        ? new Date().toISOString()
        : parsedStartTime.toISOString(),
      meterStart: Number.isFinite(Number(payload.meterStart))
        ? Number(payload.meterStart)
        : 0,
      reservationId: payload.reservationId,
    }
    clearTerminalRecovery(chargePointId, normalizedPayload.connectorId)

    const stationTag = normalizedPayload.idTag
    const stationTagAuth = await tagAuthService.isAuthorized(stationTag)
    const verifiedStartIntent = await findVerifiedRemoteStartIntent({
      chargePointId,
      connectorId: normalizedPayload.connectorId,
      requireChargingConfirmation: false,
      // A genuine StartTransaction normally follows RemoteStart immediately.
      // A wider window could capture an unrelated local RFID start.
      maxAgeMs: 2 * 60 * 1000,
    })
    const verifiedRemoteOwner = getVerifiedRemoteStartOwner(
      verifiedStartIntent,
      normalizedPayload.connectorId,
      { requireChargingConfirmation: false }
    )

    if (
      verifiedRemoteOwner &&
      stationTagAuth.status === "Accepted" &&
      String(stationTag) !== verifiedRemoteOwner
    ) {
      // Both identities are valid, so choosing either one would risk charging
      // the wrong driver. Reject and let subsequent verified telemetry enter
      // the conservative recovery path instead of guessing ownership.
      logger.error(
        `Rejected ambiguous StartTransaction on ${chargePointId}:${normalizedPayload.connectorId}: ` +
          `station tag ${stationTag} conflicts with accepted RemoteStart owner ${verifiedRemoteOwner}`
      )
      return [3, uniqueId, { transactionId: 0, idTagInfo: { status: "Invalid" } }]
    }

    if (verifiedRemoteOwner && stationTagAuth.status !== "Accepted") {
      logger.warn(
        `Replacing unauthorised station tag ${stationTag} with verified RemoteStart owner ` +
          `${verifiedRemoteOwner} on ${chargePointId}:${normalizedPayload.connectorId}`
      )
      normalizedPayload.idTag = verifiedRemoteOwner
    }

    // Authorize the final, immutable owner. An in-memory pending request is
    // deliberately not enough: the station must have persisted an Accepted
    // RemoteStart response before its tag can replace the reported tag.
    const authResult = normalizedPayload.idTag === stationTag
      ? stationTagAuth
      : await tagAuthService.isAuthorized(normalizedPayload.idTag)

    if (authResult.status !== "Accepted") {
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

    if (verifiedRemoteOwner) pendingRemoteStarts.delete(chargePointId)

    // Replay the original confirmation across socket reconnects when the
    // station retries the exact same StartTransaction request. Connection IDs
    // intentionally differ after reconnect, so protocol audit evidence plus
    // the immutable payload fingerprint prevents a duplicate billable row.
    const priorStartEvidence = await findStartTransactionEvidence({
      chargePointId,
      messageId: uniqueId,
      receivedBefore: new Date(),
    })
    const requestedDeviceTime = new Date(normalizedPayload.timestamp)
    const sameDeviceTime = Boolean(
      priorStartEvidence?.deviceTimestamp &&
      !Number.isNaN(requestedDeviceTime.getTime()) &&
      priorStartEvidence.deviceTimestamp.getTime() === requestedDeviceTime.getTime()
    )
    if (
      priorStartEvidence &&
      Number(priorStartEvidence.connectorId) === Number(normalizedPayload.connectorId) &&
      String(priorStartEvidence.idTag) === String(normalizedPayload.idTag) &&
      Math.abs(Number(priorStartEvidence.meterStart) - normalizedPayload.meterStart) <= 1 &&
      sameDeviceTime
    ) {
      const original = await Transaction.findOne({
        where: {
          chargePointId,
          transactionId: priorStartEvidence.ocppTransactionId,
          connectorId: normalizedPayload.connectorId,
          idTag: normalizedPayload.idTag,
        },
      })
      if (original) {
        await bindOcppIdentity(original, {
          ocppTransactionId: priorStartEvidence.ocppTransactionId,
          startMessageId: priorStartEvidence.messageId,
          ownershipSource: "start_transaction_audit_replay",
          ownershipVerifiedAt: priorStartEvidence.receivedAt,
        })
        logger.warn(
          `Replayed durable StartTransaction confirmation ${original.transactionId} for ` +
            `${chargePointId}:${normalizedPayload.connectorId} after reconnect`
        )
        return [3, uniqueId, {
          transactionId: original.transactionId,
          idTagInfo: { status: "Accepted", parentIdTag: authResult.parentId },
        }]
      }
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
        await bindOcppIdentity(existing, {
          ocppTransactionId: existing.transactionId,
          startMessageId: uniqueId,
          remoteStartMessageId: verifiedStartIntent?.messageId,
          ownershipSource: verifiedRemoteOwner
            ? "start_transaction_remote_verified"
            : "start_transaction",
          ownershipVerifiedAt: new Date(),
        })
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

    // A physical connector cannot safely own two billable sessions. Do not
    // silently close or transfer an older user's row when a different Start
    // arrives; rejecting forces the charge point to stop instead of allowing
    // energy to be assigned to an ambiguous owner.
    const conflictingActive = await Transaction.findOne({
      where: {
        chargePointId,
        connectorId: normalizedPayload.connectorId,
        status: "InProgress",
      },
      order: [["startTime", "DESC"]],
    })
    if (conflictingActive) {
      logger.error(
        `Rejected StartTransaction ${uniqueId} on ${chargePointId}:${normalizedPayload.connectorId}: ` +
          `active transaction ${conflictingActive.transactionId} is already owned by ${conflictingActive.idTag}`
      )
      return [3, uniqueId, { transactionId: 0, idTagInfo: { status: "ConcurrentTx" } }]
    }

    // Generate a transaction ID if not provided
    if (!payload.transactionId) {
      normalizedPayload.transactionId = await nextRecoveryTransactionId()
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

    // Freeze the effective tariff when ownership is established. A later
    // tariff edit must not change the cost of an already-running session.
    const sessionPricing = await getChargingPricing({
      chargePointId,
      idTag: normalizedPayload.idTag,
    })

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
      sellingPricePerWh: sessionPricing.pricePerWh,
      minimumChargeAmount: sessionPricing.minimumCharge,
      ocppTransactionId: normalizedPayload.transactionId,
      ocppStartMessageId: uniqueId,
      remoteStartMessageId: verifiedStartIntent?.messageId || null,
      ownershipSource: verifiedRemoteOwner
        ? "start_transaction_remote_verified"
        : "start_transaction",
      ownershipVerifiedAt: new Date(),
      lastMeterValueWh: normalizedPayload.meterStart,
      lastMeterTimestamp: new Date(normalizedPayload.timestamp),
      lastMeterReceivedAt: new Date(),
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

    // Once the immutable transaction row exists, acknowledge that exact ID.
    // Returning Invalid after persistence would make the charger and CMS
    // disagree while leaving a phantom InProgress row. Connector/UI side
    // effects can recover from the following status and meter messages.
    if (transaction?.transactionId) {
      return [
        3,
        uniqueId,
        {
          transactionId: transaction.transactionId,
          idTagInfo: { status: "Accepted" },
        },
      ]
    }

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
    const reportedOcppTransactionId = Number(normalizedPayload.transactionId)

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
      transaction = await resolveStopTransactionOwnership({
        chargePointId,
        ocppTransactionId: reportedOcppTransactionId,
        status: "InProgress",
        receivedAt: new Date(),
      })
      if (transaction) {
        normalizedPayload.transactionId = transaction.transactionId
        clearTerminalRecovery(chargePointId, transaction.connectorId)
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
            const completedTx = await resolveStopTransactionOwnership({
              chargePointId,
              ocppTransactionId: reportedOcppTransactionId,
              status: ["Completed", "Stopped"],
              receivedAt: new Date(),
            })
            if (completedTx) {
              normalizedPayload.transactionId = completedTx.transactionId
              normalizedPayload.meterStop = Math.max(
                Number(normalizedPayload.meterStop) || 0,
                Number(completedTx.lastMeterValueWh) || 0,
                Number(completedTx.stopMeterValue) || 0,
                Number(completedTx.startMeterValue) || 0
              )

              const realEnergy = Math.max(
                0,
                normalizedPayload.meterStop - (Number(completedTx.startMeterValue) || 0)
              )
              const pricing = await getSessionPricing(completedTx, { chargePointId })
              const correctedAmount = Math.max(
                realEnergy * pricing.pricePerWh,
                pricing.minimumCharge
              )
              const reconciledRevenue = await calculatePartnerRevenue({
                chargePointId,
                energyWh: realEnergy,
                billableAmount: correctedAmount,
                idTag: completedTx.idTag,
                pricing,
              })
              const reconciliation = await reconcileCompletedBilling(
                completedTx.transactionId,
                {
                  stopMeterValue: normalizedPayload.meterStop,
                  energyDelivered: realEnergy,
                  amount: correctedAmount,
                  stopTime: new Date(normalizedPayload.timestamp),
                  ocppTransactionId:
                    completedTx.ocppTransactionId || reportedOcppTransactionId,
                  ocppStopMessageId: uniqueId,
                  lastMeterValueWh: normalizedPayload.meterStop,
                  lastMeterTimestamp: new Date(normalizedPayload.timestamp),
                  lastMeterReceivedAt: new Date(),
                  ...(!completedTx.settlementId && {
                    grossAmount: reconciledRevenue.grossAmount,
                    sellingPricePerWh: reconciledRevenue.sellingPricePerWh,
                    productionCostPerWh: reconciledRevenue.productionCostPerWh,
                    partnerSharePercent: reconciledRevenue.partnerSharePercent,
                    minimumChargeApplied: reconciledRevenue.minimumChargeApplied,
                    minimumChargeAmount: pricing.minimumCharge,
                    productionCostAmount: reconciledRevenue.productionCostAmount,
                    profitAmount: reconciledRevenue.profitAmount,
                    partnerEarning: reconciledRevenue.partnerEarning,
                    companyEarning: reconciledRevenue.companyEarning,
                    partnerId: reconciledRevenue.partnerId,
                    locationId: reconciledRevenue.locationId,
                    settlementStatus: reconciledRevenue.settlementStatus,
                  }),
                }
              )
              if (!reconciliation.success) {
                logger.error(
                  `Failed atomic reconciliation for tx ${completedTx.transactionId}: ` +
                    reconciliation.message
                )
              } else {
                logger.info(
                  `Atomically reconciled tx ${completedTx.transactionId} to ` +
                    `${realEnergy} Wh / ${correctedAmount.toFixed(2)} NGN`
                )
              }
            }
            if (false && completedTx && !completedTx.billedAt) {
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
            } else if (false && completedTx && completedTx.billedAt) {
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

      if (
        normalizedPayload.idTag &&
        String(normalizedPayload.idTag) !== String(transaction.idTag)
      ) {
        logger.warn(
          `StopTransaction ${reportedOcppTransactionId} on ${chargePointId} reported tag ` +
            `${normalizedPayload.idTag}, but the immutable StartTransaction owner is ${transaction.idTag}; ` +
            `the session owner will not be changed`
        )
      }

      // Cumulative energy registers must not move backwards. A delayed or
      // reset final frame cannot erase energy already accepted for this exact
      // session.
      normalizedPayload.meterStop = Math.max(
        Number(normalizedPayload.meterStop) || 0,
        Number(transaction.lastMeterValueWh) || 0,
        Number(transaction.stopMeterValue) || 0,
        Number(transaction.startMeterValue) || 0
      )

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
        pricing = await getSessionPricing(transaction, { chargePointId })
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

      // Persist the authoritative final meter through the same serializable
      // path that applies any wallet delta. This closes the race where the
      // offline finalizer billed a stale value just before StopTransaction.
      const completion = await reconcileCompletedBilling(transaction.transactionId, {
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
        minimumChargeAmount: minimumCharge,
        productionCostAmount: partnerRevenue.productionCostAmount,
        profitAmount: partnerRevenue.profitAmount,
        partnerEarning: partnerRevenue.partnerEarning,
        companyEarning: partnerRevenue.companyEarning,
        partnerId: partnerRevenue.partnerId,
        locationId: partnerRevenue.locationId,
        settlementStatus: partnerRevenue.settlementStatus,
        ocppTransactionId: transaction.ocppTransactionId || reportedOcppTransactionId,
        ocppStopMessageId: uniqueId,
        lastMeterValueWh: normalizedPayload.meterStop,
        lastMeterTimestamp: new Date(normalizedPayload.timestamp),
        lastMeterReceivedAt: new Date(),
        ...batteryUpdate
      })

      if (!completion.success) {
        throw new Error(
          `Could not atomically finalize transaction ${transaction.transactionId}: ${completion.message}`
        )
      }

      logger.info(
        `Completed transaction ${transaction.transactionId} for ${chargePointId} with energy delivered ${energyDelivered} Wh and amount ${transactionAmount}`
      )

      // ═══ WALLET DEDUCTION (atomic, idempotent, crash-safe) ═══
      try {
        if (completion.billingPending) {
          logger.warn(
            `Transaction ${normalizedPayload.transactionId} was finalized; wallet billing is queued: ` +
              completion.billing?.message
          )
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

      // Reset only this connector. A multi-connector station must remain
      // Charging when another independently owned transaction is active.
      await updateConnectorStatus(chargePointId, transaction.connectorId, "Available", null)
      const remainingActiveTransaction = await Transaction.findOne({
        where: { chargePointId, status: "InProgress" },
        order: [["startTime", "DESC"]],
        attributes: ["transactionId"],
      })
      await ChargingStation.update(
        remainingActiveTransaction
          ? {
              status: "Charging",
              currentTransaction: remainingActiveTransaction.transactionId,
            }
          : { status: "Available", currentTransaction: null },
        { where: { chargePointId } }
      )
      logger.info(
        `Completed connector ${transaction.connectorId} on ${chargePointId}; station is ` +
          `${remainingActiveTransaction ? "still Charging" : "Available"}`
      )

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

        }, 1500) // 1.5 second delay for UI transition
      }
    } catch (dbError) {
      logger.error(
        `Database error during StopTransaction from ${chargePointId}:`,
        dbError
      )
      throw dbError
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
    // Do not cache a successful confirmation when completion/billing state
    // could not be persisted. The server records this request as Failed and
    // the charge point can retry the same StopTransaction idempotently.
    throw error
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
    const parsedConnectorId = Number(payload.connectorId)
    const connectorId = Number.isSafeInteger(parsedConnectorId) && parsedConnectorId >= 0
      ? parsedConnectorId
      : 1
    const reportedTransactionId = payload.transactionId || null
    let transactionId = reportedTransactionId
    const meterValues = payload.meterValue || []
    let internalTransactionId = null

    if (meterValues.length > 0) {
      const energyEvidence = meterValues
        .map(meterValue => ({
          valueWh: parseMeterValueWh(meterValue?.sampledValue || []),
          timestamp: meterValue?.timestamp,
        }))
        .filter(sample => Number.isFinite(sample.valueWh))
        .sort((left, right) => right.valueWh - left.valueWh)[0] || null
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
        meterValueWh: energyEvidence?.valueWh ?? null,
        meterTimestamp: energyEvidence?.timestamp || meterValues[0]?.timestamp,
        chargingSignal
      })
      if (resolution.transaction) {
        let resolvedTransaction = resolution.transaction
        if (
          resolution.recovered &&
          ["Completed", "Stopped"].includes(resolvedTransaction.status) &&
          resolvedTransaction.reason === "NetworkDisconnected"
        ) {
          const reopened = await reopenNetworkDisconnectedTransaction(
            resolvedTransaction.transactionId
          )
          if (!reopened.success) {
            logger.error(
              `Quarantining resumed MeterValues for tx ${resolvedTransaction.transactionId}: ` +
                reopened.message
            )
            resolvedTransaction = null
          } else {
            resolvedTransaction = reopened.transaction
            await updateConnectorStatus(
              chargePointId,
              connectorId,
              "Charging",
              resolvedTransaction.transactionId
            )
            await ChargingStation.update(
              {
                status: "Charging",
                currentTransaction: resolvedTransaction.transactionId,
              },
              { where: { chargePointId } }
            )
            logger.warn(
              `Safely reopened network-disconnected transaction ` +
                `${resolvedTransaction.transactionId} on ${chargePointId}:${connectorId}`
            )
          }
        }

        if (resolvedTransaction) {
          transactionId = resolvedTransaction.transactionId
          internalTransactionId = resolvedTransaction.id
          clearTerminalRecovery(chargePointId, connectorId)
        }
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
                connectorId,
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
              !sampledValue.phase &&
              (
                sampledValue.measurand === "Energy.Active.Import.Register" ||
                !sampledValue.measurand
              )
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

                    if (!transaction) {
                      // Keep the raw OCPP sample for audit, but never reopen a
                      // billed row inside this non-transactional loop. Normal
                      // reconnects remain active throughout the offline
                      // reconciliation window; their eventual StopTransaction
                      // supplies the authoritative final meter.
                      logger.warn(
                        `Ignoring billing update for completed transaction ${transactionId} ` +
                          `on ${chargePointId}; raw meter history was preserved`
                      )
                      continue
                    }

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
                      const highestAcceptedMeter = Math.max(
                        Number(transaction.startMeterValue) || 0,
                        Number(transaction.lastMeterValueWh) || 0,
                        Number(transaction.stopMeterValue) || 0
                      )
                      if (meterValueWh < highestAcceptedMeter) {
                        logger.warn(
                          `Ignored out-of-order meter for tx ${transactionId}: ` +
                            `${meterValueWh} Wh < accepted ${highestAcceptedMeter} Wh`
                        )
                        continue
                      }

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
                        pricing = await getSessionPricing(transaction, { chargePointId })
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
                        lastMeterValueWh: meterValueWh,
                        lastMeterTimestamp: timestamp ? new Date(timestamp) : null,
                        lastMeterReceivedAt: new Date(),
                        ...(reportedTransactionId && !transaction.ocppTransactionId
                          ? { ocppTransactionId: reportedTransactionId }
                          : {}),
                      })

                      // Update connector SoC if battery percentage was reported
                      if (batteryPercentage !== null) {
                        const { Connector } = require("../models")
                        const socConnectorId = transaction.connectorId
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
                            power: Number.isFinite(powerValue) ? powerValue : 0,
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
              const socConnId = connectorId
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
      if (payload.firmwareVersion) {
        await require('../services/firmwareUpdateService')
          .recordBootFirmwareVersion(chargePointId, payload.firmwareVersion, new Date())
          .catch(error => logger.warn(
            `Unable to correlate firmware version from BootNotification for ${chargePointId}: ${error.message}`
          ))
      }
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
        clearTerminalRecovery(chargePointId, connectorId)
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
          // Charger reports Charging but no active transaction. Status alone
          // cannot identify the driver or the charger's transaction, so do not
          // reopen a financial record until MeterValues proves correlation.
          logger.warn(`Station ${chargePointId}:${connectorId} reports Charging but no active transaction — awaiting transaction evidence`)
          
          // Kept null by design: connector table state is operational state,
          // not proof that a particular customer owns the physical session.
          const connector = null
          
          let resumeTx = null
          // StatusNotification has no OCPP transactionId or idTag. Never reopen
          // a financial record from status alone; wait for MeterValues, whose
          // reported transaction ID passes the strict resolver above.
          const statusOnlyResumeAllowed = false
          if (statusOnlyResumeAllowed && connector && connector.transactionId) {
            // Connector has the transaction ID — use it
            resumeTx = await Transaction.findOne({
              where: { transactionId: connector.transactionId }
            })
            logger.info(`Found transaction ID from connector: ${connector.transactionId}`)
          }
          
          // If the timer already completed this same connector's session,
          // resume only a recent network-recovered record. Never reopen the
          // most recent transaction from another connector or user.
          if (statusOnlyResumeAllowed && !resumeTx) {
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
            const verifiedStartIntent = await findVerifiedRemoteStartIntent({
              chargePointId,
              connectorId,
              requireChargingConfirmation: false,
              maxAgeMs: REMOTE_START_RECOVERY_WINDOW_MS,
            })
            const verifiedOwner = getVerifiedRemoteStartOwner(
              verifiedStartIntent,
              connectorId,
              { requireChargingConfirmation: false }
            )

            // OCPP RemoteStopTransaction requires the charger's real
            // transactionId. Never guess with transactionId 0. Quarantine the
            // state until StartTransaction or safely correlated MeterValues
            // provides both an actual transaction and verified driver.
            logger.warn(
              `Station ${chargePointId}:${connectorId} reports Charging without an active transaction; ` +
                (verifiedOwner
                  ? `accepted RemoteStart owner ${verifiedOwner} is awaiting safe telemetry reconciliation`
                  : "ownership is unverified, so telemetry will remain non-billable")
            )
            if (mqttClient) {
              mqttClient.publish(
                `ocpp/${chargePointId}/attention`,
                JSON.stringify({
                  connectorId,
                  reason: verifiedOwner
                    ? "awaiting_transaction_reconciliation"
                    : "unattributed_charging",
                  idTag: verifiedOwner || null,
                  billable: false,
                  timestamp: new Date().toISOString(),
                })
              )
            }
          }
        }
      } else if (status === "Preparing") {
        clearTerminalRecovery(chargePointId, connectorId)
        // Log the preparing status - this is temporary before charging starts
        logger.info(
          `Station ${chargePointId} connector ${connectorId} is preparing to charge`
        )

      }

      // If charger reports Finishing but no active transaction, force Available (user hasn't unplugged but session is done)
      if (status === "Finishing") {
        const activeTx = await Transaction.findOne({
          where: { chargePointId, connectorId, status: "InProgress" }
        });
        if (!activeTx) {
          logger.info(`Station ${chargePointId}:${connectorId} reports Finishing but no active transaction — forcing Available`);
          // Preserve the charger's terminal state; a later Available or
          // StopTransaction message will advance it naturally.
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
      if (status === "Available" || status === "Finishing") {
        scheduleTerminalRecovery(chargePointId, connectorId, status)
      } else if (status === "SuspendedEV" || status === "SuspendedEVSE") {
        clearTerminalRecovery(chargePointId, connectorId)
      }

      // Retained only as historical context. Immediate completion raced the
      // real StopTransaction and incorrectly treated SuspendedEV as terminal.
      if (false && (status === "Available" || status === "Finishing" || status === "SuspendedEV")) {
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

    await require('../services/firmwareUpdateService')
      .recordFirmwareStatus(chargePointId, status, new Date())
      .catch(error => logger.warn(
        `Unable to persist firmware status ${status} for ${chargePointId}: ${error.message}`
      ))

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
  _test: {
    parseMeterValueWh,
    resolveMeterValuesTransaction,
    resolveMeterValuesTransactionUnlocked,
  },
}
