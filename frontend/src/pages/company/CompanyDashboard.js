import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import {
  AccountBalanceWalletRounded,
  BoltRounded,
  GroupsRounded,
  InsightsRounded,
  LocalOfferRounded,
  RefreshRounded,
  ScheduleRounded,
  ShieldRounded,
  TrendingUpRounded,
  WarningAmberRounded
} from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';

const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const energy = value => { const kwh = Number(value || 0) / 1000; return `${kwh >= 1000 ? `${(kwh / 1000).toFixed(2)} MWh` : `${kwh.toFixed(1)} kWh`}`; };
const dateTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
const rate = value => Number(value) > 0 ? `${money(Number(value) * 1000)}/kWh` : 'Location rate';

function Metric({ label, value, detail, icon, color = '#2563EB' }) {
  return <Card sx={{ height: '100%', borderRadius: 3.5, border: '1px solid', borderColor: 'rgba(15,23,42,.08)', background: color === '#2563EB' ? 'linear-gradient(145deg, #fff 0%, #F5F8FF 100%)' : '#fff' }}><CardContent><Stack direction="row" justifyContent="space-between" gap={2}><Box minWidth={0}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography><Typography variant="h4" sx={{ mt: .7, fontSize: { xs: '1.42rem', sm: '1.7rem' }, letterSpacing: -.5 }}>{value}</Typography>{detail && <Typography variant="caption" color="text.secondary">{detail}</Typography>}</Box><Box sx={{ width: 44, height: 44, borderRadius: 2.75, display: 'grid', placeItems: 'center', bgcolor: color, color: '#fff', flex: '0 0 auto' }}>{icon}</Box></Stack></CardContent></Card>;
}

export function BillingPolicyCard({ company = {}, walletBalance = 0 }) {
  const debt = Math.max(0, -Number(walletBalance || 0));
  const hasCompanyTariff = Number(company.pricePerWh) > 0;
  return <Card sx={{ borderRadius: { xs: 3, md: 4 }, border: '1px solid', borderColor: debt > 0 ? 'warning.light' : 'rgba(15,23,42,.08)', overflow: 'hidden' }}>
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2, background: debt > 0 ? 'linear-gradient(120deg, #FFF7ED, #FFFBEB)' : 'linear-gradient(120deg, #F5F8FF, #F0FDFA)' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
        <Stack direction="row" spacing={1.25} alignItems="center"><Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: debt > 0 ? 'warning.main' : 'primary.main', color: '#fff' }}>{debt > 0 ? <WarningAmberRounded /> : <LocalOfferRounded />}</Box><Box><Typography variant="h6" fontWeight={850}>Billing &amp; credit policy</Typography><Typography variant="body2" color="text.secondary">The rules applied to every company driver while charging.</Typography></Box></Stack>
        <Chip size="small" icon={debt > 0 ? <WarningAmberRounded /> : <ShieldRounded />} color={debt > 0 ? 'warning' : company.debtEnabled ? 'info' : 'default'} label={debt > 0 ? 'Debt outstanding' : company.debtEnabled ? 'Debt funding enabled' : 'Debt funding disabled'} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 800 }} />
      </Stack>
    </Box>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Grid container spacing={1.5}>
        <PolicyValue icon={<LocalOfferRounded />} label="Company charging tariff" value={hasCompanyTariff ? rate(company.pricePerWh) : 'Location rate'} helper={hasCompanyTariff ? `₦${Number(company.pricePerWh).toFixed(4)} per Wh · overrides location pricing` : 'No company-specific tariff configured'} />
        <PolicyValue icon={<BoltRounded />} label="Minimum charge" value={company.minimumCharge !== null && company.minimumCharge !== undefined ? money(company.minimumCharge) : 'Location minimum'} helper="Minimum bill applied when a session uses less energy." />
        <PolicyValue icon={<AccountBalanceWalletRounded />} label="Current wallet" value={money(walletBalance)} helper={debt > 0 ? 'Negative balance is recorded as company debt.' : 'Available for employee funding.'} tone={debt > 0 ? 'warning.main' : 'text.primary'} />
        <PolicyValue icon={<ShieldRounded />} label="Credit policy" value={company.debtEnabled ? 'Debt permitted' : 'Balance required'} helper={company.debtEnabled ? 'Funding may continue beyond the available balance.' : 'Funding stops when the company balance is insufficient.'} tone={company.debtEnabled ? 'info.main' : 'text.primary'} />
      </Grid>
      {debt > 0 && <Alert severity="warning" icon={<WarningAmberRounded />} sx={{ mt: 2, borderRadius: 2.5 }}><strong>{money(debt)} outstanding debt.</strong> Add funds to bring the company wallet back above zero and restore available credit.</Alert>}
    </CardContent>
  </Card>;
}

