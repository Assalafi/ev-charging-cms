import React from 'react';
import { Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';

const DashboardSkeleton = () => (
  <Grid container spacing={2.5}>
    {[0, 1, 2, 3].map(item => (
      <Grid item xs={12} sm={6} xl={3} key={item}>
        <Card><CardContent><Stack spacing={1.5}><Skeleton width="45%" /><Skeleton variant="rounded" height={38} width="65%" /><Skeleton /></Stack></CardContent></Card>
      </Grid>
    ))}
    <Grid item xs={12} lg={8}><Card><CardContent><Skeleton width="30%" /><Skeleton variant="rounded" height={300} sx={{ mt: 2 }} /></CardContent></Card></Grid>
    <Grid item xs={12} lg={4}><Card><CardContent><Skeleton width="45%" /><Skeleton variant="rounded" height={300} sx={{ mt: 2 }} /></CardContent></Card></Grid>
  </Grid>
);

export default DashboardSkeleton;
