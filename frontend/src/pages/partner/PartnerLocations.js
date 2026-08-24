import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid,
  LinearProgress, Stack, Typography
} from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';

export default function PartnerLocations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    partnerService.getLocations()
      .then(response => setLocations(response.data.locations || []))
      .catch(requestError => setError(requestError.serverMessage || 'Could not load locations.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h4">Locations</Typography>
      <Typography color="text.secondary" mb={3}>Assigned sites, availability and today’s performance.</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={3}>
        {locations.map(location => {
          const availability = location.stationCount
            ? Math.round((location.onlineStations / location.stationCount) * 100)
            : 0;
          return (
            <Grid item xs={12} md={6} key={location.id}>
              <Card>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="start">
                    <Box>
                      <Typography variant="h6"><LocationOnIcon fontSize="small" /> {location.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[location.address, location.city, location.state].filter(Boolean).join(', ')}
                      </Typography>
                    </Box>
                    <Chip label={`${location.onlineStations}/${location.stationCount} online`}
                      color={availability === 100 ? 'success' : availability > 0 ? 'warning' : 'default'} size="small" />
                  </Stack>
                  <Box mt={2}><LinearProgress variant="determinate" value={availability} color={availability ? 'success' : 'inherit'} /></Box>
                  <Grid container spacing={2} mt={1}>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Today energy</Typography>
                      <Typography>{formatEnergy(location.todayEnergyWh)}</Typography></Grid>
                    <Grid item xs={6}><Typography variant="caption" color="text.secondary">Today earning</Typography>
                      <Typography>{formatNaira(location.todayPartnerEarning)}</Typography></Grid>
                  </Grid>
                  <Stack direction="row" gap={1} flexWrap="wrap" mt={2}>
                    {(location.stations || []).map(station =>
                      <Chip key={station.chargePointId} size="small" variant="outlined"
                        color={statusColor(station.status)} label={`${station.name || station.chargePointId}: ${station.status}`} />
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>
      {!locations.length && <Alert severity="info">No locations are assigned to your partner account.</Alert>}
    </Box>
  );
}
