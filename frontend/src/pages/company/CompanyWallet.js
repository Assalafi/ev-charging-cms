import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton,
  InputAdornment, InputLabel, LinearProgress, MenuItem, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccountBalanceWalletRounded, AddRounded, ArrowDownwardRounded, ArrowUpwardRounded,
  CalendarMonthRounded, CloseRounded, DownloadRounded, FilterAltRounded,
  PaymentsRounded, ReceiptLongRounded, RefreshRounded, SearchRounded,
  TrendingDownRounded, TrendingUpRounded
} from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';
import { useCompanyAuth } from '../../contexts/CompanyAuthContext';
import { BillingPolicyCard, money } from './CompanyDashboard';
import { formatDate, formatDateTime } from '../../utils/timezone';

const EMPTY_FILTERS = { from: '', to: '', type: 'ALL', status: 'ALL', method: 'ALL', search: '' };
const METHOD_OPTIONS = ['paystack', 'offline', 'company_transfer', 'auto_funding', 'company_recovery', 'user_recovery', 'internal'];
const statusColor = status => ({ SUCCESS: 'success', PENDING: 'warning', FAILED: 'error', REVERSED: 'default' }[status] || 'default');
const number = value => Number(value || 0).toLocaleString('en-NG');
const signedMoney = (type, amount) => `${type === 'CREDIT' ? '+' : '-'}${money(amount)}`;

const cleanParams = (filters, page, limit) => {
  const params = { page: page + 1, limit };
  Object.entries(filters).forEach(([key, value]) => { if (value && value !== 'ALL') params[key] = value; });
  return params;
};

function SummaryTile({ label, value, helper, icon, tone = 'primary' }) {
  const color = tone === 'success' ? '#039855' : tone === 'error' ? '#D92D20' : '#2563EB';
  return <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, borderColor: alpha(color, .18), background: `linear-gradient(145deg, ${alpha(color, .06)}, #fff)` }}>
    <CardContent sx={{ p: { xs: 1.8, sm: 2.2 }, '&:last-child': { pb: { xs: 1.8, sm: 2.2 } } }}>
      <Stack direction="row" justifyContent="space-between" spacing={1}><Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label.toUpperCase()}</Typography><Typography variant="h6" fontWeight={900} sx={{ mt: .6, overflowWrap: 'anywhere' }}>{value}</Typography><Typography variant="caption" color="text.secondary">{helper}</Typography></Box><Box sx={{ width: 38, height: 38, borderRadius: 2, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(color, .12), color }}>{icon}</Box></Stack>
    </CardContent>
  </Card>;
}

