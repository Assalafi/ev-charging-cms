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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  GetApp as DownloadIcon,
  Delete as DeleteIcon,
  CloudDownload as RequestIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  EventNote as DateIcon
} from '@mui/icons-material';
import { format, subDays } from 'date-fns';
import { DateRangePicker } from 'react-date-range';
import axios from 'axios';

function DiagnosticLogs() {
  const location = useLocation();
  const navigate = useNavigate();
  
  // State
  const [logs, setLogs] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Filters
  const [filters, setFilters] = useState({
    stationId: '',
    status: '',
    logType: '',
    dateRange: {
      startDate: subDays(new Date(), 7),
      endDate: new Date(),
      key: 'selection'
    }
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Request logs dialog
  const [openRequestDialog, setOpenRequestDialog] = useState(false);
  const [requestDetails, setRequestDetails] = useState({
    stationId: '',
    logType: 'Diagnostics',
    startTime: '',
    endTime: '',
    logLevel: 'Info'
  });
  
  // View log dialog
  const [openViewDialog, setOpenViewDialog] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logContent, setLogContent] = useState('');
  const [contentLoading, setContentLoading] = useState(false);
  
  // Delete log dialog
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [logToDelete, setLogToDelete] = useState(null);
  
  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    try {
      // Build query params for filtering
      const params = new URLSearchParams();
      if (filters.stationId) params.append('stationId', filters.stationId);
      if (filters.status) params.append('status', filters.status);
      if (filters.logType) params.append('logType', filters.logType);
      if (filters.dateRange.startDate) params.append('startDate', filters.dateRange.startDate.toISOString());
      if (filters.dateRange.endDate) params.append('endDate', filters.dateRange.endDate.toISOString());
      
      // Fetch diagnostic logs
      const logsResponse = await axios.get(`/api/diagnostics?${params.toString()}`);
      setLogs(logsResponse.data.logs);
      
      // Fetch stations for filters
      const stationsResponse = await axios.get('/api/stations');
      setStations(stationsResponse.data.stations);
      
      setError(null);
    } catch (error) {
      console.error('Error fetching diagnostic logs:', error);
      setError('Failed to fetch diagnostic logs');
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchData();
    
    // Check if request was for a specific station
    if (location.state?.station) {
      setFilters(prev => ({
        ...prev,
        stationId: location.state.station
      }));
      
      // Pre-select the station for request dialog
      setRequestDetails(prev => ({
        ...prev,
        stationId: location.state.station
      }));
      
      // Open the request dialog if specified
      if (location.state?.request) {
        setOpenRequestDialog(true);
      }
    }
  }, [location.state]);
  
  // Apply filters
  const handleApplyFilters = () => {
    setPage(0);
    fetchData();
  };
  
  // Reset filters
  const handleResetFilters = () => {
    setFilters({
      stationId: '',
      status: '',
      logType: '',
      dateRange: {
        startDate: subDays(new Date(), 7),
        endDate: new Date(),
        key: 'selection'
      }
    });
    setPage(0);
  };
  
  // Handle date range change
  const handleDateRangeChange = (ranges) => {
    setFilters(prev => ({
      ...prev,
      dateRange: ranges.selection
    }));
  };
  
  // Handle filter change
  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
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
  
  // Filter logs by search term
  const filteredLogs = logs.filter(log => 
    log.fileName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.chargePointId && log.chargePointId.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  // Handle request dialog
  const handleOpenRequestDialog = () => {
    setOpenRequestDialog(true);
  };
  
  const handleCloseRequestDialog = () => {
    setOpenRequestDialog(false);
  };
  
  const handleRequestChange = (e) => {
    setRequestDetails({
      ...requestDetails,
      [e.target.name]: e.target.value
    });
  };
  
  const handleRequestLogs = async () => {
    try {
      await axios.post('/api/diagnostics/request', requestDetails);
      fetchData();
      handleCloseRequestDialog();
      setError(null);
    } catch (error) {
      console.error('Error requesting diagnostic logs:', error);
      setError('Failed to request diagnostic logs');
    }
  };
  
  // Handle view log dialog
  const handleOpenViewDialog = async (log) => {
    setSelectedLog(log);
    setOpenViewDialog(true);
    setContentLoading(true);
    
    try {
      const response = await axios.get(`/api/diagnostics/${log.id}/content`);
      setLogContent(response.data.content);
      setError(null);
    } catch (error) {
      console.error('Error fetching log content:', error);
      setLogContent('Failed to load log content');
      setError('Failed to fetch log content');
    } finally {
      setContentLoading(false);
    }
  };
  
  const handleCloseViewDialog = () => {
    setOpenViewDialog(false);
    setSelectedLog(null);
    setLogContent('');
  };
  
  // Handle download log
  const handleDownloadLog = async (log) => {
    try {
      const response = await axios.get(`/api/diagnostics/${log.id}/download`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', log.fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setError(null);
    } catch (error) {
      console.error('Error downloading log:', error);
      setError('Failed to download log');
    }
  };
  
  // Handle delete log dialog
  const handleOpenDeleteDialog = (log) => {
    setLogToDelete(log);
    setOpenDeleteDialog(true);
  };
  
  const handleCloseDeleteDialog = () => {
    setOpenDeleteDialog(false);
    setLogToDelete(null);
  };
  
  const handleDeleteLog = async () => {
    if (!logToDelete) return;
    
    try {
      await axios.delete(`/api/diagnostics/${logToDelete.id}`);
      fetchData();
      handleCloseDeleteDialog();
      setError(null);
    } catch (error) {
      console.error('Error deleting log:', error);
      setError('Failed to delete log');
    }
  };
  
  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'Failed': return 'error';
      case 'Pending': return 'warning';
      case 'InProgress': return 'primary';
      default: return 'default';
    }
  };
  
  // Render request logs dialog
  const renderRequestDialog = () => {
    return (
      <Dialog open={openRequestDialog} onClose={handleCloseRequestDialog} fullWidth maxWidth="md">
        <DialogTitle>Request Diagnostic Logs</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel id="station-select-label">Charging Station</InputLabel>
                <Select
                  labelId="station-select-label"
                  name="stationId"
                  value={requestDetails.stationId}
                  onChange={handleRequestChange}
                >
                  <MenuItem value="">
                    <em>Select a charging station</em>
                  </MenuItem>
                  {stations.map((station) => (
                    <MenuItem key={station.chargePointId} value={station.chargePointId}>
                      {station.name} ({station.chargePointId})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="log-type-select-label">Log Type</InputLabel>
                <Select
                  labelId="log-type-select-label"
                  name="logType"
                  value={requestDetails.logType}
                  onChange={handleRequestChange}
                >
                  <MenuItem value="Diagnostics">Diagnostics</MenuItem>
                  <MenuItem value="SecurityLog">Security Log</MenuItem>
                  <MenuItem value="SystemLog">System Log</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel id="log-level-select-label">Log Level</InputLabel>
                <Select
                  labelId="log-level-select-label"
                  name="logLevel"
                  value={requestDetails.logLevel}
                  onChange={handleRequestChange}
                >
                  <MenuItem value="Debug">Debug</MenuItem>
                  <MenuItem value="Info">Info</MenuItem>
                  <MenuItem value="Warning">Warning</MenuItem>
                  <MenuItem value="Error">Error</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                name="startTime"
                label="Start Time"
                type="datetime-local"
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
                value={requestDetails.startTime}
                onChange={handleRequestChange}
                helperText="Leave empty for default (last 24 hours)"
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                name="endTime"
                label="End Time"
                type="datetime-local"
                fullWidth
                InputLabelProps={{
                  shrink: true,
                }}
                value={requestDetails.endTime}
                onChange={handleRequestChange}
                helperText="Leave empty for current time"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseRequestDialog}>Cancel</Button>
          <Button 
            onClick={handleRequestLogs} 
            variant="contained"
            color="primary"
            disabled={!requestDetails.stationId}
          >
            Request Logs
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Render view log dialog
  const renderViewDialog = () => {
    return (
      <Dialog open={openViewDialog} onClose={handleCloseViewDialog} fullWidth maxWidth="lg">
        <DialogTitle>
          {selectedLog?.fileName}
          <Typography variant="subtitle2" color="text.secondary">
            {selectedLog?.chargePointId} • {selectedLog?.requestedAt && format(new Date(selectedLog.requestedAt), 'dd MMM yyyy HH:mm')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {contentLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box 
              sx={{ 
                mt: 2, 
                p: 2, 
                bgcolor: 'grey.100', 
                borderRadius: 1, 
                height: '60vh', 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {logContent || 'No content available'}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseViewDialog}>Close</Button>
          <Button 
            onClick={() => handleDownloadLog(selectedLog)} 
            startIcon={<DownloadIcon />}
            variant="outlined"
          >
            Download
          </Button>
        </DialogActions>
      </Dialog>
    );
  };
  
  // Render delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <Dialog open={openDeleteDialog} onClose={handleCloseDeleteDialog}>
        <DialogTitle>Delete Log</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete the log file "{logToDelete?.fileName}"? 
            This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteDialog}>Cancel</Button>
          <Button onClick={handleDeleteLog} color="error">
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
          Diagnostic Logs
        </Typography>
        <Box>
          <Button
            variant="contained"
            startIcon={<RequestIcon />}
            onClick={handleOpenRequestDialog}
            sx={{ mr: 1 }}
          >
            Request Logs
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
      
      {/* Filters */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                placeholder="Search logs..."
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
                variant="outlined" 
                startIcon={<FilterIcon />}
                onClick={() => setShowFilters(!showFilters)}
                sx={{ mr: 1 }}
              >
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
              {showFilters && (
                <>
                  <Button 
                    variant="outlined" 
                    onClick={handleApplyFilters}
                    sx={{ mr: 1 }}
                  >
                    Apply Filters
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="error"
                    onClick={handleResetFilters}
                  >
                    Reset
                  </Button>
                </>
              )}
            </Grid>
          </Grid>
          
          {showFilters && (
            <Box sx={{ mt: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="station-filter-label">Station</InputLabel>
                    <Select
                      labelId="station-filter-label"
                      name="stationId"
                      value={filters.stationId}
                      onChange={handleFilterChange}
                      label="Station"
                    >
                      <MenuItem value="">
                        <em>All Stations</em>
                      </MenuItem>
                      {stations.map((station) => (
                        <MenuItem key={station.chargePointId} value={station.chargePointId}>
                          {station.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="status-filter-label">Status</InputLabel>
                    <Select
                      labelId="status-filter-label"
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      label="Status"
                    >
                      <MenuItem value="">
                        <em>All Statuses</em>
                      </MenuItem>
                      <MenuItem value="Pending">Pending</MenuItem>
                      <MenuItem value="InProgress">In Progress</MenuItem>
                      <MenuItem value="Completed">Completed</MenuItem>
                      <MenuItem value="Failed">Failed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="type-filter-label">Log Type</InputLabel>
                    <Select
                      labelId="type-filter-label"
                      name="logType"
                      value={filters.logType}
                      onChange={handleFilterChange}
                      label="Log Type"
                    >
                      <MenuItem value="">
                        <em>All Types</em>
                      </MenuItem>
                      <MenuItem value="Diagnostics">Diagnostics</MenuItem>
                      <MenuItem value="SecurityLog">Security Log</MenuItem>
                      <MenuItem value="SystemLog">System Log</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<DateIcon />}
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    size="medium"
                  >
                    Date Range
                  </Button>
                  {showDatePicker && (
                    <Card sx={{ position: 'absolute', zIndex: 1000, mt: 1 }}>
                      <CardContent>
                        <DateRangePicker
                          ranges={[filters.dateRange]}
                          onChange={handleDateRangeChange}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                          <Button 
                            variant="contained" 
                            size="small"
                            onClick={() => setShowDatePicker(false)}
                          >
                            Apply
                          </Button>
                        </Box>
                      </CardContent>
                    </Card>
                  )}
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Paper>
      
      {/* Logs table */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File Name</TableCell>
              <TableCell>Station</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Requested</TableCell>
              <TableCell>Size</TableCell>
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
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No logs found
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((log) => {
                  const station = stations.find(s => s.chargePointId === log.chargePointId);
                  
                  return (
                    <TableRow key={log.id} hover>
                      <TableCell>{log.fileName}</TableCell>
                      <TableCell>
                        {station ? station.name : log.chargePointId}
                      </TableCell>
                      <TableCell>{log.logType}</TableCell>
                      <TableCell>
                        <Chip 
                          label={log.status}
                          size="small"
                          color={getStatusColor(log.status)}
                        />
                      </TableCell>
                      <TableCell>
                        {log.requestedAt && format(new Date(log.requestedAt), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {log.fileSize ? `${(log.fileSize / 1024).toFixed(2)} KB` : '-'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex' }}>
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenViewDialog(log)}
                            disabled={log.status !== 'Completed'}
                            color="primary"
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={() => handleDownloadLog(log)}
                            disabled={log.status !== 'Completed'}
                            color="primary"
                          >
                            <DownloadIcon fontSize="small" />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={() => handleOpenDeleteDialog(log)}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
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
          count={filteredLogs.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
      
      {/* Dialogs */}
      {renderRequestDialog()}
      {renderViewDialog()}
      {renderDeleteDialog()}
    </Box>
  );
}

export default DiagnosticLogs;
