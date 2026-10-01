const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  PartnerCompany,
  PartnerSettlement,
  PartnerSettlementItem,
  Transaction,
  Settings
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

async function streamSettlementPdf(res, settlement, partnerId) {
  const partner = await PartnerCompany.findByPk(partnerId);
  const brandingSetting = await Settings.findOne({ where: { category: 'branding', key: 'profile' } });
  const branding = brandingSetting?.value?.data || brandingSetting?.value || {};
  const systemName = String(branding.systemName || 'EV Charge').trim();
  const primaryColor = /^#[0-9a-f]{6}$/i.test(branding.primaryColor || '') ? branding.primaryColor : '#2563EB';
  const PDFDocument = require('pdfkit');
  const document = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true });
  const money = value => `NGN ${Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const date = value => value ? new Date(value).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const empty = value => value || '-';
  const pageLeft = 42;
  const pageWidth = 511;
  const logoDirectory = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads'), 'branding');
  const logoPath = branding.logoUrl && String(branding.logoUrl).startsWith('/public/branding/')
    ? path.resolve(logoDirectory, path.basename(branding.logoUrl))
    : null;

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="settlement-${settlement.id}-statement.pdf"`
  });
  document.pipe(res);

  document.roundedRect(pageLeft, 42, pageWidth, 92, 12).fill(primaryColor);
  if (logoPath && fs.existsSync(logoPath)) {
    try { document.image(logoPath, pageLeft + 16, 61, { fit: [48, 48], align: 'center', valign: 'center' }); } catch (_) { /* optional logo */ }
  }
  document.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text(`${systemName} Partner Statement`, pageLeft + 78, 61);
  document.font('Helvetica').fontSize(9).fillColor('#E8F0FF').text(`Statement #${settlement.id}`, pageLeft + 78, 91);
  document.text(`Generated ${date(new Date())}`, pageLeft + 360, 91, { width: 135, align: 'right' });

  document.fillColor('#172033').font('Helvetica-Bold').fontSize(13).text(partner?.businessName || partner?.name || 'Partner company', pageLeft, 157);
  document.font('Helvetica').fontSize(9).fillColor('#64748B')
    .text([partner?.address, partner?.city, partner?.state].filter(Boolean).join(', ') || 'Partner account')
    .text(`Statement period: ${date(settlement.periodStart)} - ${date(settlement.periodEnd)}`)
    .text(`Status: ${String(settlement.status || 'pending').toUpperCase()}`);

  const summary = [
    ['Sessions', Number(settlement.totalTransactions || 0).toLocaleString()],
    ['Energy delivered', `${(Number(settlement.totalEnergyWh || 0) / 1000).toFixed(2)} kWh`],
    ['Your earning', money(settlement.partnerEarning)],
    ['Final payable', money(settlement.finalPayableAmount)]
  ];
  summary.forEach(([label, value], index) => {
    const x = pageLeft + (index % 2) * 259;
    const y = 225 + Math.floor(index / 2) * 66;
    document.roundedRect(x, y, 247, 54, 8).lineWidth(0.7).fillAndStroke('#F8FAFC', '#E2E8F0');
    document.font('Helvetica').fontSize(8).fillColor('#64748B').text(label.toUpperCase(), x + 12, y + 10);
    document.font('Helvetica-Bold').fontSize(12).fillColor(index === 3 ? primaryColor : '#172033').text(value, x + 12, y + 27);
  });

  document.font('Helvetica-Bold').fontSize(11).fillColor('#172033').text('Payment details', pageLeft, 365);
  document.roundedRect(pageLeft, 384, pageWidth, 76, 8).fillAndStroke('#F8FAFC', '#E2E8F0');
  const payment = [
    ['Bank', empty(partner?.bankName)], ['Account name', empty(partner?.bankAccountName)],
    ['Account number', empty(partner?.bankAccountNumber)], ['Payment reference', empty(settlement.paymentReference)]
  ];
  payment.forEach(([label, value], index) => {
    const x = pageLeft + (index % 2) * 259;
    const y = 398 + Math.floor(index / 2) * 30;
    document.font('Helvetica').fontSize(8).fillColor('#64748B').text(label, x + 12, y);
    document.font('Helvetica-Bold').fontSize(9).fillColor('#172033').text(value, x + 92, y, { width: 150, ellipsis: true });
  });

  const drawTableHeader = y => {
    document.rect(pageLeft, y, pageWidth, 24).fill(primaryColor);
    document.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      .text('TRANSACTION', pageLeft + 8, y + 8)
      .text('STATION', pageLeft + 120, y + 8)
      .text('DATE', pageLeft + 270, y + 8)
      .text('ENERGY', pageLeft + 370, y + 8)
      .text('YOUR EARNING', pageLeft + 432, y + 8);
  };
  document.font('Helvetica-Bold').fontSize(11).fillColor('#172033').text('Transaction breakdown', pageLeft, 475);
  let rowY = 495;
  drawTableHeader(rowY);
  rowY += 24;
  const items = settlement.items || [];
  items.forEach((item, index) => {
    if (rowY > 745) {
      document.addPage();
      rowY = 48;
      drawTableHeader(rowY);
      rowY += 24;
    }
    if (index % 2 === 0) document.rect(pageLeft, rowY, pageWidth, 22).fill('#F8FAFC');
    const transaction = item.transaction || {};
    document.font('Helvetica').fontSize(7.5).fillColor('#172033')
      .text(`#${transaction.transactionId || item.transactionId || '-'}`, pageLeft + 8, rowY + 7, { width: 105, ellipsis: true })
      .text(item.chargePointId || transaction.chargePointId || '-', pageLeft + 120, rowY + 7, { width: 140, ellipsis: true })
      .text(date(transaction.stopTime), pageLeft + 270, rowY + 7, { width: 90 })
      .text(`${(Number(item.energyWh || 0) / 1000).toFixed(2)} kWh`, pageLeft + 370, rowY + 7, { width: 55 })
      .text(money(item.partnerEarning), pageLeft + 432, rowY + 7, { width: 72, align: 'right' });
    rowY += 22;
  });
  if (!items.length) {
    document.font('Helvetica').fontSize(9).fillColor('#64748B').text('No completed charging sessions were included in this period.', pageLeft + 10, rowY + 10);
    rowY += 30;
  }
  if (items.length > 45) {
    document.font('Helvetica').fontSize(8).fillColor('#64748B').text(`Showing the first 45 sessions. Download the CSV for all ${items.length} transactions.`, pageLeft, rowY + 8);
  }
  document.font('Helvetica').fontSize(8).fillColor('#64748B').text(`${systemName} - partner earnings statement`, pageLeft, 806);
  document.end();
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const where = { partnerId: req.partnerId };
    if (req.query.status && ['pending', 'draft', 'approved', 'paid', 'cancelled'].includes(req.query.status)) {
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
    return streamSettlementPdf(res, settlement, req.partnerId);

    /* Legacy renderer retained below for reference; the branded renderer above
       is the only path used for new statements. */
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
