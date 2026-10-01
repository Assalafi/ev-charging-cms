const logger = require('../utils/logger');
const { PartnerCompany } = require('../models');
const { lagosParts, lagosDateToUtc } = require('../utils/partnerDateRange');
const { generateSettlement } = require('./partnerSettlementService');

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
let intervalHandle = null;
let running = false;

function previousCompleteMonth(now = new Date()) {
  const { year, month } = lagosParts(now);
  const currentMonthStart = lagosDateToUtc(year, month, 1);
  return {
    periodType: 'monthly',
    periodStart: lagosDateToUtc(year, month - 1, 1),
    periodEnd: new Date(currentMonthStart.getTime() - 1)
  };
}

async function runMonthlySettlementSweep(now = new Date()) {
  if (running) return { skipped: true, reason: 'A settlement sweep is already running' };
  running = true;
  const period = previousCompleteMonth(now);
  let generated = 0;
  let skipped = 0;

  try {
    const partners = await PartnerCompany.findAll({
      where: { status: 'active', settlementFrequency: 'monthly' },
      attributes: ['id', 'name']
    });

    for (const partner of partners) {
      try {
        const result = await generateSettlement({
          partnerId: partner.id,
          ...period,
          allowEmpty: true
        });

        if (result.success) {
          generated += 1;
          logger.info(`Monthly settlement ready for ${partner.name || partner.id}: #${result.settlement.id}`);
        } else if (/already exists/i.test(result.message || '')) {
          skipped += 1;
        } else {
          logger.warn(`Monthly settlement skipped for ${partner.name || partner.id}: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Monthly settlement failed for partner ${partner.id}:`, error);
      }
    }

    return { generated, skipped, period };
  } finally {
    running = false;
  }
}

function start() {
  if (intervalHandle) return;
  runMonthlySettlementSweep().catch(error => logger.error('Initial monthly settlement sweep failed:', error));
  intervalHandle = setInterval(() => {
    runMonthlySettlementSweep().catch(error => logger.error('Scheduled monthly settlement sweep failed:', error));
  }, SWEEP_INTERVAL_MS);
  intervalHandle.unref?.();
  logger.info('Monthly partner settlement scheduler started');
}

function stop() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = { previousCompleteMonth, runMonthlySettlementSweep, start, stop };
