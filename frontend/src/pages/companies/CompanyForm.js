import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { ArrowBackRounded, BusinessRounded, SaveRounded } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import companyService from '../../services/companyService';

const emptyForm = { name: '', email: '', phone: '', address: '', city: '', state: '', country: 'Nigeria', notes: '' };

export default function CompanyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    companyService.get(id)
      .then(result => {
        const company = result.company || {};
        setForm(Object.fromEntries(Object.keys(emptyForm).map(key => [key, company[key] || ''])));
      })
      .catch(err => setError(err.serverMessage || err.message || 'Failed to load company'))
      .finally(() => setLoading(false));
  }, [editing, id]);

  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Company name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editing) await companyService.update(id, form);
      else await companyService.create(form);
      navigate('/companies');
    } catch (err) {
      setError(err.serverMessage || err.message || 'Unable to save company');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <IconButton onClick={() => navigate('/companies')} aria-label="Back to companies"><ArrowBackRounded /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4" fontWeight={800}>{editing ? 'Edit company' : 'Register company'}</Typography>
          <Typography color="text.secondary">Create the company profile first. Users, wallet funding and recurring allowances are managed from its workspace.</Typography>
        </Box>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <form onSubmit={submit}>
        <Stack spacing={2.5}>
          <Card variant="outlined" sx={{ borderRadius: 3.5 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 2.5 }}>
                <BusinessRounded color="primary" />
                <Box><Typography variant="h6" fontWeight={800}>Company profile</Typography><Typography variant="body2" color="text.secondary">Basic identity and contact information</Typography></Box>
              </Stack>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField required fullWidth label="Company name" value={form.name} onChange={event => update('name', event.target.value)} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth type="email" label="Email address" value={form.email} onChange={event => update('email', event.target.value)} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label="Phone number" value={form.phone} onChange={event => update('phone', event.target.value)} /></Grid>
                <Grid item xs={12} md={6}><TextField fullWidth label="Country" value={form.country} onChange={event => update('country', event.target.value)} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth label="State" value={form.state} onChange={event => update('state', event.target.value)} /></Grid>
                <Grid item xs={12} md={4}><TextField fullWidth label="City" value={form.city} onChange={event => update('city', event.target.value)} /></Grid>
                <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Address" value={form.address} onChange={event => update('address', event.target.value)} /></Grid>
                <Grid item xs={12}><TextField fullWidth multiline minRows={3} label="Internal notes" value={form.notes} onChange={event => update('notes', event.target.value)} helperText="Visible only to administrators" /></Grid>
              </Grid>
            </CardContent>
          </Card>
          <Divider />
          <Stack direction="row" justifyContent="flex-end" spacing={1.25}>
            <Button variant="outlined" onClick={() => navigate('/companies')} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRounded />} disabled={saving}>{editing ? 'Save changes' : 'Register company'}</Button>
          </Stack>
        </Stack>
      </form>
    </Stack>
  );
}
