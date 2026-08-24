require('dotenv').config();

const { sequelize } = require('../src/models');

function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] !== undefined
    ? Number(process.argv[index + 1])
    : fallback;
}

const wrongCostPerWh = argumentValue('--wrong-cost-per-wh', 210);
const correctCostPerWh = argumentValue('--correct-cost-per-wh', 0.21);
const summaryOnly = process.argv.includes('--summary-only');

if (!Number.isFinite(wrongCostPerWh) || wrongCostPerWh < 0 ||
    !Number.isFinite(correctCostPerWh) || correctCostPerWh < 0) {
  throw new Error('Cost values must be non-negative numbers');
}

async function main() {
  const [partners] = await sequelize.query(`
    SELECT id, name, "defaultProductionCostPerWh", "defaultPartnerSharePercent", "updatedAt"
    FROM partner_companies
    ORDER BY id
  `);

  const [locations] = await sequelize.query(`
    SELECT l.id, l.name, l."partnerId", p.name AS "partnerName",
           l."pricePerWh", l."minimumCharge", l."productionCostPerWh",
           l."partnerSharePercent", l."updatedAt"
    FROM locations l
    LEFT JOIN partner_companies p ON p.id = l."partnerId"
    WHERE l."partnerId" IS NOT NULL
    ORDER BY l.id
  `);

  const [affected] = await sequelize.query(`
    SELECT t.id, t."transactionId", t."chargePointId", t."stopTime",
           t."partnerId", p.name AS "partnerName", t."locationId",
           l.name AS "locationName", t."settlementStatus", t."settlementId",
           COALESCE(s.status::text, 'none') AS "settlementRecordStatus",
           t."energyDelivered", t.amount, t."grossAmount",
           t."sellingPricePerWh", t."billedAt",
           t."productionCostPerWh", t."partnerSharePercent",
           t."productionCostAmount", t."profitAmount",
           t."partnerEarning" AS "recordedPartnerEarning",
           t."companyEarning" AS "recordedCompanyEarning",
           COALESCE(t."energyDelivered", 0) * COALESCE(t."sellingPricePerWh", l."pricePerWh", 0)
             AS "correctGrossAmount",
           GREATEST(
             COALESCE(t.amount, 0),
             COALESCE(t."energyDelivered", 0) * COALESCE(t."sellingPricePerWh", l."pricePerWh", 0),
             CASE WHEN t."minimumChargeApplied" THEN COALESCE(l."minimumCharge", 0) ELSE 0 END
           ) AS "billableAmount",
           GREATEST(COALESCE(t."energyDelivered", 0) * :correctCostPerWh, 0) AS "correctProductionCost",
           GREATEST(
             GREATEST(
               COALESCE(t.amount, 0),
               COALESCE(t."energyDelivered", 0) * COALESCE(t."sellingPricePerWh", l."pricePerWh", 0),
               CASE WHEN t."minimumChargeApplied" THEN COALESCE(l."minimumCharge", 0) ELSE 0 END
             ) -
             COALESCE(t."energyDelivered", 0) * :correctCostPerWh,
             0
           ) AS "correctProfit",
           GREATEST(
             GREATEST(
               COALESCE(t.amount, 0),
               COALESCE(t."energyDelivered", 0) * COALESCE(t."sellingPricePerWh", l."pricePerWh", 0),
               CASE WHEN t."minimumChargeApplied" THEN COALESCE(l."minimumCharge", 0) ELSE 0 END
             ) -
             COALESCE(t."energyDelivered", 0) * :correctCostPerWh,
             0
           ) * COALESCE(t."partnerSharePercent", l."partnerSharePercent", 0) / 100
             AS "correctPartnerEarning"
    FROM transactions t
    JOIN locations l ON l.id = t."locationId"
    LEFT JOIN partner_companies p ON p.id = t."partnerId"
    LEFT JOIN partner_settlements s ON s.id = t."settlementId"
    WHERE t."partnerId" IS NOT NULL
      AND t.status = 'Completed'
      AND ABS(COALESCE(t."productionCostPerWh", -1) - :wrongCostPerWh) < 0.000001
    ORDER BY t."stopTime", t.id
  `, { replacements: { wrongCostPerWh, correctCostPerWh } });

  const report = affected.reduce((summary, row) => {
    const settlementKey = `${row.settlementStatus || 'null'}/${row.settlementRecordStatus}`;
    const recorded = Number(row.recordedPartnerEarning || 0);
    const corrected = Number(row.correctPartnerEarning || 0);
    const correction = corrected - recorded;
    summary.transactionCount += 1;
    summary.recordedPartnerEarning += recorded;
    summary.correctPartnerEarning += corrected;
    summary.correctionAmount += correction;
    if (!summary.firstStop || new Date(row.stopTime) < new Date(summary.firstStop)) summary.firstStop = row.stopTime;
    if (!summary.lastStop || new Date(row.stopTime) > new Date(summary.lastStop)) summary.lastStop = row.stopTime;
    summary.bySettlementState[settlementKey] ||= {
      transactionCount: 0,
      recordedPartnerEarning: 0,
      correctPartnerEarning: 0,
      correctionAmount: 0
    };
    const group = summary.bySettlementState[settlementKey];
    group.transactionCount += 1;
    group.recordedPartnerEarning += recorded;
    group.correctPartnerEarning += corrected;
    group.correctionAmount += correction;
    return summary;
  }, {
    wrongCostPerWh,
    correctCostPerWh,
    transactionCount: 0,
    firstStop: null,
    lastStop: null,
    recordedPartnerEarning: 0,
    correctPartnerEarning: 0,
    correctionAmount: 0,
    bySettlementState: {}
  });

  console.log(JSON.stringify({
    partners,
    locations,
    report,
    ...(!summaryOnly && { affectedTransactions: affected })
  }, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
