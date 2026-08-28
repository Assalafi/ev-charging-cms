import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  BoltRounded,
  CalendarMonthRounded,
  CheckCircleRounded,
  CloseRounded,
  EvStationRounded,
  FilterAltOffRounded,
  LocalOfferRounded,
  PaymentsRounded,
  ReceiptLongRounded,
  RefreshRounded,
  SearchRounded,
  TimelapseRounded,
  VisibilityRounded
} from '@mui/icons-material';
import { format, formatDistanceStrict } from 'date-fns';
import api from '../../services/api';
import PageHeader from '../../components/ui/PageHeader';
import MetricCard from '../../components/ui/MetricCard';

const defaultFilters = { stationId: '', status: '', idTag: '', startDate: '', endDate: '' };
const errorMessage = error => error?.response?.data?.message || error?.serverMessage || error?.message || 'Failed to load transactions';
const formatMoney = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value) || 0);
const energyKwh = transaction => Math.max(Number(transaction.energyDelivered) || 0, 0) / 1000;

function safeDate(value, pattern = 'd MMM yyyy, HH:mm') {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, pattern);
}

function duration(transaction, now) {
  if (!transaction.startTime) return '—';
  const start = new Date(transaction.startTime);
  const end = transaction.stopTime ? new Date(transaction.stopTime) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '—';
  return formatDistanceStrict(end, start, { roundingMethod: 'floor' });
}

function statusColor(status) {
  if (status === 'Completed') return 'success';
  if (status === 'InProgress') return 'primary';
  if (status === 'Stopped') return 'warning';
  return 'default';
}

