import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AdminPanelSettingsRounded,
  ArrowForwardRounded,
  BoltRounded,
  BusinessRounded,
  CloseRounded,
  DirectionsCarRounded,
  ElectricBoltRounded,
  EvStationRounded,
  InsightsRounded,
  KeyboardArrowRightRounded,
  LocationOnRounded,
  LoginRounded,
  MapRounded,
  SearchRounded,
  ShieldRounded,
  SpeedRounded,
  TuneRounded,
  VisibilityOffRounded,
  WifiRounded
} from '@mui/icons-material';
import { Marker, Popup, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import FullscreenMap, { MapBounds } from '../components/maps/FullscreenMap';
import { useBranding } from '../contexts/BrandingContext';
import publicNetworkService from '../services/publicNetworkService';
import { evChargingMarker, locationMarkerStatus } from '../utils/mapMarkerIcons';
import './PublicLanding.css';

const STATUS_LABELS = {
  online: 'Fully online',
  partial: 'Partially online',
  offline: 'Offline',
  empty: 'No stations'
};

const STATUS_COLORS = {
  online: '#4EE2AA',
  partial: '#FDB022',
  offline: '#F97066',
  empty: '#98A2B3'
};

const formatNumber = value => Number(value || 0).toLocaleString('en-NG');

const formatCompactNumber = value => new Intl.NumberFormat('en-NG', {
  notation: 'compact',
  maximumFractionDigits: 1
}).format(Number(value || 0));

const formatEnergy = value => {
  const kwh = Number(value || 0) / 1000;
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(kwh >= 10000 ? 0 : 1)} MWh`;
  return `${kwh.toFixed(kwh >= 100 ? 0 : 1)} kWh`;
};

function BrandMark({ branding, assetUrl, compact = false }) {
  const name = branding.shortName || branding.systemName || 'EV Charge';
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} minWidth={0}>
      <Box className="public-landing__brand-logo">
        {branding.logoUrl ? (
          <Box
            component="img"
            src={assetUrl(branding.logoUrl)}
            alt={`${name} logo`}
            sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.55 }}
          />
        ) : <BoltRounded />}
      </Box>
      <Box minWidth={0}>
        <Typography color="#fff" fontWeight={850} letterSpacing="-.035em" noWrap>
          {name}
        </Typography>
        {!compact && (
          <Typography variant="caption" color="rgba(226,239,249,.58)" noWrap>
            Intelligent charging network
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function HeroConsole({ summary }) {
  const online = Number(summary.onlineStations || 0);
  const stations = Number(summary.stations || 0);
  const availability = stations ? Math.round((online / stations) * 100) : 0;

  return (
    <Box className="public-landing__hero-console">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ height: 70, px: { xs: 2, sm: 2.5 }, borderBottom: '1px solid rgba(255,255,255,.1)' }}
      >
        <Stack direction="row" alignItems="center" spacing={1.2}>
          <Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(102,226,182,.12)', color: '#66E2B6' }}>
            <MapRounded fontSize="small" />
          </Box>
          <Box>
            <Typography variant="body2" color="#fff" fontWeight={750}>Network pulse</Typography>
            <Typography variant="caption" color="rgba(225,238,248,.52)">Live public availability</Typography>
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.9}>
          <Box className="public-landing__eyebrow-dot" />
          <Typography variant="caption" color="#83EBC5" fontWeight={750}>LIVE</Typography>
        </Stack>
      </Stack>

      <Box className="public-landing__console-map">
        <svg className="public-landing__console-route" viewBox="0 0 620 350" preserveAspectRatio="none" aria-hidden="true">
          <path d="M-30 286 C92 248 126 103 249 163 S385 303 469 178 S560 81 660 99" fill="none" stroke="rgba(100,194,237,.14)" strokeWidth="54" strokeLinecap="round" />
          <path d="M-30 286 C92 248 126 103 249 163 S385 303 469 178 S560 81 660 99" fill="none" stroke="rgba(115,229,190,.62)" strokeWidth="3" strokeDasharray="8 12" strokeLinecap="round" />
          <path d="M82 -10 C109 82 197 94 185 195 S182 319 277 374" fill="none" stroke="rgba(92,168,222,.16)" strokeWidth="28" strokeLinecap="round" />
          <path d="M436 -12 C410 71 449 102 535 142 S611 249 573 373" fill="none" stroke="rgba(92,168,222,.12)" strokeWidth="35" strokeLinecap="round" />
        </svg>
        {['one', 'two', 'three', 'four'].map(position => (
          <Box key={position} className={`public-landing__console-pin public-landing__console-pin--${position}`}>
            <BoltRounded sx={{ fontSize: 17 }} />
          </Box>
        ))}
        <Paper sx={{ position: 'absolute', left: { xs: 16, sm: 24 }, bottom: { xs: 16, sm: 22 }, p: 1.5, width: { xs: 164, sm: 190 }, borderRadius: 3, bgcolor: 'rgba(250,253,255,.94)', backdropFilter: 'blur(12px)' }}>
          <Typography variant="caption" color="text.secondary">Network availability</Typography>
          <Stack direction="row" alignItems="baseline" spacing={0.75} mt={0.25}>
            <Typography variant="h4" fontWeight={850}>{availability}%</Typography>
            <Typography variant="caption" color="success.main" fontWeight={750}>available</Typography>
          </Stack>
          <Box sx={{ mt: 1.15, height: 5, borderRadius: 99, bgcolor: '#E7ECF2', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${availability}%`, bgcolor: '#18B77C', borderRadius: 99 }} />
          </Box>
        </Paper>
      </Box>

      <Stack
        direction="row"
        divider={<Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,.1)' }} />}
        sx={{ position: 'absolute', right: 0, bottom: 0, left: 0, height: 116, bgcolor: 'rgba(4,20,36,.72)' }}
      >
        {[
          ['Connected', `${online}/${stations}`],
          ['Locations', formatNumber(summary.locations)],
          ['Today', formatEnergy(summary.todayEnergyWh)]
        ].map(([label, value]) => (
          <Box key={label} sx={{ flex: 1, minWidth: 0, px: { xs: 1.4, sm: 2.4 }, py: 2.4 }}>
            <Typography variant="caption" color="rgba(222,237,248,.48)">{label}</Typography>
            <Typography color="#fff" fontSize={{ xs: '1rem', sm: '1.25rem' }} fontWeight={800} noWrap sx={{ mt: 0.45 }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function ProofMetric({ icon, label, value, accent }) {
  return (
    <Box className="public-landing__metric">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={650}>{label}</Typography>
          <Typography variant="h4" sx={{ mt: 0.6, fontWeight: 850, color: '#0A2037' }}>{value}</Typography>
        </Box>
        <Box sx={{ width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: `${accent}14`, color: accent }}>
          {icon}
        </Box>
      </Stack>
    </Box>
  );
}

function FeatureIcon({ children }) {
  return <Box className="public-landing__feature-icon">{children}</Box>;
}

function AccessCard({ icon, title, description, action, onClick, tone = '#2F6FED' }) {
  return (
    <Box className="public-landing__access-card">
      <Box sx={{ width: 48, height: 48, borderRadius: 3, display: 'grid', placeItems: 'center', color: tone, bgcolor: `${tone}12` }}>
        {icon}
      </Box>
      <Typography variant="h5" sx={{ mt: 3, color: '#0A2037' }}>{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 1, minHeight: { md: 77 } }}>{description}</Typography>
      <Button onClick={onClick} endIcon={<KeyboardArrowRightRounded />} sx={{ mt: 2.2, px: 0, color: tone, '&:hover': { bgcolor: 'transparent', transform: 'translateX(3px)' } }}>
        {action}
      </Button>
    </Box>
  );
}

export default function PublicLanding() {
  const navigate = useNavigate();
  const { branding, assetUrl } = useBranding();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ search: '', state: 'all', status: 'all' });
  const [showFilters, setShowFilters] = useState(true);

  const load = useCallback(async () => {
    try {
      setError('');
      const result = await publicNetworkService.getSnapshot();
      setSnapshot(result);
      setSelected(current => current
        ? result.locations?.find(location => location.id === current.id) || null
        : null);
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Live network data is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const locations = useMemo(() => snapshot?.locations || [], [snapshot]);
  const states = useMemo(() => [...new Set(locations.map(location => location.state).filter(Boolean))].sort(), [locations]);
  const filteredLocations = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return locations.filter(location => {
      const status = locationMarkerStatus(location);
      const searchable = [
        location.name,
        location.address,
        location.city,
        location.state,
        ...(location.stations || []).flatMap(station => [station.name, station.chargePointId])
      ].filter(Boolean).join(' ').toLowerCase();

      return (!search || searchable.includes(search))
        && (filters.state === 'all' || location.state === filters.state)
        && (filters.status === 'all' || status === filters.status);
    });
  }, [filters, locations]);

  const mappedLocations = filteredLocations.filter(location =>
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
  );
  const publicSummary = snapshot?.summary || {};
  const systemName = branding.shortName || branding.systemName || 'EV Charge';

  const resetFilters = () => setFilters({ search: '', state: 'all', status: 'all' });
  const scrollToNetwork = () => document.getElementById('network')?.scrollIntoView({ behavior: 'smooth' });

  const filterOverlay = showFilters ? (
    <Paper
      elevation={9}
      sx={{
        position: 'absolute',
        zIndex: 1200,
        top: { xs: 64, sm: 14 },
        left: 58,
        width: { xs: 'calc(100% - 72px)', sm: 430 },
        p: 1.4,
        border: '1px solid rgba(15,42,70,.1)',
        borderRadius: 3,
        bgcolor: 'rgba(255,255,255,.96)',
        backdropFilter: 'blur(14px)'
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Stack direction="row" spacing={0.8} alignItems="center" minWidth={0}>
          <TuneRounded color="primary" fontSize="small" />
          <Typography variant="subtitle2" noWrap>Find your best stop</Typography>
          <Chip size="small" label={`${filteredLocations.length}/${locations.length}`} />
        </Stack>
        <Stack direction="row" spacing={0.25}>
          <Button size="small" onClick={resetFilters} sx={{ minWidth: 54, px: 1 }}>Reset</Button>
          <Tooltip title="Hide filters">
            <IconButton size="small" onClick={() => setShowFilters(false)}>
              <VisibilityOffRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <TextField
        fullWidth
        placeholder="Search location or station"
        value={filters.search}
        onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
        InputProps={{
          startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment>
        }}
        sx={{ mb: 1 }}
      />
      <Grid container spacing={1}>
        <Grid item xs={6}>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={filters.status}
              onChange={event => setFilters(current => ({ ...current, status: event.target.value }))}
            >
              <MenuItem value="all">All statuses</MenuItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <MenuItem value={value} key={value}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6}>
          <FormControl fullWidth>
            <InputLabel>State</InputLabel>
            <Select
              label="State"
              value={filters.state}
              onChange={event => setFilters(current => ({ ...current, state: event.target.value }))}
            >
              <MenuItem value="all">All states</MenuItem>
              {states.map(state => <MenuItem value={state} key={state}>{state}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </Paper>
  ) : (
    <Tooltip title="Show map filters">
      <IconButton
        onClick={() => setShowFilters(true)}
        sx={{ position: 'absolute', zIndex: 1200, top: 14, left: 58, bgcolor: '#fff', boxShadow: 3, '&:hover': { bgcolor: '#fff' } }}
      >
        <TuneRounded />
      </IconButton>
    </Tooltip>
  );

  const detailPanel = selected ? (
    <Paper
      elevation={18}
      sx={{
        position: 'absolute',
        inset: '0 0 0 auto',
        zIndex: 1400,
        width: { xs: '100%', sm: 400 },
        height: '100%',
        overflowY: 'auto',
        borderRadius: 0,
        p: { xs: 2, sm: 2.5 },
        bgcolor: 'rgba(255,255,255,.98)',
        backdropFilter: 'blur(13px)'
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} mb={2.5}>
        <Box minWidth={0}>
          <Stack direction="row" alignItems="center" spacing={0.8} mb={0.6}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_COLORS[locationMarkerStatus(selected)] }} />
            <Typography variant="overline" color="primary.main" fontWeight={800}>Charging location</Typography>
          </Stack>
          <Typography variant="h5">{selected.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {[selected.address, selected.city, selected.state].filter(Boolean).join(', ') || 'Address not provided'}
          </Typography>
        </Box>
        <IconButton onClick={() => setSelected(null)} aria-label="Close location details">
          <CloseRounded />
        </IconButton>
      </Stack>

      <Grid container spacing={1} mb={2.5}>
        {[
          ['Stations', selected.stationCount],
          ['Online', selected.onlineStations],
          ['Status', STATUS_LABELS[locationMarkerStatus(selected)]],
          ['Connectors', (selected.stations || []).reduce((total, station) => total + Number(station.connectorCount || 0), 0)]
        ].map(([label, value]) => (
          <Grid item xs={6} key={label}>
            <Box sx={{ p: 1.35, borderRadius: 2.5, bgcolor: '#F7F9FC', border: '1px solid #E7ECF2' }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography fontWeight={800} noWrap>{value}</Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>Station availability</Typography>
      <Stack spacing={1}>
        {(selected.stations || []).map(station => (
          <Box key={station.chargePointId} sx={{ p: 1.4, borderRadius: 2.5, border: '1px solid #E7ECF2' }}>
            <Stack direction="row" justifyContent="space-between" spacing={1}>
              <Box minWidth={0}>
                <Typography variant="body2" fontWeight={750} noWrap>
                  {station.name || station.chargePointId}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {station.connectorCount || 0} connectors
                </Typography>
              </Box>
              <Chip
                size="small"
                label={station.isOnline ? 'Online' : station.status}
                color={station.isOnline ? 'success' : 'default'}
              />
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  ) : null;

  return (
    <Box className="public-landing">
      <Box component="header" className="public-landing__hero">
        <Box component="nav" className="public-landing__nav">
          <Container maxWidth="xl">
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: { xs: 72, sm: 80 } }}>
              <BrandMark branding={branding} assetUrl={assetUrl} compact />
              <Stack direction="row" alignItems="center" spacing={{ sm: 0.5, md: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.25} sx={{ display: { xs: 'none', md: 'flex' }, mr: 1 }}>
                  <Button href="#network" color="inherit" sx={{ color: 'rgba(238,246,252,.78)' }}>Network</Button>
                  <Button href="#solutions" color="inherit" sx={{ color: 'rgba(238,246,252,.78)' }}>Solutions</Button>
                  <Button href="#access" color="inherit" sx={{ color: 'rgba(238,246,252,.78)' }}>Portals</Button>
                </Stack>
                <Button
                  variant="outlined"
                  startIcon={<LoginRounded />}
                  onClick={() => navigate('/login')}
                  sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.25)', bgcolor: 'rgba(255,255,255,.04)', '&:hover': { borderColor: 'rgba(255,255,255,.48)', bgcolor: 'rgba(255,255,255,.08)' } }}
                >
                  Sign in
                </Button>
              </Stack>
            </Stack>
          </Container>
        </Box>

        <Container maxWidth="xl" sx={{ pt: { xs: 7, md: 10 }, pb: { xs: 11, md: 15 } }}>
          <Grid container spacing={{ xs: 6, lg: 8 }} alignItems="center">
            <Grid item xs={12} lg={7}>
              <Stack direction="row" alignItems="center" spacing={1.3}>
                <Box className="public-landing__eyebrow-dot" />
                <Typography variant="overline" color="#83EBC5" fontWeight={800} letterSpacing=".14em">
                  {formatNumber(publicSummary.onlineStations)} stations connected now
                </Typography>
              </Stack>
              <Typography component="h1" className="public-landing__hero-title">
                Power every journey with <span>confidence.</span>
              </Typography>
              <Typography className="public-landing__hero-copy">
                Find available chargers, see the network in real time, and access the tools that keep drivers, companies and charging partners moving.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.4} sx={{ mt: 4 }}>
                <Button
                  size="large"
                  variant="contained"
                  endIcon={<ArrowForwardRounded />}
                  onClick={scrollToNetwork}
                  sx={{ minHeight: 54, px: 3, bgcolor: '#5EDFB0', color: '#062038', boxShadow: '0 14px 32px rgba(70,222,170,.2)', '&:hover': { bgcolor: '#78E9C1' } }}
                >
                  Find a charging station
                </Button>
                <Button
                  size="large"
                  variant="outlined"
                  startIcon={<BusinessRounded />}
                  onClick={() => navigate('/company/login')}
                  sx={{ minHeight: 54, px: 3, color: '#fff', borderColor: 'rgba(255,255,255,.25)', '&:hover': { borderColor: 'rgba(255,255,255,.5)', bgcolor: 'rgba(255,255,255,.06)' } }}
                >
                  Company portal
                </Button>
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={{ xs: 1.5, sm: 3.5 }} sx={{ mt: 4.2 }}>
                {[
                  ['Live visibility', <WifiRounded key="wifi" />],
                  ['Trusted operations', <ShieldRounded key="shield" />],
                  ['Built for Nigeria', <LocationOnRounded key="location" />]
                ].map(([label, icon]) => (
                  <Stack key={label} direction="row" spacing={0.8} alignItems="center" color="rgba(229,240,248,.67)">
                    {React.cloneElement(icon, { sx: { fontSize: 17, color: '#64DFB4' } })}
                    <Typography variant="caption" fontWeight={650}>{label}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} lg={5}>
              <HeroConsole summary={publicSummary} />
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="xl" className="public-landing__metric-rail">
        <Grid container spacing={1.5}>
          <Grid item xs={6} md={3}>
            <ProofMetric icon={<EvStationRounded />} label="Charging stations" value={formatNumber(publicSummary.stations)} accent="#2F6FED" />
          </Grid>
          <Grid item xs={6} md={3}>
            <ProofMetric icon={<MapRounded />} label="Active locations" value={formatNumber(publicSummary.locations)} accent="#0E9F6E" />
          </Grid>
          <Grid item xs={6} md={3}>
            <ProofMetric icon={<ElectricBoltRounded />} label="Lifetime energy" value={formatEnergy(publicSummary.lifetimeEnergyWh)} accent="#7F56D9" />
          </Grid>
          <Grid item xs={6} md={3}>
            <ProofMetric icon={<DirectionsCarRounded />} label="Charging sessions" value={formatCompactNumber(publicSummary.lifetimeSessions)} accent="#E88424" />
          </Grid>
        </Grid>
      </Container>

      <Box component="main">
        <Container id="solutions" maxWidth="xl" sx={{ pt: { xs: 13, md: 16 }, pb: { xs: 8, md: 12 } }}>
          <Grid container spacing={{ xs: 3, md: 5 }} alignItems="end" sx={{ mb: { xs: 4, md: 6 } }}>
            <Grid item xs={12} md={7}>
              <Box className="public-landing__section-kicker">One connected ecosystem</Box>
              <Typography variant="h2" sx={{ mt: 1.5, maxWidth: 690, fontSize: { md: '2.7rem' }, color: '#09213A' }}>
                Charging infrastructure that works for everyone around it.
              </Typography>
            </Grid>
            <Grid item xs={12} md={5}>
              <Typography color="text.secondary" sx={{ maxWidth: 520, ml: { md: 'auto' } }}>
                From a driver checking availability to a business funding mobility and a partner monitoring performance, every view stays connected to the same live network.
              </Typography>
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={7}>
              <Card className="public-landing__bento public-landing__bento--dark">
                <CardContent sx={{ position: 'relative', zIndex: 1, p: { xs: 3, md: 4.5 }, '&:last-child': { pb: { xs: 3, md: 4.5 } } }}>
                  <Box sx={{ width: 52, height: 52, borderRadius: 3.5, display: 'grid', placeItems: 'center', color: '#69E2B8', bgcolor: 'rgba(105,226,184,.12)', border: '1px solid rgba(105,226,184,.15)' }}>
                    <SpeedRounded />
                  </Box>
                  <Typography variant="h3" color="#fff" sx={{ mt: 3, maxWidth: 520 }}>
                    A live network, not a static directory.
                  </Typography>
                  <Typography sx={{ mt: 1.5, maxWidth: 590, color: 'rgba(227,239,248,.65)' }}>
                    Station health and connector availability update continuously, helping every user make a better decision before they arrive.
                  </Typography>
                  <Grid container spacing={1.5} sx={{ mt: 3 }}>
                    {[
                      ['Online now', formatNumber(publicSummary.onlineStations)],
                      ['Sessions today', formatNumber(publicSummary.todaySessions)],
                      ['Energy today', formatEnergy(publicSummary.todayEnergyWh)]
                    ].map(([label, value]) => (
                      <Grid item xs={12} sm={4} key={label}>
                        <Box sx={{ p: 1.7, border: '1px solid rgba(255,255,255,.1)', borderRadius: 3, bgcolor: 'rgba(255,255,255,.045)' }}>
                          <Typography variant="caption" color="rgba(224,238,248,.5)">{label}</Typography>
                          <Typography color="#fff" fontWeight={800} sx={{ mt: 0.5 }}>{value}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={5}>
              <Grid container spacing={2} sx={{ height: 'calc(100% + 16px)' }}>
                <Grid item xs={12} sm={6} md={12}>
                  <Card className="public-landing__bento">
                    <CardContent sx={{ p: { xs: 3, md: 3.5 }, '&:last-child': { pb: { xs: 3, md: 3.5 } } }}>
                      <FeatureIcon><BusinessRounded /></FeatureIcon>
                      <Typography variant="h5" sx={{ mt: 2.5 }}>Mobility, under control</Typography>
                      <Typography color="text.secondary" sx={{ mt: 1 }}>
                        Companies can manage users, fund wallets and automate recurring mobility support from one focused workspace.
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={12}>
                  <Card className="public-landing__bento">
                    <CardContent sx={{ p: { xs: 3, md: 3.5 }, '&:last-child': { pb: { xs: 3, md: 3.5 } } }}>
                      <FeatureIcon><InsightsRounded /></FeatureIcon>
                      <Typography variant="h5" sx={{ mt: 2.5 }}>Performance made visible</Typography>
                      <Typography color="text.secondary" sx={{ mt: 1 }}>
                        Partners follow charger performance, energy delivery and earnings with reporting built around their own network.
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Container>

        <Box id="network" sx={{ py: { xs: 8, md: 12 }, bgcolor: '#EAF0F5' }}>
          <Container maxWidth="xl">
            <Box className="public-landing__network-shell" sx={{ p: { xs: 1.25, sm: 2, md: 3 } }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'flex-end' }} spacing={2} sx={{ px: { xs: 1, sm: 1.5 }, pt: { xs: 2, sm: 2.5 }, pb: 3 }}>
                <Box>
                  <Box className="public-landing__section-kicker" sx={{ color: '#66E2B6' }}>Live charging map</Box>
                  <Typography variant="h2" color="#fff" sx={{ mt: 1.2, fontSize: { md: '2.55rem' } }}>
                    Know where to charge before you move.
                  </Typography>
                  <Typography sx={{ mt: 1.2, maxWidth: 680, color: 'rgba(222,236,247,.6)' }}>
                    Search the live network, filter by availability or state, and open any location for station-level detail.
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1.1}>
                  <Box className="public-landing__eyebrow-dot" />
                  <Box>
                    <Typography variant="caption" display="block" color="#75E5BD" fontWeight={750}>LIVE DATA</Typography>
                    <Typography variant="caption" color="rgba(222,236,247,.5)">
                      {snapshot?.generatedAt
                        ? `Updated ${new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : 'Connecting to network'}
                    </Typography>
                  </Box>
                </Stack>
              </Stack>

              {error && <Alert severity="warning" sx={{ mx: 1, mb: 2 }}>{error}</Alert>}

              {loading ? (
                <Box sx={{ height: { xs: 500, md: 660 }, display: 'grid', placeItems: 'center', borderRadius: 4, bgcolor: 'rgba(255,255,255,.05)' }}>
                  <CircularProgress sx={{ color: '#66E2B6' }} />
                </Box>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={12} xl={9}>
                    <Card className="public-landing__network-map">
                      <FullscreenMap
                        height={{ xs: 560, sm: 620, md: 680 }}
                        overlay={filterOverlay}
                        panel={detailPanel}
                        ariaLabel="Public EV charging network map"
                      >
                        <TileLayer
                          attribution="&copy; OpenStreetMap contributors"
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <MapBounds locations={mappedLocations} focusLocation={selected} />
                        {mappedLocations.map(location => (
                          <Marker
                            key={location.id}
                            position={[Number(location.latitude), Number(location.longitude)]}
                            icon={evChargingMarker(location)}
                            eventHandlers={{ click: () => setSelected(location) }}
                          >
                            <Popup>
                              <strong>{location.name}</strong><br />
                              {location.onlineStations}/{location.stationCount} stations online<br />
                              {[location.city, location.state].filter(Boolean).join(', ')}
                            </Popup>
                          </Marker>
                        ))}
                      </FullscreenMap>
                      {!mappedLocations.length && (
                        <Alert severity="info" sx={{ borderRadius: 0 }}>No matching locations have map coordinates.</Alert>
                      )}
                    </Card>
                  </Grid>

                  <Grid item xs={12} xl={3}>
                    <Card className="public-landing__location-list" sx={{ height: { xl: 680 }, display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ p: 2.2 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="h6" color="#fff">Network locations</Typography>
                            <Typography variant="caption" color="rgba(222,236,247,.5)">
                              {filteredLocations.length} of {locations.length} shown
                            </Typography>
                          </Box>
                          <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 2.5, color: '#66E2B6', bgcolor: 'rgba(102,226,182,.1)' }}>
                            <LocationOnRounded />
                          </Box>
                        </Stack>
                      </Box>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,.09)' }} />
                      <List disablePadding sx={{ flex: 1, overflowY: 'auto', py: 0.8 }}>
                        {filteredLocations.map(location => {
                          const status = locationMarkerStatus(location);
                          return (
                            <ListItemButton
                              key={location.id}
                              selected={selected?.id === location.id}
                              onClick={() => setSelected(location)}
                            >
                              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: STATUS_COLORS[status], mr: 1.4, flex: '0 0 auto', boxShadow: `0 0 0 4px ${STATUS_COLORS[status]}18` }} />
                              <ListItemText
                                primary={<Typography variant="body2" color="#fff" fontWeight={750} noWrap>{location.name}</Typography>}
                                secondary={
                                  <Typography variant="caption" color="rgba(222,236,247,.48)" noWrap>
                                    {location.onlineStations}/{location.stationCount} online · {location.city || location.state || 'Network location'}
                                  </Typography>
                                }
                              />
                            </ListItemButton>
                          );
                        })}
                        {!filteredLocations.length && (
                          <Box p={3}>
                            <Typography variant="body2" textAlign="center" color="rgba(222,236,247,.55)">
                              No locations match your filters.
                            </Typography>
                          </Box>
                        )}
                      </List>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,.09)' }} />
                      <Stack direction="row" flexWrap="wrap" gap={1.2} sx={{ p: 2 }}>
                        {Object.entries(STATUS_LABELS).map(([status, label]) => (
                          <Stack direction="row" alignItems="center" spacing={0.65} key={status}>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: STATUS_COLORS[status] }} />
                            <Typography variant="caption" color="rgba(222,236,247,.56)">{label}</Typography>
                          </Stack>
                        ))}
                      </Stack>
                    </Card>
                  </Grid>
                </Grid>
              )}
            </Box>
          </Container>
        </Box>

        <Container id="access" maxWidth="xl" sx={{ py: { xs: 8, md: 12 } }}>
          <Stack alignItems="center" textAlign="center" sx={{ mb: { xs: 4, md: 6 } }}>
            <Box className="public-landing__section-kicker">Your EV Charge workspace</Box>
            <Typography variant="h2" sx={{ mt: 1.5, maxWidth: 700, fontSize: { md: '2.65rem' }, color: '#09213A' }}>
              One network. The right experience for your role.
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 650 }}>
              Enter the workspace designed around what you need to see, manage and act on.
            </Typography>
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <AccessCard
                icon={<DirectionsCarRounded />}
                title="Drivers"
                description="Explore live charging locations and know what is available before you arrive."
                action="Explore the network"
                onClick={scrollToNetwork}
                tone="#0E9F6E"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <AccessCard
                icon={<BusinessRounded />}
                title="Companies"
                description="Manage your mobile users, company wallet, funding activity and automated allowances."
                action="Open company portal"
                onClick={() => navigate('/company/login')}
                tone="#7F56D9"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <AccessCard
                icon={<AdminPanelSettingsRounded />}
                title="Operations & partners"
                description="Monitor charging operations, locations, performance, earnings and settlements securely."
                action="Sign in to your workspace"
                onClick={() => navigate('/login')}
                tone="#2F6FED"
              />
            </Grid>
          </Grid>

          <Box className="public-landing__cta" sx={{ mt: { xs: 6, md: 9 }, p: { xs: 3, sm: 4, md: 6 } }}>
            <Grid container spacing={3} alignItems="center" sx={{ position: 'relative', zIndex: 1 }}>
              <Grid item xs={12} md={8}>
                <Stack direction="row" spacing={1} alignItems="center" color="#72E6BD">
                  <ElectricBoltRounded fontSize="small" />
                  <Typography variant="overline" fontWeight={800} letterSpacing=".12em">EV mobility, connected</Typography>
                </Stack>
                <Typography variant="h3" color="#fff" sx={{ mt: 1.3, maxWidth: 730, fontSize: { md: '2.35rem' } }}>
                  Ready to put the EV Charge network to work?
                </Typography>
                <Typography sx={{ mt: 1.2, maxWidth: 650, color: 'rgba(229,240,248,.64)' }}>
                  Access your workspace or explore the live network to plan your next charge.
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Stack direction={{ xs: 'column', sm: 'row', md: 'column' }} spacing={1.25}>
                  <Button
                    size="large"
                    variant="contained"
                    endIcon={<ArrowForwardRounded />}
                    onClick={() => navigate('/login')}
                    sx={{ bgcolor: '#62E0B3', color: '#092139', '&:hover': { bgcolor: '#79E9C1' } }}
                  >
                    Sign in to EV Charge
                  </Button>
                  <Button
                    size="large"
                    variant="outlined"
                    onClick={scrollToNetwork}
                    sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.24)', '&:hover': { borderColor: 'rgba(255,255,255,.5)', bgcolor: 'rgba(255,255,255,.05)' } }}
                  >
                    View live stations
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Box>
        </Container>
      </Box>

      <Box component="footer" sx={{ bgcolor: '#061526', color: '#C7D5E1', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <Container maxWidth="xl" sx={{ py: { xs: 4, md: 5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={3}>
            <BrandMark branding={branding} assetUrl={assetUrl} />
            <Stack direction="row" flexWrap="wrap" gap={{ xs: 1.5, sm: 3 }}>
              <Button href="#network" color="inherit" size="small" sx={{ color: 'rgba(218,232,243,.65)', p: 0, minHeight: 'auto' }}>Live network</Button>
              <Button href="#solutions" color="inherit" size="small" sx={{ color: 'rgba(218,232,243,.65)', p: 0, minHeight: 'auto' }}>Solutions</Button>
              <Button href="#access" color="inherit" size="small" sx={{ color: 'rgba(218,232,243,.65)', p: 0, minHeight: 'auto' }}>Portals</Button>
            </Stack>
            <Typography variant="caption" color="rgba(200,217,230,.46)">
              © {new Date().getFullYear()} {systemName}. All rights reserved.
            </Typography>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
