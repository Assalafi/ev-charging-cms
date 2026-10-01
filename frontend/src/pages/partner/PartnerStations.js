import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid,
  InputAdornment, MenuItem, Select, Stack, TextField, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import EvStationIcon from '@mui/icons-material/EvStation';
import BoltIcon from '@mui/icons-material/Bolt';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

const EMPTY_FILTERS = { search: '', locationId: '', status: '', availability: 'all', sort: 'name' };

export default function PartnerStations() {
  const [stations, setStations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true); setError('');
      const [stationResponse, locationResponse] = await Promise.all([partnerService.getStations(), partnerService.getLocations()]);
      setStations(stationResponse.data.stations || []);
      setLocations(locationResponse.data.locations || []);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load your stations.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusOptions = useMemo(() => [...new Set(stations.map(station => station.status).filter(Boolean))].sort(), [stations]);
  const visible = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return stations.filter(station => {
      const location = station.location || {};
      const text = [station.name, station.chargePointId, location.name, location.city, location.state].filter(Boolean).join(' ').toLowerCase();
      const availability = station.isOnline ? 'online' : 'offline';
      return (!query || text.includes(query))
        && (!filters.locationId || String(location.id || station.locationId) === String(filters.locationId))
        && (!filters.status || station.status === filters.status)
        && (filters.availability === 'all' || availability === filters.availability);
    }).sort((a, b) => {
      if (filters.sort === 'energy') return (Number(b.todayEnergyWh) || 0) - (Number(a.todayEnergyWh) || 0);
      if (filters.sort === 'earning') return (Number(b.todayPartnerEarning) || 0) - (Number(a.todayPartnerEarning) || 0);
      return String(a.name || a.chargePointId).localeCompare(String(b.name || b.chargePointId));
    });
  }, [filters, stations]);

  const online = stations.filter(station => station.isOnline).length;
  const charging = stations.filter(station => station.status === 'Charging').length;
  const faulted = stations.filter(station => ['Faulted', 'Unavailable'].includes(station.status)).length;
  const update = (name, value) => setFilters(current => ({ ...current, [name]: value }));

  if (loading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;
  return (
    <Box>
      <PageHeader eyebrow="My network" title="Charging stations" description="Live operational status, energy and earnings across your assigned chargers." live actions={[<Button key="refresh" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>]} />
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={load}>Retry</Button>}>{error}</Alert>}
      <Grid container spacing={2} mb={3}>{[
        ['Total stations', stations.length, <EvStationIcon color="primary" />], ['Online', online, <EvStationIcon color="success" />], ['Charging now', charging, <BoltIcon color="info" />], ['Faulted / unavailable', faulted, <EvStationIcon color="error" />]
      ].map(([label, value, icon]) => <Grid item xs={6} md={3} key={label}><Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h4" sx={{ mt: .5 }}>{value}</Typography></Box>{icon}</Stack></CardContent></Card></Grid>)}</Grid>
      <Card sx={{ mb: 2.5, border: '1px solid', borderColor: 'divider' }}><CardContent><Grid container spacing={1.5} alignItems="center">
        <Grid item xs={12} md={4}><TextField fullWidth size="small" placeholder="Search station, location or charge point" value={filters.search} onChange={event => update('search', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} /></Grid>
        <Grid item xs={6} md={2}><Select size="small" fullWidth displayEmpty value={filters.locationId} onChange={event => update('locationId', event.target.value)}><MenuItem value="">All locations</MenuItem>{locations.map(location => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}</Select></Grid>
        <Grid item xs={6} md={2}><Select size="small" fullWidth displayEmpty value={filters.status} onChange={event => update('status', event.target.value)}><MenuItem value="">All statuses</MenuItem>{statusOptions.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}</Select></Grid>
        <Grid item xs={6} md={2}><Select size="small" fullWidth value={filters.availability} onChange={event => update('availability', event.target.value)}><MenuItem value="all">All connectivity</MenuItem><MenuItem value="online">Online now</MenuItem><MenuItem value="offline">Offline</MenuItem></Select></Grid>
        <Grid item xs={6} md={2}><Select size="small" fullWidth value={filters.sort} onChange={event => update('sort', event.target.value)}><MenuItem value="name">Sort by name</MenuItem><MenuItem value="energy">Most energy</MenuItem><MenuItem value="earning">Top earning</MenuItem></Select></Grid>
      </Grid></CardContent></Card>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{visible.length} station{visible.length === 1 ? '' : 's'} shown</Typography>
      <Grid container spacing={2}>{visible.map(station => <Grid item xs={12} md={6} lg={4} key={station.chargePointId}><Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider', transition: 'transform .18s ease, box-shadow .18s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 5 } }}><CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box minWidth={0}><Typography variant="h6" noWrap>{station.name || station.chargePointId}</Typography><Typography variant="body2" color="text.secondary" noWrap><LocationOnIcon sx={{ fontSize: 15, verticalAlign: 'middle', mr: .3 }} />{station.location?.name || 'Assigned location'} - {station.location?.city || station.location?.state || '-'}</Typography></Box><Chip size="small" label={station.status} color={statusColor(station.status)} /></Stack>
        <Grid container spacing={1.5} mt={1}>{[['Connectors', station.connectorCount || station.connectors?.length || 0], ['Today sessions', station.todayTransactions || 0], ['Today energy', formatEnergy(station.todayEnergyWh)], ['Your earning', formatNaira(station.todayPartnerEarning)]].map(([label, value]) => <Grid item xs={6} key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={label === 'Your earning' ? 700 : 500} color={label === 'Your earning' ? 'success.dark' : 'text.primary'}>{value}</Typography></Grid>)}</Grid>
        {station.errorCode && station.errorCode !== 'NoError' && <Alert severity="warning" sx={{ mt: 2 }}>{station.errorCode}</Alert>}
      </CardContent></Card></Grid>)}</Grid>
      {!visible.length && <Alert severity="info" sx={{ mt: 2 }}>No stations match the selected filters.</Alert>}
    </Box>
  );
}
