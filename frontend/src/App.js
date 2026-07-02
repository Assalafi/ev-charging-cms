import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box } from '@mui/material';
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
import ComingSoon from './pages/partner/ComingSoon';
import PartnerLayout from './components/PartnerLayout';
import SettlementList from './pages/settlements/SettlementList';
import NotFound from './pages/NotFound';
import { useAuth } from './contexts/AuthContext';

function App() {
  const { isInitialized } = useAuth();

  // Show loading screen while checking authentication
  if (!isInitialized) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        Loading...
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        
        <Route path="stations">
          <Route index element={<StationList />} />
          <Route path=":stationId" element={<StationDetail />} />
          <Route path="firmware" element={<FirmwareManagement />} />
          <Route path="diagnostics" element={<DiagnosticLogs />} />
        </Route>
        
        <Route path="transactions">
          <Route index element={<TransactionList />} />
          <Route path=":id" element={<TransactionDetail />} />
        </Route>
        
        <Route path="mobile-users" element={<MobileUsersList />} />
        <Route path="locations" element={<LocationsList />} />
        <Route path="payments" element={<PaymentManagement />} />
        <Route path="ads-board" element={<AdsBoardList />} />
        
        <Route path="partners">
          <Route index element={<PartnerList />} />
          <Route path="new" element={<PartnerForm />} />
          <Route path=":id" element={<PartnerDetail />} />
          <Route path=":id/edit" element={<PartnerForm />} />
        </Route>
        
        <Route path="settlements">
          <Route index element={<SettlementList />} />
        </Route>

        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="app-update" element={<AppUpdate />} />
      </Route>

      <Route path="/partner" element={<PrivateRoute><PartnerLayout /></PrivateRoute>}>
        <Route index element={<PartnerDashboard />} />
        <Route path="dashboard" element={<PartnerDashboard />} />
        <Route path="monitor" element={<PartnerMonitorMap />} />
        <Route path="stations" element={<ComingSoon title="Partner Stations" />} />
        <Route path="locations" element={<ComingSoon title="Partner Locations" />} />
        <Route path="transactions" element={<ComingSoon title="Partner Transactions" />} />
        <Route path="performance" element={<PartnerPerformance />} />
        <Route path="revenue" element={<ComingSoon title="Partner Revenue" />} />
        <Route path="settlements" element={<PartnerSettlements />} />
        <Route path="reports" element={<ComingSoon title="Partner Reports" />} />
        <Route path="notifications" element={<ComingSoon title="Partner Notifications" />} />
        <Route path="support" element={<ComingSoon title="Partner Support" />} />
      </Route>
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
