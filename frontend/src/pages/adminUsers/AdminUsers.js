import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  AddRounded,
  AdminPanelSettingsRounded,
  CheckCircleRounded,
  DeleteOutlineRounded,
  EditOutlined,
  FilterAltOffRounded,
  LockPersonRounded,
  ManageAccountsRounded,
  PublicRounded,
  RefreshRounded,
  SearchRounded,
  ShieldOutlined
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { format } from 'date-fns';
import adminUserService from '../../services/adminUserService';
import { useAuth } from '../../contexts/AuthContext';
import { useBranding } from '../../contexts/BrandingContext';

const emptyForm = {
  fullName: '', username: '', email: '', password: '', role: 'manager', active: true,
  scopeType: 'all', managedStates: [], permissions: []
};

const roleColors = {
  super_admin: 'error', admin: 'primary', manager: 'secondary', finance: 'success',
  operations: 'info', operator: 'info', technician: 'warning', support: 'default', viewer: 'default'
};

const errorMessage = error => error?.response?.data?.message || error?.serverMessage || error?.message || 'Something went wrong';
const humanRole = role => String(role || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());

function MetricCard({ icon, label, value, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3.5, height: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', color, bgcolor: alpha(color, 0.1) }}>{icon}</Box>
        <Box><Typography variant="h5" fontWeight={800}>{value ?? 0}</Typography><Typography variant="body2" color="text.secondary">{label}</Typography></Box>
      </Stack>
    </Paper>
  );
}

function AccessBadge({ user }) {
  if (user.scopeType === 'states') {
    const states = user.managedStates || [];
    return <Tooltip title={states.join(', ')}><Chip size="small" icon={<LockPersonRounded />} label={`${states.length} state${states.length === 1 ? '' : 's'}`} color="secondary" variant="outlined" /></Tooltip>;
  }
  return <Chip size="small" icon={<PublicRounded />} label="All states" variant="outlined" />;
}

function UserAvatar({ user }) {
  const name = user.fullName || user.username || 'U';
  return <Avatar sx={{ bgcolor: alpha('#2563EB', 0.12), color: '#1D4ED8', fontWeight: 750 }}>{name.slice(0, 1).toUpperCase()}</Avatar>;
}

