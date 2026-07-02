import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress
} from '@mui/material';
import api from '../../services/api';

const PartnerSettlements = () => {
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSettlements();
  }, []);

  const fetchSettlements = async () => {
    try {
      const response = await api.get('/partner/settlements');
      if (response.data.success) {
        setSettlements(response.data.settlements || []);
      }
    } catch (error) {
      console.error('Error fetching settlements:', error);
      setSettlements([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'draft': return 'default';
      case 'approved': return 'warning';
      case 'paid': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Partner Settlements
      </Typography>

      <Card>
        <CardContent>
          {settlements.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No settlements found
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Period</TableCell>
                    <TableCell>Start Date</TableCell>
                    <TableCell>End Date</TableCell>
                    <TableCell>Transactions</TableCell>
                    <TableCell>Energy (kWh)</TableCell>
                    <TableCell>Partner Earnings</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {settlements.map((settlement) => (
                    <TableRow key={settlement.id}>
                      <TableCell>{settlement.periodType}</TableCell>
                      <TableCell>{formatDate(settlement.periodStart)}</TableCell>
                      <TableCell>{formatDate(settlement.periodEnd)}</TableCell>
                      <TableCell>{settlement.totalTransactions || 0}</TableCell>
                      <TableCell>
                        {settlement.totalEnergyWh 
                          ? `${(settlement.totalEnergyWh / 1000).toFixed(2)} kWh` 
                          : '0 kWh'}
                      </TableCell>
                      <TableCell>
                        ₦{settlement.partnerEarning?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={settlement.status}
                          color={getStatusColor(settlement.status)}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PartnerSettlements;
