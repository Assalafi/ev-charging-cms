import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const partnerRoles = ['partner_owner', 'partner_manager', 'partner_finance', 'partner_viewer'];
const adminRoles = ['super_admin', 'admin', 'finance', 'operations', 'support', 'viewer'];

function PrivateRoute({ children, audience = 'any' }) {
  const { isAuthenticated, isInitialized, currentUser } = useAuth();
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

  return children;
}

export default PrivateRoute;
