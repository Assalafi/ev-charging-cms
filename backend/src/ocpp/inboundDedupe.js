const { Op } = require('sequelize');

/**
 * Build the idempotency key for an inbound OCPP request.
 *
 * OCPP unique IDs are scoped to a connection and are commonly reused by
 * chargers for different actions (for example, Heartbeat and MeterValues).
 * The action must therefore be part of the key.
 */
function buildInboundDedupeKey(chargePointId, action, uniqueId, connectionId = null) {
    const connectionPart = connectionId === null || connectionId === undefined || connectionId === ''
        ? ''
        : `:${String(connectionId)}`;
    return `inbound:${String(chargePointId)}:${String(action)}:${String(uniqueId)}${connectionPart}`;
}

/**
 * Key format used before action-aware deduplication was introduced.
 * Keeping this available lets us safely read existing history during the
 * transition without treating a Heartbeat as a MeterValues retry.
 */
function buildLegacyInboundDedupeKey(chargePointId, uniqueId) {
    return `inbound:${String(chargePointId)}:${String(uniqueId)}`;
}

/**
 * Find a previously processed inbound request while remaining compatible with
 * legacy rows. A legacy key is only eligible when its stored OCPP action also
 * matches the current action.
 */
function buildInboundDedupeWhere(chargePointId, action, uniqueId, connectionId = null) {
    return {
        direction: 'Inbound',
        [Op.or]: [
            { dedupeKey: buildInboundDedupeKey(chargePointId, action, uniqueId, connectionId) },
            // Older rows were written without a connection generation. Only
            // use the legacy action-aware key when no connection ID is known;
            // otherwise a charger reconnect that reuses its OCPP IDs must be
            // processed as a new request.
            ...(connectionId === null || connectionId === undefined || connectionId === ''
                ? [{ dedupeKey: buildInboundDedupeKey(chargePointId, action, uniqueId) }]
                : []),
            {
                dedupeKey: buildLegacyInboundDedupeKey(chargePointId, uniqueId),
                message_type: action
            }
        ]
    };
}

module.exports = {
    buildInboundDedupeKey,
    buildLegacyInboundDedupeKey,
    buildInboundDedupeWhere
};
