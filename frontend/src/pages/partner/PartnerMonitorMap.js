import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  FormControl, Grid, IconButton, InputAdornment, InputLabel, List, ListItemButton,
  ListItemText, MenuItem, Paper, Select, Stack, TextField, Tooltip, Typography
} from '@mui/material';
import EvStationIcon from '@mui/icons-material/EvStation';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import BoltIcon from '@mui/icons-material/Bolt';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import { evChargingMarker, locationMarkerStatus } from '../../utils/mapMarkerIcons';
import FullscreenMap, { MapBounds } from '../../components/maps/FullscreenMap';

const EMPTY_FILTERS = {
  search: '',
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

export default function PartnerMonitorMap() {
  const [locations, setLocations] = useState([]);
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
      const response = await partnerService.getLocations();
      const result = response.data.locations || [];
      setLocations(result);
      setSelectedId(current => result.some(location => location.id === current) ? current : result[0]?.id || null);
      setUpdatedAt(response.data.generatedAt ? new Date(response.data.generatedAt) : new Date());
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load live monitor data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitor();
  }, [loadMonitor]);

  const states = useMemo(() => [...new Set(locations.map(location => location.state).filter(Boolean))].sort(), [locations]);
  const cities = useMemo(() => [...new Set(locations
    .filter(location => filters.state === 'all' || location.state === filters.state)
    .map(location => location.city).filter(Boolean))].sort(), [filters.state, locations]);
  const stationStatuses = useMemo(() => [...new Set(locations
    .flatMap(location => location.stations || []).map(station => station.status).filter(Boolean))].sort(), [locations]);

  const filteredLocations = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return locations.filter(location => {
      const searchText = [
        location.name, location.address, location.city, location.state,
        ...(location.stations || []).flatMap(station => [station.name, station.chargePointId])
      ].filter(Boolean).join(' ').toLowerCase();

      return (filters.availability === 'all' || locationMarkerStatus(location) === filters.availability)
        && (filters.state === 'all' || location.state === filters.state)
        && (filters.city === 'all' || location.city === filters.city)
        && (filters.stationStatus === 'all'
          || (location.stations || []).some(station => station.status === filters.stationStatus))
        && (!search || searchText.includes(search));
    });
  }, [filters, locations]);

  useEffect(() => {
    if (!filteredLocations.some(location => location.id === selectedId)) {
      setSelectedId(filteredLocations[0]?.id || null);
    }
  }, [filteredLocations, selectedId]);

  const selected = filteredLocations.find(location => location.id === selectedId) || filteredLocations[0] || null;
  const focused = filteredLocations.find(location => location.id === focusId) || null;
  const mapped = useMemo(() => filteredLocations.filter(location =>
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
  ), [filteredLocations]);
  const hasFilters = Object.entries(filters).some(([key, value]) =>
    key === 'search' ? Boolean(value.trim()) : value !== 'all'
  );

  const totals = useMemo(() => filteredLocations.reduce((result, location) => ({
    stations: result.stations + Number(location.stationCount || 0),
    online: result.online + Number(location.onlineStations || 0),
    energy: result.energy + Number(location.todayEnergyWh || 0),
    earnings: result.earnings + Number(location.todayPartnerEarning || 0)
  }), { stations: 0, online: 0, energy: 0, earnings: 0 }), [filteredLocations]);

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
        size="small" fullWidth placeholder="Search locations or charging stations"
        value={filters.search} onChange={event => updateFilter('search', event.target.value)}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 1 }}
      />
      <Grid container spacing={1}>
        <Grid item xs={6}>
          <FilterSelect label="Availability" value={filters.availability} onChange={event => updateFilter('availability', event.target.value)}>
            <MenuItem value="all">All availability</MenuItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </FilterSelect>
        </Grid>
        <Grid item xs={6}>
          <FilterSelect label="Station status" value={filters.stationStatus} onChange={event => updateFilter('stationStatus', event.target.value)}>
            <MenuItem value="all">All station statuses</MenuItem>
            {stationStatuses.map(status => <MenuItem key={status} value={status}>{status}</MenuItem>)}
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
      </Grid>
    </Paper>
  );

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
        <Box>
          <Typography variant="h4">Network Monitor</Typography>
          <Typography color="text.secondary">
            Live availability and today's site performance.
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
          ['Locations', `${filteredLocations.length}${hasFilters ? ` / ${locations.length}` : ''}`, <LocationOnIcon color="primary" />],
          ['Stations', totals.stations, <EvStationIcon color="primary" />],
          ['Online now', totals.online, <EvStationIcon color="success" />],
          ['Today energy', formatEnergy(totals.energy), <BoltIcon color="info" />],
          ['Today earning', formatNaira(totals.earnings), <BoltIcon color="success" />]
        ].map(([label, value, cardIcon]) => (
          <Grid item xs={6} sm={4} lg key={label}><Card sx={{ height: '100%' }}><CardContent>
            <Stack direction="row" justifyContent="space-between" gap={1}>
              <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5">{value}</Typography></Box>
              {cardIcon}
            </Stack>
          </CardContent></Card></Grid>
        ))}
      </Grid>

      {loading ? (
        <Card><Box height={650} display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box></Card>
      ) : (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={8}>
            <Card sx={{ overflow: 'hidden' }}>
              <FullscreenMap height={{ xs: 560, md: 650 }} ariaLabel="Partner charging network map" overlay={filterOverlay}>
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapBounds locations={mapped} focusLocation={focused} />
                {mapped.map(location => (
                  <Marker
                    key={location.id}
                    position={[Number(location.latitude), Number(location.longitude)]}
                    icon={evChargingMarker(location)}
                    eventHandlers={{ click: () => selectLocation(location) }}
                  >
                    <Popup>
                      <strong>{location.name}</strong><br />
                      {location.onlineStations}/{location.stationCount} stations online<br />
                      {formatEnergy(location.todayEnergyWh)} today<br />
                      {formatNaira(location.todayPartnerEarning)} earning
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

          <Grid item xs={12} lg={4}>
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ pb: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="h6">Matching locations</Typography>
                  <Chip size="small" color="primary" label={filteredLocations.length} />
                </Stack>
                <Typography variant="caption" color="text.secondary">Select a location to focus the map.</Typography>
              </CardContent>
              <Divider />
              <List disablePadding sx={{ maxHeight: 245, overflowY: 'auto' }}>
                {filteredLocations.map(location => {
                  const markerStatus = locationMarkerStatus(location);
                  return (
                    <ListItemButton key={location.id} selected={location.id === selectedId} onClick={() => selectLocation(location)}>
                      <Box mr={1.5} display="flex"><StatusDot status={markerStatus} /></Box>
                      <ListItemText
                        primary={<Typography variant="body2" fontWeight={600} noWrap>{location.name}</Typography>}
                        secondary={
                          <Typography variant="caption" color="text.secondary" component="span">
                            {location.onlineStations}/{location.stationCount} online · {formatEnergy(location.todayEnergyWh)} · {formatNaira(location.todayPartnerEarning)}
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

            {selected && <Card><CardContent>
              <Stack direction="row" justifyContent="space-between" gap={1} mb={0.5}>
                <Typography variant="h6">{selected.name}</Typography>
                <Chip size="small" label={STATUS_LABELS[locationMarkerStatus(selected)]} />
              </Stack>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {[selected.address, selected.city, selected.state].filter(Boolean).join(', ')}
              </Typography>
              <Stack gap={1} sx={{ maxHeight: 285, overflowY: 'auto', pr: 0.5 }}>
                {(selected.stations || []).map(station => (
                  <Box key={station.chargePointId} p={1.5} border={1} borderColor="divider" borderRadius={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                      <Typography variant="body2" fontWeight={600} noWrap>{station.name || station.chargePointId}</Typography>
                      <Chip size="small" label={station.status} color={statusColor(station.status)} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {station.todayTransactions} sessions · {formatEnergy(station.todayEnergyWh)}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Earning {formatNaira(station.todayPartnerEarning)}
                    </Typography>
                  </Box>
                ))}
                {!selected.stations?.length && <Alert severity="info">No charging stations are assigned to this location.</Alert>}
              </Stack>
            </CardContent></Card>}
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
