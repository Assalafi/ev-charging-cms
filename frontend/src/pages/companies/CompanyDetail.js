import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import {
  AccountBalanceWalletRounded,
  AddRounded,
  ArrowBackRounded,
  AutorenewRounded,
  BoltRounded,
  BusinessRounded,
  CheckCircleOutlineRounded,
  CloseRounded,
  DeleteOutlineRounded,
  EditRounded,
  FilterAltRounded,
  GroupAddRounded,
  HistoryRounded,
  PaymentsRounded,
  PeopleAltRounded,
  PendingRounded,
  RefreshRounded,
  SendRounded,
  TimelineRounded
} from '@mui/icons-material';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import companyService from '../../services/companyService';
import mobileUserService from '../../services/mobileUserService';
import { formatDateTime, todayKey } from '../../utils/timezone';

const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const statusColor = { active: 'success', suspended: 'warning', inactive: 'default', deleted: 'error' };
const blankUser = { name: '', phone: '', email: '', password: '' };
const blankRule = { frequency: 'monthly', amount: '', startDate: todayKey(), endDate: '', mobileUserId: '', notes: '' };

export default function CompanyDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission('companies.update');
  const canSuspend = hasPermission('companies.suspend');
  const canManageUsers = hasPermission('companies.manage_users');
  const canManageWallet = hasPermission('companies.manage_wallet');
  const canManageFunding = hasPermission('companies.manage_funding');
  const [searchParams, setSearchParams] = useSearchParams();
  const paymentReference = searchParams.get('reference') || searchParams.get('trxref');
  const [company, setCompany] = useState(null);
  const [users, setUsers] = useState([]);
  const [userPage, setUserPage] = useState({ page: 1, limit: 20, total: 0 });
  const [transactions, setTransactions] = useState([]);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilters, setActivityFilters] = useState({ range: 'monthly', startDate: '', endDate: '', paymentStatus: '', sessionStatus: '', ledgerStatus: '' });
  const activityFiltersRef = React.useRef(activityFilters);
  const [rules, setRules] = useState([]);
  const [portalUsers, setPortalUsers] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [userSearch, setUserSearch] = useState('');
  const [dialogs, setDialogs] = useState({ fund: false, transfer: false, recover: false, createUser: false, assign: false, rule: false, portalUser: false });
  const [fundForm, setFundForm] = useState({ amount: '', description: '', method: 'offline' });
  const [transferForm, setTransferForm] = useState({ mobileUserId: '', amount: '', description: '' });
  const [recoveryUser, setRecoveryUser] = useState(null);
  const [recoveryForm, setRecoveryForm] = useState({ amount: '', description: '' });
  const [userForm, setUserForm] = useState(blankUser);
  const [ruleForm, setRuleForm] = useState(blankRule);
  const [assignOptions, setAssignOptions] = useState([]);
  const [assignedOptions, setAssignedOptions] = useState([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [portalForm, setPortalForm] = useState({ name: '', email: '', phone: '', password: '', role: 'owner' });

  const loadCompany = useCallback(async () => {
    const result = await companyService.get(id);
    setCompany(result.company);
    setRules(result.company?.fundingRules || []);
  }, [id]);

  const loadUsers = useCallback(async () => {
    const result = await companyService.users(id, { page: userPage.page, limit: userPage.limit, search: userSearch });
    setUsers(result.users || []);
    setUserPage(current => result.pagination || current);
  }, [id, userPage.page, userPage.limit, userSearch]);

  const loadTransactions = useCallback(async () => {
    const result = await companyService.transactions(id, { page: 1, limit: 30 });
    setTransactions(result.transactions || []);
  }, [id]);
  useEffect(() => { activityFiltersRef.current = activityFilters; }, [activityFilters]);
  const loadActivity = useCallback(async (filters = activityFiltersRef.current) => {
    setActivityLoading(true);
    try {
      const result = await companyService.activity(id, { ...filters, limit: 8, page: 1 });
      setActivity(result);
      return result;
    } catch (error) {
      setNotice({ type: 'error', text: error.serverMessage || error.message || 'Failed to refresh company activity' });
      throw error;
    } finally {
      setActivityLoading(false);
    }
  }, [id]);
  const loadPortalUsers = useCallback(async () => {
    const result = await companyService.portalUsers(id);
    setPortalUsers(result.users || []);
  }, [id]);

  const load = useCallback(async () => {
    setLoading(true);
    try { await Promise.all([loadCompany(), loadUsers(), loadTransactions(), loadPortalUsers(), loadActivity()]); setNotice({ type: '', text: '' }); }
    catch (err) { setNotice({ type: 'error', text: err.serverMessage || err.message || 'Failed to load company workspace' }); }
    finally { setLoading(false); }
  }, [loadCompany, loadUsers, loadTransactions, loadPortalUsers, loadActivity]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 3) companyService.rules(id).then(result => setRules(result.rules || [])).catch(() => {}); }, [id, tab]);
  useEffect(() => {
    if (!paymentReference) return undefined;
    let cancelled = false;
    companyService.verifyPaystackFunding(id, paymentReference)
      .then(() => {
        if (!cancelled) {
          setNotice({ type: 'success', text: 'Company wallet payment verified and applied.' });
          loadCompany();
          loadTransactions();
          loadActivity();
        }
      })
      .catch(error => {
        if (!cancelled) setNotice({ type: 'error', text: error.serverMessage || error.message || 'Unable to verify company wallet payment' });
      })
      .finally(() => {
        if (!cancelled) setSearchParams({}, { replace: true });
      });
    return () => { cancelled = true; };
  }, [id, loadActivity, loadCompany, loadTransactions, paymentReference, setSearchParams]);

  const action = async (callback, successMessage) => {
    setBusy(true);
    try { await callback(); setNotice({ type: 'success', text: successMessage }); await loadCompany(); await loadUsers(); await loadTransactions(); await loadActivity(); return true; }
    catch (err) { setNotice({ type: 'error', text: err.serverMessage || err.message || 'Action failed' }); return false; }
    finally { setBusy(false); }
  };

  const openAssign = async () => {
    setAssignLoading(true);
    try {
      const pageSize = 100;
      const firstPage = await mobileUserService.getMobileUsers(1, pageSize, '');
      const firstData = firstPage.data || {};
      const totalPages = Math.max(1, Number(firstData.pagination?.totalPages || firstData.pagination?.pages || 1));
      const remainingPages = [];
      for (let startPage = 2; startPage <= totalPages; startPage += 5) {
        const pageNumbers = Array.from({ length: Math.min(5, totalPages - startPage + 1) }, (_, index) => startPage + index);
        const batch = await Promise.all(pageNumbers.map(page => mobileUserService.getMobileUsers(page, pageSize, '')));
        remainingPages.push(...batch);
      }
      const allUsers = [firstData.users || [], ...remainingPages.map(result => result.data?.users || [])].flat();
      const available = allUsers.filter(user => !user.companyId && !user.company?.id && user.status !== 'deleted');
      setAssignOptions(available);
      setAssignedOptions([]);
      setDialogs(previous => ({ ...previous, assign: true }));
    } catch (err) { setNotice({ type: 'error', text: err.serverMessage || err.message || 'Failed to load available users' }); }
    finally { setAssignLoading(false); }
  };

  const close = key => setDialogs(previous => ({ ...previous, [key]: false }));

  const submitFund = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      if (fundForm.method === 'paystack') {
        if (!company.email) throw new Error('Add a company email before using gateway funding');
        const result = await companyService.initializePaystackFunding(id, {
          amount: fundForm.amount,
          description: fundForm.description,
          email: company.email,
          callbackUrl: `${window.location.origin}${window.location.pathname}`
        });
        if (!result.authorization_url) throw new Error('Payment gateway did not return an authorization link');
        window.location.assign(result.authorization_url);
        return;
      }
      const succeeded = await action(() => companyService.fundWallet(id, { amount: fundForm.amount, description: fundForm.description, method: 'offline' }), 'Company wallet funded');
      if (succeeded) { setFundForm({ amount: '', description: '', method: 'offline' }); close('fund'); }
    } catch (err) {
      setNotice({ type: 'error', text: err.serverMessage || err.message || 'Unable to initialize company wallet funding' });
    } finally { setBusy(false); }
  };
  const submitTransfer = async event => { event.preventDefault(); if (await action(() => companyService.transferToUser(id, transferForm), 'User wallet funded from company wallet')) { setTransferForm({ mobileUserId: '', amount: '', description: '' }); close('transfer'); } };
  const submitRecovery = async event => { event.preventDefault(); if (await action(() => companyService.recoverFromUser(id, { mobileUserId: recoveryUser?.id, amount: recoveryForm.amount, description: recoveryForm.description }), 'Funds recovered from user wallet')) { setRecoveryForm({ amount: '', description: '' }); setRecoveryUser(null); close('recover'); } };
  const submitUser = async event => { event.preventDefault(); if (await action(() => companyService.createUser(id, userForm), 'Company mobile user created')) { setUserForm(blankUser); close('createUser'); } };
  const submitAssign = async event => { event.preventDefault(); if (!assignedOptions.length) return; if (await action(() => companyService.assignUsers(id, assignedOptions.map(user => user.id)), 'Mobile users assigned to company')) close('assign'); };
  const submitRule = async event => { event.preventDefault(); if (await action(() => companyService.createRule(id, { ...ruleForm, amount: Number(ruleForm.amount), mobileUserId: ruleForm.mobileUserId || null, endDate: ruleForm.endDate || null }), 'Funding rule created')) { setRuleForm(blankRule); close('rule'); } };
  const submitPortalUser = async event => { event.preventDefault(); if (await action(() => companyService.createPortalUser(id, portalForm), 'Company portal account created')) { setPortalForm({ name: '', email: '', phone: '', password: '', role: 'owner' }); close('portalUser'); await loadPortalUsers(); } };

  const companyUsers = useMemo(() => users.filter(user => user.status !== 'deleted'), [users]);

  if (loading && !company) return <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!company) return <Alert severity="error">Company could not be found.</Alert>;

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      {notice.text && <Alert severity={notice.type || 'info'} onClose={() => setNotice({ type: '', text: '' })}>{notice.text}</Alert>}

      <Paper sx={{ borderRadius: { xs: 3, md: 4 }, overflow: 'hidden', boxShadow: '0 18px 45px rgba(15, 61, 112, .15)' }}>
        <Box sx={{ position: 'relative', overflow: 'hidden', p: { xs: 2, sm: 2.75, md: 3.5 }, background: theme => `linear-gradient(125deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main} 58%, #0b8f78)`, color: 'primary.contrastText' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between"><Stack direction="row" spacing={1.25} alignItems="center"><IconButton onClick={() => navigate('/companies')} aria-label="Back to companies" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.12)', '&:hover': { bgcolor: 'rgba(255,255,255,.2)' } }}><ArrowBackRounded /></IconButton><Box sx={{ width: 54, height: 54, borderRadius: 3, bgcolor: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center' }}><BusinessRounded fontSize="large" /></Box><Box><Typography variant="overline" sx={{ letterSpacing: 1.2, opacity: .72, fontWeight: 800 }}>Company workspace</Typography><Typography variant="h5" fontWeight={850}>{company.name}</Typography><Typography sx={{ opacity: .82 }}>{[company.city, company.state, company.country].filter(Boolean).join(', ') || 'Address not provided'}</Typography></Box></Stack><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Chip label={company.status || 'unknown'} sx={{ bgcolor: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)', color: 'white', fontWeight: 800, textTransform: 'capitalize' }} /><IconButton onClick={load} disabled={busy || loading} aria-label="Refresh company" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.12)', '&:hover': { bgcolor: 'rgba(255,255,255,.2)' } }}><RefreshRounded /></IconButton>{canUpdate && <Button variant="outlined" startIcon={<EditRounded />} onClick={() => navigate(`/companies/${id}/edit`)} sx={{ color: 'white', borderColor: 'rgba(255,255,255,.4)' }}>Edit</Button>}{canManageWallet && <Button variant="contained" startIcon={<AccountBalanceWalletRounded />} onClick={() => setDialogs(previous => ({ ...previous, fund: true }))} sx={{ bgcolor: 'white', color: 'primary.dark', '&:hover': { bgcolor: 'grey.100' } }}>Fund wallet</Button>}</Stack></Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}><HeroStat label="Wallet" value={money(company.walletBalance)} /><HeroStat label="Active users" value={company.stats?.activeUsers || 0} /><HeroStat label="Tariff" value={Number(company.pricePerWh) > 0 ? `${money(Number(company.pricePerWh) * 1000)}/kWh` : 'Location rate'} /><HeroStat label="Contact" value={company.email || company.phone || 'Not provided'} /></Stack>
        </Box>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: { xs: .5, sm: 1.5 }, minHeight: 62, '& .MuiTab-root': { minHeight: 62, minWidth: 'auto', mr: { xs: .5, sm: 1.5 }, fontWeight: 750, textTransform: 'none' } }}><Tab icon={<TimelineRounded />} iconPosition="start" label="Overview" /><Tab icon={<PeopleAltRounded />} iconPosition="start" label={`Users (${company.userCount || company.mobileUsers?.length || 0})`} /><Tab icon={<AccountBalanceWalletRounded />} iconPosition="start" label="Wallet" /><Tab icon={<AutorenewRounded />} iconPosition="start" label="Auto funding" /><Tab icon={<BusinessRounded />} iconPosition="start" label="Portal access" /></Tabs>
      </Paper>

      {tab === 0 && <Overview company={company} activity={activity} activityLoading={activityLoading} activityFilters={activityFilters} setActivityFilters={setActivityFilters} onActivityRefresh={() => loadActivity().catch(() => null)} canSuspend={canSuspend} onStatus={status => action(() => companyService.setStatus(id, status), `Company marked ${status}`)} />}
      {tab === 1 && <UsersTab users={companyUsers} page={userPage} search={userSearch} canManage={canManageUsers} setSearch={value => { setUserSearch(value); setUserPage(previous => ({ ...previous, page: 1 })); }} onPage={page => setUserPage(previous => ({ ...previous, page }))} onCreate={() => setDialogs(previous => ({ ...previous, createUser: true }))} onAssign={openAssign} onTransfer={user => { setTransferForm({ mobileUserId: user.id, amount: '', description: '' }); setDialogs(previous => ({ ...previous, transfer: true })); }} onRecover={user => { setRecoveryUser(user); setRecoveryForm({ amount: '', description: '' }); setDialogs(previous => ({ ...previous, recover: true })); }} onStatus={(user, status) => action(() => companyService.setUserStatus(id, user.id, status), `User ${status}`)} onUnassign={user => action(() => companyService.unassignUser(id, user.id), 'User unassigned')} />}
      {tab === 2 && <WalletTab company={company} transactions={transactions} canManage={canManageWallet} onFund={() => setDialogs(previous => ({ ...previous, fund: true }))} onTransfer={() => setDialogs(previous => ({ ...previous, transfer: true }))} onVerify={reference => action(() => companyService.verifyPaystackFunding(id, reference), 'Paystack payment status refreshed')} />}
      {tab === 3 && <RulesTab rules={rules} users={companyUsers} canManage={canManageFunding} onCreate={() => setDialogs(previous => ({ ...previous, rule: true }))} onDisable={rule => action(() => companyService.disableRule(id, rule.id), 'Funding rule disabled')} />}
      {tab === 4 && <PortalUsersTab users={portalUsers} canManage={canManageUsers} onCreate={() => setDialogs(previous => ({ ...previous, portalUser: true }))} onStatus={(portalUser, status) => action(() => companyService.updatePortalUser(id, portalUser.id, { status }), `Portal account ${status}`)} onDelete={portalUser => action(() => companyService.deletePortalUser(id, portalUser.id), 'Portal account removed')} />}

      <Dialog open={dialogs.fund} onClose={() => close('fund')} fullWidth maxWidth="sm"><form onSubmit={submitFund}><DialogTitle>Fund company wallet</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>Funding method</InputLabel><Select label="Funding method" value={fundForm.method} onChange={event => setFundForm(previous => ({ ...previous, method: event.target.value }))}><MenuItem value="offline">Offline / admin credit</MenuItem><MenuItem value="paystack">Paystack gateway</MenuItem></Select></FormControl><TextField required autoFocus type="number" inputProps={{ min: 1, step: '0.01' }} label="Amount (₦)" value={fundForm.amount} onChange={event => setFundForm(previous => ({ ...previous, amount: event.target.value }))} />{fundForm.method === 'paystack' && <TextField disabled label="Payment email" value={company.email || 'Add an email to the company profile'} helperText="The payment provider uses the company email for this transaction." />}<TextField multiline minRows={2} label="Reference / description" value={fundForm.description} onChange={event => setFundForm(previous => ({ ...previous, description: event.target.value }))} helperText={fundForm.method === 'paystack' ? 'You will be redirected to Paystack, then returned here for verification.' : 'This admin action is recorded as an offline credit.'} /></Stack></DialogContent><DialogActions><Button onClick={() => close('fund')}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>{fundForm.method === 'paystack' ? 'Continue to Paystack' : 'Add funds'}</Button></DialogActions></form></Dialog>

      <Dialog open={dialogs.transfer} onClose={() => close('transfer')} fullWidth maxWidth="sm"><form onSubmit={submitTransfer}><DialogTitle>Fund a mobile user</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth required><InputLabel>Mobile user</InputLabel><Select label="Mobile user" value={transferForm.mobileUserId} onChange={event => setTransferForm(previous => ({ ...previous, mobileUserId: event.target.value }))}><MenuItem value=""><em>Select user</em></MenuItem>{companyUsers.map(user => <MenuItem key={user.id} value={user.id}>{user.name} · {user.email}</MenuItem>)}</Select></FormControl><TextField required type="number" inputProps={{ min: 1, step: '0.01' }} label="Amount (₦)" value={transferForm.amount} onChange={event => setTransferForm(previous => ({ ...previous, amount: event.target.value }))} /><TextField label="Description" value={transferForm.description} onChange={event => setTransferForm(previous => ({ ...previous, description: event.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => close('transfer')}>Cancel</Button><Button type="submit" variant="contained" startIcon={<SendRounded />} disabled={busy}>Fund user</Button></DialogActions></form></Dialog>
      <Dialog open={dialogs.recover} onClose={() => close('recover')} fullWidth maxWidth="sm"><form onSubmit={submitRecovery}><DialogTitle>Recover funds from {recoveryUser?.name}</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><Alert severity="warning">Available user balance: {money(recoveryUser?.wallet?.balance)}. The server will reject any amount above this balance.</Alert><TextField required type="number" inputProps={{ min: 0.01, max: Number(recoveryUser?.wallet?.balance || 0), step: '0.01' }} label="Amount (₦)" value={recoveryForm.amount} onChange={event => setRecoveryForm(previous => ({ ...previous, amount: event.target.value }))} autoFocus /><TextField label="Reason (optional)" value={recoveryForm.description} onChange={event => setRecoveryForm(previous => ({ ...previous, description: event.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => close('recover')}>Cancel</Button><Button type="submit" variant="contained" color="warning" disabled={busy || !recoveryUser || Number(recoveryForm.amount) <= 0 || Number(recoveryForm.amount) > Number(recoveryUser?.wallet?.balance || 0)}>Recover funds</Button></DialogActions></form></Dialog>

      <Dialog open={dialogs.createUser} onClose={() => close('createUser')} fullWidth maxWidth="sm"><form onSubmit={submitUser}><DialogTitle>Create company mobile user</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><TextField required label="Full name" value={userForm.name} onChange={event => setUserForm(previous => ({ ...previous, name: event.target.value }))} /><TextField required label="Phone" value={userForm.phone} onChange={event => setUserForm(previous => ({ ...previous, phone: event.target.value }))} /><TextField required type="email" label="Email" value={userForm.email} onChange={event => setUserForm(previous => ({ ...previous, email: event.target.value }))} /><TextField required type="password" label="Temporary password" value={userForm.password} onChange={event => setUserForm(previous => ({ ...previous, password: event.target.value }))} helperText="Minimum 6 characters" /></Stack></DialogContent><DialogActions><Button onClick={() => close('createUser')}>Cancel</Button><Button type="submit" variant="contained" disabled={busy}>Create user</Button></DialogActions></form></Dialog>

      <Dialog open={dialogs.assign} onClose={() => close('assign')} fullWidth maxWidth="md"><form onSubmit={submitAssign}><DialogTitle sx={{ pb: 1 }}>Assign existing mobile users</DialogTitle><DialogContent dividers><Stack spacing={1.5} sx={{ pt: .5 }}><Typography variant="body2" color="text.secondary">Choose unassigned mobile accounts to add to <strong>{company.name}</strong>. Existing company assignments are excluded automatically.</Typography>{assignLoading ? <Box sx={{ minHeight: 170, display: 'grid', placeItems: 'center' }}><Stack alignItems="center" spacing={1}><CircularProgress size={28} /><Typography variant="body2" color="text.secondary">Loading all available mobile users…</Typography></Stack></Box> : assignOptions.length === 0 ? <Alert severity="info">There are no unassigned mobile users available.</Alert> : <Autocomplete multiple fullWidth disableCloseOnSelect filterSelectedOptions limitTags={3} options={assignOptions} value={assignedOptions} onChange={(_, value) => setAssignedOptions(value)} getOptionLabel={option => `${option.name || 'Unnamed user'} · ${option.email || option.phone || 'No contact'}`} isOptionEqualToValue={(a, b) => a.id === b.id} renderOption={(props, option) => <Box component="li" {...props} key={option.id}><Box sx={{ minWidth: 0 }}><Typography fontWeight={700}>{option.name || 'Unnamed user'}</Typography><Typography variant="caption" color="text.secondary">{option.email || option.phone || 'No contact details'}{option.tagId ? ` · ${option.tagId}` : ''}</Typography></Box></Box>} renderInput={params => <TextField {...params} label={`Available mobile users (${assignOptions.length})`} placeholder="Search by name, email, phone or tag" helperText={assignedOptions.length ? `${assignedOptions.length} user${assignedOptions.length === 1 ? '' : 's'} selected` : 'Select one or more users'} />} />}</Stack></DialogContent><DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => close('assign')} disabled={assignLoading}>Cancel</Button><Button type="submit" variant="contained" startIcon={<GroupAddRounded />} disabled={busy || assignLoading || !assignedOptions.length}>Assign {assignedOptions.length || ''} user{assignedOptions.length === 1 ? '' : 's'}</Button></DialogActions></form></Dialog>

      <Dialog open={dialogs.rule} onClose={() => close('rule')} fullWidth maxWidth="sm"><form onSubmit={submitRule}><DialogTitle>Create automatic funding rule</DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}><FormControl fullWidth><InputLabel>Frequency</InputLabel><Select label="Frequency" value={ruleForm.frequency} onChange={event => setRuleForm(previous => ({ ...previous, frequency: event.target.value }))}><MenuItem value="daily">Daily</MenuItem><MenuItem value="weekly">Weekly</MenuItem><MenuItem value="monthly">Monthly</MenuItem><MenuItem value="yearly">Yearly</MenuItem></Select></FormControl><TextField required type="number" inputProps={{ min: 1, step: '0.01' }} label="Amount per run (₦)" value={ruleForm.amount} onChange={event => setRuleForm(previous => ({ ...previous, amount: event.target.value }))} /><FormControl fullWidth><InputLabel>Applies to</InputLabel><Select label="Applies to" value={ruleForm.mobileUserId} onChange={event => setRuleForm(previous => ({ ...previous, mobileUserId: event.target.value }))}><MenuItem value="">All active company users</MenuItem>{companyUsers.map(user => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}</Select></FormControl><TextField required type="date" label="Start date" InputLabelProps={{ shrink: true }} value={ruleForm.startDate} onChange={event => setRuleForm(previous => ({ ...previous, startDate: event.target.value }))} /><TextField type="date" label="End date (optional)" InputLabelProps={{ shrink: true }} value={ruleForm.endDate} onChange={event => setRuleForm(previous => ({ ...previous, endDate: event.target.value }))} /><TextField label="Notes" value={ruleForm.notes} onChange={event => setRuleForm(previous => ({ ...previous, notes: event.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => close('rule')}>Cancel</Button><Button type="submit" variant="contained" startIcon={<AutorenewRounded />} disabled={busy}>Create rule</Button></DialogActions></form></Dialog>
      <Dialog open={dialogs.portalUser} onClose={() => close('portalUser')} fullWidth maxWidth="sm"><form onSubmit={submitPortalUser}><DialogTitle>Create company portal account</DialogTitle><DialogContent dividers><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>This account signs in at <strong>/company/login</strong>. It is separate from mobile users, partners and admin users.</Typography><Stack spacing={2}><TextField required label="Full name" value={portalForm.name} onChange={event => setPortalForm(previous => ({ ...previous, name: event.target.value }))} /><TextField required type="email" label="Work email" value={portalForm.email} onChange={event => setPortalForm(previous => ({ ...previous, email: event.target.value }))} /><TextField label="Phone" value={portalForm.phone} onChange={event => setPortalForm(previous => ({ ...previous, phone: event.target.value }))} /><FormControl fullWidth><InputLabel>Portal role</InputLabel><Select label="Portal role" value={portalForm.role} onChange={event => setPortalForm(previous => ({ ...previous, role: event.target.value }))}><MenuItem value="owner">Owner · full company controls</MenuItem><MenuItem value="manager">Manager · users, wallet and funding</MenuItem><MenuItem value="viewer">Viewer · read-only</MenuItem></Select></FormControl><TextField required type="password" label="Temporary password" helperText="Minimum 8 characters" value={portalForm.password} onChange={event => setPortalForm(previous => ({ ...previous, password: event.target.value }))} /></Stack></DialogContent><DialogActions><Button onClick={() => close('portalUser')}>Cancel</Button><Button type="submit" variant="contained" disabled={busy || portalForm.password.length < 8}>Create account</Button></DialogActions></form></Dialog>
    </Stack>
  );
}

function HeroStat({ label, value }) {
  return <Box sx={{ minWidth: { xs: 'calc(50% - 4px)', sm: 'auto' }, flex: { sm: 1 }, px: 1.25, py: 1, borderRadius: 2.25, bgcolor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.14)' }}><Typography variant="caption" sx={{ display: 'block', opacity: .7, fontWeight: 700 }}>{label}</Typography><Typography variant="body2" fontWeight={800} noWrap>{value}</Typography></Box>;
}

function BillingPolicy({ company }) {
  const hasTariff = Number(company.pricePerWh) > 0;
  const debt = Number(company.debtOutstanding || 0);
  return <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Typography variant="h6" fontWeight={800}>Billing policy</Typography><Typography color="text.secondary">Drivers use this company tariff while charging at any station.</Typography></Box><Chip size="small" color={company.debtEnabled ? 'warning' : 'default'} label={company.debtEnabled ? 'Debt funding enabled' : 'Debt funding disabled'} /></Stack><Divider sx={{ my: 2 }} /><Grid container spacing={2}><Grid item xs={12} sm={4}><Typography variant="caption" color="text.secondary">Charging price</Typography><Typography fontWeight={800}>{hasTariff ? `${money(Number(company.pricePerWh) * 1000)} / kWh` : 'Location tariff'}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="caption" color="text.secondary">Minimum charge</Typography><Typography fontWeight={800}>{company.minimumCharge !== null && company.minimumCharge !== undefined ? money(company.minimumCharge) : 'Location minimum'}</Typography></Grid><Grid item xs={12} sm={4}><Typography variant="caption" color="text.secondary">Debt outstanding</Typography><Typography fontWeight={800} color={debt > 0 ? 'warning.main' : 'text.primary'}>{money(debt)}</Typography></Grid></Grid></CardContent></Card>;
}

function Overview({ company, activity, activityLoading, activityFilters, setActivityFilters, onActivityRefresh, canSuspend, onStatus }) {
  const stats = company.stats || {};
  const applyActivityFilters = () => onActivityRefresh();
  const updateFilter = (key, value) => setActivityFilters(current => ({ ...current, [key]: value }));
  const resetFilters = () => {
    setActivityFilters({ range: 'monthly', startDate: '', endDate: '', paymentStatus: '', sessionStatus: '', ledgerStatus: '' });
    setTimeout(onActivityRefresh, 0);
  };
  return <Stack spacing={2.5}>
    <BillingPolicy company={company} />
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      <Metric icon={<AccountBalanceWalletRounded />} label="Wallet balance" value={money(company.walletBalance)} color="#2563EB" />
      <Metric icon={<PeopleAltRounded />} label="Active users" value={stats.activeUsers || 0} color="#059669" />
      <Metric icon={<SendRounded />} label="User funding" value={money(stats.totalUserFunding)} color="#7C3AED" />
      <Metric icon={<AutorenewRounded />} label="Active rules" value={stats.activeRules || 0} color="#D97706" />
    </Box>
    <ActivityFilters filters={activityFilters} onChange={updateFilter} onApply={applyActivityFilters} onReset={resetFilters} loading={activityLoading} />
    <ActivityOverview activity={activity} loading={activityLoading} />
    <Card variant="outlined" sx={{ borderRadius: 3.5 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box><Typography variant="h6" fontWeight={800}>Company controls</Typography><Typography color="text.secondary">Suspending a company immediately blocks its users from mobile authentication and charging.</Typography></Box>
          {canSuspend && <Stack direction="row" spacing={1}><Button size="small" color="warning" variant={company.status === 'suspended' ? 'contained' : 'outlined'} onClick={() => onStatus(company.status === 'suspended' ? 'active' : 'suspended')}>{company.status === 'suspended' ? 'Reactivate' : 'Suspend'}</Button><Button size="small" color="inherit" variant="outlined" onClick={() => onStatus(company.status === 'inactive' ? 'active' : 'inactive')}>{company.status === 'inactive' ? 'Activate' : 'Archive'}</Button></Stack>}
        </Stack>
        <Divider sx={{ my: 2 }} />
        <Grid container spacing={2}><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Contact</Typography><Typography fontWeight={700}>{company.email || 'No email'}</Typography><Typography color="text.secondary">{company.phone || 'No phone'}</Typography></Grid><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">Address</Typography><Typography fontWeight={700}>{company.address || 'No address provided'}</Typography><Typography color="text.secondary">{[company.city, company.state, company.country].filter(Boolean).join(', ')}</Typography></Grid></Grid>
      </CardContent>
    </Card>
  </Stack>;
}

const energyDisplay = value => {
  const kwh = Number(value || 0) / 1000;
  return `${kwh >= 1000 ? (kwh / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' MWh' : kwh.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' kWh'}`;
};

function ActivityFilters({ filters, onChange, onApply, onReset, loading }) {
  return <Card variant="outlined" sx={{ borderRadius: 3.5, background: 'linear-gradient(180deg, rgba(37,99,235,.045), transparent)' }}>
    <CardContent sx={{ pb: '16px !important' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} gap={1.5} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center"><Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}><FilterAltRounded fontSize="small" /></Box><Box><Typography variant="h6" fontWeight={800}>Activity explorer</Typography><Typography variant="body2" color="text.secondary">Review charging, payments and company wallet movement by West Africa time.</Typography></Box></Stack>
        <Stack direction="row" spacing={1}><Button size="small" onClick={onReset}>Reset</Button><Button size="small" variant="contained" startIcon={<RefreshRounded />} onClick={onApply} disabled={loading || (filters.range === 'custom' && (!filters.startDate || !filters.endDate))}>{loading ? 'Refreshing…' : 'Apply filters'}</Button></Stack>
      </Stack>
      <Grid container spacing={1.5}>
        <Grid item xs={12} sm={6} md={filters.range === 'custom' ? 2 : 3}><FormControl fullWidth size="small"><InputLabel>Period</InputLabel><Select label="Period" value={filters.range} onChange={event => onChange('range', event.target.value)}><MenuItem value="daily">Today</MenuItem><MenuItem value="weekly">This week</MenuItem><MenuItem value="monthly">This month</MenuItem><MenuItem value="yearly">This year</MenuItem><MenuItem value="custom">Custom dates</MenuItem></Select></FormControl></Grid>
        {filters.range === 'custom' && <><Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={filters.startDate} onChange={event => onChange('startDate', event.target.value)} /></Grid><Grid item xs={12} sm={6} md={2}><TextField fullWidth size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={filters.endDate} onChange={event => onChange('endDate', event.target.value)} /></Grid></>}
        <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Payment status</InputLabel><Select label="Payment status" value={filters.paymentStatus} onChange={event => onChange('paymentStatus', event.target.value)}><MenuItem value="">All payments</MenuItem><MenuItem value="SUCCESS">Successful</MenuItem><MenuItem value="PENDING">Pending</MenuItem><MenuItem value="FAILED">Failed</MenuItem><MenuItem value="REVERSED">Reversed</MenuItem></Select></FormControl></Grid>
        <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Session status</InputLabel><Select label="Session status" value={filters.sessionStatus} onChange={event => onChange('sessionStatus', event.target.value)}><MenuItem value="">All sessions</MenuItem><MenuItem value="InProgress">In progress</MenuItem><MenuItem value="Completed">Completed</MenuItem><MenuItem value="Stopped">Stopped</MenuItem></Select></FormControl></Grid>
        <Grid item xs={12} sm={6} md={3}><FormControl fullWidth size="small"><InputLabel>Ledger status</InputLabel><Select label="Ledger status" value={filters.ledgerStatus} onChange={event => onChange('ledgerStatus', event.target.value)}><MenuItem value="">All wallet activity</MenuItem><MenuItem value="SUCCESS">Successful</MenuItem><MenuItem value="PENDING">Pending</MenuItem><MenuItem value="FAILED">Failed</MenuItem><MenuItem value="REVERSED">Reversed</MenuItem></Select></FormControl></Grid>
      </Grid>
    </CardContent>
  </Card>;
}

function ActivityOverview({ activity, loading }) {
  if (loading && !activity) return <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}><CircularProgress /></CardContent></Card>;
  if (!activity) return <Alert severity="info">No activity has been loaded for this company yet.</Alert>;
  const selected = activity.summary?.selected || {};
  const periods = activity.summary || {};
  const payments = selected.payments || {};
  const paymentRows = activity.payments || [];
  const walletRows = activity.walletTransactions || [];
  const wallet = selected.wallet || {};
  const sessionRows = activity.sessions || [];
  const paymentStatus = (status) => ({ SUCCESS: 'success', PENDING: 'warning', FAILED: 'error', REVERSED: 'default' }[status] || 'default');
  const periodCards = [{ key: 'today', label: 'Today' }, { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'year', label: 'This year' }, { key: 'lifetime', label: 'Lifetime' }];
  return <Stack spacing={2.5}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }, gap: 1.5 }}>
      <Metric icon={<BoltRounded />} label="Sessions" value={Number(selected.sessions || 0).toLocaleString()} color="#2563EB" />
      <Metric icon={<HistoryRounded />} label="Energy consumed" value={energyDisplay(selected.energyWh)} color="#0891B2" />
      <Metric icon={<PaymentsRounded />} label="Charging value" value={money(selected.chargingValue)} color="#7C3AED" />
      <Metric icon={<AccountBalanceWalletRounded />} label="Wallet debits" value={money(wallet.debits)} color="#059669" />
      <Metric icon={<CheckCircleOutlineRounded />} label="Successful payments" value={money(payments.successfulAmount)} color="#16A34A" />
      <Metric icon={<PendingRounded />} label="Pending payments" value={money(payments.pendingAmount)} color="#D97706" />
    </Box>

    <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography variant="h6" fontWeight={800}>Periodic summary</Typography><Typography variant="body2" color="text.secondary">A quick comparison of this company’s activity across standard periods.</Typography></Box><Chip size="small" color="primary" variant="outlined" label={`${activity.period?.range || 'period'} · ${activity.period?.start ? formatDateTime(activity.period.start, { dateStyle: 'medium', timeStyle: undefined }) : ''}`} /></Stack><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1, mt: 2 }}>{periodCards.map(period => { const data = periods[period.key] || {}; return <Paper key={period.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5, bgcolor: period.key === 'month' ? 'action.hover' : 'transparent' }}><Typography variant="caption" color="text.secondary" fontWeight={750}>{period.label}</Typography><Typography fontWeight={850}>{energyDisplay(data.energyWh)}</Typography><Typography variant="caption" color="text.secondary">{Number(data.sessions || 0).toLocaleString()} sessions · {money(data.chargingValue)}</Typography></Paper>; })}</Box></CardContent></Card>

    <Grid container spacing={2.5}>
      <Grid item xs={12} lg={5}><Card variant="outlined" sx={{ borderRadius: 3.5, height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Box><Typography variant="h6" fontWeight={800}>Payment status</Typography><Typography variant="body2" color="text.secondary">Gateway activity for the selected period.</Typography></Box><Chip size="small" label={`${payments.total || 0} records`} /></Stack><Stack spacing={1}><PaymentStatusRow label="Successful" count={payments.successful} amount={payments.successfulAmount} color="success" /><PaymentStatusRow label="Pending" count={payments.pending} amount={payments.pendingAmount} color="warning" /><PaymentStatusRow label="Failed" count={payments.failed} amount={payments.failedAmount} color="error" /><PaymentStatusRow label="Reversed" count={payments.reversed} amount={payments.reversedAmount} color="default" /></Stack>{paymentRows.length > 0 && <><Divider sx={{ my: 2 }} /><Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Recent payment records</Typography><Stack divider={<Divider />}>{paymentRows.slice(0, 5).map(payment => <Stack key={payment.id} direction="row" spacing={1} alignItems="center" sx={{ py: .9 }}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={750} noWrap>{payment.user?.name || payment.user?.email || 'Mobile user'}</Typography><Typography variant="caption" color="text.secondary" noWrap>{payment.description || payment.gateway || 'Wallet payment'} · {formatDateTime(payment.createdAt)}</Typography></Box><Stack alignItems="flex-end" spacing={.25}><Chip size="small" label={payment.status} color={paymentStatus(payment.status)} /><Typography variant="body2" fontWeight={800}>{money(payment.amount)}</Typography></Stack></Stack>)}</Stack></>}</CardContent></Card></Grid>
      <Grid item xs={12} lg={7}><Card variant="outlined" sx={{ borderRadius: 3.5, height: '100%' }}><CardContent sx={{ pb: '12px !important' }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}><Box><Typography variant="h6" fontWeight={800}>Charging activity</Typography><Typography variant="body2" color="text.secondary">Energy and earnings from this company’s mobile users.</Typography></Box><Chip size="small" label={`${sessionRows.length} shown`} /></Stack>{sessionRows.length === 0 ? <Typography color="text.secondary" sx={{ py: 3 }}>No charging sessions match the selected filters.</Typography> : <TableContainer><Table size="small"><TableHead><TableRow><TableCell>User tag / station</TableCell><TableCell>Status</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Value</TableCell><TableCell align="right">When</TableCell></TableRow></TableHead><TableBody>{sessionRows.map(session => <TableRow key={session.id} hover><TableCell><Typography variant="body2" fontWeight={750}>{session.idTag || 'Unknown tag'}</Typography><Typography variant="caption" color="text.secondary">{session.chargePointId || 'Station unavailable'}</Typography></TableCell><TableCell><Chip size="small" label={session.status} color={session.status === 'InProgress' ? 'primary' : session.status === 'Completed' ? 'success' : 'default'} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{energyDisplay(session.energyDelivered)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{money(session.grossAmount || session.amount)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(session.stopTime || session.startTime)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</CardContent></Card></Grid>
    </Grid>
    <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent sx={{ pb: '12px !important' }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}><Box><Typography variant="h6" fontWeight={800}>Company wallet & funding ledger</Typography><Typography variant="body2" color="text.secondary">Offline credits, Paystack funding and user transfers, including their processing status.</Typography></Box><Stack direction="row" spacing={1}><Chip size="small" color="success" variant="outlined" label={`Credits ${money(wallet.credits)}`} /><Chip size="small" color="warning" variant="outlined" label={`Debits ${money(wallet.debits)}`} /></Stack></Stack>{walletRows.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>No wallet entries match the selected period.</Typography> : <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Activity</TableCell><TableCell>Method / beneficiary</TableCell><TableCell>Status</TableCell><TableCell align="right">Amount</TableCell><TableCell align="right">When</TableCell></TableRow></TableHead><TableBody>{walletRows.map(entry => <TableRow key={entry.id} hover><TableCell><Typography variant="body2" fontWeight={750}>{entry.description || `${entry.type === 'CREDIT' ? 'Wallet credit' : 'User transfer'}`}</Typography><Typography variant="caption" color="text.secondary">{entry.reference || 'No reference'}</Typography></TableCell><TableCell><Typography variant="body2">{entry.method || 'Internal'}</Typography><Typography variant="caption" color="text.secondary">{entry.beneficiary?.name ? `For ${entry.beneficiary.name}` : 'Company wallet'}</Typography></TableCell><TableCell><Chip size="small" label={entry.status} color={paymentStatus(entry.status)} /></TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap', color: entry.type === 'CREDIT' ? 'success.main' : 'warning.main', fontWeight: 800 }}>{entry.type === 'CREDIT' ? '+' : '-'}{money(entry.amount)}</TableCell><TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</TableCell></TableRow>)}</TableBody></Table></TableContainer>}</CardContent></Card>
  </Stack>;
}

function PaymentStatusRow({ label, count, amount, color }) {
  return <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ py: .8, px: 1, borderRadius: 2, bgcolor: 'action.hover' }}><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color={color} label={count || 0} /><Typography variant="body2" fontWeight={700}>{label}</Typography></Stack><Typography variant="body2" fontWeight={800}>{money(amount)}</Typography></Stack>;
}

function UsersTab({ users, page, search, canManage, setSearch, onPage, onCreate, onAssign, onTransfer, onRecover, onStatus, onUnassign }) {
  return <Stack spacing={2.5}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h6" fontWeight={800}>Company mobile users</Typography><Typography color="text.secondary">Create users, assign existing users, control status and move wallet funds safely.</Typography></Box>{canManage && <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<GroupAddRounded />} onClick={onAssign}>Assign existing</Button><Button variant="contained" startIcon={<AddRounded />} onClick={onCreate}>Create user</Button></Stack>}</Stack><TextField size="small" value={search} onChange={event => setSearch(event.target.value)} label="Search users" placeholder="Name, email, phone or tag" /><Card variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>{users.length === 0 ? <EmptyUsers /> : <Stack divider={<Divider />}><Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '2fr 1.5fr 1fr 1.5fr 2fr', px: 2, py: 1.5, bgcolor: 'action.hover' }}><Typography variant="caption" fontWeight={800}>USER</Typography><Typography variant="caption" fontWeight={800}>CONTACT</Typography><Typography variant="caption" fontWeight={800}>STATUS</Typography><Typography variant="caption" fontWeight={800}>BALANCE</Typography><Typography variant="caption" fontWeight={800} textAlign="right">ACTIONS</Typography></Box>{users.map(user => <Box key={user.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1.5fr 1fr 1.5fr 2fr' }, gap: { xs: 1, md: 2 }, alignItems: 'center', px: 2, py: 1.75 }}><Box><Typography fontWeight={750}>{user.name}</Typography><Typography variant="caption" color="text.secondary">{user.tagId || 'No tag'}</Typography></Box><Box><Typography variant="body2">{user.email}</Typography><Typography variant="caption" color="text.secondary">{user.phone}</Typography></Box><Chip size="small" label={user.status} color={statusColor[user.status] || 'default'} sx={{ justifySelf: 'flex-start' }} /><Typography fontWeight={750}>{money(user.wallet?.balance)}</Typography>{canManage && <Stack direction="row" justifyContent={{ xs: 'flex-start', md: 'flex-end' }} spacing={.5} flexWrap="wrap" useFlexGap><Button size="small" startIcon={<SendRounded />} onClick={() => onTransfer(user)}>Fund</Button><Button size="small" color="warning" disabled={Number(user.wallet?.balance || 0) <= 0} onClick={() => onRecover(user)}>Recover</Button><Button size="small" color={user.status === 'active' ? 'warning' : 'success'} onClick={() => onStatus(user, user.status === 'active' ? 'suspended' : 'active')}>{user.status === 'active' ? 'Suspend' : 'Activate'}</Button><IconButton size="small" color="error" onClick={() => onUnassign(user)}><CloseRounded fontSize="small" /></IconButton></Stack>}</Box>)}</Stack>}<TablePager page={page} onPage={onPage} /></Card></Stack>;
}

function WalletTab({ company, transactions, onFund, onTransfer, onVerify }) {
  const ledgerStatusColor = status => ({ SUCCESS: 'success', PENDING: 'warning', FAILED: 'error', REVERSED: 'default' }[status] || 'default');
  const pendingGatewayCount = transactions.filter(tx => String(tx.method || '').toLowerCase() === 'paystack' && tx.status === 'PENDING').length;
  const [verifying, setVerifying] = useState('');
  const verify = async reference => {
    setVerifying(reference);
    try { await onVerify(reference); } finally { setVerifying(''); }
  };
  return <Stack spacing={2.5}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
      <Box><Typography variant="h6" fontWeight={800}>Company wallet</Typography><Typography color="text.secondary">Every offline credit, Paystack attempt and user transfer is retained with its processing status.</Typography></Box>
      <Stack direction="row" spacing={1}><Button variant="outlined" startIcon={<SendRounded />} onClick={onTransfer}>Fund user</Button><Button variant="contained" startIcon={<AddRounded />} onClick={onFund}>Add funds</Button></Stack>
    </Stack>
    <Card variant="outlined" sx={{ borderRadius: 3.5, background: 'linear-gradient(135deg, #0F3D70, #2563EB)', color: 'white' }}>
      <CardContent><Typography sx={{ opacity: .75 }}>Available company balance</Typography><Typography variant="h3" fontWeight={850} sx={{ mt: .5 }}>{money(company.walletBalance)}</Typography><Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}><Chip size="small" label={`${money(company.debtOutstanding)} debt outstanding`} sx={{ color: 'white', bgcolor: company.debtOutstanding > 0 ? 'rgba(245,158,11,.3)' : 'rgba(255,255,255,.12)' }} /><Typography variant="body2" sx={{ opacity: .7, alignSelf: 'center' }}>{company.wallet?.currency || 'NGN'} · {company.stats?.walletTransactions || 0} ledger entries</Typography></Stack></CardContent>
    </Card>
    <Card variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
      <CardContent><Typography variant="h6" fontWeight={800} sx={{ mb: 1.5 }}>Recent wallet activity</Typography>{pendingGatewayCount > 0 && <Alert severity="warning" sx={{ mb: 1.5 }}>There {pendingGatewayCount === 1 ? 'is' : 'are'} {pendingGatewayCount} Paystack funding attempt{pendingGatewayCount === 1 ? '' : 's'} still pending. Pending credits are not added to the balance until Paystack verification succeeds.</Alert>}{transactions.length === 0 ? <Typography color="text.secondary">No wallet activity yet.</Typography> : <Stack divider={<Divider />}>{transactions.map(tx => <Stack key={tx.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} sx={{ py: 1.35 }}><Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: tx.type === 'CREDIT' ? 'success.light' : 'warning.light', color: tx.type === 'CREDIT' ? 'success.dark' : 'warning.dark', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{tx.type === 'CREDIT' ? <AddRounded fontSize="small" /> : <SendRounded fontSize="small" />}</Box><Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Typography fontWeight={700}>{tx.description || tx.method || 'Wallet activity'}</Typography><Chip size="small" label={tx.status || 'SUCCESS'} color={ledgerStatusColor(tx.status)} />{String(tx.method || '').toLowerCase() === 'paystack' && tx.status === 'PENDING' && tx.reference && <Button size="small" variant="outlined" startIcon={<RefreshRounded />} onClick={() => verify(tx.reference)} disabled={Boolean(verifying)}>{verifying === tx.reference ? 'Checking…' : 'Verify'}</Button>}</Stack><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{tx.method || 'Internal'}{tx.beneficiary?.name ? ` · For ${tx.beneficiary.name}` : ''} · {formatDateTime(tx.createdAt)}</Typography>{tx.reference && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}>{tx.reference}</Typography>}</Box><Typography fontWeight={800} color={tx.type === 'CREDIT' ? 'success.main' : 'warning.main'}>{tx.type === 'CREDIT' ? '+' : '-'}{money(tx.amount)}</Typography></Stack>)}</Stack>}</CardContent>
    </Card>
  </Stack>;
}

function RulesTab({ rules, users, onCreate, onDisable }) { return <Stack spacing={2.5}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h6" fontWeight={800}>Automatic funding</Typography><Typography color="text.secondary">Create company-wide or user-specific daily, weekly, monthly or yearly allowances.</Typography></Box><Button variant="contained" startIcon={<AddRounded />} onClick={onCreate}>Create rule</Button></Stack>{rules.length === 0 ? <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack alignItems="center" spacing={1}><AutorenewRounded sx={{ fontSize: 46, color: 'text.disabled' }} /><Typography fontWeight={750}>No funding routines configured</Typography><Typography color="text.secondary">The scheduler will run active rules automatically when their next run is due.</Typography></Stack></CardContent></Card> : <Stack spacing={1.25}>{rules.map(rule => <Card key={rule.id} variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}><Box sx={{ flex: 1 }}><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={rule.active ? 'Active' : 'Disabled'} color={rule.active ? 'success' : 'default'} /><Typography fontWeight={800}>{money(rule.amount)} · {rule.frequency}</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .75 }}>{rule.mobileUser?.name || 'All active company users'} · Next run {new Date(rule.nextRunAt).toLocaleString()}</Typography>{rule.notes && <Typography variant="caption" color="text.secondary">{rule.notes}</Typography>}</Box>{rule.active && <Button color="error" size="small" startIcon={<DeleteOutlineRounded />} onClick={() => onDisable(rule)}>Disable</Button>}</Stack></CardContent></Card>)}</Stack>}</Stack>; }

function PortalUsersTab({ users, canManage, onCreate, onStatus, onDelete }) {
  return <Stack spacing={2.5}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}><Box><Typography variant="h6" fontWeight={800}>Company portal access</Typography><Typography color="text.secondary">These accounts sign in to the company workspace and are separate from mobile users.</Typography></Box>{canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={onCreate}>Create portal account</Button>}</Stack>{users.length === 0 ? <Card variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack alignItems="center" spacing={1} sx={{ py: 3 }}><BusinessRounded sx={{ fontSize: 46, color: 'text.disabled' }} /><Typography fontWeight={750}>No portal accounts yet</Typography><Typography color="text.secondary">Create an owner account to let the company sign in at /company/login.</Typography></Stack></CardContent></Card> : <Stack spacing={1.25}>{users.map(user => <Card key={user.id} variant="outlined" sx={{ borderRadius: 3.5 }}><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={2}><Box sx={{ flex: 1, minWidth: 0 }}><Stack direction="row" gap={1} alignItems="center"><Typography fontWeight={800}>{user.name}</Typography><Chip size="small" label={user.role} color={user.role === 'owner' ? 'primary' : 'default'} /></Stack><Typography variant="body2" color="text.secondary">{user.email}{user.phone ? ` · ${user.phone}` : ''}</Typography><Typography variant="caption" color="text.secondary">Last sign in: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Not yet signed in'}</Typography></Box><Chip size="small" label={user.status} color={user.status === 'active' ? 'success' : 'warning'} />{canManage && <Stack direction="row" gap={1}><Button size="small" color={user.status === 'active' ? 'warning' : 'success'} onClick={() => onStatus(user, user.status === 'active' ? 'suspended' : 'active')}>{user.status === 'active' ? 'Suspend' : 'Activate'}</Button><Button size="small" color="error" onClick={() => onDelete(user)}>Remove</Button></Stack>}</Stack></CardContent></Card>)}</Stack>}</Stack>;
}

function Metric({ icon, label, value, color }) { return <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3 }}><Stack direction="row" spacing={1.25} alignItems="center"><Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: `${color}14`, color, display: 'grid', placeItems: 'center' }}>{icon}</Box><Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" noWrap>{label}</Typography><Typography fontWeight={850} noWrap>{value}</Typography></Box></Stack></Paper>; }
function TablePager({ page, onPage }) { return <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ p: 1.5 }}><Button size="small" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>Previous</Button><Chip size="small" label={`Page ${page.page}`} /><Button size="small" disabled={page.page >= page.pages} onClick={() => onPage(page.page + 1)}>Next</Button></Stack>; }
function EmptyUsers() { return <Stack alignItems="center" spacing={1} sx={{ py: 6 }}><PeopleAltRounded sx={{ fontSize: 46, color: 'text.disabled' }} /><Typography fontWeight={750}>No company users</Typography><Typography color="text.secondary">Create a user or assign an existing mobile account.</Typography></Stack>; }
