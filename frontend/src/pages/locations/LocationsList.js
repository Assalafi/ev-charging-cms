import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AddRounded,
  DeleteOutlineRounded,
  EditOutlined,
  EvStationRounded,
  ExpandMoreRounded,
  FilterAltOffRounded,
  LinkOffRounded,
  LinkRounded,
  LocationCityRounded,
  LocationOnRounded,
  MapRounded,
  PaymentsRounded,
  RefreshRounded,
  SearchRounded
} from '@mui/icons-material';
import api from '../../services/api';
import nigerianStates from '../../utils/nigerian-states';
import PageHeader from '../../components/ui/PageHeader';
import MetricCard from '../../components/ui/MetricCard';
import { useAuth } from '../../contexts/AuthContext';

const emptyLocation = {
  name: '', state: '', city: '', address: '', latitude: '', longitude: '',
  description: '', pricePerWh: 0.17, minimumCharge: 150
};

const messageFrom = (error, fallback) => error?.response?.data?.message || error?.serverMessage || fallback;
const naira = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value) || 0);

function stationTone(status) {
  if (status === 'Available') return 'success';
  if (status === 'Charging') return 'primary';
  if (status === 'Faulted') return 'error';
  return 'default';
}

function LocationsList() {
  const theme = useTheme();
  const compactDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('locations.create');
  const canUpdate = hasPermission('locations.update');

  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [stationFilter, setStationFilter] = useState('');
  const [expanded, setExpanded] = useState({});
  const [notice, setNotice] = useState({ open: false, severity: 'success', message: '' });

  const [editor, setEditor] = useState(undefined);
  const [formData, setFormData] = useState(emptyLocation);
  const [saving, setSaving] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState(null);
  const [assignLocation, setAssignLocation] = useState(null);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [allStations, setAllStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');

  const notify = (message, severity = 'success') => setNotice({ open: true, severity, message });

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/locations');
      setLocations(response.data.locations || []);
    } catch (error) {
      notify(messageFrom(error, 'Failed to load locations'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  const states = useMemo(() => [...new Set(locations.map(location => location.state).filter(Boolean))].sort(), [locations]);
  const totalStations = useMemo(() => locations.reduce((total, location) => total + Number(location.stationCount || location.stations?.length || 0), 0), [locations]);
  const activeStations = useMemo(() => locations.flatMap(location => location.stations || []).filter(station => ['Available', 'Charging'].includes(station.status)).length, [locations]);
  const averagePrice = useMemo(() => locations.length ? locations.reduce((sum, location) => sum + Number(location.pricePerWh || 0), 0) / locations.length : 0, [locations]);

  const filteredLocations = useMemo(() => locations.filter(location => {
    const haystack = [location.name, location.address, location.city, location.state].filter(Boolean).join(' ').toLowerCase();
    const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
    const matchesState = !stateFilter || location.state === stateFilter;
    const count = Number(location.stationCount || location.stations?.length || 0);
    const matchesStations = !stationFilter || (stationFilter === 'assigned' ? count > 0 : count === 0);
    return matchesSearch && matchesState && matchesStations;
  }), [locations, search, stateFilter, stationFilter]);

  const hasFilters = Boolean(search || stateFilter || stationFilter);
  const clearFilters = () => { setSearch(''); setStateFilter(''); setStationFilter(''); };

  const openCreate = () => { setEditor(null); setFormData(emptyLocation); };
  const openEdit = location => {
    setEditor(location);
    setFormData({
      name: location.name || '', state: location.state || '', city: location.city || '',
      address: location.address || '', latitude: location.latitude ?? '', longitude: location.longitude ?? '',
      description: location.description || '', pricePerWh: location.pricePerWh ?? 0.17,
      minimumCharge: location.minimumCharge ?? 150
    });
  };
  const closeEditor = () => { if (!saving) { setEditor(undefined); setFormData(emptyLocation); } };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.state || !formData.city.trim()) {
      notify('Location name, state and city are required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...formData,
        latitude: formData.latitude === '' ? null : Number(formData.latitude),
        longitude: formData.longitude === '' ? null : Number(formData.longitude),
        pricePerWh: Number(formData.pricePerWh),
        minimumCharge: Number(formData.minimumCharge)
      };
      if (editor) await api.put(`/admin/locations/${editor.id}`, payload);
      else await api.post('/admin/locations', payload);
      notify(editor ? 'Location updated successfully' : 'Location created successfully');
      setEditor(undefined);
      await fetchLocations();
    } catch (error) {
      notify(messageFrom(error, 'Failed to save location'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingLocation) return;
    setSaving(true);
    try {
      await api.delete(`/admin/locations/${deletingLocation.id}`);
      notify('Location deleted successfully');
      setDeletingLocation(null);
      await fetchLocations();
    } catch (error) {
      notify(messageFrom(error, 'Failed to delete location'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openAssign = async location => {
    setAssignLocation(location);
    setSelectedStationId('');
    setStationsLoading(true);
    try {
      const response = await api.get('/stations');
      setAllStations(response.data.stations || response.data.data || (Array.isArray(response.data) ? response.data : []));
    } catch (error) {
      notify(messageFrom(error, 'Failed to load stations'), 'error');
      setAssignLocation(null);
    } finally {
      setStationsLoading(false);
    }
  };

  const availableStations = useMemo(() => allStations.filter(station => !station.locationId || Number(station.locationId) === Number(assignLocation?.id)), [allStations, assignLocation]);

  const assignStation = async () => {
    if (!assignLocation || !selectedStationId) return;
    setSaving(true);
    try {
      await api.post(`/admin/locations/${assignLocation.id}/assign-station`, { stationId: selectedStationId });
      notify('Station assigned successfully');
      setAssignLocation(null);
      await fetchLocations();
    } catch (error) {
      notify(messageFrom(error, 'Failed to assign station'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const unassignStation = async (location, station) => {
    try {
      await api.post(`/admin/locations/${location.id}/unassign-station`, { stationId: station.id });
      notify(`${station.name || station.chargePointId} unassigned`);
      await fetchLocations();
    } catch (error) {
      notify(messageFrom(error, 'Failed to unassign station'), 'error');
    }
  };

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <PageHeader
        eyebrow="Charging network"
        title="Locations"
        description="Manage charging sites, station assignments, coordinates and site-level pricing."
        actions={<>
          <Button variant="outlined" startIcon={<RefreshRounded />} onClick={fetchLocations}>Refresh</Button>
          {canCreate && <Button variant="contained" startIcon={<AddRounded />} onClick={openCreate}>Add location</Button>}
        </>}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, md: 2 } }}>
        <MetricCard label="Locations" value={locations.length} helper={`${states.length} states represented`} icon={<LocationOnRounded />} color="primary" />
        <MetricCard label="Assigned stations" value={totalStations} helper="Across all charging locations" icon={<EvStationRounded />} color="secondary" />
        <MetricCard label="Ready or charging" value={activeStations} helper="Available and active stations" icon={<MapRounded />} color="success" />
        <MetricCard label="Average tariff" value={`${naira(averagePrice)}/Wh`} helper={`${naira(averagePrice * 1000)}/kWh`} icon={<PaymentsRounded />} color="warning" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3.5, p: { xs: 1.5, md: 2 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
          <TextField
            size="small" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search location, city or address" sx={{ flex: 1, minWidth: { md: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: { md: 180 } }}><InputLabel>State</InputLabel><Select label="State" value={stateFilter} onChange={event => setStateFilter(event.target.value)}><MenuItem value="">All states</MenuItem>{states.map(state => <MenuItem key={state} value={state}>{state}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: { md: 190 } }}><InputLabel>Station assignment</InputLabel><Select label="Station assignment" value={stationFilter} onChange={event => setStationFilter(event.target.value)}><MenuItem value="">All locations</MenuItem><MenuItem value="assigned">With stations</MenuItem><MenuItem value="empty">Without stations</MenuItem></Select></FormControl>
          {hasFilters && <Button color="inherit" startIcon={<FilterAltOffRounded />} onClick={clearFilters}>Clear</Button>}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>{filteredLocations.length} of {locations.length} locations</Typography>
      </Paper>

      {loading ? (
        <Paper variant="outlined" sx={{ minHeight: 300, display: 'grid', placeItems: 'center', borderRadius: 3.5 }}><CircularProgress size={30} /></Paper>
      ) : filteredLocations.length === 0 ? (
        <Paper variant="outlined" sx={{ py: 8, px: 2, textAlign: 'center', borderRadius: 3.5 }}>
          <LocationCityRounded sx={{ fontSize: 54, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" fontWeight={750}>{hasFilters ? 'No locations match these filters' : 'No locations yet'}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>{hasFilters ? 'Clear or adjust your filters to see more locations.' : 'Create a location before assigning charging stations.'}</Typography>
          {hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : canCreate && <Button variant="contained" startIcon={<AddRounded />} onClick={openCreate}>Create first location</Button>}
        </Paper>
      ) : (
        <Grid container spacing={{ xs: 1.5, md: 2.25 }}>
          {filteredLocations.map(location => {
            const stationsAtLocation = location.stations || [];
            const isExpanded = Boolean(expanded[location.id]);
            return (
              <Grid item xs={12} lg={6} key={location.id}>
                <Paper variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden', height: '100%', transition: 'transform 180ms ease, box-shadow 180ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 } }}>
                  <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                      <Box sx={{ width: 46, height: 46, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main', flexShrink: 0 }}><LocationOnRounded /></Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="h6" fontWeight={780} noWrap>{location.name}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{[location.address, location.city, location.state].filter(Boolean).join(', ') || 'Address not specified'}</Typography>
                      </Box>
                      {canUpdate && <Stack direction="row" spacing={0.25}><Tooltip title="Edit location"><IconButton size="small" onClick={() => openEdit(location)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title="Delete location"><IconButton size="small" color="error" onClick={() => setDeletingLocation(location)}><DeleteOutlineRounded fontSize="small" /></IconButton></Tooltip></Stack>}
                    </Stack>

                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2.25 }}>
                      <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary">Stations</Typography><Typography fontWeight={760}>{stationsAtLocation.length}</Typography></Box>
                      <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary">Per kWh</Typography><Typography fontWeight={760} noWrap>{naira(Number(location.pricePerWh || 0) * 1000)}</Typography></Box>
                      <Box sx={{ p: 1.25, borderRadius: 2.5, bgcolor: 'action.hover' }}><Typography variant="caption" color="text.secondary">Minimum</Typography><Typography fontWeight={760} noWrap>{naira(location.minimumCharge)}</Typography></Box>
                    </Box>

                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
                      <Button size="small" color="inherit" endIcon={<ExpandMoreRounded sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 180ms' }} />} onClick={() => setExpanded(previous => ({ ...previous, [location.id]: !previous[location.id] }))}>{isExpanded ? 'Hide stations' : 'View stations'}</Button>
                      {canUpdate && <Button size="small" variant="outlined" startIcon={<LinkRounded />} onClick={() => openAssign(location)}>Assign station</Button>}
                    </Stack>
                  </Box>

                  <Collapse in={isExpanded} unmountOnExit>
                    <Divider />
                    <Stack spacing={1} sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'action.hover' }}>
                      {stationsAtLocation.length === 0 ? <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 2 }}>No station is assigned to this location.</Typography> : stationsAtLocation.map(station => (
                        <Paper key={station.id} variant="outlined" sx={{ p: 1.25, borderRadius: 2.5 }}>
                          <Stack direction="row" alignItems="center" spacing={1.25}>
                            <EvStationRounded color="primary" fontSize="small" />
                            <Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={720} noWrap>{station.name || station.chargePointId}</Typography><Typography variant="caption" color="text.secondary">{station.chargePointId}</Typography></Box>
                            <Chip size="small" label={station.status || 'Unknown'} color={stationTone(station.status)} />
                            {canUpdate && <Tooltip title="Unassign station"><IconButton size="small" onClick={() => unassignStation(location, station)}><LinkOffRounded fontSize="small" /></IconButton></Tooltip>}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Collapse>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Dialog open={editor !== undefined} onClose={closeEditor} fullScreen={compactDialog} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: compactDialog ? 0 : 4 } }}>
        <DialogTitle><Typography variant="h5" fontWeight={800}>{editor ? 'Edit location' : 'Create location'}</Typography><Typography variant="body2" color="text.secondary">Site identity, map position and charging tariff</Typography></DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.25}>
            <TextField required label="Location name" value={formData.name} onChange={event => setFormData(previous => ({ ...previous, name: event.target.value }))} placeholder="e.g. Jahi Plaza Charging Hub" />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
              <FormControl required><InputLabel>State</InputLabel><Select label="State" value={formData.state} onChange={event => setFormData(previous => ({ ...previous, state: event.target.value }))}><MenuItem value=""><em>Select a state</em></MenuItem>{nigerianStates.map(state => <MenuItem key={state} value={state}>{state}</MenuItem>)}</Select></FormControl>
              <TextField required label="City" value={formData.city} onChange={event => setFormData(previous => ({ ...previous, city: event.target.value }))} />
            </Box>
            <TextField label="Street address" value={formData.address} onChange={event => setFormData(previous => ({ ...previous, address: event.target.value }))} />
            <TextField label="Description" multiline minRows={2} value={formData.description} onChange={event => setFormData(previous => ({ ...previous, description: event.target.value }))} />
            <Divider><Chip size="small" label="Map coordinates" icon={<MapRounded />} /></Divider>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
              <TextField label="Latitude" type="number" inputProps={{ step: 0.000001 }} value={formData.latitude} onChange={event => setFormData(previous => ({ ...previous, latitude: event.target.value }))} />
              <TextField label="Longitude" type="number" inputProps={{ step: 0.000001 }} value={formData.longitude} onChange={event => setFormData(previous => ({ ...previous, longitude: event.target.value }))} />
            </Box>
            <Divider><Chip size="small" label="Site pricing" icon={<PaymentsRounded />} /></Divider>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
              <TextField label="Price per Wh" type="number" inputProps={{ step: 0.01, min: 0 }} value={formData.pricePerWh} onChange={event => setFormData(previous => ({ ...previous, pricePerWh: event.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start">₦</InputAdornment> }} helperText={`${naira(Number(formData.pricePerWh || 0) * 1000)} per kWh`} />
              <TextField label="Minimum charge" type="number" inputProps={{ step: 1, min: 0 }} value={formData.minimumCharge} onChange={event => setFormData(previous => ({ ...previous, minimumCharge: event.target.value }))} InputProps={{ startAdornment: <InputAdornment position="start">₦</InputAdornment> }} />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={closeEditor}>Cancel</Button><Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>{editor ? 'Save changes' : 'Create location'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(deletingLocation)} onClose={() => !saving && setDeletingLocation(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete location?</DialogTitle>
        <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>Assigned stations will be unlinked, not deleted.</Alert><Typography>Delete <strong>{deletingLocation?.name}</strong>? This cannot be undone.</Typography></DialogContent>
        <DialogActions><Button onClick={() => setDeletingLocation(null)}>Cancel</Button><Button variant="contained" color="error" disabled={saving} onClick={handleDelete}>Delete location</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(assignLocation)} onClose={() => !saving && setAssignLocation(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 4 } }}>
        <DialogTitle><Typography variant="h6" fontWeight={780}>Assign a station</Typography><Typography variant="body2" color="text.secondary">{assignLocation?.name}</Typography></DialogTitle>
        <DialogContent dividers>
          {stationsLoading ? <Box sx={{ py: 5, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box> : <FormControl fullWidth><InputLabel>Charging station</InputLabel><Select label="Charging station" value={selectedStationId} onChange={event => setSelectedStationId(event.target.value)}><MenuItem value=""><em>Select a station</em></MenuItem>{availableStations.map(station => <MenuItem key={station.id} value={station.id}><Stack direction="row" spacing={1} alignItems="center"><EvStationRounded fontSize="small" /><Box><Typography variant="body2">{station.name || station.chargePointId}</Typography><Typography variant="caption" color="text.secondary">{station.chargePointId}</Typography></Box></Stack></MenuItem>)}</Select></FormControl>}
          {!stationsLoading && availableStations.length === 0 && <Alert severity="info" sx={{ mt: 2 }}>Every station is already assigned to another location.</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setAssignLocation(null)}>Cancel</Button><Button variant="contained" startIcon={<LinkRounded />} disabled={!selectedStationId || saving} onClick={assignStation}>Assign station</Button></DialogActions>
      </Dialog>

      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice(previous => ({ ...previous, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert variant="filled" severity={notice.severity} onClose={() => setNotice(previous => ({ ...previous, open: false }))}>{notice.message}</Alert></Snackbar>
    </Stack>
  );
}

export default LocationsList;
