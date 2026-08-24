import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress, Grid,
  MenuItem, Select, Stack, Typography
} from '@mui/material';
import EvStationIcon from '@mui/icons-material/EvStation';
import BoltIcon from '@mui/icons-material/Bolt';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';

export default function PartnerStations() {
  const [stations, setStations] = useState([]);
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setError('');
      const response = await partnerService.getStations();
      setStations(response.data.stations || []);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load your stations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    status === 'all' ? stations : stations.filter(station => station.status === status),
  [stations, status]);
  const online = stations.filter(station => station.isOnline).length;
  const charging = stations.filter(station => station.status === 'Charging').length;

  if (loading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={3}>
        <Box>
          <Typography variant="h4">Stations</Typography>
          <Typography color="text.secondary">Live operational status for your charging network.</Typography>
        </Box>
        <Select size="small" value={status} onChange={event => setStatus(event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="all">All statuses</MenuItem>
          {[...new Set(stations.map(station => station.status))].map(value =>
            <MenuItem key={value} value={value}>{value}</MenuItem>
          )}
        </Select>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={2} mb={3}>
        {[
          ['Total stations', stations.length, <EvStationIcon />],
          ['Online', online, <EvStationIcon color="success" />],
          ['Charging now', charging, <BoltIcon color="info" />],
          ['Offline / unavailable', stations.length - online, <EvStationIcon color="disabled" />]
        ].map(([label, value, icon]) => (
          <Grid item xs={6} md={3} key={label}>
            <Card><CardContent><Stack direction="row" justifyContent="space-between">
              <Box><Typography color="text.secondary" variant="body2">{label}</Typography>
                <Typography variant="h4">{value}</Typography></Box>{icon}
            </Stack></CardContent></Card>
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2}>
        {filtered.map(station => (
          <Grid item xs={12} md={6} lg={4} key={station.chargePointId}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="start">
                  <Box>
                    <Typography variant="h6">{station.name || station.chargePointId}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {station.location?.name} · {station.location?.city}, {station.location?.state}
                    </Typography>
                  </Box>
                  <Chip size="small" label={station.status} color={statusColor(station.status)} />
                </Stack>
                <Grid container spacing={2} mt={1}>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Connectors</Typography>
                    <Typography>{station.connectorCount || station.connectors?.length || 0}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Today sessions</Typography>
                    <Typography>{station.todayTransactions || 0}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Today energy</Typography>
                    <Typography>{formatEnergy(station.todayEnergyWh)}</Typography></Grid>
                  <Grid item xs={6}><Typography variant="caption" color="text.secondary">Today earning</Typography>
                    <Typography>{formatNaira(station.todayPartnerEarning)}</Typography></Grid>
                </Grid>
                {station.errorCode && station.errorCode !== 'NoError' &&
                  <Alert severity="warning" sx={{ mt: 2 }}>{station.errorCode}</Alert>}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      {!filtered.length && <Alert severity="info">No stations match this filter.</Alert>}
    </Box>
  );
}
