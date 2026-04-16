import React, { useState, useEffect } from 'react';
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
  Select,
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
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../services/api';
import { useMQTT } from '../../contexts/MQTTContext';
import LocationSelector from '../../components/LocationSelector';
import stationService from '../../services/stationService';
import remoteCommandService from '../../services/remoteCommandService';
import tagService from '../../services/tagService';
import RemoteCommandPanel from '../../components/RemoteCommandPanel';

// Helper function to get API base URL
const getApiBaseUrl = () =>
  process.env.REACT_APP_API_URL || 'https://evcharging.eride.ng/api';

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
      {value === index && (
        <Box
          sx={{
            p: 3,
          }}
        >
          {' '}
          {children}{' '}
        </Box>
      )}{' '}
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

  // Authorized tags state
  const [authorizedTags, setAuthorizedTags] = useState([]);

  // Pagination state for transactions
  const [transactionsPage, setTransactionsPage] = useState(0);
  const [transactionsLimit, setTransactionsLimit] = useState(10);
  const [totalTransactions, setTotalTransactions] = useState(0);

  // Declare handleEnergyUpdate at component level so it can be referenced throughout the component
  let handleEnergyUpdate = () =>
    console.log('Energy update handler not initialized yet');
  const [transactionsLoading, setTransactionsLoading] = useState(false);

  // Real-time energy consumption tracking
  const [activeTransaction, setActiveTransaction] = useState(null);
  const [energyConsumption, setEnergyConsumption] = useState('0.00');
  const [chargingAmount, setChargingAmount] = useState(0);
  const [chargingPrice, setChargingPrice] = useState(0);
  const [currentPower, setCurrentPower] = useState(0);
  const [batteryPercentage, setBatteryPercentage] = useState(null);
  const [chargingDuration, setChargingDuration] = useState(0);
  // Track whether we've received real MQTT data from the charging station
  const [receivedMqttData, setReceivedMqttData] = useState(false);
  // Debug logging for energy consumption
  useEffect(() => {
    console.log(
      `Current energy consumption state: ${energyConsumption} kWh, power: ${currentPower}W, using ${receivedMqttData ? 'REAL' : 'SIMULATED'} data`
    );
  }, [energyConsumption, currentPower, receivedMqttData]);

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

  // Fetch station data from API only
  const fetchStationData = async () => {
    setLoading(true);
    setError(null); // Reset error state at the beginning of the fetch

    try {
      // Use token from environment variable for development or from localStorage
      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';

      // Attempt to fetch data from API
      const stationResponse = await fetch(
        `${getApiBaseUrl()}/stations/${stationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

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
      setError(
        'Failed to fetch station data. Please check your connection and try again.'
      );
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
      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';

      const offset = page * limit;
      const messagesResponse = await fetch(
        `${getApiBaseUrl()}/ocpp/messages?chargePointId=${stationId}&page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

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
      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';

      // First, check specifically for active transactions to update station status
      try {
        // Use the dedicated paginated transaction fetch function
        const activeResponse = await fetch(
          `${getApiBaseUrl()}/transactions?chargePointId=${stationId}&status=InProgress&limit=1`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const activeData = await activeResponse.json();

        if (
          activeData.success &&
          activeData.transactions &&
          activeData.transactions.length > 0
        ) {
          const activeTransaction = activeData.transactions[0];
          console.log('Found active transaction:', activeTransaction);

          // Update station with current transaction info
          setStation(prevStation => ({
            ...prevStation,
            currentTransaction: activeTransaction.transactionId,
            status: 'Charging',
          }));
        } else {
          // No active transaction found, clear current transaction if station status is Charging
          setStation(prevStation => {
            if (prevStation?.status === 'Charging') {
              return {
                ...prevStation,
                currentTransaction: null,
                status: 'Available',
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
      const transactionsResponse = await fetch(
        `${getApiBaseUrl()}/transactions?chargePointId=${stationId}&page=${page}&limit=${limit}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const transactionsData = await transactionsResponse.json();
      console.log(`Transactions response (page ${page}):`, transactionsData);

      if (transactionsData.success) {
        // Update transactions list
        setTransactions(transactionsData.transactions || []);
        // Update total count for pagination
        setTotalTransactions(transactionsData.count || 0);
        setTransactionsPage(page);
      } else {
        console.error(
          'Failed to fetch transactions:',
          transactionsData.message
        );
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
      setEditedStation({
        ...station,
      });
    }
  };

  // Handle field change in edit mode
  const handleFieldChange = e => {
    setEditedStation({
      ...editedStation,
      [e.target.name]: e.target.value,
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

  // Function to check the connection status of the charging station
  const checkConnectionStatus = async () => {
    if (!stationId) return;
    
    try {
      // First check MQTT status if available
      const mqttStatus = stationStatus && stationStatus[stationId];
      if (mqttStatus && mqttStatus.lastSeen) {
        const lastHeartbeat = new Date(mqttStatus.lastSeen);
        const now = new Date();
        const diffSeconds = Math.floor((now - lastHeartbeat) / 1000);
        
        // Update connection status based on heartbeat time
        // If we've received a heartbeat within the last minute, consider it connected
        const isConnected = diffSeconds < 60;
        
        console.log(`Station ${stationId} connection status: ${isConnected ? 'Connected' : 'Disconnected'} (${diffSeconds}s since last heartbeat)`);
        
        // You can update UI indicators here if needed
        
        return isConnected;
      }
      
      // If MQTT status isn't available, check via API endpoint
      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';
      
      const statusResponse = await fetch(
        `${getApiBaseUrl()}/stations/${stationId}/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        // Update any UI elements based on connection status
        return statusData.connected;
      }
      
      return false; // Assume disconnected if API check fails
    } catch (error) {
      console.error('Error checking connection status:', error);
      return false; // Assume disconnected on error
    }
  };
  
  // Function to fetch updated station details periodically
  const fetchStationDetailsUpdate = async () => {
    if (!stationId) return;
    
    try {
      // Fetch connector status - this is lightweight and updates frequently
      await fetchConnectorStatus();
      
      // Only update transaction status periodically if we have an active transaction
      const isCharging = getRealtimeStatus() === 'Charging';
      if (isCharging) {
        await fetchTransactions(0, 3); // Just get the most recent ones
      }
      
      // Update station data from main API occasionally
      if (Math.random() < 0.2) { // 20% chance to refresh full station data
        const token =
          localStorage.getItem('token') ||
          process.env.REACT_APP_DEV_TOKEN ||
          'dev-mock-token-for-testing';
        
        const stationResponse = await fetch(
          `${getApiBaseUrl()}/stations/${stationId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        
        const stationData = await stationResponse.json();
        if (stationData.success && stationData.station) {
          setStation(stationData.station);
        }
      }
      
    } catch (error) {
      console.error('Error updating station details:', error);
      // Don't set error state to avoid disrupting the UI during background updates
    }
  };

  // Fetch authorized tags from API
  const fetchAuthorizedTags = async () => {
    try {
      const response = await tagService.getAllTags();
      if (response.success && response.tags) {
        setAuthorizedTags(response.tags);
      } else {
        console.error('Error fetching authorized tags:', response.message);
      }
    } catch (error) {
      console.error('Error fetching authorized tags:', error);
    }
  };

  // Open command dialog
  const handleOpenCommandDialog = command => {
    setCommandType(command);

    // Set default parameters based on command type
    switch (command) {
      case 'RemoteStart':
        // Fetch available tags when opening start transaction dialog
        fetchAuthorizedTags();
        setCommandParams({
          idTag: '',
        });
        break;
      case 'RemoteStop':
        setCommandParams({
          transactionId: station.currentTransaction || 0,
        });
        break;
      case 'Reset':
        setCommandParams({
          type: 'Soft',
        });
        break;
      case 'ChangeAvailability':
        setCommandParams({
          connectorId: 0,
          type: station.status === 'Available' ? 'Inoperative' : 'Operative',
        });
        break;
      default:
        setCommandParams({});
    }

    setOpenCommandDialog(true);
  };

  // Handle command parameter change
  const handleCommandParamChange = e => {
    setCommandParams({
      ...commandParams,
      [e.target.name]: e.target.value,
    });
  };

  // Handle send command
  const handleSendCommand = async () => {
    setCommandLoading(true);

    try {
      let response;

      switch (commandType) {
        case 'RemoteStart':
          response = await api.post(
            `${getApiBaseUrl()}/stations/${stationId}/remote-start`,
            commandParams
          );
          break;
        case 'RemoteStop':
          response = await api.post(
            `${getApiBaseUrl()}/stations/${stationId}/remote-stop`,
            commandParams
          );
          break;
        case 'Reset':
          response = await api.post(
            `${getApiBaseUrl()}/stations/${stationId}/reset`,
            commandParams
          );
          break;
        case 'ChangeAvailability':
          response = await api.post(
            `${getApiBaseUrl()}/stations/${stationId}/change-availability`,
            commandParams
          );
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
  const getStatusColor = status => {
    switch (status) {
      case 'Available':
        return 'success';
      case 'Charging':
        return 'primary';
      case 'Faulted':
        return 'error';
      case 'Preparing':
        return 'warning';
      case 'Finishing':
        return 'info';
      case 'Reserved':
        return 'secondary';
      case 'Unavailable':
        return 'default';
      default:
        return 'default';
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
  const getMessageStatusColor = status => {
    switch (status) {
      case 'Sent':
        return 'primary';
      case 'Received':
        return 'success';
      case 'Failed':
        return 'error';
      case 'Pending':
        return 'warning';
      case 'Timeout':
        return 'error';
      default:
        return 'default';
    }
  };

  // Render command dialog
  const renderCommandDialog = () => {
    return (
      <Dialog
        open={openCommandDialog}
        onClose={() => setOpenCommandDialog(false)}
      >
        <DialogTitle> {`Send ${commandType} Command`} </DialogTitle>{' '}
        <DialogContent>
          <DialogContentText
            sx={{
              mb: 2,
            }}
          >
            {' '}
            {commandType === 'RemoteStart' &&
              'This will start a new charging transaction on the station.'}{' '}
            {commandType === 'RemoteStop' &&
              'This will stop the current charging transaction.'}{' '}
            {commandType === 'Reset' && 'This will reset the charging station.'}{' '}
            {commandType === 'ChangeAvailability' &&
              'This will change the availability of the charging station.'}{' '}
          </DialogContentText>
          {commandType === 'RemoteStart' && (
            <TextField
              name="idTag"
              label="ID Tag"
              fullWidth
              select
              value={commandParams.idTag || ''}
              onChange={handleCommandParamChange}
              margin="dense"
              helperText={
                authorizedTags.length === 0
                  ? 'Loading authorized tags...'
                  : 'Select an authorized tag'
              }
            >
              {authorizedTags.length === 0 ? (
                <MenuItem disabled>Loading tags...</MenuItem>
              ) : (
                authorizedTags.map(tag => (
                  <MenuItem key={tag.id} value={tag.tagId}>
                    {tag.tagId}
                  </MenuItem>
                ))
              )}
            </TextField>
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
              <MenuItem value="Soft"> Soft </MenuItem>{' '}
              <MenuItem value="Hard"> Hard </MenuItem>{' '}
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
                <MenuItem value="Operative"> Operative </MenuItem>{' '}
                <MenuItem value="Inoperative"> Inoperative </MenuItem>{' '}
              </TextField>{' '}
            </>
          )}{' '}
        </DialogContent>{' '}
        <DialogActions>
          <Button
            onClick={() => setOpenCommandDialog(false)}
            disabled={commandLoading}
          >
            Cancel{' '}
          </Button>{' '}
          <Button
            onClick={handleSendCommand}
            color="primary"
            disabled={commandLoading}
            startIcon={
              commandLoading ? <CircularProgress size={24} /> : <SendIcon />
            }
          >
            Send{' '}
          </Button>{' '}
        </DialogActions>{' '}
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

    return () => {
      clearInterval(connectionIntervalId);
      clearInterval(detailsIntervalId);
    };
  }, [stationId]);
  
  // Subscribe to MQTT topics for real-time energy consumption updates
  useEffect(() => {
      if (!mqtt || !stationId) return;

      // Function to handle incoming energy updates
      // Assign to our outer variable so it can be called from outside this scope
      handleEnergyUpdate = (topic, message) => {
        try {
          console.log('Energy update received on topic:', topic);
          const rawMessage = message.toString();
          console.log('Raw message:', rawMessage);

          let data;
          try {
            data = JSON.parse(rawMessage);
            console.log('Parsed energy update data:', data);
            // Flag that we've received real MQTT data
            setReceivedMqttData(true);
          } catch (parseError) {
            console.error('Error parsing message:', parseError);
            return;
          }

          // Handle energy consumption
          if (data.energyConsumption !== undefined && data.energyConsumption !== null) {
            console.log(`MQTT energy update: ${data.energyConsumption} kWh`);
            setEnergyConsumption(data.energyConsumption);
          }

          // Handle battery percentage
          if (
            data.batteryPercentage !== undefined &&
            data.batteryPercentage !== null
          ) {
            console.log(`MQTT battery update: ${data.batteryPercentage}%`);
            setBatteryPercentage(data.batteryPercentage);
          }

          // Handle charging duration
          if (data.duration !== undefined && data.duration !== null) {
            console.log(`MQTT duration update: ${data.duration} seconds`);
            setChargingDuration(data.duration);
          }
        } catch (error) {
          console.error('Error processing energy update:', error);
        }
      };

      // Subscribe to both station-specific and transaction topics
      console.log(`Subscribing to MQTT topic: ocpp/stations/${stationId}/energy`);
      subscribe(`ocpp/stations/${stationId}/energy`, handleEnergyUpdate);

      console.log(`Subscribing to MQTT topic: ocpp/stations/${stationId}/status`);
      subscribe(`ocpp/stations/${stationId}/status`, handleEnergyUpdate);

      // Try to see if we already have an active transaction and subscribe to it
      if (activeTransaction) {
        console.log(`Subscribing to MQTT topic: ocpp/transactions/${activeTransaction}/energy`);
        subscribe(
          `ocpp/transactions/${activeTransaction}/energy`,
          handleEnergyUpdate
        );
      }

      // Clean up MQTT subscriptions on unmount
      return () => {
        console.log(`Unsubscribing from MQTT topics for station ${stationId}`);
        if (unsubscribe) {
          unsubscribe(`ocpp/stations/${stationId}/energy`);
          unsubscribe(`ocpp/stations/${stationId}/status`);
          if (activeTransaction) {
            unsubscribe(`ocpp/transactions/${activeTransaction}/energy`);
          }
        }
      };
    }, [stationId, mqtt, subscribe, unsubscribe, activeTransaction]);

    // Set up a timer for real-time updates of transaction data
    // This ensures the UI shows the latest energy consumption from active transactions
    const setupEnergySimulation = () => {
      // Clear any existing interval
      if (energySimulation) {
        clearInterval(energySimulation);
      }

      // Set up a new interval - updates every 10 seconds
      const simulationInterval = setInterval(() => {
        // Skip simulation if we have real MQTT data
        if (receivedMqttData) {
          console.log('Using real MQTT data - skipping simulation');
          return;
        }
        
        // Only update if we have an active transaction
        if (transactions && transactions.some(t => t.status === 'InProgress')) {
          console.log('No real MQTT data available, using simulated updates...');
          // Find the active transaction
          const activeTransaction = transactions.find(
            t => t.status === 'InProgress'
          );

          if (activeTransaction && activeTransaction.energyDelivered) {
            // Use the actual energyDelivered value from the transaction
            const energyValue = parseFloat(activeTransaction.energyDelivered);
            if (!isNaN(energyValue)) {
              // Update the state with the transaction's energy value
              setEnergyConsumption(energyValue.toFixed(2));

              console.log(
                `Transaction energy updated to ${energyValue.toFixed(2)} kWh (simulated)`
              );
            }
          }

          // Update power (simulated)
          setCurrentPower(11 + Math.random() * 5);

          // Update battery percentage if it exists (simulated)
          if (batteryPercentage !== null) {
            setBatteryPercentage(Math.min(100, batteryPercentage + 1));
          } else {
            // Start at a reasonable level
            setBatteryPercentage(20);
          }

          // Update charging duration - increment by 10 seconds
          setChargingDuration(prev => prev + 10);
        }
      }, 10000); // Update every 10 seconds

      // Store the simulation interval ID
      setEnergySimulation(simulationInterval);

      return simulationInterval;
    };

    // ... (rest of the code remains the same)

    // DEBUG FUNCTION - Force update energy values for testing
    // This doesn't rely on the MQTT handler being initialized
    const forceUpdateEnergyValues = () => {
      // Skip simulation if we have real MQTT data
      if (receivedMqttData) {
        console.log('Skipping simulation - real MQTT data is available');
        return;
      }
      
      console.log('Forcing energy update with test values');

      // These are our test values for energy display
      const energyValue = 0.0;
      const powerValue = 0;
      const batteryValue = 1;
      const durationValue = 0;

      // Update energy consumption directly - this is the most critical part
      console.log(`Setting energy consumption to ${energyValue} kWh`);
      setEnergyConsumption(energyValue.toString());
      setCurrentPower(powerValue);
      setBatteryPercentage(batteryValue);
      setChargingDuration(durationValue);

      // Attempt to log to the console that we're in charging state
      try {
        if (station?.status !== 'Charging') {
          console.log(
            'Note: Station status is not "Charging" - energy values may not display as expected'
          );
        } else {
          console.log(
            'Station is in "Charging" state - energy values should display correctly'
          );
        }
      } catch (e) {
        console.log('Could not determine station charging status');
        const newStatus = stationData.station.status;
        const currentStatus = station?.status;

        if (
          (newStatus === 'Charging' && currentStatus !== 'Charging') ||
          (newStatus !== 'Charging' && currentStatus === 'Charging')
        ) {
          console.log(
            'Station charging status changed, checking for active transactions...'
          );
          fetchTransactions(0);
        }
      }

      // Force energy value update with a delay for real-time testing, but only if we don't have real MQTT data
      setTimeout(() => {
        if (!receivedMqttData) {
          console.log('No real MQTT data received yet, using simulation...');
          forceUpdateEnergyValues();
        } else {
          console.log('Already received real MQTT data, skipping simulation');
        }
      }, 2000);
    };

    // Monitor MQTT real-time status changes to update station data
    useEffect(() => {
      if (stationId && stationStatus && stationStatus[stationId]) {
        const mqttStatus = stationStatus[stationId].status;
        const currentStatus = station?.status;

        // If station is charging but we don't have energy consumption value, use our mock function
        // but only if we don't have real MQTT data
        if (
          !receivedMqttData &&
          stationData.station.status === 'Charging' &&
          (!stationData.station.energyConsumption ||
            stationData.station.energyConsumption === '0.00' ||
            stationData.station.energyConsumption === 0)
        ) {
          console.log(
            'Station is charging but no energy consumption value received, forcing update'
          );
          setTimeout(() => {
            forceUpdateEnergyValues();
          }, 300);
        }

        // Update station status from MQTT and set last updated timestamp
        if (mqttStatus && mqttStatus !== currentStatus) {
          setStation(prev =>
            prev
              ? {
                  ...prev,
                  status: mqttStatus,
                }
              : null
          );
          setLastUpdated(new Date());
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stationId, stationStatus]);

  // Check if a specific tab was requested
  useEffect(() => {
    if (location.state?.tab === 'transactions') {
      setTabValue(1);
    } else if (location.state?.tab === 'messages') {
      setTabValue(2);
    }
  }, [location.state]);

  // Loading state
  if (loading && !station) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '50vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  // Error state
  if (error && !station) {
    return (
      <Box
        sx={{
          mt: 3,
        }}
      >
        <Alert severity="error"> {error} </Alert>{' '}
        <Button
          variant="outlined"
          onClick={() => navigate('/stations')}
          sx={{
            mt: 2,
          }}
        >
          Back to Stations{' '}
        </Button>{' '}
      </Box>
    );
  }

  const realtimeStatus = getRealtimeStatus();
  const displayStatus = realtimeStatus || station?.status || 'Unknown';

  return (
    <Box>
      {' '}
      {/* Error message */}{' '}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
          }}
        >
          {' '}
          {error}{' '}
        </Alert>
      )}
      {/* Success message */}{' '}
      {success && (
        <Alert
          severity="success"
          sx={{
            mb: 3,
          }}
        >
          {' '}
          {success}{' '}
        </Alert>
      )}
      {/* Header */}{' '}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box>
          <Typography variant="h4" component="h1" gutterBottom>
            Station: {station?.name}{' '}
          </Typography>{' '}
          <Chip
            label={displayStatus}
            color={getStatusColor(displayStatus)}
            sx={{
              mr: 1,
            }}
          />{' '}
          {station?.isConnected && (
            <Chip label="Online" color="success" size="small" />
          )}{' '}
        </Box>{' '}
        <Box>
          {' '}
          {isEditing ? (
            <>
              <IconButton
                onClick={handleSaveStation}
                color="primary"
                sx={{
                  mr: 1,
                }}
              >
                <SaveIcon />
              </IconButton>{' '}
              <IconButton onClick={handleEditToggle} color="error">
                <CancelIcon />
              </IconButton>{' '}
            </>
          ) : (
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={handleEditToggle}
                sx={{
                  mr: 1,
                }}
              >
                Edit{' '}
              </Button>{' '}
              <IconButton onClick={fetchStationData}>
                <RefreshIcon />
              </IconButton>{' '}
            </>
          )}{' '}
        </Box>{' '}
      </Box>
      {/* Tabs */}{' '}
      <Paper
        sx={{
          mb: 3,
          borderRadius: 2,
        }}
      >
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
        {/* Details Tab */}{' '}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {' '}
            {/* Basic Information */}{' '}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                }}
              >
                <CardHeader title="Basic Information" />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        ID{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Name{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Model{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Vendor{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Firmware Version{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
                        {station?.firmwareVersion || 'Unknown'}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Location{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
                        {isEditing ? (
                          <LocationSelector
                            value={editedStation.location || ''}
                            onChange={value =>
                              setEditedStation({
                                ...editedStation,
                                location: value,
                              })
                            }
                          />
                        ) : (
                          (() => {
                            try {
                              const loc = JSON.parse(station?.location || '{}');
                              return (
                                `${loc.address || ''}, ${loc.city || ''}, ${loc.state || ''}`.replace(
                                  /^, |, $/g,
                                  ''
                                ) || 'Not specified'
                              );
                            } catch (e) {
                              return station?.location || 'Not specified';
                            }
                          })()
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Description{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Notes{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
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
                        )}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                  </Grid>{' '}
                </CardContent>{' '}
              </Card>{' '}
            </Grid>
            {/* Status and Commands */}{' '}
            <Grid item xs={12} md={6}>
              <Card
                sx={{
                  height: '100%',
                  borderRadius: 2,
                }}
              >
                <CardHeader title="Status and Commands" />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Status{' '}
                      </Typography>{' '}
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 'bold',
                        }}
                      >
                        Status:{' '}
                        <Chip
                          label={getRealtimeStatus()}
                          color={getStatusColor(getRealtimeStatus())}
                          size="small"
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            ml: 1,
                            color: 'text.secondary',
                          }}
                        >
                          Updated: {format(lastUpdated, 'HH:mm:ss')}{' '}
                        </Typography>{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="subtitle2" color="text.secondary">
                          Connection{' '}
                        </Typography>{' '}
                        <IconButton
                          size="small"
                          onClick={() => {
                            checkConnectionStatus();
                            setLastUpdated(new Date());
                          }}
                          title="Check connection status"
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>{' '}
                      </Box>{' '}
                      <Typography variant="body1">
                        <Chip
                          label={
                            station?.isConnected ? 'Connected' : 'Disconnected'
                          }
                          color={station?.isConnected ? 'success' : 'error'}
                          size="small"
                          icon={
                            station?.isConnected ? (
                              <CheckCircleIcon />
                            ) : (
                              <CancelIcon />
                            )
                          }
                          sx={{
                            fontWeight: 'bold',
                            animation: station?.isConnected
                              ? 'pulse 2s infinite'
                              : 'none',
                            '@keyframes pulse': {
                              '0%': {
                                boxShadow: '0 0 0 0 rgba(46, 125, 50, 0.4)',
                              },
                              '70%': {
                                boxShadow: '0 0 0 6px rgba(46, 125, 50, 0)',
                              },
                              '100%': {
                                boxShadow: '0 0 0 0 rgba(46, 125, 50, 0)',
                              },
                            },
                          }}
                        />{' '}
                        <Typography
                          variant="caption"
                          display="block"
                          sx={{
                            mt: 0.5,
                            color: 'text.secondary',
                          }}
                        >
                          Last checked: {format(lastUpdated, 'HH:mm:ss')}{' '}
                        </Typography>{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" color="text.secondary">
                        Last Heartbeat{' '}
                      </Typography>{' '}
                      <Typography variant="body1">
                        {' '}
                        {station?.lastHeartbeat
                          ? format(
                              new Date(station.lastHeartbeat),
                              'dd MMM yyyy HH:mm:ss'
                            )
                          : 'Never'}{' '}
                      </Typography>{' '}
                    </Grid>{' '}
                    <Grid item xs={12} sm={6}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Typography variant="subtitle2" color="text.secondary">
                          Current Transaction{' '}
                        </Typography>{' '}
                        <IconButton
                          size="small"
                          onClick={() => fetchTransactions(0)}
                          title="Refresh transaction status"
                        >
                          <RefreshIcon fontSize="small" />
                        </IconButton>{' '}
                      </Box>{' '}
                      {transactionsLoading ? (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            my: 0.5,
                          }}
                        >
                          <CircularProgress
                            size={20}
                            sx={{
                              mr: 1,
                            }}
                          />{' '}
                          <Typography variant="body2">
                            {' '}
                            Loading...{' '}
                          </Typography>{' '}
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            mt: 1,
                          }}
                        >
                          {' '}
                          {activeTransaction ||
                          (transactions &&
                            transactions.length > 0 &&
                            transactions[0]?.status === 'InProgress') ? (
                            <>
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                <Chip
                                  icon={<ChargingIcon />}
                                  label={`Transaction #${activeTransaction || (transactions[0] && transactions[0].transactionId)}`}
                                  color="success"
                                  clickable
                                  onClick={() =>
                                    navigate(
                                      `/transactions/${activeTransaction || (transactions[0] && transactions[0].transactionId)}`
                                    )
                                  }
                                  sx={{
                                    fontWeight: 'bold',
                                    animation: 'pulse 2s infinite',
                                    '@keyframes pulse': {
                                      '0%': {
                                        boxShadow:
                                          '0 0 0 0 rgba(76, 175, 80, 0.4)',
                                      },
                                      '70%': {
                                        boxShadow:
                                          '0 0 0 6px rgba(76, 175, 80, 0)',
                                      },
                                      '100%': {
                                        boxShadow:
                                          '0 0 0 0 rgba(76, 175, 80, 0)',
                                      },
                                    },
                                  }}
                                />{' '}
                              </Box>
                              {/* Real-time energy consumption details */}{' '}
                              {/* Temporarily show for all active transactions, even without energy data */}{' '}
                              {(activeTransaction ||
                                (transactions &&
                                  transactions.length > 0 &&
                                  transactions[0]?.status ===
                                    'InProgress')) && (
                                <Card
                                  variant="outlined"
                                  sx={{
                                    mt: 1,
                                    backgroundColor: '#f8f9fa',
                                    borderLeft: '4px solid #4caf50',
                                  }}
                                >
                                  <CardContent
                                    sx={{
                                      p: 1.5,
                                      '&:last-child': {
                                        pb: 1.5,
                                      },
                                    }}
                                  >
                                    <Grid container spacing={1.5}>
                                      <Grid item xs={6}>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          Energy Consumed{' '}
                                        </Typography>{' '}
                                        <Typography
                                          variant="body2"
                                          fontWeight="bold"
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                          }}
                                        >
                                          <BatteryChargingFullIcon
                                            fontSize="small"
                                            sx={{
                                              mr: 0.5,
                                              color: 'success.main',
                                            }}
                                          />{' '}
                                          {energyConsumption || '0.00'}
                                          kWh{' '}
                                        </Typography>{' '}
                                      </Grid>{' '}
                                      <Grid item xs={6}>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          Current Power{' '}
                                        </Typography>{' '}
                                        <Typography
                                          variant="body2"
                                          fontWeight="bold"
                                        >
                                          {' '}
                                          {currentPower}W{' '}
                                        </Typography>{' '}
                                      </Grid>{' '}
                                      {batteryPercentage !== null && (
                                        <Grid item xs={6}>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            Battery Level{' '}
                                          </Typography>{' '}
                                          <Box
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                width: '50px',
                                                height: '12px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                position: 'relative',
                                                mr: 0.5,
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  position: 'absolute',
                                                  left: 0,
                                                  top: 0,
                                                  height: '100%',
                                                  width: `${batteryPercentage}%`,
                                                  backgroundColor:
                                                    batteryPercentage < 20
                                                      ? '#f44336'
                                                      : batteryPercentage < 50
                                                        ? '#ff9800'
                                                        : '#4caf50',
                                                  transition:
                                                    'width 0.5s ease-in-out',
                                                }}
                                              />{' '}
                                            </Box>{' '}
                                            <Typography
                                              variant="body2"
                                              fontWeight="bold"
                                            >
                                              {' '}
                                              {batteryPercentage} %
                                            </Typography>{' '}
                                          </Box>{' '}
                                        </Grid>
                                      )}{' '}
                                      <Grid item xs={6}>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                        >
                                          Duration{' '}
                                        </Typography>{' '}
                                        <Typography
                                          variant="body2"
                                          fontWeight="bold"
                                        >
                                          {' '}
                                          {Math.floor(
                                            chargingDuration / 3600
                                          )}h{' '}
                                          {Math.floor(
                                            (chargingDuration % 3600) / 60
                                          )}
                                          m {Math.floor(chargingDuration % 60)}s
                                        </Typography>{' '}
                                      </Grid>{' '}
                                    </Grid>{' '}
                                  </CardContent>{' '}
                                </Card>
                              )}{' '}
                            </>
                          ) : (
                            <>
                              <Chip
                                label="No active transaction"
                                size="small"
                                color="default"
                                variant="outlined"
                                sx={{
                                  borderRadius: 1,
                                }}
                              />{' '}
                              <Typography
                                variant="caption"
                                display="block"
                                sx={{
                                  mt: 0.5,
                                  color: 'text.secondary',
                                }}
                              >
                                Last checked:{' '}
                                {format(new Date(), 'HH:mm:ss')}{' '}
                              </Typography>{' '}
                            </>
                          )}{' '}
                        </Box>
                      )}{' '}
                    </Grid>
                    {/* Commands section */}{' '}
                    <Grid item xs={12}>
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        sx={{
                          mb: 1,
                        }}
                      >
                        Commands{' '}
                      </Typography>{' '}
                      <Box
                        sx={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 1,
                        }}
                      >
                        {' '}
                        {station?.status !== 'Charging' ? (
                          <Button
                            variant="outlined"
                            startIcon={<StartIcon />}
                            color="success"
                            onClick={() =>
                              handleOpenCommandDialog('RemoteStart')
                            }
                            disabled={!station?.isConnected}
                          >
                            Start Transaction{' '}
                          </Button>
                        ) : (
                          <Button
                            variant="outlined"
                            startIcon={<StopIcon />}
                            color="error"
                            onClick={() =>
                              handleOpenCommandDialog('RemoteStop')
                            }
                            disabled={
                              !station?.isConnected ||
                              !station?.currentTransaction
                            }
                          >
                            Stop Transaction{' '}
                          </Button>
                        )}
                        <Button
                          variant="outlined"
                          startIcon={<ResetIcon />}
                          onClick={() => handleOpenCommandDialog('Reset')}
                          disabled={!station?.isConnected}
                        >
                          Reset{' '}
                        </Button>
                        <Button
                          variant="outlined"
                          startIcon={<PowerIcon />}
                          onClick={() =>
                            handleOpenCommandDialog('ChangeAvailability')
                          }
                          disabled={!station?.isConnected}
                        >
                          {station?.status === 'Available'
                            ? 'Set Unavailable'
                            : 'Set Available'}{' '}
                        </Button>{' '}
                      </Box>{' '}
                    </Grid>{' '}
                  </Grid>{' '}
                </CardContent>{' '}
              </Card>{' '}
            </Grid>{' '}
          </Grid>{' '}
        </TabPanel>
        {/* Station Details Tab */}{' '}
        <TabPanel value={tabValue} index={0}>
          {' '}
          {/* Remote Command Panel */}{' '}
          <Card
            sx={{
              borderRadius: 2,
            }}
          >
            <CardHeader
              title="Station Details"
              action={
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fetchStationData()}
                >
                  Refresh{' '}
                </Button>
              }
            />{' '}
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Vendor{' '}
                  </Typography>{' '}
                  <Typography variant="body1">
                    {' '}
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
                    )}{' '}
                  </Typography>{' '}
                </Grid>{' '}
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Firmware Version{' '}
                  </Typography>{' '}
                  <Typography variant="body1">
                    {' '}
                    {station?.firmwareVersion || 'Unknown'}{' '}
                  </Typography>{' '}
                </Grid>{' '}
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Location{' '}
                  </Typography>{' '}
                  <Typography variant="body1">
                    {' '}
                    {isEditing ? (
                      <LocationSelector
                        value={editedStation.location || ''}
                        onChange={value =>
                          setEditedStation({
                            ...editedStation,
                            location: value,
                          })
                        }
                      />
                    ) : (
                      (() => {
                        try {
                          const loc = JSON.parse(station?.location || '{}');
                          return (
                            `${loc.address || ''}, ${loc.city || ''}, ${loc.state || ''}`.replace(
                              /^, |, $/g,
                              ''
                            ) || 'Not specified'
                          );
                        } catch (e) {
                          return station?.location || 'Not specified';
                        }
                      })()
                    )}{' '}
                  </Typography>{' '}
                </Grid>{' '}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Description{' '}
                  </Typography>{' '}
                  <Typography variant="body1">
                    {' '}
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
                    )}{' '}
                  </Typography>{' '}
                </Grid>{' '}
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Notes{' '}
                  </Typography>{' '}
                  <Typography variant="body1">
                    {' '}
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
                    )}{' '}
                  </Typography>{' '}
                </Grid>{' '}
              </Grid>{' '}
            </CardContent>{' '}
          </Card>{' '}
        </TabPanel>
        {/* Transactions Tab */}{' '}
        <TabPanel value={tabValue} index={1}>
          <Card
            sx={{
              borderRadius: 2,
            }}
          >
            <CardHeader
              title="Recent Transactions"
              action={
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fetchOcppMessages(0)}
                >
                  Refresh{' '}
                </Button>
              }
            />{' '}
            <Divider />
            <CardContent>
              {' '}
              {/* Pagination and results count */}{' '}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {' '}
                  {totalTransactions > 0
                    ? `Showing ${transactionsPage * transactionsLimit + 1}-${Math.min((transactionsPage + 1) * transactionsLimit, totalTransactions)} of ${totalTransactions} transactions`
                    : 'No transactions found'}{' '}
                </Typography>{' '}
                <FormControl
                  variant="outlined"
                  size="small"
                  sx={{
                    minWidth: 120,
                  }}
                >
                  <InputLabel id="transactions-per-page-label">
                    {' '}
                    Per Page{' '}
                  </InputLabel>{' '}
                  <Select
                    labelId="transactions-per-page-label"
                    value={transactionsLimit}
                    onChange={e => {
                      setTransactionsLimit(e.target.value);
                      fetchTransactions(0, e.target.value);
                    }}
                    label="Per Page"
                  >
                    <MenuItem value={5}> 5 </MenuItem>{' '}
                    <MenuItem value={10}> 10 </MenuItem>{' '}
                    <MenuItem value={20}> 20 </MenuItem>{' '}
                    <MenuItem value={50}> 50 </MenuItem>{' '}
                  </Select>{' '}
                </FormControl>{' '}
              </Box>
              {loading || transactionsLoading ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    p: 3,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : transactions.length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  No transactions found for this station{' '}
                </Typography>
              ) : (
                <List>
                  {' '}
                  {transactions.map(transaction => (
                    <React.Fragment key={transaction.id}>
                      <ListItem
                        button
                        onClick={() =>
                          navigate(`/transactions/${transaction.transactionId}`)
                        }
                      >
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Typography variant="subtitle1">
                                Transaction # {transaction.transactionId}{' '}
                              </Typography>{' '}
                              <Chip
                                label={transaction.status}
                                size="small"
                                color={
                                  transaction.status === 'InProgress'
                                    ? 'primary'
                                    : 'success'
                                }
                              />{' '}
                            </Box>
                          }
                          secondary={
                            <Grid
                              container
                              spacing={1}
                              sx={{
                                mt: 1,
                              }}
                            >
                              <Grid item xs={12} sm={6}>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Start:{' '}
                                  {format(
                                    new Date(transaction.startTime),
                                    'dd MMM yyyy HH:mm'
                                  )}{' '}
                                </Typography>{' '}
                              </Grid>{' '}
                              <Grid item xs={12} sm={6}>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  {' '}
                                  {transaction.stopTime
                                    ? `End: ${format(new Date(transaction.stopTime), 'dd MMM yyyy HH:mm')}`
                                    : 'In progress'}{' '}
                                </Typography>{' '}
                              </Grid>{' '}
                              <Grid item xs={12} sm={6}>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  ID Tag: {transaction.idTag}{' '}
                                </Typography>{' '}
                              </Grid>{' '}
                              <Grid item xs={12} sm={6}>
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                >
                                  Energy:{' '}
                                  {transaction.energyDelivered?.toFixed(2) || 0}
                                  kWh{' '}
                                </Typography>{' '}
                              </Grid>{' '}
                            </Grid>
                          }
                        />{' '}
                      </ListItem>{' '}
                      <Divider />
                    </React.Fragment>
                  ))}
                  {/* Pagination controls */}{' '}
                  {totalTransactions > transactionsLimit && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        mt: 3,
                        mb: 1,
                      }}
                    >
                      <Pagination
                        count={Math.ceil(totalTransactions / transactionsLimit)}
                        page={transactionsPage + 1}
                        onChange={(event, page) =>
                          fetchTransactions(page - 1, transactionsLimit)
                        }
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}{' '}
                </List>
              )}{' '}
            </CardContent>{' '}
          </Card>{' '}
        </TabPanel>
        {/* OCPP Messages Tab */}{' '}
        <TabPanel value={tabValue} index={2}>
          <Card
            sx={{
              borderRadius: 2,
            }}
          >
            <CardHeader
              title="OCPP Messages"
              action={
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => fetchOcppMessages(0)}
                >
                  Refresh{' '}
                </Button>
              }
            />{' '}
            <Divider />
            <CardContent>
              {' '}
              {/* Pagination and results count */}{' '}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {' '}
                  {totalMessages > 0
                    ? `Showing ${messagesPage * messagesLimit + 1}-${Math.min((messagesPage + 1) * messagesLimit, totalMessages)} of ${totalMessages} messages`
                    : 'No messages found'}{' '}
                </Typography>{' '}
                <FormControl
                  variant="outlined"
                  size="small"
                  sx={{
                    minWidth: 120,
                  }}
                >
                  <InputLabel id="messages-per-page-label">
                    {' '}
                    Per Page{' '}
                  </InputLabel>{' '}
                  <Select
                    labelId="messages-per-page-label"
                    value={messagesLimit}
                    onChange={e => {
                      setMessagesLimit(e.target.value);
                      fetchOcppMessages(0, e.target.value);
                    }}
                    label="Per Page"
                  >
                    <MenuItem value={10}> 10 </MenuItem>{' '}
                    <MenuItem value={20}> 20 </MenuItem>{' '}
                    <MenuItem value={50}> 50 </MenuItem>{' '}
                    <MenuItem value={100}> 100 </MenuItem>{' '}
                  </Select>{' '}
                </FormControl>{' '}
              </Box>
              {loading || messagesLoading ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    p: 3,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : ocppMessages.length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  align="center"
                >
                  No OCPP messages found for this station{' '}
                </Typography>
              ) : (
                <List>
                  {' '}
                  {ocppMessages.map(message => (
                    <React.Fragment key={message.id}>
                      <ListItem>
                        <ListItemText
                          primary={
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Typography variant="subtitle1">
                                {' '}
                                {message.message_type ||
                                  message.messageType}{' '}
                              </Typography>{' '}
                              <Chip
                                label={message.status || message.direction}
                                size="small"
                                color={getMessageStatusColor(
                                  message.status || message.direction
                                )}
                              />{' '}
                            </Box>
                          }
                          secondary={
                            <Box
                              sx={{
                                mt: 1,
                              }}
                            >
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
                                {' '}
                                {format(
                                  new Date(message.timestamp),
                                  'dd MMM yyyy HH:mm:ss'
                                )}{' '}
                              </Typography>{' '}
                              <Typography
                                variant="body2"
                                sx={{
                                  mt: 1,
                                  bgcolor: 'grey.100',
                                  p: 1,
                                  borderRadius: 1,
                                  overflowX: 'auto',
                                }}
                              >
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  {' '}
                                  {message.payload
                                    ? typeof message.payload === 'string'
                                      ? JSON.stringify(
                                          JSON.parse(message.payload),
                                          null,
                                          2
                                        )
                                      : JSON.stringify(message.payload, null, 2)
                                    : 'No payload'}{' '}
                                </pre>{' '}
                              </Typography>{' '}
                            </Box>
                          }
                        />{' '}
                      </ListItem>{' '}
                      <Divider />
                    </React.Fragment>
                  ))}
                  {/* Pagination controls */}{' '}
                  {totalMessages > messagesLimit && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        mt: 3,
                        mb: 1,
                      }}
                    >
                      <Pagination
                        count={Math.ceil(totalMessages / messagesLimit)}
                        page={messagesPage + 1}
                        onChange={(event, page) =>
                          fetchOcppMessages(page - 1, messagesLimit)
                        }
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                    </Box>
                  )}{' '}
                </List>
              )}{' '}
            </CardContent>{' '}
          </Card>{' '}
        </TabPanel>{' '}
      </Paper>
      {/* Command Dialog */} {renderCommandDialog()}{' '}
    </Box>
  );
}

export default StationDetail;
