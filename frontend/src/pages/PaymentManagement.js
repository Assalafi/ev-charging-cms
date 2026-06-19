import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Visibility as VisibilityIcon,
  TrendingUp as TrendingUpIcon,
  AccountBalanceWallet as WalletIcon,
  CreditCard as CreditCardIcon,
  VerifiedUser as VerifyIcon
} from '@mui/icons-material';
import api from '../services/api';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`payment-tabpanel-${index}`}
      aria-labelledby={`payment-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

function PaymentManagement() {
  const [tabValue, setTabValue] = useState(0);
  const [settings, setSettings] = useState({
    paystack: { publicKey: '', secretKey: '', callbackUrl: '' },
    wallet: { minFundingAmount: 100, maxFundingAmount: 100000, currency: 'NGN' },
    features: { walletEnabled: true, autoVerifyPayments: true }
  });
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [stats, setStats] = useState({
    transactions: { total: 0, successful: 0, failed: 0, pending: 0, successRate: 0, totalVolume: 0 },
    wallets: { total: 0, active: 0, totalBalance: 0, averageBalance: 0 }
  });
  const [loading, setLoading] = useState({
    settings: false,
    transactions: false,
    wallets: false,
    stats: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    type: '',
    userId: '',
    startDate: '',
    endDate: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1
  });
  const [walletPagination, setWalletPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1
  });
  const [mobileUsers, setMobileUsers] = useState([]);
  const [verifying, setVerifying] = useState(null);

  useEffect(() => {
    fetchPaymentSettings();
    fetchTransactions();
    fetchWallets();
    fetchStats();
    fetchMobileUsers();
  }, []);

  const fetchPaymentSettings = async () => {
    setLoading(prev => ({ ...prev, settings: true }));
    try {
      const response = await api.get('/admin/payments/settings');
      if (response.data.success) {
        setSettings(response.data.settings);
      }
    } catch (error) {
      setError('Failed to fetch payment settings');
    } finally {
      setLoading(prev => ({ ...prev, settings: false }));
    }
  };

  const fetchTransactions = async () => {
    setLoading(prev => ({ ...prev, transactions: true }));
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };
      // Remove empty filter values
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === undefined) {
          delete params[key];
        }
      });
      const response = await api.get('/admin/payments/transactions', { params });
      if (response.data.success) {
        setTransactions(response.data.transactions);
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination?.total || 0,
          pages: response.data.pagination?.pages || 1
        }));
      }
    } catch (error) {
      setError('Failed to fetch transactions');
    } finally {
      setLoading(prev => ({ ...prev, transactions: false }));
    }
  };

  const fetchWallets = async () => {
    setLoading(prev => ({ ...prev, wallets: true }));
    try {
      const params = {
        page: walletPagination.page,
        limit: walletPagination.limit
      };
      const response = await api.get('/admin/payments/wallets', { params });
      if (response.data.success) {
        setWallets(response.data.wallets);
        setWalletPagination(prev => ({
          ...prev,
          total: response.data.pagination?.total || 0,
          pages: response.data.pagination?.pages || 1
        }));
      }
    } catch (error) {
      setError('Failed to fetch wallets');
    } finally {
      setLoading(prev => ({ ...prev, wallets: false }));
    }
  };

  const fetchStats = async () => {
    setLoading(prev => ({ ...prev, stats: true }));
    try {
      const response = await api.get('/admin/payments/stats');
      if (response.data.success) {
        setStats(response.data.stats);
      }
    } catch (error) {
      setError('Failed to fetch statistics');
    } finally {
      setLoading(prev => ({ ...prev, stats: false }));
    }
  };

  const fetchMobileUsers = async () => {
    try {
      const response = await api.get('/admin/payments/users');
      if (response.data.success) {
        setMobileUsers(response.data.users);
      }
    } catch (error) {
      console.error('Failed to fetch mobile users:', error);
    }
  };

  const updateSettings = async () => {
    setLoading(prev => ({ ...prev, settings: true }));
    try {
      const response = await api.put('/admin/payments/settings', settings);
      if (response.data.success) {
        setSuccess('Payment settings updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error) {
      setError('Failed to update payment settings');
    } finally {
      setLoading(prev => ({ ...prev, settings: false }));
    }
  };

  const verifyTransaction = async (transactionId) => {
    setVerifying(transactionId);
    setError('');
    try {
      const response = await api.post(`/admin/payments/verify/${transactionId}`);
      if (response.data.success) {
        setSuccess(response.data.message || 'Payment verified successfully');
        fetchTransactions();
        fetchWallets();
        fetchStats();
        setTimeout(() => setSuccess(''), 5000);
      } else {
        setError(response.data.message || 'Verification returned no change');
        setTimeout(() => setError(''), 5000);
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to verify payment');
      setTimeout(() => setError(''), 5000);
    } finally {
      setVerifying(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SUCCESS': return 'success';
      case 'FAILED': return 'error';
      case 'PENDING': return 'warning';
      default: return 'default';
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Payment Management
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="Transactions" />
        <Tab label="Wallets" />
        <Tab label="Statistics" />
        <Tab label="Settings" />
      </Tabs>

      {/* Transactions Tab - Index 0 */}
      <TabPanel value={tabValue} index={0}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Payment Transactions</Typography>
              <IconButton onClick={fetchTransactions} disabled={loading.transactions}>
                <RefreshIcon />
              </IconButton>
            </Box>

            {/* Filters */}
            <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={filters.status}
                      label="Status"
                      onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="SUCCESS">Success</MenuItem>
                      <MenuItem value="FAILED">Failed</MenuItem>
                      <MenuItem value="PENDING">Pending</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={filters.type}
                      label="Type"
                      onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value, page: 1 }))}
                    >
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="CREDIT">Credit</MenuItem>
                      <MenuItem value="DEBIT">Debit</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>User</InputLabel>
                    <Select
                      value={filters.userId}
                      label="User"
                      onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value, page: 1 }))}
                    >
                      <MenuItem value="">All Users</MenuItem>
                      {mobileUsers.map(user => (
                        <MenuItem key={user.id} value={user.id}>
                          {user.name} ({user.phone})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="Start Date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.startDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value, page: 1 }))}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="End Date"
                    InputLabelProps={{ shrink: true }}
                    value={filters.endDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value, page: 1 }))}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" onClick={fetchTransactions} disabled={loading.transactions}>
                      Apply Filters
                    </Button>
                    <Button variant="outlined" onClick={() => {
                      setFilters({ status: '', type: '', userId: '', startDate: '', endDate: '' });
                      setPagination(prev => ({ ...prev, page: 1 }));
                      fetchTransactions();
                    }}>
                      Clear
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{transaction.id}</TableCell>
                      <TableCell>{transaction.user?.name || 'Unknown'}</TableCell>
                      <TableCell>
                        <Chip
                          label={transaction.type}
                          color={transaction.type === 'CREDIT' ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                      <TableCell>
                        <Chip
                          label={transaction.status}
                          color={getStatusColor(transaction.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(transaction.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {transaction.status === 'PENDING' && transaction.type === 'CREDIT' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            startIcon={verifying === transaction.id ? <CircularProgress size={16} color="inherit" /> : <VerifyIcon />}
                            onClick={() => verifyTransaction(transaction.id)}
                            disabled={verifying === transaction.id}
                          >
                            {verifying === transaction.id ? 'Verifying...' : 'Verify'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="body2" color="textSecondary">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} transactions
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  disabled={pagination.page === 1 || loading.transactions}
                  onClick={() => {
                    setPagination(prev => ({ ...prev, page: prev.page - 1 }));
                    fetchTransactions();
                  }}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  disabled={pagination.page >= pagination.pages || loading.transactions}
                  onClick={() => {
                    setPagination(prev => ({ ...prev, page: prev.page + 1 }));
                    fetchTransactions();
                  }}
                >
                  Next
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Wallets Tab - Index 1 */}
      <TabPanel value={tabValue} index={1}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">User Wallets</Typography>
              <IconButton onClick={fetchWallets} disabled={loading.wallets}>
                <RefreshIcon />
              </IconButton>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>User</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Balance</TableCell>
                    <TableCell>Currency</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {wallets.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell>{wallet.user?.name || 'Unknown'}</TableCell>
                      <TableCell>{wallet.user?.email || 'N/A'}</TableCell>
                      <TableCell>{formatCurrency(wallet.balance)}</TableCell>
                      <TableCell>{wallet.currency}</TableCell>
                      <TableCell>
                        <Chip
                          label={wallet.isActive ? 'Active' : 'Inactive'}
                          color={wallet.isActive ? 'success' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(wallet.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography variant="body2" color="textSecondary">
                Showing {((walletPagination.page - 1) * walletPagination.limit) + 1} to {Math.min(walletPagination.page * walletPagination.limit, walletPagination.total)} of {walletPagination.total} wallets
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  disabled={walletPagination.page === 1 || loading.wallets}
                  onClick={() => {
                    setWalletPagination(prev => ({ ...prev, page: prev.page - 1 }));
                    fetchWallets();
                  }}
                >
                  Previous
                </Button>
                <Button
                  size="small"
                  disabled={walletPagination.page >= walletPagination.pages || loading.wallets}
                  onClick={() => {
                    setWalletPagination(prev => ({ ...prev, page: prev.page + 1 }));
                    fetchWallets();
                  }}
                >
                  Next
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      </TabPanel>

      {/* Statistics Tab - Index 2 */}
      <TabPanel value={tabValue} index={2}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <TrendingUpIcon sx={{ mr: 1 }} />
                  Transaction Statistics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Total Transactions</Typography>
                    <Typography variant="h5">{stats.transactions.total}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Successful</Typography>
                    <Typography variant="h5" color="success.main">{stats.transactions.successful}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Failed</Typography>
                    <Typography variant="h5" color="error.main">{stats.transactions.failed}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Success Rate</Typography>
                    <Typography variant="h5">{stats.transactions.successRate}%</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary">Total Volume</Typography>
                    <Typography variant="h5">{formatCurrency(stats.transactions.totalVolume)}</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <WalletIcon sx={{ mr: 1 }} />
                  Wallet Statistics
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Total Wallets</Typography>
                    <Typography variant="h5">{stats.wallets.total}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="textSecondary">Active Wallets</Typography>
                    <Typography variant="h5" color="success.main">{stats.wallets.active}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary">Total Balance</Typography>
                    <Typography variant="h5">{formatCurrency(stats.wallets.totalBalance)}</Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="textSecondary">Average Balance</Typography>
                    <Typography variant="h5">{formatCurrency(stats.wallets.averageBalance)}</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Settings Tab - Index 3 */}
      <TabPanel value={tabValue} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <CreditCardIcon sx={{ mr: 1 }} />
                  Paystack Configuration
                </Typography>
                <TextField
                  fullWidth
                  label="Public Key"
                  value={settings.paystack.publicKey}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    paystack: { ...prev.paystack, publicKey: e.target.value }
                  }))}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Secret Key"
                  type="password"
                  value={settings.paystack.secretKey}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    paystack: { ...prev.paystack, secretKey: e.target.value }
                  }))}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Callback URL"
                  value={settings.paystack.callbackUrl}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    paystack: { ...prev.paystack, callbackUrl: e.target.value }
                  }))}
                  margin="normal"
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <WalletIcon sx={{ mr: 1 }} />
                  Wallet Configuration
                </Typography>
                <TextField
                  fullWidth
                  label="Minimum Funding Amount"
                  type="number"
                  value={settings.wallet.minFundingAmount}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    wallet: { ...prev.wallet, minFundingAmount: parseFloat(e.target.value) }
                  }))}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Maximum Funding Amount"
                  type="number"
                  value={settings.wallet.maxFundingAmount}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    wallet: { ...prev.wallet, maxFundingAmount: parseFloat(e.target.value) }
                  }))}
                  margin="normal"
                />
                <TextField
                  fullWidth
                  label="Currency"
                  value={settings.wallet.currency}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    wallet: { ...prev.wallet, currency: e.target.value }
                  }))}
                  margin="normal"
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Features
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={settings.features.walletEnabled}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            features: { ...prev.features, walletEnabled: e.target.checked }
                          }))}
                        />
                      }
                      label="Enable Wallet"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={settings.features.autoVerifyPayments}
                          onChange={(e) => setSettings(prev => ({
                            ...prev,
                            features: { ...prev.features, autoVerifyPayments: e.target.checked }
                          }))}
                        />
                      }
                      label="Auto Verify Payments"
                    />
                  </Grid>
                </Grid>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    onClick={updateSettings}
                    disabled={loading.settings}
                    startIcon={loading.settings ? <CircularProgress size={20} /> : null}
                  >
                    Save Settings
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
    </Box>
  );
}

export default PaymentManagement;
