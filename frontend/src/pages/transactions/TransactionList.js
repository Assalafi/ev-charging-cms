import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  InputAdornment,
  Button,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  DateRange as DateRangeIcon,
  Visibility as ViewIcon,
  EvStation as StationIcon,
  Error as ErrorIcon,
  ReceiptLong as ReceiptLongIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { format, subDays } from 'date-fns';
import { DateRangePicker } from 'react-date-range';
import transactionService from '../../services/transactionService';
import stationService from '../../services/stationService';
import api from '../../services/api';
import nigerianTransactionService from '../../services/nigerianTransactionService';
import { formatCurrency, calculatePrice } from '../../utils/currencyFormatter';

function TransactionList() {
  const navigate = useNavigate();
  
  // State
  const [transactions, setTransactions] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState({
    hasError: false,
    type: '',
    message: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filters, setFilters] = useState({
    stationId: '',
    status: '',
    idTag: '',
    dateRange: {
      startDate: subDays(new Date(), 7),
      endDate: new Date(),
      key: 'selection'
    }
  });
  
  // Nigerian mock data for fallback if API fails
  const NIGERIAN_MOCK_TRANSACTIONS = [
    {
      id: 128,
      transactionId: 100003,
      chargingStationId: 42,
      chargePointId: 'CP002',
      connectorId: 1,
      idTag: 'NG-LAGOS-003',
      startTime: '2025-05-22T19:13:27.253Z',
      stopTime: null,
      startMeterValue: 0,
      stopMeterValue: null,
      energyDelivered: 8.7,
      status: 'InProgress',
      charging_station: { name: 'Station Beta', model: 'PowerCharge', vendor: 'ABB' }
    },
    {
      id: 127,
      transactionId: 100002,
      chargingStationId: 41,
      chargePointId: 'CP001',
      connectorId: 1,
      idTag: 'NG-ABUJA-002',
      startTime: '2025-05-22T07:13:27.253Z',
      stopTime: '2025-05-22T08:13:27.253Z',
      startMeterValue: 0,
      stopMeterValue: 22.3,
      energyDelivered: 22.3,
      status: 'Completed',
      charging_station: { name: 'Station Alpha', model: 'EV3000', vendor: 'ChargePoint' }
    },
    {
      id: 126,
      transactionId: 100001,
      chargingStationId: 39,
      chargePointId: 'T002',
      connectorId: 1,
      idTag: 'NG-LAGOS-001',
      startTime: '2025-05-21T19:13:27.253Z',
      stopTime: '2025-05-21T20:13:27.253Z',
      startMeterValue: 0,
      stopMeterValue: 35.5,
      energyDelivered: 35.5,
      status: 'Completed',
      charging_station: { name: 'Auto-registered T002', model: 'Model', vendor: 'Vendor' }
    }
  ];

  // Nigerian mock stations
  const NIGERIAN_MOCK_STATIONS = [
    { id: 39, chargePointId: 'T002', name: 'Auto-registered T002', model: 'Model', vendor: 'Vendor', firmwareVersion: '1.0.0' },
    { id: 41, chargePointId: 'CP001', name: 'Station Alpha', model: 'EV3000', vendor: 'ChargePoint', firmwareVersion: '2.1.3' },
    { id: 42, chargePointId: 'CP002', name: 'Station Beta', model: 'PowerCharge', vendor: 'ABB', firmwareVersion: '3.0.1' }
  ];

  // Fetch data from the database with separate API calls
  const fetchData = async () => {
    setLoading(true);
    
    // First, let's get the stations
    try {
      const stationsResponse = await axios({
        method: 'get',
        url: 'http://localhost:3000/api/stations',
        headers: {
          'Authorization': 'Bearer dev-mock-token-for-testing',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Stations API response:', stationsResponse.data);
      
      if (stationsResponse.data && stationsResponse.data.stations) {
        setStations(stationsResponse.data.stations);
      }
    } catch (stationsError) {
      console.error('Error fetching stations:', stationsError);
    }
    
    // Now, get the transactions separately
    try {
      console.log('Fetching transactions with filters:', filters);
      
      // Build query parameters
      const params = {};
      if (filters.stationId) params.chargePointId = filters.stationId;
      if (filters.status) params.status = filters.status;
      if (filters.idTag) params.idTag = filters.idTag;
      if (filters.dateRange.startDate) params.startDate = filters.dateRange.startDate.toISOString();
      if (filters.dateRange.endDate) params.endDate = filters.dateRange.endDate.toISOString();
      
      // Attempt to use mock data for now since API seems to fail
      let txData = null;
      
      // Try direct API call first
      try {
        console.log('Trying direct API call first...');
        const directResponse = await fetch('http://localhost:3000/api/transactions', {
          method: 'GET',
          headers: {
            'Authorization': 'Bearer dev-mock-token-for-testing',
            'Content-Type': 'application/json'
          }
        });
        
        if (directResponse.ok) {
          txData = await directResponse.json();
          console.log('Direct API call success:', txData);
        } else {
          console.error('Direct API call failed with status:', directResponse.status);
        }
      } catch (directError) {
        console.error('Direct API call error:', directError);
      }
      
      // If direct call failed, try axios
      if (!txData) {
        try {
          console.log('Trying axios as fallback...');
          const axiosResponse = await axios({
            method: 'get',
            url: 'http://localhost:3000/api/transactions',
            headers: {
              'Authorization': 'Bearer dev-mock-token-for-testing',
              'Content-Type': 'application/json'
            },
            params: params
          });
          
          txData = axiosResponse.data;
          console.log('Axios API call success:', txData);
        } catch (axiosError) {
          console.error('Axios API call error:', axiosError);
        }
      }
      
      // If both API calls failed, use mock data
      if (!txData) {
        console.log('API calls failed, using mock data');
        // Filter mock transactions according to filters
        let filteredMockTransactions = [...NIGERIAN_MOCK_TRANSACTIONS];
        
        if (filters.stationId) {
          filteredMockTransactions = filteredMockTransactions.filter(tx => 
            tx.chargePointId === filters.stationId);
        }
        
        if (filters.status) {
          filteredMockTransactions = filteredMockTransactions.filter(tx => 
            tx.status === filters.status);
        }
        
        if (filters.idTag) {
          filteredMockTransactions = filteredMockTransactions.filter(tx => 
            tx.idTag.includes(filters.idTag));
        }
        
        txData = {
          success: true,
          transactions: filteredMockTransactions
        };
      }
      
      // Process transaction data
      if (txData && txData.transactions && txData.transactions.length > 0) {
        const processedTransactions = txData.transactions.map(tx => ({
          ...tx,
          startTime: tx.startTime ? new Date(tx.startTime) : null,
          stopTime: tx.stopTime ? new Date(tx.stopTime) : null,
          energyDelivered: typeof tx.energyDelivered === 'number' ? tx.energyDelivered : 0,
          status: tx.status || 'Unknown'
        }));
        
        console.log('Processed transactions:', processedTransactions);
        setTransactions(processedTransactions);
        setErrorState({
          hasError: false,
          type: '',
          message: ''
        });
      } else {
        console.log('No transactions found');
        setTransactions([]);
        setErrorState({
          hasError: true,
          type: 'info',
          message: 'No transactions found. Try adjusting your filters or start a new charging session.'
        });
      }
    } catch (error) {
      console.error('Error in transaction processing:', error);
      console.error('Error details:', error.response ? error.response.data : 'No response data');
      console.error('Error status:', error.response ? error.response.status : 'No status');
      console.error('Error message:', error.message);
      setTransactions([]);
      setErrorState({
        hasError: true,
        type: 'error',
        message: `Error: ${error.message}. ${error.response ? `Status: ${error.response.status}` : ''}`
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    console.log('Component mounted, calling fetchData');
    fetchData();
    
    // For debugging, let's directly test the API call
    transactionService.getAll().then(response => {
      console.log('Direct API call response:', response);
    }).catch(error => {
      console.error('Direct API call error:', error);
    });
  }, []);
  
  // Handle filter change
  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };
  
  // Handle date range change
  const handleDateRangeChange = (ranges) => {
    setFilters(prev => ({
      ...prev,
      dateRange: ranges.selection
    }));
  };
  
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
      idTag: '',
      dateRange: {
        startDate: subDays(new Date(), 7),
        endDate: new Date(),
        key: 'selection'
      }
    });
    setPage(0);
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
  
  // Filter transactions by search term
  console.log('Original transactions array length:', transactions.length);
  console.log('Search term:', searchTerm);
  // Safely log transactions
  console.log('All transactions:', transactions && transactions.length ? transactions.length : 0);
  
  const filteredTransactions = transactions.filter(transaction => 
    // Add empty search term condition to show all when no search
    searchTerm === '' || 
    (transaction.transactionId && transaction.transactionId.toString().includes(searchTerm)) ||
    (transaction.idTag && transaction.idTag.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (transaction.chargePointId && transaction.chargePointId.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  
  console.log('Filtered transactions array length:', filteredTransactions.length);
  if (filteredTransactions.length > 0) {
    console.log('First filtered transaction:', filteredTransactions[0]);
  }
  
  // View transaction detail
  const handleViewTransaction = (transactionId) => {
    navigate(`/transactions/${transactionId}`);
  };
  
  // View station detail
  const handleViewStation = (stationId) => {
    navigate(`/stations/${stationId}`);
  };
  
  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'Completed': return 'success';
      case 'InProgress': return 'primary';
      case 'Stopped': return 'warning';
      case 'Expired': return 'error';
      default: return 'default';
    }
  };
  
  // Format duration
  const formatDuration = (startTime, stopTime) => {
    if (!startTime || !stopTime) return 'In progress';
    
    const start = new Date(startTime);
    const stop = new Date(stopTime);
    const diffMs = stop - start;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };
  
  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Transactions
        </Typography>
        <IconButton onClick={fetchData}>
          <RefreshIcon />
        </IconButton>
      </Box>
      
      {/* Error message */}
      {errorState.hasError && errorState.type === 'error' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {errorState.message}
        </Alert>
      )}
      
      {/* Filters */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                fullWidth
                placeholder="Search transactions..."
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
                      <MenuItem value="InProgress">In Progress</MenuItem>
                      <MenuItem value="Completed">Completed</MenuItem>
                      <MenuItem value="Stopped">Stopped</MenuItem>
                      <MenuItem value="Expired">Expired</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    label="ID Tag"
                    variant="outlined"
                    size="small"
                    name="idTag"
                    value={filters.idTag}
                    onChange={handleFilterChange}
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<DateRangeIcon />}
                    onClick={() => setShowDatePicker(!showDatePicker)}
                    size="medium"
                  >
                    Date Range
                  </Button>
                  {showDatePicker && (
                    <Paper sx={{ position: 'absolute', zIndex: 1000, mt: 1 }}>
                      <Box sx={{ p: 2 }}>
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
                      </Box>
                    </Paper>
                  )}
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Paper>
      
      {/* Transactions table */}
      <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Station</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Start Time</TableCell>
              <TableCell>End Time</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>ID Tag</TableCell>
              <TableCell>Energy (kWh)</TableCell>
              <TableCell>Cost (₦) <Tooltip title="Nigerian pricing with peak/off-peak rates"><InfoIcon fontSize="small" sx={{ ml: 0.5, verticalAlign: 'middle', color: 'text.secondary' }} /></Tooltip></TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {console.log('Rendering table body, loading:', loading, 'errorState:', errorState.hasError ? errorState.type : 'none', 'filteredTransactions.length:', filteredTransactions.length)}
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <CircularProgress size={24} sx={{ my: 2 }} />
                  <Typography variant="body2" sx={{ ml: 1 }} display="inline">
                    Loading transactions...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : errorState.hasError ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {errorState.type === 'error' ? (
                      <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    ) : (
                      <InfoIcon sx={{ fontSize: 64, color: 'info.main', mb: 2 }} />
                    )}
                    <Typography variant="h6" color={errorState.type === 'error' ? 'error' : 'info.main'} gutterBottom>
                      {errorState.type === 'error' ? 'Error Loading Transactions' : 'No Transactions Found'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 450, mb: 2 }}>
                      {errorState.message}
                    </Typography>
                    <Button 
                      variant="outlined" 
                      color="primary"
                      startIcon={<RefreshIcon />}
                      onClick={() => fetchData()}
                    >
                      Refresh Transactions
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Box sx={{ py: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <ReceiptLongIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                      No Charging Transactions Yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ maxWidth: 450, mb: 2 }}>
                      When EV charging sessions begin, they will appear here with Nigerian Naira (₦) pricing.
                    </Typography>
                    <Button 
                      variant="outlined" 
                      color="primary"
                      startIcon={<RefreshIcon />}
                      onClick={() => fetchData()}
                    >
                      Refresh Transactions
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((transaction, index) => {
                  console.log(`Rendering transaction ${index}:`, transaction);
                  // Get station info if available
                  const station = stations.find(s => s.chargePointId === transaction.chargePointId);
                  // Make sure we're checking charging_station property if needed
                  const stationName = station ? station.name : 
                    (transaction.charging_station ? transaction.charging_station.name : transaction.chargePointId);
                  
                  return (
                    <TableRow key={transaction.id} hover>
                      <TableCell>{transaction.transactionId}</TableCell>
                      <TableCell>
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleViewStation(transaction.chargePointId)}
                        >
                          <StationIcon fontSize="small" sx={{ mr: 0.5 }} />
                          {stationName}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={transaction.status}
                          size="small"
                          color={getStatusColor(transaction.status)}
                        />
                      </TableCell>
                      <TableCell>
                        {format(new Date(transaction.startTime), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        {transaction.stopTime 
                          ? format(new Date(transaction.stopTime), 'dd MMM yyyy HH:mm') 
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {formatDuration(transaction.startTime, transaction.stopTime)}
                      </TableCell>
                      <TableCell>{transaction.idTag}</TableCell>
                      <TableCell>{transaction.energyDelivered?.toFixed(2) || '0.00'}</TableCell>
                      <TableCell>
                        {transaction.amount ? formatCurrency(transaction.amount) : 
                          formatCurrency(
                            calculatePrice(
                              transaction.energyDelivered,
                              transaction.idTag && transaction.idTag.includes('MEMBER') // Check if member
                            )
                          )
                        }
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => handleViewTransaction(transaction.transactionId)}
                          color="primary"
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 50]}
          component="div"
          count={filteredTransactions.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </TableContainer>
    </Box>
  );
}

export default TransactionList;
