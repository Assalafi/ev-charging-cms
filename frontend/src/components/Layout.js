import React from 'react';
import {
  AccountBalanceRounded,
  AdminPanelSettingsRounded,
  CampaignRounded,
  DashboardRounded,
  EvStationRounded,
  LocationOnRounded,
  MapRounded,
  PaymentsRounded,
  PeopleAltRounded,
  ReceiptLongRounded,
  SettingsRounded,
  StorefrontRounded,
  SystemUpdateAltRounded
} from '@mui/icons-material';
import AppShell from './AppShell';
import { useAuth } from '../contexts/AuthContext';

const navGroups = [
  { label: 'Workspace', items: [
    { label: 'Dashboard', icon: <DashboardRounded />, path: '/dashboard', permission: 'dashboard.view' },
    { label: 'Live monitor', icon: <MapRounded />, path: '/monitor', permission: 'monitor.view' }
  ] },
  { label: 'Charging network', items: [
    { label: 'Stations', icon: <EvStationRounded />, path: '/stations', permission: 'stations.view' },
    { label: 'Locations', icon: <LocationOnRounded />, path: '/locations', permission: 'locations.view' },
    { label: 'Transactions', icon: <ReceiptLongRounded />, path: '/transactions', permission: 'transactions.view' },
    { label: 'Mobile users', icon: <PeopleAltRounded />, path: '/mobile-users', permission: 'mobile_users.view' }
  ] },
  { label: 'Commercial', items: [
    { label: 'Payments', icon: <PaymentsRounded />, path: '/payments', permission: 'payments.view' },
    { label: 'Partners', icon: <StorefrontRounded />, path: '/partners', permission: 'partners.view' },
    { label: 'Settlements', icon: <AccountBalanceRounded />, path: '/settlements', permission: 'settlements.view' },
    { label: 'Ads board', icon: <CampaignRounded />, path: '/ads-board', permission: 'ads.view' }
  ] },
  { label: 'System', items: [
    { label: 'Admin users', icon: <AdminPanelSettingsRounded />, path: '/admin-users', permission: 'admin_users.view' },
    { label: 'Settings', icon: <SettingsRounded />, path: '/settings', permission: 'settings.view' },
    { label: 'App update', icon: <SystemUpdateAltRounded />, path: '/app-update', permission: 'app_updates.view' }
  ] }
];

const Layout = () => {
  const { hasPermission } = useAuth();
  const visibleGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => hasPermission(item.permission)) }))
    .filter(group => group.items.length);
  return <AppShell portalName="Operations console" navGroups={visibleGroups} profilePath="/profile" />;
};

export default Layout;
