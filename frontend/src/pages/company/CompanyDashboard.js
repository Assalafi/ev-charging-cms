import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Stack,
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
  WarningAmberRounded
} from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';
import PageHeader from '../../components/ui/PageHeader';
import DashboardMetricTile from '../../components/ui/DashboardMetricTile';
import SectionCard from '../../components/ui/SectionCard';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import { formatDateTime } from '../../utils/timezone';

const money = value => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
const energy = value => { const kwh = Number(value || 0) / 1000; return kwh >= 1000 ? `${(kwh / 1000).toFixed(2)} MWh` : `${kwh.toFixed(1)} kWh`; };
const dateTime = value => value ? formatDateTime(value) : 'Not available';
const rate = value => Number(value) > 0 ? `${money(Number(value) * 1000)}/kWh` : 'Location rate';

function PolicyRow({ icon, label, value, helper, tone = 'text.primary' }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box sx={theme => ({ width: 38, height: 38, borderRadius: 2.2, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: alpha(theme.palette.primary.main, 0.08), color: 'primary.main' })}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
          <Typography variant="body2" fontWeight={800} color={tone} noWrap>{value}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.2, lineHeight: 1.35 }}>{helper}</Typography>
      </Box>
    </Stack>
  );
}

export function BillingPolicyCard({ company = {}, walletBalance = 0 }) {
  const debt = Math.max(0, -Number(walletBalance || 0));
  const hasCompanyTariff = Number(company.pricePerWh) > 0;
  const statusColor = debt > 0 ? 'warning' : company.debtEnabled ? 'info' : 'success';
  return (
    <SectionCard
      title="Charging policy"
      description="The tariff and credit rules used by company drivers."
      action={<Chip size="small" icon={debt > 0 ? <WarningAmberRounded /> : <ShieldRounded />} color={statusColor} label={debt > 0 ? 'Debt outstanding' : company.debtEnabled ? 'Debt enabled' : 'Balance required'} sx={{ fontWeight: 700 }} />}
      sx={{ height: '100%' }}
    >
      <Stack spacing={2} divider={<Divider flexItem />}>
        <PolicyRow icon={<LocalOfferRounded fontSize="small" />} label="Company tariff" value={hasCompanyTariff ? rate(company.pricePerWh) : 'Location rate'} helper={hasCompanyTariff ? 'Applies to all company charging.' : 'No company-specific tariff configured.'} />
        <PolicyRow icon={<AccountBalanceWalletRounded fontSize="small" />} label="Current balance" value={money(walletBalance)} helper={debt > 0 ? `${money(debt)} is recorded as debt.` : 'Available for employee funding.'} tone={debt > 0 ? 'warning.main' : 'text.primary'} />
        <PolicyRow icon={<ShieldRounded fontSize="small" />} label="Credit access" value={company.debtEnabled ? 'Debt permitted' : 'Balance required'} helper={company.debtEnabled ? 'Funding can continue below zero.' : 'Funding stops at the available balance.'} tone={company.debtEnabled ? 'info.main' : 'text.primary'} />
      </Stack>
      {debt > 0 && <Alert severity="warning" icon={<WarningAmberRounded />} sx={{ mt: 2.5, borderRadius: 2.5 }}><strong>{money(debt)} outstanding.</strong> Add funds to restore available credit.</Alert>}
    </SectionCard>
  );
}

