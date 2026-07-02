import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  CircularProgress,
  LinearProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Badge,
  Tooltip,
  useTheme
} from '@mui/material';
import {
  EvStation as EvStationIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingUpIcon,
  Bolt as BoltIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Refresh as RefreshIcon,
  Notifications as NotificationsIcon
} from '@mui/icons-material';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../../services/api';
import { useMQTT } from '../../contexts/MQTTContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

// Fix default leaflet icons in webpack
const DefaultIcon = L.icon({
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.setIcon(DefaultIcon);

const PartnerDashboard = () => {
  const theme = useTheme();
  const { stationStatus: mqttStatus, isConnected: mqttConnected } = useMQTT();

  const [stats, setStats] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [locations, setLocations] = useState([]);
  const [trend, setTrend] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const [summaryRes, recentRes, performanceRes, monitorRes, trendRes, notifRes] = await Promise.all([
        api.get('/partner/dashboard/summary'),
        api.get('/partner/dashboard/recent-transactions?limit=10'),
        api.get('/partner/dashboard/performance-by-location'),
        api.get('/partner/monitor/locations').catch(() => ({ data: { success: false } })),
        api.get('/partner/dashboard/revenue-trend').catch(() => ({ data: { success: false } })),
        api.get('/partner/dashboard/notifications').catch(() => ({ data: { success: false } }))
      ]);

      if (summaryRes.data.success) {
        const s = summaryRes.data.summary;
        setStats({
          grossRevenue: s.grossRevenue || 0,
          productionCost: s.productionCost || 0,
          netProfit: s.profitAmount || 0,
          partnerEarnings: s.partnerEarning || 0,
          companyEarnings: s.companyEarning || 0,
          totalLocations: s.totalLocations || 0,
          totalStations: s.totalStations || 0,
          onlineStations: s.onlineStations || 0,
          offlineStations: s.offlineStations || 0,
          totalTransactions: s.totalTransactions || 0,
          energyDelivered: s.totalEnergyWh || 0,
          pendingSettlements: s.pendingSettlement || 0,
          paidSettlements: s.paidSettlement || 0
        });
      }

      if (recentRes.data.success) {
        setRecentTransactions(recentRes.data.transactions || []);
      }

      if (performanceRes.data.success) {
        setPerformance(performanceRes.data.performance || []);
      }

      if (monitorRes.data.success && monitorRes.data.locations) {
        setLocations(monitorRes.data.locations);
      }

      if (trendRes.data.success && trendRes.data.series) {
        setTrend(trendRes.data.series);
      }

      if (notifRes.data.success && notifRes.data.notifications) {
        setNotifications(notifRes.data.notifications);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000);
    return () => clearInterval(interval);
  }, []);

  const liveStationCounts = React.useMemo(() => {
    let online = 0;
    let offline = 0;
    let charging = 0;
    let faulted = 0;

    locations.forEach(loc => {
      (loc.stations || []).forEach(s => {
        const mqtt = mqttStatus[s.chargePointId];
        const status = mqtt?.status || s.status;
        if (status === 'Charging') {
          charging++;
          online++;
        } else if (status === 'Available' || status === 'Preparing') {
          online++;
        } else if (status === 'Faulted' || status === 'Fault') {
          faulted++;
          offline++;
        } else {
          offline++;
        }
      });
    });

    return { online, offline, charging, faulted };
  }, [locations, mqttStatus]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  const utilization = stats?.totalStations > 0
    ? Math.round(((liveStationCounts.online || stats.onlineStations || 0) / stats.totalStations) * 100)
    : 0;

  const avgRevenuePerSession = stats?.totalTransactions > 0
    ? Math.round((stats.partnerEarnings || 0) / stats.totalTransactions)
    : 0;

  const kpiCards = [
    {
      title: 'Gross Revenue',
      value: `₦${(stats?.grossRevenue || 0).toLocaleString()}`,
      icon: <MoneyIcon fontSize="large" color="primary" />,
      progress: 0
    },
    {
      title: 'Production Cost',
      value: `₦${(stats?.productionCost || 0).toLocaleString()}`,
      icon: <WarningIcon fontSize="large" color="warning" />,
      progress: 0
    },
    {
      title: 'Net Profit',
      value: `₦${(stats?.netProfit || 0).toLocaleString()}`,
      icon: <TrendingUpIcon fontSize="large" color="info" />,
      progress: 0
    },
    {
      title: 'Partner Earnings',
      value: `₦${(stats?.partnerEarnings || 0).toLocaleString()}`,
      icon: <MoneyIcon fontSize="large" color="success" />,
      progress: 0
    },
    {
      title: 'Energy Delivered',
      value: `${((stats?.energyDelivered || 0) / 1000).toFixed(1)} kWh`,
      icon: <BoltIcon fontSize="large" color="primary" />,
      progress: 0
    },
    {
      title: 'Sessions',
      value: (stats?.totalTransactions || 0).toLocaleString(),
      icon: <EvStationIcon fontSize="large" color="primary" />,
      progress: 0
    },
    {
      title: 'Avg Per Session',
      value: `₦${avgRevenuePerSession.toLocaleString()}`,
      icon: <TrendingUpIcon fontSize="large" color="primary" />,
      progress: 0
    },
    {
      title: 'Utilization',
      value: `${utilization}%`,
      icon: <ScheduleIcon fontSize="large" color="primary" />,
      progress: utilization
    }
  ];

  const stationStatusData = [
    { label: 'Online', value: liveStationCounts.online || stats?.onlineStations || 0, color: 'success' },
    { label: 'Offline', value: liveStationCounts.offline || stats?.offlineStations || 0, color: 'error' },
    { label: 'Charging', value: liveStationCounts.charging, color: 'info' },
    { label: 'Faulted', value: liveStationCounts.faulted, color: 'warning' }
  ];

  const chartLabels = trend.length > 0 ? trend.map(t => t.label) : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const revenueData = trend.length > 0 ? trend.map(t => t.revenue || 0) : [0, 0, 0, 0, 0, 0, 0];
  const energyData = trend.length > 0 ? trend.map(t => (t.energyWh || 0) / 1000) : [0, 0, 0, 0, 0, 0, 0];

  const revenueChartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Partner Revenue (₦)',
      data: revenueData,
      borderColor: theme.palette.success.main,
      backgroundColor: theme.palette.success.light + '80',
      fill: true,
      tension: 0.4
    }]
  };

  const energyChartData = {
    labels: chartLabels,
    datasets: [{
      label: 'Energy (kWh)',
      data: energyData,
      backgroundColor: theme.palette.primary.main,
      borderRadius: 4
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: theme.palette.divider }
      },
      x: {
        grid: { display: false }
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const validLocations = locations.filter(loc => loc.latitude && loc.longitude);
  const mapCenter = validLocations.length > 0
    ? [validLocations[0].latitude, validLocations[0].longitude]
    : [6.5244, 3.3792]; // Lagos default

  const renderMap = () => {
    if (validLocations.length === 0) {
      return (
        <Box
          sx={{
            height: 250,
            bgcolor: 'grey.100',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column'
          }}
        >
          <LocationIcon sx={{ fontSize: 48, color: 'grey.400', mb: 1 }} />
          <Typography variant="body2" color="textSecondary">
            No location coordinates available
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ height: 250, borderRadius: 2, overflow: 'hidden' }}>
        <MapContainer
          center={mapCenter}
          zoom={10}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {validLocations.map(loc => (
            <Marker key={loc.id} position={[loc.latitude, loc.longitude]}>
              <Popup>
                <Typography variant="subtitle2">{loc.name}</Typography>
                <Typography variant="body2">{loc.address || ''}, {loc.city}</Typography>
                <Typography variant="body2">
                  Stations: {loc.stationCount || 0} ({loc.onlineStations || 0} online)
                </Typography>
                <Typography variant="body2">
                  Today: ₦{(loc.todayPartnerEarning || 0).toLocaleString()}
                </Typography>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Box>
    );
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" component="h1">
            Partner Dashboard
          </Typography>
          <Typography variant="subtitle2" color="primary">
            EV Charging Partner Network - {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title={mqttConnected ? 'Live MQTT connected' : 'Live MQTT disconnected'}>
            <Chip
              size="small"
              color={mqttConnected ? 'success' : 'default'}
              label={mqttConnected ? 'LIVE' : 'OFFLINE'}
              sx={{ fontWeight: 'bold' }}
            />
          </Tooltip>
          <Tooltip title="Notifications">
            <IconButton>
              <Badge badgeContent={notifications.length} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <IconButton onClick={fetchDashboardData} title="Refresh dashboard data" disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {refreshing && <LinearProgress sx={{ mb: 3 }} />}

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {kpiCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Paper
              elevation={2}
              sx={{
                p: 2,
                height: '100%',
                borderRadius: 2,
                background: 'linear-gradient(45deg, #f5f7fa 0%, #eef2f5 100%)',
                '&:hover': {
                  boxShadow: 3
                }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                {card.icon}
                <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 'medium', ml: 1 }}>
                  {card.title}
                </Typography>
              </Box>
              <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
                {card.value}
              </Typography>
              {card.progress > 0 && (
                <LinearProgress
                  variant="determinate"
                  value={card.progress}
                  sx={{ height: 6, borderRadius: 3, mb: 1 }}
                />
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Station Status & Summary & Map */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Station Status
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h4">{stats?.totalStations || 0}</Typography>
              <Typography variant="body2" color="text.secondary">Total Stations</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={utilization}
              sx={{ height: 6, borderRadius: 3, mb: 2 }}
            />
            <Grid container spacing={1}>
              {stationStatusData.map((status) => (
                <Grid item xs={6} key={status.label}>
                  <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="h6" color={`${status.color}.main`}>
                      {status.value}
                    </Typography>
                    <Typography variant="caption">{status.label}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Settlement Summary
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText
                  primary="Gross Revenue"
                  secondary={`₦${(stats?.grossRevenue || 0).toLocaleString()}`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Production Cost"
                  secondary={`₦${(stats?.productionCost || 0).toLocaleString()}`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Net Profit"
                  secondary={`₦${(stats?.netProfit || 0).toLocaleString()}`}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Partner Earnings"
                  secondary={<Typography color="primary.main">₦{(stats?.partnerEarnings || 0).toLocaleString()}</Typography>}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Pending Settlement"
                  secondary={<Typography color="warning.main">₦{(stats?.pendingSettlements || 0).toLocaleString()}</Typography>}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Paid Settlement"
                  secondary={<Typography color="success.main">₦{(stats?.paidSettlements || 0).toLocaleString()}</Typography>}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Top Locations
            </Typography>
            {performance?.length > 0 ? (
              performance.slice(0, 5).map((loc, index) => (
                <Box key={loc.location_id} sx={{ mb: 2, pb: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">
                      {index + 1}. {loc.location_name}
                    </Typography>
                    <Chip size="small" label={`₦${(loc.total_partner_earning || 0).toLocaleString()}`} color="success" />
                  </Box>
                  <Typography variant="caption" color="textSecondary">
                    {loc.transaction_count || 0} sessions · {((loc.total_energy_wh || 0) / 1000).toFixed(1)} kWh
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="textSecondary">No location data</Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={3}>
          <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Live Map
            </Typography>
            {renderMap()}
          </Paper>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Revenue Trend (Last 7 Days)
            </Typography>
            <Box sx={{ height: 250 }}>
              {trend.length > 0 ? (
                <Line data={revenueChartData} options={chartOptions} />
              ) : (
                <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', pt: 10 }}>
                  No revenue data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Energy Delivered (Last 7 Days)
            </Typography>
            <Box sx={{ height: 250 }}>
              {trend.length > 0 ? (
                <Bar data={energyChartData} options={chartOptions} />
              ) : (
                <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center', pt: 10 }}>
                  No energy data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Notifications & Alerts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <WarningIcon color="warning" sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    Settlement cycle ends on {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString()}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: 'success.light', borderRadius: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    {liveStationCounts.online || stats?.onlineStations || 0} stations online and operational
                  </Typography>
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: 'error.light', borderRadius: 2, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ErrorIcon color="error" sx={{ mr: 1 }} />
                  <Typography variant="body2">
                    {liveStationCounts.offline || stats?.offlineStations || 0} stations offline — check monitor
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2, borderRadius: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Notifications ({notifications.length})
            </Typography>
            {notifications.length > 0 ? (
              <List dense sx={{ maxHeight: 140, overflow: 'auto' }}>
                {notifications.map((n) => (
                  <ListItem key={n.id} sx={{ px: 0 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: n.type === 'error' ? 'error.main' : n.type === 'warning' ? 'warning.main' : 'success.main'
                            }}
                          />
                          <Typography variant="body2" fontWeight={500}>
                            {n.title}
                          </Typography>
                        </Box>
                      }
                      secondary={n.message}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="textSecondary">No new notifications</Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Sessions */}
      <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>
          Recent Charging Sessions
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Station</TableCell>
                <TableCell>Location</TableCell>
                <TableCell>Energy</TableCell>
                <TableCell>Revenue</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentTransactions.length > 0 ? (
                recentTransactions.map((tx) => (
                  <TableRow key={tx.transactionId}>
                    <TableCell>{formatDate(tx.stopTime)}</TableCell>
                    <TableCell>{tx.chargePointId}</TableCell>
                    <TableCell>{tx.station_name || 'N/A'}</TableCell>
                    <TableCell>{tx.energyDelivered ? `${(tx.energyDelivered / 1000).toFixed(2)} kWh` : '0 kWh'}</TableCell>
                    <TableCell>₦{(tx.partnerEarning || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip size="small" color="success" label="Completed" />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    No recent sessions
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default PartnerDashboard;