function AdminUsers() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const dialogFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentUser, hasPermission } = useAuth();
  const { branding } = useBranding();
  const canManage = hasPermission('admin_users.manage');
  const [users, setUsers] = useState([]);
  const [metadata, setMetadata] = useState({ roles: [], states: [], pages: [], rolePresets: {} });
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [filters, setFilters] = useState({ search: '', role: '', active: '', scopeType: '' });
  const [query, setQuery] = useState({ search: '', role: '', active: '', scopeType: '', page: 1, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(undefined);
  const [form, setForm] = useState(emptyForm);
  const [deleteUser, setDeleteUser] = useState(null);
  const [notice, setNotice] = useState({ open: false, severity: 'success', message: '' });

  const notify = (message, severity = 'success') => setNotice({ open: true, severity, message });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminUserService.list(query);
      setUsers(data.users || []);
      setSummary(data.summary || {});
      setPagination(data.pagination || { page: 1, limit: 20, total: 0, pages: 1 });
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    adminUserService.metadata().then(data => setMetadata(data)).catch(error => notify(errorMessage(error), 'error'));
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(previous => ({ ...previous, ...filters, page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [filters]);

  const openCreate = () => {
    const role = metadata.roles.some(item => item.value === 'manager') ? 'manager' : metadata.roles[0]?.value || 'viewer';
    setEditor(null);
    setForm({ ...emptyForm, role, permissions: [...(metadata.rolePresets[role] || [])] });
  };

  const openEdit = user => {
    setEditor(user);
    setForm({
      fullName: user.fullName || '', username: user.username, email: user.email, password: '',
      role: user.role, active: user.active, scopeType: user.scopeType || 'all',
      managedStates: user.managedStates || [], permissions: [...(user.effectivePermissions || [])]
    });
  };

  const closeEditor = () => { setEditor(undefined); setForm(emptyForm); };
  const editorOpen = editor !== undefined;

  const setRole = role => setForm(previous => ({
    ...previous,
    role,
    permissions: [...(metadata.rolePresets[role] || [])],
    scopeType: role === 'manager' ? previous.scopeType : 'all',
    managedStates: role === 'manager' ? previous.managedStates : []
  }));

  const pageAccess = page => {
    if (form.permissions.includes('*')) return 'manage';
    const enabled = page.permissions.filter(permission => form.permissions.includes(permission));
    if (!enabled.length) return 'none';
    return page.permissions.length > 1 && enabled.length === page.permissions.length ? 'manage' : 'view';
  };

  const setPageAccess = (page, level) => setForm(previous => {
    const withoutPage = previous.permissions.filter(permission => !page.permissions.includes(permission) && permission !== '*');
    if (level === 'view') withoutPage.push(page.permissions[0]);
    if (level === 'manage') withoutPage.push(...page.permissions);
    return { ...previous, permissions: [...new Set(withoutPage)] };
  });

  const save = async () => {
    if (!form.username.trim() || !form.email.trim() || (!editor && form.password.length < 8)) {
      notify('Complete the username, email and password fields.', 'warning');
      return;
    }
    if (form.role === 'manager' && form.scopeType === 'states' && !form.managedStates.length) {
      notify('Select at least one state for this manager.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, password: form.password || undefined };
      const data = editor ? await adminUserService.update(editor.id, payload) : await adminUserService.create(payload);
      notify(data.message);
      closeEditor();
      await load();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteUser) return;
    setSaving(true);
    try {
      const data = await adminUserService.remove(deleteUser.id);
      notify(data.message);
      setDeleteUser(null);
      await load();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetFilters = () => setFilters({ search: '', role: '', active: '', scopeType: '' });
  const hasFilters = Object.values(filters).some(Boolean);
  const permissionCount = form.permissions.includes('*')
    ? metadata.pages.length
    : metadata.pages.filter(page => pageAccess(page) !== 'none').length;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={820} letterSpacing="-.03em">Admin users</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>Control who can operate {branding.systemName}, what they can access, and where they can work.</Typography>
        </Box>
        {canManage && <Button variant="contained" size="large" startIcon={<AddRounded />} onClick={openCreate} sx={{ borderRadius: 2.5, whiteSpace: 'nowrap' }}>Create admin user</Button>}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: { xs: 1.25, sm: 2 } }}>
        <MetricCard icon={<ManageAccountsRounded />} label="Admin users" value={summary.total} color="#2563EB" />
        <MetricCard icon={<CheckCircleRounded />} label="Active accounts" value={summary.active} color="#059669" />
        <MetricCard icon={<ShieldOutlined />} label="Managers" value={summary.managers} color="#7C3AED" />
        <MetricCard icon={<LockPersonRounded />} label="State-limited" value={summary.stateManagers} color="#EA580C" />
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 3.5, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} sx={{ p: 2 }}>
          <TextField
            value={filters.search}
            onChange={event => setFilters(previous => ({ ...previous, search: event.target.value }))}
            placeholder="Search name, username or email"
            size="small"
            sx={{ flex: 1, minWidth: { lg: 280 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}><InputLabel>Role</InputLabel><Select label="Role" value={filters.role} onChange={event => setFilters(previous => ({ ...previous, role: event.target.value }))}><MenuItem value="">All roles</MenuItem>{metadata.roles.map(role => <MenuItem key={role.value} value={role.value}>{role.label}</MenuItem>)}</Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 135 }}><InputLabel>Status</InputLabel><Select label="Status" value={filters.active} onChange={event => setFilters(previous => ({ ...previous, active: event.target.value }))}><MenuItem value="">Any status</MenuItem><MenuItem value="true">Active</MenuItem><MenuItem value="false">Disabled</MenuItem></Select></FormControl>
          <FormControl size="small" sx={{ minWidth: 145 }}><InputLabel>Coverage</InputLabel><Select label="Coverage" value={filters.scopeType} onChange={event => setFilters(previous => ({ ...previous, scopeType: event.target.value }))}><MenuItem value="">Any coverage</MenuItem><MenuItem value="all">All states</MenuItem><MenuItem value="states">Selected states</MenuItem></Select></FormControl>
          <Stack direction="row" spacing={0.5} justifyContent="flex-end"><Tooltip title="Refresh"><IconButton onClick={load}><RefreshRounded /></IconButton></Tooltip>{hasFilters && <Tooltip title="Clear filters"><IconButton onClick={resetFilters}><FilterAltOffRounded /></IconButton></Tooltip>}</Stack>
        </Stack>
        <Divider />

        {loading ? <Box sx={{ minHeight: 300, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box> : users.length === 0 ? (
          <Stack alignItems="center" spacing={1.25} sx={{ py: 8, px: 2, textAlign: 'center' }}><AdminPanelSettingsRounded sx={{ fontSize: 48, color: 'text.disabled' }} /><Typography variant="h6" fontWeight={700}>No admin users found</Typography><Typography color="text.secondary">Adjust the filters or create a new administrative account.</Typography></Stack>
        ) : mobile ? (
          <Stack spacing={1.25} sx={{ p: 1.5 }}>
            {users.map(user => <Paper key={user.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start"><UserAvatar user={user} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={750} noWrap>{user.fullName || user.username}</Typography><Typography variant="body2" color="text.secondary" noWrap>@{user.username} · {user.email}</Typography></Box><Chip size="small" label={user.active ? 'Active' : 'Disabled'} color={user.active ? 'success' : 'default'} /></Stack>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}><Chip size="small" color={roleColors[user.role] || 'default'} label={humanRole(user.role)} /><AccessBadge user={user} /><Chip size="small" variant="outlined" label={`${(user.effectivePermissions || []).includes('*') ? 'All' : (user.effectivePermissions || []).length} permissions`} /></Stack>
              {canManage && <Stack direction="row" justifyContent="flex-end" spacing={0.5} sx={{ mt: 1.25 }}><Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(user)}>Edit</Button><Button size="small" color="error" startIcon={<DeleteOutlineRounded />} disabled={user.id === currentUser?.id} onClick={() => setDeleteUser(user)}>Delete</Button></Stack>}
            </Paper>)}
          </Stack>
        ) : (
          <TableContainer><Table><TableHead><TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell>Coverage</TableCell><TableCell>Permissions</TableCell><TableCell>Last sign-in</TableCell><TableCell>Status</TableCell>{canManage && <TableCell align="right">Actions</TableCell>}</TableRow></TableHead><TableBody>{users.map(user => <TableRow key={user.id} hover><TableCell><Stack direction="row" spacing={1.25} alignItems="center"><UserAvatar user={user} /><Box><Typography variant="body2" fontWeight={720}>{user.fullName || user.username}</Typography><Typography variant="caption" color="text.secondary">@{user.username} · {user.email}</Typography></Box></Stack></TableCell><TableCell><Chip size="small" color={roleColors[user.role] || 'default'} label={humanRole(user.role)} /></TableCell><TableCell><AccessBadge user={user} /></TableCell><TableCell><Typography variant="body2">{(user.effectivePermissions || []).includes('*') ? 'All pages' : `${metadata.pages.filter(page => (user.effectivePermissions || []).includes(page.permissions[0])).length} of ${metadata.pages.length} pages`}</Typography></TableCell><TableCell><Typography variant="body2" color="text.secondary">{user.lastLogin ? format(new Date(user.lastLogin), 'd MMM yyyy, HH:mm') : 'Never'}</Typography></TableCell><TableCell><Chip size="small" label={user.active ? 'Active' : 'Disabled'} color={user.active ? 'success' : 'default'} variant={user.active ? 'filled' : 'outlined'} /></TableCell>{canManage && <TableCell align="right"><Tooltip title="Edit"><IconButton onClick={() => openEdit(user)}><EditOutlined fontSize="small" /></IconButton></Tooltip><Tooltip title={user.id === currentUser?.id ? 'You cannot delete your account' : 'Delete'}><span><IconButton color="error" disabled={user.id === currentUser?.id} onClick={() => setDeleteUser(user)}><DeleteOutlineRounded fontSize="small" /></IconButton></span></Tooltip></TableCell>}</TableRow>)}</TableBody></Table></TableContainer>
        )}
        <TablePagination component="div" count={pagination.total || 0} page={(pagination.page || 1) - 1} rowsPerPage={pagination.limit || 20} rowsPerPageOptions={[10, 20, 50]} onPageChange={(_, page) => setQuery(previous => ({ ...previous, page: page + 1 }))} onRowsPerPageChange={event => setQuery(previous => ({ ...previous, limit: Number(event.target.value), page: 1 }))} />
      </Paper>

      <Dialog open={editorOpen} onClose={() => !saving && closeEditor()} fullScreen={dialogFullScreen} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: dialogFullScreen ? 0 : 4 } }}>
        <DialogTitle sx={{ pb: 1 }}><Typography variant="h5" fontWeight={800}>{editor ? 'Edit admin user' : 'Create admin user'}</Typography><Typography variant="body2" color="text.secondary">Account details, page permissions and operational coverage</Typography></DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={3}>
            <Box><Typography fontWeight={750} sx={{ mb: 1.5 }}>Account details</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}><TextField label="Full name" value={form.fullName} onChange={event => setForm(previous => ({ ...previous, fullName: event.target.value }))} /><TextField required label="Username" value={form.username} onChange={event => setForm(previous => ({ ...previous, username: event.target.value }))} /><TextField required type="email" label="Email address" value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} /><TextField required={!editor} type="password" label={editor ? 'New password (optional)' : 'Temporary password'} helperText={editor ? 'Leave blank to keep the current password' : 'Minimum 8 characters'} value={form.password} onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))} /></Box></Box>
            <Divider />
            <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}><Box><Typography fontWeight={750}>Role and coverage</Typography><Typography variant="body2" color="text.secondary">The role starts a permission preset; you can customize it below.</Typography></Box><FormControlLabel control={<Switch checked={form.active} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} />} label={form.active ? 'Active' : 'Disabled'} /></Stack><FormControl fullWidth><InputLabel>Role</InputLabel><Select label="Role" value={form.role} onChange={event => setRole(event.target.value)}>{metadata.roles.map(role => <MenuItem key={role.value} value={role.value}><Box><Typography variant="body2" fontWeight={700}>{role.label}</Typography><Typography variant="caption" color="text.secondary">{role.description}</Typography></Box></MenuItem>)}</Select></FormControl>
              {form.role === 'manager' && <Paper variant="outlined" sx={{ mt: 2, p: 2, borderRadius: 3, bgcolor: alpha('#7C3AED', 0.025) }}><Typography variant="body2" fontWeight={730} sx={{ mb: 1 }}>Manager coverage</Typography><ToggleButtonGroup exclusive fullWidth size="small" value={form.scopeType} onChange={(_, value) => value && setForm(previous => ({ ...previous, scopeType: value, managedStates: value === 'all' ? [] : previous.managedStates }))}><ToggleButton value="all"><PublicRounded fontSize="small" sx={{ mr: 1 }} />All states</ToggleButton><ToggleButton value="states"><LockPersonRounded fontSize="small" sx={{ mr: 1 }} />Selected states</ToggleButton></ToggleButtonGroup>{form.scopeType === 'states' && <Autocomplete multiple options={metadata.states} value={form.managedStates} onChange={(_, value) => setForm(previous => ({ ...previous, managedStates: value }))} sx={{ mt: 2 }} renderInput={params => <TextField {...params} label="Assigned states" placeholder="Choose states" />} />}</Paper>}
            </Box>
            <Divider />
            <Box><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ mb: 1.5 }}><Box><Typography fontWeight={750}>Page permissions</Typography><Typography variant="body2" color="text.secondary">{permissionCount} of {metadata.pages.length} pages enabled</Typography></Box><Button size="small" startIcon={<RefreshRounded />} onClick={() => setForm(previous => ({ ...previous, permissions: [...(metadata.rolePresets[previous.role] || [])] }))}>Restore role preset</Button></Stack>
              {form.role === 'super_admin' ? <Alert severity="info">Super administrators always have full access to every page and action.</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.25 }}>{metadata.pages.map(page => <Paper key={page.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Stack direction="row" alignItems="center" spacing={1.25}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" fontWeight={730}>{page.label}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{page.description}</Typography></Box><ToggleButtonGroup exclusive size="small" value={pageAccess(page)} onChange={(_, value) => value && setPageAccess(page, value)}><ToggleButton value="none">Off</ToggleButton><ToggleButton value="view">View</ToggleButton>{page.permissions.length > 1 && <ToggleButton value="manage">Manage</ToggleButton>}</ToggleButtonGroup></Stack></Paper>)}</Box>}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2 }}><Button onClick={closeEditor}>Cancel</Button><Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <ShieldOutlined />}>{editor ? 'Save changes' : 'Create user'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteUser)} onClose={() => !saving && setDeleteUser(null)} fullWidth maxWidth="xs"><DialogTitle>Delete admin user?</DialogTitle><DialogContent><Typography>Delete <strong>{deleteUser?.fullName || deleteUser?.username}</strong>? Their access ends immediately. Historical payment and audit records will be preserved.</Typography></DialogContent><DialogActions><Button onClick={() => setDeleteUser(null)}>Cancel</Button><Button variant="contained" color="error" onClick={remove} disabled={saving}>Delete user</Button></DialogActions></Dialog>
      <Snackbar open={notice.open} autoHideDuration={5000} onClose={() => setNotice(previous => ({ ...previous, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity={notice.severity} onClose={() => setNotice(previous => ({ ...previous, open: false }))} variant="filled">{notice.message}</Alert></Snackbar>
    </Stack>
  );
}

export default AdminUsers;
