import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Button,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Paper,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  PowerSettingsNew as ResetIcon,
  LockOpen as UnlockIcon,
  Settings as ConfigIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Refresh as TriggerIcon,
  Send as SendIcon
} from '@mui/icons-material';
import remoteCommandService from '../services/remoteCommandService';

/**
 * Component for sending remote commands to a charging station
 */
const RemoteCommandPanel = ({ station, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Command specific state
  const [resetType, setResetType] = useState('Soft');
  const [configKey, setConfigKey] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [idTag, setIdTag] = useState('TAG001');
  const [connectorId, setConnectorId] = useState(1);
  const [requestedMessage, setRequestedMessage] = useState('StatusNotification');
  const [transactionId, setTransactionId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [messageId, setMessageId] = useState('');
  const [dataTransferContent, setDataTransferContent] = useState('');
  
  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogAction, setDialogAction] = useState(null);
  const [dialogTitle, setDialogTitle] = useState('');
  const [dialogContent, setDialogContent] = useState('');
  
  // Boot notification
  const [bootDialogOpen, setBootDialogOpen] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [bootResult, setBootResult] = useState(null);
  const [bootData, setBootData] = useState({
    vendor: station?.vendor || '',
    model: station?.model || '',
    firmware: station?.firmwareVersion || '1.0.0'
  });
  
  // Reset success/error messages after 5 seconds
  const clearMessages = () => {
    setTimeout(() => {
      setSuccessMessage('');
      setErrorMessage('');
    }, 5000);
  };
  
  // Handle command execution
  const executeCommand = async (commandFn) => {
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');
    
    try {
      const response = await commandFn();
      
      if (response.data.success) {
        setSuccessMessage(response.data.message);
        if (onSuccess) onSuccess(response.data);
      } else {
        setErrorMessage(response.data.message || 'Command failed');
        if (onError) onError(response.data);
      }
    } catch (error) {
      console.error('Command execution error:', error);
      const errorMsg = error.response?.data?.message || 'Error executing command';
      setErrorMessage(errorMsg);
      if (onError) onError({ message: errorMsg });
    } finally {
      setLoading(false);
      clearMessages();
    }
  };
  
  // Open dialog for command confirmation
  const openCommandDialog = (action, title, content) => {
    setDialogAction(() => action);
    setDialogTitle(title);
    setDialogContent(content);
    setOpenDialog(true);
  };
  
  // Handle reset command
  const handleReset = () => {
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.reset(station.chargePointId, resetType)),
      'Confirm Reset',
      `Are you sure you want to send a ${resetType} reset command to this station? This will interrupt any active charging sessions.`
    );
  };
  
  // Handle change configuration command
  const handleChangeConfig = () => {
    if (!configKey || configValue === '') {
      setErrorMessage('Configuration key and value are required');
      clearMessages();
      return;
    }
    
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.changeConfiguration(station.chargePointId, configKey, configValue)),
      'Confirm Configuration Change',
      `Are you sure you want to change the "${configKey}" configuration to "${configValue}"?`
    );
  };
  
  // Handle get configuration command
  const handleGetConfig = () => {
    // No confirmation needed for read-only operations
    executeCommand(() => remoteCommandService.getConfiguration(station.chargePointId));
  };
  
  // Handle unlock connector command
  const handleUnlockConnector = () => {
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.unlockConnector(station.chargePointId, connectorId)),
      'Confirm Unlock Connector',
      `Are you sure you want to unlock connector ${connectorId} on this station?`
    );
  };
  
  // Handle trigger message command
  const handleTriggerMessage = () => {
    executeCommand(() => remoteCommandService.triggerMessage(
      station.chargePointId, 
      requestedMessage,
      ['MeterValues', 'StatusNotification'].includes(requestedMessage) ? connectorId : undefined
    ));
  };
  
  // Handle remote start command
  const handleRemoteStart = () => {
    if (!idTag) {
      setErrorMessage('ID Tag is required');
      clearMessages();
      return;
    }
    
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.remoteStart(station.chargePointId, idTag, connectorId)),
      'Confirm Remote Start',
      `Are you sure you want to start a charging session with ID Tag "${idTag}" on connector ${connectorId}?`
    );
  };
  
  // Handle remote stop command
  const handleRemoteStop = () => {
    if (!transactionId) {
      setErrorMessage('Transaction ID is required');
      clearMessages();
      return;
    }
    
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.remoteStop(station.chargePointId, transactionId)),
      'Confirm Remote Stop',
      `Are you sure you want to stop transaction ${transactionId}?`
    );
  };
  
  // Handle data transfer command
  const handleDataTransfer = () => {
    if (!vendorId) {
      setErrorMessage('Vendor ID is required');
      clearMessages();
      return;
    }
    
    openCommandDialog(
      () => executeCommand(() => remoteCommandService.dataTransfer(
        station.chargePointId,
        vendorId,
        messageId || null,
        dataTransferContent || null
      )),
      'Confirm Data Transfer',
      `Are you sure you want to send a data transfer to this station?`
    );
  };
  
  // Handle boot data input change
  const handleBootDataChange = (e) => {
    const { name, value } = e.target;
    setBootData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Trigger boot notification
  const handleTriggerBoot = async () => {
    if (!station || !station.chargePointId) return;
    
    setBootLoading(true);
    setBootResult(null);
    
    try {
      const response = await remoteCommandService.triggerBoot(
        station.chargePointId,
        bootData.vendor,
        bootData.model,
        bootData.firmware
      );
      
      setBootResult({
        success: response.success,
        message: response.message || 'Boot notification triggered successfully'
      });
      
      // Close dialog on success
      if (response.success) {
        setTimeout(() => setBootDialogOpen(false), 1500);
      }
    } catch (error) {
      console.error('Error triggering boot notification:', error);
      setBootResult({
        success: false,
        message: error.response?.data?.message || 'Failed to trigger boot notification'
      });
    } finally {
      setBootLoading(false);
    }
  };
  
  // Connection status indicator
  const connectionStatus = station.isConnected ? (
    <Chip 
      label="Connected" 
      color="success" 
      size="small" 
      sx={{ ml: 2 }} 
    />
  ) : (
    <Chip 
      label="Disconnected" 
      color="error" 
      size="small" 
      sx={{ ml: 2 }} 
    />
  );

  return (
    <Card sx={{ mb: 3 }}>
      <CardHeader 
        title={
          <Box display="flex" alignItems="center">
            <Typography variant="h6">Remote Commands</Typography>
            {connectionStatus}
          </Box>
        }
        subheader={
          !station.isConnected && 
          "Station must be connected to receive commands"
        }
      />
      <CardContent>
        {(successMessage || errorMessage) && (
          <Box sx={{ mb: 2 }}>
            {successMessage && (
              <Alert severity="success" sx={{ mb: 1 }}>
                {successMessage}
              </Alert>
            )}
            {errorMessage && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {errorMessage}
              </Alert>
            )}
          </Box>
        )}
        
        <Grid container spacing={3}>
          {/* Station Reset */}
          <Grid item xs={12} md={6} lg={4}>
            <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Reset Station
              </Typography>
              <FormControl fullWidth margin="normal">
                <InputLabel>Reset Type</InputLabel>
                <Select
                  value={resetType}
                  label="Reset Type"
                  onChange={(e) => setResetType(e.target.value)}
                >
                  <MenuItem value="Soft">Soft Reset</MenuItem>
                  <MenuItem value="Hard">Hard Reset</MenuItem>
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="warning"
                onClick={handleReset}
                disabled={loading || !station.isConnected}
                fullWidth
                sx={{ mt: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Reset Station'}
              </Button>
            </Paper>
          </Grid>
          
          {/* Trigger Boot Notification */}
          <Grid item xs={12} sm={6} md={4}>
            <Paper elevation={1} sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" gutterBottom>
                Boot Notification
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Manually trigger a boot notification to update station details
              </Typography>
              <Button
                variant="contained"
                color="info"
                onClick={() => setBootDialogOpen(true)}
                disabled={!station.isConnected}
                fullWidth
                sx={{ mt: 2 }}
              >
                Configure Boot
              </Button>
            </Paper>
          </Grid>
          
          {/* Configuration */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Configuration
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Configuration Key"
                value={configKey}
                onChange={(e) => setConfigKey(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                placeholder="e.g. HeartbeatInterval"
              />
              <TextField
                label="Configuration Value"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                placeholder="e.g. 300"
              />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<ConfigIcon />}
                  onClick={handleChangeConfig}
                  disabled={loading || !station.isConnected || !configKey || configValue === ''}
                  sx={{ flex: 1 }}
                >
                  Change
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleGetConfig}
                  disabled={loading || !station.isConnected}
                  sx={{ flex: 1 }}
                >
                  Get Config
                </Button>
              </Box>
            </Box>
          </Grid>
          
          {/* Connector Operations */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Connector Operations
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Connector ID"
                type="number"
                value={connectorId}
                onChange={(e) => setConnectorId(parseInt(e.target.value) || 1)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                InputProps={{ inputProps: { min: 1 } }}
              />
              <Button
                variant="outlined"
                startIcon={<UnlockIcon />}
                onClick={handleUnlockConnector}
                disabled={loading || !station.isConnected}
                fullWidth
              >
                Unlock Connector
              </Button>
            </Box>
          </Grid>
          
          {/* Trigger Messages */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Trigger Message
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                select
                label="Message Type"
                value={requestedMessage}
                onChange={(e) => setRequestedMessage(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              >
                <MenuItem value="BootNotification">Boot Notification</MenuItem>
                <MenuItem value="DiagnosticsStatusNotification">Diagnostics Status</MenuItem>
                <MenuItem value="FirmwareStatusNotification">Firmware Status</MenuItem>
                <MenuItem value="Heartbeat">Heartbeat</MenuItem>
                <MenuItem value="MeterValues">Meter Values</MenuItem>
                <MenuItem value="StatusNotification">Status Notification</MenuItem>
              </TextField>
              <Button
                variant="outlined"
                startIcon={<TriggerIcon />}
                onClick={handleTriggerMessage}
                disabled={loading || !station.isConnected}
                fullWidth
              >
                Trigger Message
              </Button>
            </Box>
          </Grid>
          
          {/* Remote Start */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Remote Start
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                label="ID Tag"
                value={idTag}
                onChange={(e) => setIdTag(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                placeholder="e.g. TAG001"
              />
              <Button
                variant="outlined"
                color="success"
                startIcon={<StartIcon />}
                onClick={handleRemoteStart}
                disabled={loading || !station.isConnected || !idTag}
                fullWidth
              >
                Start Transaction
              </Button>
            </Box>
          </Grid>
          
          {/* Remote Stop */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Remote Stop
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Transaction ID"
                type="number"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                placeholder="e.g. 12345"
              />
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopIcon />}
                onClick={handleRemoteStop}
                disabled={loading || !station.isConnected || !transactionId}
                fullWidth
              >
                Stop Transaction
              </Button>
            </Box>
          </Grid>
          
          {/* Data Transfer */}
          <Grid item xs={12} md={6} lg={4}>
            <Typography variant="subtitle1" gutterBottom>
              Data Transfer
            </Typography>
            <Box sx={{ mb: 2 }}>
              <TextField
                label="Vendor ID"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                placeholder="e.g. com.vendor"
              />
              <TextField
                label="Message ID (optional)"
                value={messageId}
                onChange={(e) => setMessageId(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
              />
              <TextField
                label="Data (optional)"
                value={dataTransferContent}
                onChange={(e) => setDataTransferContent(e.target.value)}
                variant="outlined"
                size="small"
                fullWidth
                sx={{ mb: 1 }}
                multiline
                rows={2}
              />
              <Button
                variant="outlined"
                startIcon={<SendIcon />}
                onClick={handleDataTransfer}
                disabled={loading || !station.isConnected || !vendorId}
                fullWidth
              >
                Send Data
              </Button>
            </Box>
          </Grid>
        </Grid>
        
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}
        
        <Divider sx={{ mt: 2, mb: 2 }} />
        
        <Typography variant="caption" color="text.secondary">
          Note: Commands are sent to the station in real-time. Response will be available in the station logs.
          Some commands may take time to be processed by the charging station.
        </Typography>
      </CardContent>
      
      {/* Confirmation Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
      >
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {dialogContent}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} color="primary">
            Cancel
          </Button>
          <Button 
            onClick={() => {
              setOpenDialog(false);
              if (dialogAction) dialogAction();
            }} 
            color="primary" 
            variant="contained"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Boot Notification Dialog */}
      <Dialog open={bootDialogOpen} onClose={() => setBootDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure Boot Notification</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph sx={{ mt: 1 }}>
            This will manually trigger a Boot Notification with the following details.
            This is useful when a station connects but doesn't send station details.
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Vendor"
                name="vendor"
                value={bootData.vendor}
                onChange={handleBootDataChange}
                fullWidth
                margin="normal"
                variant="outlined"
                placeholder="e.g. ABB"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Model"
                name="model"
                value={bootData.model}
                onChange={handleBootDataChange}
                fullWidth
                margin="normal"
                variant="outlined"
                placeholder="e.g. Terra AC"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Firmware Version"
                name="firmware"
                value={bootData.firmware}
                onChange={handleBootDataChange}
                fullWidth
                margin="normal"
                variant="outlined"
                placeholder="e.g. 1.0.0"
              />
            </Grid>
          </Grid>
          
          {bootResult && (
            <Alert severity={bootResult.success ? 'success' : 'error'} sx={{ mt: 2 }}>
              {bootResult.message}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBootDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={handleTriggerBoot} 
            color="primary" 
            variant="contained"
            disabled={bootLoading || !station.isConnected}
          >
            {bootLoading ? <CircularProgress size={24} /> : 'Trigger Boot Notification'}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default RemoteCommandPanel;
