const dbTx = {
  LOCK: { UPDATE: 'UPDATE' },
  commit: jest.fn(),
  rollback: jest.fn(),
}
const chargingTx = {
  transactionId: 123456,
  chargePointId: 'CP-1',
  idTag: 'MOB-OWNER',
  amount: 100,
  energyDelivered: 250,
  billedAt: new Date('2026-10-24T10:00:00.000Z'),
  update: jest.fn(),
}
const wallet = {
  id: 20,
  balance: 1000,
  update: jest.fn(),
}
const mockModels = {
  Transaction: { findOne: jest.fn() },
  MobileUser: { findOne: jest.fn() },
  Wallet: { findOne: jest.fn() },
  PaymentTransaction: { findOne: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn() },
}

jest.mock('../../models', () => mockModels)
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}))

const {
  reconcileCompletedBilling,
  reopenNetworkDisconnectedTransaction,
} = require('../billingService')

describe('atomic completed-session reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    chargingTx.status = 'Completed'
    chargingTx.reason = 'NetworkDisconnected'
    chargingTx.settlementId = null
    chargingTx.billedAt = new Date('2026-10-24T10:00:00.000Z')
    chargingTx.amount = 100
    wallet.balance = 1000
    mockModels.sequelize.transaction.mockResolvedValue(dbTx)
    mockModels.Transaction.findOne.mockResolvedValue(chargingTx)
    mockModels.MobileUser.findOne.mockResolvedValue({ id: 10 })
    mockModels.Wallet.findOne.mockResolvedValue(wallet)
    mockModels.PaymentTransaction.findOne.mockResolvedValue(null)
    wallet.update.mockResolvedValue(wallet)
    chargingTx.update.mockResolvedValue(chargingTx)
    dbTx.commit.mockResolvedValue()
    dbTx.rollback.mockResolvedValue()
  })

  test('updates wallet, adjustment ledger and transaction in one database transaction', async () => {
    const updates = {
      stopMeterValue: 500,
      energyDelivered: 500,
      amount: 125,
    }

    const result = await reconcileCompletedBilling(123456, updates)

    expect(result).toMatchObject({ success: true, difference: 25 })
    expect(wallet.update).toHaveBeenCalledWith(
      { balance: 975 },
      { transaction: dbTx }
    )
    expect(mockModels.PaymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DEBIT',
        amount: 25,
        reference: 'ADJ-123456-500',
      }),
      { transaction: dbTx }
    )
    expect(chargingTx.update).toHaveBeenCalledWith(updates, { transaction: dbTx })
    expect(dbTx.commit).toHaveBeenCalled()
    expect(dbTx.rollback).not.toHaveBeenCalled()
  })

  test('rolls back without changing the transaction when its owner wallet is missing', async () => {
    mockModels.Wallet.findOne.mockResolvedValue(null)

    const result = await reconcileCompletedBilling(123456, {
      stopMeterValue: 500,
      energyDelivered: 500,
      amount: 125,
    })

    expect(result).toMatchObject({ success: false })
    expect(dbTx.rollback).toHaveBeenCalled()
    expect(chargingTx.update).not.toHaveBeenCalled()
  })

  test('atomically refunds provisional billing before reopening a network session', async () => {
    const result = await reopenNetworkDisconnectedTransaction(123456)

    expect(result).toMatchObject({ success: true, transaction: chargingTx })
    expect(wallet.update).toHaveBeenCalledWith(
      { balance: 1100 },
      { transaction: dbTx }
    )
    expect(mockModels.PaymentTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CREDIT',
        amount: 100,
        reference: `RESUME-REFUND-123456-${chargingTx.billedAt.getTime()}`,
      }),
      { transaction: dbTx }
    )
    expect(chargingTx.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'InProgress', billedAt: null }),
      { transaction: dbTx }
    )
    expect(dbTx.commit).toHaveBeenCalled()
  })

  test('refuses to reopen a transaction already included in a settlement', async () => {
    chargingTx.settlementId = 99

    const result = await reopenNetworkDisconnectedTransaction(123456)

    expect(result).toMatchObject({ success: false })
    expect(dbTx.rollback).toHaveBeenCalled()
    expect(wallet.update).not.toHaveBeenCalled()
  })
})
