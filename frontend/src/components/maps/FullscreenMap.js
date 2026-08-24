import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton } from '@mui/material';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { MapContainer, useMap } from 'react-leaflet';

const DEFAULT_CENTER = [9.082, 8.6753];

export function MapBounds({ locations = [], focusLocation = null, defaultCenter = DEFAULT_CENTER, defaultZoom = 6 }) {
  const map = useMap();
  const validLocations = useMemo(() => locations.filter(location =>
    Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
  ), [locations]);
  const signature = validLocations.map(location => `${location.id}:${location.latitude}:${location.longitude}`).join('|');
  const focusLatitude = Number(focusLocation?.latitude);
  const focusLongitude = Number(focusLocation?.longitude);
  const focusSignature = Number.isFinite(focusLatitude) && Number.isFinite(focusLongitude)
    ? `${focusLocation?.id || ''}:${focusLatitude}:${focusLongitude}`
    : '';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (Number.isFinite(focusLatitude) && Number.isFinite(focusLongitude)) {
        map.flyTo([focusLatitude, focusLongitude], Math.max(map.getZoom(), 13), { duration: 0.6 });
        return;
      }
      if (validLocations.length > 1) {
        map.fitBounds(validLocations.map(location => [Number(location.latitude), Number(location.longitude)]), {
          padding: [48, 48],
          maxZoom: 13
        });
      } else if (validLocations.length === 1) {
        map.setView([Number(validLocations[0].latitude), Number(validLocations[0].longitude)], 12);
      } else {
        map.setView(defaultCenter, defaultZoom);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [map, signature, focusSignature, defaultCenter, defaultZoom, focusLatitude, focusLongitude, validLocations]);

  return null;
}

export default function FullscreenMap({
  center = DEFAULT_CENTER,
  zoom = 6,
  height = 600,
  children,
  overlay,
  ariaLabel = 'Charging network map'
}) {
  const frameRef = useRef(null);
  const mapRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
      window.setTimeout(() => mapRef.current?.invalidateSize({ animate: false }), 80);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!frameRef.current) return;
    if (document.fullscreenElement === frameRef.current) {
      await document.exitFullscreen();
    } else {
      await frameRef.current.requestFullscreen();
    }
  };

  return (
    <Box
      ref={frameRef}
      aria-label={ariaLabel}
      sx={{
        position: 'relative',
        height,
        width: '100%',
        overflow: 'hidden',
        bgcolor: 'grey.100',
        '&:fullscreen': { height: '100dvh', width: '100vw', borderRadius: 0 }
      }}
    >
      <MapContainer ref={mapRef} center={center} zoom={zoom} style={{ height: '100%', width: '100%' }}>
        {children}
      </MapContainer>
      {overlay}
      <IconButton
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full-screen map' : 'Open full-screen map'}
        title={isFullscreen ? 'Exit full screen' : 'View map full screen'}
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1300,
          bgcolor: 'background.paper',
          boxShadow: 3,
          '&:hover': { bgcolor: 'background.paper' }
        }}
      >
        {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
      </IconButton>
    </Box>
  );
}
