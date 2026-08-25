import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, MenuItem,
  Pagination, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import partnerService from '../../services/partnerService';
import { formatDate, formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

export default function PartnerTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [range, setRange] = useState('monthly');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const params = { page: pagination.page, limit: 25, range, ...(status && { status }) };
  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await partnerService.getTransactions(params);
      setTransactions(response.data.transactions || []);
      setPagination(current => ({ ...current, ...response.data.pagination }));
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load transactions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [pagination.page, range, status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <PageHeader eyebrow="Charging activity" title="Transactions" description={`${pagination.total} charging sessions contributing to your partner earnings.`} actions={[
        <Stack key="filters" direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
          <Select size="small" value={range} onChange={event => {
            setRange(event.target.value); setPagination(current => ({ ...current, page: 1 }));
          }}>
            <MenuItem value="daily">Today</MenuItem><MenuItem value="weekly">This week</MenuItem>
            <MenuItem value="monthly">This month</MenuItem><MenuItem value="yearly">This year</MenuItem>
          </Select>
          <Select size="small" displayEmpty value={status} onChange={event => {
            setStatus(event.target.value); setPagination(current => ({ ...current, page: 1 }));
          }}>
            <MenuItem value="">All statuses</MenuItem><MenuItem value="Completed">Completed</MenuItem>
            <MenuItem value="InProgress">In progress</MenuItem><MenuItem value="Stopped">Stopped</MenuItem>
          </Select>
          <Button variant="outlined" startIcon={<DownloadIcon />}
            onClick={() => partnerService.exportTransactions({ range, ...(status && { status }) })}>CSV</Button>
        </Stack>
      ]} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        {loading ? <Box textAlign="center" py={8}><CircularProgress /></Box> : (
          <TableContainer>
            <Table>
              <TableHead><TableRow>
                <TableCell>Session</TableCell><TableCell>Station / Location</TableCell>
                <TableCell>Date</TableCell><TableCell>Status</TableCell>
                <TableCell align="right">Energy</TableCell><TableCell align="right">Partner earning</TableCell>
                <TableCell>Settlement</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {transactions.map(transaction => (
                  <TableRow key={transaction.id || transaction.transactionId} hover>
                    <TableCell>#{transaction.transactionId}</TableCell>
                    <TableCell><Typography variant="body2">{transaction.station?.name || transaction.chargePointId}</Typography>
                      <Typography variant="caption" color="text.secondary">{transaction.location?.name || '—'}</Typography></TableCell>
                    <TableCell>{formatDate(transaction.stopTime || transaction.startTime)}</TableCell>
                    <TableCell><Chip size="small" label={transaction.status} color={statusColor(transaction.status)} /></TableCell>
                    <TableCell align="right">{formatEnergy(transaction.energyDelivered)}</TableCell>
                    <TableCell align="right">{formatNaira(transaction.partnerEarning)}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={transaction.settlementStatus || '—'} /></TableCell>
                  </TableRow>
                ))}
                {!transactions.length && <TableRow><TableCell colSpan={7} align="center">No transactions for this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      {pagination.pages > 1 && <Stack alignItems="center" mt={3}><Pagination page={pagination.page}
        count={pagination.pages} onChange={(_, page) => setPagination(current => ({ ...current, page }))} /></Stack>}
    </Box>
  );
}
