import React from 'react';
import { alpha } from '@mui/material/styles';
import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';

const DashboardMetricTile = ({ label, value, helper, icon, color = 'primary', onClick, emphasis = false }) => (
  <Card
    className="dashboard-metric-tile"
    component={onClick ? 'button' : 'div'}
    onClick={onClick}
    sx={theme => ({
      appearance: 'none',
      width: '100%',
      height: '100%',
      minHeight: { xs: 118, sm: 142 },
      p: 0,
      textAlign: 'left',
      color: emphasis ? '#FFFFFF' : 'text.primary',
      bgcolor: emphasis ? '#101828' : 'background.paper',
      backgroundImage: emphasis ? `linear-gradient(140deg, #101828, ${alpha(theme.palette[color]?.dark || theme.palette.primary.dark, 0.92)})` : 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 170ms ease, box-shadow 170ms ease, border-color 170ms ease',
      '&:hover': onClick ? { transform: 'translateY(-2px)', boxShadow: 4, borderColor: theme.palette[color]?.main } : undefined
    })}
  >
    <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } }, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Typography sx={{ color: emphasis ? 'rgba(255,255,255,.62)' : 'text.secondary', fontSize: { xs: '0.71rem', sm: '0.79rem' }, fontWeight: 680, lineHeight: 1.25 }}>{label}</Typography>
        <Box sx={theme => ({ width: { xs: 28, sm: 36 }, height: { xs: 28, sm: 36 }, flexShrink: 0, borderRadius: 2.2, display: 'grid', placeItems: 'center', color: emphasis ? '#FFFFFF' : `${color}.main`, bgcolor: emphasis ? 'rgba(255,255,255,.1)' : alpha(theme.palette[color]?.main || theme.palette.primary.main, 0.1), '& svg': { fontSize: { xs: 17, sm: 20 } } })}>{icon}</Box>
      </Stack>
      <Typography aria-live="polite" sx={{ mt: { xs: 1, sm: 1.4 }, fontSize: { xs: '1rem', sm: '1.32rem', lg: '1.48rem' }, '@media (min-width:390px) and (max-width:599px)': { fontSize: '1.12rem' }, lineHeight: 1.08, fontWeight: 780, letterSpacing: '-0.035em', overflowWrap: 'anywhere' }}>{value}</Typography>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-end" spacing={0.5} sx={{ mt: 'auto', pt: 0.8, minWidth: 0 }}>
        <Typography sx={{ color: emphasis ? 'rgba(255,255,255,.56)' : 'text.secondary', fontSize: { xs: '0.64rem', sm: '0.72rem' }, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{helper}</Typography>
        {onClick && <ArrowForwardRoundedIcon sx={{ flexShrink: 0, fontSize: 15, color: emphasis ? 'rgba(255,255,255,.55)' : 'text.disabled' }} />}
      </Stack>
    </CardContent>
  </Card>
);

export default DashboardMetricTile;
