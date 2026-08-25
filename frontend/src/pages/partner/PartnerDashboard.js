import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Grid, LinearProgress, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography, useTheme
} from '@mui/material';
import {
  AccountBalanceWalletRounded as WalletIcon,
  ArrowForwardRounded as ArrowIcon,
  BoltRounded as BoltIcon,
  CalendarMonthRounded as MonthIcon,
  CheckCircleOutlineRounded as CheckIcon,
  ErrorOutlineRounded as ErrorIcon,
  EvStationRounded as StationIcon,
  LocationOnRounded as LocationIcon,
  MapRounded as MapIcon,
  ReceiptLongRounded as TransactionsIcon,
  RefreshRounded as RefreshIcon,
  ScheduleRounded as ScheduleIcon,
  TrendingUpRounded as TrendingIcon
} from '@mui/icons-material';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale,
  LineElement, PointElement, Tooltip as ChartTooltip
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../services/api';
import { useMQTT } from '../../contexts/MQTTContext';
import { evChargingMarker } from '../../utils/mapMarkerIcons';
import FullscreenMap, { MapBounds } from '../../components/maps/FullscreenMap';
import DashboardMetricTile from '../../components/ui/DashboardMetricTile';
import DashboardSkeleton from '../../components/ui/DashboardSkeleton';
import SectionCard from '../../components/ui/SectionCard';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ChartTooltip, Legend, Filler);

const ONLINE_STATUSES = new Set(['available', 'preparing', 'charging', 'finishing', 'reserved']);

