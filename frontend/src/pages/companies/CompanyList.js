import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  AddRounded,
  AccountBalanceWalletRounded,
  BusinessRounded,
  CheckCircleRounded,
  EditRounded,
  MoreHorizRounded,
  PeopleAltRounded,
  RefreshRounded,
  SearchRounded,
  ShieldRounded,
  VisibilityRounded
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import companyService from '../../services/companyService';
import MetricCard from '../../components/ui/MetricCard';

const statusColor = { active: 'success', suspended: 'warning', inactive: 'default' };
const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));

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

  const toggleStatus = async company => {
    const nextStatus = company.status === 'active' ? 'suspended' : 'active';
    try { await companyService.setStatus(company.id, nextStatus); await load(); }
    catch (err) { setError(err.serverMessage || err.message || 'Unable to change company status'); }
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ md: 'center' }}>
        <Box><Typography variant="h4" fontWeight={850}>Company subscriptions</Typography><Typography color="text.secondary" sx={{ mt: .5 }}>Manage employer accounts, employee charging access and company-funded wallets.</Typography></Box>
        <Stack direction="row" spacing={1}><IconButton onClick={load} disabled={loading} aria-label="Refresh companies"><RefreshRounded /></IconButton><Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/companies/new')}>Register company</Button></Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, sm: 2 } }}>
        <MetricCard icon={<BusinessRounded />} label="Companies" value={summary.total || 0} color="#2563EB" />
        <MetricCard icon={<CheckCircleRounded />} label="Active" value={summary.active || 0} color="#059669" />
        <MetricCard icon={<ShieldRounded />} label="Suspended" value={summary.suspended || 0} color="#D97706" />
        <MetricCard icon={<PeopleAltRounded />} label="Company users" value={summary.users || 0} color="#7C3AED" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ p: 2 }}>
          <TextField size="small" fullWidth value={filters.search} onChange={event => setFilter('search', event.target.value)} placeholder="Search company, email, phone or city" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
          <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Status</InputLabel><Select label="Status" value={filters.status} onChange={event => setFilter('status', event.target.value)}><MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="suspended">Suspended</MenuItem><MenuItem value="inactive">Inactive</MenuItem></Select></FormControl>
          <TextField size="small" label="State" value={filters.state} onChange={event => setFilter('state', event.target.value)} sx={{ minWidth: 150 }} />
        </Stack>
        {mobile ? (
          <Stack spacing={1.25} sx={{ p: 1.5, pt: 0 }}>
            {loading ? <Box sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : companies.length === 0 ? <Empty /> : companies.map(company => <Paper key={company.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}><Stack direction="row" spacing={1.5} alignItems="flex-start"><Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}><BusinessRounded /></Box><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={800} noWrap>{company.name}</Typography><Typography variant="body2" color="text.secondary" noWrap>{company.email || company.phone || 'No contact details'}</Typography></Box><Chip size="small" label={company.status} color={statusColor[company.status] || 'default'} /></Stack><Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}><Chip size="small" icon={<PeopleAltRounded />} label={`${company.userCount || 0} users`} /><Chip size="small" icon={<AccountBalanceWalletRounded />} label={money(company.walletBalance)} /></Stack><Stack direction="row" justifyContent="flex-end" spacing={.5} sx={{ mt: 1.5 }}><Button size="small" startIcon={<VisibilityRounded />} onClick={() => navigate(`/companies/${company.id}`)}>Open</Button><Button size="small" startIcon={<EditRounded />} onClick={() => navigate(`/companies/${company.id}/edit`)}>Edit</Button></Stack></Paper>)}
          </Stack>
        ) : (
          <TableContainer><Table><TableHead><TableRow><TableCell>Company</TableCell><TableCell>Contact</TableCell><TableCell>Location</TableCell><TableCell>Users</TableCell><TableCell>Company wallet</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{loading ? <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}><CircularProgress /></TableCell></TableRow> : companies.length === 0 ? <TableRow><TableCell colSpan={7}><Empty /></TableCell></TableRow> : companies.map(company => <TableRow key={company.id} hover><TableCell><Stack direction="row" spacing={1.25} alignItems="center"><Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}><BusinessRounded fontSize="small" /></Box><Box><Typography fontWeight={750}>{company.name}</Typography><Typography variant="caption" color="text.secondary">#{company.id} · {company.country || 'Nigeria'}</Typography></Box></Stack></TableCell><TableCell><Typography variant="body2">{company.email || '—'}</Typography><Typography variant="caption" color="text.secondary">{company.phone || 'No phone'}</Typography></TableCell><TableCell><Typography variant="body2">{company.city || '—'}</Typography><Typography variant="caption" color="text.secondary">{company.state || 'No state'}</Typography></TableCell><TableCell><Chip size="small" icon={<PeopleAltRounded />} label={company.userCount || 0} /></TableCell><TableCell><Typography fontWeight={750}>{money(company.walletBalance)}</Typography></TableCell><TableCell><Chip size="small" label={company.status} color={statusColor[company.status] || 'default'} /></TableCell><TableCell align="right"><IconButton onClick={() => navigate(`/companies/${company.id}`)} aria-label="Open company"><VisibilityRounded fontSize="small" /></IconButton><IconButton onClick={() => navigate(`/companies/${company.id}/edit`)} aria-label="Edit company"><EditRounded fontSize="small" /></IconButton><IconButton onClick={() => toggleStatus(company)} aria-label="Change company status"><MoreHorizRounded fontSize="small" /></IconButton></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        )}
        <TablePagination component="div" count={pagination.total || 0} page={(pagination.page || 1) - 1} rowsPerPage={pagination.limit || 20} rowsPerPageOptions={[10, 20, 50]} onPageChange={(_, page) => setPagination(previous => ({ ...previous, page: page + 1 }))} onRowsPerPageChange={event => setPagination(previous => ({ ...previous, page: 1, limit: Number(event.target.value) }))} />
      </Paper>
    </Stack>
  );
}

function Empty() {
  return <Stack alignItems="center" spacing={1} sx={{ py: 7, textAlign: 'center' }}><BusinessRounded sx={{ fontSize: 46, color: 'text.disabled' }} /><Typography fontWeight={750}>No companies found</Typography><Typography variant="body2" color="text.secondary">Register a company or adjust the filters.</Typography></Stack>;
}
