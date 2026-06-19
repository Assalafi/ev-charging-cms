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
  Button,
  FormControl,
  InputLabel,
  Select,
  Switch,
  FormControlLabel,
  Avatar
} from '@mui/material';
import {
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import adsBoardService from '../../services/adsBoardService';

const AdsBoardList = () => {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalAds, setTotalAds] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedAd, setSelectedAd] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    action: '',
    ad: null
  });
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    order: 0,
    status: 'active'
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  useEffect(() => {
    fetchAds();
  }, [page, rowsPerPage]);

  const fetchAds = async () => {
    try {
      setLoading(true);
      const response = await adsBoardService.getAds(page + 1, rowsPerPage);
      setAds(response.data.ads);
      setTotalAds(response.data.pagination.totalAds);
    } catch (err) {
      setError('Failed to fetch ads');
      console.error('Error fetching ads:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuClick = (event, ad) => {
    setAnchorEl(event.currentTarget);
    setSelectedAd(ad);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    // Don't clear selectedAd here - it might be needed for edit dialog
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedAd) return;
    
    try {
      await adsBoardService.updateAdStatus(selectedAd.id, newStatus);
      fetchAds();
      handleMenuClose();
    } catch (err) {
      setError('Failed to update ad status');
      console.error('Error updating status:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedAd) return;
    
    setConfirmDialog({
      open: true,
      action: 'delete',
      ad: selectedAd
    });
    handleMenuClose();
  };

  const confirmDelete = async () => {
    try {
      await adsBoardService.deleteAd(confirmDialog.ad.id);
      fetchAds();
      setConfirmDialog({ open: false, action: '', ad: null });
    } catch (err) {
      setError('Failed to delete ad');
      console.error('Error deleting ad:', err);
    }
  };

  const cancelDelete = () => {
    setConfirmDialog({ open: false, action: '', ad: null });
  };

  const handleEdit = (ad) => {
    setSelectedAd(ad);
    setFormData({
      title: ad.title,
      body: ad.body,
      order: ad.order,
      status: ad.status
    });
    setImagePreview(ad.photo || '');
    setEditDialogOpen(true);
    handleMenuClose();
  };

  const handleCreate = () => {
    setFormData({
      title: '',
      body: '',
      order: 0,
      status: 'active'
    });
    setImageFile(null);
    setImagePreview('');
    setCreateDialogOpen(true);
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (isEdit = false) => {
    try {
      console.log('handleSubmit called with:', { isEdit, selectedAd: selectedAd?.id, formData, imageFile: imageFile?.name });
      
      if (isEdit && selectedAd) {
        console.log('Calling updateAd for ad ID:', selectedAd.id);
        await adsBoardService.updateAd(selectedAd.id, formData, imageFile);
      } else {
        console.log('Calling createAd');
        await adsBoardService.createAd(formData, imageFile);
      }
      
      fetchAds();
      setCreateDialogOpen(false);
      setEditDialogOpen(false);
      setSelectedAd(null); // Clear selectedAd when dialog closes
      setImageFile(null);
      setImagePreview('');
    } catch (err) {
      setError(isEdit ? 'Failed to update ad' : 'Failed to create ad');
      console.error('Error saving ad:', err);
    }
  };

  const getStatusChip = (ad) => {
    return (
      <Chip
        icon={ad.status === 'active' ? <VisibilityIcon /> : <VisibilityOffIcon />}
        label={ad.status.charAt(0).toUpperCase() + ad.status.slice(1)}
        color={ad.status === 'active' ? 'success' : 'default'}
        size="small"
      />
    );
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          Ads Board Management
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreate}
        >
          Create Ad
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Image</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Body</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ads.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell>{ad.order}</TableCell>
                  <TableCell>
                    {ad.photo ? (
                      <Avatar
                        src={`https://evcharging.eride.ng${ad.photo}`}
                        alt={ad.title}
                        variant="rounded"
                        sx={{ width: 50, height: 50 }}
                      />
                    ) : (
                      <Avatar variant="rounded" sx={{ width: 50, height: 50 }}>
                        <ImageIcon />
                      </Avatar>
                    )}
                  </TableCell>
                  <TableCell>{ad.title}</TableCell>
                  <TableCell>{ad.body}</TableCell>
                  <TableCell>{getStatusChip(ad)}</TableCell>
                  <TableCell>
                    <IconButton
                      onClick={(e) => handleMenuClick(e, ad)}
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
          rowsPerPageOptions={[10, 20, 50]}
          component="div"
          count={totalAds}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(event, newPage) => setPage(newPage)}
          onRowsPerPageChange={(event) => {
            setRowsPerPage(parseInt(event.target.value, 10));
            setPage(0);
          }}
        />
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedAd && handleEdit(selectedAd)}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={() => handleStatusUpdate(selectedAd.status === 'active' ? 'inactive' : 'active')}>
          {selectedAd?.status === 'active' ? (
            <VisibilityOffIcon fontSize="small" sx={{ mr: 1 }} />
          ) : (
            <VisibilityIcon fontSize="small" sx={{ mr: 1 }} />
          )}
          {selectedAd?.status === 'active' ? 'Deactivate' : 'Activate'}
        </MenuItem>
        <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      {/* Create/Edit Dialog */}
      <Dialog
        open={createDialogOpen || editDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setEditDialogOpen(false);
          setSelectedAd(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editDialogOpen ? 'Edit Ad' : 'Create New Ad'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Title (max 50 chars)"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              inputProps={{ maxLength: 50 }}
              helperText={`${formData.title.length}/50`}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Body (max 50 chars)"
              value={formData.body}
              onChange={(e) => setFormData({ ...formData, body: e.target.value })}
              inputProps={{ maxLength: 50 }}
              helperText={`${formData.body.length}/50`}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Display Order"
              type="number"
              value={formData.order}
              onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
              sx={{ mb: 2 }}
            />
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="inactive">Inactive</MenuItem>
              </Select>
            </FormControl>
            <Box>
              <input
                accept="image/*"
                type="file"
                id="ad-image-upload"
                style={{ display: 'none' }}
                onChange={handleImageChange}
              />
              <label htmlFor="ad-image-upload">
                <Button variant="outlined" component="span" fullWidth>
                  Upload Image (Optional)
                </Button>
              </label>
              {imagePreview && (
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <Avatar
                    src={imagePreview}
                    alt="Preview"
                    variant="rounded"
                    sx={{ width: 100, height: 100, margin: '0 auto' }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateDialogOpen(false);
              setEditDialogOpen(false);
              setSelectedAd(null);
            }}
            color="inherit"
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSubmit(editDialogOpen)}
            variant="contained"
          >
            {editDialogOpen ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={cancelDelete}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the ad "{confirmDialog.ad?.title}"?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDelete} color="inherit">
            Cancel
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdsBoardList;
