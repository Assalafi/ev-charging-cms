// Updated messageHandlers.js with OCPP 1.6 compliant authorization
const logger = require("../utils/logger")
const { Transaction, ChargingStation, sequelize } = require("../models")
const mqttClient = require("../mqtt/client")
const tagAuthService = require("../services/tagAuthorization")
const chargingSessionTracker = require("../services/chargingSessionTracker")
const { validatePricingSettings } = require("../utils/pricingValidator")

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
      return handleReset(chargePointId, uniqueId, payload)
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

    // Return OCPP 1.6 compliant response
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: authResult.status,
          expiryDate: authResult.expiryDate,
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
async function handleStartTransaction(chargePointId, uniqueId, payload) {
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

      return [
        3,
        uniqueId,
        {
          transactionId: 0,
          idTagInfo: {
            status: authResult.status,
            expiryDate: authResult.expiryDate,
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
              const meterValuePayload = JSON.parse(recentMeterValue.payload)
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

                  if (energyValue && energyValue.value) {
                    normalizedPayload.meterStart = parseFloat(energyValue.value)
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

      // Return OCPP 1.6 compliant response
      return [
        3,
        uniqueId,
        {
          transactionId: normalizedPayload.transactionId,
          idTagInfo: {
            status: "Accepted",
            expiryDate: authResult.expiryDate,
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
          status: "InProgress",
        },
      })

      if (!transaction) {
        logger.warn(
          `Transaction ${normalizedPayload.transactionId} not found or not in progress for ${chargePointId}`
        )

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

      // Calculate the transaction amount based on current pricing settings
      let transactionAmount = 0
      try {
        // Use the global pricing validator
        const { isValid, settings, error } = await validatePricingSettings(`StopTransaction:${transaction.transactionId}`)
        
        if (!isValid) {
          throw new Error(`Pricing validation failed: ${error}`)
        }
        
        // Always convert from Wh to kWh (energyDelivered from OCPP is always in Wh)
        const energyInKwh = energyDelivered / 1000
        logger.debug(`StopTransaction ENERGY CHECK: Original value=${energyDelivered} Wh, converted to=${energyInKwh} kWh`)
        
        // Access the validated and parsed settings directly
        let ratePerKwh = settings.baseRatePerKwh;

        // Add detailed debug logging for troubleshooting
        logger.debug(`StopTransaction DETAILED PRICING: ` +
                    `DB baseRatePerKwh=${settings.baseRatePerKwh}, ` +
                    `minimumCharge=${settings.minimumCharge}, ` +
                    `memberDiscount=${settings.memberDiscount}`);
        
        // Log raw values before calculation
        logger.debug(`StopTransaction RAW VALUES: ` +
                    `energyDelivered=${energyDelivered} Wh, ` +
                    `energyInKwh=${energyInKwh} kWh, ` +
                    `ratePerKwh=${ratePerKwh} Naira/kWh`);
        
        // Calculate raw amount
        let rawAmount = energyInKwh * ratePerKwh
        
        // Log calculation
        logger.debug(`StopTransaction CALCULATION: ${energyInKwh} kWh * ${ratePerKwh} Naira/kWh = ${rawAmount} Naira`);
        
        // Record whether minimum charge is being applied
        const isUsingMinimumCharge = rawAmount < settings.minimumCharge
        let amount = isUsingMinimumCharge ? settings.minimumCharge : rawAmount
        
        // Apply member discount if applicable
        const isMember = transaction.idTag && transaction.idTag.includes("MEMBER")
        if (isMember) {
          amount = amount * (1 - settings.memberDiscount / 100)
        }
        
        transactionAmount = amount
        logger.info(
          `Calculated transaction amount: ${transactionAmount} for transaction ${transaction.transactionId} (${energyInKwh} kWh, raw: ${rawAmount.toFixed(2)} Naira, min charge: ${settings.minimumCharge} Naira${isUsingMinimumCharge ? ' - APPLIED' : ''}, member discount: ${isMember ? settings.memberDiscount + '%' : 'none'})`
        )
      } catch (priceError) {
        logger.error(`Error calculating transaction amount:`, priceError)
        // Do not proceed with transaction completion if we can't calculate the price from database settings
        throw new Error(`Cannot complete transaction: ${priceError.message}`)
      }

      // First update the connector status to "Finishing" to indicate transition
      await updateConnectorStatus(
        chargePointId,
        transaction.connectorId,
        "Finishing",
        null
      )

      // Update the transaction
      await transaction.update({
        status: "Completed",
        stopTime: new Date(normalizedPayload.timestamp),
        stopMeterValue: normalizedPayload.meterStop,
        energyDelivered: energyDelivered,
        amount: transactionAmount,
        stoppedBy: normalizedPayload.idTag || transaction.idTag,
        stopReason: normalizedPayload.reason,
      })

      logger.info(
        `Completed transaction ${transaction.transactionId} for ${chargePointId} with energy delivered ${energyDelivered} Wh and amount ${transactionAmount}`
      )

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

    if (idTag) {
      try {
        authResult = await tagAuthService.isAuthorized(idTag)
      } catch (authError) {
        logger.error(
          `Error checking authorization during StopTransaction:`,
          authError
        )
        // Use default Accepted status
      }
    }

    // Return OCPP 1.6 compliant response
    return [
      3,
      uniqueId,
      {
        idTagInfo: {
          status: authResult.status,
          expiryDate: authResult.expiryDate,
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
    const connectorId = payload.connectorId
    const transactionId = payload.transactionId
    const meterValues = payload.meterValue || []

    if (meterValues.length === 0) {
      logger.warn(
        `Empty meterValue array in MeterValues request from ${chargePointId}`
      )
    } else {
      // Process meter values
      if (transactionId && chargingSessionTracker) {
        logger.info(`Processing meter values for transaction ${transactionId}`)
        chargingSessionTracker.updateMeterValue(transactionId, meterValues)
      }

      // Store meter values in database
      try {
        for (const meterValue of meterValues) {
          // Each meterValue has a timestamp and sampledValue array
          const timestamp = meterValue.timestamp
          const sampledValues = meterValue.sampledValue || []

          for (const sampledValue of sampledValues) {
            // Extract energy values
            if (
              sampledValue.measurand === "Energy.Active.Import.Register" ||
              !sampledValue.measurand
            ) {
              const energyValue = parseFloat(sampledValue.value)
              const unit = sampledValue.unit || "Wh"

              if (!isNaN(energyValue)) {
                // Update connector's meter value
                try {
                  await sequelize.query(
                    `UPDATE connectors 
                                         SET "meterValue" = $1, "lastUpdated" = NOW() 
                                         WHERE "chargePointId" = $2 AND "connectorId" = $3`,
                    {
                      bind: [energyValue, chargePointId, connectorId],
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
                if (transactionId) {
                  try {
                    const transaction = await Transaction.findOne({
                      where: {
                        transactionId,
                        status: "InProgress",
                      },
                    })

                    if (transaction) {
                      const energyDelivered = Math.max(
                        0,
                        energyValue - transaction.startMeterValue
                      )

                      // Calculate real-time price based on energy delivered
                      let currentPrice = 0
                      let amount = 0 // Final amount to be paid including minimum charge and discounts
                      try {
                        // Use the global pricing validator
                        const { isValid, settings, error } = await validatePricingSettings(`MeterValues:${transactionId}`)
                        
                        if (!isValid) {
                          throw new Error(`Pricing validation failed: ${error}`);
                        }
                        
                        // Access the validated and parsed settings
                        let ratePerKwh = settings.baseRatePerKwh;

                        // Add comprehensive debug logging
                        logger.debug(`MeterValues DETAILED PRICING: DB baseRatePerKwh=${settings.baseRatePerKwh}, ` + 
                                    `minimumCharge=${settings.minimumCharge}, ` +
                                    `memberDiscount=${settings.memberDiscount}`);

                        // More robust energy unit conversion
                        // Check if value is already in kWh range or explicitly in kWh unit
                        const isAlreadyInKwh = unit === "kWh" || (energyDelivered < 100);
                        const energyInKwh = isAlreadyInKwh ? energyDelivered : (energyDelivered / 1000)
                        
                        logger.debug(`MeterValues ENERGY CHECK: Original value=${energyDelivered}, unit=${unit}, interpreted as=${energyInKwh} kWh`)
                        
                        // Log raw numbers before calculation
                        logger.debug(`MeterValues RAW VALUES: energyDelivered=${energyDelivered}, ` +
                                    `unit=${unit}, energyInKwh=${energyInKwh}, ` +
                                    `ratePerKwh=${ratePerKwh}`);

                        // Calculate price (values are already in Naira)
                        currentPrice = energyInKwh * ratePerKwh
                        
                        // Log calculation
                        logger.debug(`MeterValues CALCULATION: ${energyInKwh} kWh * ${ratePerKwh} Naira/kWh = ${currentPrice} Naira`);
                        
                        // For ongoing transactions, don't apply minimum charge yet
                        // This will show the actual accumulating price during charging
                        amount = currentPrice
                        
                        // Check if the user is a member to apply discount
                        const isMember = transaction.idTag && transaction.idTag.includes("MEMBER")
                        if (isMember && settings.memberDiscount) {
                          amount = amount * (1 - settings.memberDiscount / 100)
                        }
                        
                        logger.debug(
                          `Calculated current amount for transaction ${transactionId}: ${amount} (${energyInKwh} kWh at ${ratePerKwh} Naira/kWh, member discount: ${isMember ? settings.memberDiscount + '%' : 'none'})`
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
                        currentMeterValue: energyValue,
                        energyDelivered: energyDelivered,
                        currentPrice: currentPrice, // Raw calculated price
                        amount: amount // Store the final amount (with minimum charge and discounts)
                      })

                      // Publish energy update to MQTT
                      if (mqttClient) {
                        // Important: Use the directly calculated values rather than
                        // fetching from transaction model which might have old values
                        const mqttPrice = currentPrice || 0;
                        const mqttAmount = amount || 0;
                        
                        // The frontend needs the raw values without modification
                        logger.debug(`MQTT PUBLISH VALUES (original): price=${mqttPrice}, amount=${mqttAmount}, energy=${energyDelivered}`);
                        
                        // DEBUG: Check if the price is unusually small - this helps identify scaling issues
                        if (mqttPrice > 0 && mqttPrice < 10) {
                          logger.warn(`WARNING: Price ${mqttPrice} for ${energyInKwh} kWh seems unusually low! Expected ~${energyInKwh * 200}`);
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
                          })
                        )

                        // Also publish to station-specific topic for StationDetail component
                        mqttClient.publish(
                          `ocpp/stations/${chargePointId}/energy`,
                          JSON.stringify({
                            timestamp,
                            energy: energyDelivered, // This is what frontend expects
                            power: Math.round(Math.random() * 7000) + 3000, // Simulate power value
                            // Don't convert the price and amount fields - send raw calculated values
                            price: mqttPrice,
                            amount: mqttAmount,
                            chargePointId,
                            transactionId,
                            connectorId,
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
      chargePointVendor: payload.chargePointVendor,
      chargePointModel: payload.chargePointModel,
      chargePointSerialNumber: payload.chargePointSerialNumber,
      firmwareVersion: payload.firmwareVersion,
      iccid: payload.iccid,
      imsi: payload.imsi,
      meterType: payload.meterType,
      meterSerialNumber: payload.meterSerialNumber,
    }

    try {
      // Update or insert charging station record
      await sequelize.query(
        `INSERT INTO charging_stations 
                ("chargePointId", "chargePointVendor", "chargePointModel", "lastBootTime", "status") 
                VALUES ($1, $2, $3, NOW(), 'Accepted')
                ON CONFLICT ("chargePointId") 
                DO UPDATE SET 
                "chargePointVendor" = $2, 
                "chargePointModel" = $3, 
                "lastBootTime" = NOW(),
                "status" = 'Accepted'`,
        {
          bind: [
            chargePointId,
            payload.chargePointVendor || "Unknown",
            payload.chargePointModel || "Unknown",
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
        interval: 300, // Heartbeat interval in seconds
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
    const { connectorId, status, errorCode } = payload

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
          logger.info(
            `Station ${chargePointId} connector ${connectorId} started charging transaction ${transaction.id}`
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
              transaction.id,
              [],
              transaction.startMeterValue
            )
          }

          // Make sure transaction is marked as InProgress
          await transaction.update({ status: "InProgress" })

          // Publish comprehensive status update including transaction info
          if (mqttClient) {
            mqttClient.publish(
              `ocpp/${chargePointId}/status`,
              JSON.stringify({
                connectorId,
                status: "Charging",
                transactionId: transaction.id,
                meterStart: transaction.startMeterValue,
                energy: transaction.energyDelivered || 0,
                power: 0, // Initial power until meter values arrive
                timestamp: new Date().toISOString(),
              })
            )
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

      // Update connector status in database
      await updateConnectorStatus(chargePointId, connectorId, status)

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
}
