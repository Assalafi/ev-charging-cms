import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Stack,
  Typography
} from '@mui/material';
import {
  AccountBalanceWalletRounded,
  ArrowForwardRounded,
  BoltRounded,
  GroupsRounded,
  InsightsRounded,
  LocalOfferRounded,
  MapRounded,
  PaymentsRounded,
  RefreshRounded,
  ScheduleRounded,
  ShieldRounded,
  TrendingUpRounded,
  WarningAmberRounded
} from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';

const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const energy = value => { const kwh = Number(value || 0) / 1000; return kwh >= 1000 ? `${(kwh / 1000).toFixed(2)} MWh` : `${kwh.toFixed(1)} kWh`; };
const dateTime = value => value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Not available';
const rate = value => Number(value) > 0 ? `${money(Number(value) * 1000)}/kWh` : 'Location rate';

function StatCard({ label, value, detail, icon, color, onClick }) {
  return <Card onClick={onClick} sx={{ height: '100%', borderRadius: 3, border: '1px solid', borderColor: 'grey.200', cursor: onClick ? 'pointer' : 'default', transition: 'transform .18s ease, box-shadow .18s ease', '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 3 } : undefined }}><CardContent sx={{ p: { xs: 1.75, sm: 2 } }}><Stack direction="row" spacing={1.25} justifyContent="space-between" alignItems="flex-start"><Box minWidth={0}><Typography variant="caption" color="text.secondary" fontWeight={750} noWrap>{label}</Typography><Typography sx={{ mt: .65, fontWeight: 850, fontSize: { xs: '1.32rem', sm: '1.55rem' }, letterSpacing: -.35 }} noWrap>{value}</Typography><Typography variant="caption" color="text.secondary" noWrap>{detail}</Typography></Box><Box sx={{ width: 38, height: 38, borderRadius: 2.25, display: 'grid', placeItems: 'center', bgcolor: `${color}15`, color, flexShrink: 0 }}>{icon}</Box></Stack></CardContent></Card>;
}

export function BillingPolicyCard({ company = {}, walletBalance = 0 }) {
  const debt = Math.max(0, -Number(walletBalance || 0));
  const hasCompanyTariff = Number(company.pricePerWh) > 0;
  return <Card sx={{ height: '100%', borderRadius: 3.5, border: '1px solid', borderColor: debt > 0 ? 'warning.light' : 'grey.200', overflow: 'hidden' }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start"><Box><Typography variant="h6" fontWeight={850}>Charging policy</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>The tariff and credit rules used by company drivers.</Typography></Box><Chip size="small" icon={debt > 0 ? <WarningAmberRounded /> : <ShieldRounded />} color={debt > 0 ? 'warning' : company.debtEnabled ? 'info' : 'default'} label={debt > 0 ? 'Debt outstanding' : company.debtEnabled ? 'Debt enabled' : 'Balance required'} sx={{ fontWeight: 800, flexShrink: 0 }} /></Stack>
      <Grid container spacing={1.25} sx={{ mt: 1 }}><PolicyValue icon={<LocalOfferRounded />} label="Company tariff" value={hasCompanyTariff ? rate(company.pricePerWh) : 'Location rate'} helper={hasCompanyTariff ? 'Applies to all company charging.' : 'No company-specific tariff configured.'} /><PolicyValue icon={<AccountBalanceWalletRounded />} label="Current balance" value={money(walletBalance)} helper={debt > 0 ? `${money(debt)} is recorded as debt.` : 'Available for employee funding.'} tone={debt > 0 ? 'warning.main' : 'text.primary'} /><PolicyValue icon={<ShieldRounded />} label="Credit access" value={company.debtEnabled ? 'Debt permitted' : 'Balance required'} helper={company.debtEnabled ? 'Funding can continue below zero.' : 'Funding stops at the available balance.'} tone={company.debtEnabled ? 'info.main' : 'text.primary'} /></Grid>
      {debt > 0 && <Alert severity="warning" icon={<WarningAmberRounded />} sx={{ mt: 1.75, borderRadius: 2.5 }}><strong>{money(debt)} outstanding.</strong> Add funds to restore available credit.</Alert>}
    </CardContent>
  </Card>;
}

function PolicyValue({ icon, label, value, helper, tone = 'text.primary' }) {
  return <Grid item xs={12} sm={4}><Box sx={{ height: '100%', p: 1.25, borderRadius: 2.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'grey.100' }}><Stack direction="row" spacing={1} alignItems="flex-start"><Box sx={{ width: 30, height: 30, borderRadius: 1.75, display: 'grid', placeItems: 'center', bgcolor: 'background.paper', color: 'primary.main', flexShrink: 0 }}>{icon}</Box><Box minWidth={0}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography><Typography fontWeight={850} color={tone} sx={{ mt: .2 }} noWrap>{value}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .25, lineHeight: 1.3 }}>{helper}</Typography></Box></Stack></Box></Grid>;
}

function UsageCard({ usage = {} }) {
  return <Card sx={{ height: '100%', borderRadius: 3.5, border: '1px solid', borderColor: 'grey.200' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}><Box><Typography variant="h6" fontWeight={850}>Charging usage</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Live sessions are included in the totals.</Typography></Box><BoltRounded color="primary" /></Stack><Grid container spacing={1.25} sx={{ mt: 1 }}>{[['Today', usage.today], ['This month', usage.month], ['All time', usage.lifetime]].map(([label, item]) => <Grid item xs={12} sm={4} key={label}><Box sx={{ p: 1.5, height: '100%', borderRadius: 2.75, bgcolor: '#F8FAFC', border: '1px solid #EAECF0' }}><Typography variant="caption" color="text.secondary" fontWeight={750}>{label}</Typography><Typography variant="h6" fontWeight={850} sx={{ mt: .6 }}>{item?.sessions || 0} sessions</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>{energy(item?.energyWh)} delivered</Typography><Typography variant="body2" color="primary.main" fontWeight={750} sx={{ mt: .3 }}>{money(item?.spend)} value</Typography></Box></Grid>)}</Grid></CardContent></Card>;
}

function QuickActions({ onNavigate }) {
  const actions = [{ label: 'Fund company wallet', detail: 'Add credit for employee funding', icon: <PaymentsRounded />, path: '/company/wallet', color: '#2563EB' }, { label: 'Manage mobile users', detail: 'Access, status and allowances', icon: <GroupsRounded />, path: '/company/users', color: '#0E9F6E' }, { label: 'Open live network', detail: 'View stations and availability', icon: <MapRounded />, path: '/company/monitor', color: '#7F56D9' }, { label: 'Review auto funding', detail: 'Manage recurring allowances', icon: <ScheduleRounded />, path: '/company/funding', color: '#D97706' }];
  return <Card sx={{ height: '100%', borderRadius: 3.5, border: '1px solid', borderColor: 'grey.200' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Typography variant="h6" fontWeight={850}>Quick actions</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35, mb: 1.2 }}>Common company controls.</Typography><Stack divider={<Divider flexItem />}>{actions.map(action => <Button key={action.path} onClick={() => onNavigate(action.path)} sx={{ px: 0, py: 1.15, justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary', '&:hover': { bgcolor: 'grey.50' } }}><Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: `${action.color}15`, color: action.color, mr: 1.25, flexShrink: 0 }}>{action.icon}</Box><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={800} noWrap>{action.label}</Typography><Typography variant="caption" color="text.secondary" noWrap>{action.detail}</Typography></Box><ArrowForwardRounded sx={{ color: 'text.disabled', fontSize: 19, ml: 1 }} /></Button>)}</Stack></CardContent></Card>;
}

function RecentFunding({ transactions = [] }) {
  return <Card sx={{ borderRadius: 3.5, border: '1px solid', borderColor: 'grey.200' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="h6" fontWeight={850}>Recent funding</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Latest company wallet activity.</Typography></Box><TrendingUpRounded color="primary" /></Stack><List disablePadding sx={{ mt: 1 }}>{transactions.slice(0, 6).map(item => <ListItem key={item.id} disableGutters divider><ListItemAvatar><Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: item.type === 'CREDIT' ? 'success.50' : 'warning.50', color: item.type === 'CREDIT' ? 'success.main' : 'warning.dark' }}><BoltRounded fontSize="small" /></Box></ListItemAvatar><ListItemText primary={<Typography variant="body2" fontWeight={750} noWrap>{item.description || (item.type === 'CREDIT' ? 'Wallet credit' : 'Employee funding')}</Typography>} secondary={item.beneficiary?.name ? `${item.beneficiary.name} · ${dateTime(item.createdAt)}` : dateTime(item.createdAt)} /><Typography variant="body2" fontWeight={850} color={item.type === 'CREDIT' ? 'success.main' : 'text.primary'}>{item.type === 'CREDIT' ? '+' : '-'}{money(item.amount)}</Typography></ListItem>)}{!transactions.length && <Typography color="text.secondary" sx={{ py: 3 }}>No funding activity yet.</Typography>}</List></CardContent></Card>;
}

export default function CompanyDashboard() {
  const navigate = useNavigate();
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
  const users = data?.users || {};
  const funding = data?.funding || {};
  const activeRate = users.total ? Math.round((users.active / users.total) * 100) : 0;

  return <Stack spacing={{ xs: 2, md: 2.5 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1.5}><Box><Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".12em">Company dashboard</Typography><Typography variant="h3" sx={{ mt: .3, fontSize: { xs: '1.9rem', sm: '2.45rem' } }}>{company.name || 'Company overview'}</Typography><Typography color="text.secondary" sx={{ mt: .35 }}>A clear view of your balance, drivers and charging activity.</Typography></Box><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" icon={<TrendingUpRounded />} label={updated ? `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'} color="success" variant="outlined" /><Button variant="outlined" startIcon={<RefreshRounded />} onClick={load}>Refresh</Button></Stack></Stack>
    {error && <Alert severity="warning" onClose={() => setError('')}>{error}</Alert>}
    <Grid container spacing={2} alignItems="stretch"><Grid item xs={12} lg={7}><Card sx={{ height: '100%', borderRadius: 3.5, color: '#fff', background: debt > 0 ? 'linear-gradient(135deg, #78350F, #D97706)' : 'linear-gradient(135deg, #0F2E61, #2563EB)' }}><CardContent sx={{ p: { xs: 2.25, sm: 3 }, '&:last-child': { pb: { xs: 2.25, sm: 3 } } }}><Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography variant="overline" sx={{ opacity: .75, letterSpacing: 1.1, fontWeight: 800 }}>{debt > 0 ? 'Attention required' : 'Account balance'}</Typography><Typography variant="h2" sx={{ mt: .4, color: '#fff', fontSize: { xs: '2.35rem', sm: '3.2rem' }, letterSpacing: -1 }}>{money(walletBalance)}</Typography><Typography sx={{ mt: .4, color: 'rgba(255,255,255,.76)' }}>{debt > 0 ? `${money(debt)} is currently recorded as debt.` : 'Available for employee funding.'}</Typography></Box><Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.15)' }}>{debt > 0 ? <WarningAmberRounded sx={{ fontSize: 30 }} /> : <AccountBalanceWalletRounded sx={{ fontSize: 30 }} />}</Box></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 2.5 }}><Button variant="contained" onClick={() => navigate('/company/wallet')} sx={{ bgcolor: '#fff', color: 'primary.dark', '&:hover': { bgcolor: 'grey.100' } }}>Manage wallet</Button><Button variant="outlined" onClick={() => navigate('/company/users')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.45)', '&:hover': { borderColor: '#fff' } }}>Fund an employee</Button></Stack></CardContent></Card></Grid><Grid item xs={12} lg={5}><BillingPolicyCard company={company} walletBalance={walletBalance} /></Grid></Grid>
    <Grid container spacing={1.5}><Grid item xs={6} md={3}><StatCard label="Active employees" value={`${users.active || 0} / ${users.total || 0}`} detail={`${activeRate}% active`} icon={<GroupsRounded />} color="#0E9F6E" /></Grid><Grid item xs={6} md={3}><StatCard label="Funded today" value={money(funding.today?.debits)} detail={`${money(funding.today?.credits)} credited`} icon={<PaymentsRounded />} color="#7F56D9" onClick={() => navigate('/company/wallet')} /></Grid><Grid item xs={6} md={3}><StatCard label="Live sessions" value={data?.activeSessions || 0} detail="Charging now" icon={<InsightsRounded />} color="#D97706" onClick={() => navigate('/company/monitor')} /></Grid><Grid item xs={6} md={3}><StatCard label="Active rules" value={data?.rules || 0} detail="Auto-funding routines" icon={<ScheduleRounded />} color="#2563EB" onClick={() => navigate('/company/funding')} /></Grid></Grid>
    <Grid container spacing={2}><Grid item xs={12} lg={7}><UsageCard usage={data?.usage} /><Card sx={{ mt: 2, borderRadius: 3.5, border: '1px solid', borderColor: 'grey.200' }}><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" justifyContent="space-between" mb={.7}><Box><Typography variant="h6" fontWeight={850}>Employee activation</Typography><Typography variant="body2" color="text.secondary">Active employees who can charge today.</Typography></Box><Typography fontWeight={850}>{activeRate}%</Typography></Stack><LinearProgress variant="determinate" value={activeRate} color="success" sx={{ height: 9, borderRadius: 5 }} /></CardContent></Card></Grid><Grid item xs={12} lg={5}><QuickActions onNavigate={navigate} /></Grid></Grid>
    <RecentFunding transactions={data?.recentTransactions || []} />
  </Stack>;
}

export { money, energy };
