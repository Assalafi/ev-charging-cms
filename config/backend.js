const config = require('./index');

module.exports = {
    // Backend Server Configuration
    backend: {
        // HTTP Server
        http: {
            port: process.env.PORT || config.server.port,
            host: process.env.HOST || config.server.host,
            baseUrl: config.server.baseUrl,
            apiPrefix: config.server.backend.apiPrefix,
        },
        
        // WebSocket Server for OCPP
        websocket: {
            port: process.env.WS_PORT || config.server.websocket.port,
            path: config.server.websocket.path,
            host: process.env.WS_HOST || config.server.websocket.host,
        },
        
        // Database
        database: {
            ...config.database,
            sync: {
                alter: false, // Disable schema alteration by default
            },
        },
        
        // MQTT Configuration
        mqtt: {
    enabled: process.env.MQTT_ENABLED !== 'false',
    broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
    options: {
        username: process.env.MQTT_USERNAME || 'ev_cms_admin',
        password: process.env.MQTT_PASSWORD || 'Assalafi@139',
        clientId: 'ev-cms-backend_prod',
        reconnectPeriod: 5000,
        keepalive: 60
    },
},
        
        // Static Files
        static: {
            publicDir: 'public',
            uploadDir: 'uploads',
        },
        
        // Security
        security: {
            ...config.security,
        },
        
        // Logging
        logging: {
            ...config.logging,
        },
        
        // OCPP Settings
        ocpp: {
            ...config.ocpp,
        },
        
        // Firmware Management
        firmware: {
            ...config.firmware,
        },
    },
};