export default function CompanyWallet() {
  const { canManage, user } = useCompanyAuth();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 0 });
  const [report, setReport] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = cleanParams(appliedFilters, page, rowsPerPage);
    try {
      setError(''); setReportLoading(true);
      const [walletResponse, transactionResponse, reportResponse] = await Promise.all([
        companyPortalService.wallet(), companyPortalService.transactions(params), companyPortalService.walletReport(appliedFilters)
      ]);
      setWallet(walletResponse.data.wallet);
      setTransactions(transactionResponse.data.transactions || []);
      setPagination(transactionResponse.data.pagination || { page: 1, limit: rowsPerPage, total: 0, pages: 0 });
      setReport(reportResponse.data.report || null);
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Unable to load wallet activity');
    } finally { setLoading(false); setReportLoading(false); }
  }, [appliedFilters, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (!reference) return undefined;
    companyPortalService.verifyFunding(reference).then(load).catch(requestError => setError(requestError.serverMessage || requestError.message || 'Unable to verify funding')).finally(() => window.history.replaceState({}, '', window.location.pathname));
    return undefined;
  }, [load]);

  const fund = async () => {
    setSaving(true);
    try {
      const response = await companyPortalService.initializeFunding({ amount, email: user?.email, callbackUrl: `${window.location.origin}/company/wallet` });
      setOpen(false); setAmount(''); if (response.data.authorization_url) window.location.href = response.data.authorization_url;
    } catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Unable to initialize funding'); } finally { setSaving(false); }
  };

  const applyFilters = () => { setPage(0); setAppliedFilters({ ...filters }); };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setPage(0); };
  const updateFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  const exportCsv = () => {
    const rows = report?.transactions || []; if (!rows.length) return;
    const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Date (WAT)', 'Type', 'Amount', 'Currency', 'Status', 'Method', 'Reference', 'Description', 'Beneficiary'];
    const body = rows.map(item => [formatDateTime(item.createdAt), item.type, item.amount, item.currency || 'NGN', item.status, item.method, item.reference, item.description || '', item.beneficiary?.name || ''].map(escape).join(','));
    const blob = new Blob([[header.map(escape).join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `company-wallet-report-${appliedFilters.from || 'all'}-${appliedFilters.to || 'today'}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const reportDays = useMemo(() => (report?.daily || []).slice(-14), [report]);
  if (loading && !wallet) return <Box minHeight="60vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
  const company = user?.company || {};
  const summary = report?.summary || {};
  const balance = Number(wallet?.balance || 0);

  return <Stack spacing={{ xs: 2, md: 3 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2}><Box><Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".12em">Finance control</Typography><Typography variant="h3" sx={{ mt: .5, fontSize: { xs: '2rem', sm: '2.5rem' } }}>Company wallet</Typography><Typography color="text.secondary">Track every credit, debit, gateway payment and employee allowance in West Africa Time.</Typography></Box><Stack direction="row" gap={1} flexWrap="wrap">{canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Add funds</Button>}<Button variant="outlined" startIcon={<RefreshRounded />} onClick={load} disabled={loading}>Refresh</Button></Stack></Stack>
    {error && <Alert severity="error" action={<IconButton size="small" onClick={() => setError('')}><CloseRounded fontSize="small" /></IconButton>}>{error}</Alert>}
    <Grid container spacing={2}><Grid item xs={12} md={5}><Card sx={{ height: '100%', color: '#fff', borderRadius: 3.5, background: Number(wallet?.debtOutstanding || 0) > 0 ? 'linear-gradient(140deg, #92400E, #D97706)' : 'linear-gradient(140deg, #0F2E61, #2563EB)' }}><CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}><Stack direction="row" justifyContent="space-between"><Box><Typography sx={{ color: 'rgba(255,255,255,.72)' }}>Current balance</Typography><Typography variant="h2" sx={{ color: '#fff', mt: 1, fontSize: { xs: '2.25rem', sm: '3rem' } }}>{money(balance)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)' }}>{wallet?.currency || 'NGN'} · {Number(wallet?.debtOutstanding || 0) > 0 ? `${money(wallet.debtOutstanding)} debt outstanding` : 'Ready for transfers'}</Typography></Box><AccountBalanceWalletRounded sx={{ fontSize: 40, opacity: .8 }} /></Stack></CardContent></Card></Grid><Grid item xs={12} md={7}><Card sx={{ height: '100%', borderRadius: 3.5 }}><CardContent><Typography variant="h6" fontWeight={850}>How funding works</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Credits add money to the company wallet. Debits cover employee transfers, recoveries or automated allowances. Gateway payments remain pending until verified.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}><Chip icon={<ArrowUpwardRounded />} label="Credits increase balance" color="success" variant="outlined" /><Chip icon={<ArrowDownwardRounded />} label="Debits reduce balance" color="warning" variant="outlined" /></Stack></CardContent></Card></Grid></Grid>
    <BillingPolicyCard company={company} walletBalance={balance} />
    <Card sx={{ borderRadius: 3.5, overflow: 'hidden' }}><CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} gap={1.5}><Box><Stack direction="row" spacing={1} alignItems="center"><FilterAltRounded color="primary" /><Typography variant="h6" fontWeight={850}>Wallet filters</Typography></Stack><Typography variant="body2" color="text.secondary">Search the complete ledger by WAT date range, direction, status, method or driver.</Typography></Box><Button size="small" onClick={() => setFiltersOpen(value => !value)}>{filtersOpen ? 'Hide filters' : 'Show filters'}</Button></Stack><Collapse in={filtersOpen}><Grid container spacing={1.5} sx={{ mt: .5 }}><Grid item xs={12} md={4}><TextField fullWidth size="small" label="Search ledger" placeholder="Reference, description, driver or email" value={filters.search} onChange={event => updateFilter('search', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" type="date" label="From date (WAT)" value={filters.from} onChange={event => updateFilter('from', event.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={2}><TextField fullWidth size="small" type="date" label="To date (WAT)" value={filters.to} onChange={event => updateFilter('to', event.target.value)} InputLabelProps={{ shrink: true }} /></Grid><Grid item xs={6} md={1.3}><FormControl fullWidth size="small"><InputLabel>Type</InputLabel><Select label="Type" value={filters.type} onChange={event => updateFilter('type', event.target.value)}><MenuItem value="ALL">All</MenuItem><MenuItem value="CREDIT">Credit</MenuItem><MenuItem value="DEBIT">Debit</MenuItem></Select></FormControl></Grid><Grid item xs={6} md={1.5}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select label="Status" value={filters.status} onChange={event => updateFilter('status', event.target.value)}><MenuItem value="ALL">All</MenuItem><MenuItem value="SUCCESS">Success</MenuItem><MenuItem value="PENDING">Pending</MenuItem><MenuItem value="FAILED">Failed</MenuItem><MenuItem value="REVERSED">Reversed</MenuItem></Select></FormControl></Grid><Grid item xs={12} md={1.7}><FormControl fullWidth size="small"><InputLabel>Method</InputLabel><Select label="Method" value={filters.method} onChange={event => updateFilter('method', event.target.value)}><MenuItem value="ALL">All methods</MenuItem>{METHOD_OPTIONS.map(method => <MenuItem key={method} value={method}>{method.replace(/_/g, ' ')}</MenuItem>)}</Select></FormControl></Grid><Grid item xs={12}><Stack direction="row" spacing={1} justifyContent="flex-end"><Button size="small" onClick={clearFilters}>Clear</Button><Button variant="contained" size="small" onClick={applyFilters} startIcon={<FilterAltRounded />}>Apply filters</Button></Stack></Grid></Grid></Collapse></CardContent></Card>
    <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5} sx={{ mb: 1.5 }}><Box><Typography variant="h6" fontWeight={850}>Filtered report</Typography><Typography variant="body2" color="text.secondary">{report?.filters?.from || report?.filters?.to ? `${report?.filters?.from || 'Beginning'} → ${report?.filters?.to || 'Today'}` : 'All available wallet history'} · {number(summary.count)} matching records</Typography></Box><Tooltip title="Download the filtered ledger as CSV"><Button variant="outlined" startIcon={<DownloadRounded />} onClick={exportCsv} disabled={!report?.transactions?.length}>Export CSV</Button></Tooltip></Stack>{reportLoading && <LinearProgress sx={{ mb: 1 }} />}<Grid container spacing={1.5}><Grid item xs={6} md={3}><SummaryTile label="Credits" value={money(summary.credits)} helper={`${number(summary.creditCount)} entries`} icon={<TrendingUpRounded />} tone="success" /></Grid><Grid item xs={6} md={3}><SummaryTile label="Debits" value={money(summary.debits)} helper={`${number(summary.debitCount)} entries`} icon={<TrendingDownRounded />} tone="error" /></Grid><Grid item xs={6} md={3}><SummaryTile label="Net movement" value={money(summary.net)} helper="Credits less debits" icon={<ReceiptLongRounded />} /></Grid><Grid item xs={6} md={3}><SummaryTile label="Current balance" value={money(report?.currentBalance ?? balance)} helper={Number(report?.debtOutstanding || 0) > 0 ? `${money(report.debtOutstanding)} debt` : 'Available balance'} icon={<AccountBalanceWalletRounded />} tone={Number(report?.debtOutstanding || 0) > 0 ? 'error' : 'primary'} /></Grid></Grid></Box>
    {reportDays.length > 0 && <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent sx={{ p: { xs: 1.5, sm: 2.5 } }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Box><Typography variant="h6" fontWeight={850}>Daily movement</Typography><Typography variant="body2" color="text.secondary">Latest activity days in the selected range.</Typography></Box><CalendarMonthRounded color="primary" /></Stack><TableContainer sx={{ overflowX: 'auto' }}><Table size="small" sx={{ minWidth: 620 }}><TableHead><TableRow><TableCell>Date</TableCell><TableCell align="right">Entries</TableCell><TableCell align="right">Credits</TableCell><TableCell align="right">Debits</TableCell><TableCell align="right">Net</TableCell></TableRow></TableHead><TableBody>{reportDays.map(day => <TableRow key={day.date}><TableCell>{formatDate(`${day.date}T00:00:00+01:00`)}</TableCell><TableCell align="right">{number(day.count)}</TableCell><TableCell align="right" sx={{ color: 'success.main', fontWeight: 750 }}>{money(day.credits)}</TableCell><TableCell align="right" sx={{ color: 'error.main', fontWeight: 750 }}>{money(day.debits)}</TableCell><TableCell align="right" sx={{ fontWeight: 850 }}>{money(day.net)}</TableCell></TableRow>)}</TableBody></Table></TableContainer></CardContent></Card>}
    <Card sx={{ borderRadius: 3.5, overflow: 'hidden' }}><CardContent sx={{ p: 0 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ p: { xs: 1.5, sm: 2.5 }, pb: 1.5 }}><Box><Typography variant="h6" fontWeight={850}>Wallet activity</Typography><Typography variant="body2" color="text.secondary">{number(pagination.total)} records match the active filters.</Typography></Box><Chip size="small" icon={<PaymentsRounded />} label={`${number(summary.successful)} successful · ${number(summary.pending)} pending`} variant="outlined" /></Stack><Divider /><TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 940 }}><TableHead><TableRow><TableCell>Date (WAT)</TableCell><TableCell>Direction</TableCell><TableCell>Description / beneficiary</TableCell><TableCell>Method / reference</TableCell><TableCell>Status</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{transactions.map(item => <TableRow hover key={item.id}><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(item.createdAt)}</TableCell><TableCell><Chip size="small" icon={item.type === 'CREDIT' ? <ArrowUpwardRounded /> : <ArrowDownwardRounded />} label={item.type === 'CREDIT' ? 'Credit' : 'Debit'} color={item.type === 'CREDIT' ? 'success' : 'warning'} variant="outlined" /></TableCell><TableCell><Typography fontWeight={750}>{item.description || 'Wallet transaction'}</Typography><Typography variant="caption" color="text.secondary">{item.beneficiary?.name ? `For ${item.beneficiary.name}` : item.beneficiary?.email || 'Company wallet'}</Typography></TableCell><TableCell><Typography variant="body2" fontWeight={650}>{item.method || '—'}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.reference}</Typography></TableCell><TableCell><Chip size="small" label={item.status} color={statusColor(item.status)} /></TableCell><TableCell align="right"><Typography fontWeight={850} color={item.type === 'CREDIT' ? 'success.main' : 'error.main'}>{signedMoney(item.type, item.amount)}</Typography></TableCell></TableRow>)}{!transactions.length && <TableRow><TableCell colSpan={6}><Box sx={{ py: 7, textAlign: 'center' }}><ReceiptLongRounded sx={{ fontSize: 42, color: 'text.disabled' }} /><Typography fontWeight={800} sx={{ mt: 1 }}>No matching wallet records</Typography><Typography variant="body2" color="text.secondary">Try widening the date range or clearing a filter.</Typography></Box></TableCell></TableRow>}</TableBody></Table></TableContainer><TablePagination component="div" count={pagination.total || 0} page={page} onPageChange={(_, nextPage) => setPage(nextPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[25, 50, 100]} labelRowsPerPage="Rows" /></CardContent></Card>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Add funds to company wallet</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>You’ll be redirected to the configured payment gateway to complete this top-up.</Typography><TextField fullWidth label="Amount (₦)" type="number" inputProps={{ min: 1, step: '0.01' }} value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={fund} disabled={saving || Number(amount) <= 0}>{saving ? <CircularProgress size={20} /> : 'Continue to payment'}</Button></DialogActions></Dialog>
  </Stack>;
}
