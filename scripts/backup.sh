#!/bin/bash

# Configuration
BACKUP_DIR="/var/backups/ev-charging"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="ev_charging_backup_${TIMESTAMP}.sql"
KEEP_DAYS=30

# Load environment variables
if [ -f "/var/www/evcharging/.env" ]; then
    export $(grep -v '^#' /var/www/evcharging/.env | xargs)
fi

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create database dump
PGPASSWORD="${DB_PASSWORD}" pg_dump -h ${DB_HOST:-localhost} -U ${DB_USER:-assalafi} -d ${DB_NAME:-ev_charging_prod} > "${BACKUP_DIR}/${FILENAME}"

# Compress the backup
gzip -f "${BACKUP_DIR}/${FILENAME}"

# Remove old backups
find "$BACKUP_DIR" -name "ev_charging_backup_*.sql.gz" -type f -mtime +$KEEP_DAYS -delete

# Log the backup
logger "EV Charging DB backup completed: ${BACKUP_DIR}/${FILENAME}.gz"

echo "Backup created: ${BACKUP_DIR}/${FILENAME}.gz"
exit 0
