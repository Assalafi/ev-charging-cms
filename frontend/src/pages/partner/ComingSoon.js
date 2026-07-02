import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';
import { Construction } from '@mui/icons-material';

const ComingSoon = ({ title }) => {
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        {title || 'Coming Soon'}
      </Typography>
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 8 }}>
          <Construction sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom>
            Coming Soon
          </Typography>
          <Typography variant="body1" color="textSecondary">
            This partner feature is under development. Check back soon.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ComingSoon;
