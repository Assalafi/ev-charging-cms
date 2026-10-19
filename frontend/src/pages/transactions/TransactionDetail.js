import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  IconButton,
  LinearProgress,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  AccessTimeRounded,
  ArrowBackRounded,
  BatteryChargingFullRounded,
  BoltRounded,
  CableRounded,
  CheckCircleRounded,
  ElectricBoltRounded,
  EvStationRounded,
  InfoOutlined,
  OpenInNewRounded,
  PaymentsRounded,
  ReceiptLongRounded,
  RefreshRounded,
  SpeedRounded,
  SyncRounded,
  TimerRounded,
  TrendingUpRounded,
  WalletRounded
} from '@mui/icons-material';
import { format, formatDistanceStrict } from 'date-fns';
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip as ChartTooltip
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { alpha } from '@mui/material/styles';
import api from '../../services/api';
import transactionService from '../../services/transactionService';
import PageHeader from '../../components/ui/PageHeader';
import { useMQTT } from '../../contexts/MQTTContext';

ChartJS.register(CategoryScale, Filler, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend);

const formatMoney = value => new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value) || 0);

const toPlain = value => {
  if (!value) return value;
  if (typeof value.toJSON === 'function') return value.toJSON();
  if (value.dataValues) return value.dataValues;
  return value;
};

const safeDate = (value, pattern = 'd MMM yyyy, HH:mm:ss') => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : format(date, pattern);
};

const safeDuration = (transaction, now) => {
  if (!transaction?.startTime) return '—';
  const start = new Date(transaction.startTime);
  const end = transaction.stopTime ? new Date(transaction.stopTime) : now;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return '—';
  return formatDistanceStrict(end, start, { roundingMethod: 'floor' });
};

const statusMeta = status => {
  if (status === 'Completed') return { label: 'Completed', color: 'success', icon: <CheckCircleRounded fontSize="small" /> };
  if (status === 'InProgress') return { label: 'Charging now', color: 'primary', icon: <ElectricBoltRounded fontSize="small" /> };
  if (status === 'Stopped') return { label: 'Stopped', color: 'warning', icon: <AccessTimeRounded fontSize="small" /> };
  if (status === 'Failed') return { label: 'Failed', color: 'error', icon: <InfoOutlined fontSize="small" /> };
  return { label: status || 'Unknown', color: 'default', icon: <InfoOutlined fontSize="small" /> };
};

const getEnergyWh = row => {
  if (!row || (row.measurand && row.measurand !== 'Energy.Active.Import.Register')) return null;
  const value = Number(row.value);
  if (!Number.isFinite(value)) return null;
  return String(row.unit || 'Wh').toLowerCase() === 'kwh' ? value * 1000 : value;
};

const getBatteryPercentage = row => {
  if (!row || row.measurand !== 'SoC') return null;
  const value = Number(row.value);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
};

const parseBatteryPercentage = value => {
  if (value === null || value === undefined || value === '') return null;
  const percentage = Number(value);
  return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100 ? percentage : null;
};

const flattenMeterValues = values => (Array.isArray(values) ? values : []).flatMap((value, index) => {
  const row = toPlain(value) || {};
  if (Array.isArray(row.value)) {
    return row.value.map((sample, sampleIndex) => ({
      ...row,
      ...toPlain(sample),
      id: `${row.id || index}-${sampleIndex}`
    }));
  }
  return [{ ...row, id: row.id || index }];
});

const mergeMeterValues = (existing, incoming) => {
  const persisted = Array.isArray(incoming) ? incoming : [];
  if (!persisted.length) return existing;
  const latestPersistedAt = Math.max(...persisted.map(row => new Date(row.timestamp || 0).getTime()).filter(Number.isFinite), 0);
  const liveTail = (Array.isArray(existing) ? existing : []).filter(row => (
    row.__live && new Date(row.timestamp || 0).getTime() > latestPersistedAt
  ));
  return [...persisted, ...liveTail].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)).slice(-300);
};

