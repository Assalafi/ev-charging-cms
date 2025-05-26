import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function PrivateRoute({ children }) {
  const { isAuthenticated, isInitialized } = useAuth();
  const location = useLocation();

  // If auth is still initializing, don't redirect yet
  if (!isInitialized) {
    return null;
  }

  if (!isAuthenticated) {
    // Redirect to login page with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default PrivateRoute;
