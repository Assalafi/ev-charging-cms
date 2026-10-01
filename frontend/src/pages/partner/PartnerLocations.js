import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid,
  InputAdornment, LinearProgress, MenuItem, Select, Stack, TextField, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EvStationIcon from '@mui/icons-material/EvStation';
import BoltIcon from '@mui/icons-material/Bolt';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

const EMPTY_FILTERS = { search: '', state: '', availability: 'all', sort: 'name' };

export default function PartnerLocations() {
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try { setLoading(true); setError(''); const response = await partnerService.getLocations(); setLocations(response.data.locations || []); }
    catch (requestError) { setError(requestError.serverMessage || 'Could not load locations.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const states = useMemo(() => [...new Set(locations.map(location => location.state).filter(Boolean))].sort(), [locations]);
  const visible = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return locations.filter(location => {
      const availability = location.stationCount ? location.onlineStations / location.stationCount : 0;
      const text = [location.name, location.address, location.city, location.state].filter(Boolean).join(' ').toLowerCase();
      return (!query || text.includes(query)) && (!filters.state || location.state === filters.state)
        && (filters.availability === 'all' || (filters.availability === 'online' && availability === 1) || (filters.availability === 'partial' && availability > 0 && availability < 1) || (filters.availability === 'offline' && availability === 0));
    }).sort((a, b) => {
      if (filters.sort === 'earning') return (Number(b.todayPartnerEarning) || 0) - (Number(a.todayPartnerEarning) || 0);
      if (filters.sort === 'energy') return (Number(b.todayEnergyWh) || 0) - (Number(a.todayEnergyWh) || 0);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [filters, locations]);
  const totalStations = locations.reduce((sum, location) => sum + Number(location.stationCount || 0), 0);
  const onlineStations = locations.reduce((sum, location) => sum + Number(location.onlineStations || 0), 0);
  const update = (name, value) => setFilters(current => ({ ...current, [name]: value }));

  if (loading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;
  return (
    <Box>
      <PageHeader eyebrow="My network" title="Locations" description="Assigned sites, availability and your earning performance." live actions={[<Button key="refresh" variant="outlined" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>]} />
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={load}>Retry</Button>}>{error}</Alert>}
      <Grid container spacing={2} mb={3}>{[['Assigned locations', locations.length, <LocationOnIcon color="primary" />], ['Stations', totalStations, <EvStationIcon color="primary" />], ['Online now', onlineStations, <EvStationIcon color="success" />], ['Availability', `${totalStations ? Math.round((onlineStations / totalStations) * 100) : 0}%`, <BoltIcon color="info" />]].map(([label, value, icon]) => <Grid item xs={6} md={3} key={label}><Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ mt: .5 }}>{value}</Typography></Box>{icon}</Stack></CardContent></Card></Grid>)}</Grid>
      <Card sx={{ mb: 2.5, border: '1px solid', borderColor: 'divider' }}><CardContent><Grid container spacing={1.5} alignItems="center"><Grid item xs={12} md={5}><TextField fullWidth size="small" placeholder="Search location, city or address" value={filters.search} onChange={event => update('search', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} /></Grid><Grid item xs={6} md={2}><Select fullWidth size="small" displayEmpty value={filters.state} onChange={event => update('state', event.target.value)}><MenuItem value="">All states</MenuItem>{states.map(state => <MenuItem key={state} value={state}>{state}</MenuItem>)}</Select></Grid><Grid item xs={6} md={2}><Select fullWidth size="small" value={filters.availability} onChange={event => update('availability', event.target.value)}><MenuItem value="all">All availability</MenuItem><MenuItem value="online">Fully online</MenuItem><MenuItem value="partial">Partially online</MenuItem><MenuItem value="offline">Offline</MenuItem></Select></Grid><Grid item xs={6} md={2}><Select fullWidth size="small" value={filters.sort} onChange={event => update('sort', event.target.value)}><MenuItem value="name">Sort by name</MenuItem><MenuItem value="energy">Most energy</MenuItem><MenuItem value="earning">Top earning</MenuItem></Select></Grid><Grid item xs={6} md={1}><Button fullWidth onClick={() => setFilters(EMPTY_FILTERS)} disabled={!filters.search && !filters.state && filters.availability === 'all' && filters.sort === 'name'}>Reset</Button></Grid></Grid></CardContent></Card>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{visible.length} location{visible.length === 1 ? '' : 's'} shown</Typography>
      <Grid container spacing={2}>{visible.map(location => { const availability = location.stationCount ? Math.round((location.onlineStations / location.stationCount) * 100) : 0; return <Grid item xs={12} md={6} key={location.id}><Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider', transition: 'transform .18s ease, box-shadow .18s ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 5 } }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Box minWidth={0}><Typography variant="h6" noWrap><LocationOnIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: .5 }} />{location.name}</Typography><Typography variant="body2" color="text.secondary" noWrap>{[location.address, location.city, location.state].filter(Boolean).join(', ') || 'No address provided'}</Typography></Box><Chip label={`${location.onlineStations}/${location.stationCount} online`} color={availability === 100 ? 'success' : availability > 0 ? 'warning' : 'default'} size="small" /></Stack><Box mt={2}><Stack direction="row" justifyContent="space-between" mb={.5}><Typography variant="caption" color="text.secondary">Network availability</Typography><Typography variant="caption" fontWeight={700}>{availability}%</Typography></Stack><LinearProgress variant="determinate" value={availability} color={availability ? 'success' : 'inherit'} /></Box><Grid container spacing={2} mt={1}><Grid item xs={6}><Typography variant="caption" color="text.secondary">Today energy</Typography><Typography fontWeight={600}>{formatEnergy(location.todayEnergyWh)}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">Your earning</Typography><Typography fontWeight={700} color="success.dark">{formatNaira(location.todayPartnerEarning)}</Typography></Grid></Grid><Stack direction="row" gap={1} flexWrap="wrap" mt={2}>{(location.stations || []).map(station => <Chip key={station.chargePointId} size="small" variant="outlined" color={statusColor(station.status)} label={`${station.name || station.chargePointId}: ${station.status}`} />)}</Stack></CardContent></Card></Grid>; })}</Grid>
      {!visible.length && <Alert severity="info" sx={{ mt: 2 }}>No locations match the selected filters.</Alert>}
    </Box>
  );
}
