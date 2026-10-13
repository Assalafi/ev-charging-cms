import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
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
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AccountBalanceWalletRounded,
  AddRounded,
  ArrowForwardRounded,
  BusinessRounded,
  CheckCircleRounded,
  CloseRounded,
  EditRounded,
  MoreVertRounded,
  PauseCircleOutlineRounded,
  PeopleAltRounded,
  PlayCircleOutlineRounded,
  RefreshRounded,
  SearchRounded,
  ShieldRounded,
  VisibilityRounded,
  WarningAmberRounded
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import companyService from '../../services/companyService';
import MetricCard from '../../components/ui/MetricCard';

const statusColor = { active: 'success', suspended: 'warning', inactive: 'default' };
const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const labelStatus = status => status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : 'Unknown';

export default function CompanyList() {
  const navigate = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [companies, setCompanies] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, users: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
  const [filters, setFilters] = useState({ search: '', status: 'all', state: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState({ anchor: null, company: null });
  const [statusDialog, setStatusDialog] = useState({ open: false, company: null, nextStatus: '' });
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await companyService.list({ ...filters, page: pagination.page, limit: pagination.limit });
      setCompanies(result.companies || []);
      setSummary(result.summary || {});
      setPagination(current => result.pagination || current);
      setError('');
    } catch (err) {
      setError(err.serverMessage || err.message || 'Failed to fetch companies');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => {
    setFilters(previous => ({ ...previous, [key]: value }));
    setPagination(previous => ({ ...previous, page: 1 }));
  };

  const clearFilters = () => {
    setFilters({ search: '', status: 'all', state: '' });
    setPagination(previous => ({ ...previous, page: 1 }));
  };

  const hasFilters = Boolean(filters.search || filters.state || filters.status !== 'all');
  const activeFilterCount = [filters.search, filters.state, filters.status !== 'all' ? filters.status : ''].filter(Boolean).length;

  const openMenu = (event, company) => setMenu({ anchor: event.currentTarget, company });
  const closeMenu = () => setMenu({ anchor: null, company: null });
  const openStatusDialog = company => {
    closeMenu();
    setStatusDialog({ open: true, company, nextStatus: company.status === 'active' ? 'suspended' : 'active' });
  };
  const closeStatusDialog = () => {
    if (!statusBusy) setStatusDialog({ open: false, company: null, nextStatus: '' });
  };
  const confirmStatus = async () => {
    if (!statusDialog.company) return;
    setStatusBusy(true);
    try {
      await companyService.setStatus(statusDialog.company.id, statusDialog.nextStatus);
      closeStatusDialog();
      await load();
    } catch (err) {
      setError(err.serverMessage || err.message || 'Unable to change company status');
    } finally {
      setStatusBusy(false);
    }
  };

  const visibleSummary = useMemo(() => ({
    total: summary.total || 0,
    active: summary.active || 0,
    suspended: summary.suspended || 0,
    users: summary.users || 0
  }), [summary]);

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Paper
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: { xs: 3, md: 4 },
          p: { xs: 2.25, sm: 3.25 },
          color: 'common.white',
          background: theme => `linear-gradient(120deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 58%, #0b8f78 100%)`,
          boxShadow: '0 18px 45px rgba(21, 93, 129, .2)'
        }}
      >
        <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', right: -100, top: -145, bgcolor: 'rgba(255,255,255,.1)' }} />
        <Box sx={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', right: 95, bottom: -105, bgcolor: 'rgba(255,255,255,.06)' }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ position: 'relative', zIndex: 1 }}>
          <Stack direction="row" spacing={1.75} alignItems="center">
            <Box sx={{ width: { xs: 48, sm: 58 }, height: { xs: 48, sm: 58 }, borderRadius: 3.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.2)' }}>
              <BusinessRounded sx={{ fontSize: { xs: 26, sm: 32 } }} />
            </Box>
            <Box>
              <Typography variant="overline" sx={{ letterSpacing: 1.4, opacity: .76, fontWeight: 800 }}>Business subscriptions</Typography>
              <Typography variant="h4" sx={{ fontWeight: 850, letterSpacing: -.5, fontSize: { xs: '1.65rem', sm: '2.15rem' } }}>Company directory</Typography>
              <Typography sx={{ mt: .5, maxWidth: 620, opacity: .86, fontSize: { xs: '.86rem', sm: '.95rem' } }}>Manage company access, funded wallets and the people charging on their account.</Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}>
            <Button onClick={load} disabled={loading} startIcon={<RefreshRounded />} sx={{ color: 'common.white', borderColor: 'rgba(255,255,255,.36)', '&:hover': { borderColor: 'common.white', bgcolor: 'rgba(255,255,255,.08)' } }} variant="outlined">Refresh</Button>
            <Button onClick={() => navigate('/companies/new')} startIcon={<AddRounded />} variant="contained" sx={{ bgcolor: 'common.white', color: 'primary.dark', '&:hover': { bgcolor: 'grey.100' }, flex: { xs: 1, sm: 'unset' } }}>Register company</Button>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, sm: 2 } }}>
        <MetricCard icon={<BusinessRounded />} label="All companies" value={visibleSummary.total} helper="Registered accounts" color="#2563EB" />
        <MetricCard icon={<CheckCircleRounded />} label="Active" value={visibleSummary.active} helper="Can access charging" color="#059669" />
        <MetricCard icon={<ShieldRounded />} label="Suspended" value={visibleSummary.suspended} helper="Access temporarily paused" color="#D97706" />
        <MetricCard icon={<PeopleAltRounded />} label="Company users" value={visibleSummary.users} helper="Assigned mobile accounts" color="#7C3AED" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: { xs: 3, md: 4 }, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box>
              <Typography variant="h6" fontWeight={850}>Company accounts</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Search and filter the subscription directory.</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{pagination.total || companies.length} result{(pagination.total || companies.length) === 1 ? '' : 's'}</Typography>
          </Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ mt: 2 }}>
            <TextField size="small" fullWidth value={filters.search} onChange={event => setFilter('search', event.target.value)} placeholder="Search name, email, phone or city" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
            <FormControl size="small" sx={{ minWidth: { md: 170 } }}><InputLabel>Status</InputLabel><Select label="Status" value={filters.status} onChange={event => setFilter('status', event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="suspended">Suspended</MenuItem><MenuItem value="inactive">Inactive</MenuItem></Select></FormControl>
            <TextField size="small" label="State" value={filters.state} onChange={event => setFilter('state', event.target.value)} sx={{ minWidth: { md: 160 } }} />
            {hasFilters && <Button color="inherit" onClick={clearFilters} startIcon={<CloseRounded />} sx={{ whiteSpace: 'nowrap' }}>Clear{activeFilterCount > 1 ? ` (${activeFilterCount})` : ''}</Button>}
          </Stack>
          {hasFilters && <Stack direction="row" spacing={.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
            {filters.status !== 'all' && <Chip size="small" label={`Status: ${labelStatus(filters.status)}`} onDelete={() => setFilter('status', 'all')} />}
            {filters.state && <Chip size="small" label={`State: ${filters.state}`} onDelete={() => setFilter('state', '')} />}
            {filters.search && <Chip size="small" label={`Search: ${filters.search}`} onDelete={() => setFilter('search', '')} />}
          </Stack>}
        </Box>
        <Divider sx={{ mt: 2 }} />
        {mobile ? (
          <Stack spacing={1.25} sx={{ p: 1.5 }}>
            {loading ? <LoadingState /> : companies.length === 0 ? <Empty hasFilters={hasFilters} onClear={clearFilters} /> : companies.map(company => <CompanyCard key={company.id} company={company} onOpen={() => navigate(`/companies/${company.id}`)} onMenu={openMenu} />)}
          </Stack>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 860 }}>
              <TableHead><TableRow sx={{ '& th': { bgcolor: 'grey.50', color: 'text.secondary', fontWeight: 800, fontSize: '.75rem', letterSpacing: .35, textTransform: 'uppercase', whiteSpace: 'nowrap' } }}><TableCell>Company</TableCell><TableCell>Contact</TableCell><TableCell>Location</TableCell><TableCell>Users</TableCell><TableCell>Wallet balance</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7}><LoadingState /></TableCell></TableRow> : companies.length === 0 ? <TableRow><TableCell colSpan={7}><Empty hasFilters={hasFilters} onClear={clearFilters} /></TableCell></TableRow> : companies.map(company => <CompanyRow key={company.id} company={company} onOpen={() => navigate(`/companies/${company.id}`)} onMenu={openMenu} />)}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Divider />
        <TablePagination component="div" count={pagination.total || 0} page={(pagination.page || 1) - 1} rowsPerPage={pagination.limit || 20} rowsPerPageOptions={[10, 20, 50]} onPageChange={(_, page) => setPagination(previous => ({ ...previous, page: page + 1 }))} onRowsPerPageChange={event => setPagination(previous => ({ ...previous, page: 1, limit: Number(event.target.value) }))} labelRowsPerPage={mobile ? 'Rows' : 'Rows per page'} />
      </Paper>

      <Menu anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={closeMenu} PaperProps={{ sx: { minWidth: 210, borderRadius: 2.5, mt: .75 } }}>
        <MenuItem onClick={() => { const id = menu.company?.id; closeMenu(); if (id) navigate(`/companies/${id}`); }}><ListItemIcon><VisibilityRounded fontSize="small" /></ListItemIcon><ListItemText primary="Open workspace" secondary="View company details" /></MenuItem>
        <MenuItem onClick={() => { const id = menu.company?.id; closeMenu(); if (id) navigate(`/companies/${id}/edit`); }}><ListItemIcon><EditRounded fontSize="small" /></ListItemIcon><ListItemText primary="Edit company" secondary="Update profile and tariff" /></MenuItem>
        <Divider />
        {menu.company?.status === 'active' ? <MenuItem onClick={() => openStatusDialog(menu.company)} sx={{ color: 'warning.dark' }}><ListItemIcon><PauseCircleOutlineRounded fontSize="small" color="warning" /></ListItemIcon><ListItemText primary="Suspend company" secondary="Requires confirmation" /></MenuItem> : <MenuItem onClick={() => openStatusDialog(menu.company)} sx={{ color: 'success.dark' }}><ListItemIcon><PlayCircleOutlineRounded fontSize="small" color="success" /></ListItemIcon><ListItemText primary="Activate company" secondary="Requires confirmation" /></MenuItem>}
      </Menu>

      <Dialog open={statusDialog.open} onClose={closeStatusDialog} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>{statusDialog.nextStatus === 'suspended' ? 'Suspend company?' : 'Activate company?'}</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ pt: .5 }}>
            <Box sx={theme => ({ width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: alpha(theme.palette[statusDialog.nextStatus === 'suspended' ? 'warning' : 'success'].main, .12), color: statusDialog.nextStatus === 'suspended' ? 'warning.dark' : 'success.dark', flexShrink: 0 })}><WarningAmberRounded /></Box>
            <Typography variant="body2" color="text.secondary">{statusDialog.nextStatus === 'suspended' ? `${statusDialog.company?.name || 'This company'} will no longer be able to use company charging access until it is activated again.` : `${statusDialog.company?.name || 'This company'} will regain access to company charging features.`}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}><Button onClick={closeStatusDialog} disabled={statusBusy}>Cancel</Button><Button variant="contained" color={statusDialog.nextStatus === 'suspended' ? 'warning' : 'success'} onClick={confirmStatus} disabled={statusBusy}>{statusBusy ? <CircularProgress size={18} color="inherit" /> : statusDialog.nextStatus === 'suspended' ? 'Suspend company' : 'Activate company'}</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}

