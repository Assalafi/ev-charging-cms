import React from 'react';
import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material';

const SectionCard = ({ title, description, action, children, contentSx, sx }) => (
  <Card sx={{ height: '100%', ...sx }}>
    {(title || action) && (
      <>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ px: { xs: 2.25, sm: 2.75 }, pt: 2.5, pb: 2 }}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            {description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>{description}</Typography>}
          </Box>
          {action}
        </Stack>
        <Divider />
      </>
    )}
    <CardContent sx={{ p: { xs: 2.25, sm: 2.75 }, ...contentSx }}>{children}</CardContent>
  </Card>
);

export default SectionCard;