const formatNaira = value => new Intl.NumberFormat('en-NG', {
  style: 'currency', currency: 'NGN', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(Number(value) || 0);

const formatEnergy = valueWh => {
  const kWh = (Number(valueWh) || 0) / 1000;
  if (kWh >= 1000) return `${(kWh / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} MWh`;
  return `${kWh.toLocaleString(undefined, { maximumFractionDigits: 2 })} kWh`;
};

const formatDate = value => value
  ? new Date(value).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '-';

const PartnerDashboard = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { stationStatus: mqttStatus, isConnected: mqttConnected, lastMessageAt } = useMQTT();
  const [stats, setStats] = useState({});
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [performance, setPerformance] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trend, setTrend] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const fetchingRef = useRef(false);
  const liveRefreshRef = useRef(null);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    setRefreshing(true);

    try {
      const [monthly, daily, yearly, lifetime, recent, byLocation, monitor, trendResponse, notificationResponse] = await Promise.all([
        api.get('/partner/dashboard/summary?range=monthly'),
        api.get('/partner/dashboard/summary?range=daily'),
        api.get('/partner/dashboard/summary?range=yearly'),
        api.get('/partner/dashboard/summary?range=all'),
        api.get('/partner/dashboard/recent-transactions?limit=10'),
        api.get('/partner/dashboard/performance-by-location').catch(() => ({ data: { success: false } })),
        api.get('/partner/monitor/locations').catch(() => ({ data: { success: false } })),
        api.get('/partner/dashboard/revenue-trend').catch(() => ({ data: { success: false } })),
        api.get('/partner/dashboard/notifications').catch(() => ({ data: { success: false } }))
      ]);

      const month = monthly.data?.summary || {};
      const today = daily.data?.summary || {};
      const year = yearly.data?.summary || {};
      const all = lifetime.data?.summary || {};
      setStats({
        partnerEarnings: Number(month.partnerEarning) || 0,
        totalLocations: Number(month.totalLocations) || 0,
        totalStations: Number(month.totalStations) || 0,
        onlineStations: Number(month.onlineStations) || 0,
        offlineStations: Number(month.offlineStations) || 0,
        totalTransactions: Number(month.totalTransactions) || 0,
        energyDelivered: Number(month.totalEnergyWh) || 0,
        pendingSettlements: Number(month.pendingSettlement) || 0,
        paidSettlements: Number(month.paidSettlement) || 0,
        todayPartnerEarning: Number(today.partnerEarning) || 0,
        todayEnergyWh: Number(today.totalEnergyWh) || 0,
        todaySessions: Number(today.totalTransactions) || 0,
        activeTransactions: Number(today.activeTransactions) || 0,
        activeEnergyWh: Number(today.activeEnergyWh) || 0,
        activePartnerEarning: Number(today.activePartnerEarning) || 0,
        yearPartnerEarning: Number(year.partnerEarning) || 0,
        yearEnergyWh: Number(year.totalEnergyWh) || 0,
        yearSessions: Number(year.totalTransactions) || 0,
        lifetimePartnerEarning: Number(all.partnerEarning) || 0,
        lifetimeEnergyWh: Number(all.totalEnergyWh) || 0,
        lifetimeSessions: Number(all.totalTransactions) || 0
      });
      setRecentTransactions(recent.data?.transactions || []);
      setPerformance(byLocation.data?.success ? (byLocation.data.performance || []) : []);
      setLocations(monitor.data?.success ? (monitor.data.locations || []) : []);
      setTrend(trendResponse.data?.success ? (trendResponse.data.series || []) : []);
      setNotifications(notificationResponse.data?.success ? (notificationResponse.data.notifications || []) : []);
      setError('');
    } catch (fetchError) {
      console.error('Error fetching partner dashboard:', fetchError);
      setError('Some partner metrics could not be refreshed. Your last available values remain visible.');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const liveStationCounts = useMemo(() => {
    const counts = { online: 0, offline: 0, charging: 0, faulted: 0 };
    locations.forEach(location => {
      (location.stations || []).forEach(station => {
        const status = String(mqttStatus[station.chargePointId]?.status || station.status || '').toLowerCase();
        if (status === 'charging') counts.charging += 1;
        if (status === 'faulted' || status === 'fault') counts.faulted += 1;
        if (ONLINE_STATUSES.has(status)) counts.online += 1;
        else counts.offline += 1;
      });
    });
    return counts;
  }, [locations, mqttStatus]);

  const validLocations = useMemo(
    () => locations.filter(location => Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))),
    [locations]
  );
  const mapCenter = validLocations.length
    ? [Number(validLocations[0].latitude), Number(validLocations[0].longitude)]
    : [6.5244, 3.3792];
  const effectiveOnline = mqttConnected || Object.keys(mqttStatus).length ? liveStationCounts.online : stats.onlineStations || 0;
  const utilization = stats.totalStations ? (effectiveOnline / stats.totalStations) * 100 : 0;
  const averageEarning = stats.totalTransactions ? stats.partnerEarnings / stats.totalTransactions : 0;

  const chartLabels = trend.length ? trend.map(item => item.label) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const earningsChart = {
    labels: chartLabels,
    datasets: [{ data: trend.length ? trend.map(item => Number(item.revenue) || 0) : Array(7).fill(0), borderColor: theme.palette.success.main, backgroundColor: 'rgba(18,183,106,.10)', fill: true, tension: 0.38, pointRadius: 3, pointBackgroundColor: theme.palette.success.main }]
  };
  const energyChart = {
    labels: chartLabels,
    datasets: [{ data: trend.length ? trend.map(item => (Number(item.energyWh) || 0) / 1000) : Array(7).fill(0), backgroundColor: theme.palette.primary.main, borderRadius: 7, maxBarThickness: 38 }]
  };
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

  if (loading) return <Box className="page-enter"><DashboardSkeleton /></Box>;

  return (
    <Box className="page-enter">
      {error && <Alert severity="warning" action={<Button size="small" color="inherit" onClick={() => fetchDashboardData()}>Retry</Button>} sx={{ mb: 2.5 }}>{error}</Alert>}

      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
        <Typography variant="h5">Today</Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<MapIcon />} onClick={() => navigate('/partner/monitor')} sx={{ minWidth: { xs: 42, sm: 'auto' }, px: { xs: 1.1, sm: 2 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Live map</Box></Button>
          <Button size="small" variant="contained" startIcon={<RefreshIcon />} onClick={() => fetchDashboardData()} disabled={refreshing} sx={{ minWidth: { xs: 42, sm: 'auto' }, px: { xs: 1.1, sm: 2 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{refreshing ? 'Refreshing...' : 'Refresh'}</Box></Button>
        </Stack>
      </Stack>

      <Grid container spacing={{ xs: 1.15, sm: 1.5 }} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={3}><DashboardMetricTile emphasis label="Your earnings today" value={formatNaira(stats.todayPartnerEarning)} helper={`${stats.activeTransactions || 0} running - live estimate included`} icon={<TrendingIcon />} color="success" /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Energy today" value={formatEnergy(stats.todayEnergyWh)} helper={`${formatNaira(stats.todayPartnerEarning)} your earning - live`} icon={<BoltIcon />} color="primary" /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Sessions today" value={Number(stats.todaySessions || 0).toLocaleString()} helper={`${formatEnergy(stats.activeEnergyWh)} in running sessions`} icon={<TransactionsIcon />} color="info" onClick={() => navigate('/partner/transactions')} /></Grid>
        <Grid item xs={6} md={3}><DashboardMetricTile label="Stations online" value={`${effectiveOnline}/${stats.totalStations || 0}`} helper={`${utilization.toFixed(1)}% availability`} icon={<StationIcon />} color="success" onClick={() => navigate('/partner/stations')} /></Grid>
      </Grid>

      <Typography variant="h5" sx={{ mb: 1.5 }}>Your totals</Typography>
      <Grid container spacing={{ xs: 1.15, sm: 1.5 }} sx={{ mb: 2.5 }}>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="This month earnings" value={formatNaira(stats.partnerEarnings)} helper={`${stats.totalTransactions || 0} sessions - ${formatEnergy(stats.energyDelivered)}`} icon={<MonthIcon />} color="success" onClick={() => navigate('/partner/performance')} /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="This month energy" value={formatEnergy(stats.energyDelivered)} helper={`${formatNaira(averageEarning)} average earning`} icon={<BoltIcon />} color="primary" /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="This year earnings" value={formatNaira(stats.yearPartnerEarning)} helper={`${stats.yearSessions || 0} sessions - ${formatEnergy(stats.yearEnergyWh)}`} icon={<TrendingIcon />} color="success" /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="All-time earnings" value={formatNaira(stats.lifetimePartnerEarning)} helper="Your earnings from every completed session" icon={<WalletIcon />} color="success" /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="All-time energy" value={formatEnergy(stats.lifetimeEnergyWh)} helper={`${formatNaira(stats.lifetimePartnerEarning)} your earnings`} icon={<BoltIcon />} color="primary" /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="All-time sessions" value={Number(stats.lifetimeSessions || 0).toLocaleString()} helper={`${formatEnergy(stats.lifetimeSessions ? stats.lifetimeEnergyWh / stats.lifetimeSessions : 0)} average`} icon={<TransactionsIcon />} color="info" onClick={() => navigate('/partner/transactions')} /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="Pending payout" value={formatNaira(stats.pendingSettlements)} helper="Awaiting settlement" icon={<ScheduleIcon />} color="warning" onClick={() => navigate('/partner/settlements')} /></Grid>
        <Grid item xs={6} md={4} xl={3}><DashboardMetricTile label="Paid settlements" value={formatNaira(stats.paidSettlements)} helper="Completed partner payouts" icon={<CheckIcon />} color="success" onClick={() => navigate('/partner/settlements')} /></Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} lg={8}>
          <SectionCard
            title="Earnings trajectory"
            description="Your earnings from completed charging sessions over time"
            action={<Chip size="small" label="Partner earnings only" color="success" variant="outlined" />}
            contentSx={{ height: { xs: 320, md: 390 } }}
            sx={{ position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', width: 180, height: 180, borderRadius: '50%', right: -90, top: -110, bgcolor: 'rgba(18,183,106,.06)', pointerEvents: 'none' } }}
          >
            <Line data={earningsChart} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, tooltip: { ...chartOptions.plugins.tooltip, callbacks: { label: context => formatNaira(context.parsed.y) } } } }} />
          </SectionCard>
        </Grid>
        <Grid item xs={12} lg={4}>
          <SectionCard title="Payout readiness" description="A clear view of your settlement position" contentSx={{ height: 'calc(100% - 82px)' }}>
            <Stack spacing={2} sx={{ height: '100%' }}>
              <Box sx={{ p: 2.2, borderRadius: 3.5, background: 'linear-gradient(135deg, #FFFAEB, #FFF4D6)', border: '1px solid rgba(247,144,9,.17)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="caption" color="warning.dark" fontWeight={700}>PENDING PAYOUT</Typography><Typography variant="h4" color="warning.dark" sx={{ mt: 0.7 }}>{formatNaira(stats.pendingSettlements)}</Typography></Box><ScheduleIcon color="warning" /></Stack>
              </Box>
              <Box sx={{ p: 2.2, borderRadius: 3.5, bgcolor: 'success.light', border: '1px solid rgba(18,183,106,.17)' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="caption" color="success.dark" fontWeight={700}>PAID TO DATE</Typography><Typography variant="h4" color="success.dark" sx={{ mt: 0.7 }}>{formatNaira(stats.paidSettlements)}</Typography></Box><CheckIcon color="success" /></Stack>
              </Box>
              <Box sx={{ px: 0.4 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Sessions this month</Typography><Typography variant="body2" fontWeight={750}>{stats.totalTransactions?.toLocaleString() || 0}</Typography></Stack><LinearProgress variant="determinate" color="success" value={Math.min((stats.totalTransactions || 0) * 2, 100)} sx={{ mt: 1.1 }} /></Box>
              <Button fullWidth variant="outlined" endIcon={<ArrowIcon />} onClick={() => navigate('/partner/settlements')} sx={{ mt: 'auto !important' }}>Open settlement centre</Button>
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} xl={7}>
          <SectionCard title="Live network footprint" description={`${validLocations.length} mapped location${validLocations.length === 1 ? '' : 's'} - ${stats.totalStations || 0} stations`} action={<Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/partner/monitor')}>Fullscreen monitor</Button>} contentSx={{ p: '0 !important' }}>
            {validLocations.length ? (
              <Box sx={{ overflow: 'hidden', borderRadius: '0 0 18px 18px' }}>
                <FullscreenMap center={mapCenter} zoom={10} height={420} ariaLabel="Partner network map">
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap contributors' />
                  <MapBounds locations={validLocations} defaultCenter={mapCenter} defaultZoom={10} />
                  {validLocations.map(location => (
                    <Marker key={location.id} position={[Number(location.latitude), Number(location.longitude)]} icon={evChargingMarker(location)}>
                      <Popup><Typography variant="subtitle2">{location.name}</Typography><Typography variant="body2">{location.address || location.city}</Typography><Typography variant="body2">{location.stationCount || location.stations?.length || 0} stations</Typography><Typography variant="body2" color="success.main" fontWeight={700}>Today: {formatNaira(location.todayPartnerEarning)}</Typography></Popup>
                    </Marker>
                  ))}
                </FullscreenMap>
              </Box>
            ) : <Box sx={{ height: 420, display: 'grid', placeItems: 'center', bgcolor: '#F8FAFC' }}><Stack alignItems="center" spacing={1}><LocationIcon sx={{ fontSize: 44, color: 'text.disabled' }} /><Typography color="text.secondary">No mapped locations available</Typography></Stack></Box>}
          </SectionCard>
        </Grid>
        <Grid item xs={12} xl={5}>
          <SectionCard title="Energy contribution" description="Daily energy supplied across your locations" contentSx={{ height: 420 }}>
            <Bar data={energyChart} options={chartOptions} />
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        <Grid item xs={12} lg={7}>
          <SectionCard title="Earning session ledger" description="Latest sessions contributing to your earnings" action={<Button size="small" endIcon={<ArrowIcon />} onClick={() => navigate('/partner/transactions')}>Explore all</Button>} contentSx={{ p: '0 !important' }}>
            <TableContainer sx={{ border: 0, borderRadius: 0 }}>
              <Table>
                <TableHead><TableRow><TableCell>Time</TableCell><TableCell>Station</TableCell><TableCell>Energy</TableCell><TableCell>Your earning</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                <TableBody>
                  {recentTransactions.length ? recentTransactions.slice(0, 8).map(transaction => (
                    <TableRow hover key={transaction.transactionId}>
                      <TableCell>{formatDate(transaction.stopTime || transaction.startTime)}</TableCell>
                      <TableCell><Typography variant="body2" fontWeight={650}>{transaction.station_name || transaction.chargePointId}</Typography><Typography variant="caption" color="text.secondary">#{transaction.transactionId}</Typography></TableCell>
                      <TableCell>{((Number(transaction.energyDelivered) || 0) / 1000).toFixed(2)} kWh</TableCell>
                      <TableCell><Typography fontWeight={750} color="success.dark">{formatNaira(transaction.partnerEarning)}</Typography></TableCell>
                      <TableCell><Chip size="small" color="success" label={transaction.status || 'Completed'} /></TableCell>
                    </TableRow>
                  )) : <TableRow><TableCell colSpan={5} align="center"><Typography color="text.secondary" sx={{ py: 4 }}>No recent sessions</Typography></TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Grid>
        <Grid item xs={12} lg={5}>
          <SectionCard title="Location leaders" description="How each site contributes to your earnings">
            <Stack spacing={1.4}>
              {performance.length ? performance.slice(0, 6).map((location, index) => {
                const value = Number(location.total_partner_earning) || 0;
                const max = Math.max(...performance.map(item => Number(item.total_partner_earning) || 0), 1);
                return (
                  <Box key={location.location_id || location.location_name || index} sx={{ p: 1.6, border: '1px solid', borderColor: 'divider', borderRadius: 3, transition: 'border-color 160ms ease, transform 160ms ease', '&:hover': { borderColor: 'success.light', transform: 'translateX(2px)' } }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}><Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={700} noWrap><Box component="span" sx={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, mr: 1, borderRadius: '50%', bgcolor: index === 0 ? 'success.main' : 'grey.100', color: index === 0 ? '#fff' : 'text.secondary', fontSize: '0.7rem' }}>{index + 1}</Box>{location.location_name || 'Location'}</Typography><Typography variant="caption" color="text.secondary">{location.transaction_count || 0} sessions - {((Number(location.total_energy_wh) || 0) / 1000).toFixed(1)} kWh</Typography></Box><Typography variant="body2" color="success.dark" fontWeight={750}>{formatNaira(value)}</Typography></Stack>
                    <LinearProgress variant="determinate" color="success" value={(value / max) * 100} sx={{ mt: 1.2 }} />
                  </Box>
                );
              }) : <Typography color="text.secondary" align="center" sx={{ py: 5 }}>No location performance data yet</Typography>}
            </Stack>
          </SectionCard>
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={8}>
          <SectionCard title="Network condition" description="Current status of the stations under your portfolio">
            <Grid container spacing={1.5}>
              {[
                { label: 'Online', value: effectiveOnline, color: 'success', icon: <CheckIcon /> },
                { label: 'Charging', value: liveStationCounts.charging, color: 'primary', icon: <BoltIcon /> },
                { label: 'Offline', value: liveStationCounts.offline, color: 'warning', icon: <ScheduleIcon /> },
                { label: 'Faulted', value: liveStationCounts.faulted, color: 'error', icon: <ErrorIcon /> }
              ].map(item => (
                <Grid item xs={6} md={3} key={item.label}>
                  <Box sx={{ p: 2, borderRadius: 3, bgcolor: `${item.color}.light`, minHeight: 112 }}><Box sx={{ color: `${item.color}.main`, display: 'flex' }}>{item.icon}</Box><Typography variant="h4" sx={{ mt: 1 }}>{item.value}</Typography><Typography variant="caption" color="text.secondary">{item.label}</Typography></Box>
                </Grid>
              ))}
            </Grid>
          </SectionCard>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Box onClick={() => navigate('/partner/stations')} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && navigate('/partner/stations')} sx={{ height: '100%', minHeight: 210, p: 3, borderRadius: 4.5, cursor: 'pointer', color: '#FFFFFF', background: 'linear-gradient(145deg, #0B2B24, #0E9F6E)', position: 'relative', overflow: 'hidden', transition: 'transform 180ms ease', '&:hover': { transform: 'translateY(-2px)' }, '&::after': { content: '""', position: 'absolute', width: 190, height: 190, right: -70, bottom: -100, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.08)' } }}>
            <Stack direction="row" justifyContent="space-between"><Box sx={{ width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,.12)' }}><StationIcon /></Box><ArrowIcon sx={{ color: 'rgba(255,255,255,.6)' }} /></Stack>
            <Typography variant="h5" sx={{ mt: 3 }}>Take control of your stations</Typography>
            <Typography variant="body2" sx={{ mt: 0.8, color: 'rgba(255,255,255,.65)', maxWidth: 320 }}>View connector details, operational states and site assignments.</Typography>
          </Box>
        </Grid>
      </Grid>

      {(liveStationCounts.faulted > 0 || liveStationCounts.offline > 0 || notifications.length > 0) && (
        <Box sx={{ mt: 2.5 }}><SectionCard title="Attention centre" description="Items that may need your review"><Grid container spacing={1.5}>{liveStationCounts.faulted > 0 && <Grid item xs={12} md={4}><Alert severity="error" icon={<ErrorIcon />}>{liveStationCounts.faulted} faulted station{liveStationCounts.faulted === 1 ? '' : 's'} need attention.</Alert></Grid>}{liveStationCounts.offline > 0 && <Grid item xs={12} md={4}><Alert severity="warning">{liveStationCounts.offline} station{liveStationCounts.offline === 1 ? ' is' : 's are'} currently offline.</Alert></Grid>}{notifications.slice(0, 3).map((notification, index) => <Grid item xs={12} md={4} key={notification.id || index}><Alert severity={notification.type === 'error' ? 'error' : notification.type === 'warning' ? 'warning' : 'info'}>{notification.title || notification.message}</Alert></Grid>)}</Grid></SectionCard></Box>
      )}
    </Box>
  );
};

export default PartnerDashboard;
