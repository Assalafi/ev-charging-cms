import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  EvStation as EvStationIcon
} from '@mui/icons-material';
import api from '../../services/api';

const PartnerPerformance = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('monthly');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });

  useEffect(() => {
    fetchPerformance();
  }, [range]);

  const fetchPerformance = async () => {
    try {
      let url = `/partner/performance?range=${range}`;
      if (range === 'custom' && customRange.startDate && customRange.endDate) {
        url += `&startDate=${customRange.startDate}&endDate=${customRange.endDate}`;
      }
      const response = await api.get(url);
      if (response.data.success) {
        const data = response.data;
        setStats({
          totalRevenue: data.totals?.partnerEarning || 0,
          totalEnergy: data.totals?.energyWh || 0,
          totalTransactions: data.totals?.transactions || 0,
          partnerEarnings: data.totals?.partnerEarning || 0,
          topLocations: data.byLocation?.map(loc => ({
            id: loc.location_id,
            name: loc.location_name,
            revenue: loc.partner_earning
          })) || []
        });
      }
    } catch (error) {
      console.error('Error fetching performance:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRangeChange = (event) => {
    setRange(event.target.value);
  };

  const handleCustomRangeSubmit = () => {
    fetchPerformance();
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        Loading...
      </Box>
    );
  }

  const statCards = [
    {
      title: 'Total Revenue',
      value: stats?.totalRevenue ? `₦${stats.totalRevenue.toLocaleString()}` : '₦0',
      icon: <MoneyIcon sx={{ fontSize: 40 }} />,
      color: '#4caf50'
    },
    {
      title: 'Total Energy',
      value: stats?.totalEnergy ? `${(stats.totalEnergy / 1000).toFixed(2)} kWh` : '0 kWh',
      icon: <EvStationIcon sx={{ fontSize: 40 }} />,
      color: '#2196f3'
    },
    {
      title: 'Transactions',
      value: stats?.totalTransactions || 0,
      icon: <TrendingUpIcon sx={{ fontSize: 40 }} />,
      color: '#ff9800'
    },
    {
      title: 'Partner Earnings',
      value: stats?.partnerEarnings ? `₦${stats.partnerEarnings.toLocaleString()}` : '₦0',
      icon: <MoneyIcon sx={{ fontSize: 40 }} />,
      color: '#9c27b0'
    }
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Partner Performance
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth>
            <InputLabel>Time Range</InputLabel>
            <Select value={range} onChange={handleRangeChange} label="Time Range">
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        {range === 'custom' && (
          <>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="date"
                label="Start Date"
                value={customRange.startDate}
                onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                fullWidth
                type="date"
                label="End Date"
                value={customRange.endDate}
                onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button
                variant="contained"
                onClick={handleCustomRangeSubmit}
                disabled={!customRange.startDate || !customRange.endDate}
                sx={{ mt: 1 }}
              >
                Apply
              </Button>
            </Grid>
          </>
        )}
      </Grid>

      <Grid container spacing={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      {card.title}
                    </Typography>
                    <Typography variant="h4" component="div">
                      {card.value}
                    </Typography>
                  </Box>
                  <Box sx={{ color: card.color }}>
                    {card.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mt: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top Performing Locations
              </Typography>
              {stats?.topLocations?.length > 0 ? (
                stats.topLocations.map((loc, index) => (
                  <Box key={loc.id} sx={{ mb: 2, pb: 2, borderBottom: '1px solid #eee' }}>
                    <Typography variant="body1">
                      {index + 1}. {loc.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Revenue: ₦{loc.revenue?.toLocaleString() || 0}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No data available
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Revenue Trend
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Chart visualization would go here
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PartnerPerformance;
