export const stationLiveSignal = (station, stationStatus = {}) => (
  station?.chargePointId ? stationStatus?.[station.chargePointId] : null
);

export const isStationConnected = (station, stationStatus = {}) => (
  Boolean(stationLiveSignal(station, stationStatus)) || Boolean(station?.isConnected)
);

export const stationDisplayStatus = (station, stationStatus = {}) => {
  const live = stationLiveSignal(station, stationStatus);
  return (typeof live === 'object' ? live?.status : live) || station?.status || 'Unknown';
};
