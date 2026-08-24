import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Divider,
  Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  PhoneAndroid as AndroidIcon,
  Apple as AppleIcon,
  Language as WebIcon,
  SystemUpdate as UpdateIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../services/api';

function AppUpdate() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);
  const [settings, setSettings] = useState({
    minVersion: '',
    latestVersion: '',
    forceUpdate: false,
    message: '',
    updateUrl: { android: '', ios: '', web: '' },
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/mobile/app-version');
      if (res.data.success) {
        setSettings({
          minVersion: res.data.minVersion || '',
          latestVersion: res.data.latestVersion || '',
          forceUpdate: res.data.forceUpdate || false,
          message: res.data.message || '',
          updateUrl: res.data.updateUrl || { android: '', ios: '', web: '' },
        });
      }
    } catch (err) {
      setAlert({ type: 'error', text: 'Failed to load settings' });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setAlert(null);
    try {
      const res = await api.put('/mobile/app-version', settings);
      if (res.data.success) {
        setAlert({ type: 'success', text: 'Settings saved successfully!' });
      } else {
        setAlert({ type: 'error', text: res.data.message || 'Failed to save' });
      }
    } catch (err) {
      setAlert({ type: 'error', text: err.response?.data?.message || 'Failed to save settings' });
    }
    setSaving(false);
  };

  const updateField = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const updateUrl = (platform, value) => {
    setSettings((prev) => ({
      ...prev,
      updateUrl: { ...prev.updateUrl, [platform]: value },
    }));
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            App Update Control
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage forced updates for the mobile app across all platforms
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          size="large"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 3 }} onClose={() => setAlert(null)}>
          {alert.text}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Version Numbers */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <UpdateIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Version Numbers
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <TextField
                fullWidth
                label="Minimum Version"
                helperText="Users below this version MUST update to continue"
                value={settings.minVersion}
                onChange={(e) => updateField('minVersion', e.target.value)}
                placeholder="e.g. 1.0.0"
                sx={{ mb: 3 }}
              />
              <TextField
                fullWidth
                label="Latest Version"
                helperText="The newest version available in the stores"
                value={settings.latestVersion}
                onChange={(e) => updateField('latestVersion', e.target.value)}
                placeholder="e.g. 1.1.0"
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Force Update */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <WarningIcon sx={{ mr: 1, verticalAlign: 'middle', color: 'warning.main' }} />
                Force Update
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.forceUpdate}
                    onChange={(e) => updateField('forceUpdate', e.target.checked)}
                    color="error"
                  />
                }
                label={
                  <Box>
                    <Typography fontWeight="bold">
                      Force ALL users to update
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      When enabled, every user regardless of their current version will be forced to update. Use only for critical or security updates.
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', mt: 1 }}
              />
              {settings.forceUpdate && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Force update is <strong>ON</strong> — all mobile users will see the mandatory update dialog.
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Update Message */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Update Message
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Message shown to users"
                value={settings.message}
                onChange={(e) => updateField('message', e.target.value)}
                placeholder="A new version is available with important improvements."
              />
            </CardContent>
          </Card>
        </Grid>

        {/* Store URLs */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Store URLs
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Android (Play Store)"
                    value={settings.updateUrl.android}
                    onChange={(e) => updateUrl('android', e.target.value)}
                    placeholder="https://play.google.com/store/..."
                    InputProps={{
                      startAdornment: <AndroidIcon sx={{ mr: 1, color: '#3DDC84' }} />,
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="iOS (App Store)"
                    value={settings.updateUrl.ios}
                    onChange={(e) => updateUrl('ios', e.target.value)}
                    placeholder="https://apps.apple.com/app/..."
                    InputProps={{
                      startAdornment: <AppleIcon sx={{ mr: 1 }} />,
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Web"
                    value={settings.updateUrl.web}
                    onChange={(e) => updateUrl('web', e.target.value)}
                    placeholder="https://evcharge.eride.ng"
                    InputProps={{
                      startAdornment: <WebIcon sx={{ mr: 1, color: '#1976d2' }} />,
                    }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Current Status Summary */}
        <Grid item xs={12}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Current Configuration Summary
              </Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                <Chip label={`Min: v${settings.minVersion || '—'}`} color="primary" variant="outlined" />
                <Chip label={`Latest: v${settings.latestVersion || '—'}`} color="success" variant="outlined" />
                <Chip
                  label={settings.forceUpdate ? 'Force Update: ON' : 'Force Update: OFF'}
                  color={settings.forceUpdate ? 'error' : 'default'}
                  variant={settings.forceUpdate ? 'filled' : 'outlined'}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default AppUpdate;
