import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip
} from '@mui/material';
import {
  EvStation as EvStationIcon,
  Circle as CircleIcon
} from '@mui/icons-material';
import api from '../../services/api';

const PartnerMonitorMap = () => {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await api.get('/partner/monitor/locations');
      if (response.data.success) {
        setLocations(response.data.locations || []);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        Loading...
      </Box>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return '#4caf50';
      case 'Preparing': return '#ff9800';
      case 'Charging': return '#2196f3';
      case 'Finishing': return '#9c27b0';
      case 'Reserved': return '#ff5722';
      case 'Unavailable': return '#9e9e9e';
      case 'Faulted': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Partner Monitor Map
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Your Locations
              </Typography>
              {locations.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No locations assigned to your partner account
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {locations.map((location) => (
                    <Grid item xs={12} md={6} lg={4} key={location.id}>
                      <Card sx={{ height: '100%' }}>
                        <CardContent>
                          <Typography variant="h6" gutterBottom>
                            {location.name}
                          </Typography>
                          <Typography variant="body2" color="textSecondary" gutterBottom>
                            {location.city}, {location.state}
                          </Typography>
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" gutterBottom>
                              Stations ({location.stations?.length || 0}):
                            </Typography>
                            {location.stations?.map((station) => (
                              <Box
                                key={station.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  mb: 1,
                                  p: 1,
                                  bgcolor: 'grey.50',
                                  borderRadius: 1
                                }}
                              >
                                <CircleIcon
                                  sx={{
                                    fontSize: 12,
                                    color: getStatusColor(station.status),
                                    mr: 1
                                  }}
                                />
                                <Typography variant="body2">
                                  {station.name || station.chargePointId}
                                </Typography>
                                <Chip
                                  label={station.status}
                                  size="small"
                                  sx={{ ml: 'auto' }}
                                />
                              </Box>
                            ))}
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default PartnerMonitorMap;
