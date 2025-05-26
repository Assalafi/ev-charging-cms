import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Add as AddIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  MoreVert as MoreIcon,
  Settings as SettingsIcon,
  History as HistoryIcon,
  Update as UpdateIcon,
  Sync as SyncIcon,
  BatteryChargingFull as ChargingIcon,
  Description as LogsIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../services/api';
import stationService from '../../services/stationService';
import { useMQTT } from '../../contexts/MQTTContext';

function StationList() {
  const navigate = useNavigate();
  const { stationStatus } = useMQTT();
  
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  
  // Delete station dialog
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Add station dialog
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [newStation, setNewStation] = useState({
    chargePointId: '',
    name: '',
    vendor: '',
    model: '',
    firmwareVersion: '1.0.0',
    powerOutput: 22,
    address: '',
    location: { latitude: 0, longitude: 0 }
  });
  const [addStationLoading, setAddStationLoading] = useState(false);
  
  // Fetch stations
  const fetchStations = async () => {
    setLoading(true);
    try {
      const response = await api.get('/stations');
      setStations(response.data.stations);
      setError(null);
    } catch (error) {
      console.error('Error fetching stations:', error);
      setError('Failed to fetch charging stations');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchStations();
  }, []);
  
  // Handle menu open
  const handleMenuOpen = (event, station) => {
    setAnchorEl(event.currentTarget);
    setSelectedStation(station);
  };
  
  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
  };
  
  // Handle add station dialog open
  const handleOpenAddDialog = () => {
    setOpenAddDialog(true);
    // Generate a unique station ID
    const prefix = Math.random() > 0.5 ? 'CP-01' : 'CP-02';
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setNewStation(prev => ({
      ...prev,
      chargePointId: `${prefix}-${randomNum}`,
      name: `Charging Station ${randomNum}`
    }));
  };
  
  // Handle add station dialog close
  const handleCloseAddDialog = () => {
    setOpenAddDialog(false);
    setAddStationLoading(false);
  };
  
  // Handle input change for new station
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewStation(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Handle add station submit
  const handleAddStation = async () => {
    setAddStationLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Use the API service instead of direct fetch
      const response = await api.post('/stations', newStation);
      
      // Add the new station to the list
      setStations(prev => [...prev, {
        ...newStation,
        id: response.data?.station?.id || Date.now(), // Use the returned ID or generate a temp one
        registeredDate: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        status: 'Available',
        isConnected: true
      }]);
      
      setSuccess('Charging station added successfully');
      setTimeout(() => setSuccess(null), 5000); // Clear success message after 5 seconds
      handleCloseAddDialog();
    } catch (error) {
      console.error('Error adding station:', error);
      
      if (error.response && error.response.data && error.response.data.message) {
        setError(error.response.data.message);
      } else {
        // If network error or other issue, add locally as fallback
        setStations(prev => [...prev, {
          ...newStation,
          id: Date.now(), // Generate a temporary ID
          registeredDate: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          status: 'Available',
          isConnected: true
        }]);
        
        setSuccess('Charging station added successfully (local only)');
        setTimeout(() => setSuccess(null), 5000);
        handleCloseAddDialog();
      }
    } finally {
      setAddStationLoading(false);
    }
  };
  
  // Handle remote start transaction
  const handleRemoteStart = async () => {
    if (!selectedStation) return;
    
    try {
      await api.post(`/stations/${selectedStation.chargePointId}/remote-start`, {
        idTag: 'test-user-id'
      });
      handleMenuClose();
    } catch (error) {
      console.error('Error starting transaction:', error);
      setError('Failed to start transaction');
    }
  };
  
  // Handle remote stop transaction
  const handleRemoteStop = async () => {
    if (!selectedStation) return;
    
    try {
      await api.post(`/stations/${selectedStation.chargePointId}/remote-stop`, {
        transactionId: selectedStation.currentTransaction
      });
      handleMenuClose();
    } catch (error) {
      console.error('Error stopping transaction:', error);
      setError('Failed to stop transaction');
    }
  };
  
  // Handle reset station
  const handleReset = async () => {
    if (!selectedStation) return;
    
    try {
      await api.post(`/stations/${selectedStation.chargePointId}/reset`, {
        type: 'Soft'
      });
      handleMenuClose();
    } catch (error) {
      console.error('Error resetting station:', error);
      setError('Failed to reset station');
    }
  };
  
  // Handle view station detail
  const handleViewStation = (chargePointId) => {
    navigate(`/stations/${chargePointId}`);
  };
  
  // Handle view station transactions
  const handleViewTransactions = () => {
    if (!selectedStation) return;
    navigate(`/stations/${selectedStation.chargePointId}`, { state: { tab: 'transactions' } });
    handleMenuClose();
  };
  
  // Handle firmware update
  const handleFirmwareUpdate = () => {
    if (!selectedStation) return;
    navigate(`/stations/firmware`, { state: { station: selectedStation.chargePointId } });
    handleMenuClose();
  };
  
  // Handle diagnostics
  const handleDiagnostics = () => {
    handleMenuClose();
    navigate(`/charging-stations/diagnostics?stationId=${selectedStation.chargePointId}`);
  };
  
  // Handle delete station dialog open
  const handleOpenDeleteDialog = () => {
    setOpenDeleteDialog(true);
    handleMenuClose();
  };
  
  // Handle delete station dialog close
  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setDeleteLoading(false);
  };
  
  // Handle delete station
  const handleDeleteStation = async () => {
    setDeleteLoading(true);
    setError(null);
    
    try {
      await stationService.delete(selectedStation.chargePointId);
      
      // Remove the station from the list
      setStations(prev => prev.filter(station => station.chargePointId !== selectedStation.chargePointId));
      setSuccess(`Station ${selectedStation.name} deleted successfully`);
      handleCloseDeleteDialog();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccess(null), 5000);
    } catch (error) {
      console.error('Error deleting station:', error);
      if (error.response?.status === 400) {
        setError(error.response.data.message || 'Cannot delete station with active transactions');
      } else {
        setError('Failed to delete charging station');
      }
      setDeleteLoading(false);
    }
  };
  
  // Handle pagination change
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  // Handle rows per page change
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Filter stations by search term
  const filteredStations = stations.filter(station => 
    station.chargePointId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    station.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (station.model && station.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (station.vendor && station.vendor.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return 'success';
      case 'Charging': return 'primary';
      case 'Faulted': return 'error';
      case 'Preparing': return 'warning';
      case 'Finishing': return 'info';
      case 'Reserved': return 'secondary';
      case 'Unavailable': return 'default';
      default: return 'default';
    }
  };
  
  // Get real-time status
  const getRealtimeStatus = (chargePointId) => {
    const realtimeStatus = stationStatus[chargePointId];
    if (realtimeStatus) {
      return realtimeStatus.status || null;
    }
    return null;
  };
  
  // Get connection status
  const getConnectionStatus = (station) => {
    return station.isConnected ? 'Connected' : 'Disconnected';
  };
  
  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Charging Stations
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<UpdateIcon />} 
            sx={{ mr: 1 }}
            onClick={() => navigate('/stations/firmware')}
          >
            Firmware
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<LogsIcon />} 
            sx={{ mr: 1 }}
            onClick={() => navigate('/stations/diagnostics')}
          >
            Diagnostics
          </Button>
          <IconButton onClick={fetchStations}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
      
      {/* Toolbar */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              placeholder="Search stations..."
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={8} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAddDialog}
            >
              Add Station
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Success message */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {/* Stations table */}
      <Paper sx={{ borderRadius: 2 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Model</TableCell>
                <TableCell>Last Heartbeat</TableCell>
                <TableCell>Firmware</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <CircularProgress size={24} sx={{ my: 2 }} />
                  </TableCell>
                </TableRow>
              ) : filteredStations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    No charging stations found
                  </TableCell>
                </TableRow>
              ) : (
                filteredStations
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((station) => {
                    const realtimeStatus = getRealtimeStatus(station.chargePointId);
                    const displayStatus = realtimeStatus || station.status;
                    
                    return (
                      <TableRow key={station.chargePointId} hover>
                        <TableCell>{station.chargePointId}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            {station.name}
                            {station.isConnected && (
                              <Chip 
                                label="Online" 
                                color="success" 
                                size="small" 
                                sx={{ ml: 1, height: 20 }} 
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={displayStatus}
                            color={getStatusColor(displayStatus)}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {station.model ? `${station.model} • ${station.vendor || 'Unknown'}` : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {station.lastHeartbeat ? format(new Date(station.lastHeartbeat), 'dd MMM yyyy HH:mm:ss') : 'Never'}
                        </TableCell>
                        <TableCell>
                          {station.firmwareVersion || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <IconButton 
                            size="small"
                            onClick={(e) => handleMenuOpen(e, station)}
                          >
                            <MoreIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredStations.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
      
      {/* Action menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => { handleViewStation(selectedStation?.chargePointId); handleMenuClose(); }}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleViewTransactions}>
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Transactions</ListItemText>
        </MenuItem>
        <Divider />
        {selectedStation?.status !== 'Charging' ? (
          <MenuItem onClick={handleRemoteStart}>
            <ListItemIcon>
              <StartIcon fontSize="small" color="success" />
            </ListItemIcon>
            <ListItemText>Start Transaction</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={handleRemoteStop}>
            <ListItemIcon>
              <StopIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Stop Transaction</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={handleReset}>
          <ListItemIcon>
            <SyncIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Reset Station</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleFirmwareUpdate}>
          <ListItemIcon>
            <UpdateIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Update Firmware</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDiagnostics}>
          <ListItemIcon>
            <LogsIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Diagnostics</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleOpenDeleteDialog}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete Station</ListItemText>
        </MenuItem>
      </Menu>
      
      {/* Add Station Dialog */}
      <Dialog open={openAddDialog} onClose={handleCloseAddDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Add Charging Station</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Add a new charging station to the EV Charging network. The station will be automatically registered and available for charging.
          </DialogContentText>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                name="chargePointId"
                label="Station ID"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.chargePointId}
                onChange={handleInputChange}
                helperText="Unique identifier for the station"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="name"
                label="Station Name"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.name}
                onChange={handleInputChange}
                helperText="Display name for the station"
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="vendor"
                label="Vendor"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.vendor}
                onChange={handleInputChange}
                select
                required
              >
                <MenuItem value="ABB">ABB</MenuItem>
                <MenuItem value="ChargePoint">ChargePoint</MenuItem>
                <MenuItem value="Tesla">Tesla</MenuItem>
                <MenuItem value="Siemens">Siemens</MenuItem>
                <MenuItem value="EVBox">EVBox</MenuItem>
                <MenuItem value="Schneider Electric">Schneider Electric</MenuItem>
                <MenuItem value="Local EV Solutions">Local EV Solutions</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="model"
                label="Model"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.model}
                onChange={handleInputChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="firmwareVersion"
                label="Firmware Version"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.firmwareVersion}
                onChange={handleInputChange}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="powerOutput"
                label="Power Output (kW)"
                fullWidth
                margin="normal"
                variant="outlined"
                type="number"
                value={newStation.powerOutput}
                onChange={handleInputChange}
                InputProps={{ inputProps: { min: 3.7, max: 350 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="address"
                label="Address"
                fullWidth
                margin="normal"
                variant="outlined"
                value={newStation.address}
                onChange={handleInputChange}
                helperText="Physical location of the charging station"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog} color="primary">
            Cancel
          </Button>
          <Button 
            onClick={handleAddStation} 
            color="primary" 
            variant="contained"
            disabled={addStationLoading || !newStation.chargePointId || !newStation.name || !newStation.vendor || !newStation.model}
          >
            {addStationLoading ? <CircularProgress size={24} /> : 'Add Station'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Delete Station Dialog */}
      <Dialog
        open={openDeleteDialog}
        onClose={handleCloseDeleteDialog}
        aria-labelledby="delete-station-dialog-title"
      >
        <DialogTitle id="delete-station-dialog-title">
          Delete Station {selectedStation?.name}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this charging station? This action cannot be undone.
            {selectedStation?.isConnected && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Warning: This station is currently connected. Deleting it may cause issues if it reconnects.
              </Alert>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog} color="primary">
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteStation} 
            color="error" 
            variant="contained"
            disabled={deleteLoading}
            startIcon={deleteLoading ? <CircularProgress size={20} color="inherit" /> : <DeleteIcon />}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StationList;
