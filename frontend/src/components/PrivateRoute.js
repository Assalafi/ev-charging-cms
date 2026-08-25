import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const partnerRoles = ['partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'];
const adminRoles = ['super_admin', 'admin', 'manager', 'finance', 'operations', 'operator', 'technician', 'support', 'viewer'];

function PrivateRoute({ children, audience = 'any', permission }) {
  const { isAuthenticated, isInitialized, currentUser, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading state while auth is initializing
  if (!isInitialized) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    // Redirect to login page with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const isPartner = partnerRoles.includes(currentUser?.role) && Boolean(currentUser?.partnerId);
  const isAdmin = adminRoles.includes(currentUser?.role) && !currentUser?.partnerId;
  if (audience === 'partner' && !isPartner) {
    return <Navigate to="/dashboard" replace />;
  }
  if (audience === 'admin' && !isAdmin) {
    return <Navigate to={isPartner ? '/partner/dashboard' : '/login'} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 180px)', p: 2 }}>
        <Paper variant="outlined" sx={{ width: '100%', maxWidth: 520, p: { xs: 3, sm: 5 }, textAlign: 'center', borderRadius: 4 }}>
          <Stack alignItems="center" spacing={2}>
            <Box sx={{ width: 60, height: 60, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'warning.50', color: 'warning.dark' }}><LockOutlined /></Box>
            <Typography variant="h5" fontWeight={760}>Page access restricted</Typography>
            <Typography color="text.secondary">Your account does not have permission to open this page. Ask an administrator to update your access.</Typography>
            <Button variant="contained" onClick={() => window.history.back()}>Go back</Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  return children;
}

export default PrivateRoute;
