import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Grid, LinearProgress, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography
} from '@mui/material';
import {
  ArrowForwardRounded as ArrowIcon,
  AccountBalanceRounded as CompanyIcon,
  BatteryChargingFullRounded as ChargingIcon,
  BoltRounded as EnergyIcon,
  CalendarMonthRounded as MonthIcon,
  CheckCircleOutlineRounded as CheckIcon,
  ErrorOutlineRounded as ErrorIcon,
  EvStationRounded as StationIcon,
  MapRounded as MapIcon,
  PaymentsOutlined as PaymentsIcon,
  PeopleAltRounded as ClientsIcon,
  RefreshRounded as RefreshIcon,
  SavingsRounded as PartnerIcon,
  ScheduleRounded as ScheduleIcon,
  TrendingUpRounded as TrendingIcon
} from '@mui/icons-material';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale,
  LineElement, PointElement, Tooltip as ChartTooltip
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { format } from 'date-fns';
import api from '../services/api';
import { useMQTT } from '../contexts/MQTTContext';
import DashboardMetricTile from '../components/ui/DashboardMetricTile';
import DashboardSkeleton from '../components/ui/DashboardSkeleton';
import SectionCard from '../components/ui/SectionCard';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';
import { isStationConnected, stationDisplayStatus } from '../utils/stationConnection';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTooltip, Legend, Filler);

const formatNaira = value => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(Number(value) || 0);

const formatEnergy = valueWh => {
  const kWh = (Number(valueWh) || 0) / 1000;
  if (kWh >= 1000) return `${(kWh / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MWh`;
  return `${kWh.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh`;
};

const statusColor = status => {
  const value = String(status || '').toLowerCase();
  if (value === 'charging') return 'primary';
  if (value === 'available') return 'success';
  if (value === 'faulted' || value === 'fault') return 'error';
  if (value === 'preparing' || value === 'reserved') return 'warning';
  if (value === 'finishing') return 'info';
  return 'default';
};

