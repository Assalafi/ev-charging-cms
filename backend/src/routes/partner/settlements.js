const express = require('express');
const {
  PartnerCompany,
  PartnerSettlement,
  PartnerSettlementItem,
  Transaction
} = require('../../models');
const { authenticate } = require('../../middleware/auth');
const { partnerOnly } = require('../../middleware/partnerScope');
const logger = require('../../utils/logger');

const router = express.Router();
router.use(authenticate, partnerOnly);

const settlementAttributes = [
  'id', 'partnerId', 'periodType', 'periodStart', 'periodEnd',
  'totalTransactions', 'totalEnergyWh', 'partnerEarning', 'adjustmentAmount',
  'finalPayableAmount', 'status', 'approvedAt', 'paidAt', 'paymentReference',
  'paymentMethod', 'notes', 'createdAt', 'updatedAt'
];

const detailInclude = [{
  model: PartnerSettlementItem,
  as: 'items',
  attributes: [
    'id', 'transactionId', 'chargePointId', 'locationId', 'energyWh',
    'partnerEarning', 'createdAt', 'updatedAt'
  ],
  include: [{
    model: Transaction,
    as: 'transaction',
    attributes: [
      'transactionId', 'chargePointId', 'startTime', 'stopTime',
      'energyDelivered', 'partnerEarning'
    ]
  }]
}];

async function findPartnerSettlement(id, partnerId) {
  return PartnerSettlement.findOne({
    where: { id, partnerId },
    attributes: settlementAttributes,
    include: detailInclude
  });
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const where = { partnerId: req.partnerId };
    if (req.query.status && ['draft', 'approved', 'paid', 'cancelled'].includes(req.query.status)) {
      where.status = req.query.status;
    }
    const { count, rows } = await PartnerSettlement.findAndCountAll({
      where,
      attributes: settlementAttributes,
      limit,
      offset: (page - 1) * limit,
      order: [['periodEnd', 'DESC']]
    });
    res.json({
      success: true,
      settlements: rows,
      pagination: { total: count, page, limit, pages: Math.ceil(count / limit) }
    });
  } catch (error) {
    logger.error('Error fetching partner settlements:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settlements' });
  }
});

router.get('/:id/export.csv', async (req, res) => {
  try {
    const settlement = await findPartnerSettlement(req.params.id, req.partnerId);
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });

    const header = [
      'Transaction ID', 'Station', 'Stop Time', 'Energy (Wh)', 'Partner Earning'
    ];
    const rows = settlement.items.map(item => [
      item.transaction?.transactionId || item.transactionId,
      item.chargePointId || item.transaction?.chargePointId,
      item.transaction?.stopTime ? new Date(item.transaction.stopTime).toISOString() : '',
      item.energyWh || 0,
      item.partnerEarning || 0
    ]);
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(row => row.map(escape).join(',')).join('\n');
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="settlement-${settlement.id}-transactions.csv"`
    });
    res.send(`\uFEFF${csv}`);
  } catch (error) {
    logger.error('Error exporting settlement CSV:', error);
    res.status(500).json({ success: false, message: 'Failed to export settlement' });
  }
});

router.get('/:id/statement.pdf', async (req, res) => {
  try {
    const settlement = await findPartnerSettlement(req.params.id, req.partnerId);
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
    const partner = await PartnerCompany.findByPk(req.partnerId);
    const PDFDocument = require('pdfkit');
    const document = new PDFDocument({ margin: 48, size: 'A4' });
    const money = value => `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
    const date = value => value ? new Date(value).toLocaleDateString('en-NG') : '—';

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="settlement-${settlement.id}-statement.pdf"`
    });
    document.pipe(res);

    document.fontSize(20).fillColor('#1976d2').text('eRide Partner Settlement Statement');
    document.moveDown(0.5).fontSize(10).fillColor('#555').text(`Statement #${settlement.id}`);
    document.moveDown();
    document.fontSize(14).fillColor('#111').text(partner?.businessName || partner?.name || 'Partner');
    document.fontSize(10).fillColor('#555')
      .text([partner?.address, partner?.city, partner?.state].filter(Boolean).join(', '))
      .text(`Period: ${date(settlement.periodStart)} – ${date(settlement.periodEnd)}`)
      .text(`Status: ${String(settlement.status).toUpperCase()}`);

    document.moveDown().fontSize(12).fillColor('#111').text('Financial summary', { underline: true });
    [
      ['Transactions', settlement.totalTransactions],
      ['Energy', `${(Number(settlement.totalEnergyWh || 0) / 1000).toFixed(2)} kWh`],
      ['Partner earning', money(settlement.partnerEarning)],
      ['Adjustment', money(settlement.adjustmentAmount)],
      ['Final payable', money(settlement.finalPayableAmount)]
    ].forEach(([label, value]) => {
      document.fontSize(10).fillColor('#555').text(label, { continued: true, width: 220 });
      document.fillColor('#111').text(String(value));
    });

    document.moveDown().fontSize(12).text('Payment details', { underline: true });
    document.fontSize(10)
      .text(`Bank: ${partner?.bankName || '—'}`)
      .text(`Account name: ${partner?.bankAccountName || '—'}`)
      .text(`Account number: ${partner?.bankAccountNumber || '—'}`)
      .text(`Payment reference: ${settlement.paymentReference || '—'}`)
      .text(`Paid date: ${date(settlement.paidAt)}`);

    document.moveDown().fontSize(12).text('Transaction breakdown', { underline: true });
    settlement.items.slice(0, 45).forEach(item => {
      document.fontSize(8).fillColor('#333').text(
        `#${item.transaction?.transactionId || item.transactionId}  ${item.chargePointId || ''}  ` +
        `${(Number(item.energyWh || 0) / 1000).toFixed(2)} kWh  ${money(item.partnerEarning)}`
      );
    });
    if (settlement.items.length > 45) {
      document.fontSize(8).text(`Plus ${settlement.items.length - 45} additional transactions. Download CSV for full detail.`);
    }

    document.moveDown().fontSize(8).fillColor('#777')
      .text(`Generated ${new Date().toLocaleString('en-NG')} by eRide EV Charging.`);
    document.end();
  } catch (error) {
    logger.error('Error generating settlement PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate statement' });
    } else {
      res.end();
    }
  }
});

router.get('/:id', async (req, res) => {
  try {
    const settlement = await findPartnerSettlement(req.params.id, req.partnerId);
    if (!settlement) return res.status(404).json({ success: false, message: 'Settlement not found' });
    res.json({ success: true, settlement });
  } catch (error) {
    logger.error('Error fetching settlement details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settlement details' });
  }
});

module.exports = router;
