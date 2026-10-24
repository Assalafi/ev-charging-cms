const mockTransaction = {
  findOne: jest.fn(),
  create: jest.fn(),
}
const mockConnector = { findOne: jest.fn() }
const mockChargingStation = { update: jest.fn() }
const mockMeterValue = { findOne: jest.fn(), create: jest.fn() }
const mockMobileUser = {}
const mockWallet = {}
const mockPaymentTransaction = { create: jest.fn() }
const mockOcppMessage = { findAll: jest.fn() }
const mockSequelize = {
  query: jest.fn(),
  QueryTypes: { INSERT: 'INSERT' },
}
const mockFindVerifiedIntent = jest.fn()
const mockGetChargingPricing = jest.fn()
const mockGetVerifiedOwner = jest.fn((intent, connectorId) => (
  intent?.verified &&
  !intent.blocked &&
  Number(intent.connectorId) === Number(connectorId) &&
  intent.chargingConfirmed !== false
    ? String(intent.idTag)
    : null
))
const mockTagAuthorization = { isAuthorized: jest.fn() }
const mockSessionTracker = {
  startSession: jest.fn(),
  updateMeterValue: jest.fn(),
}

jest.mock('../../models', () => ({
  Transaction: mockTransaction,
  MeterValue: mockMeterValue,
  ChargingStation: mockChargingStation,
  Connector: mockConnector,
  MobileUser: mockMobileUser,
  Wallet: mockWallet,
  PaymentTransaction: mockPaymentTransaction,
  OcppMessage: mockOcppMessage,
  sequelize: mockSequelize,
}))
jest.mock('../../mqtt/client', () => ({ publish: jest.fn() }))
jest.mock('../../services/tagAuthorization', () => mockTagAuthorization)
jest.mock('../../services/chargingSessionTracker', () => mockSessionTracker)
jest.mock('../../utils/pricingValidator', () => ({ validatePricingSettings: jest.fn() }))
jest.mock('../../services/billingService', () => ({ billTransaction: jest.fn() }))
jest.mock('../../services/partnerRevenueService', () => ({ calculatePartnerRevenue: jest.fn() }))
jest.mock('../../services/chargingPricingService', () => ({
  getChargingPricing: mockGetChargingPricing,
}))
jest.mock('../../services/ocppTransactionResolver', () => ({
  resolveCanonicalOcppTransactionId: jest.fn(),
}))
jest.mock('../../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))
jest.mock('../remoteStartCorrelation', () => ({
  REMOTE_START_RECOVERY_WINDOW_MS: 15 * 60 * 1000,
  REMOTE_START_SESSION_WINDOW_MS: 2 * 60 * 60 * 1000,
  findVerifiedRemoteStartIntent: mockFindVerifiedIntent,
  getVerifiedRemoteStartOwner: mockGetVerifiedOwner,
}))

const messageHandlers = require('../messageHandlers')
const { parseMeterValueWh, resolveMeterValuesTransactionUnlocked } = messageHandlers._test

describe('MeterValues driver ownership safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockChargingStation.update.mockResolvedValue([1])
    mockSequelize.query.mockResolvedValue([])
    mockOcppMessage.findAll.mockResolvedValue([])
    mockGetChargingPricing.mockResolvedValue({
      pricePerWh: 0.35,
      minimumCharge: 150,
      source: 'location',
    })
  })

  test('uses only an aggregate cumulative register for billable energy', () => {
    expect(parseMeterValueWh([
      {
        measurand: 'Energy.Active.Import.Register',
        phase: 'L1-N',
        unit: 'Wh',
        value: '1200',
      },
      {
        measurand: 'Energy.Active.Import.Register',
        unit: 'kWh',
        value: '4.25',
      },
    ])).toBe(4250)

    expect(parseMeterValueWh([
      {
        measurand: 'Energy.Active.Import.Register',
        phase: 'L1-N',
        unit: 'Wh',
        value: '1200',
      },
    ])).toBeNull()
  })

  test('never reassigns an active transaction when a newer RemoteStart names another user', async () => {
    const active = {
      transactionId: 123456,
      idTag: 'MOB-OLD',
      status: 'InProgress',
      reason: 'OCPP_VERIFIED_REMOTE_START_RECOVERY',
      startTime: new Date('2026-10-24T11:20:00.000Z'),
      startMeterValue: 100,
      stopMeterValue: 120,
      update: jest.fn(),
    }
    mockTransaction.findOne
      .mockResolvedValueOnce(active)
      .mockResolvedValueOnce(active)
    mockFindVerifiedIntent.mockResolvedValue({
      idTag: 'MOB-NEW',
      connectorId: 1,
      messageId: 'remote-new',
      createdAt: new Date('2026-10-24T11:30:00.000Z'),
      verified: true,
      chargingConfirmed: true,
    })

    const result = await resolveMeterValuesTransactionUnlocked({
      chargePointId: 'CP-1',
      connectorId: 1,
      reportedTransactionId: 123456,
      meterValueWh: 150,
      meterTimestamp: '2026-10-24T11:31:00.000Z',
      chargingSignal: true,
    })

    expect(result).toMatchObject({ transaction: null, quarantined: true })
    expect(active.update).not.toHaveBeenCalled()
    expect(mockTransaction.create).not.toHaveBeenCalled()
  })

  test('does not fall back to the previous completed user without verified ownership', async () => {
    const completed = {
      transactionId: 678960,
      idTag: 'MOB-PREVIOUS',
      status: 'Completed',
      reason: 'Local',
      stopTime: new Date('2026-10-24T10:00:00.000Z'),
      stopMeterValue: 4000,
    }
    mockTransaction.findOne
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(null)
    mockFindVerifiedIntent.mockResolvedValue(null)
    mockConnector.findOne.mockResolvedValue({ status: 'Charging' })

    const result = await resolveMeterValuesTransactionUnlocked({
      chargePointId: 'CP-1',
      connectorId: 1,
      reportedTransactionId: 678960,
      meterValueWh: 4238,
      meterTimestamp: '2026-10-24T11:38:00.000Z',
      chargingSignal: true,
    })

    expect(result).toMatchObject({ transaction: null, quarantined: true })
    expect(mockTransaction.create).not.toHaveBeenCalled()
  })

  test('creates recovery only for the verified new RemoteStart owner', async () => {
    const completed = {
      transactionId: 678960,
      idTag: 'MOB-PREVIOUS',
      status: 'Completed',
      reason: 'Local',
      stopTime: new Date('2026-10-24T10:00:00.000Z'),
      stopMeterValue: 4000,
    }
    const recovered = {
      id: 55,
      transactionId: 930928,
      idTag: 'MOB-CURRENT',
      startMeterValue: 4000,
      energyDelivered: 238,
    }
    mockTransaction.findOne
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockFindVerifiedIntent.mockResolvedValue({
      idTag: 'MOB-CURRENT',
      connectorId: 1,
      messageId: 'remote-current',
      createdAt: new Date('2026-10-24T11:29:22.000Z'),
      verified: true,
      chargingConfirmed: true,
    })
    mockConnector.findOne.mockResolvedValue({ status: 'Charging' })
    mockTransaction.create.mockResolvedValue(recovered)

    const result = await resolveMeterValuesTransactionUnlocked({
      chargePointId: 'CP-1',
      connectorId: 1,
      reportedTransactionId: 678960,
      meterValueWh: 4238,
      meterTimestamp: '2026-10-24T11:38:00.000Z',
      chargingSignal: true,
    })

    expect(result.transaction).toBe(recovered)
    expect(mockTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      idTag: 'MOB-CURRENT',
      reason: 'OCPP_VERIFIED_REMOTE_START_RECOVERY',
      startMeterValue: 4000,
      energyDelivered: 238,
      sellingPricePerWh: 0.35,
      minimumChargeAmount: 150,
    }))
    expect(mockTransaction.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ idTag: 'MOB-PREVIOUS' })
    )
  })

  test('uses zero baseline when post-RemoteStart audit meters prove the register reset', async () => {
    const completed = {
      transactionId: 678960,
      idTag: 'MOB-PREVIOUS',
      status: 'Completed',
      reason: 'Local',
      stopTime: new Date('2026-10-24T10:00:00.000Z'),
      stopMeterValue: 4000,
    }
    mockTransaction.findOne
      .mockResolvedValueOnce(completed)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mockFindVerifiedIntent.mockResolvedValue({
      idTag: 'MOB-CURRENT',
      connectorId: 1,
      messageId: 'remote-current',
      createdAt: new Date('2026-10-24T11:29:22.000Z'),
      acceptedAt: new Date('2026-10-24T11:29:23.000Z'),
      chargingConfirmedAt: new Date('2026-10-24T11:29:49.000Z'),
      verified: true,
      chargingConfirmed: true,
    })
    mockConnector.findOne.mockResolvedValue({ status: 'Charging' })
    mockOcppMessage.findAll.mockResolvedValue([
      {
        payload: {
          connectorId: 1,
          transactionId: 678960,
          meterValue: [{
            timestamp: '2026-10-24T11:29:50.000Z',
            sampledValue: [{
              measurand: 'Energy.Active.Import.Register',
              unit: 'Wh',
              value: '0',
            }],
          }],
        },
      },
    ])
    mockTransaction.create.mockResolvedValue({ id: 60, transactionId: 930929 })

    await resolveMeterValuesTransactionUnlocked({
      chargePointId: 'CP-1',
      connectorId: 1,
      reportedTransactionId: 678960,
      meterValueWh: 4238,
      meterTimestamp: '2026-10-24T11:38:00.000Z',
      chargingSignal: true,
    })

    expect(mockTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      idTag: 'MOB-CURRENT',
      startMeterValue: 0,
      energyDelivered: 4238,
    }))
  })

  test('rejects a StartTransaction when two valid users conflict', async () => {
    mockTagAuthorization.isAuthorized.mockResolvedValue({ status: 'Accepted' })
    mockFindVerifiedIntent.mockResolvedValue({
      idTag: 'MOB-REMOTE',
      connectorId: 1,
      messageId: 'remote-owner',
      createdAt: new Date(),
      verified: true,
      chargingConfirmed: null,
    })
    mockGetVerifiedOwner.mockReturnValueOnce('MOB-REMOTE')

    const response = await messageHandlers.handleStartTransaction('CP-1', 'start-1', {
      connectorId: 1,
      idTag: 'MOB-LOCAL',
      meterStart: 10,
      timestamp: new Date().toISOString(),
    })

    expect(response).toEqual([3, 'start-1', {
      transactionId: 0,
      idTagInfo: { status: 'Invalid' },
    }])
    expect(mockTransaction.create).not.toHaveBeenCalled()
  })

  test('does not reopen an old customer transaction from Charging status alone', async () => {
    mockTransaction.findOne.mockResolvedValueOnce(null)
    mockFindVerifiedIntent.mockResolvedValue(null)

    const response = await messageHandlers.handleStatusNotification('CP-1', 'status-1', {
      connectorId: 1,
      status: 'Charging',
      errorCode: 'NoError',
    })

    expect(response).toEqual([3, 'status-1', {}])
    expect(mockTransaction.findOne).toHaveBeenCalledTimes(1)
    expect(mockTransaction.create).not.toHaveBeenCalled()
    expect(mockPaymentTransaction.create).not.toHaveBeenCalled()
  })
})