function Dashboard() {
  const navigate = useNavigate();
  const { stationStatus, lastMessageAt } = useMQTT();
  const { hasPermission } = useAuth();
  const { branding } = useBranding();
  const canViewPayments = hasPermission('payments.view');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState({
    totalStations: 0,
    connectedStations: 0,
    activeTransactions: 0,
    totalTransactions: 0,
    walletFundingToday: 0,
    walletFundingCount: 0,
    totalClients: 0,
    activeClients: 0,
    stationUptime: 0,
    transactionSuccessRate: 0
  });
  const [reporting, setReporting] = useState({
    today: {}, month: {}, year: {}, lifetime: {}, activeSessions: 0,
    activeEnergyWh: 0, activeChargingValue: 0
  });
  const [stations, setStations] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [energySeries, setEnergySeries] = useState({ labels: [], values: [] });
  const [usageSeries, setUsageSeries] = useState({ labels: [], values: [] });
  const fetchingRef = useRef(false);
  const liveRefreshRef = useRef(null);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    setRefreshing(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const [dashboardSummary, payments, stationStats, stationList, recent, energy, usage] = await Promise.all([
        api.get('/admin/monitor/summary'),
        canViewPayments ? api.get('/admin/payments/transactions', { params: { startDate: `${today}T00:00:00.000Z`, endDate: `${today}T23:59:59.999Z`, status: 'SUCCESS', type: 'CREDIT', gateway: 'paystack', limit: 10000 } }) : Promise.resolve({ data: { transactions: [] } }),
        api.get('/stations/stats/summary'),
        api.get('/stations'),
        api.get('/transactions?limit=10'),
        api.get('/transactions/stats/energy?period=week'),
        api.get('/transactions/stats/usage?period=month')
      ]);

      const stationRows = stationList.data?.stations || [];
      const recentRows = recent.data?.transactions || [];
      const apiStats = stationStats.data?.stats || {};
      const paymentRows = payments.data?.transactions || [];
      const totals = dashboardSummary.data?.summary || {};
      const onlineCount = stationRows.filter(station => Boolean(station.isConnected)).length;
      const completed = recentRows.filter(transaction => String(transaction.status).toLowerCase() === 'completed' && !transaction.errorCode).length;
      const totalStations = Number(apiStats.totalStations ?? stationRows.length) || 0;

      setSummary({
        totalStations,
        connectedStations: Number(apiStats.connectedStations ?? onlineCount) || 0,
        activeTransactions: Number(totals.activeSessions ?? apiStats.activeTransactions) || 0,
        totalTransactions: Number(totals.lifetime?.sessions ?? recent.data?.totalCount) || recentRows.length,
        walletFundingToday: paymentRows.reduce((total, payment) => total + (Number(payment.amount) || 0), 0),
        walletFundingCount: paymentRows.length,
        totalClients: Number(totals.clients?.total) || 0,
        activeClients: Number(totals.clients?.active) || 0,
        stationUptime: totalStations ? ((Number(apiStats.connectedStations ?? onlineCount) || 0) / totalStations) * 100 : 0,
        transactionSuccessRate: recentRows.length ? (completed / recentRows.length) * 100 : 0
      });
      setReporting({
        today: totals.today || {},
        month: totals.month || {},
        year: totals.year || {},
        lifetime: totals.lifetime || {},
        activeSessions: Number(totals.activeSessions) || 0,
        activeEnergyWh: Number(totals.activeEnergyWh) || 0,
        activeChargingValue: Number(totals.activeChargingValue) || 0
      });
      setStations(stationRows);
      setTransactions(recentRows);

      const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const energyByDay = Object.fromEntries(dayLabels.map(day => [day, 0]));
      (energy.data?.energyStats || []).forEach(item => {
        const date = new Date(item.timestamp);
        if (!Number.isNaN(date.getTime())) {
          const day = format(date, 'EEEE');
          energyByDay[day] = (energyByDay[day] || 0) + (Number(item.energy) || 0);
        }
      });
      setEnergySeries({
        labels: dayLabels.map(day => day.slice(0, 3)),
        values: dayLabels.map(day => Number((energyByDay[day] / 1000).toFixed(2)))
      });

      const stationUsage = usage.data?.stationUsage || [];
      setUsageSeries({
        labels: stationUsage.slice(0, 8).map(item => item.charging_station?.name || item.chargePointId || 'Unknown'),
        values: stationUsage.slice(0, 8).map(item => Number(item.count) || 0)
      });
      setError('');
    } catch (fetchError) {
      console.error('Error fetching dashboard data:', fetchError);
      setError('Some live dashboard data could not be refreshed. The last available values are still displayed.');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [canViewPayments]);

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData({ silent: true }), 3000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchDashboardData({ silent: true });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchDashboardData]);

  useEffect(() => {
    if (!lastMessageAt) return undefined;
    clearTimeout(liveRefreshRef.current);
    liveRefreshRef.current = setTimeout(() => fetchDashboardData({ silent: true }), 180);
    return () => clearTimeout(liveRefreshRef.current);
  }, [lastMessageAt, fetchDashboardData]);

  const liveStations = useMemo(() => stations.map(station => ({
    ...station,
    liveStatus: stationDisplayStatus(station, stationStatus),
    isConnected: isStationConnected(station, stationStatus)
  })), [stations, stationStatus]);

  const network = useMemo(() => {
    const result = { online: 0, charging: 0, faulted: 0, offline: 0 };
    liveStations.forEach(station => {
      const status = String(station.liveStatus).toLowerCase();
      if (status === 'charging') result.charging += 1;
      if (status === 'faulted' || status === 'fault') result.faulted += 1;
      if (station.isConnected) result.online += 1;
      else result.offline += 1;
    });
    return result;
  }, [liveStations]);

  const effectiveConnected = network.online;
  const uptime = summary.totalStations ? (effectiveConnected / summary.totalStations) * 100 : 0;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { padding: 12, displayColors: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#667085' }, border: { display: false } },
      y: { beginAtZero: true, grid: { color: '#EAECF0' }, ticks: { color: '#667085' }, border: { display: false } }
    }
  };

  const energyChart = {
    labels: energySeries.labels,
    datasets: [{ data: energySeries.values, borderColor: '#2563EB', backgroundColor: 'rgba(37,99,235,.10)', fill: true, tension: 0.38, pointRadius: 3, pointBackgroundColor: '#2563EB' }]
  };

  const usageChart = {
    labels: usageSeries.labels,
    datasets: [{ data: usageSeries.values, backgroundColor: '#0E9F6E', borderRadius: 7, maxBarThickness: 34 }]
  };

  if (loading) return <Box className="page-enter"><DashboardSkeleton /></Box>;

  return (
    <Box className="page-enter">
      {error && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => fetchDashboardData()}>Retry</Button>} sx={{ mb: 2.5 }}>{error}</Alert>}

      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="h5">Today</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<MapIcon />} onClick={() => navigate('/monitor')} sx={{ minWidth: { xs: 42, sm: 'auto' }, px: { xs: 1.1, sm: 2 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Live map</Box></Button>
          <Button size="small" variant="contained" startIcon={<RefreshIcon />} onClick={() => fetchDashboardData()} disabled={refreshing} sx={{ minWidth: { xs: 42, sm: 'auto' }, px: { xs: 1.1, sm: 2 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{refreshing ? 'Refreshing...' : 'Refresh'}</Box></Button>
        </Stack>
      </Stack>

      <Grid container spacing={{ xs: 1.15, sm: 1.5 }} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}><DashboardMetricTile emphasis label="Energy today" value={formatEnergy(reporting.today.energyWh)} helper={`${formatNaira(reporting.today.chargingValue)} value - includes live`} icon={<EnergyIcon />} color="primary" /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Sessions today" value={Number(reporting.today.sessions || 0).toLocaleString()} helper={`${formatEnergy(reporting.today.sessions ? reporting.today.energyWh / reporting.today.sessions : 0)} average`} icon={<TrendingIcon />} color="info" onClick={() => navigate('/transactions')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Active sessions" value={summary.activeTransactions.toLocaleString()} helper={`${formatEnergy(reporting.activeEnergyWh)} - ${formatNaira(reporting.activeChargingValue)} live`} icon={<ChargingIcon />} color="success" onClick={() => navigate('/transactions')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Wallet funding" value={formatNaira(summary.walletFundingToday)} helper={`${summary.walletFundingCount} successful payment${summary.walletFundingCount === 1 ? '' : 's'}`} icon={<PaymentsIcon />} color="warning" onClick={() => navigate('/payments')} /></Grid>
      </Grid>

      <Typography variant="h5" sx={{ mb: 1.5 }}>Network totals</Typography>
      <Grid container spacing={{ xs: 1.15, sm: 1.5 }} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={4}><DashboardMetricTile label="All-time energy" value={formatEnergy(reporting.lifetime.energyWh)} helper={`${formatNaira(reporting.lifetime.chargingValue)} charging value`} icon={<EnergyIcon />} color="primary" /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="All-time sessions" value={Number(reporting.lifetime.sessions || 0).toLocaleString()} helper={`${formatEnergy(reporting.lifetime.sessions ? reporting.lifetime.energyWh / reporting.lifetime.sessions : 0)} average`} icon={<ChargingIcon />} color="info" onClick={() => navigate('/transactions')} /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="Clients" value={summary.totalClients.toLocaleString()} helper={`${summary.activeClients.toLocaleString()} active account${summary.activeClients === 1 ? '' : 's'}`} icon={<ClientsIcon />} color="info" onClick={() => navigate('/mobile-users')} /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="This month energy" value={formatEnergy(reporting.month.energyWh)} helper={`${formatNaira(reporting.month.chargingValue)} charging value`} icon={<MonthIcon />} color="success" /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="This month sessions" value={Number(reporting.month.sessions || 0).toLocaleString()} helper={`${formatNaira(reporting.month.sessions ? reporting.month.chargingValue / reporting.month.sessions : 0)} average value`} icon={<TrendingIcon />} color="success" /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="This year energy" value={formatEnergy(reporting.year.energyWh)} helper={`${formatNaira(reporting.year.chargingValue)} charging value`} icon={<EnergyIcon />} color="warning" /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="Stations online" value={`${effectiveConnected}/${summary.totalStations}`} helper={`${uptime.toFixed(1)}% availability`} icon={<StationIcon />} color="success" onClick={() => navigate('/stations')} /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label="Partner earnings" value={formatNaira(reporting.lifetime.partnerEarning)} helper="All completed sessions" icon={<PartnerIcon />} color="warning" onClick={() => navigate('/partners')} /></Grid>
        <Grid item xs={6} md={4}><DashboardMetricTile label={`${branding.shortName || branding.systemName} earnings`} value={formatNaira(reporting.lifetime.companyEarning)} helper="All completed sessions" icon={<CompanyIcon />} color="primary" /></Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12}>
          <SectionCard
            title="Energy delivery rhythm"
            description="Daily energy supplied across every connected location"
            action={<Chip size="small" label="Last 7 days" color="primary" variant="outlined" />}
            contentSx={{ height: { xs: 320, md: 390 } }}
            sx={{ position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', width: 180, height: 180, borderRadius: '50%', right: -90, top: -110, bgcolor: 'rgba(37,99,235,.06)', pointerEvents: 'none' } }}
          >
            {energySeries.values.some(Boolean)
              ? <Line data={energyChart} options={chartOptions} />
              : <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><Stack alignItems="center" spacing={1}><EnergyIcon sx={{ fontSize: 42, color: 'text.disabled' }} /><Typography color="text.secondary">Energy data will appear after the first delivery</Typography></Stack></Box>}
          </SectionCard>
        </Grid>
        <Grid item xs={12} lg={4}>
          <SectionCard title="Operations pulse" description="What the network needs from you now" contentSx={{ pb: '20px !important', height: 'calc(100% - 82px)' }}>
            <Stack spacing={2.1} sx={{ height: '100%' }}>
              <Box sx={{ p: 2, borderRadius: 3, bgcolor: network.faulted ? 'error.light' : 'success.light', border: '1px solid', borderColor: network.faulted ? 'rgba(240,68,56,.16)' : 'rgba(18,183,106,.16)' }}>
                <Stack direction="row" spacing={1.2} alignItems="flex-start">
                  {network.faulted ? <ErrorIcon color="error" /> : <CheckIcon color="success" />}
                  <Box>
                    <Typography variant="body2" fontWeight={720}>{network.faulted ? `${network.faulted} charger${network.faulted === 1 ? '' : 's'} need attention` : 'No critical charger faults'}</Typography>
                    <Typography variant="caption" color="text.secondary">{network.offline ? `${network.offline} offline station${network.offline === 1 ? '' : 's'} should be reviewed.` : 'The network is reporting normally.'}</Typography>
                  </Box>
                </Stack>
              </Box>
              {[
                { label: 'Available', value: Math.max(effectiveConnected - network.charging, 0), color: 'success', icon: <CheckIcon /> },
                { label: 'Charging now', value: network.charging, color: 'primary', icon: <ChargingIcon /> },
                { label: 'Faulted', value: network.faulted, color: 'error', icon: <ErrorIcon /> },
                { label: 'Offline', value: network.offline, color: 'warning', icon: <ScheduleIcon /> }
              ].map(item => (
                <Box key={item.label}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                    <Stack direction="row" spacing={1} alignItems="center"><Box sx={{ color: `${item.color}.main`, display: 'flex', '& svg': { fontSize: 19 } }}>{item.icon}</Box><Typography variant="body2" fontWeight={650}>{item.label}</Typography></Stack>
                    <Typography fontWeight={750}>{item.value}</Typography>
                  </Stack>
                  <LinearProgress color={item.color} variant="determinate" value={summary.totalStations ? (item.value / summary.totalStations) * 100 : 0} />
                </Box>
              ))}
              <Button fullWidth variant="outlined" endIcon={<ArrowIcon />} onClick={() => navigate('/stations')} sx={{ mt: 'auto !important' }}>Review network</Button>
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} xl={7}>
          <SectionCard title="Live session ledger" description="The latest charging activity reported by the network" action={<Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/transactions')}>Explore all</Button>} contentSx={{ p: '0 !important' }}>
            <TableContainer sx={{ border: 0, borderRadius: 0 }}>
              <Table>
                <TableHead><TableRow><TableCell>Session</TableCell><TableCell>Station</TableCell><TableCell>Started</TableCell><TableCell>Energy</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>
                  {transactions.length ? transactions.slice(0, 8).map(transaction => (
                    <TableRow hover key={transaction.id || transaction.transactionId} onClick={() => navigate(`/transactions/${transaction.transactionId}`)} sx={{ cursor: 'pointer' }}>
                      <TableCell><Typography variant="body2" fontWeight={700}>#{transaction.transactionId}</Typography><Typography variant="caption" color="text.secondary">{transaction.idTag || 'No tag'}</Typography></TableCell>
                      <TableCell>{transaction.charging_station?.name || transaction.chargePointId || 'Unknown'}</TableCell>
                      <TableCell>{transaction.startTime ? format(new Date(transaction.startTime), 'dd MMM, HH:mm') : '-'}</TableCell>
                      <TableCell>{formatEnergy(transaction.energyDelivered)}</TableCell>
                      <TableCell><Chip size="small" label={transaction.status || 'Unknown'} color={transaction.status === 'InProgress' ? 'primary' : 'success'} /></TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} align="center"><Typography color="text.secondary" sx={{ py: 4 }}>No charging sessions available</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Grid>
        <Grid item xs={12} xl={5}>
          <SectionCard title="Demand hotspots" description="Busiest chargers over the last 30 days" contentSx={{ height: 360 }}>
            {usageSeries.values.length ? <Bar data={usageChart} options={{ ...chartOptions, indexAxis: 'y' }} /> : <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><Typography color="text.secondary">No usage data available</Typography></Box>}
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <SectionCard title="Charger watchlist" description="Realtime status takes priority whenever the event stream is connected" action={<Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/stations')}>All stations</Button>}>
            <Grid container spacing={1.5}>
              {liveStations.slice(0, 6).map(station => (
                <Grid item xs={12} md={6} key={station.chargePointId}>
                  <Box onClick={() => navigate(`/stations/${station.chargePointId}`)} sx={{ p: 1.7, border: '1px solid', borderColor: 'divider', borderRadius: 3, cursor: 'pointer', transition: 'all 160ms ease', '&:hover': { borderColor: 'primary.light', bgcolor: 'rgba(37,99,235,.035)', transform: 'translateY(-1px)' } }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                      <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap>{station.name || station.chargePointId}</Typography><Typography variant="caption" color="text.secondary" noWrap>{station.chargePointId} - {station.vendor || 'EV charger'}</Typography></Box>
                      <Chip size="small" label={station.liveStatus} color={statusColor(station.liveStatus)} />
                    </Stack>
                  </Box>
                </Grid>
              ))}
              {!liveStations.length && <Grid item xs={12}><Typography color="text.secondary" align="center" sx={{ py: 4 }}>No stations configured</Typography></Grid>}
            </Grid>
          </SectionCard>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;
