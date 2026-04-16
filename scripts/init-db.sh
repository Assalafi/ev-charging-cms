#!/bin/bash

# Database connection parameters
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-ev_cms_db}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

echo "Initializing database $DB_NAME..."

# Check if psql command is available
if ! command -v psql &> /dev/null; then
    echo "Error: PostgreSQL client (psql) is not installed or not in PATH"
    exit 1
fi

# Create database if it doesn't exist
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $DB_NAME;" || echo "Database already exists, continuing..."

# Run initialization script
psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$(dirname "$0")/../database/init.sql"

echo "Database initialization completed successfully."
