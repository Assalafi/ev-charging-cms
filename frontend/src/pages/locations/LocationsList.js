import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Grid,
  Card,
  CardContent,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LocationOn as LocationIcon,
  EvStation as StationIcon,
  Refresh as RefreshIcon,
  LinkOff as UnlinkIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import nigerianStates from '../../utils/nigerian-states';

function LocationsList() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState('create'); // create | edit
  const [editingLocation, setEditingLocation] = useState(null);
  const [formData, setFormData] = useState({ name: '', state: '', city: '', address: '', latitude: '', longitude: '', description: '', pricePerWh: 0.17, minimumCharge: 150 });

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState(null);

  // Assign station dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignLocation, setAssignLocation] = useState(null);
  const [allStations, setAllStations] = useState([]);
  const [selectedStationId, setSelectedStationId] = useState('');

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/locations');
      setLocations(response.data.locations || []);
    } catch (err) {
      setError('Failed to load locations');
    }
    setLoading(false);
  }, []);

  const fetchStations = async () => {
    try {
      const response = await api.get('/stations');
      setAllStations(response.data.stations || []);
    } catch (err) {
      console.error('Failed to load stations', err);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const handleOpenCreate = () => {
    setDialogMode('create');
    setFormData({ name: '', state: '', city: '', address: '', latitude: '', longitude: '', description: '', pricePerWh: 0.17, minimumCharge: 150 });
    setDialogOpen(true);
  };

  const handleOpenEdit = (loc) => {
    setDialogMode('edit');
    setEditingLocation(loc);
    setFormData({
      name: loc.name || '',
      state: loc.state || '',
      city: loc.city || '',
      address: loc.address || '',
      latitude: loc.latitude || '',
      longitude: loc.longitude || '',
      description: loc.description || '',
      pricePerWh: loc.pricePerWh ?? 0.17,
      minimumCharge: loc.minimumCharge ?? 150,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (dialogMode === 'create') {
        await api.post('/admin/locations', formData);
        setSuccess('Location created successfully');
      } else {
        await api.put(`/admin/locations/${editingLocation.id}`, formData);
        setSuccess('Location updated successfully');
      }
      setDialogOpen(false);
      fetchLocations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save location');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/locations/${deletingLocation.id}`);
      setSuccess('Location deleted');
      setDeleteDialogOpen(false);
      fetchLocations();
    } catch (err) {
      setError('Failed to delete location');
    }
  };

  const handleOpenAssign = (loc) => {
    setAssignLocation(loc);
    setSelectedStationId('');
    fetchStations();
    setAssignDialogOpen(true);
  };

  const handleAssignStation = async () => {
    try {
      await api.post(`/admin/locations/${assignLocation.id}/assign-station`, { stationId: selectedStationId });
      setSuccess('Station assigned to location');
      setAssignDialogOpen(false);
      fetchLocations();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to assign station');
    }
  };

  const handleUnassignStation = async (locationId, stationId) => {
    try {
      await api.post(`/admin/locations/${locationId}/unassign-station`, { stationId });
      setSuccess('Station unassigned');
      fetchLocations();
    } catch (err) {
      setError('Failed to unassign station');
    }
  };

  // Stations not assigned to any location (for the assign dialog)
  const unassignedStations = allStations.filter(
    s => !s.locationId && !locations.some(loc => loc.stations?.some(ls => ls.id === s.id))
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" fontWeight={700}>
          <LocationIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Locations
        </Typography>
        <Box>
          <Button startIcon={<RefreshIcon />} onClick={fetchLocations} sx={{ mr: 1 }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Add Location
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : locations.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <LocationIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">No locations yet</Typography>
          <Typography color="text.secondary" mb={2}>Create a location to start assigning stations</Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreate}>
            Create First Location
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {locations.map(loc => (
            <Grid item xs={12} md={6} lg={4} key={loc.id}>
              <Card elevation={2}>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="h6" fontWeight={600}>{loc.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[loc.address, loc.city, loc.state].filter(Boolean).join(', ')}
                      </Typography>
                      <Typography variant="body2" color="primary" fontWeight={600} mt={0.5}>
                        ₦{loc.pricePerWh ?? 0.17}/Wh (₦{((loc.pricePerWh ?? 0.17) * 1000).toFixed(0)}/kWh) · Min: ₦{loc.minimumCharge ?? 150}
                      </Typography>
                    </Box>
                    <Box>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleOpenEdit(loc)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => { setDeletingLocation(loc); setDeleteDialogOpen(true); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  <Box mt={2} mb={1} display="flex" alignItems="center" gap={1}>
                    <StationIcon fontSize="small" color="primary" />
                    <Typography variant="body2" fontWeight={600}>
                      {loc.stationCount || 0} Station{(loc.stationCount || 0) !== 1 ? 's' : ''}
                    </Typography>
                    <Box flex={1} />
                    <Button size="small" startIcon={<LinkIcon />} onClick={() => handleOpenAssign(loc)}>
                      Assign
                    </Button>
                  </Box>

                  {loc.stations && loc.stations.length > 0 && (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Station</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Action</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {loc.stations.map(s => (
                            <TableRow key={s.id}>
                              <TableCell>
                                <Typography variant="body2" fontWeight={500}>{s.name}</Typography>
                                <Typography variant="caption" color="text.secondary">{s.chargePointId}</Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={s.status || 'Unknown'}
                                  size="small"
                                  color={s.status === 'Available' ? 'success' : s.status === 'Charging' ? 'primary' : 'default'}
                                />
                              </TableCell>
                              <TableCell align="right">
                                <Tooltip title="Unassign">
                                  <IconButton size="small" onClick={() => handleUnassignStation(loc.id, s.id)}>
                                    <UnlinkIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogMode === 'create' ? 'Create Location' : 'Edit Location'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth label="Location Name" margin="normal"
            value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Jahi Plaza Charging Hub"
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>State</InputLabel>
            <Select
              value={formData.state} label="State"
              onChange={e => setFormData({ ...formData, state: e.target.value })}
            >
              <MenuItem value=""><em>Select a state</em></MenuItem>
              {nigerianStates.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField
            fullWidth label="City" margin="normal"
            value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })}
          />
          <TextField
            fullWidth label="Address" margin="normal"
            value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Latitude" type="number"
                value={formData.latitude}
                onChange={e => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="e.g. 9.0765"
                helperText="GPS coordinates for navigation"
                inputProps={{ step: 0.000001 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Longitude" type="number"
                value={formData.longitude}
                onChange={e => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="e.g. 7.4983"
                helperText="GPS coordinates for navigation"
                inputProps={{ step: 0.000001 }}
              />
            </Grid>
          </Grid>
          <TextField
            fullWidth label="Description (optional)" margin="normal" multiline rows={2}
            value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
          />
          <Box sx={{ mt: 2, mb: 1 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Pricing</Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Price per Wh" type="number"
                value={formData.pricePerWh}
                onChange={e => setFormData({ ...formData, pricePerWh: parseFloat(e.target.value) || 0 })}
                InputProps={{ startAdornment: <InputAdornment position="start">₦</InputAdornment> }}
                helperText={`= ₦${((formData.pricePerWh || 0) * 1000).toFixed(0)}/kWh`}
                inputProps={{ step: 0.01 }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth label="Minimum Charge" type="number"
                value={formData.minimumCharge}
                onChange={e => setFormData({ ...formData, minimumCharge: parseFloat(e.target.value) || 0 })}
                InputProps={{ startAdornment: <InputAdornment position="start">₦</InputAdornment> }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={!formData.name || !formData.state || !formData.city}>
            {dialogMode === 'create' ? 'Create' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Location</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>{deletingLocation?.name}</strong>?
            {deletingLocation?.stationCount > 0 && (
              <> This will unlink {deletingLocation.stationCount} station(s) from this location.</>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Assign Station Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Station to {assignLocation?.name}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Select Station</InputLabel>
            <Select
              value={selectedStationId} label="Select Station"
              onChange={e => setSelectedStationId(e.target.value)}
            >
              <MenuItem value=""><em>Choose a station</em></MenuItem>
              {allStations.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name || s.chargePointId} — {s.chargePointId}
                  {s.locationId ? ' (already assigned)' : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAssignStation} disabled={!selectedStationId}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LocationsList;
