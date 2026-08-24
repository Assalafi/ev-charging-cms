import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Drawer,
  FormControl, Grid, IconButton, InputAdornment, InputLabel, List, ListItemButton,
  ListItemText, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../services/api';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import { evChargingMarker, locationMarkerStatus } from '../../utils/mapMarkerIcons';
import FullscreenMap, { MapBounds } from '../../components/maps/FullscreenMap';

const EMPTY_FILTERS = {
  search: '',
  owner: 'all',
  availability: 'all',
  state: 'all',
  city: 'all',
  stationStatus: 'all'
};

const STATUS_LABELS = {
  online: 'Fully online',
  partial: 'Partially online',
  offline: 'Offline',
  empty: 'No stations'
};

const MARKER_COLORS = {
  online: '#2e7d32',
  partial: '#ed6c02',
  offline: '#d32f2f',
  empty: '#757575'
};

const selectMenuProps = { disablePortal: true, PaperProps: { sx: { maxHeight: 320 } } };

function FilterSelect({ label, value, onChange, children }) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={onChange} MenuProps={selectMenuProps}>
        {children}
      </Select>
    </FormControl>
  );
}

function StatusDot({ status }) {
  return (
    <Box
      component="span"
      sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: MARKER_COLORS[status], flex: '0 0 auto' }}
    />
  );
}

