import React, { useCallback, useEffect, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  InputAdornment, LinearProgress, List, ListItem, ListItemText, Menu,
  MenuItem, Stack, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, Tabs, TextField, Tooltip, Typography
} from '@mui/material';
import {
  AccountBalanceWalletRounded, AddRounded, ArrowDownwardRounded,
  ArrowUpwardRounded, BoltRounded, CheckCircleRounded, CloseRounded,
  FilterAltRounded, HistoryRounded, MoreVertRounded, PersonRounded,
  RefreshRounded, SearchRounded, ShieldRounded, TrendingUpRounded,
  VisibilityRounded, WalletRounded
} from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';
import { useCompanyAuth } from '../../contexts/CompanyAuthContext';
import { energy, money } from './CompanyDashboard';
import PageHeader from '../../components/ui/PageHeader';
import SectionCard from '../../components/ui/SectionCard';

const initialForm = { name: '', email: '', phone: '', password: '' };
const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase();
const dateTime = value => value ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(new Date(value)) : '—';
const statusColor = status => status === 'active' || status === 'Completed' || status === 'SUCCESS' ? 'success' : status === 'suspended' || status === 'InProgress' ? 'warning' : status === 'FAILED' ? 'error' : 'default';
const activityTitle = key => ({ charging: 'Charging sessions', funding: 'Company funding', wallet: 'Wallet ledger' }[key] || key);

function Metric({ label, value, helper, icon, color = 'primary' }) {
  return <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 10px 30px rgba(15, 23, 42, .05)' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" justifyContent="space-between" spacing={1.5}><Box><Typography variant="caption" color="text.secondary" fontWeight={700}>{label}</Typography><Typography variant="h5" fontWeight={850} sx={{ mt: .5 }}>{value}</Typography><Typography variant="caption" color="text.secondary">{helper}</Typography></Box><Box sx={{ width: 42, height: 42, borderRadius: 2.5, display: 'grid', placeItems: 'center', color: `${color}.main`, bgcolor: alpha(color === 'success' ? '#059669' : color === 'warning' ? '#D97706' : '#2563EB', .1) }}>{icon}</Box></Stack></CardContent></Card>;
}

function EmptyState({ title, description }) {
  return <Box sx={{ py: 6, textAlign: 'center' }}><HistoryRounded sx={{ fontSize: 44, color: 'text.disabled' }} /><Typography fontWeight={750} sx={{ mt: 1 }}>{title}</Typography><Typography variant="body2" color="text.secondary">{description}</Typography></Box>;
}

