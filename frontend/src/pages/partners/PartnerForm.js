import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  CircularProgress,
  Alert,
  IconButton
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';

const PartnerForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    registrationNumber: '',
    contactPersonName: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    state: '',
    city: '',
    logoUrl: '',
    defaultPartnerSharePercent: 50,
    defaultProductionCostPerWh: 0,
    settlementFrequency: 'monthly',
    bankName: '',
    bankAccountName: '',
    bankAccountNumber: '',
    notes: '',
    status: 'active'
  });

  useEffect(() => {
    if (isEdit) {
      fetchPartner();
    }
  }, [id]);

  const fetchPartner = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/admin/partners/${id}`);
      const partner = response.data.partner;
      setFormData({
        name: partner.name || '',
        businessName: partner.businessName || '',
        registrationNumber: partner.registrationNumber || '',
        contactPersonName: partner.contactPersonName || '',
        contactEmail: partner.contactEmail || '',
        contactPhone: partner.contactPhone || '',
        address: partner.address || '',
        state: partner.state || '',
        city: partner.city || '',
        logoUrl: partner.logoUrl || '',
        defaultPartnerSharePercent: partner.defaultPartnerSharePercent ?? 50,
        defaultProductionCostPerWh: partner.defaultProductionCostPerWh ?? 0,
        settlementFrequency: partner.settlementFrequency || 'monthly',
        bankName: partner.bankName || '',
        bankAccountName: partner.bankAccountName || '',
        bankAccountNumber: partner.bankAccountNumber || '',
        notes: partner.notes || '',
        status: partner.status || 'active'
      });
    } catch (error) {
      setError('Failed to fetch partner details');
      console.error('Error fetching partner:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' || type === 'switch' ? checked : value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      setLoading(true);

      if (isEdit) {
        await api.put(`/admin/partners/${id}`, formData);
        setSuccess('Partner updated successfully');
      } else {
        await api.post('/admin/partners', formData);
        setSuccess('Partner created successfully');
        navigate('/partners');
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to save partner');
      console.error('Error saving partner:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <IconButton onClick={() => navigate('/partners')} sx={{ mr: 2 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          {isEdit ? 'Edit Partner' : 'Add New Partner'}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <form onSubmit={handleSubmit}>
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Company Information</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Partner Name *"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Business Name"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Registration Number"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    label="Status"
                  >
                    <MenuItem value="active">Active</MenuItem>
                    <MenuItem value="inactive">Inactive</MenuItem>
                    <MenuItem value="suspended">Suspended</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Contact Information</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Contact Person Name *"
                  name="contactPersonName"
                  value={formData.contactPersonName}
                  onChange={handleChange}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Contact Email *"
                  name="contactEmail"
                  value={formData.contactEmail}
                  onChange={handleChange}
                  type="email"
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Contact Phone *"
                  name="contactPhone"
                  value={formData.contactPhone}
                  onChange={handleChange}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Logo URL"
                  name="logoUrl"
                  value={formData.logoUrl}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Address</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>State *</InputLabel>
                  <Select
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    label="State"
                    required
                  >
                    <MenuItem value="">Select State</MenuItem>
                    <MenuItem value="Lagos">Lagos</MenuItem>
                    <MenuItem value="Borno">Borno</MenuItem>
                    <MenuItem value="Abuja">Abuja</MenuItem>
                    <MenuItem value="Rivers">Rivers</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="City *"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  multiline
                  rows={2}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Bank Details</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Bank Name"
                  name="bankName"
                  value={formData.bankName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Account Name"
                  name="bankAccountName"
                  value={formData.bankAccountName}
                  onChange={handleChange}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Account Number"
                  name="bankAccountNumber"
                  value={formData.bankAccountNumber}
                  onChange={handleChange}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Settlement Settings</Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel>Settlement Frequency *</InputLabel>
                  <Select
                    name="settlementFrequency"
                    value={formData.settlementFrequency}
                    onChange={handleChange}
                    label="Settlement Frequency"
                    required
                  >
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="quarterly">Quarterly</MenuItem>
                    <MenuItem value="yearly">Yearly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Default Partner Share (%)"
                  name="defaultPartnerSharePercent"
                  value={formData.defaultPartnerSharePercent}
                  onChange={handleChange}
                  type="number"
                  inputProps={{ min: 0, max: 100, step: 0.01 }}
                  helperText="Percentage of profit shared with partner"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  label="Default Production Cost (₦/Wh)"
                  name="defaultProductionCostPerWh"
                  value={formData.defaultProductionCostPerWh}
                  onChange={handleChange}
                  type="number"
                  inputProps={{ min: 0, step: 0.01 }}
                  helperText="Production cost per Watt-hour"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Notes</Typography>
            <TextField
              fullWidth
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              multiline
              rows={4}
              placeholder="Add any additional notes..."
            />
          </CardContent>
        </Card>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/partners')}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<SaveIcon />}
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : (isEdit ? 'Update Partner' : 'Create Partner')}
          </Button>
        </Box>
      </form>
    </Box>
  );
};

export default PartnerForm;
