import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
  FormControl,
  InputLabel,
  InputAdornment,
  Select,
  MenuItem,
  Switch,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tabs,
  Tab,
  Stack
} from '@mui/material';
import {
  Save as SaveIcon,
  Refresh as RefreshIcon,
  PowerSettingsNew as PowerIcon,
  Settings as SettingsIcon,
  CloudUploadRounded,
  DeleteOutlineRounded,
  PaletteRounded,
  ImageRounded
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import settingsService from '../services/settingsService';
import { defaultBranding, useBranding } from '../contexts/BrandingContext';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function Settings() {
  const { hasPermission } = useAuth();
  const isAdmin = hasPermission('settings.manage');
  const canView = hasPermission('settings.view');
  const { branding, assetUrl, refreshBranding } = useBranding();
  
  // State
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [brandingSettings, setBrandingSettings] = useState({ ...defaultBranding, ...branding });
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [faviconPreview, setFaviconPreview] = useState(null);
  const [removedAssets, setRemovedAssets] = useState({ logo: false, favicon: false });
  
  // General settings
  const [generalSettings, setGeneralSettings] = useState({
    companyName: 'EV Charging Company Nigeria',
    defaultCurrency: 'NGN',
    defaultLanguage: 'en',
    timeZone: 'Africa/Lagos',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  });
  
  // OCPP settings
  const [ocppSettings, setOcppSettings] = useState({
    heartbeatInterval: 60,
    meterValueInterval: 60,
    meterValueSampleInterval: 60,
    connectionTimeoutSecs: 30,
    resetRetries: 3
  });
  
  // Pricing settings
  const [pricingSettings, setPricingSettings] = useState({
    baseRatePerKwh: 120,
    peakHourRate: 150,
    offPeakRate: 100,
    memberDiscount: 10,
    minimumCharge: 100
  });
  
  // Notification settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    stationStatusAlerts: true,
    transactionAlerts: false,
    errorAlerts: true,
    dailyReports: false,
    weeklyReports: true,
    monthlyReports: true
  });
  
  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!canView) return;
    
    setLoading(true);
    try {
      const brandingResponse = await settingsService.getBrandingSettings();
      setBrandingSettings({ ...defaultBranding, ...(brandingResponse.settings || {}) });
      setLogoFile(null);
      setFaviconFile(null);
      setLogoPreview(null);
      setFaviconPreview(null);
      setRemovedAssets({ logo: false, favicon: false });

      // Fetch general settings
      const generalResponse = await settingsService.getGeneralSettings();
      setGeneralSettings(generalResponse.settings);
      
      // Fetch OCPP settings
      const ocppResponse = await settingsService.getOcppSettings();
      setOcppSettings(ocppResponse.settings);
      
      // Fetch notification settings
      const notificationResponse = await settingsService.getNotificationSettings();
      setNotificationSettings(notificationResponse.settings);
      
      setError(null);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setError('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  }, [canView]);
  
  // Load settings on component mount
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };
  
  // Handle general settings change
  const handleGeneralSettingsChange = (e) => {
    setGeneralSettings({
      ...generalSettings,
      [e.target.name]: e.target.value
    });
  };
  
  // Handle OCPP settings change
  const handleOcppSettingsChange = (e) => {
    setOcppSettings({
      ...ocppSettings,
      [e.target.name]: e.target.type === 'number' ? parseInt(e.target.value, 10) : e.target.value
    });
  };
  
  // Handle notification settings change
  const handleNotificationSettingsChange = (e) => {
    setNotificationSettings({
      ...notificationSettings,
      [e.target.name]: e.target.checked
    });
  };
  
  // Handle pricing settings change
  const handlePricingSettingsChange = (e) => {
    setPricingSettings({
      ...pricingSettings,
      [e.target.name]: e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value
    });
  };

  const handleBrandingChange = event => {
    setBrandingSettings(previous => ({ ...previous, [event.target.name]: event.target.value }));
  };

  const selectAsset = (type, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    if (type === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(file);
      setLogoPreview(preview);
      setRemovedAssets(previous => ({ ...previous, logo: false }));
    } else {
      if (faviconPreview) URL.revokeObjectURL(faviconPreview);
      setFaviconFile(file);
      setFaviconPreview(preview);
      setRemovedAssets(previous => ({ ...previous, favicon: false }));
    }
  };

  const removeAsset = type => {
    if (type === 'logo') {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(null);
      setBrandingSettings(previous => ({ ...previous, logoUrl: null }));
      setRemovedAssets(previous => ({ ...previous, logo: true }));
    } else {
      if (faviconPreview) URL.revokeObjectURL(faviconPreview);
      setFaviconFile(null);
      setFaviconPreview(null);
      setBrandingSettings(previous => ({ ...previous, faviconUrl: null }));
      setRemovedAssets(previous => ({ ...previous, favicon: true }));
    }
  };
  
  // Save settings
  const handleSaveSettings = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Determine which settings to save based on active tab
      let response;
      
      switch (tabValue) {
        case 0: // Branding
          response = await settingsService.updateBrandingSettings(brandingSettings, logoFile, faviconFile, removedAssets);
          setBrandingSettings({ ...defaultBranding, ...(response.settings || {}) });
          setLogoFile(null);
          setFaviconFile(null);
          setLogoPreview(null);
          setFaviconPreview(null);
          setRemovedAssets({ logo: false, favicon: false });
          await refreshBranding();
          break;
        case 1: // General
          response = await settingsService.updateGeneralSettings(generalSettings);
          break;
        case 2: // OCPP
          response = await settingsService.updateOcppSettings(ocppSettings);
          break;
        case 3: // Notifications
          response = await settingsService.updateNotificationSettings(notificationSettings);
          break;
        default:
          break;
      }
      
      setSuccess('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      setError(error?.response?.data?.message || error?.serverMessage || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Settings
        </Typography>
        <Box>
          {isAdmin && (
            <Button
              variant="contained"
              color="primary"
              startIcon={loading ? <CircularProgress size={24} /> : <SaveIcon />}
              onClick={handleSaveSettings}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Save Settings
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchSettings}
            disabled={loading || !isAdmin}
          >
            Refresh
          </Button>
        </Box>
      </Box>
      
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
      
      {!isAdmin && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Only administrators can modify system settings.
        </Alert>
      )}
      
      {/* Settings Tabs */}
      <Paper sx={{ borderRadius: 2 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Branding & Meta" />
          <Tab label="General" />
          <Tab label="OCPP" />
          <Tab label="Notifications" />
        </Tabs>
        
        <TabPanel value={tabValue} index={0}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h6">System identity</Typography>
              <Typography variant="body2" color="text.secondary">These values are used across login, navigation, browser metadata and installed shortcuts.</Typography>
            </Box>
            <Grid container spacing={2.5}>
              <Grid item xs={12} md={6}><TextField fullWidth label="System name" name="systemName" value={brandingSettings.systemName} onChange={handleBrandingChange} disabled={!isAdmin || loading} helperText="Displayed on the login screen" inputProps={{ maxLength: 80 }} /></Grid>
              <Grid item xs={12} md={6}><TextField fullWidth label="Short name" name="shortName" value={brandingSettings.shortName} onChange={handleBrandingChange} disabled={!isAdmin || loading} helperText="Used in the sidebar and compact layouts" inputProps={{ maxLength: 40 }} /></Grid>
              <Grid item xs={12}><TextField fullWidth label="Login subtitle" name="loginSubtitle" value={brandingSettings.loginSubtitle} onChange={handleBrandingChange} disabled={!isAdmin || loading} inputProps={{ maxLength: 100 }} /></Grid>
            </Grid>

            <Grid container spacing={2.5}>
              <Grid item xs={12} md={7}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><ImageRounded color="primary" /><Box><Typography fontWeight={750}>System logo</Typography><Typography variant="caption" color="text.secondary">PNG, JPG or WebP · maximum 5 MB</Typography></Box></Stack>
                  <Box sx={{ minHeight: 150, p: 2, mb: 2, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'grey.50', border: '1px dashed', borderColor: 'divider' }}>
                    {(logoPreview || brandingSettings.logoUrl) ? <Box component="img" src={logoPreview || assetUrl(brandingSettings.logoUrl)} alt="Logo preview" sx={{ maxWidth: '100%', maxHeight: 110, objectFit: 'contain' }} /> : <Stack alignItems="center" color="text.disabled"><ImageRounded sx={{ fontSize: 46 }} /><Typography variant="body2">No custom logo</Typography></Stack>}
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component="label" variant="outlined" startIcon={<CloudUploadRounded />} disabled={!isAdmin || loading}>Choose logo<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => selectAsset('logo', event.target.files?.[0])} /></Button>{(logoPreview || brandingSettings.logoUrl) && <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => removeAsset('logo')} disabled={!isAdmin || loading}>Remove</Button>}</Stack>
                </Paper>
              </Grid>
              <Grid item xs={12} md={5}>
                <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><ImageRounded color="secondary" /><Box><Typography fontWeight={750}>Browser favicon</Typography><Typography variant="caption" color="text.secondary">Square PNG or ICO · maximum 5 MB</Typography></Box></Stack>
                  <Box sx={{ minHeight: 150, p: 2, mb: 2, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'grey.50', border: '1px dashed', borderColor: 'divider' }}>
                    {(faviconPreview || brandingSettings.faviconUrl) ? <Box component="img" src={faviconPreview || assetUrl(brandingSettings.faviconUrl)} alt="Favicon preview" sx={{ width: 72, height: 72, objectFit: 'contain' }} /> : <Stack alignItems="center" color="text.disabled"><ImageRounded sx={{ fontSize: 42 }} /><Typography variant="body2">Default favicon</Typography></Stack>}
                  </Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component="label" variant="outlined" startIcon={<CloudUploadRounded />} disabled={!isAdmin || loading}>Choose favicon<input hidden type="file" accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico" onChange={event => selectAsset('favicon', event.target.files?.[0])} /></Button>{(faviconPreview || brandingSettings.faviconUrl) && <Button color="error" startIcon={<DeleteOutlineRounded />} onClick={() => removeAsset('favicon')} disabled={!isAdmin || loading}>Remove</Button>}</Stack>
                </Paper>
              </Grid>
            </Grid>

            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><PaletteRounded color="primary" /><Box><Typography fontWeight={750}>Brand colors</Typography><Typography variant="caption" color="text.secondary">Applied to buttons, navigation accents, links and interactive controls.</Typography></Box></Stack>
              <Grid container spacing={2}><Grid item xs={12} sm={6}><TextField fullWidth type="color" label="Primary color" name="primaryColor" value={brandingSettings.primaryColor} onChange={handleBrandingChange} disabled={!isAdmin || loading} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={12} sm={6}><TextField fullWidth type="color" label="Secondary color" name="secondaryColor" value={brandingSettings.secondaryColor} onChange={handleBrandingChange} disabled={!isAdmin || loading} InputLabelProps={{ shrink: true }} /></Grid></Grid>
            </Paper>

            <Box>
              <Typography variant="h6" sx={{ mb: 0.5 }}>Search and browser metadata</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Controls the browser tab title and the description shown by search engines and shared links.</Typography>
              <Stack spacing={2}><TextField fullWidth label="Meta title" name="metaTitle" value={brandingSettings.metaTitle} onChange={handleBrandingChange} disabled={!isAdmin || loading} helperText={`${brandingSettings.metaTitle.length}/120 characters`} inputProps={{ maxLength: 120 }} /><TextField fullWidth multiline minRows={3} label="Meta description" name="metaDescription" value={brandingSettings.metaDescription} onChange={handleBrandingChange} disabled={!isAdmin || loading} helperText={`${brandingSettings.metaDescription.length}/300 characters`} inputProps={{ maxLength: 300 }} /><TextField fullWidth label="Meta keywords" name="metaKeywords" value={brandingSettings.metaKeywords} onChange={handleBrandingChange} disabled={!isAdmin || loading} helperText="Comma-separated phrases" inputProps={{ maxLength: 300 }} /></Stack>
            </Box>
          </Stack>
        </TabPanel>

        {/* General Settings Tab */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Company Name"
                fullWidth
                name="companyName"
                value={generalSettings.companyName}
                onChange={handleGeneralSettingsChange}
                disabled={!isAdmin || loading}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!isAdmin || loading}>
                <InputLabel id="currency-label">Default Currency</InputLabel>
                <Select
                  labelId="currency-label"
                  name="defaultCurrency"
                  value={generalSettings.defaultCurrency}
                  onChange={handleGeneralSettingsChange}
                  label="Default Currency"
                >
                  <MenuItem value="NGN">NGN (₦)</MenuItem>
                  <MenuItem value="USD">USD ($)</MenuItem>
                  <MenuItem value="EUR">EUR (€)</MenuItem>
                  <MenuItem value="GBP">GBP (£)</MenuItem>
                  <MenuItem value="JPY">JPY (¥)</MenuItem>
                  <MenuItem value="CAD">CAD ($)</MenuItem>
                  <MenuItem value="ZAR">ZAR (R)</MenuItem>
                  <MenuItem value="GHS">GHS (₵)</MenuItem>
                  <MenuItem value="KES">KES (KSh)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!isAdmin || loading}>
                <InputLabel id="language-label">Default Language</InputLabel>
                <Select
                  labelId="language-label"
                  name="defaultLanguage"
                  value={generalSettings.defaultLanguage}
                  onChange={handleGeneralSettingsChange}
                  label="Default Language"
                >
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="fr">French</MenuItem>
                  <MenuItem value="de">German</MenuItem>
                  <MenuItem value="es">Spanish</MenuItem>
                  <MenuItem value="it">Italian</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!isAdmin || loading}>
                <InputLabel id="timezone-label">Time Zone</InputLabel>
                <Select
                  labelId="timezone-label"
                  name="timeZone"
                  value={generalSettings.timeZone}
                  onChange={handleGeneralSettingsChange}
                  label="Time Zone"
                >
                  <MenuItem value="Africa/Lagos">Lagos (WAT)</MenuItem>
                  <MenuItem value="Africa/Cairo">Cairo (EET)</MenuItem>
                  <MenuItem value="Africa/Johannesburg">Johannesburg (SAST)</MenuItem>
                  <MenuItem value="Africa/Nairobi">Nairobi (EAT)</MenuItem>
                  <MenuItem value="Africa/Accra">Accra (GMT)</MenuItem>
                  <MenuItem value="Africa/Casablanca">Casablanca (WEST)</MenuItem>
                  <MenuItem value="UTC">UTC</MenuItem>
                  <MenuItem value="America/New_York">Eastern Time (ET)</MenuItem>
                  <MenuItem value="America/Chicago">Central Time (CT)</MenuItem>
                  <MenuItem value="Europe/London">London (GMT)</MenuItem>
                  <MenuItem value="Europe/Paris">Paris (CET)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!isAdmin || loading}>
                <InputLabel id="date-format-label">Date Format</InputLabel>
                <Select
                  labelId="date-format-label"
                  name="dateFormat"
                  value={generalSettings.dateFormat}
                  onChange={handleGeneralSettingsChange}
                  label="Date Format"
                >
                  <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                  <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                  <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!isAdmin || loading}>
                <InputLabel id="time-format-label">Time Format</InputLabel>
                <Select
                  labelId="time-format-label"
                  name="timeFormat"
                  value={generalSettings.timeFormat}
                  onChange={handleGeneralSettingsChange}
                  label="Time Format"
                >
                  <MenuItem value="12h">12-hour (AM/PM)</MenuItem>
                  <MenuItem value="24h">24-hour</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </TabPanel>
        
        {/* OCPP Settings Tab */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Heartbeat Interval (seconds)"
                fullWidth
                name="heartbeatInterval"
                type="number"
                value={ocppSettings.heartbeatInterval}
                onChange={handleOcppSettingsChange}
                disabled={!isAdmin || loading}
                inputProps={{ min: 0 }}
                helperText="Interval between heartbeat messages"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Meter Value Interval (seconds)"
                fullWidth
                name="meterValueInterval"
                type="number"
                value={ocppSettings.meterValueInterval}
                onChange={handleOcppSettingsChange}
                disabled={!isAdmin || loading}
                inputProps={{ min: 0 }}
                helperText="Interval between meter value transmissions"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Meter Value Sample Interval (seconds)"
                fullWidth
                name="meterValueSampleInterval"
                type="number"
                value={ocppSettings.meterValueSampleInterval}
                onChange={handleOcppSettingsChange}
                disabled={!isAdmin || loading}
                inputProps={{ min: 0 }}
                helperText="Interval between meter value samples"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Connection Timeout (seconds)"
                fullWidth
                name="connectionTimeoutSecs"
                type="number"
                value={ocppSettings.connectionTimeoutSecs}
                onChange={handleOcppSettingsChange}
                disabled={!isAdmin || loading}
                inputProps={{ min: 0 }}
                helperText="Time to wait before considering a connection timed out"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Reset Retries"
                fullWidth
                name="resetRetries"
                type="number"
                value={ocppSettings.resetRetries}
                onChange={handleOcppSettingsChange}
                disabled={!isAdmin || loading}
                inputProps={{ min: 0 }}
                helperText="Number of times to retry a reset command"
              />
            </Grid>
          </Grid>
        </TabPanel>
        
        {/* Pricing Settings Tab */}
        <TabPanel value={tabValue} index={99}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Base Rate per kWh (₦)"
                fullWidth
                type="number"
                name="baseRatePerKwh"
                value={pricingSettings.baseRatePerKwh}
                onChange={handlePricingSettingsChange}
                disabled={!isAdmin || loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₦</InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Standard rate charged per kilowatt-hour
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Peak Hour Rate per kWh (₦)"
                fullWidth
                type="number"
                name="peakHourRate"
                value={pricingSettings.peakHourRate}
                onChange={handlePricingSettingsChange}
                disabled={!isAdmin || loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₦</InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Higher rate during peak hours (typically 7am-10pm)
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Off-Peak Rate per kWh (₦)"
                fullWidth
                type="number"
                name="offPeakRate"
                value={pricingSettings.offPeakRate}
                onChange={handlePricingSettingsChange}
                disabled={!isAdmin || loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₦</InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Discounted rate during off-peak hours (typically 10pm-7am)
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Member Discount (%)"
                fullWidth
                type="number"
                name="memberDiscount"
                value={pricingSettings.memberDiscount}
                onChange={handlePricingSettingsChange}
                disabled={!isAdmin || loading}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Discount percentage for registered members
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Minimum Charge (₦)"
                fullWidth
                type="number"
                name="minimumCharge"
                value={pricingSettings.minimumCharge}
                onChange={handlePricingSettingsChange}
                disabled={!isAdmin || loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₦</InputAdornment>
                  ),
                }}
              />
              <Typography variant="caption" color="text.secondary">
                Minimum amount to charge for any session
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Card sx={{ mt: 2, p: 2, backgroundColor: 'background.paper' }}>
                <Typography variant="subtitle1" gutterBottom>
                  <strong>Pricing Preview</strong>
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2">
                      10 kWh charging session: <strong>₦{(pricingSettings.baseRatePerKwh * 10).toLocaleString()}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2">
                      Member price for 10 kWh: <strong>₦{(pricingSettings.baseRatePerKwh * 10 * (1 - pricingSettings.memberDiscount / 100)).toLocaleString()}</strong>
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="body2">
                      Peak hours price for 10 kWh: <strong>₦{(pricingSettings.peakHourRate * 10).toLocaleString()}</strong>
                    </Typography>
                  </Grid>
                </Grid>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
        
        {/* Notifications Tab */}
        <TabPanel value={tabValue} index={3}>
          <List>
            <ListItem>
              <ListItemText 
                primary="Email Notifications"
                secondary="Enable email notifications from the system"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="emailNotifications"
                  checked={notificationSettings.emailNotifications}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Station Status Alerts"
                secondary="Receive alerts when station status changes"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="stationStatusAlerts"
                  checked={notificationSettings.stationStatusAlerts}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Transaction Alerts"
                secondary="Receive alerts for all transactions"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="transactionAlerts"
                  checked={notificationSettings.transactionAlerts}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Error Alerts"
                secondary="Receive alerts for errors and faults"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="errorAlerts"
                  checked={notificationSettings.errorAlerts}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Daily Reports"
                secondary="Receive daily summary reports"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="dailyReports"
                  checked={notificationSettings.dailyReports}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Weekly Reports"
                secondary="Receive weekly summary reports"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="weeklyReports"
                  checked={notificationSettings.weeklyReports}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemText 
                primary="Monthly Reports"
                secondary="Receive monthly summary reports"
              />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  name="monthlyReports"
                  checked={notificationSettings.monthlyReports}
                  onChange={handleNotificationSettingsChange}
                  disabled={!isAdmin || loading}
                />
              </ListItemSecondaryAction>
            </ListItem>
          </List>
        </TabPanel>
      </Paper>
      
      {/* System Status Card */}
      {isAdmin && (
        <Card sx={{ mt: 3, borderRadius: 2 }}>
          <CardHeader title="System Status" />
          <Divider />
          <CardContent>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box 
                    sx={{ 
                      bgcolor: 'success.main', 
                      width: 12, 
                      height: 12, 
                      borderRadius: '50%',
                      mr: 1 
                    }} 
                  />
                  <Typography variant="body1">
                    System is running normally
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Last system check: {new Date().toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={12} md={6} sx={{ textAlign: 'right' }}>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<SettingsIcon />}
                  sx={{ mr: 1 }}
                >
                  System Maintenance
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<PowerIcon />}
                >
                  Restart Services
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default Settings;
