import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Pagination,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  ErrorOutline as ErrorIcon,
  InstallDesktop as InstallIcon,
  Link as LinkIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  Send as SendIcon,
  SystemUpdateAlt as FirmwareIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import stationService from '../../services/stationService';

const TERMINAL_STATUSES = new Set(['Installed', 'DownloadFailed', 'InstallationFailed', 'CommandFailed']);
const FAILURE_STATUSES = new Set(['DownloadFailed', 'InstallationFailed', 'CommandFailed']);
const STEPS = ['Command sent', 'Downloading', 'Downloaded', 'Installing', 'Installed'];
const SUPPORTED_EXTENSIONS = '.bin,.fw,.hex,.img,.ota,.zip,.tar,.gz,.tgz';

const blankForm = () => ({
  source: 'url',
  location: '',
  file: null,
  targetVersion: '',
  scheduleMode: 'now',
  retrieveDate: format(new Date(Date.now() + 5 * 60 * 1000), "yyyy-MM-dd'T'HH:mm"),
  retries: 2,
  retryInterval: 60,
  releaseNotes: ''
});

const parsePayload = payload => {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try { return JSON.parse(payload); } catch (_) { return {}; }
};

const readableDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, 'dd MMM yyyy, HH:mm:ss');
};

const statusColor = status => {
  if (status === 'Installed') return 'success';
  if (FAILURE_STATUSES.has(status)) return 'error';
  if (['Downloading', 'Installing'].includes(status)) return 'primary';
  if (status === 'Downloaded') return 'info';
  if (['CommandSent', 'Acknowledged', 'Idle', 'Dispatching'].includes(status)) return 'warning';
  return 'default';
};

const activeStepFor = status => {
  if (['Dispatching', 'CommandSent', 'Acknowledged', 'Idle'].includes(status)) return 0;
  if (status === 'Downloading') return 1;
  if (status === 'Downloaded') return 2;
  if (status === 'Installing') return 3;
  if (status === 'Installed') return 5;
  return 0;
};

