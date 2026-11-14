import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem,
  Paper, Pagination, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography
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

function ActivityPager({ label, pagination, rowsPerPage, onPageChange, onRowsPerPageChange }) {
  const total = Number(pagination?.total) || 0;
  const page = Math.max(Number(pagination?.page) || 1, 1);
  const limit = Number(pagination?.limit) || rowsPerPage || 20;
  const pages = Math.max(Number(pagination?.pages) || Math.ceil(total / limit), 1);
  const first = total ? ((page - 1) * limit) + 1 : 0;
  const last = Math.min(page * limit, total);

  return <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ px: { xs: 1.5, md: 2 }, py: 1.25 }}>
    <Typography variant="caption" color="text.secondary">{total ? `Showing ${first}-${last} of ${total} ${label}` : `No ${label} found`}</Typography>
    <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between" sx={{ width: { xs: '100%', sm: 'auto' } }}>
      <FormControl size="small" sx={{ minWidth: 92 }}>
        <InputLabel>Rows</InputLabel>
        <Select label="Rows" value={limit} onChange={onRowsPerPageChange} disabled={!total}>
          {[10, 20, 50, 100].map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </Select>
      </FormControl>
      <Pagination count={pages} page={Math.min(page, pages)} onChange={(_, nextPage) => onPageChange(nextPage)} disabled={!total} color="primary" shape="rounded" showFirstButton showLastButton siblingCount={0} boundaryCount={1} />
    </Stack>
  </Stack>;
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

    <Grid container spacing={{ xs: 1.25, md: 1.75 }} alignItems="stretch">
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Charging sessions" value={Number(summary.sessions || 0).toLocaleString()} helper={`${summary.completed || 0} completed`} icon={<HistoryRounded />} /></Grid>
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Charging now" value={Number(summary.active || 0).toLocaleString()} helper={`${summary.stopped || 0} stopped sessions`} icon={<BoltRounded />} color="warning" /></Grid>
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Energy delivered" value={energy(summary.energyWh)} helper={`${energy(summary.averageEnergyWh)} per session`} icon={<BoltRounded />} color="success" /></Grid>
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Payments received" value={money(summary.amount)} helper={`${summary.billed || 0} billed sessions`} icon={<PaymentsRounded />} color="primary" /></Grid>
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Energy value" value={money(summary.grossAmount)} helper={`${summary.unbilled || 0} awaiting billing`} icon={<PaymentsRounded />} color="warning" /></Grid>
      <Grid item xs={12} sm={6} md={4} xl={2}><Metric label="Stations online" value={`${stations.filter(station => ['Available', 'Charging', 'Preparing', 'SuspendedEV', 'SuspendedEVSE', 'Finishing', 'Reserved'].includes(station.status)).length}/${stations.length}`} helper="Available or charging" icon={<WifiRounded />} color="success" /></Grid>
    </Grid>

    <Card variant="outlined"><CardContent sx={{ p: { xs: 1.5, md: 2 } }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><TuneRounded color="primary" /><Box><Typography fontWeight={800}>Find activity</Typography><Typography variant="caption" color="text.secondary">Search charging sessions by date, station, customer tag, or status.</Typography></Box></Stack><Grid container spacing={1.25} alignItems="center"><Grid item xs={12} md={4}><TextField fullWidth size="small" placeholder="Search session, customer tag or station" value={filters.search} onChange={event => updateFilter({ search: event.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="Start date" type="date" value={filters.from} onChange={event => updateFilter({ from: event.target.value })} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" label="End date" type="date" value={filters.to} onChange={event => updateFilter({ to: event.target.value })} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={2}><FormControl fullWidth size="small"><InputLabel>Station</InputLabel><Select label="Station" value={filters.station} onChange={event => updateFilter({ station: event.target.value })}><MenuItem value="">All stations</MenuItem>{stations.map(station => <MenuItem key={station.chargePointId} value={station.chargePointId}>{station.name || station.chargePointId}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={6} md={2}><FormControl fullWidth size="small"><InputLabel>Session status</InputLabel><Select label="Session status" value={filters.status} onChange={event => updateFilter({ status: event.target.value })}><MenuItem value="all">All statuses</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="InProgress">Charging now</MenuItem><MenuItem value="Stopped">Stopped</MenuItem></Select></FormControl></Grid></Grid>{hasFilters && <Button size="small" color="inherit" startIcon={<FilterAltOffRounded />} onClick={clearFilters} sx={{ mt: 1.25 }}>Clear search</Button>}</CardContent>{refreshing && <Box sx={{ height: 3, bgcolor: 'primary.main', opacity: .35 }} />}</Card>

    <Grid container spacing={2}>
      <Grid item xs={12} lg={7}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Box><Typography variant="h6" fontWeight={800}>Station summary</Typography><Typography variant="body2" color="text.secondary">Current station status and charging contribution.</Typography></Box><Chip size="small" label={`${stations.length} station${stations.length === 1 ? '' : 's'}`} /></Stack><Stack spacing={1.1} sx={{ mt: 2 }}>{stationSummary.map(station => <Paper key={station.chargePointId} variant="outlined" sx={{ p: 1.35, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}><EvStationRounded color="primary" /><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={750} noWrap>{station.name || station.chargePointId}</Typography><Typography variant="caption" color="text.secondary">{station.chargePointId} · {station.sessions} sessions · {energy(station.energyWh)}</Typography></Box><Chip size="small" label={station.isOnline ? station.status : 'Offline'} color={station.isOnline ? statusColor(station.status) : 'default'} /><Typography variant="body2" fontWeight={750}>{money(station.amount)}</Typography></Stack></Paper>)}{!stationSummary.length && <Typography color="text.secondary" sx={{ py: 3 }}>No stations are assigned to this location.</Typography>}</Stack></CardContent></Card></Grid>
      <Grid item xs={12} lg={5}><Card variant="outlined" sx={{ height: '100%' }}><CardContent><Typography variant="h6" fontWeight={800}>Daily activity</Typography><Typography variant="body2" color="text.secondary">Energy and charging sessions in the selected range.</Typography><Stack spacing={1.1} sx={{ mt: 2 }}>{daily.slice(-12).map(item => <Box key={item.date}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography variant="caption" color="text.secondary">{item.date}</Typography><Typography variant="caption" fontWeight={750}>{energy(item.energyWh)} · {item.sessions} sessions</Typography></Stack><Box sx={{ height: 7, borderRadius: 99, bgcolor: 'action.hover', mt: .5, overflow: 'hidden' }}><Box sx={{ width: `${Math.min(100, (Number(item.energyWh) / maxDailyEnergy) * 100)}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 99 }} /></Box></Box>)}{!daily.length && <Typography color="text.secondary" sx={{ py: 3 }}>No activity in this range.</Typography>}</Stack></CardContent></Card></Grid>
    </Grid>

    <Card variant="outlined"><CardContent sx={{ p: 0 }}><Box sx={{ p: { xs: 1.5, md: 2 } }}><Typography variant="h6" fontWeight={800}>Charging sessions</Typography><Typography variant="body2" color="text.secondary">A complete record of charging activity at this location.</Typography></Box><Divider /><TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 980 }}><TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station</TableCell><TableCell>Status</TableCell><TableCell>Started</TableCell><TableCell>Stopped</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">View</TableCell></TableRow></TableHead><TableBody>{transactions.map(row => <TableRow key={row.id} hover><TableCell><Typography fontWeight={750}>#{row.transactionId}</Typography><Typography variant="caption" color="text.secondary">{row.idTag || 'Customer tag unavailable'}</Typography></TableCell><TableCell>{row.station?.name || row.chargePointId}<Typography variant="caption" display="block" color="text.secondary">Connector {row.connectorId}</Typography></TableCell><TableCell><Chip size="small" label={row.status === 'InProgress' ? 'Charging now' : row.status} color={statusColor(row.status)} /></TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.startTime)}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.stopTime)}</TableCell><TableCell align="right">{energy(row.energyDelivered)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(row.amount)}</TableCell><TableCell align="right"><Tooltip title="Open session details"><IconButton size="small" onClick={() => navigate(`/transactions/${row.transactionId}`)}><VisibilityRounded fontSize="small" /></IconButton></Tooltip></TableCell></TableRow>)}{!transactions.length && <TableRow><TableCell colSpan={8}><Box sx={{ py: 6, textAlign: 'center' }}><HistoryRounded sx={{ fontSize: 42, color: 'text.disabled' }} /><Typography fontWeight={750}>No charging sessions found</Typography><Typography variant="body2" color="text.secondary">Try a wider date range or clear the search.</Typography></Box></TableCell></TableRow>}</TableBody></Table></TableContainer><Divider /><ActivityPager label="sessions" pagination={pagination} rowsPerPage={filters.limit} onPageChange={page => updateFilter({ page })} onRowsPerPageChange={event => updateFilter({ limit: Number(event.target.value), page: 1 })} /></CardContent></Card>

    <Card variant="outlined"><CardContent sx={{ p: 0 }}><Box sx={{ p: { xs: 1.5, md: 2 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="h6" fontWeight={800}>Station communications</Typography><Typography variant="body2" color="text.secondary">Recent messages exchanged with chargers at this location.</Typography></Box><Chip size="small" label={`${eventPagination.total || 0} messages`} /></Stack></Box><Divider /><TableContainer sx={{ maxHeight: 420, overflow: 'auto' }}><Table stickyHeader size="small" sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>Time</TableCell><TableCell>Station</TableCell><TableCell>Message</TableCell><TableCell>Direction</TableCell><TableCell>Status</TableCell><TableCell>Details</TableCell></TableRow></TableHead><TableBody>{events.map(event => <TableRow key={event.id} hover><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTime(event.timestamp || event.createdAt)}</TableCell><TableCell>{event.chargePointId}</TableCell><TableCell>{event.message_type}</TableCell><TableCell><Chip size="small" variant="outlined" label={event.direction} /></TableCell><TableCell><Chip size="small" label={event.status} color={statusColor(event.status)} /></TableCell><TableCell>{event.errorCode || event.errorDescription || 'No error reported'}</TableCell></TableRow>)}{!events.length && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>No station messages found in this range.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer><Divider /><ActivityPager label="station messages" pagination={eventPagination} rowsPerPage={filters.eventLimit} onPageChange={page => updateFilter({ eventPage: page }, false)} onRowsPerPageChange={event => updateFilter({ eventLimit: Number(event.target.value), eventPage: 1 }, false)} /></CardContent></Card>
  </Stack>;
}
