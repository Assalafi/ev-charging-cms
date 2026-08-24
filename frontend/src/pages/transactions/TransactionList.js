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
  const [totalCount, setTotalCount] = useState(0);
  
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
  
  // Define fetchTransactions function
  const fetchTransactions = async () => {
    try {
      // First, try without any date filters to see if we can get any data
      const baseParams = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
        sort: 'startTime',
        order: 'DESC',
        ...(filters.stationId && { chargePointId: filters.stationId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.idTag && { idTag: filters.idTag }),
      };
      
      console.log('Trying initial fetch without date filters...');
      const initialResponse = await api.get('/transactions', { params: baseParams });
      
      if (initialResponse.data?.transactions?.length > 0) {
        console.log('Successfully fetched transactions without date filters');
        return initialResponse.data.transactions;
      }
      
      // If no results, try with date filters if they exist
      if (filters.dateRange?.startDate || filters.dateRange?.endDate) {
        console.log('No results without date filters, trying with date range...');
        const params = {
          ...baseParams,
          ...(filters.dateRange?.startDate && { startDate: filters.dateRange.startDate.toISOString() }),
          ...(filters.dateRange?.endDate && { endDate: filters.dateRange.endDate.toISOString() })
        };
        
        console.log('Fetching transactions with date filters:', params);
        const response = await api.get('/transactions', { params });
        return response.data?.transactions || [];
      }
      
      // If we get here, return empty array
      return [];
    } catch (error) {
      console.error('Error in fetchTransactions:', {
        message: error.message,
        response: error.response?.data,
        config: error.config
      });
      throw error;
    }
  };
  
  // Fetch data from the database with separate API calls
  const fetchData = async () => {
    setLoading(true);
    console.log('Starting to fetch data...');
    
    // First, let's get the stations
    try {
      console.log('Fetching stations...');
      const token = localStorage.getItem('token');
      console.log('Using token for stations:', token ? 'Token exists' : 'No token found');
      
      const stationsResponse = await api.get('/stations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Stations API response status:', stationsResponse.status);
      console.log('Stations API response data:', stationsResponse.data);
      
      // Handle stations response
      if (stationsResponse.data) {
        if (Array.isArray(stationsResponse.data)) {
          console.log('Setting stations from direct array');
          setStations(stationsResponse.data);
        } else if (stationsResponse.data.stations) {
          console.log('Setting stations from response.data.stations');
          setStations(stationsResponse.data.stations);
        } else if (stationsResponse.data.data) {
          console.log('Setting stations from response.data.data');
          setStations(stationsResponse.data.data);
        } else {
          console.warn('Unexpected stations response format:', stationsResponse.data);
        }
      } else {
        console.warn('Empty stations response');
      }
    } catch (stationsError) {
      console.error('Error fetching stations:', {
        message: stationsError.message,
        response: stationsError.response ? {
          status: stationsError.response.status,
          statusText: stationsError.response.statusText,
          data: stationsError.response.data
        } : 'No response'
      });
      
      setErrorState({
        hasError: true,
        type: 'error',
        message: 'Failed to load charging stations.'
      });
    }
    
    // Then fetch transactions
    try {
      console.log('Fetching transactions...');
      const response = await api.get('/transactions', {
        params: {
          limit: rowsPerPage,
          offset: page * rowsPerPage,
          sort: 'startTime',
          order: 'DESC',
          ...(filters.stationId && { chargePointId: filters.stationId }),
          ...(filters.status && { status: filters.status }),
          ...(filters.idTag && { idTag: filters.idTag }),
          ...(filters.dateRange?.startDate && { startDate: filters.dateRange.startDate.toISOString() }),
          ...(filters.dateRange?.endDate && { endDate: filters.dateRange.endDate.toISOString() })
        }
      });
      
      const transactions = response.data?.transactions || [];
      const count = response.data?.count || 0;
      setTotalCount(count);
      
      console.log('Raw transactions from fetchTransactions:', transactions);
      
      if (transactions && transactions.length > 0) {
        console.log(`Processing ${transactions.length} transactions`);
        const processedTransactions = transactions.map(tx => {
          // Debug log for each transaction
          console.log('Processing transaction:', {
            id: tx.id,
            transactionId: tx.transactionId,
            chargePointId: tx.chargePointId,
            status: tx.status,
            startTime: tx.startTime,
            stopTime: tx.stopTime,
            charging_station: tx.charging_station
          });
          
          return {
            ...tx,
            transactionId: tx.transactionId || tx.id, // Handle both formats
            chargePointId: tx.chargePointId || (tx.charging_station ? tx.charging_station.chargePointId : null),
            startTime: tx.startTime ? new Date(tx.startTime) : null,
            stopTime: tx.stopTime ? new Date(tx.stopTime) : null,
            energyDelivered: typeof tx.energyDelivered === 'number' 
              ? tx.energyDelivered 
              : (tx.stopMeterValue && tx.startMeterValue 
                  ? parseFloat((tx.stopMeterValue - tx.startMeterValue).toFixed(2))
                  : 0),
            status: tx.status || 'Completed',
            charging_station: tx.charging_station || {
              name: tx.chargePointId ? `Station ${tx.chargePointId}` : 'Unknown Station',
              model: 'N/A',
              vendor: 'N/A',
              chargePointId: tx.chargePointId || 'N/A'
            }
          };
        });
        
        console.log('Processed transactions:', processedTransactions);
        setTransactions(processedTransactions);
        setErrorState({
          hasError: false,
          type: '',
          message: ''
        });
      } else {
        // No transactions found in the database
        console.log('No transactions found in the database');
        setTransactions([]);
        setErrorState({
          hasError: count === 0,
          type: 'info',
          message: 'No transactions found in the database.'
        });
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', {
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        } : 'No response',
        stack: error.stack
      });
      
      // Set a more specific error message based on the response status
      let errorMessage = 'Failed to load transactions from the server. Please try again later.';
      
      if (error.response) {
        if (error.response.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (error.response.status === 403) {
          errorMessage = 'You do not have permission to view transactions.';
        } else if (error.response.status === 404) {
          errorMessage = 'The transactions endpoint was not found.';
        } else if (error.response.status >= 500) {
          errorMessage = 'Server error. Please try again later.';
        }
      } else if (error.message === 'Network Error') {
        errorMessage = 'Unable to connect to the server. Please check your internet connection.';
      }
      
      setTransactions([]);
      setErrorState({
        hasError: true,
        type: 'error',
        message: errorMessage
      });
    } finally {
      console.log('Finished loading data');
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
    fetchData();
  };
  
  // Handle rows per page change
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
    fetchData();
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
              transactions.map((transaction, index) => {
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
          count={totalCount}
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
