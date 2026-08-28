import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton,
  InputAdornment, InputLabel, Menu, MenuItem, Paper, Select, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import {
  AddRounded as AddIcon,
  CampaignRounded as CampaignIcon,
  CloudUploadRounded as UploadIcon,
  DeleteOutlineRounded as DeleteIcon,
  EditRounded as EditIcon,
  ImageOutlined as ImageIcon,
  MoreVertRounded as MoreIcon,
  RefreshRounded as RefreshIcon,
  SearchRounded as SearchIcon,
  VisibilityOffRounded as HiddenIcon,
  VisibilityRounded as VisibleIcon
} from '@mui/icons-material';
import adsBoardService, { resolveAdPhotoUrl } from '../../services/adsBoardService';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../contexts/AuthContext';

const TITLE_LIMIT = 15;
const BODY_LIMIT = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const EMPTY_FORM = { title: '', body: '', order: 0, status: 'active' };

function AdsBoardList() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('ads.manage');
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalAds, setTotalAds] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedAd, setSelectedAd] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteAd, setDeleteAd] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);

  const fetchAds = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await adsBoardService.getAds({
        page: page + 1,
        limit: rowsPerPage,
        search: search.trim(),
        status: statusFilter
      });
      setAds(response.data?.ads || []);
      setTotalAds(Number(response.data?.pagination?.totalAds) || 0);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Failed to fetch ads');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, rowsPerPage, search, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => fetchAds(), search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchAds, search]);

  const pageStats = useMemo(() => ({
    active: ads.filter(ad => ad.status === 'active').length,
    inactive: ads.filter(ad => ad.status === 'inactive').length,
    withImage: ads.filter(ad => ad.photo).length
  }), [ads]);

  const closeMenu = () => setAnchorEl(null);

  const openCreate = () => {
    setSelectedAd(null);
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview('');
    setRemovePhoto(false);
    setFormError('');
    setEditorOpen(true);
  };

  const openEdit = ad => {
    setSelectedAd(ad);
    setForm({ title: ad.title || '', body: ad.body || '', order: Number(ad.order) || 0, status: ad.status || 'active' });
    setImageFile(null);
    setImagePreview(resolveAdPhotoUrl(ad.photo));
    setRemovePhoto(false);
    setFormError('');
    setEditorOpen(true);
    closeMenu();
  };

  const closeEditor = (force = false) => {
    if (saving && !force) return;
    setEditorOpen(false);
    setSelectedAd(null);
    setImageFile(null);
    setImagePreview('');
    setRemovePhoto(false);
    setFormError('');
  };

  const selectImage = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setFormError('Choose a JPG, PNG, GIF or WebP image');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setFormError('Image must not exceed 5 MB');
      return;
    }
    setImageFile(file);
    setRemovePhoto(false);
    setFormError('');
    const reader = new FileReader();
    reader.onload = () => setImagePreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview('');
    setRemovePhoto(Boolean(selectedAd?.photo));
  };

  const validateForm = () => {
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title) return 'Title is required';
    if (title.length > TITLE_LIMIT) return `Title must be ${TITLE_LIMIT} characters or less`;
    if (!body) return 'Body is required';
    if (body.length > BODY_LIMIT) return `Body must be ${BODY_LIMIT} characters or less`;
    const order = Number(form.order);
    if (!Number.isInteger(order) || order < 0 || order > 100000) return 'Display order must be a whole number between 0 and 100000';
    return '';
  };

  const saveAd = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError('');
    setError('');
    try {
      const payload = { ...form, title: form.title.trim(), body: form.body.trim(), order: Number(form.order) };
      if (selectedAd) {
        await adsBoardService.updateAd(selectedAd.id, payload, imageFile, { removePhoto });
        setSuccess('Ad updated successfully');
      } else {
        await adsBoardService.createAd(payload, imageFile);
        setSuccess('Ad created successfully');
      }
      closeEditor(true);
      await fetchAds({ quiet: true });
    } catch (requestError) {
      setFormError(requestError.message || 'Unable to save this ad');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async ad => {
    const nextStatus = ad.status === 'active' ? 'inactive' : 'active';
    closeMenu();
    setStatusUpdatingId(ad.id);
    setError('');
    try {
      await adsBoardService.updateAdStatus(ad.id, nextStatus);
      setSuccess(`Ad ${nextStatus === 'active' ? 'activated' : 'deactivated'}`);
      await fetchAds({ quiet: true });
    } catch (requestError) {
      setError(requestError.message || 'Failed to update ad status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteAd) return;
    setDeleting(true);
    setError('');
    try {
      await adsBoardService.deleteAd(deleteAd.id);
      setSuccess('Ad and its managed image were deleted');
      setDeleteAd(null);
      if (ads.length === 1 && page > 0) setPage(current => current - 1);
      else await fetchAds({ quiet: true });
    } catch (requestError) {
      setError(requestError.message || 'Failed to delete ad');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box className="page-enter">
      <PageHeader
        title="Ads board"
        description="Manage the campaign cards delivered to the EV Charge mobile application."
        actions={(
          <Stack direction="row" spacing={1}>
            <Tooltip title="Refresh ads"><span><IconButton onClick={() => fetchAds({ quiet: true })} disabled={refreshing}><RefreshIcon /></IconButton></span></Tooltip>
            {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>Create ad</Button>}
          </Stack>
        )}
      />

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>{success}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {[
          ['Matching ads', totalAds, <CampaignIcon />],
          ['Active on page', pageStats.active, <VisibleIcon />],
          ['Inactive on page', pageStats.inactive, <HiddenIcon />],
          ['Images on page', pageStats.withImage, <ImageIcon />]
        ].map(([label, value, icon]) => (
          <Grid item xs={6} lg={3} key={label}>
            <Card sx={{ height: '100%', border: '1px solid', borderColor: 'divider', boxShadow: '0 8px 24px rgba(15,23,42,.045)' }}>
              <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h4">{value}</Typography></Box>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: 'rgba(37,99,235,.08)' }}>{icon}</Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: { xs: 1.25, sm: 1.75 }, mb: 2, border: '1px solid', borderColor: 'divider' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <TextField
            fullWidth size="small" placeholder="Search title or message" value={search}
            onChange={event => { setSearch(event.target.value); setPage(0); }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: { sm: 170 } }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={event => { setStatusFilter(event.target.value); setPage(0); }}>
              <MenuItem value="all">All statuses</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <Paper sx={{ overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>
        ) : (
          <>
            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table>
                <TableHead><TableRow><TableCell>Order</TableCell><TableCell>Campaign</TableCell><TableCell>Message</TableCell><TableCell>Status</TableCell>{canManage && <TableCell align="right">Actions</TableCell>}</TableRow></TableHead>
                <TableBody>
                  {ads.map(ad => (
                    <TableRow hover key={ad.id}>
                      <TableCell><Chip size="small" label={ad.order} variant="outlined" /></TableCell>
                      <TableCell><Stack direction="row" spacing={1.5} alignItems="center"><Avatar src={resolveAdPhotoUrl(ad.photo)} variant="rounded" sx={{ width: 54, height: 54, bgcolor: 'action.hover' }}><ImageIcon /></Avatar><Typography variant="body2" fontWeight={700}>{ad.title}</Typography></Stack></TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{ad.body}</Typography></TableCell>
                      <TableCell><Chip size="small" icon={ad.status === 'active' ? <VisibleIcon /> : <HiddenIcon />} label={ad.status === 'active' ? 'Active' : 'Inactive'} color={ad.status === 'active' ? 'success' : 'default'} /></TableCell>
                      {canManage && <TableCell align="right"><IconButton aria-label={`Actions for ${ad.title}`} onClick={event => { setAnchorEl(event.currentTarget); setSelectedAd(ad); }} disabled={statusUpdatingId === ad.id}><MoreIcon /></IconButton></TableCell>}
                    </TableRow>
                  ))}
                  {!ads.length && <TableRow><TableCell colSpan={canManage ? 5 : 4} align="center"><Box sx={{ py: 7 }}><CampaignIcon color="disabled" sx={{ fontSize: 46 }} /><Typography fontWeight={700} sx={{ mt: 1 }}>No ads found</Typography><Typography variant="body2" color="text.secondary">Adjust the filters or create the first campaign.</Typography></Box></TableCell></TableRow>}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' }, p: 1.25 }}>
              {ads.map(ad => (
                <Card variant="outlined" key={ad.id}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Stack direction="row" spacing={1.25} alignItems="flex-start">
                      <Avatar src={resolveAdPhotoUrl(ad.photo)} variant="rounded" sx={{ width: 64, height: 64, bgcolor: 'action.hover' }}><ImageIcon /></Avatar>
                      <Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box sx={{ minWidth: 0 }}><Typography fontWeight={750} noWrap>{ad.title}</Typography><Typography variant="caption" color="text.secondary">Order {ad.order}</Typography></Box>{canManage && <IconButton size="small" onClick={event => { setAnchorEl(event.currentTarget); setSelectedAd(ad); }}><MoreIcon /></IconButton>}</Stack><Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>{ad.body}</Typography><Chip size="small" label={ad.status === 'active' ? 'Active' : 'Inactive'} color={ad.status === 'active' ? 'success' : 'default'} /></Box>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
              {!ads.length && <Box sx={{ textAlign: 'center', py: 6 }}><CampaignIcon color="disabled" sx={{ fontSize: 46 }} /><Typography fontWeight={700}>No ads found</Typography></Box>}
            </Stack>

            <TablePagination
              rowsPerPageOptions={[10, 20, 50]}
              component="div" count={totalAds} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(event, value) => setPage(value)}
              onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
            />
          </>
        )}
      </Paper>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={closeMenu}>
        <MenuItem onClick={() => selectedAd && openEdit(selectedAd)}><EditIcon fontSize="small" sx={{ mr: 1.2 }} />Edit</MenuItem>
        <MenuItem onClick={() => selectedAd && changeStatus(selectedAd)}>{selectedAd?.status === 'active' ? <HiddenIcon fontSize="small" sx={{ mr: 1.2 }} /> : <VisibleIcon fontSize="small" sx={{ mr: 1.2 }} />}{selectedAd?.status === 'active' ? 'Deactivate' : 'Activate'}</MenuItem>
        <MenuItem onClick={() => { setDeleteAd(selectedAd); closeMenu(); }} sx={{ color: 'error.main' }}><DeleteIcon fontSize="small" sx={{ mr: 1.2 }} />Delete</MenuItem>
      </Menu>

      <Dialog open={editorOpen} onClose={() => closeEditor()} fullWidth maxWidth="sm">
        <DialogTitle>{selectedAd ? 'Edit mobile ad' : 'Create mobile ad'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField required label="Title" value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} inputProps={{ maxLength: TITLE_LIMIT }} helperText={`${form.title.length}/${TITLE_LIMIT} characters`} error={form.title.length > TITLE_LIMIT} />
            <TextField required multiline minRows={2} label="Message" value={form.body} onChange={event => setForm(current => ({ ...current, body: event.target.value }))} inputProps={{ maxLength: BODY_LIMIT }} helperText={`${form.body.length}/${BODY_LIMIT} characters`} error={form.body.length > BODY_LIMIT} />
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}><TextField fullWidth type="number" label="Display order" value={form.order} onChange={event => setForm(current => ({ ...current, order: event.target.value }))} inputProps={{ min: 0, max: 100000, step: 1 }} helperText="Lower numbers appear first" /></Grid>
              <Grid item xs={12} sm={6}><FormControl fullWidth><InputLabel>Status</InputLabel><Select value={form.status} label="Status" onChange={event => setForm(current => ({ ...current, status: event.target.value }))}><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem></Select></FormControl></Grid>
            </Grid>
            <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 3, p: 1.5 }}>
              {imagePreview ? <Box component="img" src={imagePreview} alt="Ad preview" sx={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 2, bgcolor: 'action.hover', mb: 1.25 }} /> : <Box sx={{ height: 130, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', borderRadius: 2, mb: 1.25 }}><ImageIcon color="disabled" sx={{ fontSize: 46 }} /></Box>}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button component="label" variant="outlined" startIcon={<UploadIcon />} fullWidth>Choose image<input hidden type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={selectImage} /></Button>
                {imagePreview && <Button color="error" variant="text" onClick={clearImage}>Remove image</Button>}
              </Stack>
              {imageFile && <Chip size="small" color="primary" variant="outlined" icon={<ImageIcon />} label={`${imageFile.name} · ${(imageFile.size / (1024 * 1024)).toFixed(2)} MB`} sx={{ mt: 1.25, maxWidth: '100%' }} />}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>JPG, PNG, GIF or WebP; maximum 5 MB.</Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={closeEditor} disabled={saving}>Cancel</Button><Button variant="contained" onClick={saveAd} disabled={saving} startIcon={saving ? <CircularProgress size={17} color="inherit" /> : null}>{saving ? 'Saving...' : selectedAd ? 'Save changes' : 'Create ad'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteAd)} onClose={() => !deleting && setDeleteAd(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete this ad?</DialogTitle>
        <DialogContent><Typography>The campaign “{deleteAd?.title}” will be removed from the admin dashboard and mobile API. Its managed image will also be deleted.</Typography></DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setDeleteAd(null)} disabled={deleting}>Cancel</Button><Button color="error" variant="contained" onClick={confirmDelete} disabled={deleting} startIcon={deleting ? <CircularProgress size={17} color="inherit" /> : <DeleteIcon />}>{deleting ? 'Deleting...' : 'Delete ad'}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

export default AdsBoardList;
