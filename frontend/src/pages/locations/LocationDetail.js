import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem,
  Paper, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import {
  ArrowBackRounded, BoltRounded, DownloadRounded, EvStationRounded,
  FilterAltOffRounded, HistoryRounded, PaymentsRounded, RefreshRounded,
  SearchRounded, TuneRounded, VisibilityRounded, WifiRounded, LocationOnRounded
} from '@mui/icons-material';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';

const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value) || 0);
const energy = value => {
  const wh = Number(value) || 0;
  return wh >= 1000 ? `${(wh / 1000).toFixed(2)} kWh` : `${wh.toFixed(0)} Wh`;
};
const dateTime = value => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value)) : '—';
const statusColor = status => status === 'Completed' || status === 'Available' || status === 'SUCCESS' ? 'success' : status === 'InProgress' || status === 'Charging' || status === 'Pending' ? 'warning' : status === 'Faulted' || status === 'FAILED' ? 'error' : 'default';

function Metric({ label, value, helper, icon, color = 'primary' }) {
  return <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}><CardContent sx={{ p: { xs: 1.75, sm: 2.25 } }}><Stack direction="row" justifyContent="space-between" spacing={1.5}><Box><Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography><Typography variant="h5" fontWeight={850} sx={{ mt: .5 }}>{value}</Typography><Typography variant="caption" color="text.secondary">{helper}</Typography></Box><Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center', color: `${color}.main`, bgcolor: `${color}.50` }}>{icon}</Box></Stack></CardContent></Card>;
}

