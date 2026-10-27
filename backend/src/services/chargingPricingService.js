const { ChargingStation, Location, MobileUser, SubscriptionCompany } = require('../models');
const { findMobileUserByTag } = require('./chargerTagService');

const DEFAULT_PRICING = Object.freeze({ pricePerWh: 0.4, minimumCharge: 150 });

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePricing({ pricePerWh, minimumCharge, source = 'system', companyId = null, locationId = null }) {
  const normalizedPrice = finiteNumber(pricePerWh);
  const normalizedMinimum = finiteNumber(minimumCharge);
  return {
    pricePerWh: normalizedPrice !== null && normalizedPrice > 0 ? normalizedPrice : DEFAULT_PRICING.pricePerWh,
    minimumCharge: normalizedMinimum !== null && normalizedMinimum >= 0 ? normalizedMinimum : DEFAULT_PRICING.minimumCharge,
    source,
    companyId: companyId || null,
    locationId: locationId || null
  };
}

/**
 * Resolve the tariff that should be used for a charging session.
 * Company tariffs intentionally take precedence over location tariffs. A
 * NULL company tariff keeps legacy companies on their existing location
 * pricing until an administrator configures a company-specific rate.
 */
async function getChargingPricing({ chargePointId, idTag, userId, companyId } = {}) {
  const station = chargePointId
    ? await ChargingStation.findOne({
      where: { chargePointId },
      attributes: ['id', 'chargePointId', 'locationId']
    })
    : null;
  const location = station?.locationId
    ? await Location.findByPk(station.locationId, { attributes: ['id', 'pricePerWh', 'minimumCharge', 'productionCostPerWh'] })
    : null;

  let resolvedCompanyId = companyId || null;
  if (!resolvedCompanyId && (userId || idTag)) {
    const user = userId
      ? await MobileUser.findByPk(userId, { attributes: ['id', 'companyId'] })
      : await findMobileUserByTag(idTag, { attributes: ['id', 'companyId'] });
    resolvedCompanyId = user?.companyId || null;
  }

  const company = resolvedCompanyId
    ? await SubscriptionCompany.findByPk(resolvedCompanyId, { attributes: ['id', 'pricePerWh', 'minimumCharge'] })
    : null;
  const companyPrice = finiteNumber(company?.pricePerWh);
  const hasCompanyPrice = companyPrice !== null && companyPrice > 0;

  if (company && hasCompanyPrice) {
    return normalizePricing({
      pricePerWh: company.pricePerWh,
      minimumCharge: company.minimumCharge ?? location?.minimumCharge,
      source: 'company',
      companyId: company.id,
      locationId: location?.id || station?.locationId || null
    });
  }

  return normalizePricing({
    pricePerWh: location?.pricePerWh,
    minimumCharge: location?.minimumCharge,
    source: location ? 'location' : 'system',
    companyId: company?.id || resolvedCompanyId,
    locationId: location?.id || station?.locationId || null
  });
}

async function getCompanyPricing(companyId) {
  const company = companyId
    ? await SubscriptionCompany.findByPk(companyId, { attributes: ['id', 'pricePerWh', 'minimumCharge'] })
    : null;
  const price = finiteNumber(company?.pricePerWh);
  if (company && price !== null && price > 0) {
    return normalizePricing({
      pricePerWh: company.pricePerWh,
      minimumCharge: company.minimumCharge,
      source: 'company',
      companyId: company.id
    });
  }
  return normalizePricing({ source: 'system', companyId: company?.id || companyId || null });
}

module.exports = {
  DEFAULT_PRICING,
  getChargingPricing,
  getCompanyPricing,
  normalizePricing
};
