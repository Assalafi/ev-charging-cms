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
    const hasConnectionId = !(
        connectionId === null ||
        connectionId === undefined ||
        connectionId === ''
    );
    const alternatives = [
        { dedupeKey: buildInboundDedupeKey(chargePointId, action, uniqueId, connectionId) }
    ];

    // Keys written by older releases have no connection generation. They are
    // useful only when the current socket also has no connection ID. Including
    // them for a known connection would cause a charger that restarts its OCPP
    // message counter to have valid MeterValues silently replayed/skipped.
    if (!hasConnectionId) {
        alternatives.push(
            { dedupeKey: buildInboundDedupeKey(chargePointId, action, uniqueId) },
            {
                dedupeKey: buildLegacyInboundDedupeKey(chargePointId, uniqueId),
                message_type: action
            }
        );
    }

    return {
        direction: 'Inbound',
        [Op.or]: alternatives
    };
}

module.exports = {
    buildInboundDedupeKey,
    buildLegacyInboundDedupeKey,
    buildInboundDedupeWhere
};