function Metric({ icon, label, value, caption, color = 'primary' }) {
  return (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 3, borderColor: 'divider' }}>
      <CardContent sx={{ p: { xs: 1.6, sm: 2 } }}>
        <Stack direction="row" spacing={1.25} alignItems="flex-start">
          <Box sx={theme => ({ width: 40, height: 40, borderRadius: 2.25, display: 'grid', placeItems: 'center', flexShrink: 0, color: theme.palette[color]?.main || theme.palette.primary.main, bgcolor: alpha(theme.palette[color]?.main || theme.palette.primary.main, .1) })}>
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
            <Typography variant="h6" fontWeight={850} sx={{ mt: .25, overflowWrap: 'anywhere' }}>{value}</Typography>
            {caption && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .35 }}>{caption}</Typography>}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value, mono = false, emphasis = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 1.15, borderBottom: '1px solid', borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" fontWeight={emphasis ? 800 : 650} textAlign="right" sx={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>{value || '—'}</Typography>
    </Stack>
  );
}

function EmptyChart({ label }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ height: 330, color: 'text.secondary' }}>
      <TrendingUpRounded sx={{ fontSize: 42, color: 'text.disabled' }} />
      <Typography fontWeight={750}>{label}</Typography>
      <Typography variant="body2" color="text.secondary">Meter readings will appear here as the charger reports them.</Typography>
    </Stack>
  );
}

function TransactionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const mqttContext = useMQTT() || {};
  const { subscribe, isConnected: mqttConnected } = mqttContext;

  const [transaction, setTransaction] = useState(null);
  const [station, setStation] = useState(null);
  const [meterValues, setMeterValues] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastLiveAt, setLastLiveAt] = useState(null);
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState(0);
  const [chartMode, setChartMode] = useState('energy');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState(null);

  const loadTransaction = useCallback(async ({ silent = false, loadStation = false } = {}) => {
    if (silent) {
      setRefreshing(true);
      setRefreshError('');
    } else {
      setInitialLoading(true);
      setError('');
    }

    try {
      const response = await transactionService.getById(id);
      const nextTransaction = toPlain(response?.transaction);
      if (!nextTransaction) throw new Error('Transaction not found');

      setTransaction(nextTransaction);
      if (Array.isArray(response.meterValues) && response.meterValues.length) {
        setMeterValues(previous => mergeMeterValues(previous, response.meterValues));
      }
      setLastSyncedAt(new Date());

      if (loadStation && nextTransaction.chargePointId) {
        try {
          const stationResponse = await api.get(`/stations/${encodeURIComponent(nextTransaction.chargePointId)}`);
          setStation(stationResponse.data?.station || stationResponse.data || null);
        } catch (stationError) {
          // Station metadata is helpful but should never make a transaction unreadable.
          setStation(null);
        }
      }
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || 'Failed to load transaction';
      if (silent) setRefreshError(message);
      else setError(message);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    loadTransaction({ loadStation: true });
  }, [loadTransaction]);

  useEffect(() => {
    if (transaction?.status !== 'InProgress') return undefined;
    const timer = window.setInterval(() => loadTransaction({ silent: true }), 15000);
    return () => window.clearInterval(timer);
  }, [loadTransaction, transaction?.status]);

  useEffect(() => {
    if (transaction?.status !== 'InProgress') return undefined;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [transaction?.status]);

  useEffect(() => {
    if (!transaction?.transactionId || transaction.status !== 'InProgress' || typeof subscribe !== 'function') return undefined;
    const topic = `ocpp/transactions/${transaction.transactionId}/energy`;
    return subscribe(topic, message => {
      const payload = toPlain(message) || {};
      const energyDelivered = Number(payload.energyDelivered ?? payload.energy);
      const batteryPercentage = parseBatteryPercentage(
        payload.soc ?? payload.batteryPercentage ?? payload.endBatteryPercentage
      );
      if (!Number.isFinite(energyDelivered) && batteryPercentage === null) return;
      const startMeter = Number(transaction.startMeterValue) || 0;
      const meterValue = Number(payload.meterValue);
      const liveMeter = Number.isFinite(meterValue) ? meterValue : startMeter + Math.max(0, energyDelivered);
      const timestamp = payload.timestamp || new Date().toISOString();

      setTransaction(previous => {
        if (!previous) return previous;
        return {
          ...previous,
          ...(Number.isFinite(energyDelivered) ? {
            energyDelivered,
            currentMeterValue: liveMeter
          } : {}),
          ...(batteryPercentage !== null ? {
            batteryPercentage,
            endBatteryPercentage: batteryPercentage
          } : {}),
          ...(Number.isFinite(Number(payload.amount)) ? { amount: Number(payload.amount) } : {}),
          ...(Number.isFinite(Number(payload.price)) ? { currentPrice: Number(payload.price) } : {})
        };
      });
      setMeterValues(previous => {
        const liveRows = [];
        if (Number.isFinite(energyDelivered)) {
          liveRows.push({
            __live: true,
            id: `live-energy-${timestamp}-${liveMeter}`,
            timestamp,
            value: liveMeter,
            unit: 'Wh',
            measurand: 'Energy.Active.Import.Register',
            context: 'Live update',
            power: payload.power
          });
        }
        if (batteryPercentage !== null) {
          liveRows.push({
            __live: true,
            id: `live-soc-${timestamp}-${batteryPercentage}`,
            timestamp,
            value: batteryPercentage,
            unit: 'Percent',
            measurand: 'SoC',
            context: 'Live update'
          });
        }
        return [...previous, ...liveRows].slice(-300);
      });
      setLastLiveAt(new Date(timestamp));
    });
  }, [subscribe, transaction?.status, transaction?.transactionId, transaction?.startMeterValue]);

  const handleReconcile = async () => {
    if (!window.confirm('Recalculate this completed transaction using the current pricing rules?')) return;
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const response = await api.post(`/transactions/${id}/reconcile`);
      setReconcileMessage({ type: 'success', text: response.data?.message || 'Transaction reconciled successfully.' });
      await loadTransaction({ silent: true });
    } catch (requestError) {
      setReconcileMessage({ type: 'error', text: requestError?.response?.data?.message || 'Failed to reconcile transaction.' });
    } finally {
      setReconciling(false);
    }
  };

  const displayMeterValues = useMemo(() => {
    if (meterValues.length) return meterValues;
    const start = Number(transaction?.startMeterValue);
    const current = Number(transaction?.currentMeterValue);
    const delivered = Number(transaction?.energyDelivered);
    if (!Number.isFinite(start) || !transaction?.startTime) return [];
    const end = Number.isFinite(current) ? current : start + (Number.isFinite(delivered) ? Math.max(0, delivered) : 0);
    const values = [{ timestamp: transaction.startTime, value: start, unit: 'Wh', measurand: 'Energy.Active.Import.Register', context: 'Session start' }];
    if (end !== start) values.push({ timestamp: transaction.stopTime || new Date().toISOString(), value: end, unit: 'Wh', measurand: 'Energy.Active.Import.Register', context: 'Session summary' });
    return values;
  }, [meterValues, transaction]);

  const normalizedMeterValues = useMemo(() => flattenMeterValues(displayMeterValues), [displayMeterValues]);
  const energyReadings = useMemo(() => normalizedMeterValues.map((row, index) => ({ row, index, wh: getEnergyWh(row) })).filter(item => item.wh !== null), [normalizedMeterValues]);
  const batteryReadings = useMemo(() => normalizedMeterValues
    .map((row, index) => ({ row, index, percentage: getBatteryPercentage(row) }))
    .filter(item => item.percentage !== null), [normalizedMeterValues]);

  const chartData = useMemo(() => {
    if (!energyReadings.length) return null;
    const labels = energyReadings.map(({ row }) => safeDate(row.timestamp, 'HH:mm:ss'));
    const powerValues = energyReadings.map(({ row, wh }, readingIndex) => {
      const explicitPower = Number(row.power ?? row.calculatedPower);
      if (Number.isFinite(explicitPower)) return String(row.powerUnit || '').toLowerCase() === 'kw' ? explicitPower : explicitPower / 1000;
      if (readingIndex === 0) return 0;
      const previous = energyReadings[readingIndex - 1];
      const seconds = (new Date(row.timestamp) - new Date(previous.row.timestamp)) / 1000;
      return seconds > 0 ? Math.max(0, ((wh - previous.wh) / seconds) * 3.6) : 0;
    });
    const isEnergy = chartMode === 'energy';
    return {
      labels,
      datasets: [{
        label: isEnergy ? 'Energy delivered (kWh)' : 'Power (kW)',
        data: isEnergy ? energyReadings.map(item => item.wh / 1000) : powerValues,
        borderColor: isEnergy ? '#2563EB' : '#0E9F6E',
        backgroundColor: isEnergy ? 'rgba(37,99,235,.12)' : 'rgba(14,159,110,.12)',
        fill: true,
        tension: .35,
        borderWidth: 3,
        pointRadius: energyReadings.length > 40 ? 0 : 3,
        pointHoverRadius: 5
      }]
    };
  }, [chartMode, energyReadings]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: context => `${Number(context.parsed.y || 0).toFixed(2)} ${chartMode === 'energy' ? 'kWh' : 'kW'}` } }
    },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(16,24,40,.07)' }, title: { display: true, text: chartMode === 'energy' ? 'kWh' : 'kW' } },
      x: { grid: { display: false }, ticks: { maxTicksLimit: compact ? 5 : 10 } }
    }
  }), [chartMode, compact]);

  const active = transaction?.status === 'InProgress';
  const status = statusMeta(transaction?.status);
  const stationName = station?.name || transaction?.ChargingStation?.name || transaction?.charging_station?.name || transaction?.chargePointId || 'Unknown station';
  const energyKwh = Math.max(0, Number(transaction?.energyDelivered) || 0) / 1000;
  const currentMeter = Number(transaction?.currentMeterValue);
  const sellingPricePerKwh = Number(transaction?.sellingPricePerWh) * 1000;
  const firstBatteryReading = batteryReadings[0]?.percentage ?? null;
  const latestBatteryReading = batteryReadings[batteryReadings.length - 1]?.percentage ?? null;
  const startBatteryPercentage = parseBatteryPercentage(transaction?.startBatteryPercentage) ?? firstBatteryReading;
  const batteryPercentage = parseBatteryPercentage(transaction?.batteryPercentage)
    ?? parseBatteryPercentage(transaction?.endBatteryPercentage)
    ?? latestBatteryReading;
  const endBatteryPercentage = parseBatteryPercentage(transaction?.endBatteryPercentage) ?? latestBatteryReading;
  const powerKw = useMemo(() => {
    const latest = energyReadings[energyReadings.length - 1]?.row;
    const value = Number(latest?.power ?? latest?.calculatedPower);
    if (!Number.isFinite(value)) return null;
    return String(latest?.powerUnit || '').toLowerCase() === 'kw' ? value : value / 1000;
  }, [energyReadings]);
  const updatedAt = lastLiveAt || lastSyncedAt;

  if (initialLoading) {
    return <Box sx={{ minHeight: '55vh', display: 'grid', placeItems: 'center' }}><Stack alignItems="center" spacing={1.5}><CircularProgress size={32} /><Typography color="text.secondary">Loading transaction details…</Typography></Stack></Box>;
  }

  if (error || !transaction) {
    return <Stack spacing={2}><PageHeader eyebrow="Charging session" title="Transaction unavailable" description={error || 'This transaction could not be found.'} actions={<Button variant="outlined" startIcon={<ArrowBackRounded />} onClick={() => navigate('/transactions')}>Back to transactions</Button>} /><Alert severity="error">{error || 'Transaction not found.'}</Alert></Stack>;
  }

  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <PageHeader
        eyebrow="Charging session"
        title={`Transaction #${transaction.transactionId || id}`}
        description={`${stationName} · Connector ${transaction.connectorId || 1} · ${transaction.idTag || 'Anonymous session'}`}
        live={active && mqttConnected}
        updatedAt={updatedAt}
        actions={(
          <>
            <Button variant="outlined" startIcon={<ArrowBackRounded />} onClick={() => navigate('/transactions')}>Back</Button>
            <Button variant="outlined" startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshRounded />} onClick={() => loadTransaction({ silent: true })} disabled={refreshing}>{refreshing ? 'Updating' : 'Refresh'}</Button>
            {transaction.status === 'Completed' && <Button variant="contained" color="warning" startIcon={reconciling ? <CircularProgress size={16} color="inherit" /> : <SyncRounded />} onClick={handleReconcile} disabled={reconciling}>{reconciling ? 'Reconciling' : 'Reconcile'}</Button>}
          </>
        )}
      />

      {refreshError && <Alert severity="warning" onClose={() => setRefreshError('')}>Live refresh paused briefly: {refreshError}</Alert>}
      {reconcileMessage && <Alert severity={reconcileMessage.type} onClose={() => setReconcileMessage(null)}>{reconcileMessage.text}</Alert>}

      <Card sx={{ overflow: 'hidden', border: 0, color: 'common.white', background: active ? 'linear-gradient(135deg, #0B1F3F 0%, #1D4ED8 62%, #0E9F6E 145%)' : 'linear-gradient(135deg, #14213D 0%, #344054 100%)', position: 'relative' }}>
        <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', right: -100, top: -155, bgcolor: 'rgba(255,255,255,.08)' }} />
        <CardContent sx={{ p: { xs: 2.25, md: 3 }, position: 'relative' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2.5}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip size="small" icon={status.icon} label={status.label} color={status.color} sx={{ bgcolor: status.color === 'default' ? 'rgba(255,255,255,.14)' : undefined, color: status.color === 'default' ? 'common.white' : undefined }} />
                <Chip size="small" variant="outlined" label={active ? (mqttConnected ? 'Live stream connected' : 'Polling fallback') : 'Final reading'} sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,.35)' }} />
              </Stack>
              <Typography variant="h5" fontWeight={800} sx={{ mt: 2 }}>Charging session overview</Typography>
              <Typography variant="body2" sx={{ mt: .6, color: 'rgba(255,255,255,.72)', maxWidth: 620 }}>{active ? 'Energy, amount and meter readings update in place while the charger is running.' : 'This session is no longer charging. The values below reflect the recorded transaction.'}</Typography>
            </Box>
            <Stack direction="row" spacing={{ xs: 2.5, md: 4 }} alignItems="flex-end" sx={{ flexShrink: 0 }}>
              <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.64)' }}>Energy</Typography><Typography variant="h4" fontWeight={850}>{energyKwh.toFixed(2)} <Typography component="span" variant="body2" sx={{ color: 'rgba(255,255,255,.72)' }}>kWh</Typography></Typography></Box>
              <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.64)' }}>Recorded amount</Typography><Typography variant="h4" fontWeight={850}>{formatMoney(transaction.amount)}</Typography></Box>
            </Stack>
          </Stack>
          {active && <LinearProgress sx={{ mt: 2.5, bgcolor: 'rgba(255,255,255,.15)', '& .MuiLinearProgress-bar': { bgcolor: '#6EE7B7' } }} />}
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: { xs: 1.25, md: 2 } }}>
        <Metric icon={<BoltRounded />} label="Energy delivered" value={`${energyKwh.toFixed(2)} kWh`} caption={active ? 'Live cumulative reading' : 'Final recorded energy'} color="primary" />
        <Metric icon={<PaymentsRounded />} label="Amount" value={formatMoney(transaction.amount)} caption={transaction.billedAt ? `Billed ${safeDate(transaction.billedAt, 'd MMM, HH:mm')}` : 'Billing record'} color="success" />
        <Metric icon={<SpeedRounded />} label="Current power" value={powerKw === null ? '—' : `${powerKw.toFixed(2)} kW`} caption={active ? 'Latest meter sample' : 'Peak/sample data'} color="warning" />
        <Metric icon={<TimerRounded />} label="Duration" value={safeDuration(transaction, now)} caption={active ? 'Running now' : 'Session duration'} color="secondary" />
        <Metric icon={<BatteryChargingFullRounded />} label="Battery level" value={batteryPercentage === null ? '—' : `${batteryPercentage.toFixed(0)}%`} caption={batteryPercentage === null ? 'Not reported by charger' : active ? 'Live vehicle SoC' : 'Final reported SoC'} color="info" />
      </Box>

      <Grid container spacing={{ xs: 2, md: 2.5 }}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 3.5 }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}><ReceiptLongRounded color="primary" /><Box><Typography variant="h6" fontWeight={800}>Session details</Typography><Typography variant="caption" color="text.secondary">Identity, station and meter context</Typography></Box></Stack>
              <Divider />
              <DetailRow label="Station" value={stationName} />
              <DetailRow label="Charge point" value={transaction.chargePointId} mono />
              <DetailRow label="Connector" value={`Connector ${transaction.connectorId || 1}`} />
              <DetailRow label="Driver tag" value={transaction.idTag || 'Anonymous'} mono />
              <DetailRow label="Started" value={safeDate(transaction.startTime)} />
              <DetailRow label="Ended" value={transaction.stopTime ? safeDate(transaction.stopTime) : active ? 'Still charging' : 'Not recorded'} />
              <DetailRow label="Start meter" value={Number.isFinite(Number(transaction.startMeterValue)) ? `${Number(transaction.startMeterValue).toLocaleString()} Wh` : '—'} />
              <DetailRow label="Current / stop meter" value={Number.isFinite(Number(transaction.stopMeterValue || currentMeter)) ? `${Number(transaction.stopMeterValue || currentMeter).toLocaleString()} Wh` : '—'} />
              <DetailRow label="Battery at start" value={startBatteryPercentage === null ? 'Not reported' : `${startBatteryPercentage.toFixed(0)}%`} />
              <DetailRow label={active ? 'Battery now' : 'Battery at end'} value={(active ? batteryPercentage : endBatteryPercentage) === null ? 'Not reported' : `${(active ? batteryPercentage : endBatteryPercentage).toFixed(0)}%`} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ height: '100%', borderRadius: 3.5 }}>
            <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1 }}><WalletRounded color="success" /><Box><Typography variant="h6" fontWeight={800}>Billing & audit</Typography><Typography variant="caption" color="text.secondary">Recorded financial values</Typography></Box></Stack>
              <Divider />
              <DetailRow label="Session amount" value={formatMoney(transaction.amount)} emphasis />
              {transaction.grossAmount !== undefined && <DetailRow label="Gross amount" value={formatMoney(transaction.grossAmount)} />}
              {transaction.partnerEarning !== undefined && <DetailRow label="Partner earning" value={formatMoney(transaction.partnerEarning)} />}
              {transaction.companyEarning !== undefined && <DetailRow label="Company allocation" value={formatMoney(transaction.companyEarning)} />}
              <DetailRow label="Tariff snapshot" value={Number.isFinite(sellingPricePerKwh) && sellingPricePerKwh > 0 ? `${formatMoney(sellingPricePerKwh)} / kWh` : 'Resolved from session pricing'} />
              <DetailRow label="Billing status" value={transaction.billedAt ? 'Billed' : active ? 'Pending until completion' : 'Awaiting reconciliation'} />
              {transaction.reason && <DetailRow label="Stop reason" value={transaction.reason} />}
              <Button fullWidth variant="outlined" sx={{ mt: 2 }} startIcon={<EvStationRounded />} endIcon={<OpenInNewRounded />} onClick={() => transaction.chargePointId && navigate(`/stations/${transaction.chargePointId}`)} disabled={!transaction.chargePointId}>Open station</Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} sx={{ px: { xs: 1.5, md: 2 }, pt: 1 }}>
          <Tabs value={tab} onChange={(_, value) => { setTab(value); if (value === 0) setChartMode('energy'); if (value === 1) setChartMode('power'); }} variant={compact ? 'scrollable' : 'standard'} scrollButtons={compact ? 'auto' : false}>
            <Tab label="Energy trend" />
            <Tab label="Power trend" />
            <Tab label="Meter readings" />
          </Tabs>
          {active && <Stack direction="row" spacing={.75} alignItems="center" sx={{ px: 1, pb: { xs: 1, sm: 0 } }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: mqttConnected ? 'success.main' : 'warning.main' }} /><Typography variant="caption" color="text.secondary">{lastLiveAt ? `Live ${safeDate(lastLiveAt, 'HH:mm:ss')}` : mqttConnected ? 'Waiting for meter updates' : 'Polling every 15s'}</Typography></Stack>}
        </Stack>
        <Divider />
        {tab < 2 ? (
          <CardContent sx={{ p: { xs: 1.5, md: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Box><Typography fontWeight={800}>{tab === 0 ? 'Cumulative energy' : 'Estimated charging power'}</Typography><Typography variant="caption" color="text.secondary">{tab === 0 ? 'Wh readings converted to kWh' : 'Derived from consecutive meter readings when power is unavailable'}</Typography></Box>
              <Stack direction="row" spacing={.75}><IconButton size="small" onClick={() => { setChartMode('energy'); setTab(0); }} color={chartMode === 'energy' ? 'primary' : 'default'}><BoltRounded fontSize="small" /></IconButton><IconButton size="small" onClick={() => { setChartMode('power'); setTab(1); }} color={chartMode === 'power' ? 'primary' : 'default'}><TrendingUpRounded fontSize="small" /></IconButton></Stack>
            </Stack>
            {chartData ? <Box sx={{ height: { xs: 280, md: 340 } }}><Line data={chartData} options={chartOptions} /></Box> : <EmptyChart label="No meter trend yet" />}
          </CardContent>
        ) : (
          <TableContainer sx={{ maxHeight: 440, border: 0, borderRadius: 0 }}>
            {normalizedMeterValues.length ? <Table stickyHeader size="small"><TableHead><TableRow><TableCell>Timestamp</TableCell><TableCell>Reading</TableCell><TableCell>Energy</TableCell><TableCell>Power</TableCell><TableCell>Battery</TableCell><TableCell>Context</TableCell></TableRow></TableHead><TableBody>{normalizedMeterValues.slice().reverse().map((row, index) => { const energy = getEnergyWh(row); const power = Number(row.power ?? row.calculatedPower); const battery = getBatteryPercentage(row); return <TableRow key={row.id || `${row.timestamp}-${index}`} hover><TableCell sx={{ whiteSpace: 'nowrap' }}>{safeDate(row.timestamp, 'd MMM, HH:mm:ss')}</TableCell><TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{Number(row.value).toLocaleString()} {row.unit || 'Wh'}</TableCell><TableCell>{energy === null ? '—' : `${(energy / 1000).toFixed(3)} kWh`}</TableCell><TableCell>{Number.isFinite(power) ? `${(String(row.powerUnit || '').toLowerCase() === 'kw' ? power : power / 1000).toFixed(2)} kW` : '—'}</TableCell><TableCell>{battery === null ? '—' : `${battery.toFixed(0)}%`}</TableCell><TableCell><Chip size="small" variant={row.__live ? 'filled' : 'outlined'} color={row.__live ? 'success' : 'default'} label={row.context || 'Sample.Periodic'} /></TableCell></TableRow>; })}</TableBody></Table> : <EmptyChart label="No meter readings available" />}
          </TableContainer>
        )}
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ px: .5 }}>
        <Stack direction="row" spacing={1} alignItems="center"><CableRounded fontSize="small" color="action" /><Typography variant="caption" color="text.secondary">All energy values are displayed from charger meter readings in Wh/kWh.</Typography></Stack>
        <Typography variant="caption" color="text.disabled">{lastSyncedAt ? `Synced ${safeDate(lastSyncedAt, 'HH:mm:ss')} WAT` : 'Not synced yet'}</Typography>
      </Stack>
    </Stack>
  );
}

export default TransactionDetail;
