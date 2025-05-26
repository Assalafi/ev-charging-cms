import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  IconButton,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  InputAdornment,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Delete as DeleteIcon,
  CloudUpload as UploadIcon,
  SystemUpdate as UpdateIcon,
  History as HistoryIcon,
  Refresh as RefreshIcon,
  CheckCircle as CompatibleIcon,
  Cancel as IncompatibleIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import axios from 'axios';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`firmware-tabpanel-${index}`}
      aria-labelledby={`firmware-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function FirmwareManagement() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // State
  const [tabValue, setTabValue] = useState(0);
  const [firmwares, setFirmwares] = useState([]);
  const [stations, setStations] = useState([]);
  const [updateHistory, setUpdateHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Add firmware dialog
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [newFirmware, setNewFirmware] = useState({
    version: '',
    releaseNotes: '',
    filename: '',
    url: '',
    size: '',
    compatibleModels: []
  });
  const [uploadLoading, setUploadLoading] = useState(false);
  
  // Update firmware dialog
  const [openUpdateDialog, setOpenUpdateDialog] = useState(false);
  const [updateDetails, setUpdateDetails] = useState({
    firmwareId: '',
    stationIds: [],
    scheduleTime: '',
    retries: 3,
    priority: 'Normal'
  });
  
  // Delete confirmation dialog
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [firmwareToDelete, setFirmwareToDelete] = useState(null);
  
  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch firmware versions
      const firmwareResponse = await axios.get('/api/firmware');
      setFirmwares(firmwareResponse.data.firmwares);
      
      // Fetch stations for update dialog
      const stationsResponse = await axios.get('/api/stations');
      setStations(stationsResponse.data.stations);
      
      // Fetch update history
      const historyResponse = await axios.get('/api/firmware/history');
      setUpdateHistory(historyResponse.data.history);
      
      setError(null);
    } catch (error) {
      console.error('Error fetching firmware data:', error);
      setError('Failed to fetch firmware data');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchData();
    
    // Check if a specific tab was requested
    if (location.state?.tab === 'history') {
      setTabValue(2);
    }
    
    // Check if update was requested for a specific station
    if (location.state?.station) {
      handleOpenUpdateDialog();
      // Pre-select the station
      setUpdateDetails(prev => ({
        ...prev,
        stationIds: [location.state.station]
      }));
    }
  }, [location.state]);
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Handle pagination change
  const handleChangePage = (event, newValue) => {
    setPage(newValue);
  };
  
  // Handle rows per page change
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Filter firmware by search term
  const filteredFirmwares = firmwares.filter(firmware => 
    firmware.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (firmware.compatibleModels && firmware.compatibleModels.some(model => 
      model.toLowerCase().includes(searchTerm.toLowerCase())
    ))
  );
  
  // Handle add firmware dialog
  const handleOpenAddDialog = () => {
    setOpenAddDialog(true);
  };
  
  const handleCloseAddDialog = () => {
    setOpenAddDialog(false);
    setNewFirmware({
      version: '',
      releaseNotes: '',
      filename: '',
      url: '',
      size: '',
      compatibleModels: []
    });
  };
  
  const handleFirmwareChange = (e) => {
    if (e.target.name === 'compatibleModels') {
      setNewFirmware({
        ...newFirmware,
        compatibleModels: e.target.value
      });
    } else {
      setNewFirmware({
        ...newFirmware,
        [e.target.name]: e.target.value
      });
    }
  };
  
  const handleAddFirmware = async () => {
    setUploadLoading(true);
    try {
      await axios.post('/api/firmware', newFirmware);
      fetchData();
      handleCloseAddDialog();
      setError(null);
    } catch (error) {
      console.error('Error adding firmware:', error);
      setError('Failed to add firmware');
    } finally {
      setUploadLoading(false);
    }
  };
  
  // Handle update firmware dialog
  const handleOpenUpdateDialog = (firmwareId = '') => {
    setUpdateDetails({
      firmwareId: firmwareId,
      stationIds: location.state?.station ? [location.state.station] : [],
      scheduleTime: '',
      retries: 3,
      priority: 'Normal'
    });
    setOpenUpdateDialog(true);
  };
  
  const handleCloseUpdateDialog = () => {
    setOpenUpdateDialog(false);
  };
  
  const handleUpdateDetailsChange = (e) => {
    setUpdateDetails({
      ...updateDetails,
      [e.target.name]: e.target.value
    });
  };
  
  const handleScheduleUpdate = async () => {
    try {
      await axios.post('/api/firmware/update', updateDetails);
      fetchData();
      handleCloseUpdateDialog();
      setError(null);
    } catch (error) {
      console.error('Error scheduling firmware update:', error);
      setError('Failed to schedule firmware update');
    }
  };
  
  // Handle delete firmware dialog
  const handleOpenDeleteDialog = (firmware) => {
    setFirmwareToDelete(firmware);
    setOpenDeleteDialog(true);
  };
  
  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setFirmwareToDelete(null);
  };
  
  const handleDeleteFirmware = async () => {
    if (!firmwareToDelete) return;
    
    try {
      await axios.delete(`/api/firmware/${firmwareToDelete.id}`);
      fetchData();
      handleCloseDeleteDialog();
      setError(null);
    } catch (error) {
      console.error('Error deleting firmware:', error);
      setError('Failed to delete firmware');
    }
  };
  
  // Get compatibility icon
  const getCompatibilityIcon = (isCompatible) => {
    return isCompatible ? (
      <CompatibleIcon color="success" fontSize="small" />
    ) : (
      <IncompatibleIcon color="error" fontSize="small" />
    );
  };
  
  // Get update status color
  const getUpdateStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Failed': return 'error';
      case 'Pending': return 'warning';
      case 'InProgress': return 'primary';
      default: return 'default';
    }
  };
  
  // Render add firmware dialog
  const renderAddFirmwareDialog = () => {
    return (
      <Dialog open={openAddDialog} onClose={handleCloseAddDialog} fullWidth maxWidth="md">
        <DialogTitle>Add New Firmware</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                name="version"
                label="Firmware Version"
                fullWidth
                value={newFirmware.version}
                onChange={handleFirmwareChange}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="filename"
                label="Filename"
                fullWidth
                value={newFirmware.filename}
                onChange={handleFirmwareChange}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="url"
                label="Firmware URL"
                fullWidth
                value={newFirmware.url}
                onChange={handleFirmwareChange}
                required
                helperText="URL where the firmware file can be downloaded"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="size"
                label="File Size"
                fullWidth
                value={newFirmware.size}
                onChange={handleFirmwareChange}
                InputProps={{
                  endAdornment: <InputAdornment position="end">KB</InputAdornment>,
                }}
                type="number"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="compatible-models-label">Compatible Models</InputLabel>
                <Select
                  labelId="compatible-models-label"
                  multiple
                  name="compatibleModels"
                  value={newFirmware.compatibleModels}
                  onChange={handleFirmwareChange}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} />
                      ))}
                    </Box>
                  )}
                >
                  <MenuItem value="EV100">EV100</MenuItem>
                  <MenuItem value="EV200">EV200</MenuItem>
                  <MenuItem value="EV300">EV300</MenuItem>
                  <MenuItem value="SmartCharge">SmartCharge</MenuItem>
                  <MenuItem value="PowerCharger">PowerCharger</MenuItem>
                </Select>
                <FormHelperText>Select compatible models</FormHelperText>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="releaseNotes"
                label="Release Notes"
                fullWidth
                multiline
                rows={4}
                value={newFirmware.releaseNotes}
                onChange={handleFirmwareChange}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddDialog}>Cancel</Button>
          <Button 
            onClick={handleAddFirmware} 
            variant="contained"
            color="primary"
            disabled={uploadLoading || !newFirmware.version || !newFirmware.url}
            startIcon={uploadLoading ? <CircularProgress size={24} /> : <UploadIcon />}
          >
            {uploadLoading ? 'Uploading...' : 'Add Firmware'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Render update firmware dialog
  const renderUpdateFirmwareDialog = () => {
    return (
      <Dialog open={openUpdateDialog} onClose={handleCloseUpdateDialog} fullWidth maxWidth="md">
        <DialogTitle>Schedule Firmware Update</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel id="firmware-select-label">Firmware Version</InputLabel>
                <Select
                  labelId="firmware-select-label"
                  name="firmwareId"
                  value={updateDetails.firmwareId}
                  onChange={handleUpdateDetailsChange}
                >
                  <MenuItem value="">
                    <em>Select a firmware version</em>
                  </MenuItem>
                  {firmwares.map((firmware) => (
                    <MenuItem key={firmware.id} value={firmware.id}>
                      {firmware.version} - {firmware.filename}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel id="stations-select-label">Charging Stations</InputLabel>
                <Select
                  labelId="stations-select-label"
                  multiple
                  name="stationIds"
                  value={updateDetails.stationIds}
                  onChange={handleUpdateDetailsChange}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => {
                        const station = stations.find(s => s.chargePointId === value);
                        return (
                          <Chip 
                            key={value} 
                            label={station ? station.name : value} 
                          />
                        );
                      })}
                    </Box>
                  )}
                >
                  {stations.map((station) => {
                    // Check if this station is compatible with selected firmware
                    const selectedFirmware = firmwares.find(f => f.id === updateDetails.firmwareId);
                    const isCompatible = selectedFirmware ? 
                      (selectedFirmware.compatibleModels && selectedFirmware.compatibleModels.includes(station.model)) : 
                      true;
                    
                    return (
                      <MenuItem 
                        key={station.chargePointId} 
                        value={station.chargePointId}
                        disabled={!isCompatible}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <span>{station.name} ({station.chargePointId})</span>
                          {updateDetails.firmwareId && getCompatibilityIcon(isCompatible)}
                        </Box>
                      </MenuItem>
                    );
                  })}
                </Select>
                <FormHelperText>
                  {updateDetails.firmwareId && 'Incompatible stations are disabled'}
                </FormHelperText>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                name="scheduleTime"
                label="Schedule Time"
                type="datetime-local"
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
                value={updateDetails.scheduleTime}
                onChange={handleUpdateDetailsChange}
                helperText="Leave empty for immediate update"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="priority-select-label">Priority</InputLabel>
                <Select
                  labelId="priority-select-label"
                  name="priority"
                  value={updateDetails.priority}
                  onChange={handleUpdateDetailsChange}
                >
                  <MenuItem value="Low">Low</MenuItem>
                  <MenuItem value="Normal">Normal</MenuItem>
                  <MenuItem value="High">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                name="retries"
                label="Retry Attempts"
                type="number"
                fullWidth
                value={updateDetails.retries}
                onChange={handleUpdateDetailsChange}
                InputProps={{ inputProps: { min: 0, max: 10 } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUpdateDialog}>Cancel</Button>
          <Button 
            onClick={handleScheduleUpdate} 
            variant="contained"
            color="primary"
            disabled={!updateDetails.firmwareId || updateDetails.stationIds.length === 0}
          >
            Schedule Update
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Render delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete Firmware</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete firmware version "{firmwareToDelete?.version}"? 
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button onClick={handleDeleteFirmware} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Firmware Management
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAddDialog}
            sx={{ mr: 1 }}
          >
            Add Firmware
          </Button>
          <Button
            variant="outlined"
            startIcon={<UpdateIcon />}
            onClick={() => handleOpenUpdateDialog()}
            sx={{ mr: 1 }}
          >
            Schedule Update
          </Button>
          <IconButton onClick={fetchData}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Firmware Versions" />
          <Tab label="Compatibility" />
          <Tab label="Update History" />
        </Tabs>
        
        {/* Firmware Versions Tab */}
        <TabPanel value={tabValue} index={0}>
          {/* Search */}
          <Box sx={{ mb: 3 }}>
            <TextField
              fullWidth
              placeholder="Search firmware versions..."
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
          </Box>
          
          {/* Firmware table */}
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Version</TableCell>
                  <TableCell>Filename</TableCell>
                  <TableCell>Compatible Models</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Upload Date</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <CircularProgress size={24} sx={{ my: 2 }} />
                    </TableCell>
                  </TableRow>
                ) : filteredFirmwares.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No firmware versions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFirmwares
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((firmware) => (
                      <TableRow key={firmware.id} hover>
                        <TableCell>{firmware.version}</TableCell>
                        <TableCell>{firmware.filename}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {firmware.compatibleModels?.map(model => (
                              <Chip key={model} label={model} size="small" />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>{firmware.size ? `${firmware.size} KB` : 'Unknown'}</TableCell>
                        <TableCell>
                          {firmware.createdAt ? format(new Date(firmware.createdAt), 'dd MMM yyyy') : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex' }}>
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleOpenUpdateDialog(firmware.id)}
                            >
                              <UpdateIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleOpenDeleteDialog(firmware)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredFirmwares.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </TableContainer>
        </TabPanel>
        
        {/* Compatibility Tab */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            {loading ? (
              <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Grid>
            ) : (
              <>
                {stations.map((station) => (
                  <Grid item xs={12} md={6} key={station.chargePointId}>
                    <Card sx={{ borderRadius: 2 }}>
                      <CardHeader
                        title={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="h6">{station.name}</Typography>
                            <Chip 
                              label={station.model || 'Unknown Model'} 
                              size="small" 
                              color="primary"
                            />
                          </Box>
                        }
                        subheader={`ID: ${station.chargePointId} • Current: ${station.firmwareVersion || 'Unknown'}`}
                      />
                      <Divider />
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          Compatible Firmware Versions:
                        </Typography>
                        {firmwares.filter(firmware => 
                          firmware.compatibleModels && 
                          firmware.compatibleModels.includes(station.model)
                        ).length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            No compatible firmware versions found
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {firmwares
                              .filter(firmware => 
                                firmware.compatibleModels && 
                                firmware.compatibleModels.includes(station.model)
                              )
                              .map(firmware => (
                                <Chip 
                                  key={firmware.id} 
                                  label={firmware.version}
                                  onClick={() => {
                                    handleOpenUpdateDialog(firmware.id);
                                    setUpdateDetails(prev => ({
                                      ...prev,
                                      stationIds: [station.chargePointId]
                                    }));
                                  }}
                                  color={station.firmwareVersion === firmware.version ? 'success' : 'default'}
                                />
                              ))
                            }
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </>
            )}
          </Grid>
        </TabPanel>
        
        {/* Update History Tab */}
        <TabPanel value={tabValue} index={2}>
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Station</TableCell>
                  <TableCell>Firmware</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Scheduled</TableCell>
                  <TableCell>Completed</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <CircularProgress size={24} sx={{ my: 2 }} />
                    </TableCell>
                  </TableRow>
                ) : updateHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      No update history found
                    </TableCell>
                  </TableRow>
                ) : (
                  updateHistory
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((update) => {
                      const station = stations.find(s => s.chargePointId === update.chargePointId);
                      const firmware = firmwares.find(f => f.id === update.firmwareId);
                      
                      return (
                        <TableRow key={update.id} hover>
                          <TableCell>
                            {station ? station.name : update.chargePointId}
                          </TableCell>
                          <TableCell>
                            {firmware ? firmware.version : 'Unknown'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={update.status}
                              size="small"
                              color={getUpdateStatusColor(update.status)}
                            />
                          </TableCell>
                          <TableCell>
                            {update.scheduledTime ? format(new Date(update.scheduledTime), 'dd MMM yyyy HH:mm') : 'Immediate'}
                          </TableCell>
                          <TableCell>
                            {update.completedTime ? format(new Date(update.completedTime), 'dd MMM yyyy HH:mm') : '-'}
                          </TableCell>
                          <TableCell>
                            {update.message || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
            
            {/* Pagination */}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={updateHistory.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </TableContainer>
        </TabPanel>
      </Paper>
      
      {/* Dialogs */}
      {renderAddFirmwareDialog()}
      {renderUpdateFirmwareDialog()}
      {renderDeleteDialog()}
    </Box>
  );
}

export default FirmwareManagement;
