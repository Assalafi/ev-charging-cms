const logger = require('../utils/logger');
const { ChargingStation, Location } = require('../models');

/**
 * Calculate partner revenue for a charging transaction
 * 
 * This function calculates the partner's share of profit after deducting production cost.
 * 
 * Formula:
 * - grossAmount = energyWh * sellingPricePerWh
 * - productionCostAmount = energyWh * productionCostPerWh
 * - profitAmount = max(billableAmount - productionCostAmount, 0)
 * - partnerEarning = profitAmount * (partnerSharePercent / 100)
 * - companyEarning = profitAmount - partnerEarning
 * 
 * @param {Object} params - Calculation parameters
 * @param {string} params.chargePointId - Charging station ID
 * @param {number} params.energyWh - Energy delivered in Wh
 * @param {number} params.billableAmount - Final billable amount (after minimum charge)
 * @returns {Promise<Object>} Revenue calculation result
 */
async function calculatePartnerRevenue({ chargePointId, energyWh, billableAmount }) {
  const safeEnergyWh = Math.max(parseFloat(energyWh) || 0, 0);
  const safeBillableAmount = Math.max(parseFloat(billableAmount) || 0, 0);
  try {
    // Get station to find location
    const station = await ChargingStation.findOne({
      where: { chargePointId },
      attributes: ['id', 'chargePointId', 'locationId']
    });

    if (!station || !station.locationId) {
      logger.warn(`Station ${chargePointId} has no location assigned. No partner revenue calculation.`);
      return {
        locationId: null,
        partnerId: null,
        sellingPricePerWh: null,
        grossAmount: safeBillableAmount,
        billableAmount: safeBillableAmount,
        minimumChargeApplied: false,
        productionCostPerWh: 0,
        partnerSharePercent: 0,
        productionCostAmount: 0,
        profitAmount: safeBillableAmount,
        partnerEarning: 0,
        companyEarning: safeBillableAmount,
        settlementStatus: null
      };
    }

    const location = await Location.findByPk(station.locationId);

    if (!location) {
      logger.warn(`Location ${station.locationId} not found for station ${chargePointId}. No partner revenue calculation.`);
      return {
        locationId: station.locationId,
        partnerId: null,
        sellingPricePerWh: location?.pricePerWh || null,
        grossAmount: safeBillableAmount,
        billableAmount: safeBillableAmount,
        minimumChargeApplied: false,
        productionCostPerWh: 0,
        partnerSharePercent: 0,
        productionCostAmount: 0,
        profitAmount: safeBillableAmount,
        partnerEarning: 0,
        companyEarning: safeBillableAmount,
        settlementStatus: null
      };
    }

    const productionCostPerWh = parseFloat(location.productionCostPerWh || 0);
    const partnerSharePercent = parseFloat(location.partnerSharePercent || 0);
    const sellingPricePerWh = parseFloat(location.pricePerWh || 0);
    const grossAmount = safeEnergyWh * sellingPricePerWh;
    const minimumCharge = Math.max(parseFloat(location.minimumCharge) || 0, 0);
    const finalBillableAmount = Math.max(safeBillableAmount, grossAmount, minimumCharge);
    
    // Calculate production cost
    const productionCostAmount = safeEnergyWh * productionCostPerWh;
    
    // Calculate profit (cannot be negative)
    const profitAmount = Math.max(finalBillableAmount - productionCostAmount, 0);
    
    // Check if location has a partner and settlement is enabled
    const hasPartner = !!location.partnerId && location.settlementEnabled !== false;
    
    // Calculate partner and company earnings
    const partnerEarning = hasPartner
      ? profitAmount * (partnerSharePercent / 100)
      : 0;
    
    const companyEarning = profitAmount - partnerEarning;

    const result = {
      locationId: location.id,
      partnerId: hasPartner ? location.partnerId : null,
      sellingPricePerWh,
      grossAmount,
      billableAmount: finalBillableAmount,
      minimumChargeApplied: grossAmount < minimumCharge,
      productionCostPerWh,
      partnerSharePercent: hasPartner ? partnerSharePercent : 0,
      productionCostAmount,
      profitAmount,
      partnerEarning,
      companyEarning,
      settlementStatus: hasPartner ? 'pending' : null
    };

    logger.info(`Partner revenue calculated for ${chargePointId}:`, {
      energyWh: safeEnergyWh,
      billableAmount: safeBillableAmount,
      ...result
    });

    return result;
  } catch (error) {
    logger.error(`Error calculating partner revenue for ${chargePointId}:`, error);
    // Return default values on error to prevent transaction failure
    return {
      locationId: null,
      partnerId: null,
      sellingPricePerWh: null,
      grossAmount: safeBillableAmount,
      billableAmount: safeBillableAmount,
      minimumChargeApplied: false,
      productionCostPerWh: 0,
      partnerSharePercent: 0,
      productionCostAmount: 0,
      profitAmount: safeBillableAmount,
      partnerEarning: 0,
      companyEarning: safeBillableAmount,
      settlementStatus: null
    };
  }
}

module.exports = {
  calculatePartnerRevenue
};
