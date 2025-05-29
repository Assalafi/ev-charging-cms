module.exports = {
    // Web Dashboard Configuration
    dashboard: require('./dashboard').dashboard,

    // Application
    app: {
        name: 'eRide EV Charging',
        version: '1.0.0',
    },

    // Server Configuration
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost',
        baseUrl: process.env.BACKEND_URL || 'http://localhost:3000',
        backend: {
            apiPrefix: '/api',
            baseUrl: process.env.BACKEND_URL || 'http://localhost:3000'
        },
        frontend: {
            port: 3001,
            host: 'localhost',
            baseUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
        },
        websocket: {
            port: process.env.OCPP_SERVER_PORT || 8080,
            path: process.env.OCPP_SERVER_PATH || '/ocpp',
            host: process.env.OCPP_SERVER_HOST || 'localhost',
        },
    },

    // Database Configuration
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        name: process.env.DB_NAME || 'ev_charging_cms',
        user: process.env.DB_USER || 'abubakar',
        password: process.env.DB_PASSWORD || '',
        dialect: 'postgres',
        logging: false,
    },

    // Security Configuration
    security: {
        jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
        jwtExpiration: '24h',
        bcryptSaltRounds: 10,
        // Development testing settings
        devMockToken: process.env.NODE_ENV === 'development' ? 'dev-mock-token-for-testing' : null,
        devMockUser: process.env.NODE_ENV === 'development' ? {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
            name: 'Development Admin'
        } : null,
        // Password requirements
        passwordPolicy: {
            minLength: 8,
            requireUppercase: true,
            requireLowercase: true,
            requireNumbers: true,
            requireSpecialChars: true
        },
        // Session settings
        session: {
            cookieSecret: process.env.COOKIE_SECRET || 'session-secret-key',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true
        },
        // CORS settings
        cors: {
            allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
            allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['Content-Range', 'X-Content-Range'],
            credentials: true,
            maxAge: 86400 // 24 hours
        }
    },

    // OCPP Configuration
    ocpp: {
        version: '1.6',
        supportedVersions: ['ocpp1.6', 'ocpp1.5', 'ocpp2.0.1'],
        heartbeatInterval: 300, // 5 minutes
        meterValueSampleInterval: 60, // 1 minute
        defaultConnectorTimeout: 180, // 3 minutes
        maxPayloadSize: 5 * 1024 * 1024, // 5MB
        messageTimeout: 30000, // 30 seconds
        reconnectInterval: 5000, // 5 seconds
        maxRetries: 3,
        server: {
            host: process.env.OCPP_HOST || 'localhost',
            port: process.env.OCPP_PORT || 8080,
            path: '/ocpp',
        },
        protocols: {
            v16: {
                version: '1.6',
                features: ['Heartbeat', 'MeterValues', 'RemoteStartTransaction', 'RemoteStopTransaction', 'Reset', 'StatusNotification', 'FirmwareUpdate']
            },
            v15: {
                version: '1.5',
                features: ['Heartbeat', 'MeterValues', 'StartTransaction', 'StopTransaction', 'StatusNotification']
            },
            v201: {
                version: '2.0.1',
                features: ['Heartbeat', 'MeterValues', 'TransactionEvent', 'StatusNotification', 'BootNotification', 'Authorize']
            }
        }
    },

    // Firmware Management
    firmware: {
        uploadPath: './uploads/firmware',
        maxSize: 100 * 1024 * 1024, // 100MB
        allowedTypes: ['.bin', '.zip'],
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: 'combined',
        directory: './logs',
    },

    // Monitoring
    monitoring: {
        enabled: true,
        interval: 60000, // 1 minute
    },

    // Rate Limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
    },


}