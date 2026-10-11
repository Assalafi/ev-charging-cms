import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useCompanyAuth } from '../contexts/CompanyAuthContext';

export default function CompanyPrivateRoute({ children }) {
  const { isAuthenticated, isInitialized } = useCompanyAuth();
  const location = useLocation();
  if (!isInitialized) return <Box minHeight="100vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
  if (!isAuthenticated) return <Navigate to="/company/login" state={{ from: location }} replace />;
  return children;
}