function StationFirmwarePanel({ stationId, station, canManage = false, onStationRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(blankForm);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchFirmware = useCallback(async ({ silent = false, targetPage = page } = {}) => {
    if (!stationId) return;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await stationService.getFirmwareHistory(stationId, { page: targetPage, limit: 8 });
      setData(response);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load firmware update information');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [stationId, page]);

  useEffect(() => {
    fetchFirmware({ targetPage: page });
    const interval = setInterval(() => fetchFirmware({ silent: true, targetPage: page }), 5000);
    return () => clearInterval(interval);
  }, [fetchFirmware, page]);

  const liveStation = data?.station || station || {};
  const latest = data?.latest || null;
  const latestRequestedAt = latest?.requestedAt ? new Date(latest.requestedAt).getTime() : 0;
  const latestRetrieveAt = latest?.retrieveDate ? new Date(latest.retrieveDate).getTime() : 0;
  const activeUpdate = latest &&
    !TERMINAL_STATUSES.has(latest.status) &&
    (
      latestRequestedAt >= Date.now() - (72 * 60 * 60 * 1000) ||
      latestRetrieveAt >= Date.now() - (60 * 60 * 1000)
    )
    ? latest
    : null;
  const totalPages = Math.max(1, Math.ceil((data?.count || 0) / 8));
  const blockedReason = !canManage
    ? 'Your account can view firmware history but cannot start updates.'
    : !liveStation.isConnected
      ? 'Connect the station to OCPP before sending a firmware update.'
      : liveStation.hasActiveSession
        ? 'An active charging session is running. Stop it before updating firmware.'
        : activeUpdate
          ? `Update #${activeUpdate.id} is still ${activeUpdate.status}. Wait for it to finish before starting another.`
          : '';

  const formValid = useMemo(() => {
    const sourceReady = form.source === 'upload' ? Boolean(form.file) : /^https?:\/\//i.test(form.location.trim());
    const scheduleReady = form.scheduleMode === 'now' || Boolean(form.retrieveDate);
    return sourceReady && scheduleReady && Boolean(form.targetVersion.trim()) && !blockedReason;
  }, [form, blockedReason]);

  const updateForm = event => {
    const { name, value } = event.target;
    setForm(previous => ({ ...previous, [name]: value }));
  };

  const submitUpdate = async () => {
    setSubmitting(true);
    setUploadProgress(0);
    setError('');
    setSuccess('');
    try {
      const response = await stationService.updateFirmware(stationId, {
        file: form.source === 'upload' ? form.file : null,
        location: form.source === 'url' ? form.location.trim() : '',
        targetVersion: form.targetVersion.trim(),
        retrieveDate: form.scheduleMode === 'later' ? new Date(form.retrieveDate).toISOString() : '',
        retries: Number(form.retries),
        retryInterval: Number(form.retryInterval),
        releaseNotes: form.releaseNotes.trim()
      }, setUploadProgress);
      setSuccess(response.message || 'Firmware update command sent');
      setConfirmOpen(false);
      setForm(blankForm());
      await fetchFirmware({ targetPage: 1 });
      setPage(1);
      if (onStationRefresh) onStationRefresh();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Firmware update could not be started');
      setConfirmOpen(false);
      await fetchFirmware({ silent: true, targetPage: 1 });
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  if (loading && !data) {
    return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }

  return (
    <Stack spacing={2.5}>
      {refreshing && <LinearProgress sx={{ borderRadius: 999 }} />}
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert>}

      <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3.5, color: 'white', overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg, #0A2E2A 0%, #0E725A 62%, #15A67A 100%)' }}>
        <Box sx={{ position: 'absolute', width: 230, height: 230, borderRadius: '50%', right: -80, top: -110, bgcolor: 'rgba(255,255,255,.08)' }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} position="relative">
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} mb={0.8}>
              <FirmwareIcon />
              <Typography variant="overline" sx={{ letterSpacing: 1.2, color: 'rgba(255,255,255,.72)' }}>OCPP 1.6 firmware control</Typography>
            </Stack>
            <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: '1.55rem', sm: '2rem' } }}>
              Version {liveStation.firmwareVersion || 'unknown'}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.72)', mt: 0.5 }}>
              {liveStation.vendor || 'Unknown vendor'} {liveStation.model ? `· ${liveStation.model}` : ''}
            </Typography>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap" alignContent="flex-start">
            <Chip label={liveStation.isConnected ? 'OCPP connected' : 'Offline'} sx={{ bgcolor: liveStation.isConnected ? '#D1FAE5' : 'rgba(255,255,255,.16)', color: liveStation.isConnected ? '#065F46' : 'white', fontWeight: 750 }} />
            <Chip label={liveStation.hasActiveSession ? 'Charging session active' : 'Safe to service'} sx={{ bgcolor: liveStation.hasActiveSession ? '#FEF3C7' : 'rgba(255,255,255,.14)', color: liveStation.hasActiveSession ? '#92400E' : 'white', fontWeight: 750 }} />
          </Stack>
        </Stack>
      </Paper>

      {latest && (
        <Card>
          <CardContent sx={{ p: { xs: 2, md: 3 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} mb={2.5}>
              <Box>
                <Typography variant="h6" fontWeight={800}>Latest update</Typography>
                <Typography variant="body2" color="text.secondary">
                  Target {latest.targetVersion || 'not specified'} · requested {readableDate(latest.requestedAt)}
                </Typography>
              </Box>
              <Chip label={latest.status} color={statusColor(latest.status)} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 750 }} />
            </Stack>
            {FAILURE_STATUSES.has(latest.status) && (
              <Alert severity="error" icon={<ErrorIcon />} sx={{ mb: 2 }}>{latest.statusMessage || 'The station reported that the update failed.'}</Alert>
            )}
            <Stepper activeStep={activeStepFor(latest.status)} alternativeLabel sx={{ '& .MuiStepLabel-label': { fontSize: { xs: '.67rem', sm: '.8rem' } } }}>
              {STEPS.map(step => <Step key={step}><StepLabel>{step}</StepLabel></Step>)}
            </Stepper>
            <Grid container spacing={1.25} mt={2}>
              {[
                ['Scheduled retrieval', readableDate(latest.retrieveDate)],
                ['Last station update', readableDate(latest.lastStatusAt)],
                ['Reported after reboot', latest.currentFirmwareVersion || 'Not reported'],
                ['Command ID', latest.requestMessageId || 'Not dispatched']
              ].map(([label, value]) => (
                <Grid item xs={12} sm={6} md={3} key={label}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', height: '100%' }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} mb={2.5}>
                <Box>
                  <Typography variant="h6" fontWeight={800}>Start a firmware update</Typography>
                  <Typography variant="body2" color="text.secondary">Upload a package or provide the vendor’s public download URL.</Typography>
                </Box>
                <SecurityIcon color="success" />
              </Stack>

              {blockedReason && <Alert severity={liveStation.hasActiveSession ? 'warning' : 'info'} sx={{ mb: 2 }}>{blockedReason}</Alert>}

              <Stack spacing={2.25}>
                <ToggleButtonGroup exclusive fullWidth value={form.source} onChange={(event, value) => value && setForm(previous => ({ ...previous, source: value }))} size="small">
                  <ToggleButton value="url"><LinkIcon sx={{ mr: 1 }} />Firmware URL</ToggleButton>
                  <ToggleButton value="upload"><CloudUploadIcon sx={{ mr: 1 }} />Upload file</ToggleButton>
                </ToggleButtonGroup>

                {form.source === 'url' ? (
                  <TextField name="location" label="Firmware download URL" value={form.location} onChange={updateForm} fullWidth placeholder="https://vendor.example/firmware/v2.4.1.bin" helperText="The URL must be reachable directly by the charge point." />
                ) : (
                  <Box sx={{ border: '1px dashed', borderColor: form.file ? 'success.main' : 'divider', borderRadius: 2.5, p: 2, bgcolor: form.file ? 'success.50' : 'action.hover' }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1.5}>
                      <Box minWidth={0}>
                        <Typography fontWeight={750}>{form.file ? form.file.name : 'Select the vendor firmware package'}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {form.file ? `${(form.file.size / 1024 / 1024).toFixed(2)} MB` : `Supported: ${SUPPORTED_EXTENSIONS.replaceAll(',', ', ')}`}
                        </Typography>
                      </Box>
                      <Button component="label" variant="outlined" startIcon={<CloudUploadIcon />}>
                        Choose file
                        <input hidden type="file" accept={SUPPORTED_EXTENSIONS} onChange={event => setForm(previous => ({ ...previous, file: event.target.files?.[0] || null }))} />
                      </Button>
                    </Stack>
                  </Box>
                )}

                <TextField name="targetVersion" label="Target firmware version" required value={form.targetVersion} onChange={updateForm} placeholder="For example, 2.4.1" helperText="Used to confirm the installed version when the charger reboots." />

                <ToggleButtonGroup exclusive fullWidth value={form.scheduleMode} onChange={(event, value) => value && setForm(previous => ({ ...previous, scheduleMode: value }))} size="small">
                  <ToggleButton value="now"><SendIcon sx={{ mr: 1 }} />Retrieve now</ToggleButton>
                  <ToggleButton value="later"><ScheduleIcon sx={{ mr: 1 }} />Schedule retrieval</ToggleButton>
                </ToggleButtonGroup>

                {form.scheduleMode === 'later' && (
                  <TextField name="retrieveDate" label="Retrieval date and time" type="datetime-local" value={form.retrieveDate} onChange={updateForm} InputLabelProps={{ shrink: true }} helperText="Displayed in your local timezone and sent to the charger as an ISO timestamp." />
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField name="retries" label="Download retries" type="number" fullWidth value={form.retries} onChange={updateForm} inputProps={{ min: 0, max: 10, step: 1 }} />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField name="retryInterval" label="Retry interval (seconds)" type="number" fullWidth value={form.retryInterval} onChange={updateForm} inputProps={{ min: 0, max: 86400, step: 1 }} />
                  </Grid>
                </Grid>

                <TextField name="releaseNotes" label="Internal release notes" value={form.releaseNotes} onChange={updateForm} multiline minRows={2} inputProps={{ maxLength: 2000 }} helperText="For the CMS audit trail; this is not sent to the charger." />

                <Button variant="contained" size="large" startIcon={<FirmwareIcon />} disabled={!formValid || submitting} onClick={() => setConfirmOpen(true)} sx={{ py: 1.35 }}>
                  Review firmware update
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Typography variant="h6" fontWeight={800}>Safety checklist</Typography>
              <Typography variant="body2" color="text.secondary" mb={1.5}>Firmware behavior is controlled by the charger manufacturer.</Typography>
              <List disablePadding>
                {[
                  ['No charging session', 'Updates are blocked while any connector has an active transaction.', <CheckCircleIcon color={liveStation.hasActiveSession ? 'disabled' : 'success'} />],
                  ['Stable OCPP connection', 'The command can only be delivered while this charger is connected.', <CheckCircleIcon color={liveStation.isConnected ? 'success' : 'disabled'} />],
                  ['Public download path', 'The charger—not the browser—must be able to reach the firmware URL.', <DownloadIcon color="primary" />],
                  ['Vendor-compatible package', 'Use only firmware approved for this exact charger model.', <SecurityIcon color="warning" />],
                  ['Allow time to reboot', 'Temporary disconnection during installation is normal.', <InstallIcon color="info" />]
                ].map(([title, description, icon], index) => (
                  <React.Fragment key={title}>
                    <ListItem disableGutters alignItems="flex-start">
                      <Box sx={{ mr: 1.5, mt: 0.3 }}>{icon}</Box>
                      <ListItemText primary={<Typography fontWeight={750}>{title}</Typography>} secondary={description} />
                    </ListItem>
                    {index < 4 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Box>
              <Typography variant="h6" fontWeight={800}>Update history</Typography>
              <Typography variant="body2" color="text.secondary">Every firmware command and the latest outcome reported by the charger.</Typography>
            </Box>
            <Button onClick={() => fetchFirmware({ silent: true })} startIcon={<RefreshIcon />} disabled={refreshing}>Refresh</Button>
          </Stack>

          {!data?.updates?.length ? (
            <Box sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
              <FirmwareIcon sx={{ fontSize: 46, opacity: 0.45 }} />
              <Typography variant="h6" color="text.primary">No firmware update history</Typography>
              <Typography variant="body2">The first update sent from this page will appear here.</Typography>
            </Box>
          ) : (
            <Stack spacing={1.25}>
              {data.updates.map(update => (
                <Paper key={update.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2.5 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.25}>
                    <Box minWidth={0}>
                      <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                        <Typography fontWeight={800}>Version {update.targetVersion || 'unspecified'}</Typography>
                        <Chip size="small" label={update.status} color={statusColor(update.status)} />
                        <Chip size="small" variant="outlined" label={update.source === 'upload' ? 'Uploaded package' : 'External URL'} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.7, overflowWrap: 'anywhere' }}>
                        {update.originalFilename || update.location}
                      </Typography>
                      {update.statusMessage && <Typography variant="caption" color={FAILURE_STATUSES.has(update.status) ? 'error.main' : 'text.secondary'}>{update.statusMessage}</Typography>}
                    </Box>
                    <Box sx={{ minWidth: { sm: 190 } }}>
                      <Typography variant="caption" color="text.secondary">Requested</Typography>
                      <Typography variant="body2" fontWeight={700}>{readableDate(update.requestedAt)}</Typography>
                      <Typography variant="caption" color="text.secondary">By {update.requestedByName || 'administrator'}</Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
              {totalPages > 1 && <Pagination count={totalPages} page={page} onChange={(event, value) => setPage(value)} color="primary" sx={{ pt: 1, alignSelf: 'center' }} />}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" fontWeight={800}>Station firmware signals</Typography>
          <Typography variant="body2" color="text.secondary" mb={1.5}>Raw `FirmwareStatusNotification` events received through OCPP.</Typography>
          {!data?.statusEvents?.length ? (
            <Alert severity="info">This station has not sent a firmware status notification yet.</Alert>
          ) : (
            <List disablePadding>
              {data.statusEvents.slice(0, 10).map((event, index) => {
                const payload = parsePayload(event.payload);
                return (
                  <React.Fragment key={event.id}>
                    <ListItem disableGutters>
                      <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: FAILURE_STATUSES.has(payload.status) ? 'error.50' : 'success.50', color: FAILURE_STATUSES.has(payload.status) ? 'error.main' : 'success.main', display: 'grid', placeItems: 'center', mr: 1.5 }}>
                        {FAILURE_STATUSES.has(payload.status) ? <ErrorIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                      </Box>
                      <ListItemText primary={<Typography fontWeight={750}>{payload.status || 'Unknown status'}</Typography>} secondary={readableDate(event.createdAt)} />
                    </ListItem>
                    {index < Math.min(data.statusEvents.length, 10) - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 800 }}>Confirm firmware update</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Incorrect firmware can make a charger unavailable. Confirm that version {form.targetVersion || '—'} is approved for {liveStation.vendor || 'this vendor'} {liveStation.model || 'charger'}.
          </Alert>
          <Stack spacing={1.25}>
            {[
              ['Station', `${liveStation.name || stationId} (${stationId})`],
              ['Current version', liveStation.firmwareVersion || 'Unknown'],
              ['Target version', form.targetVersion || 'Not specified'],
              ['Source', form.source === 'upload' ? form.file?.name : form.location],
              ['Retrieval', form.scheduleMode === 'later' ? readableDate(form.retrieveDate) : 'Immediately after acknowledgement'],
              ['Retry policy', `${form.retries} retries · ${form.retryInterval}s interval`]
            ].map(([label, value]) => (
              <Stack key={label} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={0.5}>
                <Typography color="text.secondary">{label}</Typography>
                <Typography fontWeight={750} sx={{ textAlign: { sm: 'right' }, overflowWrap: 'anywhere', maxWidth: { sm: '65%' } }}>{value}</Typography>
              </Stack>
            ))}
          </Stack>
          {submitting && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress variant={form.source === 'upload' && uploadProgress > 0 ? 'determinate' : 'indeterminate'} value={uploadProgress} />
              <Typography variant="caption" color="text.secondary">{form.source === 'upload' && uploadProgress > 0 ? `Uploading ${uploadProgress}%` : 'Delivering OCPP command…'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirmOpen(false)} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="warning" startIcon={submitting ? <CircularProgress size={17} color="inherit" /> : <FirmwareIcon />} onClick={submitUpdate} disabled={submitting}>
            {submitting ? 'Starting update…' : 'Send update command'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default StationFirmwarePanel;
