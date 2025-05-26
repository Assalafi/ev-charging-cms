# EV Charging Station CMS

A comprehensive Content Management System for EV Charging Stations with real-time monitoring, OCPP support, and advanced station management features.

## Features

- **Real-time station monitoring** using MQTT and WebSockets
- **OCPP 1.6** compliant charging station management
- **User authentication** with role-based access control
- **Transaction tracking** with detailed metrics and reporting
- **Firmware management** system for remote updates
- **Diagnostic logs** collection and analysis
- **Responsive UI** built with React and Material UI

## Architecture

- **Backend**: Node.js with Express, Sequelize ORM
- **Frontend**: React with Material UI
- **Database**: PostgreSQL with TimescaleDB for time-series data
- **Message Broker**: EMQX MQTT broker
- **Authentication**: JWT-based authentication

## Installation

### Prerequisites
- Node.js (v14+)
- npm or yarn
- PostgreSQL database
- MQTT broker (like EMQX)

### Backend Setup
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start the server
npm start
```

### Frontend Setup
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the development server
npm start
```

## Usage

1. Access the frontend at http://localhost:3001
2. API server runs at http://localhost:3000
3. Default admin credentials: admin@example.com / password (change in production)

## License

MIT

## Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- PostgreSQL (v12 or later) with TimescaleDB extension
- EMQX MQTT Broker
- Docker and Docker Compose (recommended)

## Quick Start

1. **Clone the repository**

2. **Run the setup script**
   ```
   ./scripts/setup.sh
   ```
   This will:
   - Install backend and frontend dependencies
   - Initialize the database
   - Create necessary directories
   - Check if Docker services are running

3. **Start the services**
   ```
   # Using Docker Compose (recommended)
   docker-compose up -d
   
   # Or start each service individually
   # Start the backend
   cd backend && npm start
   
   # Start the frontend
   cd frontend && npm start
   ```

4. **Access the application**
   - Frontend: http://localhost:3001
   - Backend API: http://localhost:3000/api
   - MQTT WebSocket: ws://localhost:8083/mqtt

## Default Login

- Username: `admin`
- Password: `admin123`

## Database Structure

The EV Charging CMS uses a PostgreSQL database with the following core tables:

- `users`: User accounts with authentication data
- `charging_stations`: Charging station information
  - Primary identifier: `chargePointId` (string)
- `transactions`: Charging session records
- `ocpp_messages`: OCPP communication logs
  - Status field: Enum with values ['Sent', 'Received', 'Failed', 'Pending', 'Timeout']
- `meter_values`: Time-series data for energy measurements
- `firmware`: Firmware version management
- `firmware_updates`: Firmware update tracking
- `diagnostic_logs`: Diagnostic log management

## Main Components

### Frontend

- **Dashboard**: Overview of system status and key metrics
- **Stations**: Charging station management and monitoring
- **Transactions**: Transaction history and details
- **Firmware Management**: Remote firmware update capabilities
- **Diagnostic Tools**: Request and analyze diagnostic logs
- **Settings**: System configuration

### Backend

- **Authentication API**: User login and session management
- **Stations API**: Charging station data and control
- **Transactions API**: Transaction history and reporting
- **OCPP Server**: WebSocket server for OCPP communication
- **MQTT Client**: Broker integration for real-time updates

## Development

### Directory Structure

```
ev-cms-new/
├── backend/             # Node.js backend
│   ├── src/             # Source code
│   ├── uploads/         # Storage for firmware and logs
│   └── ...
├── frontend/            # React frontend
│   ├── src/             # Source code
│   │   ├── components/  # UI components
│   │   ├── contexts/    # React contexts (auth, MQTT)
│   │   ├── pages/       # Page components
│   │   └── services/    # API services
│   └── ...
├── database/            # Database scripts
│   └── init.sql         # Database initialization
├── scripts/             # Utility scripts
│   ├── init-db.sh       # Database initialization script
│   └── setup.sh         # Project setup script
└── docker-compose.yml   # Docker Compose configuration
```

## License

[MIT](LICENSE)
