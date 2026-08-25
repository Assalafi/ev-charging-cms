import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, CircularProgress, Divider,
  Grid, Stack, TextField, Typography
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import partnerService from '../../services/partnerService';
import PageHeader from '../../components/ui/PageHeader';

export default function PartnerProfile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    username: '', email: '', currentPassword: '', newPassword: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    partnerService.getProfile()
      .then(response => {
        setProfile(response.data);
        setForm(current => ({
          ...current,
          username: response.data.user?.username || '',
          email: response.data.user?.email || ''
        }));
      })
      .catch(error => setMessage({ type: 'error', text: error.serverMessage || 'Could not load profile.' }))
      .finally(() => setLoading(false));
  }, []);

  const save = async event => {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });
      const response = await partnerService.updateProfile(form);
      setProfile(current => ({ ...current, user: response.data.user }));
      setForm(current => ({ ...current, currentPassword: '', newPassword: '' }));
      setMessage({ type: 'success', text: response.data.message });
    } catch (error) {
      setMessage({ type: 'error', text: error.serverMessage || 'Could not update profile.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box textAlign="center" py={8}><CircularProgress /></Box>;
  const partner = profile?.partner || {};

  return (
    <Box>
      <PageHeader eyebrow="Account" title="Profile & company" description="Manage your account security and review partner company information." />
      {message.text && <Alert severity={message.type} sx={{ mb: 2 }}>{message.text}</Alert>}
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Card><CardContent component="form" onSubmit={save}>
            <Typography variant="h6" gutterBottom>Account settings</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField fullWidth required label="Username" value={form.username}
                onChange={event => setForm({ ...form, username: event.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth required type="email" label="Email" value={form.email}
                onChange={event => setForm({ ...form, email: event.target.value })} /></Grid>
              <Grid item xs={12}><Divider><Typography variant="caption">CHANGE PASSWORD (OPTIONAL)</Typography></Divider></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth type="password" label="Current password"
                value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth type="password" label="New password"
                helperText="At least 8 characters" value={form.newPassword}
                onChange={event => setForm({ ...form, newPassword: event.target.value })} /></Grid>
            </Grid>
            <Button type="submit" variant="contained" disabled={saving} sx={{ mt: 3 }}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </CardContent></Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card><CardContent>
            <Stack direction="row" gap={2} alignItems="center" mb={2}>
              <BusinessIcon color="primary" fontSize="large" />
              <Box><Typography variant="h6">{partner.businessName || partner.name}</Typography>
                <Typography color="text.secondary">{partner.registrationNumber || 'Partner company'}</Typography></Box>
            </Stack>
            {[
              ['Contact', partner.contactPersonName], ['Email', partner.contactEmail],
              ['Phone', partner.contactPhone], ['Address', [partner.address, partner.city, partner.state].filter(Boolean).join(', ')],
              ['Settlement frequency', partner.settlementFrequency], ['Bank', partner.bankName],
              ['Account name', partner.bankAccountName], ['Account number', partner.bankAccountNumber]
            ].map(([label, value]) => <Box key={label} mb={1.5}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2">{value || '—'}</Typography>
            </Box>)}
          </CardContent></Card>
        </Grid>
      </Grid>
    </Box>
  );
}
