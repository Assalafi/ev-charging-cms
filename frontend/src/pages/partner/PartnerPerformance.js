import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Grid,
  MenuItem, Select, Stack, TextField, Typography
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import DownloadIcon from '@mui/icons-material/Download';
import EvStationIcon from '@mui/icons-material/EvStation';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LinearScale, LineElement, PointElement, Tooltip
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import partnerService from '../../services/partnerService';
import { formatEnergy, formatNaira } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

export default function PartnerPerformance() {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({
    range: 'monthly', startDate: '', endDate: '', locationId: '', chargePointId: ''
  });
  const [applied, setApplied] = useState({ range: 'monthly' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await partnerService.getPerformance(applied);
      setData(response.data);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load performance data.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = () => {
    const next = {
      ...(filters.range === 'custom'
        ? { startDate: filters.startDate, endDate: filters.endDate }
        : { range: filters.range }),
      ...(filters.locationId && { locationId: filters.locationId }),
      ...(filters.chargePointId && { chargePointId: filters.chargePointId })
    };
    setApplied(next);
  };

  const stations = useMemo(() => {
    const all = data?.filtersAvailable?.stations || [];
    return filters.locationId ? all.filter(station => String(station.locationId) === String(filters.locationId)) : all;
  }, [data, filters.locationId]);
  const totals = data?.totals || {};
  const cards = [
    ['Total energy', formatEnergy(totals.energyWh), <BoltIcon color="primary" />],
    ['Partner earning', formatNaira(totals.partnerEarning), <TrendingUpIcon color="success" />],
    ['Sessions', totals.transactions || 0, <EvStationIcon color="primary" />],
    ['Average earning / session', formatNaira(totals.averageEarningPerSession), <TrendingUpIcon color="primary" />],
    ['Best location', data?.bestLocation?.locationName || '—', <TrendingUpIcon color="success" />],
    ['Best station', data?.bestStation?.stationName || '—', <EvStationIcon color="success" />]
  ];
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: { y: { beginAtZero: true } }
  };

  return (
    <Box>
      <PageHeader eyebrow="Analytics" title="Performance" description="Energy, your earnings and utilization across your charging network." actions={[
        <Button key="export" variant="outlined" startIcon={<DownloadIcon />} onClick={() => partnerService.exportPerformance(applied)}>
          Export CSV
        </Button>
      ]} />
      <Card sx={{ mb: 3 }}><CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
          <Select size="small" value={filters.range} onChange={event => setFilters({
            ...filters, range: event.target.value
          })}>
            <MenuItem value="daily">Today</MenuItem><MenuItem value="weekly">This week</MenuItem>
            <MenuItem value="monthly">This month</MenuItem><MenuItem value="yearly">This year</MenuItem>
            <MenuItem value="custom">Custom</MenuItem>
          </Select>
          {filters.range === 'custom' && <>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
              value={filters.startDate} onChange={event => setFilters({ ...filters, startDate: event.target.value })} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
              value={filters.endDate} onChange={event => setFilters({ ...filters, endDate: event.target.value })} />
          </>}
          <Select size="small" displayEmpty value={filters.locationId} onChange={event => setFilters({
            ...filters, locationId: event.target.value, chargePointId: ''
          })} sx={{ minWidth: 180 }}>
            <MenuItem value="">All locations</MenuItem>
            {(data?.filtersAvailable?.locations || []).map(location =>
              <MenuItem key={location.id} value={location.id}>{location.name}</MenuItem>)}
          </Select>
          <Select size="small" displayEmpty value={filters.chargePointId}
            onChange={event => setFilters({ ...filters, chargePointId: event.target.value })} sx={{ minWidth: 180 }}>
            <MenuItem value="">All stations</MenuItem>
            {stations.map(station => <MenuItem key={station.chargePointId} value={station.chargePointId}>{station.name}</MenuItem>)}
          </Select>
          <Button variant="contained" onClick={apply}
            disabled={filters.range === 'custom' && (!filters.startDate || !filters.endDate)}>Apply</Button>
        </Stack>
      </CardContent></Card>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <Box textAlign="center" py={8}><CircularProgress /></Box> : <>
        <Grid container spacing={2} mb={3}>
          {cards.map(([label, value, icon]) => <Grid item xs={6} md={4} lg={3} key={label}>
            <Card sx={{ height: '100%' }}><CardContent><Stack direction="row" justifyContent="space-between">
              <Box><Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="h6" sx={{ wordBreak: 'break-word' }}>{value}</Typography></Box>{icon}
            </Stack></CardContent></Card>
          </Grid>)}
        </Grid>
        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}><Card><CardContent>
            <Typography variant="h6" mb={2}>Earnings trend</Typography>
            <Box height={320}><Line options={chartOptions} data={{
              labels: (data?.series || []).map(item => item.label),
              datasets: [{
                label: 'Partner earning',
                data: (data?.series || []).map(item => item.partnerEarning),
                borderColor: '#2e7d32',
                backgroundColor: '#2e7d3222',
                fill: true
              }]
            }} /></Box>
          </CardContent></Card></Grid>
          <Grid item xs={12} lg={5}><Card><CardContent>
            <Typography variant="h6" mb={2}>Station earnings</Typography>
            <Box height={320}><Bar options={{ ...chartOptions, indexAxis: 'y' }} data={{
              labels: (data?.byStation || []).slice(0, 8).map(item => item.stationName),
              datasets: [{
                label: 'Partner earning',
                data: (data?.byStation || []).slice(0, 8).map(item => item.partnerEarning),
                backgroundColor: '#388e3c'
              }]
            }} /></Box>
          </CardContent></Card></Grid>
        </Grid>
      </>}
    </Box>
  );
}