export default function CompanyUsers() {
  const { canManage } = useCompanyAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, deleted: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 0 });
  const [query, setQuery] = useState({ search: '', status: 'all', page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [fundUser, setFundUser] = useState(null);
  const [recoveryUser, setRecoveryUser] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [amount, setAmount] = useState('');
  const [recoveryAmount, setRecoveryAmount] = useState('');
  const [recoveryReason, setRecoveryReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuUser, setMenuUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityTab, setActivityTab] = useState('overview');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState({ charging: 1, funding: 1, wallet: 1 });

  const loadUsers = useCallback(async ({ silent = false } = {}) => {
    try {
      setError('');
      if (silent) setRefreshing(true); else setLoading(true);
      const response = await companyPortalService.users(query);
      setUsers(response.data.users || []);
      setStats(response.data.stats || { total: 0, active: 0, suspended: 0, deleted: 0 });
      setPagination(response.data.pagination || { page: query.page, limit: query.limit, total: 0, pages: 0 });
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Failed to load company users');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadUsers(), query.search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadUsers, query.search]);

  const loadActivity = useCallback(async (userId, section = 'all', page = 1) => {
    try {
      setActivityLoading(true); setError('');
      const response = await companyPortalService.userActivity(userId, { section, page, limit: 8 });
      setActivity(previous => ({
        ...(previous || {}),
        ...response.data,
        activities: { ...(previous?.activities || {}), ...(response.data.activities || {}) }
      }));
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Failed to load driver activity');
    } finally { setActivityLoading(false); }
  }, []);

  const openProfile = user => {
    setSelectedUser(user); setActivityTab('overview'); setActivityPage({ charging: 1, funding: 1, wallet: 1 });
    setActivity(null); loadActivity(user.id, 'all', 1);
  };

  const changeActivityTab = (_, value) => {
    setActivityTab(value);
    if (value !== 'overview' && selectedUser) loadActivity(selectedUser.id, value, activityPage[value] || 1);
  };

  const changeActivityPage = (_, page) => {
    const nextPage = page + 1;
    setActivityPage(previous => ({ ...previous, [activityTab]: nextPage }));
    if (selectedUser) loadActivity(selectedUser.id, activityTab, nextPage);
  };

  const updateQuery = changes => setQuery(previous => ({ ...previous, ...changes, page: 1 }));
  const closeMenu = () => { setMenuAnchor(null); setMenuUser(null); };

  const submitCreate = async () => {
    setSaving(true);
    try { await companyPortalService.createUser(form); setCreateOpen(false); setForm(initialForm); await loadUsers({ silent: true }); }
    catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Failed to create mobile user'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async user => {
    closeMenu();
    try { await companyPortalService.setUserStatus(user.id, user.status === 'active' ? 'suspended' : 'active'); await loadUsers({ silent: true }); }
    catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Failed to update user status'); }
  };

  const deactivate = async user => {
    closeMenu();
    if (!window.confirm(`Deactivate ${user.name}? Their charging access will be blocked.`)) return;
    try { await companyPortalService.setUserStatus(user.id, 'deleted'); await loadUsers({ silent: true }); }
    catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Failed to deactivate user'); }
  };

  const fund = async () => {
    setSaving(true);
    try { await companyPortalService.fundUser(fundUser.id, { amount }); setFundUser(null); setAmount(''); await loadUsers({ silent: true }); if (selectedUser?.id === fundUser.id) loadActivity(fundUser.id, activityTab === 'overview' ? 'all' : activityTab, 1); }
    catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Failed to fund mobile user'); }
    finally { setSaving(false); }
  };

  const recover = async () => {
    setSaving(true);
    try {
      const response = await companyPortalService.recoverUser(recoveryUser.id, { amount: recoveryAmount, description: recoveryReason });
      setRecoveryUser(null); setRecoveryAmount(''); setRecoveryReason('');
      await loadUsers({ silent: true });
      if (selectedUser?.id === recoveryUser.id && response.data?.result?.userBalance !== undefined) {
        setSelectedUser(previous => previous ? { ...previous, wallet: { ...(previous.wallet || {}), balance: response.data.result.userBalance } } : previous);
      }
      if (selectedUser?.id === recoveryUser.id) loadActivity(recoveryUser.id, activityTab === 'overview' ? 'all' : activityTab, 1);
    } catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Failed to recover mobile user funds'); }
    finally { setSaving(false); }
  };

  const selectedSummary = activity?.summary || {};
  const selectedActivities = activity?.activities || {};
  const currentRows = selectedActivities[activityTab]?.rows || [];
  const currentPagination = selectedActivities[activityTab]?.pagination || { page: activityPage[activityTab] || 1, limit: 8, total: 0 };

  const overviewRows = {
    charging: (selectedActivities.charging?.rows || []).slice(0, 4),
    funding: (selectedActivities.funding?.rows || []).slice(0, 4)
  };

  const renderChargingRows = rows => rows.length ? rows.map(row => <TableRow key={row.id} hover><TableCell><Typography fontWeight={700}>#{row.transactionId}</Typography><Typography variant="caption" color="text.secondary">{row.chargePointId}</Typography></TableCell><TableCell>{row.charging_station?.name || row.chargePointId || '—'}<Typography variant="caption" display="block" color="text.secondary">{row.location?.name || 'Location unavailable'}</Typography></TableCell><TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell><TableCell align="right">{energy(row.energyDelivered)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(row.amount)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.stopTime || row.startTime)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6}><EmptyState title="No charging sessions" description="This driver has no recorded charging activity yet." /></TableCell></TableRow>;
  const renderFundingRows = rows => rows.length ? rows.map(row => <TableRow key={row.id} hover><TableCell><Chip size="small" icon={<ArrowDownwardRounded />} label={row.type} color={row.type === 'DEBIT' ? 'warning' : 'success'} /></TableCell><TableCell>{row.method || 'company_transfer'}<Typography variant="caption" display="block" color="text.secondary">{row.description || 'Company wallet transfer'}</Typography></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(row.amount)}</TableCell><TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.createdAt)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5}><EmptyState title="No company funding" description="Funding sent from the company wallet will appear here." /></TableCell></TableRow>;
  const renderWalletRows = rows => rows.length ? rows.map(row => <TableRow key={row.id} hover><TableCell><Chip size="small" icon={row.type === 'CREDIT' ? <ArrowDownwardRounded /> : <ArrowUpwardRounded />} label={row.type} color={row.type === 'CREDIT' ? 'success' : 'warning'} /></TableCell><TableCell>{row.gateway || 'internal'}<Typography variant="caption" display="block" color="text.secondary">{row.description || 'Wallet activity'}</Typography></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(row.amount)}</TableCell><TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{dateTime(row.createdAt)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5}><EmptyState title="No wallet activity" description="Wallet credits and charging debits will appear here." /></TableCell></TableRow>;

  return <Stack spacing={{ xs: 2, md: 3 }}>
    <PageHeader eyebrow="Company people" title="Drivers & mobile users" description="Manage access, allowances and every charging activity for your company drivers." actions={<><Button variant="outlined" startIcon={<RefreshRounded />} onClick={() => loadUsers({ silent: true })} disabled={refreshing}>Refresh</Button>{canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCreateOpen(true)}>Add driver</Button>}</>} />

    {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
    <Grid container spacing={2}><Grid item xs={6} md={3}><Metric label="Total drivers" value={stats.total.toLocaleString()} helper="Assigned to this company" icon={<PersonRounded />} /></Grid><Grid item xs={6} md={3}><Metric label="Active" value={stats.active.toLocaleString()} helper="Can charge now" icon={<CheckCircleRounded />} color="success" /></Grid><Grid item xs={6} md={3}><Metric label="Suspended" value={stats.suspended.toLocaleString()} helper="Access paused" icon={<ShieldRounded />} color="warning" /></Grid><Grid item xs={6} md={3}><Metric label="Showing" value={`${users.length} / ${pagination.total || 0}`} helper={`Page ${pagination.page || 1} of ${pagination.pages || 1}`} icon={<TrendingUpRounded />} color="info" /></Grid></Grid>

    <Card sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent sx={{ p: { xs: 1.5, sm: 2.25 } }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}><TextField fullWidth placeholder="Search name, email, phone or access tag" value={query.search} onChange={event => updateQuery({ search: event.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded color="action" /></InputAdornment> }} /><TextField select label="Status" value={query.status} onChange={event => updateQuery({ status: event.target.value })} sx={{ minWidth: { md: 190 } }} InputProps={{ startAdornment: <InputAdornment position="start"><FilterAltRounded color="action" /></InputAdornment> }}><MenuItem value="all">All drivers</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="suspended">Suspended</MenuItem><MenuItem value="deleted">Deactivated</MenuItem></TextField></Stack></CardContent>{refreshing && <LinearProgress />}</Card>

    <SectionCard title="Driver directory" description="Open a driver to see wallet funding, charging sessions and account activity." contentSx={{ p: 0 }}>
      {loading ? <Box sx={{ minHeight: 340, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : <><TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 980 }}><TableHead><TableRow><TableCell>Driver</TableCell><TableCell>Access tag</TableCell><TableCell>Status</TableCell><TableCell align="right">Wallet balance</TableCell><TableCell>Last activity</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{users.map(user => <TableRow key={user.id} hover sx={{ cursor: 'pointer' }} onClick={() => openProfile(user)}><TableCell><Stack direction="row" alignItems="center" spacing={1.5}><Avatar sx={{ width: 42, height: 42, bgcolor: user.status === 'active' ? 'primary.main' : 'grey.400', fontWeight: 800 }}>{initials(user.name)}</Avatar><Box sx={{ minWidth: 0 }}><Typography fontWeight={750} noWrap>{user.name}</Typography><Typography variant="caption" color="text.secondary" noWrap display="block">{user.email} · {user.phone}</Typography></Box></Stack></TableCell><TableCell><Typography variant="body2" fontFamily="monospace">{user.tagId || '—'}</Typography></TableCell><TableCell><Chip size="small" label={user.status === 'deleted' ? 'Deactivated' : user.status} color={statusColor(user.status)} /></TableCell><TableCell align="right"><Typography fontWeight={800}>{money(user.wallet?.balance)}</Typography><Typography variant="caption" color="text.secondary">{user.wallet?.isActive === false ? 'Wallet disabled' : 'Available'}</Typography></TableCell><TableCell><Typography variant="body2" color="text.secondary">Open profile for activity</Typography></TableCell><TableCell align="right" onClick={event => event.stopPropagation()}>{canManage ? <><Tooltip title="View activity"><IconButton color="primary" onClick={() => openProfile(user)}><VisibilityRounded /></IconButton></Tooltip><IconButton onClick={event => { setMenuAnchor(event.currentTarget); setMenuUser(user); }}><MoreVertRounded /></IconButton></> : <Tooltip title="View activity"><IconButton color="primary" onClick={() => openProfile(user)}><VisibilityRounded /></IconButton></Tooltip>}</TableCell></TableRow>)}{!users.length && <TableRow><TableCell colSpan={6}><EmptyState title="No drivers found" description="Adjust the filters or add your first company driver." /></TableCell></TableRow>}</TableBody></Table></TableContainer><Divider /><TablePagination component="div" count={pagination.total || 0} page={Math.max((query.page || 1) - 1, 0)} onPageChange={(_, page) => setQuery(previous => ({ ...previous, page: page + 1 }))} rowsPerPage={query.limit} onRowsPerPageChange={event => setQuery(previous => ({ ...previous, limit: Number(event.target.value), page: 1 }))} rowsPerPageOptions={[10, 25, 50]} labelRowsPerPage="Drivers per page" /></>}
    </SectionCard>

    <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}><MenuItem onClick={() => { const user = menuUser; closeMenu(); openProfile(user); }}><VisibilityRounded fontSize="small" sx={{ mr: 1 }} />View activity</MenuItem>{canManage && menuUser && <MenuItem onClick={() => { const user = menuUser; closeMenu(); setFundUser(user); }} disabled={menuUser.status === 'deleted'}><WalletRounded fontSize="small" sx={{ mr: 1 }} />Fund wallet</MenuItem>}{canManage && menuUser && <MenuItem onClick={() => { const user = menuUser; closeMenu(); setRecoveryAmount(''); setRecoveryReason(''); setRecoveryUser(user); }} disabled={menuUser.status === 'deleted' || Number(menuUser.wallet?.balance || 0) <= 0}><ArrowUpwardRounded fontSize="small" sx={{ mr: 1 }} />Recover wallet funds</MenuItem>}{canManage && menuUser && menuUser.status !== 'deleted' && <MenuItem onClick={() => toggleStatus(menuUser)}><ShieldRounded fontSize="small" sx={{ mr: 1 }} />{menuUser.status === 'active' ? 'Suspend driver' : 'Activate driver'}</MenuItem>}{canManage && menuUser?.status === 'active' && <MenuItem onClick={() => deactivate(menuUser)} sx={{ color: 'error.main' }}><CloseRounded fontSize="small" sx={{ mr: 1 }} />Deactivate driver</MenuItem>}</Menu>

    <Dialog open={createOpen} onClose={() => !saving && setCreateOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Add company driver</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label="Full name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required autoFocus /><TextField label="Email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /><TextField label="Phone" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required /><TextField label="Temporary password" type="password" helperText="The driver can use this password in the mobile app." value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required /></Stack></DialogContent><DialogActions><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="contained" onClick={submitCreate} disabled={saving || !form.name || !form.email || !form.phone || !form.password}>{saving ? <CircularProgress size={20} /> : 'Create driver'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(fundUser)} onClose={() => !saving && setFundUser(null)} fullWidth maxWidth="xs"><DialogTitle>Fund {fundUser?.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="info">This transfer comes from the company wallet and is recorded in both ledgers.</Alert><TextField fullWidth label="Amount (₦)" type="number" inputProps={{ min: 1, step: '0.01' }} value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></Stack></DialogContent><DialogActions><Button onClick={() => setFundUser(null)}>Cancel</Button><Button variant="contained" onClick={fund} disabled={saving || Number(amount) <= 0}>{saving ? <CircularProgress size={20} /> : 'Fund wallet'}</Button></DialogActions></Dialog>
    <Dialog open={Boolean(recoveryUser)} onClose={() => !saving && setRecoveryUser(null)} fullWidth maxWidth="xs"><DialogTitle>Recover funds from {recoveryUser?.name}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="warning">This moves funds from the driver wallet back to the company wallet. You cannot recover more than the available balance of {money(recoveryUser?.wallet?.balance)}.</Alert><TextField fullWidth required label="Amount (₦)" type="number" inputProps={{ min: 0.01, max: Number(recoveryUser?.wallet?.balance || 0), step: '0.01' }} value={recoveryAmount} onChange={event => setRecoveryAmount(event.target.value)} autoFocus /><TextField fullWidth label="Reason (optional)" value={recoveryReason} onChange={event => setRecoveryReason(event.target.value)} helperText="The recovery is recorded in both wallet ledgers." /></Stack></DialogContent><DialogActions><Button onClick={() => setRecoveryUser(null)}>Cancel</Button><Button variant="contained" color="warning" onClick={recover} disabled={saving || Number(recoveryAmount) <= 0 || Number(recoveryAmount) > Number(recoveryUser?.wallet?.balance || 0)}>{saving ? <CircularProgress size={20} /> : 'Recover funds'}</Button></DialogActions></Dialog>

    <Dialog open={Boolean(selectedUser)} onClose={() => setSelectedUser(null)} fullWidth maxWidth="lg" scroll="paper"><DialogTitle sx={{ pb: 1 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}><Stack direction="row" alignItems="center" spacing={1.5}><Avatar sx={{ width: 52, height: 52, bgcolor: 'primary.main', fontWeight: 800 }}>{initials(selectedUser?.name)}</Avatar><Box><Typography variant="h5" fontWeight={850}>{selectedUser?.name}</Typography><Typography variant="body2" color="text.secondary">{selectedUser?.email} · {selectedUser?.phone}</Typography><Stack direction="row" spacing={.75} sx={{ mt: .75 }}><Chip size="small" label={selectedUser?.tagId || 'No access tag'} variant="outlined" /><Chip size="small" label={selectedUser?.status === 'deleted' ? 'Deactivated' : selectedUser?.status} color={statusColor(selectedUser?.status)} /></Stack></Box></Stack><IconButton onClick={() => setSelectedUser(null)}><CloseRounded /></IconButton></Stack></DialogTitle><Divider /><DialogContent sx={{ p: { xs: 1.5, sm: 3 } }}>{activityLoading && !activity ? <Box sx={{ minHeight: 300, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : <Stack spacing={2.5}><Grid container spacing={1.5}><Grid item xs={6} md={3}><Metric label="Wallet balance" value={money(selectedUser?.wallet?.balance ?? activity?.user?.wallet?.balance)} helper="Current driver wallet" icon={<AccountBalanceWalletRounded />} /></Grid><Grid item xs={6} md={3}><Metric label="Sessions" value={Number(selectedSummary.sessions || 0).toLocaleString()} helper={`${selectedSummary.activeSessions || 0} active now`} icon={<BoltRounded />} color="success" /></Grid><Grid item xs={6} md={3}><Metric label="Energy" value={energy(selectedSummary.energyWh)} helper="Completed and running" icon={<BoltRounded />} /></Grid><Grid item xs={6} md={3}><Metric label="Company funded" value={money(selectedSummary.companyFunded)} helper={`${selectedSummary.fundingCount || 0} transfers`} icon={<ArrowDownwardRounded />} color="warning" /></Grid></Grid><Tabs value={activityTab} onChange={changeActivityTab} variant="scrollable" scrollButtons="auto"><Tab value="overview" label="Overview" /><Tab value="charging" label="Charging" /><Tab value="funding" label="Funding" /><Tab value="wallet" label="Wallet ledger" /></Tabs>{activityTab === 'overview' ? <Grid container spacing={2}><Grid item xs={12} lg={7}><SectionCard title="Recent charging" description="Latest sessions and amounts"><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Session</TableCell><TableCell>Status</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{overviewRows.charging.length ? overviewRows.charging.map(row => <TableRow key={row.id}><TableCell><Typography fontWeight={700}>#{row.transactionId}</Typography><Typography variant="caption" color="text.secondary">{row.chargePointId}</Typography></TableCell><TableCell><Chip size="small" label={row.status} color={statusColor(row.status)} /></TableCell><TableCell align="right">{energy(row.energyDelivered)}</TableCell><TableCell align="right">{money(row.amount)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4}><EmptyState title="No charging activity" description="Sessions will appear here when this driver charges." /></TableCell></TableRow>}</TableBody></Table></TableContainer></SectionCard></Grid><Grid item xs={12} lg={5}><SectionCard title="Recent company funding" description="Transfers from the company wallet"><List dense>{overviewRows.funding.length ? overviewRows.funding.map(row => <ListItem key={row.id} divider><ListItemText primary={money(row.amount)} secondary={`${row.method || 'company transfer'} · ${dateTime(row.createdAt)}`} /><Chip size="small" label={row.status} color={statusColor(row.status)} /></ListItem>) : <EmptyState title="No funding activity" description="Company allowances will appear here." />}</List></SectionCard></Grid></Grid> : <SectionCard title={activityTitle(activityTab)} description="Paginated activity for this driver" contentSx={{ p: 0 }}>{activityLoading && <LinearProgress />}{activityTab === 'charging' ? <TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 820 }}><TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station</TableCell><TableCell>Status</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">When</TableCell></TableRow></TableHead><TableBody>{renderChargingRows(currentRows)}</TableBody></Table></TableContainer> : <TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 650 }}><TableHead><TableRow>{activityTab === 'funding' ? <><TableCell>Type</TableCell><TableCell>Method / note</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell><TableCell align="right">When</TableCell></> : <><TableCell>Type</TableCell><TableCell>Source / note</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell><TableCell align="right">When</TableCell></>}</TableRow></TableHead><TableBody>{activityTab === 'funding' ? renderFundingRows(currentRows) : renderWalletRows(currentRows)}</TableBody></Table></TableContainer>}<Divider /><TablePagination component="div" count={currentPagination.total || 0} page={Math.max((currentPagination.page || 1) - 1, 0)} onPageChange={changeActivityPage} rowsPerPage={currentPagination.limit || 8} rowsPerPageOptions={[8]} labelRowsPerPage="Rows" /></SectionCard>}</Stack>}</DialogContent></Dialog>
  </Stack>;
}