function CompanyIdentity({ company, compact = false }) {
  return <Stack direction="row" spacing={1.25} alignItems="center" minWidth={0}>
    <Box sx={theme => ({ width: compact ? 42 : 40, height: compact ? 42 : 40, borderRadius: compact ? 2.5 : 2.25, display: 'grid', placeItems: 'center', flexShrink: 0, color: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, .1), border: `1px solid ${alpha(theme.palette.primary.main, .13)}` })}><BusinessRounded fontSize={compact ? 'medium' : 'small'} /></Box>
    <Box minWidth={0}><Typography fontWeight={800} noWrap>{company.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>#{company.id} · {company.country || 'Nigeria'}</Typography></Box>
  </Stack>;
}

function StatusChip({ status }) {
  return <Chip size="small" label={labelStatus(status)} color={statusColor[status] || 'default'} sx={{ fontWeight: 750, textTransform: 'capitalize' }} />;
}

function CompanyRow({ company, onOpen, onMenu }) {
  return <TableRow hover sx={{ '& td': { py: 1.65, borderColor: 'grey.100' }, '&:last-child td': { borderBottom: 0 } }}>
    <TableCell><CompanyIdentity company={company} /></TableCell>
    <TableCell><Typography variant="body2" noWrap>{company.email || 'No email'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{company.phone || 'No phone'}</Typography></TableCell>
    <TableCell><Typography variant="body2" noWrap>{company.city || 'No city'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{company.state || 'State not set'}</Typography></TableCell>
    <TableCell><Chip size="small" icon={<PeopleAltRounded />} label={company.userCount || 0} sx={{ fontWeight: 700 }} /></TableCell>
    <TableCell><Stack direction="row" spacing={.75} alignItems="center"><AccountBalanceWalletRounded sx={{ fontSize: 18, color: 'text.secondary' }} /><Typography fontWeight={800}>{money(company.walletBalance)}</Typography></Stack></TableCell>
    <TableCell><StatusChip status={company.status} /></TableCell>
    <TableCell align="right"><IconButton onClick={onOpen} aria-label={`Open ${company.name}`} size="small" sx={{ mr: .25 }}><ArrowForwardRounded fontSize="small" /></IconButton><IconButton onClick={event => onMenu(event, company)} aria-label={`Actions for ${company.name}`} size="small"><MoreVertRounded /></IconButton></TableCell>
  </TableRow>;
}

function CompanyCard({ company, onOpen, onMenu }) {
  return <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3, '&:active': { bgcolor: 'action.hover' } }}>
    <Stack direction="row" spacing={1} alignItems="flex-start"><CompanyIdentity company={company} compact /><Box sx={{ ml: 'auto' }}><IconButton onClick={event => onMenu(event, company)} aria-label={`Actions for ${company.name}`} size="small"><MoreVertRounded /></IconButton></Box></Stack>
    <Stack direction="row" spacing={.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}><StatusChip status={company.status} /><Chip size="small" icon={<PeopleAltRounded />} label={`${company.userCount || 0} users`} /><Chip size="small" icon={<AccountBalanceWalletRounded />} label={money(company.walletBalance)} /></Stack>
    <Stack spacing={.35} sx={{ mt: 1.5 }}><Typography variant="body2" noWrap>{company.email || company.phone || 'No contact details'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{[company.city, company.state].filter(Boolean).join(', ') || 'Location not provided'}</Typography></Stack>
    <Button fullWidth size="small" onClick={onOpen} endIcon={<ArrowForwardRounded />} sx={{ mt: 1.25, justifyContent: 'space-between' }}>Open workspace</Button>
  </Paper>;
}

function LoadingState() {
  return <Box sx={{ minHeight: 230, display: 'grid', placeItems: 'center' }}><CircularProgress size={30} /></Box>;
}

function Empty({ hasFilters, onClear }) {
  return <Stack alignItems="center" spacing={1} sx={{ py: 7, px: 2, textAlign: 'center' }}><Box sx={{ width: 58, height: 58, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'primary.50', color: 'primary.main' }}><BusinessRounded sx={{ fontSize: 30 }} /></Box><Typography fontWeight={800}>No companies found</Typography><Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360 }}>{hasFilters ? 'Try a different search or clear the filters to see all company accounts.' : 'Register your first company to start managing subscription access.'}</Typography>{hasFilters && <Button size="small" onClick={onClear}>Clear filters</Button>}</Stack>;
}
