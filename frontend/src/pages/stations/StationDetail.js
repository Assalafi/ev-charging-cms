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
  BatteryFull as BatteryFullIcon,
  Battery60 as Battery60Icon,
  Battery20 as Battery20Icon,
  BatteryAlert as BatteryAlertIcon,
  CheckCircle as CheckCircleIcon,
  ElectricBolt as ElectricBoltIcon,
  Speed as SpeedIcon,
  Timeline as TimelineIcon,
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
  const { stationStatus, mqtt, subscribe } = useMQTT();

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

  // Enhanced real-time data state
  const [realtimeData, setRealtimeData] = useState({
    soc: null,
    voltage: null,
    current: null,
    power: null,
    temperature: null,
    energy: null,
    lastMeterValues: null,
    statusNotifications: [],
  });
  const [ocppMessageHistory, setOcppMessageHistory] = useState([]);

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
  // Debug logging for energy consumption
  useEffect(() => {
    console.log('Energy consumption updated:', energyConsumption);
  }, [energyConsumption]);
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

  // Get battery icon based on SOC percentage
  const getBatteryIcon = (soc) => {
    if (soc === null || soc === undefined) return <BatteryAlertIcon />;
    if (soc >= 95) return <BatteryFullIcon />;
    if (soc >= 80) return <BatteryFullIcon />;
    if (soc >= 60) return <Battery60Icon />;
    if (soc >= 40) return <Battery60Icon />;
    if (soc >= 20) return <Battery20Icon />;
    return <BatteryAlertIcon />;
  };

  // Get battery color based on SOC
  const getBatteryColor = (soc) => {
    if (soc === null || soc === undefined) return 'default';
    if (soc >= 80) return 'success';
    if (soc >= 40) return 'warning';
    return 'error';
  };

  // Smart status detection using multiple OCPP sources
  const getSmartStatus = () => {
    // Priority 1: Check recent StatusNotification messages from OCPP
    const recentStatusNotifications = ocppMessageHistory.filter(msg => 
      msg.messageType === 'StatusNotification' && 
      msg.timestamp && 
      (Date.now() - new Date(msg.timestamp).getTime()) < 60000 // Last 60 seconds
    );
    
    if (recentStatusNotifications.length > 0) {
      const latestStatus = recentStatusNotifications[0];
      console.log('Using StatusNotification from OCPP:', latestStatus.payload.status);
      return latestStatus.payload.status;
    }

    // Priority 2: Check connector status
    if (connectors && connectors.length > 0) {
      const chargingConnector = connectors.find(c => c.status === 'Charging');
      if (chargingConnector) return 'Charging';

      const preparingConnector = connectors.find(c => c.status === 'Preparing');
      if (preparingConnector) return 'Preparing';

      const availableConnector = connectors.find(c => c.status === 'Available');
      if (availableConnector) return 'Available';
    }

    // Priority 3: Check if we have active transaction with meter values
    if (realtimeData.lastMeterValues && realtimeData.lastMeterValues.length > 0) {
      return 'Charging';
    }

    // Priority 4: MQTT status
    if (stationStatus && stationStatus[stationId]) {
      return stationStatus[stationId].status;
    }

    // Priority 5: Station status from API
    return station?.status || 'Unknown';
  };

  // Get real-time status from connectors (legacy function maintained for compatibility)
  const getRealtimeStatus = () => {
    return getSmartStatus();
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

    // Clean up intervals on component unmount
    return () => {
      clearInterval(connectionIntervalId);
      clearInterval(detailsIntervalId);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId]);

  // Enhanced MQTT subscription for comprehensive OCPP message handling
  useEffect(() => {
    if (!mqtt || !stationId) return;

    // Function to handle all OCPP messages
    handleEnergyUpdate = (topic, message) => {
      try {
        console.log('📨 MQTT message received on topic:', topic);
        const rawMessage = message.toString();
        
        let data;
        try {
          data = JSON.parse(rawMessage);
        } catch (parseError) {
          console.error('❌ Error parsing message:', parseError);
          return;
        }

        // Accept messages for this station or wildcard matches
        if (
          data.chargePointId === stationId ||
          topic.includes(`/${stationId}/`) ||
          topic.includes('/stations/') ||
          topic.includes('/ocpp/')
        ) {
          console.log('✅ Processing message for station:', stationId);
          console.log('📊 Message data:', JSON.stringify(data, null, 2));

          // Store in message history for status detection
          if (data.messageType || data.message) {
            setOcppMessageHistory(prev => {
              const newMsg = {
                ...data,
                timestamp: data.timestamp || new Date().toISOString(),
                topic,
              };
              // Keep only last 50 messages
              return [newMsg, ...prev.slice(0, 49)];
            });
          }

          // Handle StatusNotification messages for smart status
          if (data.messageType === 'StatusNotification' || data.message === 'StatusNotification') {
            const status = data.payload?.status || data.status;
            if (status) {
              console.log('🔄 StatusNotification received:', status);
              setStation(prev => ({
                ...prev,
                status: status,
              }));
            }
          }

          // Handle MeterValues messages for comprehensive data
          if (data.messageType === 'MeterValues' || data.message === 'MeterValues') {
            const meterValues = data.payload?.meterValue || data.meterValues || [];
            if (Array.isArray(meterValues) && meterValues.length > 0) {
              console.log('⚡ MeterValues received:', meterValues);
              
              // Process each meter value
              meterValues.forEach(meterValue => {
                if (meterValue.sampledValue) {
                  meterValue.sampledValue.forEach(sample => {
                    const value = parseFloat(sample.value);
                    const measurand = sample.measurand || 'Energy.Active.Import.Register';
                    const unit = sample.unit || 'Wh';
                    
                    console.log(`📈 ${measurand}: ${value} ${unit}`);
                    
                    // Update real-time data based on measurand type
                    setRealtimeData(prev => {
                      const updated = { ...prev };
                      
                      switch (measurand) {
                        case 'SoC':
                          updated.soc = value;
                          setBatteryPercentage(value);
                          break;
                        case 'Energy.Active.Import.Register':
                          updated.energy = unit === 'Wh' ? value / 1000 : value;
                          setEnergyConsumption((unit === 'Wh' ? value / 1000 : value).toFixed(2));
                          break;
                        case 'Power.Active.Import':
                          updated.power = value;
                          setCurrentPower(value);
                          break;
                        case 'Voltage':
                          updated.voltage = value;
                          break;
                        case 'Current.Import':
                          updated.current = value;
                          break;
                        case 'Temperature':
                          updated.temperature = value;
                          break;
                      }
                      
                      updated.lastMeterValues = meterValues;
                      return updated;
                    });
                  });
                }
              });
            }
          }

          // Handle transaction-related messages
          if (data.transactionId) {
            setActiveTransaction(data.transactionId);
            
            // Update charging duration if startTime is available
            if (data.startTime) {
              const duration = Math.floor((Date.now() - new Date(data.startTime).getTime()) / 1000);
              setChargingDuration(duration);
            }
          }

          // Handle legacy energy values
          if (data.energy !== undefined && data.energy !== null) {
            const energyValue = parseFloat(data.energy);
            if (!isNaN(energyValue)) {
              const energyInKWh = (energyValue / 1000).toFixed(2);
              setEnergyConsumption(energyInKWh);
              setRealtimeData(prev => ({ ...prev, energy: energyValue / 1000 }));
            }
          }

          // Handle legacy power values
          if (data.power !== undefined && data.power !== null) {
            const powerValue = parseFloat(data.power);
            if (!isNaN(powerValue)) {
              setCurrentPower(powerValue);
              setRealtimeData(prev => ({ ...prev, power: powerValue }));
            }
          }

          // Handle legacy battery percentage
          if (data.batteryPercentage !== undefined && data.batteryPercentage !== null) {
            setBatteryPercentage(data.batteryPercentage);
            setRealtimeData(prev => ({ ...prev, soc: data.batteryPercentage }));
          }

          // Handle price and amount
          if (data.amount !== undefined && data.amount !== null) {
            setChargingAmount(parseFloat(data.amount));
          }
          
          if (data.price !== undefined && data.price !== null) {
            setChargingPrice(parseFloat(data.price));
          }

          // Handle duration
          if (data.duration !== undefined && data.duration !== null) {
            setChargingDuration(data.duration);
          }
        }
      } catch (error) {
        console.error('❌ Error processing MQTT message:', error);
      }
    };

    // Debug: Log current values of energy-related state
    console.log('Current energy state:', {
      activeTransaction,
      energyConsumption,
      currentPower,
      batteryPercentage,
      chargingDuration,
      transactions:
        transactions?.length > 0 ? transactions[0].transactionId : 'none',
    });

    // Subscribe to all relevant topics for energy updates
    console.log(`Subscribing to energy updates for station ${stationId}`);

    // Subscribe to station-specific topics only (avoid overlapping subscriptions
    // which cause duplicate message processing and accumulating values)
    const mqttTopics = [
      `ocpp/stations/${stationId}/energy`,
      `ocpp/${stationId}/status`,
      `ocpp/${stationId}/messages`,
    ];

    console.log('MQTT Topics for energy updates:', mqttTopics);

    // Store unsubscribe functions returned by subscribe()
    const unsubscribeFns = mqttTopics.map(topic => {
      console.log(`Subscribing to: ${topic}`);
      return subscribe(topic, handleEnergyUpdate);
    });

    console.log('Successfully subscribed to all energy update topics');

    // Force energy value update with a delay for real-time testing
    // (This function has been moved before fetchStationDetailsUpdate to fix reference errors)

    // Call force update after a short delay to ensure we have data for display
    setTimeout(forceUpdateEnergyValues, 2000);

    // Set up a timer for real-time updates of transaction data
    // This ensures the UI shows the latest energy consumption from active transactions
    const setupEnergySimulation = () => {
      // Clear any existing interval
      if (energySimulation) {
        clearInterval(energySimulation);
      }

      // Set up a new interval - updates every 10 seconds
      const simulationInterval = setInterval(() => {
        // Only update if we have an active transaction
        if (transactions && transactions.some(t => t.status === 'InProgress')) {
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
                `Transaction energy updated to ${energyValue.toFixed(2)} kWh`
              );
            }
          }

          // Note: power and battery percentage are now updated via real MQTT data
          // from the station's MeterValues (SoC, Power.Active.Import)
          // Only update duration here as a fallback timer
          setChargingDuration(prev => prev + 10);
        }
      }, 10000); // Update every 10 seconds

      // Store the simulation interval ID
      setEnergySimulation(simulationInterval);

      return simulationInterval;
    };

    // Also directly fetch the active transaction's current energy data
    const fetchActiveTransactionData = async () => {
      if (transactions && transactions.length > 0) {
        const activeTransaction = transactions.find(
          t => t.status === 'InProgress'
        );
        if (activeTransaction) {
          console.log(
            `Found active transaction: ${activeTransaction.transactionId}, energy: ${activeTransaction.energyDelivered}`
          );
          setActiveTransaction(activeTransaction.transactionId);

          // Calculate duration from transaction start time
          const startTime = new Date(activeTransaction.startTime);
          const now = new Date();
          const durationSeconds = Math.floor((now - startTime) / 1000);
          setChargingDuration(durationSeconds);

          // Always use the transaction's energy data when available
          if (activeTransaction.energyDelivered) {
            const energyValue = parseFloat(activeTransaction.energyDelivered);
            if (!isNaN(energyValue)) {
              setEnergyConsumption(energyValue.toFixed(2));
              console.log(
                'Energy consumption updated from transaction:',
                energyValue.toFixed(2),
                'kWh'
              );
            }
          }
        }
      }
    };

    // Call once and then set up intervals
    fetchActiveTransactionData();
    const energyPollingInterval = setInterval(fetchActiveTransactionData, 5000);
    const simulationInterval = setupEnergySimulation();

    return () => {
      // Call each unsubscribe function to properly clean up
      unsubscribeFns.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
      });

      // Clear intervals
      clearInterval(energyPollingInterval);
      clearInterval(simulationInterval);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, mqtt]);

  // Function to check connection status directly
  const checkConnectionStatus = async () => {
    if (!stationId) return;

    try {
      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';

      // Direct API call to check connection status
      const response = await fetch(
        `${getApiBaseUrl()}/stations/${stationId}/connection`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();
      console.log('Connection status check:', data);

      if (data.success) {
        const isConnected = data.isConnected;

        // Always update connection status, not just when it changes
        // This ensures we catch disconnections more reliably
        console.log(
          `Connection status: ${isConnected ? 'Connected' : 'Disconnected'}`
        );

        // Get the lastHeartbeat from the API response
        const lastHeartbeat = data.lastHeartbeat;

        // Update station with new connection status AND lastHeartbeat
        setStation(prevStation => {
          // Check if we need to update either connection status or heartbeat
          const connectionChanged = prevStation?.isConnected !== isConnected;
          const heartbeatChanged =
            prevStation?.lastHeartbeat !== lastHeartbeat &&
            lastHeartbeat !== null;

          if (connectionChanged || heartbeatChanged) {
            if (connectionChanged) {
              console.log(
                `Connection status CHANGED: ${isConnected ? 'Connected' : 'Disconnected'}`
              );
            }
            if (heartbeatChanged) {
              console.log(`Heartbeat updated: ${lastHeartbeat}`);
            }

            return {
              ...prevStation,
              isConnected: isConnected,
              lastHeartbeat: lastHeartbeat || prevStation?.lastHeartbeat,
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
            lastHeartbeat: lastHeartbeat || prevStation?.lastHeartbeat, // Keep the latest heartbeat
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

  // Energy values are now updated via real MQTT data from MeterValues
  // This function is kept as a no-op for backward compatibility with callers
  const forceUpdateEnergyValues = () => {
    console.log('forceUpdateEnergyValues called (no-op, using real MQTT data)');
    try {
      if (station?.status !== 'Charging') {
        console.log(
          'Note: Station status is not "Charging" - energy values may not display as expected'
        );
      }
    } catch (e) {
      console.log('Could not determine station charging status');
    }

  };

  // Function to fetch station details updates without full refresh
  const fetchStationDetailsUpdate = async () => {
    if (!stationId) return;

    try {
      // First check connection status to ensure commands work properly
      await checkConnectionStatus();

      const token =
        localStorage.getItem('token') ||
        process.env.REACT_APP_DEV_TOKEN ||
        'dev-mock-token-for-testing';

      const apiUrl = `${getApiBaseUrl()}/stations/${stationId}/status`;
      console.log('Fetching station status from:', apiUrl);

      // Fetch only the station details for a lightweight update
      const stationResponse = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Check response status before parsing JSON
      if (!stationResponse.ok) {
        console.error(
          `Station status API error: ${stationResponse.status} ${stationResponse.statusText}`
        );

        // Try to get the error message from the response
        try {
          const errorData = await stationResponse.text();
          console.error('Error response body:', errorData);
        } catch (textError) {
          console.error('Could not parse error response');
        }

        // If we hit a 500 error, we'll still try to update energy values
        if (stationResponse.status === 500) {
          console.log(
            'Attempting to force update energy values due to API error'
          );
          // Use a slight delay to ensure the component has fully mounted
          setTimeout(() => {
            forceUpdateEnergyValues();
          }, 200);
        }

        return;
      }

      // Parse JSON response
      let stationData;
      try {
        stationData = await stationResponse.json();
        console.log('Real-time station update:', stationData);
      } catch (jsonError) {
        console.error('Error parsing station response JSON:', jsonError);
        // In case of parsing error, try to force update energy values
        setTimeout(() => {
          forceUpdateEnergyValues();
        }, 200);
        return;
      }

      if (stationData.success && stationData.station) {
        // Update station data with real-time information (preserve connection status)
        setStation(prevStation => ({
          ...prevStation,
          ...stationData.station,
          // Make sure we don't override the connection status from the direct check
          isConnected: prevStation?.isConnected,
        }));

        setLastUpdated(new Date());

        // If station data includes energy information, update it
        if (stationData.station.energyConsumption !== undefined) {
          console.log(
            'API provided energy consumption:',
            stationData.station.energyConsumption
          );
          let energyValue;

          // Handle both string and number formats
          if (typeof stationData.station.energyConsumption === 'string') {
            energyValue = parseFloat(stationData.station.energyConsumption);
          } else if (
            typeof stationData.station.energyConsumption === 'number'
          ) {
            energyValue = stationData.station.energyConsumption;
          }

          if (!isNaN(energyValue)) {
            // Convert to kWh if necessary (our backend now ensures proper units)
            const finalValue =
              energyValue > 1000
                ? (energyValue / 1000).toFixed(2)
                : energyValue.toFixed(2);
            console.log(`Setting energy consumption to ${finalValue} kWh`);
            setEnergyConsumption(finalValue);
          }
        }

        // Update charging duration if provided by the API
        if (stationData.station.chargingDuration !== undefined) {
          console.log(
            'API provided charging duration:',
            stationData.station.chargingDuration,
            'seconds'
          );
          setChargingDuration(stationData.station.chargingDuration);
        }

        // Note: Battery percentage and power are updated via real-time MQTT MeterValues
        // Only use API values as fallback if we haven't received MQTT data yet
        if (stationData.station.batteryPercentage !== undefined && batteryPercentage === null) {
          console.log('API fallback battery percentage:', stationData.station.batteryPercentage, '%');
          setBatteryPercentage(stationData.station.batteryPercentage);
        }

        if (stationData.station.chargingPower !== undefined && stationData.station.chargingPower > 0 && currentPower === 0) {
          console.log('API fallback charging power:', stationData.station.chargingPower, 'kW');
          setCurrentPower(Math.round(stationData.station.chargingPower * 1000));
        }

        // If status changed to/from Charging, also check active transactions
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
    } catch (error) {
      console.error('Error fetching station details update:', error);
      // In case of general error, try to force update energy values
      setTimeout(() => {
        forceUpdateEnergyValues();
      }, 200);
    }
  };

  // Monitor MQTT real-time status changes to update station data
  useEffect(() => {
    if (stationId && stationStatus && stationStatus[stationId]) {
      const mqttStatus = stationStatus[stationId].status;
      const currentStatus = station?.status;

      // If status changed to/from Charging, we need to check for active transactions
      if (
        (mqttStatus === 'Charging' && currentStatus !== 'Charging') ||
        (mqttStatus !== 'Charging' && currentStatus === 'Charging')
      ) {
        console.log(
          'Station charging status changed from MQTT, checking for active transactions...'
        );
        fetchTransactions(0); // This will also update the current transaction status
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
                                          {currentPower}W
                                        </Typography>{' '}
                                      </Grid>{' '}
                                      {(realtimeData.soc !== null || batteryPercentage !== null) && (
                                        <Grid item xs={12}>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            State of Charge (SoC)
                                          </Typography>
                                          <Box
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              mt: 0.5,
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                mr: 1,
                                                color: getBatteryColor(realtimeData.soc || batteryPercentage) + '.main',
                                              }}
                                            >
                                              {getBatteryIcon(realtimeData.soc || batteryPercentage)}
                                            </Box>
                                            <Box
                                              sx={{
                                                flex: 1,
                                                height: '24px',
                                                border: '2px solid',
                                                borderColor: getBatteryColor(realtimeData.soc || batteryPercentage) + '.main',
                                                borderRadius: '12px',
                                                position: 'relative',
                                                backgroundColor: '#f5f5f5',
                                                overflow: 'hidden',
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  position: 'absolute',
                                                  left: 0,
                                                  top: 0,
                                                  height: '100%',
                                                  width: `${realtimeData.soc || batteryPercentage || 0}%`,
                                                  background: `linear-gradient(90deg, ${
                                                    (realtimeData.soc || batteryPercentage) < 20
                                                      ? '#f44336'
                                                      : (realtimeData.soc || batteryPercentage) < 40
                                                        ? '#ff9800'
                                                        : (realtimeData.soc || batteryPercentage) < 80
                                                          ? '#ffeb3b'
                                                          : '#4caf50'
                                                  } 0%, ${
                                                    (realtimeData.soc || batteryPercentage) < 20
                                                      ? '#d32f2f'
                                                      : (realtimeData.soc || batteryPercentage) < 40
                                                        ? '#f57c00'
                                                        : (realtimeData.soc || batteryPercentage) < 80
                                                          ? '#fbc02d'
                                                          : '#388e3c'
                                                  } 100%)`,
                                                  transition: 'width 0.8s ease-in-out',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'flex-end',
                                                  pr: 1,
                                                }}
                                              >
                                                {(realtimeData.soc || batteryPercentage) > 10 && (
                                                  <Typography
                                                    variant="caption"
                                                    sx={{
                                                      color: 'white',
                                                      fontWeight: 'bold',
                                                      fontSize: '11px',
                                                    }}
                                                  >
                                                    {Math.round(realtimeData.soc || batteryPercentage)}%
                                                  </Typography>
                                                )}
                                              </Box>
                                            </Box>
                                            <Typography
                                              variant="body2"
                                              fontWeight="bold"
                                              sx={{
                                                ml: 1,
                                                minWidth: '45px',
                                                color: getBatteryColor(realtimeData.soc || batteryPercentage) + '.main',
                                              }}
                                            >
                                              {Math.round(realtimeData.soc || batteryPercentage)}%
                                            </Typography>
                                          </Box>
                                          <Typography
                                            variant="caption"
                                            sx={{
                                              mt: 0.5,
                                              display: 'block',
                                              color: 'text.secondary',
                                            }}
                                          >
                                            {realtimeData.soc !== null ? 'Real-time from OCPP' : 'Estimated value'}
                                          </Typography>
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
                              )}
                              
                              {/* Enhanced Real-time Metrics Display */}
                              {(realtimeData.voltage !== null || realtimeData.current !== null || realtimeData.temperature !== null) && (
                                <Card
                                  variant="outlined"
                                  sx={{
                                    mt: 1,
                                    backgroundColor: '#f8f9fa',
                                    borderLeft: '4px solid #2196f3',
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
                                    <Typography
                                      variant="subtitle2"
                                      sx={{
                                        mb: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                      }}
                                    >
                                      <ElectricBoltIcon
                                        fontSize="small"
                                        sx={{
                                          mr: 0.5,
                                          color: '#2196f3',
                                        }}
                                      />
                                      Real-time Metrics
                                    </Typography>
                                    <Grid container spacing={1.5}>
                                      {realtimeData.voltage !== null && (
                                        <Grid item xs={4}>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            Voltage
                                          </Typography>
                                          <Typography
                                            variant="body2"
                                            fontWeight="bold"
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                            }}
                                          >
                                            <SpeedIcon
                                              fontSize="small"
                                              sx={{
                                                mr: 0.5,
                                                color: '#ff9800',
                                              }}
                                            />
                                            {realtimeData.voltage.toFixed(1)}V
                                          </Typography>
                                        </Grid>
                                      )}
                                      {realtimeData.current !== null && (
                                        <Grid item xs={4}>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            Current
                                          </Typography>
                                          <Typography
                                            variant="body2"
                                            fontWeight="bold"
                                            sx={{
                                              display: 'flex',
                                              alignItems: 'center',
                                            }}
                                          >
                                            <ElectricBoltIcon
                                              fontSize="small"
                                              sx={{
                                                mr: 0.5,
                                                color: '#f44336',
                                              }}
                                            />
                                            {realtimeData.current.toFixed(1)}A
                                          </Typography>
                                        </Grid>
                                      )}
                                      {realtimeData.temperature !== null && (
                                        <Grid item xs={4}>
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            Temperature
                                          </Typography>
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
                                                color: realtimeData.temperature > 40 ? '#f44336' : '#4caf50',
                                              }}
                                            />
                                            {realtimeData.temperature.toFixed(1)}°C
                                          </Typography>
                                        </Grid>
                                      )}
                                    </Grid>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        mt: 1,
                                        display: 'block',
                                        color: 'text.secondary',
                                      }}
                                    >
                                      Live from OCPP MeterValues
                                    </Typography>
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
