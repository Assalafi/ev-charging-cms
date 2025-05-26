import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  Button,
  IconButton,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  CardHeader,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
  MenuItem,
  Pagination,
  Stack,
  FormControl,
  InputLabel,
  Select
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  Sync as ResetIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Send as SendIcon,
  PowerSettingsNew as PowerIcon,
  BatteryChargingFull as ChargingIcon,
  BatteryChargingFull as BatteryChargingFullIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../../services/api';
import { useMQTT } from '../../contexts/MQTTContext';
import LocationSelector from '../../components/LocationSelector';
import stationService from '../../services/stationService';
import RemoteCommandPanel from '../../components/RemoteCommandPanel';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`station-tabpanel-${index}`}
      aria-labelledby={`station-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

