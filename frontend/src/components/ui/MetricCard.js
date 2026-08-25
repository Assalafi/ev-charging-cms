import React from 'react';
import { alpha } from '@mui/material/styles';
import { Box, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';

const MetricCard = ({ label, value, helper, icon, color = 'primary', trend, progress, onClick }) => (
  <Card
    onClick={onClick}
    sx={{
      height: '100%',
      minHeight: 158,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 4, borderColor: `${color}.light` } : undefined
    }}
  >
    <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={600}>{label}</Typography>
          <Typography variant="h3" sx={{ mt: 1, fontSize: { xs: '1.55rem', lg: '1.8rem' }, whiteSpace: 'nowrap' }}>{value}</Typography>
        </Box>
        <Box sx={theme => ({ width: 44, height: 44, borderRadius: 3, display: 'grid', placeItems: 'center', color: `${color}.main`, bgcolor: alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.1), flexShrink: 0 })}>
          {icon}
        </Box>
      </Stack>
      <Box sx={{ mt: 'auto', pt: 2 }}>
        {typeof progress === 'number' && <LinearProgress variant="determinate" value={Math.max(0, Math.min(progress, 100))} color={color} sx={{ mb: 1 }} />}
        <Stack direction="row" alignItems="center" spacing={0.6}>
          {trend && <TrendingUpRoundedIcon sx={{ fontSize: 15, color: 'success.main' }} />}
          <Typography variant="caption" color={trend ? 'success.dark' : 'text.secondary'} fontWeight={trend ? 650 : 500}>{trend || helper}</Typography>
        </Stack>
      </Box>
    </CardContent>
  </Card>
);

export default MetricCard;
