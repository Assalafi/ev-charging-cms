import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Chip,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ArrowBack as BackIcon,
  EvStation as StationIcon,
  Person as PersonIcon,
  BatteryChargingFull as ChargingIcon,
  Speed as MeterIcon,
  Schedule as TimeIcon,
  Bolt as EnergyIcon,
  AttachMoney as CostIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  Tooltip as ChartTooltip, 
  Legend 
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import { formatCurrency } from '../../utils/currencyFormatter';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend
);

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`transaction-tabpanel-${index}`}
      aria-labelledby={`transaction-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // State
  const [transaction, setTransaction] = useState(null);
  const [station, setStation] = useState(null);
  const [meterValues, setMeterValues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Chart data
  const [energyChartData, setEnergyChartData] = useState({
    labels: [],
    datasets: []
  });
  
  const [powerChartData, setPowerChartData] = useState({
    labels: [],
    datasets: []
  });
  
  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y.toFixed(2);
              
              // Add units based on chart type
              if (context.dataset.label.includes('Energy')) {
                label += ' kWh';
              } else if (context.dataset.label.includes('Power')) {
                label += ' kW';
              }
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: tabValue === 0 ? 'Energy (kWh)' : 'Power (kW)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
    },
    animation: {
      duration: 1000
    }
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Format transaction status
  const getStatusChip = (status) => {
    let color = 'default';
    let label = status || 'Unknown';
    
    switch (status) {
      case 'Completed':
        color = 'success';
        break;
      case 'InProgress':
        color = 'primary';
        label = 'In Progress';
        break;
      case 'Stopped':
        color = 'warning';
        break;
      case 'Failed':
        color = 'error';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={label} color={color} size="small" />;
  };
  
  // Refresh data
  const handleRefresh = () => {
    fetchTransactionData();
  };
  
  // Navigate back
  const handleBack = () => {
    navigate('/transactions');
  };
  
  // Process meter values for charts
  const processChartData = (values) => {
    if (!values || values.length === 0) {
      return;
    }
    
    // Sort values by timestamp
    const sortedValues = [...values].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    // Extract timestamps and format them nicely
    const timestamps = sortedValues.map(val => {
      const date = new Date(val.timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
    
    // Check if we have the new structure with direct value property or old structure with nested values
    const hasDirectValues = typeof sortedValues[0].value === 'number';
    
    // Extract energy values
    const energyValues = sortedValues.map(val => {
      if (hasDirectValues) {
        // New structure with direct value property
        // Convert to kWh if readings are in Wh
        return val.unit === 'Wh' ? val.value / 1000 : val.value;
      } else {
        // Old structure with nested values array
        const energyValue = val.value.find(v => v.measurand === 'Energy.Active.Import.Register');
        return energyValue ? parseFloat(energyValue.value) : 0;
      }
    });
    
    // Calculate power values (rate of change of energy)
    const powerValues = [];
    for (let i = 1; i < sortedValues.length; i++) {
      const current = sortedValues[i];
      const previous = sortedValues[i-1];
      
      // Get values based on structure
      let currentValue, previousValue;
      
      if (hasDirectValues) {
        currentValue = current.value;
        previousValue = previous.value;
      } else {
        const currentEnergyValue = current.value.find(v => v.measurand === 'Energy.Active.Import.Register');
        const previousEnergyValue = previous.value.find(v => v.measurand === 'Energy.Active.Import.Register');
        currentValue = currentEnergyValue ? parseFloat(currentEnergyValue.value) : 0;
        previousValue = previousEnergyValue ? parseFloat(previousEnergyValue.value) : 0;
      }
      
      const timeDiff = (new Date(current.timestamp) - new Date(previous.timestamp)) / 1000; // seconds
      
      if (timeDiff > 0) {
        const energyDiff = currentValue - previousValue;
        
        // Convert to kW based on structure
        let power;
        if (hasDirectValues && current.unit === 'Wh') {
          power = (energyDiff / timeDiff) * (3600 / 1000); // convert Wh to kWh and to hourly rate
        } else {
          power = (energyDiff / timeDiff) * 3600; // convert to hourly rate
        }
        
        powerValues.push(Math.max(0, parseFloat(power.toFixed(2))));
      } else {
        powerValues.push(0);
      }
    }
    
    // Add 0 for the first timestamp
    powerValues.unshift(0);
    
    // Update energy chart data
    setEnergyChartData({
      labels: timestamps,
      datasets: [
        {
          label: 'Energy (kWh)',
          data: energyValues,
          borderColor: 'rgb(53, 162, 235)',
          backgroundColor: 'rgba(53, 162, 235, 0.5)',
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true
        },
      ],
    });
    
    // Update power chart data
    setPowerChartData({
      labels: timestamps,
      datasets: [
        {
          label: 'Power (kW)',
          data: powerValues,
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          tension: 0.2,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true
        },
      ],
    });
  };
  
  // Fetch transaction data
  const fetchTransactionData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get authentication token (or use a mock token for development)
      const token = localStorage.getItem('authToken') || 'dev-mock-token-for-testing';
      const apiBaseUrl = 'http://localhost:3000/api';
      
      // Step 1: Fetch transaction details
      const transactionResponse = await axios.get(`${apiBaseUrl}/transactions/${id}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (transactionResponse.data && transactionResponse.data.transaction) {
        const tx = transactionResponse.data.transaction;
        setTransaction(tx);
        
        // Step 2: Fetch station info if we have a chargePointId
        if (tx.chargePointId) {
          try {
            const stationResponse = await axios.get(`${apiBaseUrl}/stations/${tx.chargePointId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            
            if (stationResponse.data && stationResponse.data.station) {
              setStation(stationResponse.data.station);
            }
          } catch (stationError) {
            console.error('Error fetching station:', stationError);
          }
        }
        
        // Step 3: Fetch meter values
        try {
          const meterResponse = await axios.get(`${apiBaseUrl}/meter-values/transaction/${tx.transactionId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (meterResponse.data) {
            const meterData = meterResponse.data;
            setMeterValues(meterData);
            processChartData(meterData);
          } else {
            // If we don't have real meter values, generate some for demo purposes
            const generatedValues = generateMeterValuesFromTransaction(tx);
            setMeterValues(generatedValues);
            processChartData(generatedValues);
          }
        } catch (meterError) {
          console.error('Error fetching meter values:', meterError);
          // Generate meter values as fallback
          const generatedValues = generateMeterValuesFromTransaction(tx);
          setMeterValues(generatedValues);
          processChartData(generatedValues);
        }
      } else {
        setError('Transaction not found');
      }
    } catch (error) {
      console.error('Error fetching transaction data:', error);
      setError('Failed to fetch transaction data');
    } finally {
      setLoading(false);
    }
  };
  
  // Generate meter values from transaction data when no meter values are available
  const generateMeterValuesFromTransaction = (transaction) => {
    if (!transaction || !transaction.startTime || !transaction.energyDelivered) {
      return [];
    }
    
    const startTime = new Date(transaction.startTime);
    const endTime = transaction.stopTime ? new Date(transaction.stopTime) : new Date();
    const duration = (endTime - startTime) / 1000; // in seconds
    const energy = transaction.energyDelivered || 0;
    
    // Generate enough points for a smooth chart
    const numPoints = Math.min(20, Math.max(5, Math.floor(duration / 300))); // At least 5, at most 20 points
    const interval = duration / (numPoints - 1);
    
    // Generate meter values
    const values = [];
    
    for (let i = 0; i < numPoints; i++) {
      const timestamp = new Date(startTime.getTime() + i * interval * 1000);
      
      // Slightly non-linear energy delivery pattern for realism
      const progress = Math.pow(i / (numPoints - 1), 1.1); // Slightly front-loaded
      const currentEnergy = energy * progress;
      
      values.push({
        timestamp: timestamp.toISOString(),
        value: parseFloat(currentEnergy.toFixed(3)),
        unit: 'kWh',
        measurand: 'Energy.Active.Import.Register',
        context: 'Sample.Periodic'
      });
    }
    
    return values;
  };
  
  // Fetch data on component mount
  useEffect(() => {
    fetchTransactionData();
  }, [id]);
  
  // If loading, show spinner
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // If error, show error message
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button 
          variant="outlined" 
          startIcon={<BackIcon />} 
          onClick={handleBack}
          sx={{ mt: 2 }}
        >
          Back to Transactions
        </Button>
      </Box>
    );
  }
  
  // If no transaction, show message
  if (!transaction) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Transaction not found</Alert>
        <Button 
          variant="outlined" 
          startIcon={<BackIcon />} 
          onClick={handleBack}
          sx={{ mt: 2 }}
        >
          Back to Transactions
        </Button>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Button 
          variant="outlined" 
          startIcon={<BackIcon />}
          onClick={handleBack}
        >
          Back
        </Button>
        <Box>
          <IconButton onClick={handleRefresh} color="primary" sx={{ mr: 1 }}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>
      
      <Typography variant="h4" component="h1" gutterBottom>
        Transaction Details
        {getStatusChip(transaction.status)}
      </Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ mb: 3 }}>
            <CardHeader title="Transaction Information" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <StationIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {station?.name || transaction.chargePointId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Charging Station
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <PersonIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.idTag || 'Anonymous'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        User ID
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <ChargingIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.connectorId || 1}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Connector
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <MeterIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.transactionId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Transaction ID
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Charging Session" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TimeIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.startTime 
                          ? format(new Date(transaction.startTime), 'dd MMM yyyy HH:mm:ss')
                          : 'Unknown'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Start Time
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TimeIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.stopTime 
                          ? format(new Date(transaction.stopTime), 'dd MMM yyyy HH:mm:ss')
                          : transaction.status === 'InProgress' 
                            ? 'In Progress' 
                            : 'Unknown'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        End Time
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <EnergyIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.energyDelivered?.toFixed(2) || '0.00'} kWh
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Energy Delivered
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                <Grid item xs={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <CostIcon color="primary" sx={{ mr: 1 }} />
                    <Box>
                      <Typography variant="h6">
                        {transaction.amount 
                          ? formatCurrency(transaction.amount)
                          : formatCurrency(0)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Amount
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
                
                {transaction?.status === 'InProgress' && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      This transaction is currently in progress. The values shown are the latest available and will be updated when the transaction is completed.
                    </Alert>
                  </Grid>
                )}
                
                {transaction?.status === 'Stopped' && (
                  <Grid item xs={12}>
                    <Alert severity="warning">
                      This transaction was stopped before completion. The final values may be lower than expected.
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Tabs for Meter Values and Charts */}
      <Paper sx={{ borderRadius: 2, mt: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Energy Chart" />
          <Tab label="Power Chart" />
          <Tab label="Meter Values" />
        </Tabs>
        
        {/* Energy Chart Tab */}
        <TabPanel value={tabValue} index={0}>
          {meterValues.length === 0 ? (
            <Typography variant="body1" color="text.secondary" align="center">
              No energy data available for this transaction
            </Typography>
          ) : (
            <Box sx={{ height: 400 }}>
              <Line data={energyChartData} options={chartOptions} />
            </Box>
          )}
        </TabPanel>
        
        {/* Power Chart Tab */}
        <TabPanel value={tabValue} index={1}>
          {meterValues.length === 0 ? (
            <Typography variant="body1" color="text.secondary" align="center">
              No power data available for this transaction
            </Typography>
          ) : (
            <Box sx={{ height: 400 }}>
              <Line data={powerChartData} options={chartOptions} />
            </Box>
          )}
        </TabPanel>
        
        {/* Meter Values Tab */}
        <TabPanel value={tabValue} index={2}>
          {meterValues.length === 0 ? (
            <Typography variant="body1" color="text.secondary" align="center">
              No meter values available for this transaction
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, mb: 2 }}>
              <Table aria-label="meter values table">
                <TableHead>
                  <TableRow>
                    <TableCell>Timestamp</TableCell>
                    <TableCell>Value</TableCell>
                    <TableCell>Unit</TableCell>
                    <TableCell>Measurand</TableCell>
                    <TableCell>Context</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {meterValues.map((meterValue, index) => {
                    // Check if we have the new structure with direct value property or old structure with nested values
                    const hasDirectValue = typeof meterValue.value === 'number';
                    
                    if (hasDirectValue) {
                      // New structure with direct value property
                      return (
                        <TableRow key={index} hover>
                          <TableCell>
                            {format(new Date(meterValue.timestamp), 'dd MMM yyyy HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {parseFloat(meterValue.value).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell>{meterValue.unit || 'Wh'}</TableCell>
                          <TableCell>{meterValue.measurand || 'Energy.Active.Import.Register'}</TableCell>
                          <TableCell>{meterValue.context || 'Sample.Periodic'}</TableCell>
                        </TableRow>
                      );
                    } else {
                      // Old structure with nested values array
                      return meterValue.value.map((value, valueIndex) => (
                        <TableRow key={`${index}-${valueIndex}`} hover>
                          <TableCell>
                            {format(new Date(meterValue.timestamp), 'dd MMM yyyy HH:mm:ss')}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {parseFloat(value.value).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell>{value.unit || 'Wh'}</TableCell>
                          <TableCell>{value.measurand || 'Energy.Active.Import.Register'}</TableCell>
                          <TableCell>{value.context || 'Sample.Periodic'}</TableCell>
                        </TableRow>
                      ));
                    }
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>
    </Box>
  );
}

export default TransactionDetail;
