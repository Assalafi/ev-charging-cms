import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AddRounded,
  AssessmentRounded,
  AccountBalanceWalletRounded,
  AutorenewRounded,
  CheckCircleRounded,
  CreditCardRounded,
  FilterAltRounded,
  HistoryRounded,
  ManageSearchRounded,
  PaymentsRounded,
  PersonSearchRounded,
  RefreshRounded,
  SearchRounded,
  SettingsRounded,
  TrendingDownRounded,
  TrendingUpRounded,
  VerifiedRounded,
  WarningAmberRounded,
  WalletRounded
} from '@mui/icons-material';
import api from '../services/api';
import { formatDateTime } from '../utils/timezone';

const emptyTransactionFilters = {
  search: '', status: '', type: '', gateway: '', userId: '', startDate: '', endDate: ''
};
const emptyWalletFilters = { userId: '', status: '', balanceBand: '' };
const emptyStatsFilters = {
  period: '30', startDate: '', endDate: '', status: '', type: '', gateway: '', userId: ''
};

const currency = value => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', maximumFractionDigits: 2
}).format(Number(value) || 0);

const number = value => new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(Number(value) || 0);

const statusColor = status => ({
  SUCCESS: 'success', FAILED: 'error', PENDING: 'warning', REVERSED: 'default'
}[String(status || '').toUpperCase()] || 'default');

const initials = value => String(value || 'U').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

function TabPanel({ children, value, index }) {
  return (
    <Box role="tabpanel" hidden={value !== index} id={`payment-panel-${index}`} aria-labelledby={`payment-tab-${index}`}>
      {value === index && children}
    </Box>
  );
}

function Metric({ label, value, caption, icon, color = '#2563EB', dark = false }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3, border: dark ? 'none' : '1px solid', borderColor: 'divider', background: dark ? `linear-gradient(135deg, ${color}, #0F172A)` : '#fff', color: dark ? '#fff' : 'text.primary' }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: dark ? 'rgba(255,255,255,.72)' : 'text.secondary', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</Typography>
            <Typography variant="h5" sx={{ mt: .75, fontWeight: 850, letterSpacing: '-.03em', whiteSpace: 'nowrap' }}>{value}</Typography>
            {caption && <Typography variant="caption" sx={{ display: 'block', mt: .35, color: dark ? 'rgba(255,255,255,.7)' : 'text.secondary' }}>{caption}</Typography>}
          </Box>
          <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 2.25, display: 'grid', placeItems: 'center', bgcolor: dark ? 'rgba(255,255,255,.14)' : `${color}14`, color: dark ? '#fff' : color }}>{icon}</Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function SectionHeading({ icon, title, detail, action }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1.25} alignItems="center">
        <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}>{icon}</Box>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: '-.02em' }}>{title}</Typography>
          {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
        </Box>
      </Stack>
      {action}
    </Stack>
  );
}

function FilterShell({ children, onApply, onClear, loading, count }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, mb: 2.25, borderRadius: 3, bgcolor: 'grey.50' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.25} sx={{ mb: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center"><FilterAltRounded color="primary" fontSize="small" /><Typography variant="subtitle2" fontWeight={850}>Filter and explore</Typography>{count !== undefined && <Chip size="small" label={`${number(count)} matches`} />}</Stack>
        <Stack direction="row" spacing={1}><Button size="small" onClick={onClear}>Reset</Button><Button size="small" variant="contained" onClick={onApply} disabled={loading} startIcon={loading ? <CircularProgress size={15} color="inherit" /> : <SearchRounded />}>Apply filters</Button></Stack>
      </Stack>
      {children}
    </Paper>
  );
}