function PolicyValue({ icon, label, value, helper, tone = 'text.primary' }) {
  return <Grid item xs={12} sm={6}><Box sx={{ height: '100%', p: 1.5, borderRadius: 2.75, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.100' }}><Stack direction="row" spacing={1.1} alignItems="flex-start"><Box sx={{ width: 32, height: 32, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'background.paper', color: 'primary.main', flexShrink: 0 }}>{icon}</Box><Box minWidth={0}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography><Typography fontWeight={850} color={tone} sx={{ mt: .25 }}>{value}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .35, lineHeight: 1.35 }}>{helper}</Typography></Box></Stack></Box></Grid>;
}

export default function CompanyDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);
  const load = useCallback(async () => {
    try { setError(''); const response = await companyPortalService.dashboard(); setData(response.data.dashboard); setUpdated(new Date()); }
    catch (requestError) { setError(requestError.serverMessage || requestError.message || 'Unable to load company dashboard'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load]);
  if (loading && !data) return <Box minHeight="70vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
  if (error && !data) return <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>{error}</Alert>;

  const company = data?.company || {};
  const walletBalance = Number(data?.walletBalance || 0);
  const debt = Math.max(0, -walletBalance);
  const usage = data?.usage || {};
  const users = data?.users || {};
  const funding = data?.funding || {};
  const activeRate = users.total ? Math.round((users.active / users.total) * 100) : 0;

  return <Stack spacing={{ xs: 2, md: 3 }}>
    <Paper sx={{ position: 'relative', overflow: 'hidden', borderRadius: { xs: 3, md: 4 }, p: { xs: 2.25, sm: 3.25 }, color: '#fff', background: 'linear-gradient(125deg, #0F2E61 0%, #2563EB 58%, #0B8F78 100%)', boxShadow: '0 18px 45px rgba(15, 61, 112, .2)' }}>
      <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', right: -110, top: -150, bgcolor: 'rgba(255,255,255,.1)' }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} sx={{ position: 'relative', zIndex: 1 }}><Box><Typography variant="overline" sx={{ letterSpacing: 1.4, opacity: .75, fontWeight: 800 }}>Company workspace</Typography><Typography variant="h3" sx={{ mt: .35, color: '#fff', fontSize: { xs: '1.7rem', sm: '2.3rem' } }}>{company.name || 'Company overview'}</Typography><Typography sx={{ mt: .6, opacity: .82 }}>Charging access, employee funding and account health in one view.</Typography></Box><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" icon={<TrendingUpRounded />} label={updated ? `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.2)' }} /><Button variant="outlined" startIcon={<RefreshRounded />} onClick={load} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.45)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.08)' } }}>Refresh</Button></Stack></Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ position: 'relative', zIndex: 1, mt: 2.5 }}><HeroPill label="Wallet" value={money(walletBalance)} /><HeroPill label="Tariff" value={rate(company.pricePerWh)} /><HeroPill label="Minimum" value={company.minimumCharge !== null && company.minimumCharge !== undefined ? money(company.minimumCharge) : 'Location'} /><HeroPill label="Credit" value={debt > 0 ? `${money(debt)} debt` : company.debtEnabled ? 'Enabled' : 'Disabled'} /></Stack>
    </Paper>
    {error && <Alert severity="warning" onClose={() => setError('')}>{error}</Alert>}
    <Grid container spacing={2}><Grid item xs={12} sm={6} lg={3}><Metric label={debt > 0 ? 'Wallet / debt' : 'Company wallet'} value={money(walletBalance)} detail={debt > 0 ? `${money(debt)} outstanding` : 'Available for employee funding'} icon={<AccountBalanceWalletRounded />} color={debt > 0 ? '#D97706' : '#2563EB'} /></Grid><Grid item xs={12} sm={6} lg={3}><Metric label="Active employees" value={`${users.active || 0} / ${users.total || 0}`} detail={`${activeRate}% currently active`} icon={<GroupsRounded />} color="#0E9F6E" /></Grid><Grid item xs={12} sm={6} lg={3}><Metric label="Today funded" value={money(funding.today?.debits)} detail={`${money(funding.today?.credits)} wallet credits`} icon={<BoltRounded />} color="#7F56D9" /></Grid><Grid item xs={12} sm={6} lg={3}><Metric label="Active sessions" value={data?.activeSessions || 0} detail="Charging right now" icon={<InsightsRounded />} color="#F79009" /></Grid></Grid>
    <BillingPolicyCard company={company} walletBalance={walletBalance} />
    <Grid container spacing={2}><Grid item xs={12} lg={7}><Card sx={{ height: '100%', borderRadius: 3.5 }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}><Box><Typography variant="h6" fontWeight={850}>Charging programme</Typography><Typography variant="body2" color="text.secondary">Usage across all company mobile users</Typography></Box><Chip size="small" label="Live sessions included" color="info" variant="outlined" /></Stack><Grid container spacing={1.5}>{[['Today', usage.today], ['This month', usage.month], ['All time', usage.lifetime]].map(([label, item]) => <Grid item xs={12} sm={4} key={label}><Box sx={{ p: 2, height: '100%', borderRadius: 3, bgcolor: '#F8FAFC', border: '1px solid #EAECF0' }}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography><Typography variant="h5" sx={{ mt: .7 }}>{item?.sessions || 0} sessions</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{energy(item?.energyWh)} delivered</Typography><Typography variant="body2" color="primary.main" fontWeight={750}>{money(item?.spend)} charging value</Typography></Box></Grid>)}</Grid><Divider sx={{ my: 2.5 }} /><Stack direction="row" justifyContent="space-between" mb={.7}><Typography variant="body2" fontWeight={750}>Employee activation</Typography><Typography variant="body2" color="text.secondary">{users.active || 0} active</Typography></Stack><LinearProgress variant="determinate" value={activeRate} color="success" /></CardContent></Card></Grid><Grid item xs={12} lg={5}><Card sx={{ height: '100%', borderRadius: 3.5 }}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}><Box><Typography variant="h6" fontWeight={850}>Latest funding activity</Typography><Typography variant="body2" color="text.secondary">Company wallet ledger</Typography></Box><ScheduleRounded color="primary" /></Stack><List disablePadding>{(data?.recentTransactions || []).slice(0, 6).map(item => <ListItem key={item.id} disableGutters divider><ListItemAvatar><Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: item.type === 'CREDIT' ? 'success.50' : 'warning.50', color: item.type === 'CREDIT' ? 'success.main' : 'warning.dark' }}><BoltRounded fontSize="small" /></Box></ListItemAvatar><ListItemText primary={<Typography variant="body2" fontWeight={700}>{item.description || (item.type === 'CREDIT' ? 'Wallet credit' : 'Employee funding')}</Typography>} secondary={item.beneficiary?.name ? `${item.beneficiary.name} · ${dateTime(item.createdAt)}` : dateTime(item.createdAt)} /><Typography variant="body2" fontWeight={800} color={item.type === 'CREDIT' ? 'success.main' : 'text.primary'}>{item.type === 'CREDIT' ? '+' : '-'}{money(item.amount)}</Typography></ListItem>)}{!data?.recentTransactions?.length && <Typography color="text.secondary" sx={{ py: 3 }}>No funding activity yet.</Typography>}</List></CardContent></Card></Grid></Grid>
  </Stack>;
}

function HeroPill({ label, value }) {
  return <Box sx={{ minWidth: { xs: 'calc(50% - 4px)', sm: 'auto' }, flex: { sm: 1 }, px: 1.25, py: 1, borderRadius: 2.25, bgcolor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.14)' }}><Typography variant="caption" sx={{ display: 'block', opacity: .7, fontWeight: 700 }}>{label}</Typography><Typography variant="body2" fontWeight={850} noWrap>{value}</Typography></Box>;
}

export { money, energy };
