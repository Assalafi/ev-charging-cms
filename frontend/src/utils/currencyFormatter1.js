/**
 * Utility functions for currency formatting
 * Specifically configured for Nigerian Naira (NGN)
 */
import pricingService from '../services/pricingService';

/**
 * Format a number as Nigerian Naira currency
 * @param {number} amount - Amount to format
 * @param {boolean} includeSymbol - Whether to include the ₦ symbol
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, includeSymbol = true) => {
    // Handle null, undefined, NaN, or non-numeric values
    if (amount === null || amount === undefined || isNaN(amount) || typeof amount !== 'number') {
        return includeSymbol ? '₦0.00' : '0.00';
    }

    try {
        const formatter = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        // If we don't want the symbol, we need to remove it from the formatted string
        if (!includeSymbol) {
            return formatter.format(amount).replace('₦', '');
        }

        return formatter.format(amount);
    } catch (error) {
        console.error('Error formatting currency:', error);
        return includeSymbol ? '₦0.00' : '0.00';
    }
};

/**
 * Determine if a given time is during peak hours (9am-10pm in Nigeria)
 * @param {Date} time - Time to check
 * @returns {boolean} True if time is during peak hours
 */
export const isPeakHour = (time = new Date()) => {
    const hour = time.getHours();
    // Peak hours in Nigeria are typically 9:00 to 22:00 (9am to 10pm)
    return hour >= 9 && hour < 22;
};

// Database settings cache
let cachedSettings = null;
let lastFetchTime = 0;

/**
 * Get pricing settings from database, with local caching
 * @returns {Object} Pricing settings
 */
export const getPricingSettings = async () => {
    try {
        const now = Date.now();
        const cacheExpiry = 5 * 60 * 1000; // Cache for 5 minutes

        // Use cached settings if available and fresh
        if (cachedSettings && (now - lastFetchTime < cacheExpiry)) {
            return cachedSettings;
        }

        // Fetch from database
        const response = await pricingService.getPricingSettings();

        if (response && response.success && response.settings) {
            cachedSettings = response.settings;
            lastFetchTime = now;
            return cachedSettings;
        } else {
            throw new Error('Invalid response format from pricing service');
        }
    } catch (error) {
        console.error('Error fetching pricing settings from database:', error);

        // Default Nigerian EV charging rates if DB fetch fails
        return {
            baseRate: 120, // ₦120 per kWh base rate
            peakRate: 145, // ₦145 per kWh during peak hours
            offPeakRate: 100, // ₦100 per kWh during off-peak hours
            memberDiscount: 10, // 10% discount for members
            minimumCharge: 500 // ₦500 minimum charge
        };
    }
};

// Fallback settings for when API calls fail
const DEFAULT_SETTINGS = {
    baseRate: 120, // ₦120 per kWh base rate
    peakRate: 145, // ₦145 per kWh during peak hours
    offPeakRate: 100, // ₦100 per kWh during off-peak hours
    memberDiscount: 10, // 10% discount for members
    minimumCharge: 500 // ₦500 minimum charge
};

/**
 * Calculate price based on energy consumption (kWh)
 * Using Nigerian electricity pricing model with direct energy calculation
 * 
 * @param {number} energyKwh - Energy consumed in kWh
 * @param {boolean} isMember - Whether the user is a member eligible for discount
 * @returns {number} Price in Nigerian Naira
 */
export const calculatePrice = (energyKwh, isMember = false) => {
    // Handle invalid energy values
    if (energyKwh === null || energyKwh === undefined || isNaN(energyKwh)) {
        return DEFAULT_SETTINGS.minimumCharge;
    }

    // Ensure energyKwh is a number and non-negative
    const energy = Math.max(0, parseFloat(energyKwh));
    console.log('Energy value being calculated:', energy);

    // Calculate with the best settings available
    // First try API settings from database if available
    try {
        // If we have cached settings from DB, use those
        if (cachedSettings) {
            console.log('Using cached DB settings for price calculation');
            return calculatePriceWithSettings(energy, isMember, cachedSettings);
        }

        // No cached settings, use defaults but trigger a refresh for future calculations
        console.log('No cached settings, using defaults but refreshing');

        // Trigger background refresh of settings (doesn't wait for result)
        getPricingSettings().then(settings => {
            console.log('Settings refreshed from database for future calculations');
        }).catch(error => {
            console.error('Failed to refresh pricing settings:', error);
        });

        // Meanwhile, return calculation with defaults
        return calculatePriceWithSettings(energy, isMember, DEFAULT_SETTINGS);
    } catch (error) {
        // If anything goes wrong, use the default settings
        console.error('Error in price calculation, using defaults:', error);
        return calculatePriceWithSettings(energy, isMember, DEFAULT_SETTINGS);
    }
};

/**
 * Helper function to calculate price with specific settings
 * @param {number} energy - Energy consumed in kWh
 * @param {boolean} isMember - Whether the user is a member
 * @param {object} settings - Pricing settings object
 * @returns {number} Calculated price
 */
const calculatePriceWithSettings = (energy, isMember, settings) => {
    // Ensure settings is valid
    settings = settings || DEFAULT_SETTINGS;

    // Get base rate with fallback
    const baseRate = settings.baseRate || DEFAULT_SETTINGS.baseRate;

    // Calculate raw price
    let totalPrice = energy * baseRate;
    console.log('Raw price calculation:', energy, 'kWh ×', baseRate, '=', totalPrice);

    // Apply minimum charge
    const minimumCharge = settings.minimumCharge || DEFAULT_SETTINGS.minimumCharge;
    totalPrice = Math.max(totalPrice, minimumCharge);
    console.log('After minimum charge applied:', totalPrice);

    // Apply member discount if applicable
    if (isMember) {
        const discountRate = settings.memberDiscount || DEFAULT_SETTINGS.memberDiscount;
        const discountAmount = totalPrice * (discountRate / 100);
        totalPrice = totalPrice - discountAmount;
        console.log('After member discount applied:', totalPrice);
    }

    return totalPrice;
};

export default {
    formatCurrency,
    calculatePrice
};