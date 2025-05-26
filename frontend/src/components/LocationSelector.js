import React from 'react';
import { 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  TextField
} from '@mui/material';
import nigerianStates from '../utils/nigerian-states';

/**
 * Location selector component with Nigerian states
 * Can be used in forms where location selection is needed
 */
const LocationSelector = ({ value, onChange, error, helperText }) => {
  // Parse the location string if it exists
  const parsedLocation = value ? (() => {
    try {
      // Try to parse as JSON if it's a complex location object
      const parsed = JSON.parse(value);
      return {
        state: parsed.state || '',
        city: parsed.city || '',
        address: parsed.address || ''
      };
    } catch (e) {
      // If it's just a string, use it as address
      return {
        state: '',
        city: '',
        address: value
      };
    }
  })() : { state: '', city: '', address: '' };

  const handleChange = (field) => (event) => {
    const newLocation = {
      ...parsedLocation,
      [field]: event.target.value
    };
    
    // Convert to JSON string for storage
    onChange(JSON.stringify(newLocation));
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={4}>
        <FormControl fullWidth margin="normal">
          <InputLabel>State</InputLabel>
          <Select
            value={parsedLocation.state}
            onChange={handleChange('state')}
            label="State"
            error={!!error}
          >
            <MenuItem value="">
              <em>Select a state</em>
            </MenuItem>
            {nigerianStates.map(state => (
              <MenuItem key={state} value={state}>{state}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          label="City"
          margin="normal"
          value={parsedLocation.city}
          onChange={handleChange('city')}
          error={!!error}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          label="Address"
          margin="normal"
          value={parsedLocation.address}
          onChange={handleChange('address')}
          error={!!error}
          helperText={helperText}
        />
      </Grid>
    </Grid>
  );
};

export default LocationSelector;
