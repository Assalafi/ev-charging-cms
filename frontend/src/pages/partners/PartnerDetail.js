import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Select,
  MenuItem,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

const PartnerDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [assignDialog, setAssignDialog] = useState({ open: false });
  const [userDialog, setUserDialog] = useState({ open: false, mode: 'create', userId: null });
  const [availableLocations, setAvailableLocations] = useState([]);
  const [assignForm, setAssignForm] = useState({
    locationId: '',
    productionCostPerWh: '',
    partnerSharePercent: '',
    settlementEnabled: true
  });
  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'partner_viewer',
    active: true
  });

  useEffect(() => {
    fetchPartner();
  }, [id]);

  const fetchPartner = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/admin/partners/${id}`);
      setPartner(response.data.partner);
    } catch (error) {
      console.error('Error fetching partner:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'suspended': return 'error';
      default: return 'default';
    }
  };

  const fetchAvailableLocations = async () => {
    try {
      const response = await api.get('/admin/locations');
      // Filter out locations already assigned to this partner
      const assignedIds = partner.locations?.map(l => l.id) || [];
      const available = response.data.locations?.filter(l => !assignedIds.includes(l.id)) || [];
      setAvailableLocations(available);
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const handleOpenAssignDialog = () => {
    setAssignForm({
      locationId: '',
      productionCostPerWh: partner.defaultProductionCostPerWh || '',
      partnerSharePercent: partner.defaultPartnerSharePercent || '',
      settlementEnabled: true
    });
    fetchAvailableLocations();
    setAssignDialog({ open: true });
  };

  const handleAssignLocation = async () => {
    try {
      await api.post(`/admin/partners/${id}/locations/${assignForm.locationId}/assign`, {
        productionCostPerWh: parseFloat(assignForm.productionCostPerWh) || undefined,
        partnerSharePercent: parseFloat(assignForm.partnerSharePercent) || undefined,
        settlementEnabled: assignForm.settlementEnabled
      });
      setAssignDialog({ open: false });
      fetchPartner();
    } catch (error) {
      console.error('Error assigning location:', error);
    }
  };

  const handleUnassignLocation = async (locationId) => {
    if (!window.confirm('Are you sure you want to unassign this location from the partner?')) {
      return;
    }
    try {
      const response = await api.post(`/admin/partners/locations/${locationId}/unassign-partner`);
      if (response.data.success) {
        fetchPartner();
      }
    } catch (error) {
      console.error('Error unassigning location:', error);
      alert('Failed to unassign location: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleCreateUser = async () => {
    try {
      await api.post(`/admin/partners/${id}/users`, userForm);
      setUserDialog({ open: false, mode: 'create', userId: null });
      setUserForm({
        username: '',
        email: '',
        password: '',
        role: 'partner_viewer',
        active: true
      });
      fetchPartner();
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleEditUser = (user) => {
    setUserForm({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      active: user.active
    });
    setUserDialog({ open: true, mode: 'edit', userId: user.id });
  };

  const handleUpdateUser = async () => {
    try {
      await api.put(`/admin/partners/${id}/users/${userDialog.userId}`, userForm);
      setUserDialog({ open: false, mode: 'create', userId: null });
      setUserForm({
        username: '',
        email: '',
        password: '',
        role: 'partner_viewer',
        active: true
      });
      fetchPartner();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }
    try {
      await api.delete(`/admin/partners/${id}/users/${userId}`);
      fetchPartner();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user: ' + (error.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!partner) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Partner not found</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/partners')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {partner.name}
        </Typography>
        <IconButton onClick={fetchPartner} disabled={loading}>
          <RefreshIcon />
        </IconButton>
        <Button
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => navigate(`/partners/${id}/edit`)}
          sx={{ ml: 2 }}
        >
          Edit
        </Button>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Total Revenue</Typography>
              <Typography variant="h5">₦{(partner.stats?.gross_amount || 0).toLocaleString()}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Partner Earning</Typography>
              <Typography variant="h5" color="success.main">
                ₦{(partner.stats?.partner_earning || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Pending Settlement</Typography>
              <Typography variant="h5" color="warning.main">
                ₦{(partner.pendingSettlement || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card>
            <CardContent>
              <Typography variant="body2" color="textSecondary">Paid Settlement</Typography>
              <Typography variant="h5" color="success.main">
                ₦{(partner.paidSettlement || 0).toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Overview" />
          <Tab label="Locations" />
          <Tab label="Users" />
          <Tab label="Settings" />
        </Tabs>

        {/* Overview Tab */}
        <Box sx={{ p: 3 }} hidden={tabValue !== 0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Company Details</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">Business Name:</Typography><Typography>{partner.businessName || '-'}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Registration Number:</Typography><Typography>{partner.registrationNumber || '-'}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Status:</Typography><Chip label={partner.status} color={getStatusColor(partner.status)} size="small" /></Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Contact Information</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">Contact Person:</Typography><Typography>{partner.contactPersonName}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Email:</Typography><Typography>{partner.contactEmail}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Phone:</Typography><Typography>{partner.contactPhone}</Typography></Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Address</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">State:</Typography><Typography>{partner.state}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">City:</Typography><Typography>{partner.city}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Address:</Typography><Typography>{partner.address || '-'}</Typography></Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Bank Details</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">Bank:</Typography><Typography>{partner.bankName || '-'}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Account Name:</Typography><Typography>{partner.bankAccountName || '-'}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Account Number:</Typography><Typography>{partner.bankAccountNumber || '-'}</Typography></Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Settlement Settings</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">Frequency:</Typography><Typography>{partner.settlementFrequency}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Default Partner Share:</Typography><Typography>{partner.defaultPartnerSharePercent}%</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Default Production Cost:</Typography><Typography>₦{partner.defaultProductionCostPerWh}/Wh</Typography></Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Statistics</Typography>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Box><Typography variant="body2" color="textSecondary">Locations:</Typography><Typography>{partner.locations?.length || 0}</Typography></Box>
                <Box><Typography variant="body2" color="textSecondary">Total Stations:</Typography>
                  <Typography>
                    {partner.locations?.reduce((sum, loc) => sum + (loc.stations?.length || 0), 0) || 0}
                  </Typography>
                </Box>
                <Box><Typography variant="body2" color="textSecondary">Total Transactions:</Typography>
                  <Typography>{partner.stats?.total_transactions || 0}</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Box>

        {/* Locations Tab */}
        <Box sx={{ p: 3 }} hidden={tabValue !== 1}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenAssignDialog}
            >
              Assign Location
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Stations</TableCell>
                  <TableCell>Partner Share</TableCell>
                  <TableCell>Production Cost</TableCell>
                  <TableCell>Settlement Enabled</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {partner.locations?.length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center">No locations assigned</TableCell></TableRow>
                ) : partner.locations?.map((location) => (
                  <TableRow key={location.id}>
                    <TableCell>{location.name}</TableCell>
                    <TableCell>{location.city}</TableCell>
                    <TableCell>{location.state}</TableCell>
                    <TableCell>{location.stations?.length || 0}</TableCell>
                    <TableCell>{location.partnerSharePercent}%</TableCell>
                    <TableCell>₦{location.productionCostPerWh}/Wh</TableCell>
                    <TableCell>
                      <Chip
                        label={location.settlementEnabled ? 'Enabled' : 'Disabled'}
                        color={location.settlementEnabled ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleUnassignLocation(location.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Users Tab */}
        <Box sx={{ p: 3 }} hidden={tabValue !== 2}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setUserForm({
                  username: '',
                  email: '',
                  password: '',
                  role: 'partner_viewer',
                  active: true
                });
                setUserDialog({ open: true, mode: 'create', userId: null });
              }}
            >
              Add User
            </Button>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last Login</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {partner.users?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center">No users found</TableCell></TableRow>
                ) : partner.users?.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.username}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.active ? 'Active' : 'Inactive'}
                        color={user.active ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</TableCell>
                    <TableCell>
                      <IconButton size="small" onClick={() => handleEditUser(user)}><EditIcon /></IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeleteUser(user.id)}><DeleteIcon /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Settings Tab */}
        <Box sx={{ p: 3 }} hidden={tabValue !== 3}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary">{partner.notes || 'No notes'}</Typography>
            </Grid>
          </Grid>
        </Box>
      </Card>

      {/* Location Assignment Dialog */}
      <Dialog open={assignDialog.open} onClose={() => setAssignDialog({ open: false })} maxWidth="md" fullWidth>
        <DialogTitle>Assign Location to Partner</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="Location"
                value={assignForm.locationId}
                onChange={(e) => setAssignForm({ ...assignForm, locationId: e.target.value })}
                disabled={availableLocations.length === 0}
              >
                {availableLocations.map((loc) => (
                  <MenuItem key={loc.id} value={loc.id}>
                    {loc.name} - {loc.city}, {loc.state}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Production Cost per Wh"
                type="number"
                value={assignForm.productionCostPerWh}
                onChange={(e) => setAssignForm({ ...assignForm, productionCostPerWh: e.target.value })}
                helperText="Default from partner settings"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Partner Share Percent"
                type="number"
                value={assignForm.partnerSharePercent}
                onChange={(e) => setAssignForm({ ...assignForm, partnerSharePercent: e.target.value })}
                helperText="Default from partner settings"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={assignForm.settlementEnabled}
                    onChange={(e) => setAssignForm({ ...assignForm, settlementEnabled: e.target.checked })}
                  />
                }
                label="Enable Settlement"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog({ open: false })}>Cancel</Button>
          <Button
            onClick={handleAssignLocation}
            variant="contained"
            disabled={!assignForm.locationId}
          >
            Assign Location
          </Button>
        </DialogActions>
      </Dialog>

      {/* User Creation Dialog */}
      <Dialog open={userDialog.open} onClose={() => setUserDialog({ open: false, mode: 'create', userId: null })} maxWidth="sm" fullWidth>
        <DialogTitle>{userDialog.mode === 'edit' ? 'Edit Partner User' : 'Add Partner User'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Username"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                helperText={userDialog.mode === 'edit' ? 'Leave empty to keep current password' : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                select
                fullWidth
                label="Role"
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
              >
                <MenuItem value="partner_owner">Partner Owner</MenuItem>
                <MenuItem value="partner_manager">Partner Manager</MenuItem>
                <MenuItem value="partner_finance">Partner Finance</MenuItem>
                <MenuItem value="partner_viewer">Partner Viewer</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={userForm.active}
                    onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUserDialog({ open: false, mode: 'create', userId: null })}>Cancel</Button>
          <Button
            onClick={userDialog.mode === 'edit' ? handleUpdateUser : handleCreateUser}
            variant="contained"
            disabled={!userForm.username || !userForm.email || (userDialog.mode === 'create' && !userForm.password)}
          >
            {userDialog.mode === 'edit' ? 'Update User' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PartnerDetail;
