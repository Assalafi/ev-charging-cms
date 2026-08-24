require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Transaction: SequelizeTransaction } = require('sequelize');
const { sequelize } = require('../src/models');

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredNumber(name) {
  const value = Number(argumentValue(name));
  if (!Number.isFinite(value)) throw new Error(`${name} must be provided as a number`);
  return value;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateCorrection(row, correctCostPerWh) {
  const energyWh = Math.max(number(row.energyDelivered), 0);
  const sellingPricePerWh = number(row.sellingPricePerWh, number(row.locationPricePerWh));
  const partnerSharePercent = number(row.partnerSharePercent, number(row.locationPartnerSharePercent));
  const correctGrossAmount = energyWh * sellingPricePerWh;
  const billableAmount = Math.max(number(row.amount), correctGrossAmount, 0);
  const productionCostAmount = energyWh * correctCostPerWh;
  const profitAmount = Math.max(billableAmount - productionCostAmount, 0);
  const partnerEarning = profitAmount * (partnerSharePercent / 100);

  return {
    correctGrossAmount,
    billableAmount,
    productionCostAmount,
    profitAmount,
    partnerEarning,
    companyEarning: profitAmount - partnerEarning
  };
}

async function main() {
  if (!process.argv.includes('--apply')) {
    throw new Error('Refusing to write without --apply. Run audit-partner-earnings.js for a dry run.');
  }

  const partnerId = requiredNumber('--partner-id');
  const wrongCostPerWh = requiredNumber('--wrong-cost-per-wh');
  const correctCostPerWh = requiredNumber('--correct-cost-per-wh');
  const expectedTransactionCount = requiredNumber('--confirm-transaction-count');
  const expectedLocationCount = requiredNumber('--confirm-location-count');
  const expectedCorrectionAmount = requiredNumber('--confirm-correction-amount');
  const backupFile = argumentValue('--backup-file');

  if (!Number.isInteger(partnerId) || partnerId <= 0) throw new Error('--partner-id must be a positive integer');
  if (wrongCostPerWh < 0 || correctCostPerWh < 0) throw new Error('Cost values cannot be negative');
  if (!backupFile) throw new Error('--backup-file is required');

  const databaseTransaction = await sequelize.transaction({
    isolationLevel: SequelizeTransaction.ISOLATION_LEVELS.SERIALIZABLE
  });

  try {
    const [partners] = await sequelize.query(`
      SELECT id, name, "defaultProductionCostPerWh", "defaultPartnerSharePercent", "updatedAt"
      FROM partner_companies
      WHERE id = :partnerId
      FOR UPDATE
    `, { replacements: { partnerId }, transaction: databaseTransaction });
    if (partners.length !== 1) throw new Error(`Partner ${partnerId} was not found`);
    if (Math.abs(number(partners[0].defaultProductionCostPerWh, -1) - correctCostPerWh) > 0.000001) {
      throw new Error(`Partner default cost is ${partners[0].defaultProductionCostPerWh}, not ${correctCostPerWh}`);
    }

    const [locations] = await sequelize.query(`
      SELECT id, name, "partnerId", "productionCostPerWh", "partnerSharePercent", "updatedAt"
      FROM locations
      WHERE "partnerId" = :partnerId
        AND ABS(COALESCE("productionCostPerWh", -1) - :wrongCostPerWh) < 0.000001
      ORDER BY id
      FOR UPDATE
    `, {
      replacements: { partnerId, wrongCostPerWh },
      transaction: databaseTransaction
    });
    if (locations.length !== expectedLocationCount) {
      throw new Error(`Location count changed: expected ${expectedLocationCount}, found ${locations.length}`);
    }

    const [rows] = await sequelize.query(`
      SELECT t.id, t."transactionId", t."chargePointId", t."stopTime", t."partnerId",
             t."locationId", t."settlementStatus", t."settlementId", t."energyDelivered",
             t.amount, t."grossAmount", t."sellingPricePerWh", t."productionCostPerWh",
             t."partnerSharePercent", t."productionCostAmount", t."profitAmount",
             t."partnerEarning", t."companyEarning", t."updatedAt" AS "transactionUpdatedAt",
             l."pricePerWh" AS "locationPricePerWh",
             l."partnerSharePercent" AS "locationPartnerSharePercent"
      FROM transactions t
      JOIN locations l ON l.id = t."locationId"
      WHERE t."partnerId" = :partnerId
        AND t.status = 'Completed'
        AND t."billedAt" IS NOT NULL
        AND ABS(COALESCE(t."productionCostPerWh", -1) - :wrongCostPerWh) < 0.000001
      ORDER BY t.id
      FOR UPDATE OF t
    `, {
      replacements: { partnerId, wrongCostPerWh },
      transaction: databaseTransaction
    });

    if (rows.length !== expectedTransactionCount) {
      throw new Error(`Transaction count changed: expected ${expectedTransactionCount}, found ${rows.length}`);
    }

    const finalized = rows.filter(row => row.settlementId !== null || row.settlementStatus !== 'pending');
    if (finalized.length) {
      throw new Error(`${finalized.length} affected transaction(s) are no longer pending; no changes were applied`);
    }

    const corrections = rows.map(row => ({
      row,
      calculated: calculateCorrection(row, correctCostPerWh)
    }));
    const recordedPartnerEarning = corrections.reduce((sum, item) => sum + number(item.row.partnerEarning), 0);
    const correctPartnerEarning = corrections.reduce((sum, item) => sum + item.calculated.partnerEarning, 0);
    const correctionAmount = correctPartnerEarning - recordedPartnerEarning;
    if (Math.abs(correctionAmount - expectedCorrectionAmount) > 0.005) {
      throw new Error(
        `Correction amount changed: expected ${expectedCorrectionAmount}, calculated ${correctionAmount}`
      );
    }

    const backup = {
      createdAt: new Date().toISOString(),
      reason: `Correct partner revenue snapshots from ${wrongCostPerWh} to ${correctCostPerWh} per Wh`,
      partner: partners[0],
      locations,
      transactions: rows,
      confirmation: {
        transactionCount: rows.length,
        locationCount: locations.length,
        recordedPartnerEarning,
        correctPartnerEarning,
        correctionAmount
      }
    };
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.writeFileSync(backupFile, `${JSON.stringify(backup, null, 2)}\n`, { flag: 'wx', mode: 0o600 });

    for (const { row, calculated } of corrections) {
      await sequelize.query(`
        UPDATE transactions
        SET "grossAmount" = :correctGrossAmount,
            "productionCostPerWh" = :correctCostPerWh,
            "productionCostAmount" = :productionCostAmount,
            "profitAmount" = :profitAmount,
            "partnerEarning" = :partnerEarning,
            "companyEarning" = :companyEarning,
            "updatedAt" = NOW()
        WHERE id = :id
      `, {
        replacements: {
          id: row.id,
          correctCostPerWh,
          ...calculated
        },
        transaction: databaseTransaction
      });
    }

    const [, locationUpdateMetadata] = await sequelize.query(`
      UPDATE locations
      SET "productionCostPerWh" = :correctCostPerWh,
          "updatedAt" = NOW()
      WHERE "partnerId" = :partnerId
        AND ABS(COALESCE("productionCostPerWh", -1) - :wrongCostPerWh) < 0.000001
    `, {
      replacements: { partnerId, wrongCostPerWh, correctCostPerWh },
      transaction: databaseTransaction
    });

    await databaseTransaction.commit();

    console.log(JSON.stringify({
      success: true,
      partnerId,
      updatedTransactions: rows.length,
      updatedLocations: locationUpdateMetadata?.rowCount ?? locations.length,
      recordedPartnerEarning,
      correctPartnerEarning,
      correctionAmount,
      backupFile
    }, null, 2));
  } catch (error) {
    try {
      await databaseTransaction.rollback();
    } catch (_) {
      // Preserve the original correction error.
    }
    throw error;
  }
}

if (require.main === module) {
  main()
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { calculateCorrection };
