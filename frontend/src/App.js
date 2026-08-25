import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { BoltRounded } from '@mui/icons-material';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import StationList from './pages/stations/StationList';
import StationDetail from './pages/stations/StationDetail';
import TransactionList from './pages/transactions/TransactionList';
import TransactionDetail from './pages/transactions/TransactionDetail';
import FirmwareManagement from './pages/firmware/FirmwareManagement';
import DiagnosticLogs from './pages/diagnostics/DiagnosticLogs';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import AppUpdate from './pages/AppUpdate';
import MobileUsersList from './pages/mobileUsers/MobileUsersList';
import LocationsList from './pages/locations/LocationsList';
import AdsBoardList from './pages/adsBoard/AdsBoardList';
import PaymentManagement from './pages/PaymentManagement';
import PartnerList from './pages/partners/PartnerList';
import PartnerDetail from './pages/partners/PartnerDetail';
import PartnerForm from './pages/partners/PartnerForm';
import PartnerDashboard from './pages/partner/PartnerDashboard';
import PartnerMonitorMap from './pages/partner/PartnerMonitorMap';
import PartnerPerformance from './pages/partner/PartnerPerformance';
import PartnerSettlements from './pages/partner/PartnerSettlements';
import PartnerStations from './pages/partner/PartnerStations';
import PartnerLocations from './pages/partner/PartnerLocations';
import PartnerTransactions from './pages/partner/PartnerTransactions';
import PartnerProfile from './pages/partner/PartnerProfile';
import PartnerLayout from './components/PartnerLayout';
import SettlementList from './pages/settlements/SettlementList';
import NotFound from './pages/NotFound';
import AdminMonitorMap from './pages/monitor/AdminMonitorMap';
import AdminUsers from './pages/adminUsers/AdminUsers';
import { useAuth } from './contexts/AuthContext';
import { adminPages } from './utils/access';
import { useBranding } from './contexts/BrandingContext';

function App() {
  const { isInitialized, hasPermission } = useAuth();
  const { branding, assetUrl } = useBranding();
  const adminHome = adminPages.find(([permission]) => hasPermission(permission))?.[1] || '/profile';

  // Show loading screen while checking authentication
  if (!isInitialized) {
    return (
      <Box
        sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh', bgcolor: '#0B1220' }}
      >
        <Stack alignItems="center" spacing={2}>
          <Box sx={{ width: 54, height: 54, borderRadius: 3.5, display: 'grid', placeItems: 'center', overflow: 'hidden', color: '#fff', background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}>{branding.logoUrl ? <Box component="img" src={assetUrl(branding.logoUrl)} alt="" sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.6 }} /> : <BoltRounded />}</Box>
          <Typography color="#F8FAFC" fontWeight={700}>Preparing {branding.shortName || branding.systemName}</Typography>
          <CircularProgress size={24} sx={{ color: '#60A5FA' }} />
        </Stack>
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<PrivateRoute audience="admin"><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to={adminHome} replace />} />
        <Route path="dashboard" element={<PrivateRoute permission="dashboard.view"><Dashboard /></PrivateRoute>} />
        
        <Route path="stations">
          <Route index element={<PrivateRoute permission="stations.view"><StationList /></PrivateRoute>} />
          <Route path=":stationId" element={<PrivateRoute permission="stations.view"><StationDetail /></PrivateRoute>} />
          <Route path="firmware" element={<PrivateRoute permission="stations.update"><FirmwareManagement /></PrivateRoute>} />
          <Route path="diagnostics" element={<PrivateRoute permission="stations.monitor"><DiagnosticLogs /></PrivateRoute>} />
        </Route>
        
        <Route path="transactions">
          <Route index element={<PrivateRoute permission="transactions.view"><TransactionList /></PrivateRoute>} />
          <Route path=":id" element={<PrivateRoute permission="transactions.view"><TransactionDetail /></PrivateRoute>} />
        </Route>
        
        <Route path="mobile-users" element={<PrivateRoute permission="mobile_users.view"><MobileUsersList /></PrivateRoute>} />
        <Route path="locations" element={<PrivateRoute permission="locations.view"><LocationsList /></PrivateRoute>} />
        <Route path="monitor" element={<PrivateRoute permission="monitor.view"><AdminMonitorMap /></PrivateRoute>} />
        <Route path="payments" element={<PrivateRoute permission="payments.view"><PaymentManagement /></PrivateRoute>} />
        <Route path="ads-board" element={<PrivateRoute permission="ads.view"><AdsBoardList /></PrivateRoute>} />
        
        <Route path="partners">
          <Route index element={<PrivateRoute permission="partners.view"><PartnerList /></PrivateRoute>} />
          <Route path="new" element={<PrivateRoute permission="partners.create"><PartnerForm /></PrivateRoute>} />
          <Route path=":id" element={<PrivateRoute permission="partners.view"><PartnerDetail /></PrivateRoute>} />
          <Route path=":id/edit" element={<PrivateRoute permission="partners.update"><PartnerForm /></PrivateRoute>} />
        </Route>
        
        <Route path="settlements">
          <Route index element={<PrivateRoute permission="settlements.view"><SettlementList /></PrivateRoute>} />
        </Route>

        <Route path="profile" element={<Profile />} />
        <Route path="admin-users" element={<PrivateRoute permission="admin_users.view"><AdminUsers /></PrivateRoute>} />
        <Route path="settings" element={<PrivateRoute permission="settings.view"><Settings /></PrivateRoute>} />
        <Route path="app-update" element={<PrivateRoute permission="app_updates.view"><AppUpdate /></PrivateRoute>} />
      </Route>

      <Route path="/partner" element={<PrivateRoute audience="partner"><PartnerLayout /></PrivateRoute>}>
        <Route index element={<PartnerDashboard />} />
        <Route path="dashboard" element={<PartnerDashboard />} />
        <Route path="monitor" element={<PartnerMonitorMap />} />
        <Route path="stations" element={<PartnerStations />} />
        <Route path="locations" element={<PartnerLocations />} />
        <Route path="transactions" element={<PartnerTransactions />} />
        <Route path="performance" element={<PartnerPerformance />} />
        <Route path="settlements" element={<PartnerSettlements />} />
        <Route path="profile" element={<PartnerProfile />} />
      </Route>
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
