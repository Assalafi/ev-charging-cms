import React, {
    useState,
    useEffect
} from 'react';
import {
    useNavigate
} from 'react-router-dom';
import {
    Grid,
    Paper,
    Typography,
    Box,
    Card,
    CardContent,
    CardHeader,
    IconButton,
    Divider,
    Chip,
    List,
    ListItem,
    ListItemText,
    LinearProgress,
    Button,
    Tooltip
} from '@mui/material';
import {
    Refresh as RefreshIcon,
    EvStation as StationIcon,
    BatteryChargingFull as ChargingIcon,
    Error as ErrorIcon,
    Bolt as EnergyIcon,
    SwapHoriz as TransactionIcon,
    Speed as MeterIcon,
    MoreVert as MoreIcon,
    // Removed unused icons
    Info as InfoIcon,
    FiberManualRecord as FiberManualRecordIcon
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
import {
    Line,
    Bar
} from 'react-chartjs-2';
import {
    format
} from 'date-fns';
import api from '../services/api';
import {
    useMQTT
} from '../contexts/MQTTContext';
import {
    formatCurrency,
    calculatePrice
} from '../utils/currencyFormatter';
import PricingWidget from '../components/PricingWidget';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, ChartTooltip, Legend, Filler);

function Dashboard() {
    const navigate = useNavigate();
    const {
        stationStatus
    } = useMQTT();

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalStations: 0,
        connectedStations: 0,
        activeTransactions: 0,
        energyToday: 0,
        revenueToday: 0,
        stationUptime: 0,
        totalTransactions: 0,
        transactionSuccessRate: 0
    });
    const [stations, setStations] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [energyData, setEnergyData] = useState({
        labels: [],
        datasets: []
    });
    const [energyRawRecords, setEnergyRawRecords] = useState({});
    const [energyUsingFallback, setEnergyUsingFallback] = useState(false);
    const [stationUsage, setStationUsage] = useState({
        labels: [],
        datasets: []
    });

    // Fetch dashboard data
    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            // Fetch all data in parallel
            const [
                todayEnergyResponse,
                paymentTransactionsResponse,
                statsResponse,
                stationsResponse,
                transactionsResponse,
                energyResponse,
                stationUsageResponse
            ] = await Promise.all([
                // Get today's energy from database
                api.get('/transactions/stats/today'),
                // Get today's payment transactions for real revenue
                api.get('/admin/payments/transactions', {
                    params: {
                        startDate: new Date().toISOString().split('T')[0] + 'T00:00:00.000Z',
                        endDate: new Date().toISOString().split('T')[0] + 'T23:59:59.999Z',
                        status: 'SUCCESS',
                        type: 'CREDIT',
                        gateway: 'paystack',
                        limit: 10000
                    }
                }),
                // Get summary statistics
                api.get('/stations/stats/summary'),
                // Get all stations
                api.get('/stations'),
                // Get recent transactions
                api.get('/transactions?limit=5'),
                // Get weekly energy stats
                api.get('/transactions/stats/energy?period=week'),
                // Get station usage
                api.get('/transactions/stats/usage?period=month')
            ]);
            
            // Get daily energy from backend and calculate revenue from payments
            const dailyEnergy = todayEnergyResponse.data?.energyToday || 0;
            let dailyRevenue = 0;

            // Calculate real revenue from successful payment transactions
            if (paymentTransactionsResponse.data?.transactions?.length > 0) {
                paymentTransactionsResponse.data.transactions.forEach(payment => {
                    const amount = parseFloat(payment.amount) || 0;
                    dailyRevenue += amount;
                });
                console.log('Today\'s payment transactions for revenue:', paymentTransactionsResponse.data.transactions);
            }
            
            console.log('Calculated values:', { dailyEnergy, dailyRevenue });
            
            // Get station stats
            const stats = statsResponse.data.stats || {};
            const stationCount = stationsResponse.data.stations?.length || 0;

            // Calculate station uptime based on available data
            const calculateStationUptime = () => {
                if (!stationsResponse.data.stations || stationsResponse.data.stations.length === 0) {
                    return 0;
                }
                
                // Count stations with status "Available" or "Preparing" or "Charging"
                let onlineCount = 0;
                stationsResponse.data.stations.forEach(station => {
                    const status = station.status?.toLowerCase() || '';
                    if (status === 'available' || status === 'preparing' || status === 'charging') {
                        onlineCount++;
                    }
                });
                
                // Calculate percentage - use the true count of online stations
                const connectedCount = stats.connectedStations || onlineCount;
                const totalCount = stats.totalStations || stationCount;
                return totalCount > 0 ? (connectedCount / totalCount) * 100 : 0;
            };
            
            // Calculate transaction success rate
            const calculateTransactionSuccessRate = () => {
                // Get data from the most recent transactions
                const allTransactions = transactionsResponse.data.transactions || [];
                if (!allTransactions || allTransactions.length === 0) {
                    return 0;
                }
                
                // Count successful transactions (those with status "Completed" without errors)
                let successCount = 0;
                let totalCount = 0;
                
                allTransactions.forEach(transaction => {
                    totalCount++;
                    const status = transaction.status?.toLowerCase() || '';
                    // Consider a transaction successful if it completed normally
                    if (status === 'completed' && !transaction.errorCode) {
                        successCount++;
                    }
                });

                // Calculate success percentage
                return totalCount > 0 ? (successCount / totalCount) * 100 : 0;
            };
            
            // Update stats with all data including calculated metrics
            const stationUptime = calculateStationUptime();
            const transactionSuccessRate = calculateTransactionSuccessRate();
            const totalTransactions = transactionsResponse.data.totalCount || 0;
            setStats(prev => ({
                ...prev,
                totalStations: stats.totalStations || stationCount,
                connectedStations: stats.connectedStations || 0,
                activeTransactions: stats.activeTransactions || 0,
                totalTransactions: totalTransactions,
                energyToday: dailyEnergy,
                revenueToday: dailyRevenue,
                stationUptime: stationUptime,
                transactionSuccessRate: transactionSuccessRate
            }));

            // Update stations and transactions
            setStations(stationsResponse.data.stations || []);
            setTransactions(transactionsResponse.data.transactions || []);

            // Process weekly energy data to ensure we have all days of the week
            const processedWeeklyData = () => {
                // Get today's day name to ensure we're showing data for the right day
                const today = format(new Date(), 'EEEE');
                console.log('Today is:', today); // This will help debug day names

                // Define days of week in order (starting with Monday)
                const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

                // Accurate data from our database query - adjusted to ensure Monday shows correctly
                const fallbackData = {};

                // Initialize all days to 0
                daysOfWeek.forEach(day => {
                    fallbackData[day] = 0;
                });

                // We'll rely on real data from the API now rather than hardcoded values
                // The fallbackData will only be used if the API response doesn't provide valid data

                console.log('Energy data by day:', fallbackData);

                // Raw records tracking for debugging
                const rawRecords = daysOfWeek.reduce((acc, day) => {
                    acc[day] = [];
                    return acc;
                }, {});

                // Set this to true to use real data from the API instead of fallback data
                const hasRealData = true;

                // If we have real data, use it
                if (hasRealData) {
                    // Initialize data structure
                    const weekData = daysOfWeek.reduce((acc, day) => {
                        acc[day] = 0;
                        return acc;
                    }, {});

                    // Process the data from the API
                    energyResponse.data.energyStats.forEach(item => {
                        try {
                            // Get date from timestamp (could be in various formats)
                            let date;
                            if (typeof item.timestamp === 'string') {
                                if (item.timestamp.includes('-')) {
                                    // Format: YYYY-MM-DD
                                    const parts = item.timestamp.split('-');
                                    if (parts.length >= 3) {
                                        date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                    }
                                } else {
                                    // Try standard JS date parsing
                                    date = new Date(item.timestamp);
                                }
                            } else {
                                // If it's a number (timestamp), convert it
                                date = new Date(item.timestamp);
                            }

                            // Only process valid dates
                            if (date && !isNaN(date.getTime())) {
                                const dayName = format(date, 'EEEE');
                                const energy = parseFloat(item.energy) || 0;
                                weekData[dayName] = (weekData[dayName] || 0) + energy;

                                // Store raw record for debugging
                                rawRecords[dayName].push({
                                    timestamp: item.timestamp,
                                    energy: energy,
                                    formattedDate: format(date, 'yyyy-MM-dd')
                                });
                            }
                        } catch (err) {
                            console.error('Error processing energy data:', err);
                        }
                    });

                    // Update the raw records state
                    setEnergyRawRecords(rawRecords);
                    setEnergyUsingFallback(false);

                    return {
                        labels: daysOfWeek,
                        values: daysOfWeek.map(day => parseFloat((weekData[day] || 0).toFixed(1)))
                    };
                } else {
                    // Use fallback demo data for better visualization
                    setEnergyUsingFallback(true);

                    // Create empty raw records
                    setEnergyRawRecords({});

                    return {
                        labels: daysOfWeek,
                        values: daysOfWeek.map(day => fallbackData[day])
                    };
                }
            };

            // Get processed weekly data
            const weeklyData = processedWeeklyData();

            // Set the energy chart data
            setEnergyData({
                labels: weeklyData.labels,
                datasets: [{
                    label: 'Weekly Energy (kWh)',
                    data: weeklyData.values,
                    borderColor: 'rgba(25, 118, 210, 0.8)',
                    backgroundColor: 'rgba(25, 118, 210, 0.2)',
                    fill: true
                }]
            });

            // Process station usage data
            if (stationUsageResponse?.data?.stationUsage) {
                setStationUsage({
                    labels: stationUsageResponse.data.stationUsage.map(item =>
                        item.charging_station?.name || item.chargePointId || 'Unknown'
                    ),
                    datasets: [{
                        label: 'Transactions',
                        data: stationUsageResponse.data.stationUsage.map(item => parseInt(item.count) || 0),
                        backgroundColor: 'rgba(56, 142, 60, 0.8)',
                    }]
                });
            }

            setLoading(false);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();

        // Refresh data every 60 seconds
        const interval = setInterval(fetchDashboardData, 60000);

        return () => clearInterval(interval);
    }, []);

    // Handle station card click
    const handleStationClick = (chargePointId) => {
        navigate(`/stations/${chargePointId}`);
    };

    // Get color for station status
    const getStatusColor = (status) => {
        switch (status) {
            case 'Available':
                return 'success';
            case 'Charging':
                return 'primary';
            case 'Faulted':
                return 'error';
            case 'Preparing':
                return 'warning';
            case 'Finishing':
                return 'info';
            case 'Reserved':
                return 'secondary';
            default:
                return 'default';
        }
    };

    // Get real-time status for a station
    const getRealtimeStatus = (chargePointId) => {
        const realtimeStatus = stationStatus[chargePointId];
        if (realtimeStatus) {
            return realtimeStatus.status || null;
        }
        return null;
    };

    // Navigate to firmware management
    // Removed navigation handlers for firmware and diagnostics

    // Chart options
    const lineChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Weekly Energy Consumption (Monday-Sunday)',
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                title: {
                    display: true,
                    text: 'Energy (kWh)'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Day of Week'
                }
            }
        },
    };

    const barChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
            },
            title: {
                display: true,
                text: 'Station Usage (Last 30 Days)',
            },
        },
        scales: {
            y: {
                beginAtZero: true,
            },
        },
    };

    return (
        <Box>
            <Box sx={{
                mb: 3,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Box>
                    <Typography variant="h4" component="h1">
                        Dashboard
                    </Typography>
                    <Typography variant="subtitle2" color="primary">
                        EV Charging Network - {format(new Date(), 'EEEE, dd MMMM yyyy')}
                    </Typography>
                </Box>
                <Box>
                    <IconButton onClick={fetchDashboardData} title="Refresh dashboard data">
                        <RefreshIcon />
                    </IconButton>
                </Box>
            </Box>

            {loading && <LinearProgress sx={{ mb: 3 }} />}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
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
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 1
                        }}>
                            <StationIcon 
                                fontSize="large" 
                                color="primary"
                                sx={{ mr: 1 }}
                            />
                            <Typography 
                                variant="h6"
                                color="text.secondary"
                                sx={{
                                    fontWeight: 'medium'
                                }}
                            >
                                Total Stations
                            </Typography>
                        </Box>
                        <Typography 
                            variant="h4"
                            component="div"
                            sx={{
                                fontWeight: 'bold',
                                mb: 1
                            }}
                        >
                            {stats.totalStations}
                        </Typography>
                        <Tooltip title="Connected / Total Stations">
                            <LinearProgress 
                                variant="determinate"
                                value={(stats.connectedStations / stats.totalStations) * 100 || 0}
                                sx={{
                                    height: 6,
                                    borderRadius: 3,
                                    mb: 1
                                }}
                            />
                        </Tooltip>
                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <Typography variant="caption" color="text.secondary" fontWeight="medium">
                                {`${stats.connectedStations || 0} Connected`}
                            </Typography>
                            <Tooltip title="Station Uptime">
                                <Typography 
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <FiberManualRecordIcon 
                                        fontSize="small"
                                        sx={{
                                            color: 'success.main',
                                            fontSize: '0.75rem',
                                            mr: 0.5
                                        }}
                                    />
                                    {`${stats.stationUptime.toFixed(1)}%`}
                                </Typography>
                            </Tooltip>
                        </Box>
                    </Paper>
                </Grid>

                {/* Connected Stations card removed as requested - information already available in Total Stations card */}

                <Grid item xs={12} sm={6} md={3}>
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
                        <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            mb: 1
                        }}>
                            <TransactionIcon 
                                fontSize="large" 
                                color="primary"
                                sx={{ mr: 1 }}
                            />
                            <Typography 
                                variant="h6"
                                color="text.secondary"
                                sx={{
                                    fontWeight: 'medium'
                                }}
                            >
                                Active Transactions
                            </Typography>
                        </Box>
                        <Typography 
                            variant="h4"
                            component="div"
                            sx={{
                                fontWeight: 'bold',
                                mb: 1
                            }}
                        >
                            {stats.activeTransactions}
                        </Typography>
                        <Tooltip title="Active / Total Transactions">
                            <LinearProgress 
                                variant="determinate"
                                value={(stats.activeTransactions / stats.totalTransactions) * 100 || 0}
                                sx={{
                                    height: 6,
                                    borderRadius: 3,
                                    mb: 1
                                }}
                            />
                        </Tooltip>
                        <Box sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <Typography variant="caption" color="text.secondary" fontWeight="medium">
                                {`${stats.totalTransactions || 0} Total`}
                            </Typography>
                            <Tooltip title="Transaction Success Rate">
                                <Typography 
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <FiberManualRecordIcon 
                                        fontSize="small"
                                        sx={{
                                            color: 'success.main',
                                            fontSize: '0.75rem',
                                            mr: 0.5
                                        }}
                                    />
                                    {`${stats.transactionSuccessRate.toFixed(1)}%`}
                                </Typography>
                            </Tooltip>
                        </Box>
                    </Paper>
                </Grid>

                {/* No empty placeholder needed since we have 4 equally sized cards */}

                {/* Energy Today Card */}
                <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2, background: 'linear-gradient(45deg, #f5f7fa 0%, #eef2f5 100%)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <EnergyIcon color="warning" sx={{ fontSize: 36, mr: 1 }} />
                            <Typography 
                                variant="h6"
                                color="text.secondary"
                                sx={{
                                    fontWeight: 'medium'
                                }}
                            >
                                Energy Today
                            </Typography>
                        </Box>
                        <Typography 
                            variant="h4"
                            component="div"
                            sx={{
                                fontWeight: 'bold',
                                mb: 1
                            }}
                        >
                            {stats.energyToday.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} kWh
                        </Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, height: '100%', borderRadius: 2, background: 'linear-gradient(45deg, #f5f7fa 0%, #eef2f5 100%)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <IconButton sx={{ backgroundColor: 'rgba(0, 120, 0, 0.1)', mr: 1 }}>
                                <Typography variant="h6" color="success.main" sx={{ fontWeight: 'bold' }}>₦</Typography>
                            </IconButton>
                            <Typography 
                                variant="h6"
                                color="text.secondary"
                                sx={{
                                    fontWeight: 'medium'
                                }}
                            >
                                Revenue Today
                                <Tooltip title="Revenue based on Nigerian electricity pricing model with peak/off-peak rates">
                                    <InfoIcon fontSize="small" sx={{ ml: 0.5, color: 'text.secondary', verticalAlign: 'middle' }} />
                                </Tooltip>
                            </Typography>
                        </Box>
                        <Typography 
                            variant="h4"
                            component="div"
                            sx={{
                                fontWeight: 'bold',
                                mb: 1
                            }}
                        >
                            ₦{stats.revenueToday.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            {/* Main content */}
            <Grid container spacing={3}>
                {/* Stations section */}
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%', borderRadius: 2 }}>
                        <CardHeader
                            title="Charging Stations"
                            action={
                                <IconButton onClick={() => navigate('/stations')}>
                                    <MoreIcon />
                                </IconButton>
                            }
                        />
                        <Divider />
                        <CardContent sx={{ maxHeight: 350, overflow: 'auto' }}>
                            {stations.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" align="center">
                                    No stations available
                                </Typography>
                            ) : (
                                <List>
                                    {stations.slice(0, 5).map((station) => {
                                        const realtimeStatus = getRealtimeStatus(station.chargePointId);
                                        const displayStatus = realtimeStatus || station.status;

                                        return (
                                            <React.Fragment key={station.chargePointId}>
                                                <ListItem 
                                                    button 
                                                    onClick={() => handleStationClick(station.chargePointId)}
                                                >
                                                    <ListItemText 
                                                        primary={
                                                            <Box 
                                                                sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between'
                                                                }}
                                                                component="span"
                                                            >
                                                                <Typography variant="subtitle1" component="span">
                                                                    {station.name}
                                                                </Typography>
                                                                <Chip
                                                                    label={displayStatus}
                                                                    size="small"
                                                                    color={getStatusColor(displayStatus)}
                                                                />
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Box 
                                                                sx={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'space-between',
                                                                    mt: 1
                                                                }}
                                                                component="span"
                                                            >
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    ID: {station.chargePointId}
                                                                </Typography>
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    {station.model} • {station.vendor}
                                                                </Typography>
                                                            </Box>
                                                        }
                                                    />
                                                </ListItem>
                                                <Divider />
                                            </React.Fragment>
                                        );
                                    })}
                                </List>
                            )}
                        </CardContent>
                        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', pb: 2 }}>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => navigate('/stations')}
                            >
                                View All Stations
                            </Button>
                        </Box>
                    </Card>
                </Grid>

            {/* Recent transactions */}
            <Grid item xs={12} md={6}>
                <Card sx={{
                    height: '100%',
                    borderRadius: 2
                }}>
                    <CardHeader
                        title="Recent Transactions"
                        action={
                            <IconButton onClick={() => navigate('/transactions')}>
                                <MoreIcon />
                            </IconButton>
                        }
                    />
                    <Divider />
                    <CardContent sx={{ maxHeight: 350, overflow: 'auto' }}>
                        {transactions.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" align="center">
                                No transactions available
                            </Typography>
                        ) : (
                            <List>
                                {transactions.map((transaction) => (
                                    <React.Fragment key={transaction.id}>
                                        <ListItem 
                                            button 
                                            onClick={() => navigate(`/transactions/${transaction.transactionId}`)}
                                        >
                                            <ListItemText 
                                                primary={
                                                    <Box 
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between'
                                                        }}
                                                        component="span"
                                                    >
                                                        <Typography variant="subtitle1" component="span">
                                                            Transaction #{transaction.transactionId}
                                                        </Typography>
                                                        <Chip
                                                            label={transaction.status}
                                                            size="small"
                                                            color={transaction.status === 'InProgress' ? 'primary' : 'success'}
                                                        />
                                                    </Box>
                                                }
                                                secondary={
                                                    <Box sx={{ mt: 1 }} component="span">
                                                        <Grid container spacing={1} component="span">
                                                            <Grid item xs={6} component="span">
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    Station: {transaction.charging_station?.name || transaction.chargePointId}
                                                                </Typography>
                                                            </Grid>
                                                            <Grid item xs={6} component="span">
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    Start: {format(new Date(transaction.startTime), 'dd MMM yyyy HH:mm')}
                                                                </Typography>
                                                            </Grid>
                                                            <Grid item xs={6} component="span">
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    ID Tag: {transaction.idTag}
                                                                </Typography>
                                                            </Grid>
                                                            <Grid item xs={6} component="span">
                                                                <Typography variant="body2" color="text.secondary" component="span">
                                                                    Energy: {transaction.energyDelivered?.toFixed(2) || 0} kWh
                                                                </Typography>
                                                            </Grid>
                                                        </Grid>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                        <Divider />
                                    </React.Fragment>
                                ))}
                            </List>
                        )}
                    </CardContent>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', pb: 2 }}>
                        <Button
                            variant="outlined"
                            size="small"
                            onClick={() => navigate('/transactions')}
                        >
                            View All Transactions
                        </Button>
                    </Box>
                </Card>
            </Grid>

            {/* End of main content */}
            </Grid>
        </Box>
        );
    }

    export default Dashboard;