export default function LocationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ from: '', to: '', station: '', status: 'all', search: '', page: 1, limit: 20, eventPage: 1, eventLimit: 20 });

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      setError('');
      if (silent) setRefreshing(true); else setLoading(true);
      const response = await api.get(`/admin/locations/${id}/activity`, { params: filters });
      setReport(response.data.report || null);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError.serverMessage || requestError.message || 'Failed to load location activity');
    } finally { setLoading(false); setRefreshing(false); }
  }, [id, filters]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (changes, resetTransactionPage = true) => setFilters(previous => ({
    ...previous,
    ...changes,
    ...(resetTransactionPage && !Object.prototype.hasOwnProperty.call(changes, 'page') ? { page: 1 } : {})
  }));
  const clearFilters = () => setFilters(previous => ({ ...previous, from: '', to: '', station: '', status: 'all', search: '', page: 1, eventPage: 1 }));
  const hasFilters = Boolean(filters.from || filters.to || filters.station || filters.search || filters.status !== 'all');
  const stationSummary = report?.stationSummary || [];
  const summary = report?.summary || {};
  const pagination = report?.pagination || { page: 1, limit: filters.limit, total: 0, pages: 0 };
  const eventPagination = report?.eventPagination || { page: 1, limit: filters.eventLimit, total: 0, pages: 0 };
  const stations = report?.stations || [];
  const transactions = report?.transactions || [];
  const events = report?.events || [];
  const daily = report?.daily || [];
  const maxDailyEnergy = Math.max(...daily.map(item => Number(item.energyWh) || 0), 1);

  const exportCsv = async () => {
    try {
      setError('');
      const response = await api.get(`/admin/locations/${id}/activity.csv`, { params: filters, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `location-${id}-activity.csv`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Failed to export location activity');
    }
  };

  if (loading && !report) return <Box minHeight="55vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
  if (!report) return <Stack spacing={2}><Button startIcon={<ArrowBackRounded />} onClick={() => navigate('/locations')}>Back to locations</Button>{error && <Alert severity="error">{error}</Alert>}</Stack>;

  return <Stack spacing={{ xs: 2, md: 3 }}>
    <PageHeader
      eyebrow="Location operations"
      title={report.location.name}
      description={[report.location.address, report.location.city, report.location.state].filter(Boolean).join(', ') || 'Location activity and operational history'}
      actions={<Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end"><Button variant="outlined" startIcon={<ArrowBackRounded />} onClick={() => navigate('/locations')}>Locations</Button><Button variant="outlined" startIcon={<DownloadRounded />} onClick={exportCsv}>Export CSV</Button><Tooltip title="Refresh"><span><IconButton onClick={() => load({ silent: true })} disabled={refreshing}><RefreshRounded /></IconButton></span></Tooltip></Stack>}
    />

    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: -1.5 }}>
      <Chip size="small" icon={<LocationOnRounded />} label={[report.location.city, report.location.state].filter(Boolean).join(', ') || 'Location'} />
      <Chip size="small" label={report.location.active === false ? 'Inactive location' : 'Active location'} color={report.location.active === false ? 'default' : 'success'} />
      <Chip size="small" label={`${stations.length} assigned station${stations.length === 1 ? '' : 's'}`} variant="outlined" />
      <Chip size="small" label={`${money(Number(report.location.pricePerWh || 0) * 1000)}/kWh`} variant="outlined" />
    </Stack>

    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

    <Grid container spacing={1.5}>
      <Grid item xs={6} md={2}><Metric label="Sessions" value={Number(summary.sessions || 0).toLocaleString()} helper={`${summary.completed || 0} completed`} icon={<HistoryRounded />} /></Grid>
      <Grid item xs={6} md={2}><Metric label="Active now" value={Number(summary.active || 0).toLocaleString()} helper={`${summary.stopped || 0} stopped`} icon={<BoltRounded />} color="warning" /></Grid>
      <Grid item xs={6} md={2}><Metric label="Energy" value={energy(summary.energyWh)} helper={`${energy(summary.averageEnergyWh)} average`} icon={<BoltRounded />} color="success" /></Grid>
      <Grid item xs={6} md={2}><Metric label="Billed amount" value={money(summary.amount)} helper={`${summary.billed || 0} billed sessions`} icon={<PaymentsRounded />} color="primary" /></Grid>
      <Grid item xs={6} md={2}><Metric label="Gross amount" value={money(summary.grossAmount)} helper={`${summary.unbilled || 0} unbilled`} icon={<PaymentsRounded />} color="warning" /></Grid>
      <Grid item xs={6} md={2}><Metric label="Stations online" value={`${stations.filter(station => ['Available', 'Charging', 'Preparing', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved'].includes(station.status)).length}/${stations.length}`} helper="Current connectivity" icon={<WifiRounded />} color="success" /></Grid>
    </Grid>

    <Card variant="outlined"><CardContent sx={{ p: { xs: 1.5, md: 2 } }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><TuneRounded color="primary" /><Box><Typography fontWeight={800}>Activity filters</Typography><Typography variant="caption" color="text.secondary">Filter sessions and activity using West Africa Time.</Typography></Box></Stack><Grid container spacing={1.25} alignItems="center"><Grid item xs={12} md={4}><TextField fullWidth size="small" placeholder="Search session, tag or station" value={filters.search} onChange={event => updateFilter({ search: event.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="From" type="date" value={filters.from} onChange={event => updateFilter({ from: event.target.value })} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="To" type="date" value={filters.to} onChange={event => updateFilter({ to: event.target.value })} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={2}><FormControl fullWidth size="small"><InputLabel>Station</InputLabel><Select label="Station" value={filters.station} onChange={event => updateFilter({ station: event.target.value })}><MenuItem value="">All stations</MenuItem>{stations.map(station => <MenuItem key={station.chargePointId} value={station.chargePointId}>{station.name || station.chargePointId}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={6} md={2}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select label="Status" value={filters.status} onChange={event => updateFilter({ status: event.target.value })}><MenuItem value="all">All statuses</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="InProgress">Active</MenuItem><MenuItem value="Stopped">Stopped</MenuItem></Select></FormControl></Grid></Grid>{hasFilters && <Button size="small" color="inherit" startIcon={<FilterAltOffRounded />} onClick={clearFilters} sx={{ mt: 1.25 }}>Clear filters</Button>}</CardContent>{refreshing && <Box sx={{ height: 3, bgcolor: 'primary.main', opacity: .35 }} />}</Card>

    <Grid container spacing={2}>
      <Grid item xs={12} lg={7}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Box><Typography variant="h6" fontWeight={800}>Station activity</Typography><Typography variant="body2" color="text.secondary">Health and contribution across this location.</Typography></Box><Chip size="small" label={`${stations.length} stations`} /></Stack><Stack spacing={1.1} sx={{ mt: 2 }}>{stationSummary.map(station => <Paper key={station.chargePointId} variant="outlined" sx={{ p: 1.35, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}><EvStationRounded color="primary" /><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={750} noWrap>{station.name || station.chargePointId}</Typography><Typography variant="caption" color="text.secondary">{station.chargePointId} · {station.sessions} sessions · {energy(station.energyWh)}</Typography></Box><Chip size="small" label={station.isOnline ? station.status : 'Offline'} color={station.isOnline ? statusColor(station.status) : 'default'} /><Typography variant="body2" fontWeight={750}>{money(station.amount)}</Typography></Stack></Paper>)}{!stationSummary.length && <Typography color="text.secondary" sx={{ py: 3 }}>No stations are assigned to this location.</Typography>}</Stack></CardContent></Card></Grid>
      <Grid item xs={12} lg={5}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="h6" fontWeight={800}>Daily movement</Typography><Typography variant="body2" color="text.secondary">Energy and sessions in the selected range.</Typography><Stack spacing={1.1} sx={{ mt: 2 }}>{daily.slice(-12).map(item => <Box key={item.date}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography variant="caption" color="text.secondary">{item.date}</Typography><Typography variant="caption" fontWeight={750}>{energy(item.energyWh)} · {item.sessions} sessions</Typography></Stack><Box sx={{ height: 7, borderRadius: 99, bgcolor: 'action.hover', mt: .5, overflow: 'hidden' }}><Box sx={{ width: `${Math.min(100, (Number(item.energyWh) / maxDailyEnergy) * 100)}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 99 }} /></Box></Box>)}{!daily.length && <Typography color="text.secondary" sx={{ py: 3 }}>No activity in this range.</Typography>}</Stack></CardContent></Card></Grid>
    </Grid>

    <Card variant="outlined"><CardContent sx={{ p: 0 }}><Box sx={{ p: { xs: 1.5, md: 2 } }}><Typography variant="h6" fontWeight={800}>Transaction history</Typography><Typography variant="body2" color="text.secondary">Every charging session associated with this location.</Typography></Box><Divider /><TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 980 }}><TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station</TableCell><TableCell>Status</TableCell><TableCell>Started</TableCell><TableCell>Stopped</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">View</TableCell></TableRow></TableHead><TableBody>{transactions.map(row => <TableRow key={row.id} hover><TableCell><Typography fontWeight={750}>#{row.transactionId}</Typography><Typography variant="caption" color="text.secondary">{row.idTag || 'No tag'}</Typography></TableCell><TableCell>{row.station?.name || row.chargePointId}<Typography variant="caption" display="block" color="text.secondary">Connector {row.connectorId}</Typography></TableCell><TableCell><Chip size="small" label={row.status === 'InProgress' ? 'Active' : row.status} color={statusColor(row.status)} /></TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.startTime)}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.stopTime)}</TableCell><TableCell align="right">{energy(row.energyDelivered)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(row.amount)}</TableCell><TableCell align="right"><Tooltip title="Open transaction"><IconButton size="small" onClick={() => navigate(`/transactions/${row.transactionId}`)}><VisibilityRounded fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}{!transactions.length && <TableRow><TableCell colSpan={8}><Box sx={{ py: 6, textAlign: 'center' }}><HistoryRounded sx={{ fontSize: 42, color: 'text.disabled' }} /><Typography fontWeight={750}>No matching activity</Typography><Typography variant="body2" color="text.secondary">Try a wider date range or clear the filters.</Typography></Box></TableCell></TableRow>}</TableBody></Table></TableContainer><Divider /><TablePagination component="div" count={pagination.total || 0} page={Math.max((pagination.page || 1) - 1, 0)} rowsPerPage={pagination.limit || filters.limit} rowsPerPageOptions={[10, 20, 50, 100]} onPageChange={(_, page) => updateFilter({ page: page + 1 })} onRowsPerPageChange={event => updateFilter({ limit: Number(event.target.value), page: 1 })} /></CardContent></Card>

    <Card variant="outlined"><CardContent sx={{ p: 0 }}><Box sx={{ p: { xs: 1.5, md: 2 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="h6" fontWeight={800}>Protocol activity</Typography><Typography variant="body2" color="text.secondary">Recent OCPP messages received from stations at this location.</Typography></Box><Chip size="small" label={`${eventPagination.total || 0} messages`} /></Stack></Box><Divider /><TableContainer sx={{ maxHeight: 420, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>Time</TableCell><TableCell>Station</TableCell><TableCell>Message</TableCell><TableCell>Direction</TableCell><TableCell>Status</TableCell><TableCell>Error</TableCell></TableRow></TableHead><TableBody>{events.map(event => <TableRow key={event.id} hover><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(event.timestamp || event.createdAt)}</TableCell><TableCell>{event.chargePointId}</TableCell><TableCell>{event.message_type}</TableCell><TableCell><Chip size="small" variant="outlined" label={event.direction} /></TableCell><TableCell><Chip size="small" label={event.status} color={statusColor(event.status)} /></TableCell><TableCell>{event.errorCode || event.errorDescription || '—'}</TableCell></TableRow>)}{!events.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>No protocol messages in this range.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer><Divider /><TablePagination component="div" count={eventPagination.total || 0} page={Math.max((eventPagination.page || 1) - 1, 0)} rowsPerPage={eventPagination.limit || filters.eventLimit} rowsPerPageOptions={[10, 20, 50, 100]} onPageChange={(_, page) => updateFilter({ eventPage: page + 1 }, false)} onRowsPerPageChange={event => updateFilter({ eventLimit: Number(event.target.value), eventPage: 1 }, false)} /></CardContent></Card>
  </Stack>;
}
