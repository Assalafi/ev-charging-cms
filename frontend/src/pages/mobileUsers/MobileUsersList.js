import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  CircularProgress,
  Alert,
  Grid,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import {
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import mobileUserService from '../../services/mobileUserService';

const MobileUsersList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: '',
    user: null
  });

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, [page, rowsPerPage, searchTerm]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await mobileUserService.getMobileUsers(
        page + 1,
        rowsPerPage,
        searchTerm
      );
      setUsers(response.data.users);
      setTotalUsers(response.data.pagination.totalUsers);
      setError(null);
    } catch (err) {
      setError('Failed to fetch mobile users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await mobileUserService.getMobileUserStats();
      setStats(response.data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleMenuOpen = (event, user) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedUser) return;
    
    setConfirmDialog({
      open: true,
      action: newStatus,
      user: selectedUser
    });
    handleMenuClose();
  };

  const confirmAction = async () => {
    try {
      await mobileUserService.updateUserStatus(confirmDialog.user.id, confirmDialog.action);
      fetchUsers();
      fetchStats();
      setConfirmDialog({ open: false, action: '', user: null });
    } catch (err) {
      setError(`Failed to ${confirmDialog.action} user`);
      console.error('Error updating status:', err);
    }
  };

  const cancelAction = () => {
    setConfirmDialog({ open: false, action: '', user: null });
  };

  const getStatusChip = (user) => {
    const status = user.status || (user.active !== false ? 'active' : 'suspended');
    const color = status === 'active' ? 'success' : status === 'suspended' ? 'warning' : 'error';
    const icon = status === 'active' ? <CheckCircleIcon /> : status === 'suspended' ? <BlockIcon /> : <DeleteIcon />;
    
    return (
      <Chip
        icon={icon}
        label={status.charAt(0).toUpperCase() + status.slice(1)}
        color={color}
        size="small"
      />
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  };

  if (loading && users.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Mobile Users Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Total Users
                </Typography>
                <Typography variant="h5">
                  {stats.totalUsers || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Active Users
                </Typography>
                <Typography variant="h5" color="success.main">
                  {stats.activeUsers || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Suspended Users
                </Typography>
                <Typography variant="h5" color="warning.main">
                  {stats.suspendedUsers || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Deleted Users
                </Typography>
                <Typography variant="h5" color="error.main">
                  {stats.deletedUsers || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  New This Month
                </Typography>
                <Typography variant="h5" color="primary.main">
                  {stats.newThisMonth || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Search Bar */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={handleSearchChange}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          variant="outlined"
        />
      </Box>

      {/* Users Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Tag ID</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Login</TableCell>
                <TableCell>Transactions</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      <PersonIcon sx={{ mr: 1, color: 'text.secondary' }} />
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {user.name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          ID: {user.id}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Box display="flex" alignItems="center" sx={{ mb: 0.5 }}>
                        <PhoneIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                        <Typography variant="body2">{user.phone}</Typography>
                      </Box>
                      <Box display="flex" alignItems="center">
                        <EmailIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                        <Typography variant="body2">{user.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace">
                      {user.tagId || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {getStatusChip(user)}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(user.lastLogin)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {user.transactions?.length || 0}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={(e) => handleMenuOpen(e, user)}
                      size="small"
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 20, 50, 100]}
          component="div"
          count={totalUsers}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {selectedUser?.active !== false ? (
          <MenuItem onClick={() => handleStatusUpdate('suspended')}>
            <BlockIcon fontSize="small" sx={{ mr: 1 }} />
            Suspend User
          </MenuItem>
        ) : (
          <MenuItem onClick={() => handleStatusUpdate('active')}>
            <CheckCircleIcon fontSize="small" sx={{ mr: 1 }} />
            Activate User
          </MenuItem>
        )}
        <MenuItem onClick={() => handleStatusUpdate('deleted')} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete User
        </MenuItem>
      </Menu>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={cancelAction}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Confirm {confirmDialog.action === 'deleted' ? 'Delete' : confirmDialog.action.charAt(0).toUpperCase() + confirmDialog.action.slice(1)} User
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to {confirmDialog.action} the user "{confirmDialog.user?.name}"?
            {confirmDialog.action === 'deleted' && (
              <Box component="span" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                {' '}This action will soft delete the user and they will no longer appear in the main list.
              </Box>
            )}
            {confirmDialog.action === 'suspended' && (
              <Box component="span" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
                {' '}This will prevent the user from accessing the system.
              </Box>
            )}
            {confirmDialog.action === 'active' && (
              <Box component="span" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                {' '}This will restore the user's access to the system.
              </Box>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelAction} color="inherit">
            Cancel
          </Button>
          <Button 
            onClick={confirmAction} 
            color={confirmDialog.action === 'deleted' ? 'error' : confirmDialog.action === 'suspended' ? 'warning' : 'success'}
            variant="contained"
          >
            {confirmDialog.action === 'deleted' ? 'Delete' : confirmDialog.action.charAt(0).toUpperCase() + confirmDialog.action.slice(1)}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MobileUsersList;
