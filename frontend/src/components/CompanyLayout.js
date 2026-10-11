import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AppBar, Avatar, Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { AccountBalanceWalletRounded, BoltRounded, DashboardRounded, GroupsRounded, LogoutRounded, MapRounded, MenuRounded, ScheduleRounded } from '@mui/icons-material';
import { useCompanyAuth } from '../contexts/CompanyAuthContext';
import { useBranding } from '../contexts/BrandingContext';

const drawerWidth = 268;
const navItems = [
  { label: 'Overview', path: '/company/dashboard', icon: <DashboardRounded /> },
  { label: 'Live network', path: '/company/monitor', icon: <MapRounded /> },
  { label: 'Mobile users', path: '/company/users', icon: <GroupsRounded /> },
  { label: 'Company wallet', path: '/company/wallet', icon: <AccountBalanceWalletRounded /> },
  { label: 'Auto funding', path: '/company/funding', icon: <ScheduleRounded /> }
];

export default function CompanyLayout() {
  const { user, logout } = useCompanyAuth();
  const { branding, assetUrl } = useBranding();
  const theme = useTheme(); const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [open, setOpen] = useState(false); const location = useLocation();
  const company = user?.company || {};
  const initials = (user?.name || company.name || 'CO').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();

  const content = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#0B1220', color: '#E5E7EB' }}>
      <Box sx={{ px: 2.5, py: 2.25 }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <Box sx={{ width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: '#2563EB', overflow: 'hidden' }}>{branding.logoUrl ? <Box component="img" src={assetUrl(branding.logoUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', p: .4 }} /> : <BoltRounded />}</Box>
          <Box minWidth={0}><Typography fontWeight={800} letterSpacing="-.02em" noWrap>{branding.shortName || branding.systemName || 'EV Charge'}</Typography><Typography variant="caption" sx={{ color: '#94A3B8' }}>Company portal</Typography></Box>
        </Stack>
      </Box>
      <Box sx={{ px: 1.5, pb: 1 }}><Typography variant="overline" sx={{ px: 1, color: '#64748B', fontWeight: 800, letterSpacing: '.12em' }}>Workspace</Typography></Box>
      <List sx={{ px: 1.25, pt: 0 }}>
        {navItems.map(item => <ListItemButton key={item.path} component={NavLink} to={item.path} onClick={() => setOpen(false)} selected={location.pathname === item.path || (item.path !== '/company/dashboard' && location.pathname.startsWith(item.path))} sx={{ color: '#CBD5E1', mb: .55, '&.active, &.Mui-selected': { color: '#fff', bgcolor: 'rgba(37,99,235,.22)', '& .MuiListItemIcon-root': { color: '#60A5FA' } }, '&:hover': { bgcolor: 'rgba(148,163,184,.12)' } }}><ListItemIcon sx={{ color: '#94A3B8', minWidth: 40 }}>{item.icon}</ListItemIcon><ListItemText primary={item.label} /></ListItemButton>)}
      </List>
      <Box flex={1} />
      <Box sx={{ mx: 1.5, mb: 1.5, p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,.06)' }}><Stack direction="row" gap={1.2} alignItems="center"><Avatar sx={{ width: 34, height: 34, bgcolor: '#2563EB', fontSize: 13 }}>{initials}</Avatar><Box minWidth={0}><Typography variant="body2" fontWeight={700} noWrap>{user?.name}</Typography><Typography variant="caption" sx={{ color: '#94A3B8' }}>{user?.role}</Typography></Box></Stack></Box>
      <Divider sx={{ borderColor: 'rgba(148,163,184,.16)' }} />
      <List sx={{ px: 1.25, py: 1.2 }}><ListItemButton onClick={logout} sx={{ color: '#CBD5E1', '&:hover': { bgcolor: 'rgba(239,68,68,.12)', color: '#FCA5A5' } }}><ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}><LogoutRounded /></ListItemIcon><ListItemText primary="Sign out" /></ListItemButton></List>
    </Box>
  );

  return <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#F4F7FB' }}>
    <AppBar position="fixed" elevation={0} sx={{ display: { md: 'none' }, bgcolor: 'rgba(255,255,255,.92)', color: '#101828', backdropFilter: 'blur(14px)', borderBottom: '1px solid #EAECF0' }}><Toolbar><IconButton onClick={() => setOpen(true)} edge="start"><MenuRounded /></IconButton><Typography fontWeight={800} sx={{ flex: 1, ml: 1 }}>{company.name || 'Company portal'}</Typography><Tooltip title="Wallet"><IconButton component={NavLink} to="/company/wallet"><AccountBalanceWalletRounded /></IconButton></Tooltip></Toolbar></AppBar>
    <Drawer variant={mobile ? 'temporary' : 'permanent'} open={mobile ? open : true} onClose={() => setOpen(false)} ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth, border: 0, bgcolor: '#0B1220' } }}>{content}</Drawer>
    <Box component="main" sx={{ flex: 1, minWidth: 0, ml: { md: `${drawerWidth}px` }, pt: { xs: 9, md: 0 } }}><Box sx={{ maxWidth: 1600, mx: 'auto', p: { xs: 2, sm: 3, lg: 4 } }}><Outlet /></Box></Box>
  </Box>;
}
