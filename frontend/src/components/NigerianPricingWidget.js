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
  Paper
} from '@mui/material';
import {
  WbSunny as SunIcon,
  Brightness3 as MoonIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  AttachMoney as PriceIcon
} from '@mui/icons-material';

/**
 * Component for displaying and managing Nigerian EV charging pricing
 * Shows peak and off-peak rates with Nigerian Naira currency
 */
const NigerianPricingWidget = () => {
  // Pricing state
  const [pricing, setPricing] = useState({
    peakRate: 145, // Nigerian Naira per kWh during peak hours
    offPeakRate: 100, // Nigerian Naira per kWh during off-peak hours
    memberDiscount: 10, // 10% discount for members
    peakHoursStart: 9, // 9 AM
    peakHoursEnd: 22, // 10 PM
    minimumCharge: 500 // Minimum charge in Naira
  });
  
  // Current time state to determine peak/off-peak
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPeakHours, setIsPeakHours] = useState(false);
  
  // User preferences
  const [showDetails, setShowDetails] = useState(false);
  
  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Check if current hour is within peak hours
      const currentHour = now.getHours();
      setIsPeakHours(currentHour >= pricing.peakHoursStart && currentHour < pricing.peakHoursEnd);
    }, 60000); // Update every minute
    
    // Initial check
    const now = new Date();
    const currentHour = now.getHours();
    setIsPeakHours(currentHour >= pricing.peakHoursStart && currentHour < pricing.peakHoursEnd);
    
    return () => clearInterval(timer);
  }, [pricing.peakHoursStart, pricing.peakHoursEnd]);
  
  // Load pricing from localStorage on mount
  useEffect(() => {
    const savedPricing = localStorage.getItem('nigerianPricing');
    if (savedPricing) {
      try {
        setPricing(JSON.parse(savedPricing));
      } catch (e) {
        console.error('Error parsing saved pricing', e);
      }
    }
  }, []);
  
  // Save pricing to localStorage when changed
  useEffect(() => {
    localStorage.setItem('nigerianPricing', JSON.stringify(pricing));
  }, [pricing]);
  
  // Format price with Nigerian Naira symbol
  const formatPrice = (price) => {
    return `₦${price.toFixed(2)}`;
  };
  
  // Calculate discounted price
  const getDiscountedPrice = (price) => {
    return price * (1 - pricing.memberDiscount / 100);
  };

  return (
    <Card sx={{ height: '100%', borderRadius: 2 }}>
      <CardHeader 
        title={
          <Box display="flex" alignItems="center">
            <PriceIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">Nigerian EV Pricing</Typography>
            <Tooltip title="Pricing for Nigerian charging stations with peak/off-peak rates">
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
        action={
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
        }
      />
      <CardContent>
        <Box 
          sx={{ 
            p: 2, 
            borderRadius: 2, 
            bgcolor: isPeakHours ? 'warning.light' : 'info.light',
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Box display="flex" alignItems="center">
            {isPeakHours ? (
              <SunIcon sx={{ mr: 1, color: 'warning.dark' }} />
            ) : (
              <MoonIcon sx={{ mr: 1, color: 'info.dark' }} />
            )}
            <Typography variant="subtitle1">
              {isPeakHours ? 'Peak Hours' : 'Off-Peak Hours'}
            </Typography>
          </Box>
          <Typography variant="h6" fontWeight="bold">
            {formatPrice(isPeakHours ? pricing.peakRate : pricing.offPeakRate)}
            <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
              /kWh
            </Typography>
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={6}>
            <Paper 
              elevation={1} 
              sx={{ 
                p: 1.5, 
                textAlign: 'center',
                bgcolor: 'warning.light',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Box>
                <SunIcon sx={{ color: 'warning.dark', mb: 0.5 }} />
                <Typography variant="subtitle2">Peak Rate</Typography>
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {formatPrice(pricing.peakRate)}
                <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                  /kWh
                </Typography>
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {pricing.peakHoursStart}:00 - {pricing.peakHoursEnd}:00
              </Typography>
            </Paper>
          </Grid>
          
          <Grid item xs={6}>
            <Paper 
              elevation={1} 
              sx={{ 
                p: 1.5, 
                textAlign: 'center',
                bgcolor: 'info.light',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Box>
                <MoonIcon sx={{ color: 'info.dark', mb: 0.5 }} />
                <Typography variant="subtitle2">Off-Peak Rate</Typography>
              </Box>
              <Typography variant="h6" fontWeight="bold">
                {formatPrice(pricing.offPeakRate)}
                <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                  /kWh
                </Typography>
              </Typography>
              <Typography variant="caption" sx={{ display: 'block' }}>
                {pricing.peakHoursEnd}:00 - {pricing.peakHoursStart}:00
              </Typography>
            </Paper>
          </Grid>
        </Grid>
        
        {showDetails && (
          <>
            <Divider sx={{ my: 2 }} />
            
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Member Discount: {pricing.memberDiscount}%
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Member Peak Rate:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatPrice(getDiscountedPrice(pricing.peakRate))}/kWh
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Member Off-Peak Rate:</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {formatPrice(getDiscountedPrice(pricing.offPeakRate))}/kWh
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Minimum Charge:
                  </Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {formatPrice(pricing.minimumCharge)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
              Rates are subject to change based on Nigerian Electricity Regulatory Commission guidelines and local power costs.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default NigerianPricingWidget;
