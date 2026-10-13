import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { AccountBalanceWalletRounded, AddRounded, ArrowDownwardRounded, ArrowUpwardRounded, RefreshRounded } from '@mui/icons-material';
import companyPortalService from '../../services/companyPortalService';
import { useCompanyAuth } from '../../contexts/CompanyAuthContext';
import { BillingPolicyCard, money } from './CompanyDashboard';
import { formatDateTime } from '../../utils/timezone';

export default function CompanyWallet() {
  const { canManage, user } = useCompanyAuth();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const [walletResponse, transactionResponse] = await Promise.all([
        companyPortalService.wallet(),
        companyPortalService.transactions({ limit: 50 })
      ]);
      setWallet(walletResponse.data.wallet);
      setTransactions(transactionResponse.data.transactions || []);
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Unable to load wallet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference');
    if (!reference) return undefined;
    companyPortalService.verifyFunding(reference)
      .then(load)
      .catch(requestError => setError(requestError.serverMessage || requestError.message || 'Unable to verify funding'))
      .finally(() => window.history.replaceState({}, '', window.location.pathname));
    return undefined;
  }, [load]);

  const fund = async () => {
    setSaving(true);
    try {
      const response = await companyPortalService.initializeFunding({ amount, email: user?.email, callbackUrl: `${window.location.origin}/company/wallet` });
      setOpen(false);
      setAmount('');
      if (response.data.authorization_url) window.location.href = response.data.authorization_url;
    } catch (requestError) {
      setError(requestError.serverMessage || requestError.message || 'Unable to initialize funding');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !wallet) return <Box minHeight="60vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress /></Box>;
  const company = user?.company || {};

  return <Stack spacing={{ xs: 2, md: 3 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2}><Box><Typography variant="overline" color="primary.main" fontWeight={800} letterSpacing=".12em">Finance</Typography><Typography variant="h3" sx={{ mt: .5, fontSize: { xs: '2rem', sm: '2.5rem' } }}>Company wallet</Typography><Typography color="text.secondary">Understand your balance, credit policy and employee funding ledger.</Typography></Box><Stack direction="row" gap={1}>{canManage && <Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Add funds</Button>}<Button variant="outlined" startIcon={<RefreshRounded />} onClick={load}>Refresh</Button></Stack></Stack>
    {error && <Alert severity="error">{error}</Alert>}
    <Grid container spacing={2}><Grid item xs={12} md={5}><Card sx={{ height: '100%', color: '#fff', borderRadius: 3.5, background: Number(wallet?.debtOutstanding || 0) > 0 ? 'linear-gradient(140deg, #92400E, #D97706)' : 'linear-gradient(140deg, #0F2E61, #2563EB)' }}><CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}><Stack direction="row" justifyContent="space-between"><Box><Typography sx={{ color: 'rgba(255,255,255,.72)' }}>Current balance</Typography><Typography variant="h2" sx={{ color: '#fff', mt: 1, fontSize: { xs: '2.25rem', sm: '3rem' } }}>{money(wallet?.balance)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.78)' }}>{wallet?.currency || 'NGN'} · {Number(wallet?.debtOutstanding || 0) > 0 ? `${money(wallet.debtOutstanding)} debt outstanding` : 'Ready for transfers'}</Typography></Box><AccountBalanceWalletRounded sx={{ fontSize: 40, opacity: .8 }} /></Stack></CardContent></Card></Grid><Grid item xs={12} md={7}><Card sx={{ height: '100%', borderRadius: 3.5 }}><CardContent><Typography variant="h6" fontWeight={850}>How funding works</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Add funds through the payment gateway, then use the employee list or auto-funding rules to distribute allowances. If debt is enabled, transfers may continue below zero and the negative balance is recorded as debt.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}><Chip icon={<ArrowUpwardRounded />} label="Credits increase balance" color="success" variant="outlined" /><Chip icon={<ArrowDownwardRounded />} label="Transfers fund users" color="warning" variant="outlined" /></Stack></CardContent></Card></Grid></Grid>
    <BillingPolicyCard company={company} walletBalance={wallet?.balance} />
    <Card sx={{ borderRadius: 3.5 }}><CardContent><Typography variant="h6" fontWeight={850} sx={{ mb: 2 }}>Wallet activity</Typography><TableContainer sx={{ overflowX: 'auto' }}><Table sx={{ minWidth: 680 }}><TableHead><TableRow><TableCell>Date (WAT)</TableCell><TableCell>Description</TableCell><TableCell>Method</TableCell><TableCell>Status</TableCell><TableCell align="right">Amount</TableCell></TableRow></TableHead><TableBody>{transactions.map(item => <TableRow hover key={item.id}><TableCell><Typography variant="body2">{formatDateTime(item.createdAt)}</Typography></TableCell><TableCell><Typography fontWeight={700}>{item.description || 'Wallet transaction'}</Typography><Typography variant="caption" color="text.secondary">{item.beneficiary?.name ? `For ${item.beneficiary.name}` : item.reference}</Typography></TableCell><TableCell>{item.method}</TableCell><TableCell><Chip size="small" label={item.status} color={item.status === 'SUCCESS' ? 'success' : item.status === 'PENDING' ? 'warning' : 'default'} /></TableCell><TableCell align="right"><Typography fontWeight={800} color={item.type === 'CREDIT' ? 'success.main' : 'text.primary'}>{item.type === 'CREDIT' ? '+' : '-'}{money(item.amount)}</Typography></TableCell></TableRow>)}{!transactions.length && <TableRow><TableCell colSpan={5}><Typography textAlign="center" color="text.secondary" sx={{ py: 5 }}>No wallet activity yet.</Typography></TableCell></TableRow>}</TableBody></Table></TableContainer></CardContent></Card>
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Add funds to company wallet</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>You’ll be redirected to the configured payment gateway to complete this top-up.</Typography><TextField fullWidth label="Amount (₦)" type="number" inputProps={{ min: 1, step: '0.01' }} value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></DialogContent><DialogActions><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="contained" onClick={fund} disabled={saving || Number(amount) <= 0}>{saving ? <CircularProgress size={20} /> : 'Continue to payment'}</Button></DialogActions></Dialog>
  </Stack>;
}