function BalanceHero({ walletBalance, usage = {}, activeSessions = 0, onNavigate }) {
  const debt = Math.max(0, -Number(walletBalance || 0));
  const facts = [
    ['Charging now', `${activeSessions} session${activeSessions === 1 ? '' : 's'}`],
    ['Energy today', energy(usage.today?.energyWh)],
    ['Spend today', money(usage.today?.spend)]
  ];
  return (
    <Card sx={{
      height: '100%',
      borderRadius: 3.5,
      color: '#fff',
      border: 0,
      position: 'relative',
      overflow: 'hidden',
      background: debt > 0 ? 'linear-gradient(135deg, #7C2D12 0%, #D97706 100%)' : 'linear-gradient(135deg, #0B1F3F 0%, #1D4ED8 100%)',
      boxShadow: '0 18px 40px rgba(16, 24, 40, 0.18)'
    }}>
      <Box sx={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', right: -130, top: -170, bgcolor: 'rgba(255,255,255,.08)' }} />
      <Box sx={{ position: 'absolute', width: 220, height: 220, borderRadius: '50%', right: 50, bottom: -160, bgcolor: 'rgba(255,255,255,.05)' }} />
      <CardContent sx={{ position: 'relative', p: { xs: 2.5, sm: 3.5 }, '&:last-child': { pb: { xs: 2.5, sm: 3.5 } } }}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ opacity: 0.8, letterSpacing: '0.12em', fontWeight: 800 }}>{debt > 0 ? 'Attention required' : 'Account balance'}</Typography>
            <Typography variant="h2" sx={{ mt: 0.5, color: '#fff', fontSize: { xs: '2.4rem', sm: '3rem' }, letterSpacing: '-0.04em', overflowWrap: 'anywhere' }}>{money(walletBalance)}</Typography>
            <Typography sx={{ mt: 0.5, color: 'rgba(255,255,255,.75)', maxWidth: 440 }}>{debt > 0 ? `${money(debt)} is currently recorded as debt. Add funds to restore credit.` : 'Available to fund your employees and cover charging.'}</Typography>
          </Box>
          <Box sx={{ width: 54, height: 54, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.14)', flexShrink: 0 }}>{debt > 0 ? <WarningAmberRounded sx={{ fontSize: 30 }} /> : <AccountBalanceWalletRounded sx={{ fontSize: 30 }} />}</Box>
        </Stack>
        <Stack direction="row" spacing={{ xs: 2, sm: 4.5 }} sx={{ mt: 3, flexWrap: 'wrap', rowGap: 1.5 }}>
          {facts.map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.6)', fontWeight: 700, letterSpacing: '0.06em' }}>{label.toUpperCase()}</Typography>
              <Typography sx={{ color: '#fff', fontWeight: 800, mt: 0.2 }}>{value}</Typography>
            </Box>
          ))}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} sx={{ mt: 3 }}>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => onNavigate('/company/wallet')} sx={{ bgcolor: '#fff', color: '#0B1F3F', '&:hover': { bgcolor: '#EAF1FF' } }}>Add funds</Button>
          <Button variant="outlined" startIcon={<GroupsRounded />} onClick={() => onNavigate('/company/users')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)', '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,.08)' } }}>Fund an employee</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function UsageCard({ usage = {} }) {
  const periods = [['Today', usage.today], ['This month', usage.month], ['All time', usage.lifetime]];
  return (
    <SectionCard
      title="Charging usage"
      description="Live sessions are included in the totals."
      action={<BoltRounded color="primary" />}
      sx={{ height: '100%' }}
    >
      <Grid container spacing={1.5}>
        {periods.map(([label, item]) => (
          <Grid item xs={12} sm={4} key={label}>
            <Box sx={{ p: { xs: 1.75, sm: 2 }, height: '100%', borderRadius: 3, bgcolor: '#F8FAFC', border: '1px solid #EAECF0' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing="0.06em">{label.toUpperCase()}</Typography>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 0.9 }}>{item?.sessions || 0} <Typography component="span" variant="body2" color="text.secondary" fontWeight={600}>sessions</Typography></Typography>
              <Divider sx={{ my: 1.4 }} />
              <Stack spacing={0.7}>
                <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">Energy</Typography><Typography variant="caption" fontWeight={700}>{energy(item?.energyWh)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">Spend</Typography><Typography variant="caption" fontWeight={700} color="primary.main">{money(item?.spend)}</Typography></Stack>
              </Stack>
            </Box>
          </Grid>
        ))}
      </Grid>
    </SectionCard>
  );
}

