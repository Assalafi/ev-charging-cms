import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    Typography,
    Box,
    Divider,
    IconButton,
    Tooltip,
    Switch,
    FormControlLabel,
    Grid,
    Paper,
    CircularProgress,
    Alert
} from '@mui/material';
import {
    WbSunny as SunIcon,
    Brightness3 as MoonIcon,
    Info as InfoIcon,
    AttachMoney as PriceIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import api from '../services/api';
import { format } from 'date-fns';

/**
 * Component for displaying and managing EV charging pricing
 * Shows peak and off-peak rates with currency formatting
 * Pricing is fetched directly from database settings
 */
const PricingWidget = () => {
    // Pricing state
    const [pricing, setPricing] = useState({
        baseRatePerKwh: 0,  // Base price per kWh
        peakHourRate: 0,    // Peak hour rate (percentage increase)
        offPeakRate: 0,     // Off-peak rate (percentage discount)
        memberDiscount: 0,  // Member discount percentage
        peakHoursStart: 9,  // 9 AM
        peakHoursEnd: 22,   // 10 PM
        minimumCharge: 0,   // Minimum charge amount in cents
        currencySymbol: '₦' // Nigerian Naira currency symbol
    });
    
    // Loading and error states
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    
    // Determine current time and if it's peak hours
    const currentHour = new Date().getHours();
    const isPeakHours = currentHour >= pricing.peakHoursStart && currentHour < pricing.peakHoursEnd;
    
    // On component mount, fetch pricing settings
    useEffect(() => {
        fetchPricing();
    }, []);
    
    // Function to format price with currency symbol
    const formatPrice = (priceInNaira) => {
        // Direct formatting - values are already in Naira
        return `${pricing.currencySymbol}${priceInNaira.toFixed(2)}`;
    };
    
    // Get peak rate per kWh
    const getPeakRate = () => {
        return pricing.baseRatePerKwh * (1 + pricing.peakHourRate / 100);
    };
    
    // Get off-peak rate per kWh
    const getOffPeakRate = () => {
        return pricing.baseRatePerKwh * (1 - pricing.offPeakRate / 100);
    };
    
    // Function to fetch pricing settings from API
    const fetchPricing = async () => {
        setLoading(true);
        setError(null);
        
        // Try test endpoint first to check if API is working
        try {
            const testResponse = await api.get('/pricing/test');
            console.log('Test endpoint response:', testResponse.data);
        } catch (testError) {
            console.error('Test endpoint failed:', testError);
        }
        
        try {
            // Use hardcoded default values for testing if the API is failing
            // Remove these in production when API is fixed
            const defaultValues = {
                baseRatePerKwh: 120, // ₦120 per kWh
                peakHourRate: 20,   // 20% increase during peak hours
                offPeakRate: 10,    // 10% discount during off-peak
                memberDiscount: 10, // 10% discount for members
                peakHoursStart: 9,  // 9 AM
                peakHoursEnd: 22,   // 10 PM
                minimumCharge: 100, // ₦100 minimum
                currencySymbol: '₦' // Nigerian Naira
            };
            
            try {
                const response = await api.get('/pricing');
                console.log('Pricing API response:', response.data);
                
                if (response.data && response.data.success) {
                    // Ensure we have valid numeric values
                    const settings = response.data.settings || {};
                    console.log('Parsed settings:', settings);
                    
                    setPricing({
                        baseRatePerKwh: parseFloat(settings.baseRatePerKwh) || defaultValues.baseRatePerKwh,
                        peakHourRate: parseFloat(settings.peakHourRate) || defaultValues.peakHourRate,
                        offPeakRate: parseFloat(settings.offPeakRate) || defaultValues.offPeakRate,
                        memberDiscount: parseFloat(settings.memberDiscount) || defaultValues.memberDiscount,
                        peakHoursStart: parseInt(settings.peakHoursStart) || defaultValues.peakHoursStart,
                        peakHoursEnd: parseInt(settings.peakHoursEnd) || defaultValues.peakHoursEnd,
                        minimumCharge: parseFloat(settings.minimumCharge) || defaultValues.minimumCharge,
                        currencySymbol: settings.currencySymbol || defaultValues.currencySymbol
                    });
                } else {
                    // Fallback to defaults if API returns error
                    console.warn('API returned error, using default pricing values');
                    setPricing(defaultValues);
                    setError('Using default pricing - database settings unavailable');
                }
            } catch (apiErr) {
                // Fallback to defaults if API call fails
                console.error('API call failed:', apiErr);
                setPricing(defaultValues);
                setError(`Using default pricing - ${apiErr.message || 'connection error'}`);
            }
        } catch (err) {
            // This should never happen, but just in case
            console.error('Critical error in pricing widget:', err);
            setError(`Critical error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };
    
    // Get the current time string
    const getCurrentTimeString = () => {
        return format(new Date(), 'h:mm a');
    };
    
    return (
        <Card sx={{
            height: '100%',
            borderRadius: 2
        }}>
            <CardHeader 
                title={
                    <Box display="flex" alignItems="center">
                        <PriceIcon sx={{ mr: 1, color: 'primary.main' }} />
                        <Typography variant="h6">EV Pricing</Typography>
                        <Tooltip title="Pricing for EV charging - pulled from database settings">
                            <IconButton size="small">
                                <InfoIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                }
                action={
                    <Box display="flex" alignItems="center">
                        <Tooltip title="Refresh pricing from database">
                            <IconButton onClick={fetchPricing} size="small" disabled={loading}>
                                {loading ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={showDetails}
                                    onChange={(e) => setShowDetails(e.target.checked)}
                                />
                            }
                            label="Details"
                        />
                    </Box>
                }
            />
            <CardContent>
                {error && (
                    <Alert severity="error" sx={{mb: 2}}>
                        {error}
                    </Alert>
                )}
                
                {loading ? (
                    <Box display="flex" justifyContent="center" p={3}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <>
                        <Box sx={{
                            p: 2,
                            borderRadius: 2,
                            bgcolor: 'primary.light',
                            mb: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <Box display="flex" alignItems="center">
                                <PriceIcon sx={{ mr: 1, color: 'primary.dark' }} />
                                <Typography variant="subtitle1">
                                    Base Price
                                </Typography>
                            </Box>
                            <Typography variant="h6" fontWeight="bold">
                                {formatPrice(pricing.baseRatePerKwh)}
                                <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                                    /kWh
                                </Typography>
                            </Typography>
                        </Box>
                        
                        <Paper elevation={1} sx={{ p: 2, mb: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Minimum Charge
                            </Typography>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2">
                                    Per transaction
                                </Typography>
                                <Typography variant="body1" fontWeight="bold">
                                    {formatPrice(pricing.minimumCharge)}
                                </Typography>
                            </Box>
                            
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 2 }}>
                                Member Discount
                            </Typography>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2">
                                    Discount for registered members
                                </Typography>
                                <Typography variant="body1" fontWeight="bold">
                                    {pricing.memberDiscount}%
                                </Typography>
                            </Box>
                        </Paper>
                    </>
                )}

                {showDetails && !loading && (
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Paper elevation={1} sx={{ p: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Base Rate
                                </Typography>
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2">
                                        Standard per kWh
                                    </Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {formatPrice(pricing.baseRatePerKwh)}
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" mt={1}>
                                    <Typography variant="body2">
                                        Minimum charge
                                    </Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {formatPrice(pricing.minimumCharge)}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <Paper elevation={1} sx={{ p: 2 }}>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Rate Adjustments
                                </Typography>
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2">
                                        Peak hours (+{pricing.peakHourRate}%)
                                    </Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {formatPrice(getPeakRate())}
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" mt={1}>
                                    <Typography variant="body2">
                                        Off-peak hours (-{pricing.offPeakRate}%)
                                    </Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {formatPrice(getOffPeakRate())}
                                    </Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between" mt={1}>
                                    <Typography variant="body2">
                                        Member discount
                                    </Typography>
                                    <Typography variant="body1" fontWeight="bold">
                                        {pricing.memberDiscount}%
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                        
                        <Grid item xs={12}>
                            <Box mt={1} display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="caption" color="text.secondary">
                                    Peak hours: {pricing.peakHoursStart}:00 - {pricing.peakHoursEnd}:00
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Current time: {getCurrentTimeString()}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                All prices shown in cents. Last updated: {format(new Date(), 'MMM d, yyyy h:mm a')}
                            </Typography>
                        </Grid>
                    </Grid>
                )}
            </CardContent>
        </Card>
    );
};

export default PricingWidget;
