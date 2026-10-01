import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid,
  InputAdornment, MenuItem, Pagination, Select, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import BoltIcon from '@mui/icons-material/Bolt';
import partnerService from '../../services/partnerService';
import { formatDate, formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

const EMPTY_FILTERS = { search: '', range: 'monthly', status: '', settlementStatus: '', locationId: '', chargePointId: '', startDate: '', endDate: '' };

export default function PartnerTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const stations = useMemo(() => {
    const all = locations.flatMap(location => (location.stations || []).map(station => ({ ...station, locationId: location.id, locationName: location.name })));
    return filters.locationId ? all.filter(station => String(station.locationId) === String(filters.locationId)) : all;
  }, [filters.locationId, locations]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const query = {
        page: pagination.page, limit: 25, range: applied.range,
        ...(applied.range === 'custom' ? { startDate: applied.startDate, endDate: applied.endDate } : {}),
        ...(applied.status && { status: applied.status }),
        ...(applied.settlementStatus && { settlementStatus: applied.settlementStatus }),
        ...(applied.locationId && { locationId: applied.locationId }),
        ...(applied.chargePointId && { chargePointId: applied.chargePointId })
      };
      const [transactionsResponse, locationsResponse] = await Promise.all([
        partnerService.getTransactions(query),
        locations.length ? Promise.resolve(null) : partnerService.getLocations()
      ]);
      setTransactions(transactionsResponse.data.transactions || []);
      setPagination(current => ({ ...current, ...transactionsResponse.data.pagination }));
      if (locationsResponse) setLocations(locationsResponse.data.locations || []);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [applied, pagination.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilter = (name, value) => setFilters(current => ({ ...current, [name]: value, ...(name === 'locationId' ? { chargePointId: '' } : {}) }));
  const applyFilters = () => { setPagination(current => ({ ...current, page: 1 })); setApplied(filters); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setPagination(current => ({ ...current, page: 1 })); setApplied(EMPTY_FILTERS); };
  const visibleTransactions = useMemo(() => {
    const query = applied.search.trim().toLowerCase();
    return transactions.filter(transaction => !query || [transaction.transactionId, transaction.chargePointId, transaction.station?.name, transaction.location?.name].filter(Boolean).join(' ').toLowerCase().includes(query));
  }, [applied.search, transactions]);
  const currentEnergy = visibleTransactions.reduce((total, transaction) => total + (Number(transaction.energyDelivered) || 0), 0);
  const currentEarnings = visibleTransactions.reduce((total, transaction) => total + (Number(transaction.partnerEarning) || 0), 0);

  return (
    <Box>
      <PageHeader eyebrow="Charging activity" title="Transactions" description={`${pagination.total.toLocaleString()} sessions contributing to your partner earnings.`} live actions={[<Button key="refresh" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>]} />
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={load}>Retry</Button>}>{error}</Alert>}
      <Grid container spacing={2} mb={3}>
        {[['Loaded sessions', visibleTransactions.length, <BoltIcon color="primary" />], ['Loaded energy', formatEnergy(currentEnergy), <BoltIcon color="info" />], ['Loaded earnings', formatNaira(currentEarnings), <BoltIcon color="success" />], ['Total matching', pagination.total.toLocaleString(), <BoltIcon color="secondary" />]].map(([label, value, icon]) => <Grid item xs={6} md={3} key={label}><Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}><CardContent><Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ mt: .5 }}>{value}</Typography></Box>{icon}</Stack></CardContent></Card></Grid>)}
      </Grid>
      <Card sx={{ mb: 2.5, border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} md={4}><TextField size="small" fullWidth placeholder="Search transaction, station or location" value={filters.search} onChange={event => updateFilter('search', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} /></Grid>
          <Grid item xs={6} md={2}><Select size="small" fullWidth value={filters.range} onChange={event => updateFilter('range', event.target.value)}><MenuItem value="daily">Today</MenuItem><MenuItem value="weekly">This week</MenuItem><MenuItem value="monthly">This month</MenuItem><MenuItem value="yearly">This year</MenuItem><MenuItem value="custom">Custom</MenuItem></Select></Grid>
          <Grid item xs={6} md={2}><Select size="small" fullWidth displayEmpty value={filters.status} onChange={event => updateFilter('status', event.target.value)}><MenuItem value="">All statuses</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="InProgress">In progress</MenuItem><MenuItem value="Stopped">Stopped</MenuItem></Select></Grid>
          <Grid item xs={6} md={2}><Select size="small" fullWidth displayEmpty value={filters.settlementStatus} onChange={event => updateFilter('settlementStatus', event.target.value)}><MenuItem value="">All settlement states</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="included">Included</MenuItem><MenuItem value="paid">Paid</MenuItem></Select></Grid>
          <Grid item xs={6} md={2}><Select size="small" fullWidth displayEmpty value={filters.locationId} onChange={event => updateFilter('locationId', event.target.value)}><MenuItem value="">All locations</MenuItem>{locations.map(location => <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}</Select></Grid>
          {filters.range === 'custom' && <><Grid item xs={6} md={2}><TextField size="small" fullWidth type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.startDate} onChange={event => updateFilter('startDate', event.target.value)} /></Grid><Grid item xs={6} md={2}><TextField size="small" fullWidth type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.endDate} onChange={event => updateFilter('endDate', event.target.value)} /></Grid></>}
          <Grid item xs={12} md="auto"><Stack direction="row" spacing={1}><Button variant="contained" onClick={applyFilters} disabled={filters.range === 'custom' && (!filters.startDate || !filters.endDate)}>Apply</Button><Button onClick={clearFilters}>Reset</Button><Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => partnerService.exportTransactions({ range: applied.range, ...(applied.status && { status: applied.status }), ...(applied.settlementStatus && { settlementStatus: applied.settlementStatus }), ...(applied.locationId && { locationId: applied.locationId }), ...(applied.chargePointId && { chargePointId: applied.chargePointId }) })}>CSV</Button></Stack></Grid>
        </Grid>
        {filters.locationId && <Box mt={1.5} maxWidth={260}><Select size="small" fullWidth displayEmpty value={filters.chargePointId} onChange={event => updateFilter('chargePointId', event.target.value)}><MenuItem value="">All stations at location</MenuItem>{stations.map(station => <MenuItem key={station.chargePointId} value={station.chargePointId}>{station.name || station.chargePointId}</MenuItem>)}</Select></Box>}
      </CardContent></Card>
      <Card sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>{loading ? <Box textAlign="center" py={8}><CircularProgress /></Box> : <TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 900 }}><TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station / location</TableCell><TableCell>Date</TableCell><TableCell>Status</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Your earning</TableCell><TableCell>Settlement</TableCell></TableRow></TableHead><TableBody>{visibleTransactions.map(transaction => <TableRow key={transaction.id || transaction.transactionId} hover><TableCell><Typography fontWeight={700}>#{transaction.transactionId}</Typography><Typography variant="caption" color="text.secondary">Connector {transaction.connectorId || '-'}</Typography></TableCell><TableCell><Typography variant="body2">{transaction.station?.name || transaction.chargePointId}</Typography><Typography variant="caption" color="text.secondary">{transaction.location?.name || '-'}</Typography></TableCell><TableCell>{formatDate(transaction.stopTime || transaction.startTime)}</TableCell><TableCell><Chip size="small" label={transaction.status} color={statusColor(transaction.status)} /></TableCell><TableCell align="right">{formatEnergy(transaction.energyDelivered)}</TableCell><TableCell align="right"><Typography fontWeight={700} color="success.dark">{formatNaira(transaction.partnerEarning)}</Typography></TableCell><TableCell><Chip size="small" variant="outlined" label={transaction.settlementStatus || '-'} color={statusColor(transaction.settlementStatus)} /></TableCell></TableRow>)}{!visibleTransactions.length && <TableRow><TableCell colSpan={7} align="center"><Box py={6}><Typography color="text.secondary">No transactions match the selected filters.</Typography></Box></TableCell></TableRow>}</TableBody></Table></TableContainer>}</Card>
      {pagination.pages > 1 && <Stack alignItems="center" mt={3}><Pagination page={pagination.page} count={pagination.pages} onChange={(_, page) => setPagination(current => ({ ...current, page }))} /></Stack>}
    </Box>
  );
}
