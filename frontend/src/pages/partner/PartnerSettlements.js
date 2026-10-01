import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton,
  InputAdornment, MenuItem, Select, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EventNoteIcon from '@mui/icons-material/EventNote';
import PaymentsIcon from '@mui/icons-material/Payments';
import ScheduleIcon from '@mui/icons-material/Schedule';
import partnerService from '../../services/partnerService';
import { formatDate, formatEnergy, formatNaira, statusColor } from '../../utils/partnerFormatters';
import PageHeader from '../../components/ui/PageHeader';

const STATUS_OPTIONS = [
  ['pending', 'Pending review'], ['draft', 'Draft'], ['approved', 'Approved'],
  ['paid', 'Paid'], ['cancelled', 'Cancelled']
];

function StatusChip({ status }) {
  const label = STATUS_OPTIONS.find(([value]) => value === status)?.[1] || status;
  return <Chip size="small" label={label} color={statusColor(status)} />;
}

export default function PartnerSettlements() {
  const [settlements, setSettlements] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', periodType: 'all' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await partnerService.getSettlements({ ...(filters.status && { status: filters.status }), limit: 100 });
      setSettlements(response.data.settlements || []);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load settlements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleSettlements = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return settlements.filter(settlement => {
      const matchesSearch = !query || [settlement.id, settlement.periodType, settlement.status]
        .join(' ').toLowerCase().includes(query);
      return matchesSearch && (filters.periodType === 'all' || settlement.periodType === filters.periodType);
    });
  }, [filters.periodType, filters.search, settlements]);

  const aggregate = visibleSettlements.reduce((totals, settlement) => ({
    payable: totals.payable + Number(settlement.finalPayableAmount || 0),
    paid: totals.paid + (settlement.status === 'paid' ? Number(settlement.finalPayableAmount || 0) : 0),
    pending: totals.pending + (['pending', 'draft', 'approved'].includes(settlement.status) ? Number(settlement.finalPayableAmount || 0) : 0),
    sessions: totals.sessions + Number(settlement.totalTransactions || 0)
  }), { payable: 0, paid: 0, pending: 0, sessions: 0 });

  const view = async id => {
    try {
      const response = await partnerService.getSettlement(id);
      setSelected(response.data.settlement);
    } catch (requestError) {
      setError(requestError.serverMessage || 'Could not load settlement details.');
    }
  };

  const clearFilters = () => setFilters({ search: '', status: '', periodType: 'all' });
  const hasFilters = Boolean(filters.search || filters.status || filters.periodType !== 'all');

  return (
    <Box>
      <PageHeader
        eyebrow="Payout centre"
        title="Settlements"
        description="Monthly statements for your charging earnings. New periods are prepared automatically for review."
        actions={[
          <Button key="refresh" variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        ]}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={load}>Retry</Button>}>{error}</Alert>}

      <Grid container spacing={2} mb={3}>
        {[
          ['Statements', visibleSettlements.length, <EventNoteIcon color="primary" />],
          ['Awaiting payment', formatNaira(aggregate.pending), <ScheduleIcon color="warning" />],
          ['Paid to date', formatNaira(aggregate.paid), <PaymentsIcon color="success" />],
          ['Included sessions', aggregate.sessions.toLocaleString(), <EventNoteIcon color="info" />]
        ].map(([label, value, icon]) => <Grid item xs={6} md={3} key={label}>
          <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider' }}><CardContent>
            <Stack direction="row" justifyContent="space-between" gap={1}>
              <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ mt: .5 }}>{value}</Typography></Box>{icon}
            </Stack>
          </CardContent></Card>
        </Grid>)}
      </Grid>

      <Card sx={{ mb: 2.5, border: '1px solid', borderColor: 'divider' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small" fullWidth placeholder="Search statement number or status" value={filters.search}
              onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
              sx={{ maxWidth: { md: 360 } }}
            />
            <Select size="small" value={filters.status} displayEmpty onChange={event => setFilters(current => ({ ...current, status: event.target.value }))} sx={{ minWidth: 170 }}>
              <MenuItem value="">All statuses</MenuItem>
              {STATUS_OPTIONS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </Select>
            <Select size="small" value={filters.periodType} onChange={event => setFilters(current => ({ ...current, periodType: event.target.value }))} sx={{ minWidth: 150 }}>
              <MenuItem value="all">All periods</MenuItem><MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem><MenuItem value="yearly">Yearly</MenuItem>
            </Select>
            <Button variant="text" onClick={clearFilters} disabled={!hasFilters}>Clear</Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: { md: 'auto' } }}>{visibleSettlements.length} shown</Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {loading ? <Box textAlign="center" py={8}><CircularProgress /></Box> : <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 860 }}>
            <TableHead><TableRow>
              <TableCell>Statement</TableCell><TableCell>Period</TableCell><TableCell align="right">Sessions</TableCell>
              <TableCell align="right">Energy</TableCell><TableCell align="right">Your earning</TableCell>
              <TableCell align="right">Payable</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {visibleSettlements.map(settlement => <TableRow key={settlement.id} hover>
                <TableCell><Typography fontWeight={700}>#{settlement.id}</Typography><Typography variant="caption" color="text.secondary">{settlement.periodType}</Typography></TableCell>
                <TableCell>{formatDate(settlement.periodStart)} - {formatDate(settlement.periodEnd)}</TableCell>
                <TableCell align="right">{Number(settlement.totalTransactions || 0).toLocaleString()}</TableCell>
                <TableCell align="right">{formatEnergy(settlement.totalEnergyWh)}</TableCell>
                <TableCell align="right"><Typography fontWeight={700} color="success.dark">{formatNaira(settlement.partnerEarning)}</Typography></TableCell>
                <TableCell align="right"><Typography fontWeight={750}>{formatNaira(settlement.finalPayableAmount)}</Typography></TableCell>
                <TableCell><StatusChip status={settlement.status} /></TableCell>
                <TableCell align="right"><Stack direction="row" justifyContent="flex-end">
                  <Tooltip title="View statement"><IconButton onClick={() => view(settlement.id)}><VisibilityIcon /></IconButton></Tooltip>
                  <Tooltip title="Download PDF"><IconButton onClick={() => partnerService.exportSettlementPdf(settlement.id)}><PictureAsPdfIcon /></IconButton></Tooltip>
                  <Tooltip title="Download transactions CSV"><IconButton onClick={() => partnerService.exportSettlementCsv(settlement.id)}><DownloadIcon /></IconButton></Tooltip>
                </Stack></TableCell>
              </TableRow>)}
              {!visibleSettlements.length && <TableRow><TableCell colSpan={8} align="center"><Box py={7}><EventNoteIcon color="disabled" sx={{ fontSize: 40 }} /><Typography color="text.secondary" mt={1}>{hasFilters ? 'No statements match these filters.' : 'No settlement statements yet.'}</Typography></Box></TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>}
      </Card>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" color="primary.main">Settlement statement</Typography><Typography variant="h5">#{selected?.id}</Typography></Box>{selected && <StatusChip status={selected.status} />}</Stack></DialogTitle>
        <DialogContent dividers>
          {selected && <>
            <Grid container spacing={1.5} mb={2.5}>
              {[
                ['Period', `${formatDate(selected.periodStart)} - ${formatDate(selected.periodEnd)}`],
                ['Sessions', Number(selected.totalTransactions || 0).toLocaleString()],
                ['Energy', formatEnergy(selected.totalEnergyWh)],
                ['Your earning', formatNaira(selected.partnerEarning)],
                ['Final payable', formatNaira(selected.finalPayableAmount)],
                ['Payment reference', selected.paymentReference || '-']
              ].map(([label, value]) => <Grid item xs={6} sm={4} key={label}><Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'grey.50', border: '1px solid', borderColor: 'divider' }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={700} noWrap>{value}</Typography></Box></Grid>)}
            </Grid>
            <Divider sx={{ mb: 1.5 }} /><Typography variant="subtitle2" mb={1}>Included sessions</Typography>
            <TableContainer sx={{ maxHeight: 360 }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Transaction</TableCell><TableCell>Station</TableCell><TableCell align="right">Energy</TableCell><TableCell align="right">Your earning</TableCell></TableRow></TableHead><TableBody>
              {(selected.items || []).map(item => <TableRow key={item.id}><TableCell>#{item.transaction?.transactionId || item.transactionId}</TableCell><TableCell>{item.chargePointId || '-'}</TableCell><TableCell align="right">{formatEnergy(item.energyWh)}</TableCell><TableCell align="right">{formatNaira(item.partnerEarning)}</TableCell></TableRow>)}
              {!selected.items?.length && <TableRow><TableCell colSpan={4} align="center">No sessions were included in this statement.</TableCell></TableRow>}
            </TableBody></Table></TableContainer>
          </>}
        </DialogContent>
        <DialogActions><Button startIcon={<DownloadIcon />} onClick={() => partnerService.exportSettlementCsv(selected.id)}>CSV</Button><Button startIcon={<PictureAsPdfIcon />} variant="contained" onClick={() => partnerService.exportSettlementPdf(selected.id)}>PDF statement</Button><Button onClick={() => setSelected(null)}>Close</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
