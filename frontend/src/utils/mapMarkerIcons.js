import L from 'leaflet';

const COLORS = {
  online: '#2e7d32',
  partial: '#ed6c02',
  offline: '#d32f2f',
  empty: '#757575',
  partner: '#7b1fa2',
  main: '#1976d2'
};

export function locationMarkerStatus(location) {
  const total = Number(location.stationCount || 0);
  const online = Number(location.onlineStations || 0);
  if (!total) return 'empty';
  if (online === total) return 'online';
  if (online > 0) return 'partial';
  return 'offline';
}

export function evChargingMarker(location, ownerType) {
  const background = COLORS[locationMarkerStatus(location)];
  const border = ownerType ? COLORS[ownerType] : '#ffffff';

  return L.divIcon({
    className: '',
    iconSize: [44, 50],
    iconAnchor: [22, 48],
    popupAnchor: [0, -44],
    html: `
      <div aria-label="EV charging location" style="
        position:relative;width:40px;height:40px;border-radius:50% 50% 50% 10%;
        transform:rotate(-45deg);background:${background};border:3px solid ${border};
        box-shadow:0 3px 9px rgba(0,0,0,.35);display:grid;place-items:center;">
        <svg viewBox="0 0 24 24" width="25" height="25" aria-hidden="true"
          style="transform:rotate(45deg)">
          <path fill="#fff" d="M6 2h9a2 2 0 0 1 2 2v5.2l2.4 2.4c.4.4.6.9.6 1.4v5a1 1 0 0 0 2 0v-6h-2V9.5l-2-2V5l4 4v9a3 3 0 0 1-6 0V4H7v16h8v2H4v-2h1V3a1 1 0 0 1 1-1Zm2 3v6h6V5H8Zm3.8 1L9.2 9h1.9l-.5 2L13.4 8h-1.9l.3-2Z"/>
        </svg>
      </div>`
  });
}
