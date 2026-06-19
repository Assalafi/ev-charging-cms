import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Chip,
  LinearProgress,
  Tooltip,
  IconButton
} from '@mui/material';
import { Warning as WarningIcon, Info as InfoIcon, Check as CheckIcon } from '@mui/icons-material';

/**
 * Component to monitor power grid stability across charging stations
 */
const PowerGridMonitor = () => {
  // State for grid status data
  const [gridData, setGridData] = useState({
    stability: 72,
    frequency: 49.8,
    voltage: 218,
    regions: [
      { id: 1, name: 'Region 1', status: 'Stable', value: 82 },
      { id: 2, name: 'Region 2', status: 'Unstable', value: 48 },
      { id: 3, name: 'Region 3', status: 'Stable', value: 76 },
      { id: 4, name: 'Region 4', status: 'Warning', value: 65 }
    ],
    lastUpdate: new Date()
  });
  
  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate grid fluctuations
      setGridData(prev => {
        // Generate random fluctuations
        const stabilityChange = Math.random() * 6 - 3; // -3 to +3
        const frequencyChange = (Math.random() * 0.4 - 0.2) / 10; // -0.02 to +0.02
        const voltageChange = Math.random() * 6 - 3; // -3 to +3
        
        // Calculate new values
        const newStability = Math.max(40, Math.min(95, prev.stability + stabilityChange));
        const newFrequency = Math.max(49.5, Math.min(50.5, prev.frequency + frequencyChange));
        const newVoltage = Math.max(205, Math.min(235, prev.voltage + voltageChange));
        
        // Update region values
        const updatedRegions = prev.regions.map(region => {
          const regionChange = Math.random() * 8 - 4; // -4 to +4
          const newValue = Math.max(30, Math.min(95, region.value + regionChange));
          
          // Update status based on new value
          let newStatus = 'Stable';
          if (newValue < 50) newStatus = 'Unstable';
          else if (newValue < 65) newStatus = 'Warning';
          
          return {
            ...region,
            value: newValue,
            status: newStatus
          };
        });
        
        return {
          ...prev,
          stability: newStability,
          frequency: newFrequency,
          voltage: newVoltage,
          regions: updatedRegions,
          lastUpdate: new Date()
        };
      });
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Get color for stability value
  const getStabilityColor = (value) => {
    if (value >= 75) return 'success';
    if (value >= 60) return 'warning';
    return 'error';
  };
  
  // Get icon for status
  const getStatusIcon = (status) => {
    switch (status) {
      case 'Stable': return <CheckIcon color="success" />;
      case 'Warning': return <WarningIcon color="warning" />;
      case 'Unstable': return <WarningIcon color="error" />;
      default: return <InfoIcon color="info" />;
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader 
        title={
          <Box display="flex" alignItems="center">
            <Typography variant="h6">Power Grid Stability</Typography>
            <Tooltip title="Monitor the power grid stability across all charging stations">
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
        subheader={`Last updated: ${gridData.lastUpdate.toLocaleTimeString()}`}
      />
      <CardContent>
        <Grid container spacing={3}>
          {/* Overall stability indicator */}
          <Grid item xs={12} md={4}>
            <Box sx={{ textAlign: 'center', mb: 2 }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Overall Grid Stability
              </Typography>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress 
                  value={gridData.stability} 
                  color={getStabilityColor(gridData.stability)} 
                  size={100} 
                  thickness={5}
                />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="h5" component="div" color={getStabilityColor(gridData.stability)}>
                    {Math.round(gridData.stability)}%
                  </Typography>
                </Box>
              </Box>
            </Box>
            
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Frequency
                  </Typography>
                  <Typography variant="h6" align="center">
                    {gridData.frequency.toFixed(1)} Hz
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary" align="center">
                    Voltage
                  </Typography>
                  <Typography variant="h6" align="center">
                    {Math.round(gridData.voltage)} V
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          </Grid>
          
          {/* Regional indicators */}
          <Grid item xs={12} md={8}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Regional Status
            </Typography>
            <Grid container spacing={2}>
              {gridData.regions.map((region) => (
                <Grid item xs={6} key={region.id}>
                  <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box display="flex" alignItems="center">
                      {getStatusIcon(region.status)}
                      <Typography variant="body2" sx={{ ml: 1 }}>
                        {region.name}
                      </Typography>
                    </Box>
                    <Chip 
                      label={region.status} 
                      color={
                        region.status === 'Stable' ? 'success' : 
                        region.status === 'Warning' ? 'warning' : 'error'
                      }
                      size="small"
                    />
                  </Box>
                  <LinearProgress 
                    variant="determinate" 
                    value={region.value} 
                    color={
                      region.status === 'Stable' ? 'success' : 
                      region.status === 'Warning' ? 'warning' : 'error'
                    }
                    sx={{ height: 8, borderRadius: 5 }}
                  />
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
        
        <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Power grid stability is crucial for reliable charging operations. 
            Charging stations will automatically switch to backup power sources 
            during grid instability to ensure service continuity.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

// Circular progress component for the grid stability indicator
const CircularProgress = ({ value, color, size, thickness }) => {
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size
      }}
    >
      <Box
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          position: 'absolute',
          border: `${thickness}px solid #f0f0f0`
        }}
      />
      <Box
        sx={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          position: 'absolute',
          borderStyle: 'solid',
          borderWidth: thickness,
          borderColor: 'transparent',
          borderTopColor: color === 'success' ? 'green' : color === 'warning' ? 'orange' : 'red',
          borderRightColor: value > 25 ? (color === 'success' ? 'green' : color === 'warning' ? 'orange' : 'red') : 'transparent',
          borderBottomColor: value > 50 ? (color === 'success' ? 'green' : color === 'warning' ? 'orange' : 'red') : 'transparent',
          borderLeftColor: value > 75 ? (color === 'success' ? 'green' : color === 'warning' ? 'orange' : 'red') : 'transparent',
          transform: 'rotate(-45deg)',
          transition: 'all 0.5s ease'
        }}
      />
    </Box>
  );
};

export default PowerGridMonitor;
