import React, { useState, useEffect } from 'react';
import { 
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box
} from '@mui/material';
import api from '../services/api';

/**
 * Location selector component — picks from admin-created locations.
 * The `value` prop is the location JSON string stored on the station.
 * The `onChange` callback receives the new JSON string and also passes locationId.
 * `onLocationIdChange` is an optional callback to also set the locationId FK.
 */
const LocationSelector = ({ value, onChange, onLocationIdChange, error, helperText }) => {
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await api.get('/admin/locations');
        setLocations(response.data.locations || []);
      } catch (err) {
        console.error('Failed to load locations', err);
      }
    };
    fetchLocations();
  }, []);

  // Try to match current value to a location
  useEffect(() => {
    if (!value || locations.length === 0) return;
    try {
      const parsed = JSON.parse(value);
      const match = locations.find(
        l => l.state === parsed.state && l.city === parsed.city && l.address === (parsed.address || '')
      );
      if (match) setSelectedId(match.id);
    } catch {
      // ignore parse errors
    }
  }, [value, locations]);

  const handleSelect = (event) => {
    const id = event.target.value;
    setSelectedId(id);

    if (!id) {
      onChange('');
      if (onLocationIdChange) onLocationIdChange(null);
      return;
    }

    const loc = locations.find(l => l.id === id);
    if (loc) {
      const locationJson = JSON.stringify({ state: loc.state, city: loc.city, address: loc.address || '' });
      onChange(locationJson);
      if (onLocationIdChange) onLocationIdChange(loc.id);
    }
  };

  return (
    <Box>
      <FormControl fullWidth margin="normal" error={!!error}>
        <InputLabel>Location</InputLabel>
        <Select
          value={selectedId}
          onChange={handleSelect}
          label="Location"
        >
          <MenuItem value="">
            <em>No location</em>
          </MenuItem>
          {locations.map(loc => (
            <MenuItem key={loc.id} value={loc.id}>
              <Box>
                <Typography variant="body2" fontWeight={600}>{loc.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {[loc.address, loc.city, loc.state].filter(Boolean).join(', ')}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Select>
        {helperText && (
          <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mt: 0.5 }}>
            {helperText}
          </Typography>
        )}
      </FormControl>
      {locations.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No locations created yet. Go to Locations page to create one.
        </Typography>
      )}
    </Box>
  );
};

export default LocationSelector;