export default function AdminMonitorMap() {
  const [locations, setLocations] = useState([]);
  const [partners, setPartners] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadMonitor = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [locationResponse, partnerResponse] = await Promise.all([
        api.get('/admin/monitor/locations', { params: { partnerId: 'all', status: 'all' } }),
        api.get('/admin/partners?limit=100').catch(() => ({ data: { partners: [] } }))
      ]);
      setLocations(locationResponse.data.locations || []);
      setPartners(partnerResponse.data.partners || []);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load monitor data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitor();
  }, [loadMonitor]);

  const ownerOptions = useMemo(() => {
    const values = new Map();
    partners.forEach(partner => values.set(String(partner.id), partner.name || partner.businessName));
    locations.forEach(location => {
      if (location.partner?.id) {
        values.set(String(location.partner.id), location.partner.name || location.partner.businessName);
      }
    });
    return [...values.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [locations, partners]);

  const states = useMemo(() => [...new Set(locations.map(location => location.state).filter(Boolean))].sort(), [locations]);
  const cities = useMemo(() => [...new Set(locations
    .filter(location => filters.state === 'all' || location.state === filters.state)
    .map(location => location.city).filter(Boolean))].sort(), [filters.state, locations]);
  const stationStatuses = useMemo(() => [...new Set(locations
    .flatMap(location => location.stations || []).map(station => station.status).filter(Boolean))].sort(), [locations]);

  const filteredLocations = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return locations.filter(location => {
      const ownerMatches = filters.owner === 'all'
        || (filters.owner === 'main' && !location.partnerId)
        || (filters.owner === 'partner' && Boolean(location.partnerId))
        || (filters.owner.startsWith('partner:') && String(location.partnerId) === filters.owner.slice(8));
      const statusMatches = filters.availability === 'all'
        || locationMarkerStatus(location) === filters.availability;
      const stationMatches = filters.stationStatus === 'all'
        || (location.stations || []).some(station => station.status === filters.stationStatus);
      const searchText = [
        location.name, location.address, location.city, location.state,
        location.partner?.name, location.partner?.businessName,
        ...(location.stations || []).flatMap(station => [station.name, station.chargePointId])
      ].filter(Boolean).join(' ').toLowerCase();

      return ownerMatches
        && statusMatches
        && stationMatches
        && (filters.state === 'all' || location.state === filters.state)
        && (filters.city === 'all' || location.city === filters.city)
        && (!search || searchText.includes(search));
    });
  }, [filters, locations]);

  const mapped = useMemo(() => filteredLocations.filter(location =>
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
  ), [filteredLocations]);
  const selected = locations.find(location => location.id === selectedId) || null;
  const focused = filteredLocations.find(location => location.id === focusId) || null;
  const hasFilters = Object.entries(filters).some(([key, value]) =>
    key === 'search' ? Boolean(value.trim()) : value !== 'all'
  );

  const totals = useMemo(() => filteredLocations.reduce((result, location) => ({
    stations: result.stations + Number(location.stationCount || 0),
    online: result.online + Number(location.onlineStations || 0),
    energy: result.energy + Number(location.todayEnergyWh || 0),
    revenue: result.revenue + Number(location.todayGrossRevenue || 0)
  }), { stations: 0, online: 0, energy: 0, revenue: 0 }), [filteredLocations]);

  const updateFilter = (name, value) => {
    setFilters(current => ({
      ...current,
      [name]: value,
      ...(name === 'state' && { city: 'all' })
    }));
    setFocusId(null);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setFocusId(null);
  };

  const selectLocation = location => {
    setSelectedId(location.id);
    setFocusId(location.id);
  };

  const filterOverlay = (
    <Paper
      elevation={5}
      sx={{
        position: 'absolute', zIndex: 1200, p: 1.5,
        top: { xs: 64, sm: 12 }, left: { xs: 12, sm: 58 },
        width: { xs: 'calc(100% - 24px)', sm: 500 }, maxHeight: { xs: 'calc(100% - 76px)', sm: 'none' },
        overflowY: 'auto', bgcolor: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)'
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Stack direction="row" alignItems="center" gap={1}>
          <TuneIcon color="primary" fontSize="small" />
          <Typography variant="subtitle2">Map filters</Typography>
          <Chip size="small" label={`${filteredLocations.length} of ${locations.length}`} />
        </Stack>
        <Button size="small" startIcon={<RestartAltIcon />} disabled={!hasFilters} onClick={resetFilters}>Reset</Button>
      </Stack>
      <TextField
        size="small" fullWidth placeholder="Search locations, owners or stations"
        value={filters.search} onChange={event => updateFilter('search', event.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 1 }}
      />
      <Grid container spacing={1}>
        <Grid item xs={6}>
          <FilterSelect label="Owner" value={filters.owner} onChange={event => updateFilter('owner', event.target.value)}>
            <MenuItem value="all">All owners</MenuItem>
            <MenuItem value="main">Main company</MenuItem>
            <MenuItem value="partner">All partners</MenuItem>
            {ownerOptions.map(([id, name]) => <MenuItem key={id} value={`partner:${id}`}>{name}</MenuItem>)}
          </FilterSelect>
        </Grid>
        <Grid item xs={6}>
          <FilterSelect label="Availability" value={filters.availability} onChange={event => updateFilter('availability', event.target.value)}>
            <MenuItem value="all">All availability</MenuItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </FilterSelect>
        </Grid>
        <Grid item xs={6}>
          <FilterSelect label="State" value={filters.state} onChange={event => updateFilter('state', event.target.value)}>
            <MenuItem value="all">All states</MenuItem>
            {states.map(state => <MenuItem key={state} value={state}>{state}</MenuItem>)}
          </FilterSelect>
        </Grid>
        <Grid item xs={6}>
          <FilterSelect label="City" value={filters.city} onChange={event => updateFilter('city', event.target.value)}>
            <MenuItem value="all">All cities</MenuItem>
            {cities.map(city => <MenuItem key={city} value={city}>{city}</MenuItem>)}
          </FilterSelect>
        </Grid>
        <Grid item xs={12}>
          <FilterSelect label="Station status" value={filters.stationStatus} onChange={event => updateFilter('stationStatus', event.target.value)}>
            <MenuItem value="all">All station statuses</MenuItem>
            {stationStatuses.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}
          </FilterSelect>
        </Grid>
      </Grid>
    </Paper>
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="h4">Network Monitor Map</Typography>
          <Typography color="text.secondary">
            Live visibility across main-company and partner charging locations.
            {updatedAt && ` Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`}
          </Typography>
        </Box>
        <Tooltip title="Refresh monitor data">
          <span><IconButton onClick={loadMonitor} disabled={loading} color="primary"><RefreshIcon /></IconButton></span>
        </Tooltip>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={loadMonitor}>Retry</Button>}>{error}</Alert>}

      <Grid container spacing={2} mb={3}>
        {[
          ['Locations', `${filteredLocations.length}${hasFilters ? ` / ${locations.length}` : ''}`],
          ['Stations', totals.stations],
          ['Online now', totals.online],
          ['Today energy', formatEnergy(totals.energy)],
          ['Today revenue', formatNaira(totals.revenue)]
        ].map(([label, value]) => <Grid item xs={6} sm={4} lg key={label}><Card sx={{ height: '100%' }}><CardContent>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h5">{value}</Typography>
        </CardContent></Card></Grid>)}
      </Grid>

      {loading ? (
        <Card><Box height={650} display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box></Card>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={9}>
            <Card sx={{ overflow: 'hidden' }}>
              <FullscreenMap height={{ xs: 560, md: 650 }} ariaLabel="Administrative charging network map" overlay={filterOverlay}>
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapBounds locations={mapped} focusLocation={focused} />
                {mapped.map(location => (
                  <Marker
                    key={location.id}
                    icon={evChargingMarker(location, location.ownerType)}
                    position={[Number(location.latitude), Number(location.longitude)]}
                    eventHandlers={{ click: () => selectLocation(location) }}
                  >
                    <Popup>
                      <strong>{location.name}</strong><br />
                      {location.partner?.name || 'Main Company'}<br />
                      {location.onlineStations}/{location.stationCount} stations online<br />
                      {formatEnergy(location.todayEnergyWh)} today
                    </Popup>
                  </Marker>
                ))}
              </FullscreenMap>
              {!mapped.length && (
                <Alert severity="info" sx={{ borderRadius: 0 }}>
                  {filteredLocations.length
                    ? 'The matching locations do not have valid map coordinates.'
                    : 'No locations match the current filters.'}
                </Alert>
              )}
            </Card>
          </Grid>

          <Grid item xs={12} lg={3}>
            <Card sx={{ height: { lg: 650 }, display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ pb: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">Matching locations</Typography>
                  <Chip size="small" color="primary" label={filteredLocations.length} />
                </Stack>
                <Typography variant="caption" color="text.secondary">Select a location to focus the map and inspect stations.</Typography>
              </CardContent>
              <Divider />
              <List disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
                {filteredLocations.map(location => {
                  const markerStatus = locationMarkerStatus(location);
                  return (
                    <ListItemButton key={location.id} selected={location.id === selectedId} onClick={() => selectLocation(location)}>
                      <Box mr={1.5} display="flex"><StatusDot status={markerStatus} /></Box>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={600} noWrap>{location.name}</Typography>}
                        secondary={
                          <Typography variant="caption" color="text.secondary" component="span">
                            {location.partner?.name || 'Main Company'} · {location.onlineStations}/{location.stationCount} online
                          </Typography>
                        }
                      />
                      {!Number.isFinite(Number(location.latitude)) && <LocationOnIcon color="disabled" fontSize="small" />}
                    </ListItemButton>
                  );
                })}
                {!filteredLocations.length && <Box p={3}><Typography variant="body2" color="text.secondary" textAlign="center">No matching locations</Typography></Box>}
              </List>
              <Divider />
              <Stack direction="row" flexWrap="wrap" gap={1.5} p={1.5}>
                {Object.entries(STATUS_LABELS).map(([status, label]) => (
                  <Stack key={status} direction="row" alignItems="center" gap={0.5}><StatusDot status={status} /><Typography variant="caption">{label}</Typography></Stack>
                ))}
              </Stack>
            </Card>
          </Grid>
        </Grid>
      )}

      <Drawer
        anchor="right" open={Boolean(selected)} onClose={() => setSelectedId(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 430 }, p: 3 } }}
      >
        {selected && <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
            <Box><Typography variant="h5">{selected.name}</Typography>
              <Typography color="text.secondary">{selected.partner?.name || 'Main Company'}</Typography></Box>
            <Chip size="small" label={STATUS_LABELS[locationMarkerStatus(selected)]} />
          </Stack>
          <Typography variant="body2" mb={3}>{[selected.address, selected.city, selected.state].filter(Boolean).join(', ')}</Typography>
          <Grid container spacing={2} mb={3}>
            {[
              ['Stations', selected.stationCount], ['Online', selected.onlineStations],
              ['Today sessions', selected.todayTransactions], ['Energy', formatEnergy(selected.todayEnergyWh)],
              ['Gross revenue', formatNaira(selected.todayGrossRevenue)],
              ['Partner earning', formatNaira(selected.todayPartnerEarning)]
            ].map(([label, value]) => <Grid item xs={6} key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography><Typography>{value}</Typography>
            </Grid>)}
          </Grid>
          <Typography variant="subtitle2" mb={1}>Charging stations</Typography>
          <Stack gap={1}>
            {(selected.stations || []).map(station => <Card variant="outlined" key={station.chargePointId}>
              <CardContent><Stack direction="row" justifyContent="space-between" gap={1}>
                <Box minWidth={0}><Typography fontWeight={600} noWrap>{station.name || station.chargePointId}</Typography>
                  <Typography variant="caption">{station.connectorCount || 0} connectors · {station.chargePointId}</Typography></Box>
                <Chip size="small" label={station.status} color={statusColor(station.status)} />
              </Stack></CardContent>
            </Card>)}
            {!selected.stations?.length && <Alert severity="info">No charging stations are assigned to this location.</Alert>}
          </Stack>
        </Box>}
      </Drawer>
    </Box>
  );
}
