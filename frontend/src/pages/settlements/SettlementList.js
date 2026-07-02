import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Grid
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  CheckCircle as ApproveIcon,
  Payment as PayIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const SettlementList = () => {
  const navigate = useNavigate();
  const [settlements, setSettlements] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ status: 'all', partnerId: 'all' });
  const [generateDialog, setGenerateDialog] = useState({ open: false });
  const [actionDialog, setActionDialog] = useState({ open: false, settlement: null, action: null });

  useEffect(() => {
    fetchSettlements();
    fetchPartners();
  }, [pagination.page, filters]);

  const fetchSettlements = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });

      const response = await api.get(`/admin/settlements?${params}`);
      setSettlements(response.data.settlements);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Error fetching settlements:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPartners = async () => {
    try {
      const response = await api.get('/admin/partners?limit=100');
      setPartners(response.data.partners);
    } catch (error) {
      console.error('Error fetching partners:', error);
    }
  };

  const handleGenerateSettlement = async () => {
    try {
      const response = await api.post(`/admin/partners/${generateDialog.partnerId}/settlements/generate`, {
        periodType: generateDialog.periodType,
        periodStart: generateDialog.periodStart,
        periodEnd: generateDialog.periodEnd
      });

      if (response.data.success) {
        setGenerateDialog({ open: false });
        fetchSettlements();
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      alert('Error generating settlement: ' + error.response?.data?.message || error.message);
    }
  };

  const handleAction = async () => {
    try {
      const { settlement, action } = actionDialog;

      if (action === 'approve') {
        await api.post(`/admin/settlements/${settlement.id}/approve`);
      } else if (action === 'mark-paid') {
        await api.post(`/admin/settlements/${settlement.id}/mark-paid`, {
          paymentReference: actionDialog.paymentReference,
          paymentMethod: actionDialog.paymentMethod,
          notes: actionDialog.notes
        });
      } else if (action === 'cancel') {
        await api.post(`/admin/settlements/${settlement.id}/cancel`, {
          reason: actionDialog.reason
        });
      }

      setActionDialog({ open: false, settlement: null, action: null });
      fetchSettlements();
    } catch (error) {
      alert('Error: ' + error.response?.data?.message || error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'default';
      case 'approved': return 'info';
      case 'paid': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Partner Settlements</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <IconButton onClick={fetchSettlements} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            onClick={() => setGenerateDialog({ open: true })}
          >
            Generate Settlement
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Total Settlements</Typography>
              <Typography variant="h3">{pagination.total}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Pending Approval</Typography>
              <Typography variant="h3" color="warning.main">
                {settlements.filter(s => s.status === 'draft').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Approved</Typography>
              <Typography variant="h3" color="info.main">
                {settlements.filter(s => s.status === 'approved').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Paid</Typography>
              <Typography variant="h3" color="success.main">
                {settlements.filter(s => s.status === 'paid').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Partner</InputLabel>
                <Select
                  value={filters.partnerId}
                  onChange={(e) => setFilters({ ...filters, partnerId: e.target.value, page: 1 })}
                  label="Partner"
                >
                  <MenuItem value="all">All Partners</MenuItem>
                  {partners.map((p) => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                  label="Status"
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="approved">Approved</MenuItem>
                  <MenuItem value="paid">Paid</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Settlements Table */}
      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Partner</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Transactions</TableCell>
                  <TableCell>Partner Earning</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : settlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      No settlements found
                    </TableCell>
                  </TableRow>
                ) : settlements.map((settlement) => (
                  <TableRow key={settlement.id}>
                    <TableCell>{settlement.id}</TableCell>
                    <TableCell>{settlement.partner?.name}</TableCell>
                    <TableCell>
                      {new Date(settlement.periodStart).toLocaleDateString()} - {new Date(settlement.periodEnd).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{settlement.totalTransactions}</TableCell>
                    <TableCell>₦{(settlement.partnerEarning || 0).toLocaleString()}</TableCell>
                    <TableCell>
                      <Chip
                        label={settlement.status}
                        color={getStatusColor(settlement.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{new Date(settlement.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/settlements/${settlement.id}`)}
                      >
                        <ViewIcon />
                      </IconButton>
                      {settlement.status === 'draft' && (
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => setActionDialog({ open: true, settlement, action: 'approve' })}
                        >
                          <ApproveIcon />
                        </IconButton>
                      )}
                      {settlement.status === 'approved' && (
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => setActionDialog({ open: true, settlement, action: 'mark-paid' })}
                        >
                          <PayIcon />
                        </IconButton>
                      )}
                      {settlement.status !== 'paid' && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setActionDialog({ open: true, settlement, action: 'cancel' })}
                        >
                          <CancelIcon />
                        </IconButton>
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
              Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                disabled={pagination.page === 1 || loading}
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
              >
                Previous
              </Button>
              <Button
                size="small"
                disabled={pagination.page >= pagination.pages || loading}
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
              >
                Next
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Generate Settlement Dialog */}
      <Dialog open={generateDialog.open} onClose={() => setGenerateDialog({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Settlement</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Partner</InputLabel>
            <Select
              value={generateDialog.partnerId || ''}
              onChange={(e) => setGenerateDialog({ ...generateDialog, partnerId: e.target.value })}
              label="Partner"
            >
              {partners.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Period Type</InputLabel>
            <Select
              value={generateDialog.periodType || 'monthly'}
              onChange={(e) => setGenerateDialog({ ...generateDialog, periodType: e.target.value })}
              label="Period Type"
            >
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="yearly">Yearly</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Period Start"
            type="date"
            value={generateDialog.periodStart || ''}
            onChange={(e) => setGenerateDialog({ ...generateDialog, periodStart: e.target.value })}
            sx={{ mt: 2 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            fullWidth
            label="Period End"
            type="date"
            value={generateDialog.periodEnd || ''}
            onChange={(e) => setGenerateDialog({ ...generateDialog, periodEnd: e.target.value })}
            sx={{ mt: 2 }}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateDialog({ open: false })}>Cancel</Button>
          <Button onClick={handleGenerateSettlement} variant="contained">Generate</Button>
        </DialogActions>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={actionDialog.open} onClose={() => setActionDialog({ open: false, settlement: null, action: null })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {actionDialog.action === 'approve' ? 'Approve Settlement' :
           actionDialog.action === 'mark-paid' ? 'Mark as Paid' : 'Cancel Settlement'}
        </DialogTitle>
        <DialogContent>
          {actionDialog.action === 'approve' && (
            <Typography>Are you sure you want to approve this settlement of ₦{(actionDialog.settlement?.partnerEarning || 0).toLocaleString()}?</Typography>
          )}
          {actionDialog.action === 'mark-paid' && (
            <>
              <Typography sx={{ mb: 2 }}>Mark settlement of ₦{(actionDialog.settlement?.partnerEarning || 0).toLocaleString()} as paid</Typography>
              <TextField
                fullWidth
                label="Payment Reference *"
                value={actionDialog.paymentReference || ''}
                onChange={(e) => setActionDialog({ ...actionDialog, paymentReference: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Payment Method"
                value={actionDialog.paymentMethod || ''}
                onChange={(e) => setActionDialog({ ...actionDialog, paymentMethod: e.target.value })}
                sx={{ mb: 2 }}
              />
              <TextField
                fullWidth
                label="Notes"
                multiline
                rows={2}
                value={actionDialog.notes || ''}
                onChange={(e) => setActionDialog({ ...actionDialog, notes: e.target.value })}
              />
            </>
          )}
          {actionDialog.action === 'cancel' && (
            <>
              <Typography sx={{ mb: 2 }}>Are you sure you want to cancel this settlement?</Typography>
              <TextField
                fullWidth
                label="Reason for cancellation *"
                multiline
                rows={3}
                value={actionDialog.reason || ''}
                onChange={(e) => setActionDialog({ ...actionDialog, reason: e.target.value })}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ open: false, settlement: null, action: null })}>Cancel</Button>
          <Button onClick={handleAction} variant="contained" color={actionDialog.action === 'cancel' ? 'error' : 'primary'}>
            {actionDialog.action === 'approve' ? 'Approve' :
             actionDialog.action === 'mark-paid' ? 'Mark Paid' : 'Cancel'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SettlementList;
