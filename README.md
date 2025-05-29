# EV Charging CMS

A comprehensive Content Management System for Electric Vehicle Charging Stations with OCPP support.

## Features

- Real-time charging station monitoring
- OCPP 1.6 protocol support
- Firmware management system
- Diagnostic logs system
- User authentication and authorization
- Budget management and tracking
- Responsive web dashboard

## Project Structure

```
/
├── backend/           # Node.js backend application
├── frontend/          # React frontend application
├── config/            # Centralized configuration
│   ├── default.js     # Default configuration
│   ├── development.js # Development overrides
│   ├── production.js  # Production overrides
│   └── index.js      # Configuration loader
├── database/          # Database scripts and migrations
├── scripts/          # Utility scripts
└── docker/           # Docker configuration
```

## Configuration

The project uses a centralized configuration system with environment-specific overrides:

### Backend Configuration

1. Copy the appropriate environment file:
   ```bash
   cp backend/.env.production backend/.env
   ```

2. Update the environment variables in `.env`:
   ```env
   NODE_ENV=production
   BACKEND_URL=https://api.ev-cms.com
   DB_HOST=your-db-host
   DB_PORT=5432
   DB_NAME=ev_charging_cms
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   JWT_SECRET=your-jwt-secret
   LOG_LEVEL=warn
   ```

### Frontend Configuration

1. Copy the appropriate environment file:
   ```bash
   cp frontend/.env.production frontend/.env
   ```

2. Update the environment variables in `.env`:
   ```env
   REACT_APP_NODE_ENV=production
   REACT_APP_API_URL=https://api.ev-cms.com/api
   REACT_APP_WS_URL=wss://api.ev-cms.com/ocpp
   ```

## Development Setup

1. Install dependencies:
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. Start development servers:
   ```bash
   # Backend (from backend directory)
   npm run dev

   # Frontend (from frontend directory)
   npm start
   ```

## Production Deployment

1. Ensure all configuration files are properly set up:
   - `config/production.js`
   - `backend/.env.production`
   - `frontend/.env.production`

2. Run the deployment script:
   ```bash
   sudo ./deploy.sh
   ```

   The script will:
   - Update code from repository
   - Set up environment files
   - Install dependencies
   - Build the frontend
   - Configure Nginx
   - Set up SSL certificates
   - Start/restart the application

3. Verify the deployment:
   - Frontend: https://ev-cms.com
   - Backend API: https://api.ev-cms.com
   - WebSocket: wss://api.ev-cms.com/ocpp

## Database Setup

1. Install PostgreSQL and TimescaleDB extension
2. Create the database:
   ```bash
   createdb ev_charging_cms
   ```
3. Run migrations:
   ```bash
   cd backend
   NODE_ENV=production node setup-db.js
   ```

## Monitoring

The application includes built-in monitoring features:
- PM2 process monitoring
- Database query logging (in development)
- Application logs in JSON format (in production)

## Security

- All sensitive configuration is stored in environment variables
- SSL/TLS encryption for all communications
- JWT-based authentication
- Rate limiting for API endpoints
- Secure WebSocket connections for OCPP

## License

Proprietary software. All rights reserved.
