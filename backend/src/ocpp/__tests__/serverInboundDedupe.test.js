const { Op } = require('sequelize');

const mockInboundRows = [];
const mockChargingStation = { findOne: jest.fn() };
const mockOcppMessage = {
    findOne: jest.fn(),
    create: jest.fn()
};
const mockHandleRequest = jest.fn();

jest.mock('../../models', () => ({ ChargingStation: mockChargingStation, OcppMessage: mockOcppMessage }));
jest.mock('../messageHandlers', () => ({ handleRequest: mockHandleRequest }));
jest.mock('../../mqtt/client', () => ({}));
jest.mock('../../services/offlineTransactionRecovery', () => ({
    configure: jest.fn(),
    markStationOnline: jest.fn(() => Promise.resolve())
}));
jest.mock('../../utils/logger', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const { handleOcppMessage } = require('../server');

function matchesBranch(row, branch) {
    return Object.entries(branch).every(([key, value]) => row[key] === value);
}

describe('OCPP server inbound dispatch', () => {
    beforeEach(() => {
        mockInboundRows.length = 0;
        jest.clearAllMocks();
        mockChargingStation.findOne.mockResolvedValue({ chargePointId: 'CP-1' });
        mockOcppMessage.findOne.mockImplementation(async ({ where }) => {
            const branches = where[Op.or] || [where];
            return mockInboundRows.find(row => (
                row.direction === where.direction && branches.some(branch => matchesBranch(row, branch))
            )) || null;
        });
        mockOcppMessage.create.mockImplementation(async values => {
            const row = {
                ...values,
                update: jest.fn(async changes => Object.assign(row, changes))
            };
            mockInboundRows.push(row);
            return row;
        });
        mockHandleRequest.mockImplementation(async (_chargePointId, action, uniqueId) => [
            3,
            uniqueId,
            action === 'Heartbeat' ? { currentTime: '2026-10-18T10:00:00.000Z' } : {}
        ]);
    });

    test('dispatches MeterValues when its ID was previously used by Heartbeat', async () => {
        const ws = { readyState: 1, send: jest.fn() };

        await handleOcppMessage('CP-1', [2, '96', 'Heartbeat', {}], ws);

        // Simulate historical production data written with the old key format.
        const heartbeat = mockInboundRows.find(row => row.message_type === 'Heartbeat' && row.direction === 'Inbound');
        heartbeat.dedupeKey = 'inbound:CP-1:96';

        await handleOcppMessage('CP-1', [2, '96', 'MeterValues', {
            connectorId: 1,
            transactionId: 697698,
            meterValue: [{ sampledValue: [{ value: '5278', unit: 'Wh' }] }]
        }], ws);

        expect(mockHandleRequest).toHaveBeenCalledTimes(2);
        expect(mockHandleRequest).toHaveBeenLastCalledWith('CP-1', 'MeterValues', '96', expect.any(Object));
        expect(mockInboundRows.filter(row => row.direction === 'Inbound')).toHaveLength(2);
        expect(ws.send).toHaveBeenCalledTimes(2);
    });

    test('replays a retry for the same action without calling the handler twice', async () => {
        const ws = { readyState: 1, send: jest.fn() };
        const payload = { connectorId: 1, transactionId: 697698, meterValue: [] };

        await handleOcppMessage('CP-1', [2, '96', 'MeterValues', payload], ws);
        await handleOcppMessage('CP-1', [2, '96', 'MeterValues', payload], ws);

        expect(mockHandleRequest).toHaveBeenCalledTimes(1);
        expect(ws.send).toHaveBeenCalledTimes(2);
    });

    test('processes a reused message ID again after a charger reconnects', async () => {
        const firstSocket = { connectionId: 'socket-a', readyState: 1, send: jest.fn() };
        const secondSocket = { connectionId: 'socket-b', readyState: 1, send: jest.fn() };
        const payload = { connectorId: 1, transactionId: 697698, meterValue: [] };

        await handleOcppMessage('CP-1', [2, '1', 'MeterValues', payload], firstSocket);
        await handleOcppMessage('CP-1', [2, '1', 'MeterValues', payload], secondSocket);

        expect(mockHandleRequest).toHaveBeenCalledTimes(2);
        expect(mockInboundRows.filter(row => row.direction === 'Inbound')).toHaveLength(2);
        expect(firstSocket.send).toHaveBeenCalledTimes(1);
        expect(secondSocket.send).toHaveBeenCalledTimes(1);
    });
});
