import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Grid, IconButton, MenuItem,
  Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tooltip, Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import partnerService from '../../services/partnerService';
import { formatDate, formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';

export default function PartnerSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const response = await partnerService.getSettlements({ ...(status && { status }), limit: 100 });
      setSettlements(response.data.settlements || []);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load settlements.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = async id => {
    try {
      const response = await partnerService.getSettlement(id);
      setSelected(response.data.settlement);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load settlement details.');
    }
  };

  const aggregate = settlements.reduce((totals, settlement) => ({
    paid: totals.paid + (settlement.status === 'paid' ? Number(settlement.finalPayableAmount) || 0 : 0),
    pending: totals.pending + (!['paid', 'cancelled'].includes(settlement.status) ? Number(settlement.finalPayableAmount) || 0 : 0)
  }), { paid: 0, pending: 0 });

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} mb={3}>
        <Box><Typography variant="h4">Settlements</Typography>
          <Typography color="text.secondary">Statements and payment history for your partner earnings.</Typography></Box>
        <Select size="small" displayEmpty value={status} onChange={event => setStatus(event.target.value)}>
          <MenuItem value="">All statuses</MenuItem><MenuItem value="draft">Draft</MenuItem>
          <MenuItem value="approved">Approved</MenuItem><MenuItem value="paid">Paid</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
        </Select>
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Grid container spacing={2} mb={3}>
        {[
          ['Statements', settlements.length], ['Awaiting payment', formatNaira(aggregate.pending)],
          ['Paid', formatNaira(aggregate.paid)]
        ].map(([label, value]) => <Grid item xs={12} sm={4} key={label}><Card sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5">{value}</Typography>
        </Card></Grid>)}
      </Grid>
      <Card>
        {loading ? <Box textAlign="center" py={8}><CircularProgress /></Box> : <TableContainer>
          <Table>
            <TableHead><TableRow>
              <TableCell>ID / Period</TableCell><TableCell>Dates</TableCell><TableCell align="right">Sessions</TableCell>
              <TableCell align="right">Energy</TableCell><TableCell align="right">Partner earning</TableCell>
              <TableCell align="right">Final payable</TableCell>
              <TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {settlements.map(settlement => <TableRow key={settlement.id} hover>
                <TableCell>#{settlement.id}<Typography variant="caption" display="block" color="text.secondary">{settlement.periodType}</Typography></TableCell>
                <TableCell>{formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}</TableCell>
                <TableCell align="right">{settlement.totalTransactions || 0}</TableCell>
                <TableCell align="right">{formatEnergy(settlement.totalEnergyWh)}</TableCell>
                <TableCell align="right">{formatNaira(settlement.partnerEarning)}</TableCell>
                <TableCell align="right"><strong>{formatNaira(settlement.finalPayableAmount)}</strong></TableCell>
                <TableCell><Chip size="small" label={settlement.status} color={statusColor(settlement.status)} /></TableCell>
                <TableCell align="right">
                  <Tooltip title="View"><IconButton onClick={() => view(settlement.id)}><VisibilityIcon /></IconButton></Tooltip>
                  <Tooltip title="Download PDF"><IconButton onClick={() => partnerService.exportSettlementPdf(settlement.id)}><PictureAsPdfIcon /></IconButton></Tooltip>
                  <Tooltip title="Transaction CSV"><IconButton onClick={() => partnerService.exportSettlementCsv(settlement.id)}><DownloadIcon /></IconButton></Tooltip>
                </TableCell>
              </TableRow>)}
              {!settlements.length && <TableRow><TableCell colSpan={8} align="center">No settlements found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>}
      </Card>
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Settlement #{selected?.id}</DialogTitle>
        <DialogContent dividers>
          {selected && <>
            <Grid container spacing={2} mb={3}>
              {[
                ['Period', `${formatDate(selected.periodStart)} – ${formatDate(selected.periodEnd)}`],
                ['Partner earning', formatNaira(selected.partnerEarning)],
                ['Adjustment', formatNaira(selected.adjustmentAmount)],
                ['Final payable', formatNaira(selected.finalPayableAmount)],
                ['Payment reference', selected.paymentReference || '—']
              ].map(([label, value]) => <Grid item xs={6} md={3} key={label}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography>{value}</Typography>
              </Grid>)}
            </Grid>
            <TableContainer><Table size="small">
              <TableHead><TableRow><TableCell>Transaction</TableCell><TableCell>Station</TableCell>
                <TableCell align="right">Energy</TableCell><TableCell align="right">Partner earning</TableCell></TableRow></TableHead>
              <TableBody>{(selected.items || []).map(item => <TableRow key={item.id}>
                <TableCell>#{item.transaction?.transactionId || item.transactionId}</TableCell>
                <TableCell>{item.chargePointId}</TableCell><TableCell align="right">{formatEnergy(item.energyWh)}</TableCell>
                <TableCell align="right">{formatNaira(item.partnerEarning)}</TableCell>
              </TableRow>)}</TableBody>
            </Table></TableContainer>
          </>}
        </DialogContent>
        <DialogActions>
          <Button startIcon={<DownloadIcon />} onClick={() => partnerService.exportSettlementCsv(selected.id)}>CSV</Button>
          <Button startIcon={<PictureAsPdfIcon />} onClick={() => partnerService.exportSettlementPdf(selected.id)}>PDF statement</Button>
          <Button onClick={() => setSelected(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
