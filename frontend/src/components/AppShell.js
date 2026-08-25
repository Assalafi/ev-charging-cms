import React, { useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  useTheme
} from '@mui/material';
import {
  BoltRounded as BoltIcon,
  ChevronRightRounded as ChevronIcon,
  LogoutRounded as LogoutIcon,
  MenuRounded as MenuIcon,
  PersonOutlineRounded as PersonIcon,
  SearchRounded as SearchIcon
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../contexts/BrandingContext';

const drawerWidth = 280;

const AppShell = ({ portalName, navGroups, profilePath }) => {
  const { currentUser, logout } = useAuth();
  const { branding, assetUrl } = useBranding();
  const theme = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState(null);
  const [filter, setFilter] = useState('');

  const allItems = useMemo(() => navGroups.flatMap(group => group.items), [navGroups]);
  const activeItem = allItems
    .filter(item => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const filteredGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => item.label.toLowerCase().includes(filter.toLowerCase())) }))
    .filter(group => group.items.length);

  const goTo = path => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    setProfileAnchor(null);
    logout();
    navigate('/login');
  };

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B1220', color: '#E2E8F0' }}>
      <Stack direction="row" alignItems="center" spacing={1.4} sx={{ height: 78, px: 2.5 }}>
        <Box sx={{ width: 42, height: 42, borderRadius: 3, display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#FFFFFF', background: `linear-gradient(135deg, ${branding.primaryColor} 0%, ${branding.secondaryColor} 100%)`, boxShadow: `0 8px 20px ${alpha(branding.primaryColor, .28)}` }}>
          {branding.logoUrl ? <Box component="img" src={assetUrl(branding.logoUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.5 }} /> : <BoltIcon />}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" color="#FFFFFF" fontWeight={750} noWrap>{branding.shortName || branding.systemName}</Typography>
          <Typography variant="caption" color="#94A3B8" noWrap>{portalName}</Typography>
        </Box>
      </Stack>

      <Box sx={{ px: 2, pb: 1.5 }}>
        <TextField
          fullWidth
          value={filter}
          onChange={event => setFilter(event.target.value)}
          placeholder="Find a page"
          inputProps={{ 'aria-label': 'Filter navigation' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: '#64748B', fontSize: 20 }} /></InputAdornment> }}
          sx={{
            '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,.06)', color: '#E2E8F0', minHeight: 40, '& fieldset': { borderColor: 'rgba(148,163,184,.16)' }, '&:hover fieldset': { borderColor: 'rgba(148,163,184,.35)' } },
            '& input::placeholder': { color: '#64748B', opacity: 1 }
          }}
        />
      </Box>

      <Box sx={{ overflowY: 'auto', flex: 1, px: 1.5, pb: 2 }}>
        {filteredGroups.map(group => (
          <Box key={group.label} sx={{ mt: 1.5 }}>
            <Typography variant="overline" sx={{ display: 'block', color: '#64748B', fontSize: '0.66rem', fontWeight: 750, letterSpacing: '.12em', px: 1.5, mb: 0.5 }}>
              {group.label}
            </Typography>
            <List disablePadding>
              {group.items.map(item => {
                const selected = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
                return (
                  <ListItemButton
                    key={item.path}
                    selected={selected}
                    onClick={() => goTo(item.path)}
                    sx={{
                      minHeight: 44,
                      px: 1.4,
                      mb: 0.35,
                      borderRadius: 2.5,
                      color: selected ? '#FFFFFF' : '#94A3B8',
                      '& .MuiListItemIcon-root': { color: selected ? '#60A5FA' : '#64748B' },
                      '&.Mui-selected': { bgcolor: 'rgba(37,99,235,.18)', '&:hover': { bgcolor: 'rgba(37,99,235,.24)' } },
                      '&:hover': { bgcolor: 'rgba(255,255,255,.055)', color: '#E2E8F0' }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 37 }}>{React.cloneElement(item.icon, { sx: { fontSize: 20 } })}</ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: selected ? 650 : 520 }} />
                    {selected && <ChevronIcon sx={{ fontSize: 18, color: '#60A5FA' }} />}
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Box sx={{ p: 2 }}>
        <Box sx={{ p: 1.4, border: '1px solid rgba(148,163,184,.14)', bgcolor: 'rgba(255,255,255,.035)', borderRadius: 3 }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar sx={{ width: 36, height: 36, bgcolor: '#2563EB', fontSize: '0.9rem', fontWeight: 700 }}>
              {(currentUser?.username || 'U').slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" color="#F8FAFC" fontWeight={650} noWrap>{currentUser?.username || 'User'}</Typography>
              <Typography variant="caption" color="#64748B" noWrap>{(currentUser?.role || '').replaceAll('_', ' ')}</Typography>
            </Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{ width: { lg: `calc(100% - ${drawerWidth}px)` }, ml: { lg: `${drawerWidth}px` }, borderBottom: '1px solid', borderColor: 'divider', bgcolor: alpha('#FFFFFF', 0.92), backdropFilter: 'blur(16px)', zIndex: theme.zIndex.drawer - 1 }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, sm: 72 }, px: { xs: 1.5, sm: 3 } }}>
          <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { lg: 'none' }, mr: 1 }} aria-label="Open navigation"><MenuIcon /></IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={720} noWrap>{activeItem?.label || portalName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{branding.shortName || branding.systemName} / {activeItem?.label || 'Overview'}</Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1.25 }}>
            <Tooltip title="Account menu">
              <IconButton onClick={event => setProfileAnchor(event.currentTarget)} sx={{ p: 0.5 }}>
                <Avatar sx={{ width: 38, height: 38, bgcolor: 'primary.main', fontSize: '0.9rem', fontWeight: 700 }}>{(currentUser?.username || 'U').slice(0, 1).toUpperCase()}</Avatar>
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }} aria-label={`${portalName} navigation`}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', lg: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, border: 0 } }}>{drawer}</Drawer>
        <Drawer variant="permanent" open sx={{ display: { xs: 'none', lg: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, border: 0 } }}>{drawer}</Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, width: { lg: `calc(100% - ${drawerWidth}px)` }, minHeight: '100vh', bgcolor: 'background.default' }}>
        <Toolbar sx={{ minHeight: { xs: 64, sm: 72 } }} />
        <Box className="app-page page-enter" sx={{ p: { xs: 1.5, sm: 3, xl: 4 }, maxWidth: 1920, mx: 'auto' }}><Outlet /></Box>
      </Box>

      <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)} PaperProps={{ sx: { mt: 1, minWidth: 210, border: '1px solid', borderColor: 'divider', boxShadow: 5 } }}>
        <Box sx={{ px: 2, py: 1.25 }}><Typography variant="body2" fontWeight={700}>{currentUser?.username}</Typography><Typography variant="caption" color="text.secondary">{currentUser?.email || currentUser?.role}</Typography></Box>
        <Divider />
        <MenuItem onClick={() => { setProfileAnchor(null); navigate(profilePath); }}><ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>My profile</MenuItem>
        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}><ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>Sign out</MenuItem>
      </Menu>
    </Box>
  );
};

export default AppShell;