function TransactionList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [transactions, setTransactions] = useState([]);
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.get('/stations').then(response => {
      const data = response.data;
      setStations(data?.stations || data?.data || (Array.isArray(data) ? data : []));
    }).catch(() => setStations([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
        sort: 'startTime',
        order: 'DESC',
        ...(appliedFilters.stationId && { chargePointId: appliedFilters.stationId }),
        ...(appliedFilters.status && { status: appliedFilters.status }),
        ...(appliedFilters.idTag.trim() && { idTag: appliedFilters.idTag.trim() }),
        ...(appliedFilters.startDate && { startDate: appliedFilters.startDate }),
        ...(appliedFilters.endDate && { endDate: appliedFilters.endDate })
      };
      const response = await api.get('/transactions', { params });
      setTransactions(response.data?.transactions || []);
      setTotalCount(Number(response.data?.count) || 0);
    } catch (requestError) {
      setTransactions([]);
      setTotalCount(0);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);

  const stationName = useCallback(transaction => {
    const station = stations.find(item => item.chargePointId === transaction.chargePointId);
    return station?.name || transaction.charging_station?.name || transaction.chargePointId || 'Unknown station';
  }, [stations]);

  const visibleTransactions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return transactions;
    return transactions.filter(transaction => [transaction.transactionId, transaction.idTag, transaction.chargePointId, stationName(transaction)].some(value => String(value || '').toLowerCase().includes(term)));
  }, [search, transactions, stationName]);

  const pageEnergy = useMemo(() => transactions.reduce((sum, transaction) => sum + energyKwh(transaction), 0), [transactions]);
  const pageValue = useMemo(() => transactions.reduce((sum, transaction) => sum + (Number(transaction.amount) || 0), 0), [transactions]);
  const activeCount = useMemo(() => transactions.filter(transaction => transaction.status === 'InProgress').length, [transactions]);

  const filterCount = Object.values(appliedFilters).filter(Boolean).length;
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(appliedFilters);
  const applyFilters = () => { setPage(0); setAppliedFilters(filters); };
  const clearFilters = () => { setFilters(defaultFilters); setAppliedFilters(defaultFilters); setPage(0); };

  const openTransaction = transaction => navigate(`/transactions/${transaction.transactionId || transaction.id}`);
  const openStation = (event, transaction) => {
    event.stopPropagation();
    if (transaction.chargePointId) navigate(`/stations/${transaction.chargePointId}`);
  };

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <PageHeader
        eyebrow="Charging activity"
        title="Transactions"
        description="Review charging sessions, live energy delivery, billing values and completion status."
        actions={<Button variant="outlined" startIcon={<RefreshRounded />} onClick={load} disabled={loading}>Refresh</Button>}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, md: 2 } }}>
        <MetricCard label="Matching sessions" value={totalCount.toLocaleString()} helper={`${transactions.length} loaded on this page`} icon={<ReceiptLongRounded />} color="primary" />
        <MetricCard label="Active on page" value={activeCount} helper="Sessions currently in progress" icon={<TimelapseRounded />} color="secondary" />
        <MetricCard label="Energy on page" value={`${pageEnergy.toFixed(2)} kWh`} helper="Delivered by loaded sessions" icon={<BoltRounded />} color="success" />
        <MetricCard label="Value on page" value={formatMoney(pageValue)} helper="Recorded session amounts" icon={<PaymentsRounded />} color="warning" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }} sx={{ p: { xs: 1.5, md: 2 } }}>
          <TextField
            size="small" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search loaded sessions, stations or ID tags" sx={{ flex: 1, minWidth: { md: 320 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>, endAdornment: search ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearch('')}><CloseRounded fontSize="small" /></IconButton></InputAdornment> : null }}
          />
          <Button variant={filtersOpen || filterCount ? 'contained' : 'outlined'} color={filterCount ? 'primary' : 'inherit'} startIcon={<CalendarMonthRounded />} onClick={() => setFiltersOpen(previous => !previous)}>{filterCount ? `Filters (${filterCount})` : 'Filters'}</Button>
          {filterCount > 0 && <Button color="inherit" startIcon={<FilterAltOffRounded />} onClick={clearFilters}>Clear</Button>}
        </Stack>

        {filtersOpen && <>
          <Divider />
          <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: 'action.hover' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: 'repeat(5, 1fr)' }, gap: 1.5 }}>
              <FormControl size="small"><InputLabel>Station</InputLabel><Select label="Station" value={filters.stationId} onChange={event => setFilters(previous => ({ ...previous, stationId: event.target.value }))}><MenuItem value="">All stations</MenuItem>{stations.map(station => <MenuItem key={station.chargePointId} value={station.chargePointId}>{station.name || station.chargePointId}</MenuItem>)}</Select></FormControl>
              <FormControl size="small"><InputLabel>Status</InputLabel><Select label="Status" value={filters.status} onChange={event => setFilters(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">All statuses</MenuItem><MenuItem value="InProgress">In progress</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="Stopped">Stopped</MenuItem></Select></FormControl>
              <TextField size="small" label="Exact ID tag" value={filters.idTag} onChange={event => setFilters(previous => ({ ...previous, idTag: event.target.value }))} />
              <TextField size="small" label="From date" type="date" value={filters.startDate} onChange={event => setFilters(previous => ({ ...previous, startDate: event.target.value }))} InputLabelProps={{ shrink: true }} inputProps={{ max: filters.endDate || undefined }} />
              <TextField size="small" label="To date" type="date" value={filters.endDate} onChange={event => setFilters(previous => ({ ...previous, endDate: event.target.value }))} InputLabelProps={{ shrink: true }} inputProps={{ min: filters.startDate || undefined }} />
            </Box>
            <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ mt: 1.5 }}><Button onClick={clearFilters}>Reset</Button><Button variant="contained" onClick={applyFilters} disabled={!filtersChanged}>Apply filters</Button></Stack>
          </Box>
        </>}
      </Paper>

      {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      <Paper variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><Stack alignItems="center" spacing={1.5}><CircularProgress size={30} /><Typography variant="body2" color="text.secondary">Loading transactions…</Typography></Stack></Box>
        ) : visibleTransactions.length === 0 ? (
          <Stack alignItems="center" spacing={1.25} sx={{ py: 8, px: 2, textAlign: 'center' }}>
            <ReceiptLongRounded sx={{ fontSize: 54, color: 'text.disabled' }} />
            <Typography variant="h6" fontWeight={750}>{search ? 'No loaded session matches your search' : 'No transactions match these filters'}</Typography>
            <Typography color="text.secondary">{search ? 'Try a different transaction ID, station or ID tag.' : 'Adjust the date, station or status filters and try again.'}</Typography>
            {(search || filterCount > 0) && <Button onClick={() => { setSearch(''); clearFilters(); }}>Clear filters</Button>}
          </Stack>
        ) : mobile ? (
          <Stack spacing={1.25} sx={{ p: 1.5 }}>
            {visibleTransactions.map(transaction => (
              <Paper key={transaction.id} variant="outlined" onClick={() => openTransaction(transaction)} sx={{ p: 2, borderRadius: 3, cursor: 'pointer', transition: 'border-color 180ms, transform 180ms', '&:active': { transform: 'scale(.995)' } }}>
                <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                  <Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: theme => alpha(theme.palette.primary.main, 0.1), color: 'primary.main', display: 'grid', placeItems: 'center', flexShrink: 0 }}><BoltRounded /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={780}>TX {transaction.transactionId || transaction.id}</Typography><Button variant="text" size="small" startIcon={<EvStationRounded />} onClick={event => openStation(event, transaction)} sx={{ px: 0, minWidth: 0, maxWidth: '100%', justifyContent: 'flex-start' }}><Typography variant="body2" noWrap>{stationName(transaction)}</Typography></Button></Box>
                  <Chip size="small" label={transaction.status || 'Unknown'} color={statusColor(transaction.status)} />
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 2 }}>
                  <Box><Typography variant="caption" color="text.secondary">Started</Typography><Typography variant="body2" fontWeight={680}>{safeDate(transaction.startTime, 'd MMM, HH:mm')}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Duration</Typography><Typography variant="body2" fontWeight={680}>{duration(transaction, now)}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Energy</Typography><Typography variant="body2" fontWeight={680}>{energyKwh(transaction).toFixed(2)} kWh</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Amount</Typography><Typography variant="body2" fontWeight={780} color="primary.main">{formatMoney(transaction.amount)}</Typography></Box>
                </Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.75, pt: 1.25, borderTop: '1px solid', borderColor: 'divider' }}><Chip size="small" variant="outlined" icon={<LocalOfferRounded />} label={transaction.idTag || 'No ID tag'} /><Button size="small" endIcon={<VisibilityRounded />}>Details</Button></Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <TableContainer>
            <Table>
              <TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station</TableCell><TableCell>Status</TableCell><TableCell>Started</TableCell><TableCell>Duration</TableCell><TableCell>ID tag</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">View</TableCell></TableRow></TableHead>
              <TableBody>{visibleTransactions.map(transaction => (
                <TableRow key={transaction.id} hover onClick={() => openTransaction(transaction)} sx={{ cursor: 'pointer' }}>
                  <TableCell><Typography variant="body2" fontWeight={750}>TX {transaction.transactionId || transaction.id}</Typography><Typography variant="caption" color="text.secondary">Connector {transaction.connectorId || '—'}</Typography></TableCell>
                  <TableCell><Button color="inherit" size="small" startIcon={<EvStationRounded color="primary" />} onClick={event => openStation(event, transaction)} sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 0 }}><Box sx={{ textAlign: 'left' }}><Typography variant="body2" fontWeight={680}>{stationName(transaction)}</Typography><Typography variant="caption" color="text.secondary">{transaction.chargePointId}</Typography></Box></Button></TableCell>
                  <TableCell><Chip size="small" label={transaction.status || 'Unknown'} color={statusColor(transaction.status)} icon={transaction.status === 'Completed' ? <CheckCircleRounded /> : undefined} /></TableCell>
                  <TableCell><Typography variant="body2">{safeDate(transaction.startTime)}</Typography><Typography variant="caption" color="text.secondary">{transaction.stopTime ? `Ended ${safeDate(transaction.stopTime, 'd MMM, HH:mm')}` : 'Still running'}</Typography></TableCell>
                  <TableCell>{duration(transaction, now)}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" label={transaction.idTag || '—'} /></TableCell>
                  <TableCell align="right"><Typography fontWeight={720}>{energyKwh(transaction).toFixed(2)} kWh</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={780}>{formatMoney(transaction.amount)}</Typography></TableCell>
                  <TableCell align="right"><Tooltip title="View transaction"><IconButton size="small" color="primary" onClick={event => { event.stopPropagation(); openTransaction(transaction); }}><VisibilityRounded fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </TableContainer>
        )}
        <Divider />
        <TablePagination
          component="div" count={totalCount} page={page} rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
        />
      </Paper>
    </Stack>
  );
}

export default TransactionList;
