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
        productionCostPerWh: 0,
        partnerSharePercent: 0,
        productionCostAmount: 0,
        profitAmount: billableAmount,
        partnerEarning: 0,
        companyEarning: billableAmount,
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
        productionCostPerWh: 0,
        partnerSharePercent: 0,
        productionCostAmount: 0,
        profitAmount: billableAmount,
        partnerEarning: 0,
        companyEarning: billableAmount,
        settlementStatus: null
      };
    }

    const productionCostPerWh = parseFloat(location.productionCostPerWh || 0);
    const partnerSharePercent = parseFloat(location.partnerSharePercent || 0);
    const sellingPricePerWh = parseFloat(location.pricePerWh || 0);
    
    // Calculate production cost
    const productionCostAmount = energyWh * productionCostPerWh;
    
    // Calculate profit (cannot be negative)
    const profitAmount = Math.max(billableAmount - productionCostAmount, 0);
    
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
      productionCostPerWh,
      partnerSharePercent: hasPartner ? partnerSharePercent : 0,
      productionCostAmount,
      profitAmount,
      partnerEarning,
      companyEarning,
      settlementStatus: hasPartner ? 'pending' : null
    };

    logger.info(`Partner revenue calculated for ${chargePointId}:`, {
      energyWh,
      billableAmount,
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
      productionCostPerWh: 0,
      partnerSharePercent: 0,
      productionCostAmount: 0,
      profitAmount: billableAmount,
      partnerEarning: 0,
      companyEarning: billableAmount,
      settlementStatus: null
    };
  }
}

module.exports = {
  calculatePartnerRevenue
};
