import React from 'react';
import {
  AccountBalanceWalletRounded,
  DashboardRounded,
  EvStationRounded,
  LocationOnRounded,
  MapRounded,
  PersonRounded,
  QueryStatsRounded,
  ReceiptLongRounded
} from '@mui/icons-material';
import AppShell from './AppShell';

const navGroups = [
  { label: 'Workspace', items: [
    { label: 'Dashboard', icon: <DashboardRounded />, path: '/partner/dashboard' },
    { label: 'Live monitor', icon: <MapRounded />, path: '/partner/monitor' },
    { label: 'Performance', icon: <QueryStatsRounded />, path: '/partner/performance' }
  ] },
  { label: 'My network', items: [
    { label: 'Stations', icon: <EvStationRounded />, path: '/partner/stations' },
    { label: 'Locations', icon: <LocationOnRounded />, path: '/partner/locations' },
    { label: 'Transactions', icon: <ReceiptLongRounded />, path: '/partner/transactions' }
  ] },
  { label: 'Account', items: [
    { label: 'Settlements', icon: <AccountBalanceWalletRounded />, path: '/partner/settlements' },
    { label: 'Profile', icon: <PersonRounded />, path: '/partner/profile' }
  ] }
];

const PartnerLayout = () => <AppShell portalName="Partner portal" navGroups={navGroups} profilePath="/partner/profile" />;

export default PartnerLayout;
