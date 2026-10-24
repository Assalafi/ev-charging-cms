const {
    buildInboundDedupeKey,
    buildLegacyInboundDedupeKey,
    buildInboundDedupeWhere
} = require('../inboundDedupe');

describe('OCPP inbound request deduplication', () => {
    test('includes the action so reused charger IDs cannot collide', () => {
        expect(buildInboundDedupeKey('CP-1', 'Heartbeat', '96'))
            .not.toBe(buildInboundDedupeKey('CP-1', 'MeterValues', '96'));

        expect(buildInboundDedupeKey('CP-1', 'MeterValues', '96'))
            .toBe('inbound:CP-1:MeterValues:96');
    });

    test('retains the legacy key format for safe history lookup', () => {
        expect(buildLegacyInboundDedupeKey('CP-1', '96'))
            .toBe('inbound:CP-1:96');
    });

    test('only treats a legacy row as a retry when its action matches', () => {
        const where = buildInboundDedupeWhere('CP-1', 'MeterValues', '96');
        const branches = where[require('sequelize').Op.or];

        expect(where.direction).toBe('Inbound');
        expect(branches).toEqual(expect.arrayContaining([
            { dedupeKey: 'inbound:CP-1:MeterValues:96' },
            { dedupeKey: 'inbound:CP-1:96', message_type: 'MeterValues' }
        ]));
        expect(branches).not.toContainEqual({ dedupeKey: 'inbound:CP-1:96', message_type: 'Heartbeat' });
    });

    test('does not match pre-connection history when a socket connection ID is known', () => {
        const where = buildInboundDedupeWhere('CP-1', 'MeterValues', '96', 'socket-b');
        const branches = where[require('sequelize').Op.or];

        expect(branches).toEqual([
            { dedupeKey: 'inbound:CP-1:MeterValues:96:socket-b' }
        ]);
        expect(branches).not.toContainEqual({ dedupeKey: 'inbound:CP-1:MeterValues:96' });
        expect(branches).not.toContainEqual({
            dedupeKey: 'inbound:CP-1:96',
            message_type: 'MeterValues'
        });
    });
});
