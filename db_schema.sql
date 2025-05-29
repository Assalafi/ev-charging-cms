-- EV Charging CMS Database Schema

-- Charging Stations table
CREATE TABLE charging_stations (
    id SERIAL PRIMARY KEY,
    charge_point_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255),
    vendor VARCHAR(255),
    firmware_version VARCHAR(255),
    ip_address VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    last_heartbeat TIMESTAMP,
    status VARCHAR(50) DEFAULT 'UNAVAILABLE',
    ocpp_version VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Connectors table
CREATE TABLE connectors (
    id SERIAL PRIMARY KEY,
    station_id INTEGER REFERENCES charging_stations(id) ON DELETE CASCADE,
    connector_id INTEGER NOT NULL,
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'UNAVAILABLE',
    power_kw DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(station_id, connector_id)
);

-- Transactions table
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(255) UNIQUE,
    station_id INTEGER REFERENCES charging_stations(id),
    connector_id INTEGER NOT NULL,
    id_tag VARCHAR(255),
    start_time TIMESTAMP NOT NULL,
    stop_time TIMESTAMP,
    start_meter_value DECIMAL(10, 2),
    stop_meter_value DECIMAL(10, 2),
    total_energy_kwh DECIMAL(10, 2),
    total_cost DECIMAL(10, 2),
    status VARCHAR(50) DEFAULT 'IN_PROGRESS',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Meter Values table
CREATE TABLE meter_values (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    value DECIMAL(10, 2) NOT NULL,
    value_type VARCHAR(50) DEFAULT 'Energy.Active.Import.Register',
    unit VARCHAR(10) DEFAULT 'kWh',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Settings table
CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
('pricing_per_kwh', '250', 'Price per kWh in Naira'),
('company_name', 'E-Ride', 'Company name for the EV charging network'),
('central_system_url', 'ws://localhost:9220', 'OCPP Central System WebSocket URL');

-- Insert default admin user (password: admin123)
INSERT INTO users (username, password, email, first_name, last_name, role)
VALUES ('admin', '$2b$10$1JxS3LO6MVaZ0Iy/HPY2.OrVQHZLXRW0XmrX8FTfReqUJtk.x7OXe', 'admin@example.com', 'Admin', 'User', 'admin');
