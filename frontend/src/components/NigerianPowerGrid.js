import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Grid,
  LinearProgress,
  Divider,
  Chip,
  Tooltip,
  Card,
  CardContent,
  IconButton
} from '@mui/material';
import {
  BatteryChargingFull as BatteryIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  WbSunny as SolarIcon,
  ElectricBolt as GridIcon,
  Settings as GeneratorIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import api from '../services/api';
import { format } from 'date-fns';

/**
 * Component to monitor Nigerian power grid stability across charging stations
 * This is particularly important in Nigeria where power outages are common
 */
const NigerianPowerGrid = () => {
  const [loading, setLoading] = useState(true);
  const [gridData, setGridData] = useState({
    gridPowered: 0,
    generatorPowered: 0,
    solarPowered: 0,
    noPower: 0,
    stationDetails: [],
    lastUpdated: null
  });

  // Fetch grid data
  const fetchGridData = async () => {
    setLoading(true);
    try {
      // This would normally be an API call to get real-time power data
      // For demo purposes, we're generating simulated data
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get stations
      const stationsResponse = await api.get('/stations');
      const stations = stationsResponse.data.stations || [];
      
      // Generate power source data for each station
      const stationDetails = stations.map(station => {
        // For Nigerian stations, simulate realistic power conditions
        const isNigerianStation = station.chargePointId.startsWith('NG') || 
                                 (station.name && station.name.includes('Nigeria'));
        
        // Nigerian stations are more likely to use backup power
        const powerRandom = Math.random() * 100;
        let powerSource;
        
        if (isNigerianStation) {
          // Higher chance of backup power for Nigerian stations
          if (powerRandom < 70) powerSource = 'grid';
          else if (powerRandom < 85) powerSource = 'generator';
          else if (powerRandom < 95) powerSource = 'solar';
          else powerSource = 'none';
        } else {
          // Non-Nigerian stations mostly use grid power
          if (powerRandom < 95) powerSource = 'grid';
          else if (powerRandom < 98) powerSource = 'generator';
          else if (powerRandom < 99) powerSource = 'solar';
          else powerSource = 'none';
        }
        
        return {
          ...station,
          powerSource,
          lastStatusChange: new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000) // Random time in last 12 hours
        };
      });
      
      // Calculate statistics
      const totalStations = stationDetails.length || 1; // Avoid division by zero
      const gridPowered = stationDetails.filter(s => s.powerSource === 'grid').length;
      const generatorPowered = stationDetails.filter(s => s.powerSource === 'generator').length;
      const solarPowered = stationDetails.filter(s => s.powerSource === 'solar').length;
      const noPower = stationDetails.filter(s => s.powerSource === 'none').length;
      
      setGridData({
        gridPowered: Math.round((gridPowered / totalStations) * 100),
        generatorPowered: Math.round((generatorPowered / totalStations) * 100),
        solarPowered: Math.round((solarPowered / totalStations) * 100),
        noPower: Math.round((noPower / totalStations) * 100),
        stationDetails,
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error('Error fetching Nigerian grid data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on component mount
  useEffect(() => {
    fetchGridData();
    
    // Set up interval to refresh every 5 minutes
    const interval = setInterval(fetchGridData, 5 * 60 * 1000);
    
    // Clean up interval on unmount
    return () => clearInterval(interval);
  }, []);

  const getPowerSourceIcon = (source) => {
    switch (source) {
      case 'grid':
        return <GridIcon color="success" />;
      case 'generator':
        return <GeneratorIcon color="warning" />;
      case 'solar':
        return <SolarIcon color="info" />;
      case 'none':
        return <WarningIcon color="error" />;
      default:
        return <InfoIcon />;
    }
  };

  const getPowerSourceLabel = (source) => {
    switch (source) {
      case 'grid':
        return 'Grid Power';
      case 'generator':
        return 'Generator Backup';
      case 'solar':
        return 'Solar Backup';
      case 'none':
        return 'No Power';
      default:
        return 'Unknown';
    }
  };

  const getPowerSourceColor = (source) => {
    switch (source) {
      case 'grid':
        return 'success';
      case 'generator':
        return 'warning';
      case 'solar':
        return 'info';
      case 'none':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Card sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <BatteryIcon color="primary" sx={{ fontSize: 24, mr: 1 }} />
            <Typography variant="h6">
              Nigerian Power Grid Status
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Refresh power grid data">
              <IconButton onClick={fetchGridData} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Data is simulated for demonstration purposes">
              <IconButton>
                <InfoIcon color="action" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        
        {loading ? (
          <LinearProgress sx={{ my: 2 }} />
        ) : (
          <>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Grid Power
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={gridData.gridPowered} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5,
                      bgcolor: 'rgba(76, 175, 80, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'success.main'
                      }
                    }} 
                  />
                  <Typography variant="body2" color="text.secondary" align="right" sx={{ mt: 0.5 }}>
                    {gridData.gridPowered}%
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Generator Backup
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={gridData.generatorPowered} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5,
                      bgcolor: 'rgba(255, 152, 0, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'warning.main'
                      }
                    }} 
                  />
                  <Typography variant="body2" color="text.secondary" align="right" sx={{ mt: 0.5 }}>
                    {gridData.generatorPowered}%
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Solar Backup
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={gridData.solarPowered} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5,
                      bgcolor: 'rgba(3, 169, 244, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'info.main'
                      }
                    }} 
                  />
                  <Typography variant="body2" color="text.secondary" align="right" sx={{ mt: 0.5 }}>
                    {gridData.solarPowered}%
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={3}>
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    No Power
                  </Typography>
                  <LinearProgress 
                    variant="determinate" 
                    value={gridData.noPower} 
                    sx={{ 
                      height: 10, 
                      borderRadius: 5,
                      bgcolor: 'rgba(244, 67, 54, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'error.main'
                      }
                    }} 
                  />
                  <Typography variant="body2" color="text.secondary" align="right" sx={{ mt: 0.5 }}>
                    {gridData.noPower}%
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle2" gutterBottom>
              Nigerian Station Power Status
            </Typography>
            
            <Grid container spacing={1}>
              {gridData.stationDetails
                .filter(station => station.chargePointId.startsWith('NG') || (station.name && station.name.includes('Nigeria')))
                .map((station) => (
                <Grid item xs={12} sm={6} md={4} key={station.chargePointId}>
                  <Paper 
                    elevation={0} 
                    sx={{ 
                      p: 1, 
                      borderRadius: 1, 
                      border: '1px solid',
                      borderColor: 'divider',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {getPowerSourceIcon(station.powerSource)}
                      <Box sx={{ ml: 1 }}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                          {station.name || station.chargePointId}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Last change: {format(new Date(station.lastStatusChange), 'HH:mm')}
                        </Typography>
                      </Box>
                    </Box>
                    <Chip 
                      label={getPowerSourceLabel(station.powerSource)}
                      size="small"
                      color={getPowerSourceColor(station.powerSource)}
                    />
                  </Paper>
                </Grid>
              ))}
            </Grid>
            
            {gridData.lastUpdated && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'right' }}>
                Last updated: {format(new Date(gridData.lastUpdated), 'dd MMM yyyy HH:mm:ss')}
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default NigerianPowerGrid;
