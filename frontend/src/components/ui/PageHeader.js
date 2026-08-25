import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';

const PageHeader = ({ eyebrow, title, description, actions, live, updatedAt }) => (
  <Box
    className="page-enter"
    sx={{
      display: 'flex',
      alignItems: { xs: 'flex-start', md: 'center' },
      justifyContent: 'space-between',
      flexDirection: { xs: 'column', md: 'row' },
      gap: 2,
      mb: { xs: 2.5, md: 3.5 }
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      {eyebrow && (
        <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 750, letterSpacing: '0.1em' }}>
          {eyebrow}
        </Typography>
      )}
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap' }}>
        <Typography variant="h3" component="h1">{title}</Typography>
        {live && (
          <Chip
            size="small"
            label="Live"
            icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'success.main', animation: 'livePulse 1.8s infinite' }} />}
            sx={{ bgcolor: 'success.light', color: 'success.dark', '& .MuiChip-icon': { ml: 1 } }}
          />
        )}
      </Stack>
      {description && <Typography color="text.secondary" sx={{ mt: 0.6, maxWidth: 760 }}>{description}</Typography>}
      {updatedAt && <Typography variant="caption" color="text.disabled">Updated {updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</Typography>}
    </Box>
    {actions && <Stack direction="row" spacing={1} sx={{ width: { xs: '100%', md: 'auto' }, flexWrap: 'wrap' }}>{actions}</Stack>}
  </Box>
);

export default PageHeader;
