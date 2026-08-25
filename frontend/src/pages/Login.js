import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  BoltRounded,
  CheckCircleRounded,
  EvStationRounded,
  HubRounded,
  LockOutlined,
  PersonOutlineRounded,
  VisibilityOffOutlined,
  VisibilityOutlined
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { adminHomePath } from '../utils/access';
import { useBranding } from '../contexts/BrandingContext';

const highlights = [
  { icon: <HubRounded />, title: 'One connected network', text: 'Monitor chargers, locations and sessions from a single operational view.' },
  { icon: <EvStationRounded />, title: 'Realtime operations', text: 'See station health and charging activity as events happen.' }
];

function Login() {
  const { branding, assetUrl } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async event => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('Enter your username and password to continue.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const result = await login(username.trim(), password);
      if (!result.success) {
        setError(result.message || 'Unable to sign in. Check your details and try again.');
        return;
      }
      const partnerRoles = ['partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'];
      const defaultPath = partnerRoles.includes(result.user.role) ? '/partner/dashboard' : adminHomePath(result.user);
      navigate(location.state?.from?.pathname || defaultPath, { replace: true });
    } catch (loginError) {
      console.error('Login error:', loginError);
      setError('We could not sign you in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(440px, 0.92fr) minmax(520px, 1.08fr)' }, bgcolor: '#F8FAFC' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', px: { xs: 2.5, sm: 7, xl: 12 }, py: { xs: 5, lg: 8 }, position: 'relative', zIndex: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ position: { lg: 'absolute' }, top: { lg: 42 }, left: { lg: 72, xl: 96 }, mb: { xs: 6, lg: 0 } }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 3, display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#fff', background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})`, boxShadow: '0 10px 25px rgba(37,99,235,.24)' }}>{branding.logoUrl ? <Box component="img" src={assetUrl(branding.logoUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.5 }} /> : <BoltRounded />}</Box>
          <Box><Typography fontWeight={800} lineHeight={1.1}>{branding.systemName}</Typography><Typography variant="caption" color="text.secondary">{branding.loginSubtitle}</Typography></Box>
        </Stack>

        <Box sx={{ width: '100%', maxWidth: 460, mx: 'auto' }}>
          <Typography variant="overline" color="primary.main" fontWeight={750} letterSpacing=".12em">Welcome back</Typography>
          <Typography variant="h2" component="h1" sx={{ mt: 0.6 }}>Sign in to your workspace</Typography>
          <Typography color="text.secondary" sx={{ mt: 1.2, mb: 4 }}>Manage the charging network, partners and daily operations securely.</Typography>

          {error && <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={2.25}>
              <Box>
                <Typography component="label" htmlFor="username" variant="body2" fontWeight={650}>Username</Typography>
                <TextField
                  fullWidth
                  id="username"
                  name="username"
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  disabled={loading}
                  InputProps={{ startAdornment: <InputAdornment position="start"><PersonOutlineRounded color="action" /></InputAdornment> }}
                  sx={{ mt: 0.8 }}
                />
              </Box>
              <Box>
                <Typography component="label" htmlFor="password" variant="body2" fontWeight={650}>Password</Typography>
                <TextField
                  fullWidth
                  id="password"
                  name="password"
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={loading}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockOutlined color="action" /></InputAdornment>,
                    endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPassword(value => !value)} edge="end" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <VisibilityOffOutlined /> : <VisibilityOutlined />}</IconButton></InputAdornment>
                  }}
                  sx={{ mt: 0.8 }}
                />
              </Box>
              <Button type="submit" fullWidth variant="contained" size="large" disabled={loading} sx={{ height: 50, mt: 0.5 }}>
                {loading ? <><CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />Signing in…</> : 'Sign in securely'}
              </Button>
            </Stack>
          </Box>

          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.7} sx={{ mt: 3 }}>
            <CheckCircleRounded sx={{ fontSize: 17, color: 'success.main' }} />
            <Typography variant="caption" color="text.secondary">Protected access for authorized team members</Typography>
          </Stack>
        </Box>
      </Box>

      <Box sx={{ display: { xs: 'none', lg: 'flex' }, position: 'relative', overflow: 'hidden', bgcolor: '#09111F', color: '#FFFFFF', p: { lg: 7, xl: 10 }, alignItems: 'center' }}>
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.32, backgroundImage: 'radial-gradient(circle at 15% 20%, #2563EB 0, transparent 36%), radial-gradient(circle at 90% 75%, #0E9F6E 0, transparent 34%)' }} />
        <Box sx={{ position: 'absolute', inset: 0, opacity: 0.08, backgroundImage: 'linear-gradient(rgba(255,255,255,.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.7) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

        <Box sx={{ position: 'relative', width: '100%', maxWidth: 700, mx: 'auto' }}>
          <Typography variant="overline" sx={{ color: '#60A5FA', fontWeight: 750, letterSpacing: '.14em' }}>Smarter charging operations</Typography>
          <Typography variant="h1" sx={{ color: '#FFFFFF', mt: 1.5, maxWidth: 630 }}>Power every journey from one intelligent console.</Typography>
          <Typography sx={{ color: '#94A3B8', fontSize: '1.05rem', mt: 2, maxWidth: 570 }}>A clear, live view of your entire EV charging ecosystem—from uptime and energy delivery to earnings and settlements.</Typography>

          <Stack spacing={2} sx={{ mt: 5 }}>
            {highlights.map(item => (
              <Paper key={item.title} sx={{ p: 2.2, bgcolor: alpha('#FFFFFF', 0.07), color: '#FFFFFF', border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(12px)', maxWidth: 540 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha('#60A5FA', 0.14), color: '#60A5FA' }}>{item.icon}</Box>
                  <Box><Typography fontWeight={700}>{item.title}</Typography><Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.3 }}>{item.text}</Typography></Box>
                </Stack>
              </Paper>
            ))}
          </Stack>

          <Box sx={{ mt: 5, width: '100%', maxWidth: 620, height: 150, position: 'relative' }} aria-hidden="true">
            <Box sx={{ position: 'absolute', left: 15, right: 15, top: 73, height: 2, bgcolor: 'rgba(96,165,250,.24)' }} />
            {[{ x: '8%', y: 45 }, { x: '35%', y: 95 }, { x: '63%', y: 35 }, { x: '88%', y: 82 }].map((point, index) => (
              <Box key={index} sx={{ position: 'absolute', left: point.x, top: point.y, width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: index === 2 ? '#0E9F6E' : '#2563EB', border: '5px solid rgba(255,255,255,.1)', boxShadow: '0 0 0 8px rgba(37,99,235,.08)' }}><BoltRounded fontSize="small" /></Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default Login;
