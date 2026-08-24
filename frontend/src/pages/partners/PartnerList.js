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
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  PauseCircleOutline as SuspendIcon,
  PlayCircleOutline as ActivateIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const PartnerList = () => {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [summary, setSummary] = useState({
    totalPartners: 0,
    activePartners: 0,
    totalLocations: 0,
    pendingSettlementAmount: 0
  });
  const [filters, setFilters] = useState({
    status: 'all',
    search: '',
    state: '',
    settlementFrequency: 'all'
  });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, partner: null });

  useEffect(() => {
    fetchPartners();
  }, [pagination.page, filters]);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });

      const response = await api.get(`/admin/partners?${params}`);
      setPartners(response.data.partners);
      setPagination(response.data.pagination);
      setSummary(response.data.summary || {});
    } catch (error) {
      console.error('Error fetching partners:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (e) => {
    setFilters({ ...filters, status: e.target.value });
    setPagination(current => ({ ...current, page: 1 }));
  };

  const handleSearchChange = (e) => {
    setFilters({ ...filters, search: e.target.value });
    setPagination(current => ({ ...current, page: 1 }));
  };

  const updateFilter = (name, value) => {
    setFilters(current => ({ ...current, [name]: value }));
    setPagination(current => ({ ...current, page: 1 }));
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/admin/partners/${deleteDialog.partner.id}`);
      setDeleteDialog({ open: false, partner: null });
      fetchPartners();
    } catch (error) {
      console.error('Error deleting partner:', error);
    }
  };

  const handleStatusToggle = async (partner) => {
    const nextStatus = partner.status === 'active' ? 'suspended' : 'active';
    try {
      await api.post(`/admin/partners/${partner.id}/suspend`, { status: nextStatus });
      fetchPartners();
    } catch (error) {
      window.alert(error.response?.data?.message || 'Unable to update partner status');
    }
  };

  const formatNaira = (amount) => new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2
  }).format(Number(amount || 0));

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'suspended': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Partner Companies</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <IconButton onClick={fetchPartners} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/partners/new')}
          >
            Add Partner
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Total Partners</Typography>
              <Typography variant="h3">{summary.totalPartners || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Active</Typography>
              <Typography variant="h3" color="success.main">
                {summary.activePartners || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Locations</Typography>
              <Typography variant="h3">
                {summary.totalLocations || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="h6">Pending Settlement</Typography>
              <Typography variant="h4" color="warning.main">
                {formatNaira(summary.pendingSettlementAmount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Search"
                value={filters.search}
                onChange={handleSearchChange}
                placeholder="Name, email, phone..."
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select value={filters.status} onChange={handleStatusChange} label="Status">
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                  <MenuItem value="suspended">Suspended</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>State</InputLabel>
                <Select value={filters.state} onChange={(e) => updateFilter('state', e.target.value)} label="State">
                  <MenuItem value="">All States</MenuItem>
                  <MenuItem value="Lagos">Lagos</MenuItem>
                  <MenuItem value="Borno">Borno</MenuItem>
                  <MenuItem value="Abuja">Abuja</MenuItem>
                  <MenuItem value="Rivers">Rivers</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Settlement Frequency</InputLabel>
                <Select
                  value={filters.settlementFrequency}
                  onChange={(e) => updateFilter('settlementFrequency', e.target.value)}
                  label="Settlement Frequency"
                >
                  <MenuItem value="all">All Frequencies</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="yearly">Yearly</MenuItem>
                  <MenuItem value="manual">Manual</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Partners Table */}
      <Card>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Contact Person</TableCell>
                  <TableCell>Contact Email</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Locations</TableCell>
                  <TableCell>Users</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Settlement Frequency</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      No partners found
                    </TableCell>
                  </TableRow>
                ) : partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {partner.name}
                      </Typography>
                      {partner.businessName && (
                        <Typography variant="caption" color="textSecondary">
                          {partner.businessName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{partner.contactPersonName}</TableCell>
                    <TableCell>{partner.contactEmail}</TableCell>
                    <TableCell>{partner.state}</TableCell>
                    <TableCell>{partner.locationCount || 0}</TableCell>
                    <TableCell>{partner.userCount || 0}</TableCell>
                    <TableCell>
                      <Chip
                        label={partner.status}
                        color={getStatusColor(partner.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{partner.settlementFrequency}</TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/partners/${partner.id}`)}
                      >
                        <ViewIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/partners/${partner.id}/edit`)}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        color={partner.status === 'active' ? 'warning' : 'success'}
                        title={partner.status === 'active' ? 'Suspend partner' : 'Activate partner'}
                        onClick={() => handleStatusToggle(partner)}
                      >
                        {partner.status === 'active' ? <SuspendIcon /> : <ActivateIcon />}
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteDialog({ open: true, partner })}
                      >
                        <DeleteIcon />
                      </IconButton>
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, partner: null })}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete partner "{deleteDialog.partner?.name}"?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, partner: null })}>Cancel</Button>
          <Button color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PartnerList;
