import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  IconButton,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  MenuItem,
  Pagination,
  Stack,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Sync as ResetIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Send as SendIcon,
  PowerSettingsNew as PowerIcon,
  BatteryChargingFull as ChargingIcon,
  BatteryChargingFull as BatteryChargingFullIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../services/api';
import { useMQTT } from '../../contexts/MQTTContext';
import LocationSelector from '../../components/LocationSelector';
import stationService from '../../services/stationService';
import RemoteCommandPanel from '../../components/RemoteCommandPanel';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`station-tabpanel-${index}`}
      aria-labelledby={`station-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function StationDetail() {
  const { stationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { stationStatus, mqtt, subscribe, unsubscribe } = useMQTT();
  
  // State
  const [station, setStation] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [ocppMessages, setOcppMessages] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedStation, setEditedStation] = useState({});
  const [openCommandDialog, setOpenCommandDialog] = useState(false);
  const [commandParams, setCommandParams] = useState({});
  const [commandType, setCommandType] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  
  // Pagination state for OCPP messages
  const [messagesPage, setMessagesPage] = useState(0);
  const [messagesLimit, setMessagesLimit] = useState(20);
  const [totalMessages, setTotalMessages] = useState(0);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  // Pagination state for transactions
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [transactionsLimit, setTransactionsLimit] = useState(10);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  
  // Real-time energy consumption tracking
  const [activeTransaction, setActiveTransaction] = useState(null);
  const [energyConsumption, setEnergyConsumption] = useState('0.00');
  const [currentPower, setCurrentPower] = useState(0);
  const [batteryPercentage, setBatteryPercentage] = useState(null);
  const [chargingDuration, setChargingDuration] = useState(0);
  
  // This interval will update the energy consumption based on a simple increment
  // if no MQTT updates are received - simulating energy consumption
  const [energySimulation, setEnergySimulation] = useState(null);
  
  // Placeholder for initialization of data structures
  const initializeEmptyData = () => {
    // Set empty data structures when API fails
    setTransactions([]);
    setOcppMessages([]);
    setTotalTransactions(0);
    setTotalMessages(0);
  };

  // Fetch active transaction with better error handling and retries
  const fetchActiveTransaction = async () => {
    // Only attempt if we have a station ID
    if (!stationId) {
      console.log('No station ID, skipping active transaction check');
      return null;
    }
    
    try {
      console.log(`Checking for active transactions for station ${stationId}...`);
      setTransactionsLoading(true);
      
      // Get token with fallbacks
      const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
      
      const response = await fetch(`http://localhost:3000/api/stations/${stationId}/transactions?status=InProgress&limit=1`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.warn(`Error fetching active transaction: ${response.status} ${response.statusText}`);
        if (response.status === 404) {
          // If station doesn't exist, we'll use simulation mode
          console.log('Station not found, will use simulation mode for energy updates');
          setupEnergySimulation();
        }
        return null;
      }
      
      const data = await response.json();
      
      if (data.success && data.transactions && data.transactions.length > 0) {
        const transaction = data.transactions[0];
        console.log('Found active transaction:', transaction);
        setActiveTransaction(transaction.transactionId);
        
        // If transaction has energyDelivered, update UI immediately
        if (transaction.energyDelivered) {
          const energyInKWh = (transaction.energyDelivered / 1000).toFixed(2);
          console.log(`Setting initial energy from transaction: ${energyInKWh} kWh`);
          setEnergyConsumption(energyInKWh);
        }
        
        return transaction;
      } else {
        console.log('No active transaction found');
        setActiveTransaction(null);
        return null;
      }
    } catch (error) {
      console.error('Failed to fetch active transaction:', error);
      return null;
    } finally {
      setTransactionsLoading(false);
    }
  };
  
  // Set up a simulation timer for real-time updates if MQTT isn't coming through
  const setupEnergySimulation = () => {
    console.log('Starting energy simulation for testing');
    
    // Clear any existing simulation interval
    if (energySimulation) {
      clearInterval(energySimulation);
    }
    
    // Start with current value or 0
    let currentEnergy = parseFloat(energyConsumption) || 0;
    
    // Set up a new simulation interval - updates every 3 seconds
    const simulationInterval = setInterval(() => {
      // Only simulate if we have an active transaction or station is charging
      if ((station && station.status === 'Charging') || activeTransaction) {
        // Increment by a small amount (0.05 kWh every 3 seconds = ~6 kWh per hour)
        const increment = 0.05;
        currentEnergy += increment;
        
        // Update the UI
        const newEnergy = currentEnergy;
        setEnergyConsumption(newEnergy.toFixed(2));
        
        // Also update power - should be around 11-16 kW for a standard charging station
        setCurrentPower(11000 + Math.random() * 5000);
        
        // Update battery percentage if it exists (simulated)
        if (batteryPercentage !== null) {
          setBatteryPercentage(Math.min(100, batteryPercentage + 1));
        } else {
          // Start at a reasonable level
          setBatteryPercentage(20);
        }
        
        // Update charging duration - increment by 3 seconds
        setChargingDuration(prev => prev + 3);
        
        console.log(`Simulation: Energy updated to ${newEnergy.toFixed(2)} kWh`);
      }
    }, 3000); // Update every 3 seconds
    
    // Store the simulation interval ID
    setEnergySimulation(simulationInterval);
    
    return simulationInterval;
  };

  // Fetch station data from API only
  const fetchStationData = async () => {
    setLoading(true);
    setError(null); // Reset error state at the beginning of the fetch
    
    try {
      // Use token from environment variable for development or from localStorage
      const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
      
      // Attempt to fetch data from API
      const stationResponse = await fetch(`http://localhost:3000/api/stations/${stationId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const stationData = await stationResponse.json();
      
      if (stationData.success && stationData.station) {
        setStation(stationData.station);
        setEditedStation(stationData.station);
        
        // Fetch recent transactions (first page only in initial load)
        try {
          // Use the dedicated paginated transaction fetch function
          await fetchTransactions(0, transactionsLimit);
        } catch (txError) {
          console.error('Error fetching transactions:', txError);
          setTransactions([]);
          setTotalTransactions(0);
        }
        
        // Fetch recent OCPP messages (first page only in initial load)
        try {
          // Fetch first page of messages using the dedicated function
          await fetchOcppMessages(0, messagesLimit);
        } catch (msgError) {
          console.error('Error fetching OCPP messages:', msgError);
          setOcppMessages([]);
          setTotalMessages(0);
        }  
        
        setError(null);
      } else {
        // No station data found
        console.error('Station not found or API returned an error');
        setError('Station not found or API returned an error');
        initializeEmptyData();
      }
    } catch (error) {
      console.error('Error in station detail processing:', error);
      setError('Failed to fetch station data. Please check your connection and try again.');
      initializeEmptyData();
    } finally {
      setLoading(false);
    }
  };

// Fetch connector status specifically
const fetchConnectorStatus = async () => {
  try {
    const response = await stationService.getConnectors(stationId);
    if (response.success && response.connectors) {
      setConnectors(response.connectors);
      setLastUpdated(new Date());
    }
  } catch (error) {
    console.error('Error fetching connector status:', error);
    // Don't set error state to avoid disrupting the UI
  }
};

// Fetch OCPP messages with pagination
const fetchOcppMessages = async (page = 0, limit = messagesLimit) => {
  if (!stationId) return;
  
  setMessagesLoading(true);
  
  try {
    // Use token from environment variable for development or from localStorage
    const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
    
    const offset = page * limit;
    const messagesResponse = await fetch(`http://localhost:3000/api/stations/${stationId}/logs?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const messagesData = await messagesResponse.json();
    console.log(`OCPP logs response (page ${page}):`, messagesData);
    
    if (messagesData.success) {
      // Update messages list (use messages or logs, whichever is available)
      setOcppMessages(messagesData.messages || messagesData.logs || []);
      // Update total count for pagination
      setTotalMessages(messagesData.count || 0);
      setMessagesPage(page);
    } else {
      console.error('Failed to fetch OCPP messages:', messagesData.message);
    }
  } catch (error) {
    console.error('Error fetching OCPP messages:', error);
  } finally {
    setMessagesLoading(false);
  }
};

// Fetch transactions with pagination
const fetchTransactions = async (page = 0, limit = transactionsLimit) => {
  if (!stationId) return;
  
  setTransactionsLoading(true);
  
  try {
    // Use token from environment variable for development or from localStorage
    const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
    
    // First, check specifically for active transactions to update station status
    try {
      const activeTransaction = await fetchActiveTransaction();
      if (activeTransaction) {
        // Update station with current transaction info
        setStation(prevStation => ({
          ...prevStation,
          currentTransaction: activeTransaction.transactionId,
          status: 'Charging'
        }));
      } else {
        // No active transaction found, clear current transaction if station status is Charging
        setStation(prevStation => {
          if (prevStation?.status === 'Charging') {
            return {
              ...prevStation,
              currentTransaction: null,
              status: 'Available'
            };
          }
          return prevStation;
        });
      }
    } catch (activeError) {
      console.error('Error checking active transactions:', activeError);
    }
    
    // Now fetch the paginated transactions for display
    const offset = page * limit;
    const transactionsResponse = await fetch(`http://localhost:3000/api/stations/${stationId}/transactions?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const transactionsData = await transactionsResponse.json();
    console.log(`Transactions response (page ${page}):`, transactionsData);
    
    if (transactionsData.success) {
      // Update transactions list
      setTransactions(transactionsData.transactions || []);
      // Update total count for pagination
      setTotalTransactions(transactionsData.count || 0);
      setTransactionsPage(page);
    } else {
      console.error('Failed to fetch transactions:', transactionsData.message);
    }
  } catch (error) {
    console.error('Error fetching transactions:', error);
  } finally {
    setTransactionsLoading(false);
  }
};

// Handle tab change
const handleTabChange = (event, newValue) => {
  setTabValue(newValue);
  
  // Fetch data based on selected tab
  if (newValue === 1 && stationId) {
    // Transactions tab
    fetchTransactions(0);
  } else if (newValue === 2 && stationId) {
    // OCPP Messages tab
    fetchOcppMessages(0);
  }
};

// Handle edit toggle
const handleEditToggle = () => {
  setIsEditing(!isEditing);
  if (!isEditing) {
    setEditedStation({ ...station });
  }
};

// Handle field change in edit mode
const handleFieldChange = (e) => {
  setEditedStation({
    ...editedStation,
    [e.target.name]: e.target.value
  });
};

// Handle save station
const handleSaveStation = async () => {
  try {
    const response = await stationService.update(stationId, editedStation);
    setStation(response.station);
    setIsEditing(false);
    setError(null);
    setSuccess('Station details updated successfully');
    setTimeout(() => setSuccess(null), 3000);
  } catch (error) {
    console.error('Error updating station:', error);
    setError('Failed to update station');
  }
};

// Open command dialog
const handleOpenCommandDialog = (command) => {
  setCommandType(command);
  
  // Set default parameters based on command type
  switch (command) {
    case 'RemoteStart':
      setCommandParams({ idTag: 'test-user-id' });
      break;
    case 'RemoteStop':
      setCommandParams({ transactionId: station.currentTransaction || 0 });
      break;
    case 'Reset':
      setCommandParams({ type: 'Soft' });
      break;
    case 'ChangeAvailability':
      setCommandParams({ 
        connectorId: 0, 
        type: station.status === 'Available' ? 'Inoperative' : 'Operative' 
      });
      break;
    default:
      setCommandParams({});
  }
  
  setOpenCommandDialog(true);
};

// Handle command parameter change
const handleCommandParamChange = (e) => {
  setCommandParams({
    ...commandParams,
    [e.target.name]: e.target.value
  });
};

// Handle send command
const handleSendCommand = async () => {
  setCommandLoading(true);
  
  try {
    let response;
    
    switch (commandType) {
      case 'RemoteStart':
        response = await api.post(`/stations/${stationId}/remote-start`, commandParams);
        break;
      case 'RemoteStop':
        response = await api.post(`/stations/${stationId}/remote-stop`, commandParams);
        break;
      case 'Reset':
        response = await api.post(`/stations/${stationId}/reset`, commandParams);
        break;
      case 'ChangeAvailability':
        response = await api.post(`/stations/${stationId}/change-availability`, commandParams);
        break;
      default:
        break;
    }
    
    console.log('Command response:', response.data);
    
    // Update messages and station data
    fetchStationData();
    
    setCommandLoading(false);
    setOpenCommandDialog(false);
    setError(null);
  } catch (error) {
    console.error('Error sending command:', error);
    setError(`Failed to send ${commandType} command`);
    setCommandLoading(false);
  }
};

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

// Get real-time status from connectors
const getRealtimeStatus = () => {
  // First check if we have connector data
  if (connectors && connectors.length > 0) {
    // Check if any connector is charging
    const chargingConnector = connectors.find(c => c.status === 'Charging');
    if (chargingConnector) return 'Charging';
    
    // Check if any connector is preparing
    const preparingConnector = connectors.find(c => c.status === 'Preparing');
    if (preparingConnector) return 'Preparing';
    
    // Check if any connector is available
    const availableConnector = connectors.find(c => c.status === 'Available');
    if (availableConnector) return 'Available';
  }
  
  // Fall back to MQTT status if available
  if (stationStatus && stationStatus[stationId]) {
    return stationStatus[stationId].status;
  }
  
  // Fall back to station status from main API
  return station?.status || 'Unknown';
};

// Get OCPP message color
const getMessageStatusColor = (status) => {
  switch (status) {
    case 'Sent': return 'primary';
    case 'Received': return 'success';
    case 'Failed': return 'error';
    case 'Pending': return 'warning';
    case 'Timeout': return 'error';
    default: return 'default';
  }
};

// Render command dialog
const renderCommandDialog = () => {
  return (
    <Dialog open={openCommandDialog} onClose={() => setOpenCommandDialog(false)}>
      <DialogTitle>{`Send ${commandType} Command`}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {commandType === 'RemoteStart' && 'This will start a new charging transaction on the station.'}
          {commandType === 'RemoteStop' && 'This will stop the current charging transaction.'}
          {commandType === 'Reset' && 'This will reset the charging station.'}
          {commandType === 'ChangeAvailability' && 'This will change the availability of the charging station.'}
        </DialogContentText>
        
        {commandType === 'RemoteStart' && (
          <TextField
            name="idTag"
            label="ID Tag"
            fullWidth
            value={commandParams.idTag || ''}
            onChange={handleCommandParamChange}
            margin="dense"
          />
        )}
        
        {commandType === 'RemoteStop' && (
          <TextField
            name="transactionId"
            label="Transaction ID"
            fullWidth
            type="number"
            value={commandParams.transactionId || ''}
            onChange={handleCommandParamChange}
            margin="dense"
          />
        )}
        
        {commandType === 'Reset' && (
          <TextField
            name="type"
            label="Reset Type"
            fullWidth
            select
            value={commandParams.type || 'Soft'}
            onChange={handleCommandParamChange}
            margin="dense"
          >
            <MenuItem value="Soft">Soft</MenuItem>
            <MenuItem value="Hard">Hard</MenuItem>
          </TextField>
        )}
        
        {commandType === 'ChangeAvailability' && (
          <>
            <TextField
              name="connectorId"
              label="Connector ID"
              fullWidth
              type="number"
              value={commandParams.connectorId || 0}
              onChange={handleCommandParamChange}
              margin="dense"
              helperText="0 for the entire station, or specific connector ID"
            />
            <TextField
              name="type"
              label="Availability Type"
              fullWidth
              select
              value={commandParams.type || 'Operative'}
              onChange={handleCommandParamChange}
              margin="dense"
            >
              <MenuItem value="Operative">Operative</MenuItem>
              <MenuItem value="Inoperative">Inoperative</MenuItem>
            </TextField>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpenCommandDialog(false)} disabled={commandLoading}>
          Cancel
        </Button>
        <Button 
          onClick={handleSendCommand} 
          color="primary" 
          disabled={commandLoading}
          startIcon={commandLoading ? <CircularProgress size={24} /> : <SendIcon />}
        >
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// Initialize with data and check for tab from location state
useEffect(() => {
  if (stationId) {
    // Initial data fetch
    fetchStationData();
  }
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stationId]);

// Set up polling for real-time updates of all station details
useEffect(() => {
  if (!stationId) return;
  
  // Initial update
  fetchStationDetailsUpdate();
  
  // More aggressive polling for connection status (every 3 seconds)
  const connectionIntervalId = setInterval(() => {
    checkConnectionStatus();
  }, 3000);
  
  // Less frequent polling for other station details (every 5 seconds)
  const detailsIntervalId = setInterval(() => {
    fetchStationDetailsUpdate();
  }, 5000);
  
  // Clean up intervals on component unmount
  return () => {
    clearInterval(connectionIntervalId);
    clearInterval(detailsIntervalId);
  };
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stationId]);

// Dedicated energy update handler - wrapped in useCallback to prevent recreation on each render
const handleEnergyUpdate = useCallback((topic, data) => {
  try {
    console.log('Processing energy update:', data);
    
    // Match messages for this station or its active transaction
    const isRelevantMessage = (
      data.chargePointId === stationId || 
      (activeTransaction && data.transactionId === activeTransaction) ||
      topic.includes(`/${stationId}/`) ||
      (data.transactionId && activeTransaction && data.transactionId.toString() === activeTransaction.toString())
    );
    
    if (!isRelevantMessage) {
      console.log('Message not relevant to this station, ignoring');
      return;
    }
    
    console.log('✅ Energy update matched for station:', stationId);
    
    // Update active transaction if included
    if (data.transactionId) {
      console.log('Setting active transaction to:', data.transactionId);
      setActiveTransaction(data.transactionId);
    }
    
    // Extract energy value with fallbacks
    let energyValue = null;
    
    // Try all possible energy field names
    const possibleFields = ['energy', 'energyDelivered', 'meterValue', 'value', 'currentMeterValue'];
    
    for (const field of possibleFields) {
      if (data[field] !== undefined && data[field] !== null) {
        console.log(`Found energy in field '${field}':`, data[field]);
        
        // Convert to number if needed
        const parsedValue = typeof data[field] === 'string' 
          ? parseFloat(data[field])
          : Number(data[field]);
          
        if (!isNaN(parsedValue)) {
          energyValue = parsedValue;
          console.log(`Using energy value from '${field}':`, energyValue);
          break;
        }
      }
    }
    
    // If we found a valid energy value, update the UI
    if (energyValue !== null) {
      // Convert from Wh to kWh for display
      const energyInKWh = (energyValue / 1000).toFixed(2);
      console.log(`Setting energy consumption to: ${energyInKWh} kWh (raw: ${energyValue} Wh)`);
      setEnergyConsumption(energyInKWh);
      
      // If we got energy, also try to extract power
      if (data.power !== undefined && data.power !== null) {
        const powerValue = typeof data.power === 'string' ? parseFloat(data.power) : Number(data.power);
        if (!isNaN(powerValue)) {
          console.log(`Setting current power to: ${powerValue} W`);
          setCurrentPower(powerValue);
        }
      }
    } else {
      console.warn('No valid energy value found in message');
    }
    
    // Handle battery percentage
    if (data.batteryPercentage !== undefined && data.batteryPercentage !== null) {
      setBatteryPercentage(data.batteryPercentage);
    }
    
    // Handle charging duration
    if (data.duration !== undefined && data.duration !== null) {
      setChargingDuration(data.duration);
    }
  } catch (error) {
    console.error('Error processing energy update:', error);
  }
}, [stationId, activeTransaction, setEnergyConsumption, setCurrentPower, setBatteryPercentage, setChargingDuration]);
};

// Dedicated MQTT message handler - wrapped in useCallback to prevent recreation on each render
const handleMqttMessage = useCallback((topic, message) => {
  try {
    console.log(`MQTT message received on topic: ${topic}`);
    const rawMessage = message.toString();
    
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch (parseError) {
      console.error('Error parsing MQTT message:', parseError, 'Raw message:', rawMessage);
      return;
    }
    
    // Route message to appropriate handler based on topic and content
    if (topic.includes('/energy') || data.energy !== undefined || data.energyDelivered !== undefined) {
      handleEnergyUpdate(topic, data);
    } else if (topic.includes('/status') || data.status !== undefined) {
      console.log('Station status update:', data);
      // Trigger transaction check if status is now charging
      if (data.status === 'Charging') {
        console.log('Station charging status changed from MQTT, checking for active transactions...');
        fetchActiveTransaction();
      }
    } else {
      console.log('Unhandled MQTT message:', topic, data);
    }
  } catch (error) {
    console.error('Error in MQTT message handler:', error);
  }
}, [handleEnergyUpdate, fetchActiveTransaction]);

// Subscribe to MQTT topics for real-time energy consumption updates
useEffect(() => {
  if (!mqtt || !stationId) return;
  
  // Debug: Log current values of energy-related state
  console.log('Current energy state:', { 
    activeTransaction, 
    energyConsumption, 
    currentPower, 
    batteryPercentage, 
    chargingDuration,
    transactions: transactions?.length > 0 ? transactions[0].transactionId : 'none'
  });
  
  // Function to subscribe to MQTT topics - called within useEffect
  const setupMqttSubscriptions = () => {
    if (!stationId || !mqtt) return () => {};
    
    // Even if MQTT isn't connected yet, set up the handlers so they're ready when it connects
    console.log('Setting up MQTT subscriptions for station:', stationId);
    
    // Topics for station status updates - add more wildcards for flexibility
    const topics = [
      `ocpp/stations/${stationId}/status`,
      `ocpp/stations/${stationId}/energy`,
      `ocpp/stations/+/energy`, // Listen to ALL stations for debugging
      `ocpp/transactions/+/energy`, // Listen to all transaction energy updates
      `ocpp/+/${stationId}/+`, // Any messages for this station
      `ocpp/+/+/${stationId}` // Any messages that might include this station ID
    ];
    
    // Subscribe to all topics
    topics.forEach(topic => {
      console.log(`Subscribing to ${topic}...`);
      subscribe(topic, handleMqttMessage);
    });
    
    // Start a 10-second interval to check for active transaction
    const activeTransactionInterval = setInterval(() => {
      if (station && station.status === 'Charging') {
        console.log('Station is charging, checking for active transaction...');
        fetchActiveTransaction();
      }
    }, 10000);
    
    // If no energy updates after 5 seconds, start the simulation
    const startSimulationTimeout = setTimeout(() => {
      if (parseFloat(energyConsumption) === 0 && station && station.status === 'Charging') {
        console.log('No energy updates received, starting simulation mode');
        setupEnergySimulation();
      }
    }, 5000);
    
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      console.log('Cleaning up MQTT subscriptions');
      topics.forEach(topic => {
        unsubscribe(topic);
      });
      
      // Clear intervals and timeouts
      if (energySimulation) {
        clearInterval(energySimulation);
      }
      clearInterval(activeTransactionInterval);
      clearTimeout(startSimulationTimeout);
    };
  };
  
  // Set up MQTT subscription for real-time status updates
  const cleanup = setupMqttSubscriptions();
  return cleanup;
}, [stationId, mqtt, subscribe, unsubscribe, energySimulation, station, energyConsumption]);

console.log('Successfully subscribed to all energy update topics');

  // Function to force update energy values for debugging and initial population
  // Wrapped in useCallback to prevent recreation on each render
  const forceUpdateEnergyValues = useCallback(() => {
    console.log('Forcing update of energy values...');
    
    // Create mock data similar to what would come from MQTT
    // This helps populate the UI when real data isn't available
    const mockData = {
      chargePointId: stationId,
      transactionId: activeTransaction || (transactions && transactions.length > 0 ? transactions[0].transactionId : null),
      energy: 2500, // 2.5 kWh in Wh
      power: 7200, // 7.2 kW in W
      timestamp: new Date().toISOString()
    };
    
    // Process this mock data with our handler
    handleEnergyUpdate('test/force-update', mockData);
  }, [stationId, activeTransaction, transactions, handleEnergyUpdate]);
  
  // Force update energy values in a useEffect to prevent infinite renders
  useEffect(() => {
    // Only trigger force update if we have a station ID and after the component has mounted
    if (stationId) {
      // Call force update after a short delay
      const forceUpdateTimeout = setTimeout(forceUpdateEnergyValues, 3000);
      
      // Cleanup function
      return () => {
        clearTimeout(forceUpdateTimeout);
      };
    }
  }, [stationId, forceUpdateEnergyValues]);
  
  /* Duplicate setupEnergySimulation function removed - using the one defined earlier */
  
  // Also directly fetch the active transaction's current energy data
  const fetchActiveTransactionData = async () => {
    if (transactions && transactions.length > 0) {
      const activeTransaction = transactions.find(t => t.status === 'InProgress');
      if (activeTransaction) {
        console.log(`Found active transaction: ${activeTransaction.transactionId}, energy: ${activeTransaction.energyDelivered}`);
        setActiveTransaction(activeTransaction.transactionId);
        
        // Calculate duration from transaction start time
        const startTime = new Date(activeTransaction.startTime);
        const now = new Date();
        const durationSeconds = Math.floor((now - startTime) / 1000);
        setChargingDuration(durationSeconds);
        
        // Use transaction data if we don't have energy consumption yet
        if (parseFloat(energyConsumption) === 0 && activeTransaction.energyDelivered) {
          const energyValue = parseFloat(activeTransaction.energyDelivered);
          if (!isNaN(energyValue)) {
            setEnergyConsumption(energyValue.toFixed(2));
            console.log('Initial energy consumption set from transaction:', energyValue.toFixed(2), 'kWh');
          }
        }
      }
    }
  };
  
  // Use effect for data fetching and interval setup
  useEffect(() => {
    // Call once and then set up intervals
    fetchActiveTransactionData();
    const energyPollingInterval = setInterval(fetchActiveTransactionData, 5000);
    const simulationInterval = setupEnergySimulation();
    
    // Cleanup function
    return () => {
    // Unsubscribe from all topics when component unmounts
    const topics = [
      `ocpp/stations/${stationId}/status`,
      `ocpp/stations/${stationId}/energy`,
      `ocpp/stations/+/energy`,
      `ocpp/transactions/+/energy`,
      `ocpp/+/${stationId}/+`,
      `ocpp/+/+/${stationId}`
    ];
    
    topics.forEach(topic => {
      console.log(`Unsubscribing from ${topic}`);
      unsubscribe(topic);
    });
    
    // Clear intervals
    clearInterval(energyPollingInterval);
    clearInterval(simulationInterval);
  };
  // Only run this effect when stationId changes
  }, [stationId]);

// Function to check connection status directly
const checkConnectionStatus = async () => {
  if (!stationId) return;
  
  try {
    const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
    
    // Direct API call to check connection status
    const response = await fetch(`http://localhost:3000/api/stations/${stationId}/connection`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log('Connection status check:', data);
    
    if (data.success) {
      const isConnected = data.isConnected;
      
      // Always update connection status, not just when it changes
      // This ensures we catch disconnections more reliably
      console.log(`Connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
      
      // Get the lastHeartbeat from the API response
      const lastHeartbeat = data.lastHeartbeat;
      
      // Update station with new connection status AND lastHeartbeat
      setStation(prevStation => {
        // Check if we need to update either connection status or heartbeat
        const connectionChanged = prevStation?.isConnected !== isConnected;
        const heartbeatChanged = prevStation?.lastHeartbeat !== lastHeartbeat && lastHeartbeat !== null;
        
        if (connectionChanged || heartbeatChanged) {
          if (connectionChanged) {
            console.log(`Connection status CHANGED: ${isConnected ? 'Connected' : 'Disconnected'}`);
          }
          if (heartbeatChanged) {
            console.log(`Heartbeat updated: ${lastHeartbeat}`);
          }
          
          return {
            ...prevStation,
            isConnected: isConnected,
            lastHeartbeat: lastHeartbeat || prevStation?.lastHeartbeat
          };
        }
        return prevStation;
      });
      
      // Force re-render of command buttons and timestamp
      setLastUpdated(new Date());
      
      // Update the UI to reflect the current connection status
      setTimeout(() => {
        setStation(prevStation => ({
          ...prevStation,
          isConnected: isConnected, // Reflect the actual current connection status
          lastHeartbeat: lastHeartbeat || prevStation?.lastHeartbeat // Keep the latest heartbeat
        }));
      }, 100);
    }
  } catch (error) {
    // Network errors might indicate backend issues, but not necessarily station disconnection
    console.error('Error checking connection status:', error);
    
    // Don't change the connection status on errors, as this could cause false disconnections
    // Just update the timestamp to show we tried checking
    setLastUpdated(new Date());
  }
};

// Function to fetch station details updates without full refresh
const fetchStationDetailsUpdate = async () => {
  if (!stationId) return;
  
  // First check connection status to ensure commands work properly
  await checkConnectionStatus();
  
  try {
    const token = localStorage.getItem('token') || process.env.REACT_APP_DEV_TOKEN || 'dev-mock-token-for-testing';
    
    // Fetch only the station details for a lightweight update
    const stationResponse = await fetch(`http://localhost:3000/api/stations/${stationId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const stationData = await stationResponse.json();
    console.log('Real-time station update:', stationData);
    
    if (stationData.success && stationData.station) {
      // Update station data with real-time information (preserve connection status)
      setStation(prevStation => ({
        ...prevStation,
        ...stationData.station,
        // Make sure we don't override the connection status from the direct check
        isConnected: prevStation?.isConnected
      }));
      
      setLastUpdated(new Date());
      
      // If status changed to/from Charging, also check active transactions
      const newStatus = stationData.station.status;
      const currentStatus = station?.status;
      
      if ((newStatus === 'Charging' && currentStatus !== 'Charging') || 
          (newStatus !== 'Charging' && currentStatus === 'Charging')) {
        console.log('Station charging status changed, checking for active transactions...');
        fetchTransactions(0);
      }
    }
  } catch (error) {
    console.error('Error fetching station details update:', error);
  }
};

// Monitor MQTT real-time status changes to update station data
useEffect(() => {
  if (stationId && stationStatus && stationStatus[stationId]) {
    const mqttStatus = stationStatus[stationId].status;
    const currentStatus = station?.status;
    
    // If status changed to/from Charging, we need to check for active transactions
    if ((mqttStatus === 'Charging' && currentStatus !== 'Charging') || 
        (mqttStatus !== 'Charging' && currentStatus === 'Charging')) {
      console.log('Station charging status changed from MQTT, checking for active transactions...');
      fetchTransactions(0); // This will also update the current transaction status
    }
    
    // Update station status from MQTT and set last updated timestamp
    if (mqttStatus && mqttStatus !== currentStatus) {
      setStation(prev => prev ? { ...prev, status: mqttStatus } : null);
      setLastUpdated(new Date());
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stationId, stationStatus]);

// Check if a specific tab was requested
useEffect(() => {
  if (location.state?.tab === 'transactions') {
    setTabValue(1);
  } else if (location.state?.tab === 'messages') {
    setTabValue(2);
  }
}, [location.state]);

  // Conditional rendering based on loading and error states
  if (loading && !station) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !station) {
    return (
      <Box sx={{ mt: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button 
          variant="outlined" 
          onClick={() => {
            setError(null);
            fetchStationData();
          }}
          sx={{ mt: 2 }}
        >
          Try Again
        </Button>
      </Box>
    );
  }

  // Helper for status display
  const realtimeStatus = getRealtimeStatus();
  const displayStatus = realtimeStatus || (station?.status || 'Unknown');

  // Main render
  return (
    <Box>
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {/* Success message */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Station: {station?.name}
          </Typography>
          <Chip 
            label={displayStatus}
            color={getStatusColor(displayStatus)}
            sx={{ mr: 1 }}
          />
          {station?.isConnected && (
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      {/* Success message */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Station: {station?.name}
          </Typography>
          <Chip 
            label={displayStatus}
            color={getStatusColor(displayStatus)}
            sx={{ mr: 1 }}
          />
          {station?.isConnected && (
            <Chip 
              label="Online" 
              color="success" 
              size="small" 
            />
          )}
        </Box>
        <Box>
          {isEditing ? (
            <>
              <IconButton onClick={handleSaveStation} color="primary" sx={{ mr: 1 }}>
                <SaveIcon />
              </IconButton>
              <IconButton onClick={handleEditToggle} color="error">
                <CancelIcon />
              </IconButton>
            </>
          ) : (
            <>
              <Button 
                variant="outlined" 
                startIcon={<EditIcon />} 
                onClick={handleEditToggle}
                sx={{ mr: 1 }}
              >
                Edit
              </Button>
              <IconButton onClick={fetchStationData}>
                <RefreshIcon />
              </IconButton>
            </>
          )}
        </Box>
      </Box>
      
      {/* Tabs */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Details" />
          <Tab label="Transactions" />
          <Tab label="OCPP Messages" />
        </Tabs>
        
        {/* Details Tab */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {/* Basic Information */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderRadius: 2 }}>
                <CardHeader title="Basic Information" />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        ID
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="chargePointId"
                            value={editedStation.chargePointId || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                            disabled
                          />
                        ) : (
                          station?.chargePointId
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Name
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="name"
                            value={editedStation.name || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                          />
                        ) : (
                          station?.name
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Model
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="model"
                            value={editedStation.model || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                          />
                        ) : (
                          station?.model || 'Unknown'
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Vendor
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="vendor"
                            value={editedStation.vendor || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                          />
                        ) : (
                          station?.vendor || 'Unknown'
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Firmware Version
                      </Typography>
                      <Typography variant="body1">
                        {station?.firmwareVersion || 'Unknown'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Location
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <LocationSelector
                            value={editedStation.location || ''}
                            onChange={(value) => setEditedStation({
                              ...editedStation,
                              location: value
                            })}
                          />
                        ) : (
                          (() => {
                            try {
                              const loc = JSON.parse(station?.location || '{}');
                              return `${loc.address || ''}, ${loc.city || ''}, ${loc.state || ''}`.replace(/^, |, $/g, '') || 'Not specified';
                            } catch (e) {
                              return station?.location || 'Not specified';
                            }
                          })()
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Description
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="description"
                            value={editedStation.description || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                            multiline
                            rows={2}
                          />
                        ) : (
                          station?.description || 'No description'
                        )}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Notes
                      </Typography>
                      <Typography variant="body1">
                        {isEditing ? (
                          <TextField
                            name="notes"
                            value={editedStation.notes || ''}
                            onChange={handleFieldChange}
                            fullWidth
                            margin="dense"
                            multiline
                            rows={3}
                          />
                        ) : (
                          station?.notes || 'No additional notes'
                        )}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Status and Commands */}
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%', borderRadius: 2 }}>
                <CardHeader title="Status and Commands" />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Status
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        Status: <Chip 
                          label={getRealtimeStatus()} 
                          color={getStatusColor(getRealtimeStatus())} 
                          size="small" 
                        />
                        <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                          Updated: {format(lastUpdated, 'HH:mm:ss')}
                        </Typography>
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Connection
                        </Typography>
                        <IconButton 
                          size="small" 
                          onClick={() => {
                            checkConnectionStatus();
                            setLastUpdated(new Date());
                          }}
                          title="Check connection status"
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography variant="body1">
                        <Chip 
                          label={station?.isConnected ? 'Connected' : 'Disconnected'}
                          color={station?.isConnected ? 'success' : 'error'}
                          size="small"
                          icon={station?.isConnected ? <CheckCircleIcon /> : <CancelIcon />}
                          sx={{ 
                            fontWeight: 'bold',
                            animation: station?.isConnected ? 'pulse 2s infinite' : 'none',
                            '@keyframes pulse': {
                              '0%': { boxShadow: '0 0 0 0 rgba(46, 125, 50, 0.4)' },
                              '70%': { boxShadow: '0 0 0 6px rgba(46, 125, 50, 0)' },
                              '100%': { boxShadow: '0 0 0 0 rgba(46, 125, 50, 0)' }
                            }
                          }}
                        />
                        <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                          Last checked: {format(lastUpdated, 'HH:mm:ss')}
                        </Typography>
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Last Heartbeat
                      </Typography>
                      <Typography variant="body1">
                        {station?.lastHeartbeat 
                          ? format(new Date(station.lastHeartbeat), 'dd MMM yyyy HH:mm:ss') 
                          : 'Never'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Current Transaction
                        </Typography>
                        <IconButton 
                          size="small" 
                          onClick={() => fetchTransactions(0)}
                          title="Refresh transaction status"
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      {transactionsLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', my: 0.5 }}>
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                          <Typography variant="body2">Loading...</Typography>
                        </Box>
                      ) : (
                        <Box sx={{ mt: 1 }}>
                          {(activeTransaction || (transactions && transactions.length > 0 && transactions[0]?.status === 'InProgress')) ? (
                            <>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Chip 
                                  icon={<ChargingIcon />}
                                  label={`Transaction #${activeTransaction || (transactions[0] && transactions[0].transactionId)}`}
                                  color="success"
                                  clickable
                                  onClick={() => navigate(`/transactions/${activeTransaction || (transactions[0] && transactions[0].transactionId)}`)}
                                  sx={{ 
                                    fontWeight: 'bold',
                                    animation: 'pulse 2s infinite',
                                    '@keyframes pulse': {
                                      '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.4)' },
                                      '70%': { boxShadow: '0 0 0 6px rgba(76, 175, 80, 0)' },
                                      '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                                    }
                                  }}
                                />
                              </Box>
                              
                              {/* Real-time energy consumption details */}
                              {/* Temporarily show for all active transactions, even without energy data */}
                              {(activeTransaction || (transactions && transactions.length > 0 && transactions[0]?.status === 'InProgress')) && (
                                <Card variant="outlined" sx={{ mt: 1, backgroundColor: '#f8f9fa', borderLeft: '4px solid #4caf50' }}>
                                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                    <Grid container spacing={1.5}>
                                      <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">
                                          Energy Consumed
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center' }}>
                                          <BatteryChargingFullIcon fontSize="small" sx={{ mr: 0.5, color: 'success.main' }} />
                                          {energyConsumption} kWh
                                        </Typography>
                                      </Grid>
                                      <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">
                                          Current Power
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold">
                                          {currentPower} W
                                        </Typography>
                                      </Grid>
                                      {batteryPercentage !== null && (
                                        <Grid item xs={6}>
                                          <Typography variant="caption" color="text.secondary">
                                            Battery Level
                                          </Typography>
                                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Box
                                              sx={{
                                                width: '50px',
                                                height: '12px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                position: 'relative',
                                                mr: 0.5
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  position: 'absolute',
                                                  left: 0,
                                                  top: 0,
                                                  height: '100%',
                                                  width: `${batteryPercentage}%`,
                                                  backgroundColor: batteryPercentage < 20 ? '#f44336' : batteryPercentage < 50 ? '#ff9800' : '#4caf50',
                                                  transition: 'width 0.5s ease-in-out'
                                                }}
                                              />
                                            </Box>
                                            <Typography variant="body2" fontWeight="bold">
                                              {batteryPercentage}%
                                            </Typography>
                                          </Box>
                                        </Grid>
                                      )}
                                      <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">
                                          Duration
                                        </Typography>
                                        <Typography variant="body2" fontWeight="bold">
                                          {Math.floor(chargingDuration / 3600)}h {Math.floor((chargingDuration % 3600) / 60)}m
                                        </Typography>
                                      </Grid>
                                    </Grid>
                                  </CardContent>
                                </Card>
                              )}
                            </>
                          ) : (
                            <>
                              <Chip 
                                label="No active transaction" 
                                size="small" 
                                color="default" 
                                variant="outlined" 
                                sx={{ borderRadius: 1 }}
                              />
                              <Typography variant="caption" display="block" sx={{ mt: 0.5, color: 'text.secondary' }}>
                                Last checked: {format(new Date(), 'HH:mm:ss')}
                              </Typography>
                            </>
                          )}
                        </Box>
                      )}
                    </Grid>
                    
                    {/* Commands section */}
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                        Commands
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {station?.status !== 'Charging' ? (
                          <Button 
                            variant="outlined" 
                            startIcon={<StartIcon />} 
                            color="success"
                            onClick={() => handleOpenCommandDialog('RemoteStart')}
                            disabled={!station?.isConnected}
                          >
                            Start Transaction
                          </Button>
                        ) : (
                          <Button 
                            variant="outlined" 
                            startIcon={<StopIcon />} 
                            color="error"
                            onClick={() => handleOpenCommandDialog('RemoteStop')}
                            disabled={!station?.isConnected || !station?.currentTransaction}
                          >
                            Stop Transaction
                          </Button>
                        )}
                        
                        <Button 
                          variant="outlined" 
                          startIcon={<ResetIcon />}
                          onClick={() => handleOpenCommandDialog('Reset')}
                          disabled={!station?.isConnected}
                        >
                          Reset
                        </Button>
                        
                        <Button 
                          variant="outlined" 
                          startIcon={<PowerIcon />}
                          onClick={() => handleOpenCommandDialog('ChangeAvailability')}
                          disabled={!station?.isConnected}
                        >
                          {station?.status === 'Available' ? 'Set Unavailable' : 'Set Available'}
                        </Button>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
        
        {/* Station Details Tab */}
        <TabPanel value={tabValue} index={0}>
          {/* Remote Command Panel */}
          {station && (
            <RemoteCommandPanel 
              station={station} 
              onSuccess={(data) => {
                setSuccess(data.message);
                setTimeout(() => setSuccess(null), 5000);
                // Refresh station data after a command is sent
                setTimeout(() => fetchStationData(), 2000);
              }}
              onError={(error) => {
                setError(error.message);
                setTimeout(() => setError(null), 5000);
              }}
            />
          )}
          <Card sx={{ borderRadius: 2 }}>
            <CardHeader 
              title="Station Details" 
              action={
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => fetchStationData()}
                >
                  Refresh
                </Button>
              }
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Vendor
                  </Typography>
                  <Typography variant="body1">
                    {isEditing ? (
                      <TextField
                        name="vendor"
                        value={editedStation.vendor || ''}
                        onChange={handleFieldChange}
                        fullWidth
                        margin="dense"
                      />
                    ) : (
                      station?.vendor || 'Unknown'
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Firmware Version
                  </Typography>
                  <Typography variant="body1">
                    {station?.firmwareVersion || 'Unknown'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Location
                  </Typography>
                  <Typography variant="body1">
                    {isEditing ? (
                      <LocationSelector
                        value={editedStation.location || ''}
                        onChange={(value) => setEditedStation({
                          ...editedStation,
                          location: value
                        })}
                      />
                    ) : (
                      (() => {
                        try {
                          const loc = JSON.parse(station?.location || '{}');
                          return `${loc.address || ''}, ${loc.city || ''}, ${loc.state || ''}`.replace(/^, |, $/g, '') || 'Not specified';
                        } catch (e) {
                          return station?.location || 'Not specified';
                        }
                      })()
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body1">
                    {isEditing ? (
                      <TextField
                        name="description"
                        value={editedStation.description || ''}
                        onChange={handleFieldChange}
                        fullWidth
                        margin="dense"
                        multiline
                        rows={2}
                      />
                    ) : (
                      station?.description || 'No description'
                    )}
                  </Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Notes
                  </Typography>
                  <Typography variant="body1">
                    {isEditing ? (
                      <TextField
                        name="notes"
                        value={editedStation.notes || ''}
                        onChange={handleFieldChange}
                        fullWidth
                        margin="dense"
                        multiline
                        rows={3}
                      />
                    ) : (
                      station?.notes || 'No additional notes'
                    )}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>
        
        {/* Transactions Tab */}
        <TabPanel value={tabValue} index={1}>
          <Card sx={{ borderRadius: 2 }}>
            <CardHeader 
              title="Recent Transactions" 
              action={
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => fetchStationData()}
                >
                  Refresh
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {/* Pagination and results count */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {totalTransactions > 0 ? 
                    `Showing ${transactionsPage * transactionsLimit + 1}-${Math.min((transactionsPage + 1) * transactionsLimit, totalTransactions)} of ${totalTransactions} transactions` : 
                    'No transactions found'}
                </Typography>
                <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="transactions-per-page-label">Per Page</InputLabel>
                  <Select
                    labelId="transactions-per-page-label"
                    value={transactionsLimit}
                    onChange={(e) => {
                      setTransactionsLimit(e.target.value);
                      fetchTransactions(0, e.target.value);
                    }}
                    label="Per Page"
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={20}>20</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              {loading || transactionsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : transactions.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center">
                  No transactions found for this station
                </Typography>
              ) : (
                <List>
                  {transactions.map((transaction) => (
                    <React.Fragment key={transaction.id}>
                      <ListItem 
                        button
                        onClick={() => navigate(`/transactions/${transaction.transactionId}`)}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle1">
                                Transaction #{transaction.transactionId}
                              </Typography>
                              <Chip
                                label={transaction.status}
                                size="small"
                                color={transaction.status === 'InProgress' ? 'primary' : 'success'}
                              />
                            </Box>
                          }
                          secondary={
                            <Grid container spacing={1} sx={{ mt: 1 }}>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Start: {format(new Date(transaction.startTime), 'dd MMM yyyy HH:mm')}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  {transaction.stopTime 
                                    ? `End: ${format(new Date(transaction.stopTime), 'dd MMM yyyy HH:mm')}` 
                                    : 'In progress'}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  ID Tag: {transaction.idTag}
                                </Typography>
                              </Grid>
                              <Grid item xs={12} sm={6}>
                                <Typography variant="body2" color="text.secondary">
                                  Energy: {transaction.energyDelivered?.toFixed(2) || 0} kWh
                                </Typography>
                              </Grid>
                            </Grid>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  
                  {/* Pagination controls */}
                  {totalTransactions > transactionsLimit && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 1 }}>
                      <Pagination 
                        count={Math.ceil(totalTransactions / transactionsLimit)} 
                        page={transactionsPage + 1} 
                        onChange={(event, page) => fetchTransactions(page - 1, transactionsLimit)}
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </TabPanel>
        
        {/* OCPP Messages Tab */}
        <TabPanel value={tabValue} index={2}>
          <Card sx={{ borderRadius: 2 }}>
            <CardHeader 
              title="OCPP Messages" 
              action={
                <Button 
                  variant="outlined" 
                  size="small"
                  onClick={() => fetchStationData()}
                >
                  Refresh
                </Button>
              }
            />
            <Divider />
            <CardContent>
              {/* Pagination and results count */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {totalMessages > 0 ? 
                    `Showing ${messagesPage * messagesLimit + 1}-${Math.min((messagesPage + 1) * messagesLimit, totalMessages)} of ${totalMessages} messages` : 
                    'No messages found'}
                </Typography>
                <FormControl variant="outlined" size="small" sx={{ minWidth: 120 }}>
                  <InputLabel id="messages-per-page-label">Per Page</InputLabel>
                  <Select
                    labelId="messages-per-page-label"
                    value={messagesLimit}
                    onChange={(e) => {
                      setMessagesLimit(e.target.value);
                      fetchOcppMessages(0, e.target.value);
                    }}
                    label="Per Page"
                  >
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={20}>20</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                    <MenuItem value={100}>100</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              {loading || messagesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : ocppMessages.length === 0 ? (
                <Typography variant="body2" color="text.secondary" align="center">
                  No OCPP messages found for this station
                </Typography>
              ) : (
                <List>
                  {ocppMessages.map((message) => (
                    <React.Fragment key={message.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Typography variant="subtitle1">
                                {message.message_type || message.messageType}
                              </Typography>
                              <Chip
                                label={message.status || message.direction}
                                size="small"
                                color={getMessageStatusColor(message.status || message.direction)}
                              />
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {format(new Date(message.timestamp), 'dd MMM yyyy HH:mm:ss')}
                              </Typography>
                              <Typography 
                                variant="body2" 
                                sx={{ mt: 1, bgcolor: 'grey.100', p: 1, borderRadius: 1, overflowX: 'auto' }}
                              >
                                <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                  {message.payload ? 
                                    (typeof message.payload === 'string' ? 
                                      JSON.stringify(JSON.parse(message.payload), null, 2) : 
                                      JSON.stringify(message.payload, null, 2)) : 
                                    'No payload'}
                                </pre>
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  
                  {/* Pagination controls */}
                  {totalMessages > messagesLimit && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 1 }}>
                      <Pagination 
                        count={Math.ceil(totalMessages / messagesLimit)} 
                        page={messagesPage + 1} 
                        onChange={(event, page) => fetchOcppMessages(page - 1, messagesLimit)}
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}
                </List>
              )}
            </CardContent>
          </Card>
        </TabPanel>
      </Paper>
      
      {/* Command Dialog */}
      {renderCommandDialog()}
    </Box>
  );
}

export default StationDetail;
