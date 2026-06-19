import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Box,
  LinearProgress,
  Grid,
  Chip,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  WbSunny as SolarIcon,
  Power as GridIcon,
  Settings as GeneratorIcon,
  Info as InfoIcon
} from '@mui/icons-material';

/**
 * Component that displays Nigerian power distribution for EV charging stations
 * Shows the breakdown of power sources (Grid, Generator, Solar) used by the Nigerian charging network
 */
const NigerianPowerDistribution = () => {
  // State for power distribution data
  const [powerData, setPowerData] = useState({
    grid: 42,
    generator: 35,
    solar: 23,
    lastUpdated: new Date()
  });
  
  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Fluctuate values slightly to simulate real-time changes
      setPowerData(prev => {
        // Generate random fluctuations
        const gridFluctuation = Math.random() * 5 - 2.5; // -2.5 to 2.5
        const generatorFluctuation = Math.random() * 5 - 2.5;
        
        // Calculate new values ensuring they don't go below 10% or above reasonable limits
        let newGrid = Math.max(10, Math.min(60, prev.grid + gridFluctuation));
        let newGenerator = Math.max(10, Math.min(60, prev.generator + generatorFluctuation));
        let newSolar = Math.max(10, 100 - newGrid - newGenerator);
        
        // If calculations result in total > 100%, normalize
        const total = newGrid + newGenerator + newSolar;
        if (total > 100) {
          const scale = 100 / total;
          newGrid *= scale;
          newGenerator *= scale;
          newSolar *= scale;
        }
        
        return {
          grid: Math.round(newGrid),
          generator: Math.round(newGenerator),
          solar: Math.round(newSolar),
          lastUpdated: new Date()
        };
      });
    }, 8000); // Update every 8 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  // Power source details
  const powerSources = [
    {
      name: 'National Grid',
      value: powerData.grid,
      icon: <GridIcon />,
      color: '#2196f3',
      tooltip: 'Power from the Nigerian national electricity grid',
      status: powerData.grid > 30 ? 'Stable' : 'Unstable'
    },
    {
      name: 'Generators',
      value: powerData.generator,
      icon: <GeneratorIcon />,
      color: '#ff9800',
      tooltip: 'Power from diesel generators at charging stations',
      status: powerData.generator > 20 ? 'Active' : 'Backup'
    },
    {
      name: 'Solar',
      value: powerData.solar,
      icon: <SolarIcon />,
      color: '#4caf50',
      tooltip: 'Power from solar installations at Nigerian charging stations',
      status: powerData.solar > 15 ? 'Optimal' : 'Limited'
    }
  ];

  return (
    <Card>
      <CardHeader 
        title={
          <Box display="flex" alignItems="center">
            <Typography variant="h6" component="div">Nigerian Power Distribution</Typography>
            <Tooltip title="Shows real-time distribution of power sources across Nigerian EV charging stations">
              <IconButton size="small">
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
        subheader={`Last updated: ${powerData.lastUpdated.toLocaleTimeString()}`}
      />
      <CardContent>
        <Grid container spacing={2}>
          {powerSources.map((source, index) => (
            <Grid item xs={12} key={index}>
              <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box display="flex" alignItems="center">
                  <Box sx={{ color: source.color, mr: 1, display: 'flex', alignItems: 'center' }}>
                    {source.icon}
                  </Box>
                  <Typography variant="body2" color="textSecondary">
                    {source.name}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center">
                  <Typography variant="body2" fontWeight="bold" sx={{ mr: 1 }}>
                    {source.value}%
                  </Typography>
                  <Tooltip title={source.tooltip}>
                    <Chip 
                      label={source.status} 
                      size="small"
                      color={
                        source.status === 'Stable' || source.status === 'Active' || source.status === 'Optimal' 
                          ? 'success' 
                          : 'warning'
                      }
                    />
                  </Tooltip>
                </Box>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={source.value} 
                sx={{ 
                  height: 8, 
                  borderRadius: 5,
                  backgroundColor: `${source.color}22`,
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: source.color,
                  }
                }}
              />
            </Grid>
          ))}
        </Grid>
        
        <Box sx={{ mt: 2, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="caption" color="textSecondary">
            Nigerian EV stations rely on multiple power sources due to grid instability. 
            This helps ensure continuous charging availability across the country.
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default NigerianPowerDistribution;