function UserSearchSelect({ value, onChange, label = 'Find a user', size = 'small' }) {
  const [options, setOptions] = useState(value ? [value] : []);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  const loadUsers = useCallback(async query => {
    setLoading(true);
    try {
      const response = await api.get('/admin/payments/users', { params: { q: query || undefined, limit: 40 } });
      const users = response.data?.users || [];
      setOptions(previous => {
        const merged = [...previous, ...users];
        return merged.filter((user, index, list) => list.findIndex(item => item.id === user.id) === index);
      });
    } catch (error) {
      // The surrounding page already exposes actionable API errors. Keep the
      // select usable if an autocomplete request is briefly unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadUsers(inputValue), inputValue ? 250 : 0);
    return () => clearTimeout(timer);
  }, [inputValue, loadUsers]);

  return (
    <Autocomplete
      size={size}
      options={options}
      value={value || null}
      loading={loading}
      onOpen={() => loadUsers(inputValue)}
      onChange={(_, next) => onChange(next)}
      onInputChange={(_, next) => setInputValue(next)}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      getOptionLabel={user => user ? `${user.name || 'Unnamed user'} · ${user.email || user.tagId || user.phone || ''}` : ''}
      filterOptions={items => items}
      noOptionsText="No matching mobile users"
      renderOption={(props, user) => (
        <Box component="li" {...props} key={user.id}>
          <Avatar sx={{ width: 30, height: 30, mr: 1, bgcolor: 'primary.50', color: 'primary.main', fontSize: 12 }}>{initials(user.name)}</Avatar>
          <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={750} noWrap>{user.name || 'Unnamed user'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{user.email || 'No email'} · {user.tagId || user.phone || 'No tag ID'}</Typography></Box>
        </Box>
      )}
      renderInput={params => <TextField {...params} label={label} placeholder="Name, email or tag ID" InputProps={{ ...params.InputProps, startAdornment: <PersonSearchRounded fontSize="small" color="action" sx={{ mr: .75 }} />, endAdornment: <>{loading ? <CircularProgress size={16} /> : null}{params.InputProps.endAdornment}</> }} />}
    />
  );
}

function EmptyState({ title, detail, icon = <ManageSearchRounded fontSize="large" /> }) {
  return <Stack alignItems="center" spacing={1} sx={{ py: 7, color: 'text.secondary' }}>{icon}<Typography fontWeight={800}>{title}</Typography><Typography variant="body2" textAlign="center" maxWidth={420}>{detail}</Typography></Stack>;
}

function PaymentManagement() {
  const [tab, setTab] = useState(0);
  const [settings, setSettings] = useState({ paystack: { publicKey: '', secretKey: '', callbackUrl: '' }, wallet: { minFundingAmount: 100, maxFundingAmount: 100000, currency: 'NGN' }, features: { walletEnabled: true, autoVerifyPayments: true } });
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [transactionSummary, setTransactionSummary] = useState({});
  const [walletSummary, setWalletSummary] = useState({});
  const [stats, setStats] = useState({ transactions: {}, wallets: {}, period: '30 days' });
  const [transactionDraft, setTransactionDraft] = useState(emptyTransactionFilters);
  const [transactionFilters, setTransactionFilters] = useState(emptyTransactionFilters);
  const [walletDraft, setWalletDraft] = useState(emptyWalletFilters);
  const [walletFilters, setWalletFilters] = useState(emptyWalletFilters);
  const [statsDraft, setStatsDraft] = useState(emptyStatsFilters);
  const [statsFilters, setStatsFilters] = useState(emptyStatsFilters);
  const [transactionUser, setTransactionUser] = useState(null);
  const [walletUser, setWalletUser] = useState(null);
  const [statsUser, setStatsUser] = useState(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [walletPage, setWalletPage] = useState(1);
  const [transactionPages, setTransactionPages] = useState({ page: 1, pages: 1, total: 0, limit: 25 });
  const [walletPages, setWalletPages] = useState({ page: 1, pages: 1, total: 0, limit: 25 });
  const [loading, setLoading] = useState({ settings: false, transactions: false, wallets: false, stats: false });
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [verifying, setVerifying] = useState(null);
  const [fundDialog, setFundDialog] = useState({ open: false, wallet: null });
  const [fundAmount, setFundAmount] = useState('');
  const [fundDescription, setFundDescription] = useState('');
  const [fundConfirmText, setFundConfirmText] = useState('');
  const [fundLoading, setFundLoading] = useState(false);

  const notify = useCallback((type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(previous => previous.text === text ? { type: '', text: '' } : previous), 5000);
  }, []);

  const fetchSettings = useCallback(async () => {
    setLoading(previous => ({ ...previous, settings: true }));
    try {
      const response = await api.get('/admin/payments/settings');
      if (response.data?.success) setSettings(response.data.settings);
    } catch (error) { notify('error', 'Could not load payment settings.'); }
    finally { setLoading(previous => ({ ...previous, settings: false })); }
  }, [notify]);

  const fetchTransactions = useCallback(async () => {
    setLoading(previous => ({ ...previous, transactions: true }));
    try {
      const response = await api.get('/admin/payments/transactions', { params: { page: transactionPage, limit: transactionPages.limit, ...transactionFilters } });
      if (response.data?.success) {
        setTransactions(response.data.transactions || []);
        setTransactionSummary(response.data.summary || {});
        setTransactionPages(previous => ({ ...previous, ...(response.data.pagination || {}) }));
      }
    } catch (error) { notify('error', error.response?.data?.message || 'Could not load payment transactions.'); }
    finally { setLoading(previous => ({ ...previous, transactions: false })); }
  }, [notify, transactionFilters, transactionPage, transactionPages.limit]);

  const fetchWallets = useCallback(async () => {
    setLoading(previous => ({ ...previous, wallets: true }));
    try {
      const response = await api.get('/admin/payments/wallets', { params: { page: walletPage, limit: walletPages.limit, ...walletFilters } });
      if (response.data?.success) {
        setWallets(response.data.wallets || []);
        setWalletSummary(response.data.summary || {});
        setWalletPages(previous => ({ ...previous, ...(response.data.pagination || {}) }));
      }
    } catch (error) { notify('error', error.response?.data?.message || 'Could not load wallets.'); }
    finally { setLoading(previous => ({ ...previous, wallets: false })); }
  }, [notify, walletFilters, walletPage, walletPages.limit]);

  const fetchStats = useCallback(async () => {
    setLoading(previous => ({ ...previous, stats: true }));
    try {
      const response = await api.get('/admin/payments/stats', { params: statsFilters });
      if (response.data?.success) setStats(response.data.stats || {});
    } catch (error) { notify('error', error.response?.data?.message || 'Could not load payment analytics.'); }
    finally { setLoading(previous => ({ ...previous, stats: false })); }
  }, [notify, statsFilters]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchWallets(); }, [fetchWallets]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  const refreshAll = () => { fetchTransactions(); fetchWallets(); fetchStats(); if (tab === 3) fetchSettings(); };

  const applyTransactions = () => { setTransactionFilters({ ...transactionDraft }); setTransactionPage(1); };
  const clearTransactions = () => { setTransactionDraft(emptyTransactionFilters); setTransactionFilters(emptyTransactionFilters); setTransactionUser(null); setTransactionPage(1); };
  const applyWallets = () => { setWalletFilters({ ...walletDraft }); setWalletPage(1); };
  const clearWallets = () => { setWalletDraft(emptyWalletFilters); setWalletFilters(emptyWalletFilters); setWalletUser(null); setWalletPage(1); };
  const applyStats = () => { setStatsFilters({ ...statsDraft }); };
  const clearStats = () => { setStatsDraft(emptyStatsFilters); setStatsFilters(emptyStatsFilters); setStatsUser(null); };

  const verifyTransaction = async transactionId => {
    setVerifying(transactionId);
    try {
      const response = await api.post(`/admin/payments/verify/${transactionId}`);
      notify(response.data?.success ? 'success' : 'warning', response.data?.message || 'Payment verification completed.');
      fetchTransactions(); fetchStats(); fetchWallets();
    } catch (error) { notify('error', error.response?.data?.message || 'Payment verification failed.'); }
    finally { setVerifying(null); }
  };

  const openFund = wallet => { setFundDialog({ open: true, wallet }); setFundAmount(''); setFundDescription(''); setFundConfirmText(''); };
  const closeFund = () => { if (!fundLoading) setFundDialog({ open: false, wallet: null }); };
  const fundWallet = async () => {
    if (Number(fundAmount) <= 0 || fundConfirmText !== 'CONFIRM') return;
    setFundLoading(true);
    try {
      const response = await api.post(`/admin/payments/wallets/${fundDialog.wallet.id}/fund`, { amount: Number(fundAmount), description: fundDescription || undefined });
      if (response.data?.success) { notify('success', response.data.message || 'Wallet funded successfully.'); closeFund(); fetchWallets(); fetchTransactions(); fetchStats(); }
    } catch (error) { notify('error', error.response?.data?.message || 'Could not fund wallet.'); }
    finally { setFundLoading(false); }
  };

  const statsTransactions = stats.transactions || {};
  const topMetrics = useMemo(() => [
    { label: 'Successful volume', value: currency(transactionSummary.successfulVolume), caption: `${number(transactionSummary.successful)} successful payments`, icon: <CheckCircleRounded />, color: '#059669', dark: true },
    { label: 'Pending value', value: currency(transactionSummary.pendingVolume), caption: `${number(transactionSummary.pending)} awaiting resolution`, icon: <AutorenewRounded />, color: '#B45309' },
    { label: 'Wallet balance', value: currency(walletSummary.totalBalance), caption: `${number(walletSummary.totalWallets)} wallets in view`, icon: <WalletRounded />, color: '#2563EB' },
    { label: 'Needs attention', value: number((transactionSummary.failed || 0) + (transactionSummary.reversed || 0)), caption: `${number(transactionSummary.failed)} failed · ${number(transactionSummary.reversed)} reversed`, icon: <WarningAmberRounded />, color: '#DC2626' }
  ], [transactionSummary, walletSummary]);

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', pb: 4 }}>
      <Card sx={{ mb: 2.5, overflow: 'hidden', borderRadius: { xs: 3, md: 4 }, color: '#fff', background: 'radial-gradient(circle at 85% 0%, rgba(96,165,250,.5), transparent 35%), linear-gradient(120deg, #0F2E61 0%, #173F7A 55%, #1D4ED8 100%)' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 4 }, '&:last-child': { pb: { xs: 2.5, md: 4 } } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}><Chip size="small" icon={<CreditCardRounded />} label="Payment operations" sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.14)', '& .MuiChip-icon': { color: '#fff' } }} /><Chip size="small" label="WAT" sx={{ color: '#DBEAFE', bgcolor: 'rgba(255,255,255,.08)' }} /></Stack>
              <Typography variant="h3" sx={{ fontSize: { xs: '2rem', md: '3rem' }, fontWeight: 900, letterSpacing: '-.055em' }}>Payments, made clear.</Typography>
              <Typography sx={{ mt: 1, maxWidth: 700, color: 'rgba(255,255,255,.76)' }}>Track wallet movement, resolve gateway exceptions and keep every customer balance accountable from one responsive workspace.</Typography>
            </Box>
            <Stack direction={{ xs: 'row', md: 'column' }} spacing={1} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
              <Button onClick={refreshAll} variant="contained" startIcon={<RefreshRounded />} sx={{ bgcolor: '#fff', color: 'primary.dark', '&:hover': { bgcolor: '#EFF6FF' } }}>Refresh data</Button>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.6)', textAlign: { xs: 'left', md: 'right' } }}>Last loaded {formatDateTime(new Date())}</Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Collapse in={Boolean(notice.text)}><Alert severity={notice.type || 'info'} onClose={() => setNotice({ type: '', text: '' })} sx={{ mb: 2 }}>{notice.text}</Alert></Collapse>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>{topMetrics.map(metric => <Grid item xs={12} sm={6} lg={3} key={metric.label}><Metric {...metric} /></Grid>)}</Grid>

      <Card sx={{ borderRadius: 3.5, border: '1px solid', borderColor: 'divider', boxShadow: '0 10px 35px rgba(15,46,97,.06)' }}>
        <Tabs value={tab} onChange={(_, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile sx={{ px: { xs: 1, md: 2 }, borderBottom: '1px solid', borderColor: 'divider', '& .MuiTab-root': { minHeight: 70, fontWeight: 800 } }}>
          <Tab icon={<HistoryRounded />} iconPosition="start" label={`Transactions${transactionPages.total ? ` · ${number(transactionPages.total)}` : ''}`} />
          <Tab icon={<AccountBalanceWalletRounded />} iconPosition="start" label={`Wallets${walletPages.total ? ` · ${number(walletPages.total)}` : ''}`} />
          <Tab icon={<AssessmentRounded />} iconPosition="start" label="Analytics" />
          <Tab icon={<SettingsRounded />} iconPosition="start" label="Gateway settings" />
        </Tabs>

        <Box sx={{ p: { xs: 1.5, md: 3 } }}>
          <TabPanel value={tab} index={0}>
            <SectionHeading icon={<HistoryRounded />} title="Payment ledger" detail="Search gateway references, customer identity and wallet movement." action={<Tooltip title="Refresh transactions"><IconButton onClick={fetchTransactions} disabled={loading.transactions}><RefreshRounded /></IconButton></Tooltip>} />
            <FilterShell onApply={applyTransactions} onClear={clearTransactions} loading={loading.transactions} count={transactionPages.total}>
              <Grid container spacing={1.5}>
                <Grid item xs={12} md={4}><TextField fullWidth size="small" label="Reference or description" placeholder="Search payment reference..." value={transactionDraft.search} onChange={event => setTransactionDraft(previous => ({ ...previous, search: event.target.value }))} InputProps={{ startAdornment: <SearchRounded fontSize="small" color="action" sx={{ mr: .75 }} /> }} /></Grid>
                <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select label="Status" value={transactionDraft.status} onChange={event => setTransactionDraft(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">All statuses</MenuItem><MenuItem value="SUCCESS">Successful</MenuItem><MenuItem value="PENDING">Pending</MenuItem><MenuItem value="FAILED">Failed</MenuItem><MenuItem value="REVERSED">Reversed</MenuItem></Select></FormControl></Grid>
                <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Movement</InputLabel><Select label="Movement" value={transactionDraft.type} onChange={event => setTransactionDraft(previous => ({ ...previous, type: event.target.value }))}><MenuItem value="">Credits + debits</MenuItem><MenuItem value="CREDIT">Credits</MenuItem><MenuItem value="DEBIT">Debits</MenuItem></Select></FormControl></Grid>
                <Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Gateway</InputLabel><Select label="Gateway" value={transactionDraft.gateway} onChange={event => setTransactionDraft(previous => ({ ...previous, gateway: event.target.value }))}><MenuItem value="">All gateways</MenuItem><MenuItem value="paystack">Paystack</MenuItem><MenuItem value="admin">Admin credit</MenuItem><MenuItem value="internal">Internal</MenuItem></Select></FormControl></Grid>
                <Grid item xs={12} sm={6} md={2}><UserSearchSelect value={transactionUser} onChange={user => { setTransactionUser(user); setTransactionDraft(previous => ({ ...previous, userId: user?.id || '' })); }} /></Grid>
                <Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={transactionDraft.startDate} onChange={event => setTransactionDraft(previous => ({ ...previous, startDate: event.target.value }))} /></Grid>
                <Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={transactionDraft.endDate} onChange={event => setTransactionDraft(previous => ({ ...previous, endDate: event.target.value }))} /></Grid>
              </Grid>
            </FilterShell>

            <Grid container spacing={1.25} sx={{ mb: 2 }}>{[
              ['Successful', currency(transactionSummary.successfulVolume), `${number(transactionSummary.successful)} records`, 'success'],
              ['Pending', currency(transactionSummary.pendingVolume), `${number(transactionSummary.pending)} records`, 'warning'],
              ['Credits', currency(transactionSummary.creditVolume), 'All statuses', 'primary'],
              ['Debits', currency(transactionSummary.debitVolume), 'All statuses', 'error']
            ].map(([label, value, caption, color]) => <Grid item xs={6} md={3} key={label}><Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography><Typography variant="h6" fontWeight={850} color={`${color}.main`}>{value}</Typography><Typography variant="caption" color="text.secondary">{caption}</Typography></Paper></Grid>)}</Grid>

            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}><Table sx={{ minWidth: 900 }}><TableHead sx={{ bgcolor: 'grey.50' }}><TableRow><TableCell>Customer</TableCell><TableCell>Movement</TableCell><TableCell>Amount</TableCell><TableCell>Status</TableCell><TableCell>Gateway / reference</TableCell><TableCell>Recorded</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>
              {loading.transactions ? Array.from({ length: 6 }).map((_, index) => <TableRow key={`loading-${index}`}>{Array.from({ length: 7 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>) : transactions.length === 0 ? <TableRow><TableCell colSpan={7}><EmptyState title="No payments match these filters" detail="Try a wider date range or clear one of the filters to see more ledger activity." /></TableCell></TableRow> : transactions.map(transaction => <TableRow hover key={transaction.id}>
                <TableCell><Stack direction="row" spacing={1.2} alignItems="center"><Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.50', color: 'primary.main', fontSize: 12 }}>{initials(transaction.user?.name)}</Avatar><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={800} noWrap>{transaction.user?.name || 'Unknown user'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{transaction.user?.email || transaction.user?.tagId || 'No identity attached'}</Typography></Box></Stack></TableCell>
                <TableCell><Chip size="small" icon={transaction.type === 'CREDIT' ? <TrendingUpRounded /> : <TrendingDownRounded />} label={transaction.type === 'CREDIT' ? 'Credit' : 'Debit'} color={transaction.type === 'CREDIT' ? 'success' : 'error'} variant="outlined" /></TableCell>
                <TableCell><Typography fontWeight={850}>{currency(transaction.amount)}</Typography><Typography variant="caption" color="text.secondary">{transaction.currency || 'NGN'}</Typography></TableCell>
                <TableCell><Chip size="small" label={transaction.status} color={statusColor(transaction.status)} /></TableCell>
                <TableCell><Typography variant="body2" fontWeight={700}>{transaction.gateway || '—'}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 220 }} noWrap>{transaction.reference || transaction.description || 'No reference'}</Typography></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(transaction.createdAt)}</TableCell>
                <TableCell align="right">{transaction.type === 'CREDIT' && ['PENDING', 'FAILED'].includes(transaction.status) && <Button size="small" variant="contained" startIcon={verifying === transaction.id ? <CircularProgress size={14} color="inherit" /> : <VerifiedRounded />} onClick={() => verifyTransaction(transaction.id)} disabled={verifying === transaction.id}>{verifying === transaction.id ? 'Checking' : 'Verify'}</Button>}</TableCell>
              </TableRow>)}
            </TableBody></Table></TableContainer>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mt: 2 }}><Typography variant="body2" color="text.secondary">Showing {transactionPages.total === 0 ? 0 : ((transactionPages.page - 1) * transactionPages.limit) + 1}–{Math.min(transactionPages.page * transactionPages.limit, transactionPages.total)} of {number(transactionPages.total)} payments</Typography><Stack direction="row" spacing={1} alignItems="center"><FormControl size="small"><Select value={transactionPages.limit} onChange={event => { setTransactionPages(previous => ({ ...previous, limit: Number(event.target.value) })); setTransactionPage(1); }}><MenuItem value={25}>25 / page</MenuItem><MenuItem value={50}>50 / page</MenuItem><MenuItem value={100}>100 / page</MenuItem></Select></FormControl><Pagination size="small" count={transactionPages.pages || 1} page={transactionPages.page || transactionPage} onChange={(_, pageNumber) => setTransactionPage(pageNumber)} color="primary" /></Stack></Stack>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <SectionHeading icon={<AccountBalanceWalletRounded />} title="Customer wallets" detail="See available balance, debt exposure and manual funding controls." action={<Tooltip title="Refresh wallets"><IconButton onClick={fetchWallets} disabled={loading.wallets}><RefreshRounded /></IconButton></Tooltip>} />
            <FilterShell onApply={applyWallets} onClear={clearWallets} loading={loading.wallets} count={walletPages.total}>
              <Grid container spacing={1.5}><Grid item xs={12} md={4}><UserSearchSelect value={walletUser} onChange={user => { setWalletUser(user); setWalletDraft(previous => ({ ...previous, userId: user?.id || '' })); }} label="Find a wallet owner" /></Grid><Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Wallet status</InputLabel><Select label="Wallet status" value={walletDraft.status} onChange={event => setWalletDraft(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">Active and inactive</MenuItem><MenuItem value="active">Active wallets</MenuItem><MenuItem value="inactive">Inactive wallets</MenuItem></Select></FormControl></Grid><Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Balance view</InputLabel><Select label="Balance view" value={walletDraft.balanceBand} onChange={event => setWalletDraft(previous => ({ ...previous, balanceBand: event.target.value }))}><MenuItem value="">All balances</MenuItem><MenuItem value="positive">In credit</MenuItem><MenuItem value="zero">Zero balance</MenuItem><MenuItem value="negative">Debt / negative</MenuItem></Select></FormControl></Grid></Grid>
            </FilterShell>
            <Grid container spacing={1.25} sx={{ mb: 2 }}>{[
              ['Total balance', currency(walletSummary.totalBalance), `${number(walletSummary.totalWallets)} wallets`, '#2563EB', <WalletRounded />],
              ['In credit', currency(walletSummary.positiveBalance), 'Available customer funds', '#059669', <TrendingUpRounded />],
              ['Debt exposure', currency(walletSummary.debtBalance), `${number(walletSummary.zeroBalance)} at zero`, '#DC2626', <TrendingDownRounded />],
              ['Average balance', currency(walletSummary.averageBalance), `${number(walletSummary.active)} active`, '#7C3AED', <AssessmentRounded />]
            ].map(([label, value, caption, color, icon]) => <Grid item xs={6} md={3} key={label}><Metric label={label} value={value} caption={caption} color={color} icon={icon} /></Grid>)}</Grid>
            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}><Table sx={{ minWidth: 820 }}><TableHead sx={{ bgcolor: 'grey.50' }}><TableRow><TableCell>Wallet owner</TableCell><TableCell>Balance</TableCell><TableCell>Wallet status</TableCell><TableCell>Created</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{loading.wallets ? Array.from({ length: 6 }).map((_, index) => <TableRow key={`wallet-loading-${index}`}>{Array.from({ length: 5 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>) : wallets.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState title="No wallets match these filters" detail="Choose another balance view or search for a different customer." icon={<WalletRounded fontSize="large" />} /></TableCell></TableRow> : wallets.map(wallet => <TableRow hover key={wallet.id}><TableCell><Stack direction="row" spacing={1.2} alignItems="center"><Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.50', color: 'secondary.main', fontSize: 12 }}>{initials(wallet.user?.name)}</Avatar><Box><Typography variant="body2" fontWeight={800}>{wallet.user?.name || 'Unknown user'}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{wallet.user?.email || 'No email'}</Typography><Typography variant="caption" color="text.secondary">Tag ID: {wallet.user?.tagId || 'Not linked'}</Typography></Box></Stack></TableCell><TableCell><Typography fontWeight={850} color={Number(wallet.balance) < 0 ? 'error.main' : Number(wallet.balance) > 0 ? 'success.main' : 'text.primary'}>{currency(wallet.balance)}</Typography><Typography variant="caption" color="text.secondary">{wallet.currency || 'NGN'}</Typography></TableCell><TableCell><Chip size="small" label={wallet.isActive ? 'Active' : 'Inactive'} color={wallet.isActive ? 'success' : 'default'} /></TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(wallet.createdAt, { dateStyle: 'medium', timeStyle: undefined })}</TableCell><TableCell align="right"><Button size="small" variant="outlined" color="success" startIcon={<AddRounded />} onClick={() => openFund(wallet)} disabled={!wallet.isActive}>Fund wallet</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mt: 2 }}><Typography variant="body2" color="text.secondary">Showing {walletPages.total === 0 ? 0 : ((walletPages.page - 1) * walletPages.limit) + 1}–{Math.min(walletPages.page * walletPages.limit, walletPages.total)} of {number(walletPages.total)} wallets</Typography><Stack direction="row" spacing={1} alignItems="center"><FormControl size="small"><Select value={walletPages.limit} onChange={event => { setWalletPages(previous => ({ ...previous, limit: Number(event.target.value) })); setWalletPage(1); }}><MenuItem value={25}>25 / page</MenuItem><MenuItem value={50}>50 / page</MenuItem><MenuItem value={100}>100 / page</MenuItem></Select></FormControl><Pagination size="small" count={walletPages.pages || 1} page={walletPages.page || walletPage} onChange={(_, pageNumber) => setWalletPage(pageNumber)} color="primary" /></Stack></Stack>
          </TabPanel>

          <TabPanel value={tab} index={2}>
            <SectionHeading icon={<AssessmentRounded />} title="Payment analytics" detail="Compare payment health and wallet exposure over a period or custom range." action={<Chip size="small" icon={<AutorenewRounded />} label={stats.period || '30 days'} color="primary" variant="outlined" />} />
            <FilterShell onApply={applyStats} onClear={clearStats} loading={loading.stats}>
              <Grid container spacing={1.5}><Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Window</InputLabel><Select label="Window" value={statsDraft.period} onChange={event => setStatsDraft(previous => ({ ...previous, period: event.target.value, startDate: '', endDate: '' }))}><MenuItem value="7">Last 7 days</MenuItem><MenuItem value="30">Last 30 days</MenuItem><MenuItem value="90">Last 90 days</MenuItem><MenuItem value="365">Last year</MenuItem></Select></FormControl></Grid><Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={statsDraft.startDate} onChange={event => setStatsDraft(previous => ({ ...previous, startDate: event.target.value }))} /></Grid><Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={statsDraft.endDate} onChange={event => setStatsDraft(previous => ({ ...previous, endDate: event.target.value }))} /></Grid><Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select label="Status" value={statsDraft.status} onChange={event => setStatsDraft(previous => ({ ...previous, status: event.target.value }))}><MenuItem value="">All statuses</MenuItem><MenuItem value="SUCCESS">Successful</MenuItem><MenuItem value="PENDING">Pending</MenuItem><MenuItem value="FAILED">Failed</MenuItem><MenuItem value="REVERSED">Reversed</MenuItem></Select></FormControl></Grid><Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Movement</InputLabel><Select label="Movement" value={statsDraft.type} onChange={event => setStatsDraft(previous => ({ ...previous, type: event.target.value }))}><MenuItem value="">Credits + debits</MenuItem><MenuItem value="CREDIT">Credits</MenuItem><MenuItem value="DEBIT">Debits</MenuItem></Select></FormControl></Grid><Grid item xs={12} sm={6} md={2}><FormControl fullWidth size="small"><InputLabel>Gateway</InputLabel><Select label="Gateway" value={statsDraft.gateway} onChange={event => setStatsDraft(previous => ({ ...previous, gateway: event.target.value }))}><MenuItem value="">All gateways</MenuItem><MenuItem value="paystack">Paystack</MenuItem><MenuItem value="admin">Admin credit</MenuItem><MenuItem value="internal">Internal</MenuItem></Select></FormControl></Grid><Grid item xs={12} sm={6} md={2}><UserSearchSelect value={statsUser} onChange={user => { setStatsUser(user); setStatsDraft(previous => ({ ...previous, userId: user?.id || '' })); }} label="Filter by user" /></Grid></Grid>
            </FilterShell>
            <Grid container spacing={1.5} sx={{ mb: 2.5 }}><Grid item xs={12} sm={6} md={3}><Metric label="Successful volume" value={currency(statsTransactions.successfulVolume)} caption={`${number(statsTransactions.successful)} successful`} color="#059669" icon={<CheckCircleRounded />} dark /></Grid><Grid item xs={12} sm={6} md={3}><Metric label="Gross activity" value={currency(statsTransactions.grossVolume)} caption={`${number(statsTransactions.total)} total records`} color="#2563EB" icon={<PaymentsRounded />} /></Grid><Grid item xs={12} sm={6} md={3}><Metric label="Success rate" value={`${number(statsTransactions.successRate)}%`} caption={`${number(statsTransactions.failed)} failed · ${number(statsTransactions.pending)} pending`} color="#7C3AED" icon={<TrendingUpRounded />} /></Grid><Grid item xs={12} sm={6} md={3}><Metric label="Wallets in scope" value={number(stats.wallets?.total)} caption={`${currency(stats.wallets?.totalBalance)} combined balance`} color="#B45309" icon={<WalletRounded />} /></Grid></Grid>
            <Grid container spacing={1.5}><Grid item xs={12} lg={7}><Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}><CardContent><Typography variant="h6" fontWeight={850}>Status distribution</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Count and value by payment outcome.</Typography>{[['Successful', statsTransactions.successful, statsTransactions.successfulVolume, 'success'], ['Pending', statsTransactions.pending, statsTransactions.pendingVolume, 'warning'], ['Failed', statsTransactions.failed, statsTransactions.failedVolume, 'error'], ['Reversed', statsTransactions.reversed, statsTransactions.reversedVolume, 'default']].map(([label, count, amount, color]) => <Box key={label} sx={{ mb: 2 }}><Stack direction="row" justifyContent="space-between" sx={{ mb: .6 }}><Typography variant="body2" fontWeight={750}>{label}</Typography><Typography variant="body2" fontWeight={800}>{number(count)} · {currency(amount)}</Typography></Stack><LinearProgress variant="determinate" value={statsTransactions.total ? (Number(count || 0) / Number(statsTransactions.total)) * 100 : 0} color={color === 'default' ? 'primary' : color} sx={{ height: 8, borderRadius: 99 }} /></Box>)}</CardContent></Card></Grid><Grid item xs={12} lg={5}><Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}><CardContent><Typography variant="h6" fontWeight={850}>Movement mix</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Credits and debits in the selected window.</Typography><Stack spacing={2}><Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'success.50' }}><Stack direction="row" justifyContent="space-between"><Stack direction="row" spacing={1} alignItems="center"><TrendingUpRounded color="success" /><Box><Typography fontWeight={800}>Credits</Typography><Typography variant="caption" color="text.secondary">Wallet funding received</Typography></Box></Stack><Typography fontWeight={900} color="success.main">{currency(statsTransactions.creditVolume)}</Typography></Stack></Paper><Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, bgcolor: 'error.50' }}><Stack direction="row" justifyContent="space-between"><Stack direction="row" spacing={1} alignItems="center"><TrendingDownRounded color="error" /><Box><Typography fontWeight={800}>Debits</Typography><Typography variant="caption" color="text.secondary">Wallet usage and deductions</Typography></Box></Stack><Typography fontWeight={900} color="error.main">{currency(statsTransactions.debitVolume)}</Typography></Stack></Paper></Stack></CardContent></Card></Grid></Grid>
          </TabPanel>

          <TabPanel value={tab} index={3}>
            <SectionHeading icon={<SettingsRounded />} title="Gateway and wallet settings" detail="Keep provider credentials, funding limits and wallet behaviour in one place." action={<Chip size="small" label="Secrets masked" icon={<VerifiedRounded />} color="success" variant="outlined" />} />
            <Alert severity="info" sx={{ mb: 2.5, borderRadius: 2.5 }}>Secret keys remain masked by the API. Saving an unchanged masked value will not overwrite the stored key.</Alert>
            <Grid container spacing={2}><Grid item xs={12} lg={7}><Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}><CardContent sx={{ p: { xs: 2, md: 3 } }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><CreditCardRounded color="primary" /><Box><Typography variant="h6" fontWeight={850}>Paystack connection</Typography><Typography variant="body2" color="text.secondary">Payment gateway credentials and return path.</Typography></Box></Stack><Grid container spacing={1.5}><Grid item xs={12} md={6}><TextField fullWidth label="Public key" value={settings.paystack?.publicKey || ''} onChange={event => setSettings(previous => ({ ...previous, paystack: { ...previous.paystack, publicKey: event.target.value } }))} /></Grid><Grid item xs={12} md={6}><TextField fullWidth label="Secret key" type="password" value={settings.paystack?.secretKey || ''} onChange={event => setSettings(previous => ({ ...previous, paystack: { ...previous.paystack, secretKey: event.target.value } }))} /></Grid><Grid item xs={12}><TextField fullWidth label="Callback URL" value={settings.paystack?.callbackUrl || ''} onChange={event => setSettings(previous => ({ ...previous, paystack: { ...previous.paystack, callbackUrl: event.target.value } }))} /></Grid></Grid></CardContent></Card></Grid><Grid item xs={12} lg={5}><Card variant="outlined" sx={{ borderRadius: 3, height: '100%' }}><CardContent sx={{ p: { xs: 2, md: 3 } }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><WalletRounded color="primary" /><Box><Typography variant="h6" fontWeight={850}>Wallet guardrails</Typography><Typography variant="body2" color="text.secondary">Control allowed customer funding values.</Typography></Box></Stack><Stack spacing={1.5}><TextField fullWidth label="Minimum funding (₦)" type="number" inputProps={{ min: 0, step: '0.01' }} value={settings.wallet?.minFundingAmount ?? ''} onChange={event => setSettings(previous => ({ ...previous, wallet: { ...previous.wallet, minFundingAmount: Number(event.target.value) } }))} /><TextField fullWidth label="Maximum funding (₦)" type="number" inputProps={{ min: 0, step: '0.01' }} value={settings.wallet?.maxFundingAmount ?? ''} onChange={event => setSettings(previous => ({ ...previous, wallet: { ...previous.wallet, maxFundingAmount: Number(event.target.value) } }))} /><TextField fullWidth label="Currency" value={settings.wallet?.currency || 'NGN'} onChange={event => setSettings(previous => ({ ...previous, wallet: { ...previous.wallet, currency: event.target.value.toUpperCase() } }))} /></Stack></CardContent></Card></Grid><Grid item xs={12}><Card variant="outlined" sx={{ borderRadius: 3 }}><CardContent sx={{ p: { xs: 2, md: 3 } }}><Typography variant="h6" fontWeight={850}>Feature switches</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Changes apply to new wallet payment flows.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><FormControlLabel control={<Switch checked={Boolean(settings.features?.walletEnabled)} onChange={event => setSettings(previous => ({ ...previous, features: { ...previous.features, walletEnabled: event.target.checked } }))} />} label="Enable wallet funding" /><FormControlLabel control={<Switch checked={Boolean(settings.features?.autoVerifyPayments)} onChange={event => setSettings(previous => ({ ...previous, features: { ...previous.features, autoVerifyPayments: event.target.checked } }))} />} label="Auto-verify gateway payments" /><Button variant="contained" onClick={async () => { setLoading(previous => ({ ...previous, settings: true })); try { const response = await api.put('/admin/payments/settings', settings); if (response.data?.success) notify('success', 'Payment settings saved.'); } catch (error) { notify('error', error.response?.data?.message || 'Could not save payment settings.'); } finally { setLoading(previous => ({ ...previous, settings: false })); } }} disabled={loading.settings} startIcon={loading.settings ? <CircularProgress size={17} color="inherit" /> : <SettingsRounded />}>Save settings</Button></Stack></CardContent></Card></Grid></Grid>
          </TabPanel>
        </Box>
      </Card>

      <Dialog open={fundDialog.open} onClose={closeFund} fullWidth maxWidth="sm"><DialogTitle sx={{ fontWeight: 850 }}>Fund customer wallet</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="warning" icon={<WarningAmberRounded />}>This creates an immediate successful credit and an audit record. Confirm the customer and amount before continuing.</Alert><Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5 }}><Stack direction="row" spacing={1.25} alignItems="center"><Avatar sx={{ bgcolor: 'primary.50', color: 'primary.main' }}>{initials(fundDialog.wallet?.user?.name)}</Avatar><Box><Typography fontWeight={800}>{fundDialog.wallet?.user?.name || 'Unknown user'}</Typography><Typography variant="body2" color="text.secondary">{fundDialog.wallet?.user?.email || 'No email'} · Balance {currency(fundDialog.wallet?.balance)}</Typography></Box></Stack></Paper><TextField autoFocus fullWidth label="Amount (₦)" type="number" inputProps={{ min: 1, step: '0.01' }} value={fundAmount} onChange={event => setFundAmount(event.target.value)} /><TextField fullWidth multiline minRows={2} label="Description (optional)" placeholder="e.g. Refund, promotion or offline credit" value={fundDescription} onChange={event => setFundDescription(event.target.value)} />{Number(fundAmount) > 0 && <Alert severity="info">New balance: <strong>{currency(Number(fundDialog.wallet?.balance || 0) + Number(fundAmount))}</strong></Alert>}<TextField fullWidth label="Type CONFIRM to authorize" value={fundConfirmText} onChange={event => setFundConfirmText(event.target.value.toUpperCase())} helperText="This extra confirmation protects manual wallet credits." /></Stack></DialogContent><DialogActions><Button onClick={closeFund} disabled={fundLoading}>Cancel</Button><Button variant="contained" color="success" onClick={fundWallet} disabled={fundLoading || Number(fundAmount) <= 0 || fundConfirmText !== 'CONFIRM'} startIcon={fundLoading ? <CircularProgress size={17} color="inherit" /> : <AddRounded />}>{fundLoading ? 'Processing...' : 'Confirm funding'}</Button></DialogActions></Dialog>
    </Box>
  );
}

export default PaymentManagement;
