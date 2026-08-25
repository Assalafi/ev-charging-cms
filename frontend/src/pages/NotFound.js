import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ArrowBackRounded, BoltRounded } from '@mui/icons-material';

const NotFound = () => {
  const navigate = useNavigate();
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#0B1220', color: '#FFFFFF', position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, opacity: 0.3, backgroundImage: 'radial-gradient(circle at 20% 10%, #2563EB 0, transparent 35%), radial-gradient(circle at 85% 80%, #0E9F6E 0, transparent 32%)' }} />
      <Stack alignItems="center" textAlign="center" spacing={2} sx={{ position: 'relative', maxWidth: 520 }}>
        <Box sx={{ width: 64, height: 64, borderRadius: 4, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2563EB,#0E9F6E)' }}><BoltRounded fontSize="large" /></Box>
        <Typography variant="overline" sx={{ color: '#60A5FA', fontWeight: 750, letterSpacing: '.14em' }}>404 · Route unavailable</Typography>
        <Typography variant="h2" color="#FFFFFF">This charging route ends here.</Typography>
        <Typography sx={{ color: '#94A3B8' }}>The page may have moved or you may not have access to this part of the workspace.</Typography>
        <Button variant="contained" startIcon={<ArrowBackRounded />} onClick={() => navigate(-1)} sx={{ mt: '12px !important' }}>Go back</Button>
      </Stack>
    </Box>
  );
};

export default NotFound;
