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
        
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
        <Route path="app-update" element={<AppUpdate />} />
      </Route>
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