function QuickActions({ onNavigate }) {
  const actions = [
    { label: 'Fund company wallet', detail: 'Add credit for employee funding', icon: <PaymentsRounded />, path: '/company/wallet', color: '#2563EB' },
    { label: 'Manage mobile users', detail: 'Access, status and allowances', icon: <GroupsRounded />, path: '/company/users', color: '#0E9F6E' },
    { label: 'Open live network', detail: 'View stations and availability', icon: <MapRounded />, path: '/company/monitor', color: '#7F56D9' },
    { label: 'Review auto funding', detail: 'Manage recurring allowances', icon: <ScheduleRounded />, path: '/company/funding', color: '#D97706' }
  ];
  return (
    <SectionCard title="Quick actions" description="Common company controls." sx={{ height: '100%' }} contentSx={{ p: '0 !important' }}>
      <Stack divider={<Divider flexItem />} sx={{ px: { xs: 1, sm: 1.25 } }}>
        {actions.map(action => (
          <Button key={action.path} onClick={() => onNavigate(action.path)} sx={{ px: 1.25, py: 1.35, justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary', borderRadius: 2, '&:hover': { bgcolor: 'grey.50' } }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2.2, display: 'grid', placeItems: 'center', mr: 1.5, flexShrink: 0, bgcolor: alpha(action.color, 0.12), color: action.color }}>{action.icon}</Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} noWrap>{action.label}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{action.detail}</Typography>
            </Box>
            <ArrowForwardRounded sx={{ color: 'text.disabled', fontSize: 18, ml: 1 }} />
          </Button>
        ))}
      </Stack>
    </SectionCard>
  );
}

function TeamCard({ users = {}, activeRate = 0, onNavigate }) {
  return (
    <SectionCard
      title="Employee access"
      description="Drivers who can charge today."
      action={<Button size="small" endIcon={<ArrowForwardRounded />} onClick={() => onNavigate('/company/users')}>Manage</Button>}
      sx={{ height: '100%' }}
    >
      <Stack spacing={2.25}>
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography variant="h4" fontWeight={800}>{activeRate}%</Typography>
            <Typography variant="caption" color="text.secondary">activated</Typography>
          </Stack>
          <LinearProgress variant="determinate" color="success" value={activeRate} sx={{ mt: 1.2, height: 9 }} />
        </Box>
        <Grid container spacing={1.5}>
          <Grid item xs={6}><Box sx={{ p: 1.75, borderRadius: 2.5, bgcolor: 'success.light' }}><Typography variant="h5" fontWeight={800} color="success.dark">{users.active || 0}</Typography><Typography variant="caption" color="success.dark">Active</Typography></Box></Grid>
          <Grid item xs={6}><Box sx={{ p: 1.75, borderRadius: 2.5, bgcolor: 'warning.light' }}><Typography variant="h5" fontWeight={800} color="warning.dark">{users.suspended || 0}</Typography><Typography variant="caption" color="warning.dark">Suspended</Typography></Box></Grid>
        </Grid>
      </Stack>
    </SectionCard>
  );
}

function RecentFunding({ transactions = [], onNavigate }) {
  return (
    <SectionCard
      title="Recent funding"
      description="Latest company wallet activity."
      action={<Button size="small" variant="outlined" onClick={() => onNavigate('/company/wallet')}>View wallet</Button>}
      sx={{ height: '100%' }}
      contentSx={{ p: '0 !important' }}
    >
      <TableContainer sx={{ border: 0, borderRadius: 0 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Activity</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.slice(0, 6).map(item => (
              <TableRow hover key={item.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight={650} noWrap>{item.description || (item.type === 'CREDIT' ? 'Wallet credit' : 'Employee funding')}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.beneficiary?.name ? `${item.beneficiary.name} · ` : ''}{dateTime(item.createdAt)}</Typography>
                </TableCell>
                <TableCell><Chip size="small" label={item.type === 'CREDIT' ? 'Credit' : 'Funding'} color={item.type === 'CREDIT' ? 'success' : 'warning'} variant="outlined" /></TableCell>
                <TableCell align="right"><Typography variant="body2" fontWeight={800} color={item.type === 'CREDIT' ? 'success.dark' : 'text.primary'}>{item.type === 'CREDIT' ? '+' : '-'}{money(item.amount)}</Typography></TableCell>
              </TableRow>
            ))}
            {!transactions.length && (
              <TableRow><TableCell colSpan={3} align="center"><Typography color="text.secondary" sx={{ py: 5 }}>No funding activity yet.</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </SectionCard>
  );
}

export default function CompanyDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const response = await companyPortalService.dashboard();
      setData(response.data.dashboard);
      setUpdated(new Date());
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Unable to load company dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load]);

  if (loading && !data) return <Box className="page-enter"><DashboardSkeleton /></Box>;

  const company = data?.company || {};
  const walletBalance = Number(data?.walletBalance || 0);
  const users = data?.users || {};
  const funding = data?.funding || {};
  const usage = data?.usage || {};
  const activeRate = users.total ? Math.round((users.active / users.total) * 100) : 0;

  return (
    <Box className="page-enter">
      <PageHeader
        eyebrow="Company dashboard"
        title={company.name || 'Company overview'}
        description="A clear view of your balance, drivers and charging activity."
        live
        updatedAt={updated}
        actions={<>
          <Button variant="outlined" startIcon={<RefreshRounded />} onClick={load}>Refresh</Button>
          <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/company/wallet')}>Add funds</Button>
        </>}
      />

      {error && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={load}>Retry</Button>} sx={{ mb: 2.5 }}>{error}</Alert>}

      <Grid container spacing={{ xs: 2, md: 2.5 }} sx={{ mb: { xs: 2, md: 2.5 } }} alignItems="stretch">
        <Grid item xs={12} lg={8}><BalanceHero walletBalance={walletBalance} usage={usage} activeSessions={data?.activeSessions || 0} onNavigate={navigate} /></Grid>
        <Grid item xs={12} lg={4}><BillingPolicyCard company={company} walletBalance={walletBalance} /></Grid>
      </Grid>

      <Grid container spacing={{ xs: 1.15, sm: 1.5 }} sx={{ mb: { xs: 2, md: 2.5 } }}>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Active employees" value={`${users.active || 0} / ${users.total || 0}`} helper={`${activeRate}% activated`} icon={<GroupsRounded />} color="success" onClick={() => navigate('/company/users')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Funded today" value={money(funding.today?.debits)} helper={`${money(funding.today?.credits)} credited`} icon={<PaymentsRounded />} color="secondary" onClick={() => navigate('/company/wallet')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Live sessions" value={data?.activeSessions || 0} helper="Charging now" icon={<InsightsRounded />} color="warning" onClick={() => navigate('/company/monitor')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Active rules" value={data?.rules || 0} helper="Auto-funding routines" icon={<ScheduleRounded />} color="primary" onClick={() => navigate('/company/funding')} /></Grid>
      </Grid>

      <Grid container spacing={{ xs: 2, md: 2.5 }} sx={{ mb: { xs: 2, md: 2.5 } }} alignItems="stretch">
        <Grid item xs={12} lg={8}><UsageCard usage={usage} /></Grid>
        <Grid item xs={12} lg={4}><QuickActions onNavigate={navigate} /></Grid>
      </Grid>

      <Grid container spacing={{ xs: 2, md: 2.5 }} alignItems="stretch">
        <Grid item xs={12} lg={8}><RecentFunding transactions={data?.recentTransactions || []} onNavigate={navigate} /></Grid>
        <Grid item xs={12} lg={4}><TeamCard users={users} activeRate={activeRate} onNavigate={navigate} /></Grid>
      </Grid>
    </Box>
  );
}

export { money, energy };
