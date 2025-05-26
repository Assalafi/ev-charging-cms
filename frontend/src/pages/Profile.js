import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Avatar,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Key as KeyIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import authService from '../services/authService';

function Profile() {
  const { currentUser } = useAuth();
  
  // Profile state
  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    name: '',
    role: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Password change dialog
  const [openPasswordDialog, setOpenPasswordDialog] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  // Initialize profile with current user data
  useEffect(() => {
    if (currentUser) {
      setProfile({
        username: currentUser.username || '',
        email: currentUser.email || '',
        name: currentUser.name || '',
        role: currentUser.role || ''
      });
    }
  }, [currentUser]);
  
  // Handle edit toggle
  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (!isEditing) {
      // Reset to current values when entering edit mode
      setProfile({
        username: currentUser.username || '',
        email: currentUser.email || '',
        name: currentUser.name || '',
        role: currentUser.role || ''
      });
    }
    // Clear messages
    setError(null);
    setSuccess(null);
  };
  
  // Handle profile changes
  const handleProfileChange = (e) => {
    setProfile({
      ...profile,
      [e.target.name]: e.target.value
    });
  };
  
  // Handle profile save
  const handleProfileSave = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const result = await authService.updateProfile(profile);
      
      if (result.success) {
        setSuccess('Profile updated successfully');
        setIsEditing(false);
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to update profile');
      console.error('Profile update error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Password dialog functions
  const handleOpenPasswordDialog = () => {
    setOpenPasswordDialog(true);
    setPasswordData({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
    setPasswordError(null);
  };
  
  const handleClosePasswordDialog = () => {
    setOpenPasswordDialog(false);
  };
  
  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
  };
  
  const handlePasswordSave = async () => {
    // Validate passwords
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    
    setPasswordLoading(true);
    setPasswordError(null);
    
    try {
      const result = await authService.changePassword(
        passwordData.currentPassword,
        passwordData.newPassword
      );
      
      if (result.success) {
        setOpenPasswordDialog(false);
        setSuccess('Password changed successfully');
      } else {
        setPasswordError(result.message);
      }
    } catch (error) {
      setPasswordError('Failed to change password');
      console.error('Password change error:', error);
    } finally {
      setPasswordLoading(false);
    }
  };
  
  // Get initials for avatar
  const getInitials = () => {
    if (!currentUser) return 'U';
    
    if (currentUser.name) {
      const nameParts = currentUser.name.split(' ');
      if (nameParts.length > 1) {
        return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
      }
      return currentUser.name[0].toUpperCase();
    }
    
    return currentUser.username[0].toUpperCase();
  };
  
  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          My Profile
        </Typography>
        {isEditing ? (
          <Box>
            <Button 
              variant="outlined" 
              color="error" 
              onClick={handleEditToggle}
              sx={{ mr: 1 }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={loading ? <CircularProgress size={24} /> : <SaveIcon />}
              onClick={handleProfileSave}
              disabled={loading}
            >
              Save
            </Button>
          </Box>
        ) : (
          <Box>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<KeyIcon />}
              onClick={handleOpenPasswordDialog}
              sx={{ mr: 1 }}
            >
              Change Password
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<EditIcon />}
              onClick={handleEditToggle}
            >
              Edit Profile
            </Button>
          </Box>
        )}
      </Box>
      
      {/* Success message */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {success}
        </Alert>
      )}
      
      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      
      <Grid container spacing={3}>
        {/* User Info Card */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%', borderRadius: 2 }}>
            <CardHeader title="User Information" />
            <Divider />
            <CardContent sx={{ textAlign: 'center' }}>
              <Avatar
                sx={{
                  width: 100,
                  height: 100,
                  margin: '0 auto 20px auto',
                  bgcolor: 'primary.main',
                  fontSize: '2rem'
                }}
              >
                {getInitials()}
              </Avatar>
              <Typography variant="h5" component="div" gutterBottom>
                {currentUser?.name || currentUser?.username}
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {currentUser?.email}
              </Typography>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">
                  Role
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {currentUser?.role === 'admin' ? 'Administrator' : 'User'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  Username
                </Typography>
                <Typography variant="body2">
                  {currentUser?.username}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Profile Form */}
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 2 }}>
            <CardHeader title="Profile Details" />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Username"
                    fullWidth
                    name="username"
                    value={profile.username}
                    onChange={handleProfileChange}
                    disabled={!isEditing || loading}
                    variant={isEditing ? "outlined" : "filled"}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Email"
                    fullWidth
                    name="email"
                    type="email"
                    value={profile.email}
                    onChange={handleProfileChange}
                    disabled={!isEditing || loading}
                    variant={isEditing ? "outlined" : "filled"}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Full Name"
                    fullWidth
                    name="name"
                    value={profile.name}
                    onChange={handleProfileChange}
                    disabled={!isEditing || loading}
                    variant={isEditing ? "outlined" : "filled"}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Role"
                    fullWidth
                    name="role"
                    value={profile.role === 'admin' ? 'Administrator' : 'User'}
                    disabled={true}
                    variant="filled"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Password Change Dialog */}
      <Dialog open={openPasswordDialog} onClose={handleClosePasswordDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Change Password
          <IconButton
            aria-label="close"
            onClick={handleClosePasswordDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {passwordError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {passwordError}
            </Alert>
          )}
          <TextField
            margin="dense"
            label="Current Password"
            type="password"
            fullWidth
            name="currentPassword"
            value={passwordData.currentPassword}
            onChange={handlePasswordChange}
            disabled={passwordLoading}
            required
          />
          <TextField
            margin="dense"
            label="New Password"
            type="password"
            fullWidth
            name="newPassword"
            value={passwordData.newPassword}
            onChange={handlePasswordChange}
            disabled={passwordLoading}
            required
            helperText="Password must be at least 6 characters"
          />
          <TextField
            margin="dense"
            label="Confirm New Password"
            type="password"
            fullWidth
            name="confirmPassword"
            value={passwordData.confirmPassword}
            onChange={handlePasswordChange}
            disabled={passwordLoading}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePasswordDialog} disabled={passwordLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handlePasswordSave} 
            color="primary"
            disabled={passwordLoading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
            startIcon={passwordLoading ? <CircularProgress size={24} /> : null}
          >
            Change Password
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Profile;
