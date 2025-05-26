-- Initialize TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create charging_stations table
CREATE TABLE IF NOT EXISTS charging_stations (
  id SERIAL PRIMARY KEY,
  "chargePointId" VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  model VARCHAR(255),
  vendor VARCHAR(255),
  firmware_version VARCHAR(255),
  iccid VARCHAR(255),
  imsi VARCHAR(255),
  meter_type VARCHAR(255),
  meter_serial_number VARCHAR(255),
  location VARCHAR(255),
  location_latitude DECIMAL(10, 8),
  location_longitude DECIMAL(11, 8),
  status VARCHAR(50) DEFAULT 'Unavailable',
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  is_connected BOOLEAN DEFAULT FALSE,
  current_transaction INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  "transactionId" INTEGER NOT NULL UNIQUE,
  "chargePointId" VARCHAR(255) NOT NULL REFERENCES charging_stations("chargePointId") ON DELETE CASCADE,
  "connectorId" INTEGER NOT NULL,
  id_tag VARCHAR(255),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  stop_time TIMESTAMP WITH TIME ZONE,
  meter_start INTEGER NOT NULL,
  meter_stop INTEGER,
  reason VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'InProgress',
  energy_delivered DECIMAL(10, 2) DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create ocpp_messages table with enum types
CREATE TYPE ocpp_message_type AS ENUM (
  'Authorize', 'BootNotification', 'DataTransfer', 'Heartbeat', 'MeterValues',
  'StartTransaction', 'StatusNotification', 'StopTransaction', 'ClearChargingProfile',
  'GetCompositeSchedule', 'SetChargingProfile', 'TriggerMessage', 'GetDiagnostics',
  'DiagnosticsStatusNotification', 'FirmwareStatusNotification', 'UpdateFirmware',
  'GetLocalListVersion', 'SendLocalList', 'CancelReservation', 'ReserveNow',
  'ChangeAvailability', 'ChangeConfiguration', 'ClearCache', 'GetConfiguration',
  'Reset', 'UnlockConnector', 'Error', 'InternalError'
);

CREATE TYPE ocpp_message_status AS ENUM (
  'Sent', 'Received', 'Failed', 'Pending', 'Timeout'
);

CREATE TABLE IF NOT EXISTS ocpp_messages (
  id SERIAL PRIMARY KEY,
  "chargePointId" VARCHAR(255) NOT NULL REFERENCES charging_stations("chargePointId") ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL,
  message_type ocpp_message_type NOT NULL,
  action VARCHAR(255),
  payload JSONB,
  status ocpp_message_status NOT NULL DEFAULT 'Pending',
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create meter_values table (hypertable for time-series data)
CREATE TABLE IF NOT EXISTS meter_values (
  id SERIAL PRIMARY KEY,
  "transactionId" INTEGER REFERENCES transactions("transactionId") ON DELETE CASCADE,
  "chargePointId" VARCHAR(255) NOT NULL REFERENCES charging_stations("chargePointId") ON DELETE CASCADE,
  "connectorId" INTEGER NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  value JSONB NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Convert meter_values to hypertable
SELECT create_hypertable('meter_values', 'timestamp', if_not_exists => TRUE);

-- Create firmware table
CREATE TABLE IF NOT EXISTS firmware (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  url VARCHAR(512) NOT NULL,
  size INTEGER,
  release_notes TEXT,
  compatible_models VARCHAR(255)[],
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create firmware_updates table
CREATE TABLE IF NOT EXISTS firmware_updates (
  id SERIAL PRIMARY KEY,
  firmware_id INTEGER REFERENCES firmware(id) ON DELETE CASCADE,
  "chargePointId" VARCHAR(255) NOT NULL REFERENCES charging_stations("chargePointId") ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  scheduled_time TIMESTAMP WITH TIME ZONE,
  completed_time TIMESTAMP WITH TIME ZONE,
  download_url VARCHAR(512),
  retries INTEGER DEFAULT 0,
  message TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create diagnostic_logs table
CREATE TABLE IF NOT EXISTS diagnostic_logs (
  id SERIAL PRIMARY KEY,
  "chargePointId" VARCHAR(255) NOT NULL REFERENCES charging_stations("chargePointId") ON DELETE CASCADE,
  log_type VARCHAR(50) NOT NULL DEFAULT 'Diagnostics',
  filename VARCHAR(255),
  file_path VARCHAR(512),
  file_size INTEGER,
  status VARCHAR(50) NOT NULL DEFAULT 'Pending',
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  key VARCHAR(255) NOT NULL,
  value JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(category, key)
);

-- Create admin user for initial login
INSERT INTO users (username, email, password, role, "createdAt", "updatedAt")
VALUES (
  'admin',
  'admin@example.com',
  -- Password: admin123 (bcrypt hashed)
  '$2b$10$mN.6cOtpkf9zs1XVZc8/suQ1McM8hFu88QuXfP9J/Z9X4cfEwvKYK',
  'admin',
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Create test charging stations
INSERT INTO charging_stations ("chargePointId", name, model, vendor, status, "createdAt", "updatedAt")
VALUES 
  ('CP001', 'Charging Station 001', 'EV100', 'EVMaker', 'Available', NOW(), NOW()),
  ('CP002', 'Charging Station 002', 'EV100', 'EVMaker', 'Available', NOW(), NOW()),
  ('CP003', 'Charging Station 003', 'EV200', 'EVTech', 'Unavailable', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Insert default settings
INSERT INTO settings (category, key, value)
VALUES
  ('general', 'companyName', '"EV Charging Company"'),
  ('general', 'defaultCurrency', '"USD"'),
  ('general', 'defaultLanguage', '"en"'),
  ('ocpp', 'heartbeatInterval', '60'),
  ('ocpp', 'meterValueInterval', '60'),
  ('notifications', 'emailNotifications', 'true')
ON CONFLICT DO NOTHING;
