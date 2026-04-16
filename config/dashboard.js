exports.dashboard = {
    port: process.env.DASHBOARD_PORT || 3002,
    host: process.env.DASHBOARD_HOST || '0.0.0.0',
    baseUrl: process.env.DASHBOARD_URL || 'https://evcharging.eride.ng',
    wsPath: '/ws',
    updateInterval: 5000, // WebSocket update interval in ms
    staticDir: 'public',
    routes: {
        stations: '/api/stations',
        stationDetail: '/api/stations/:id',
        connectors: '/api/stations/:id/connectors',
        transactions: '/api/stations/:id/transactions',
        startTransaction: '/api/stations/:id/remote-start',
        stopTransaction: '/api/stations/:id/remote-stop',
        ocppStatus: '/api/ocpp/status'
    },
    api: {
        baseUrl: process.env.BACKEND_URL || 'https://evcharging.eride.ng',
        prefix: '/api',
        endpoints: {
            stations: '/stations/diagnostic',
            stationDetail: '/stations/diagnostic/:id',
            connectors: '/stations/diagnostic/:id/connectors',
            transactions: '/stations/diagnostic/:id/transactions',
            startTransaction: '/stations/diagnostic/:id/remote-start',
            stopTransaction: '/stations/diagnostic/:id/remote-stop',
            ocppStatus: '/ocpp/status'
        }
    }
};
