#!/bin/bash

# Application deployment script for EV Charging CMS
# This script handles the deployment process for both backend and frontend

set -e  # Exit on error

# Configuration
APP_NAME="EV Charging CMS"
DEPLOY_PATH="/var/www/evcharging"
DOMAIN="evcharging.eride.ng"
NODE_VERSION="16"  # Specify your Node.js version
PM2_APP_NAME="ev-charging-cms"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f "$DEPLOY_PATH/.env" ]; then
    export $(grep -v '^#' $DEPLOY_PATH/.env | xargs)
fi

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
    exit 1
}

# Check if running as root
if [ "$(id -u)" != "0" ]; then
    log_error "This script must be run as root"
fi

# Set up logging
LOG_FILE="$DEPLOY_PATH/logs/deploy-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$DEPLOY_PATH/logs"
exec > >(tee -a "$LOG_FILE") 2>&1

log_info "Starting deployment process for $APP_NAME..."
log_info "Logging to $LOG_FILE"

# Navigate to application directory
cd $DEPLOY_PATH || log_error "Failed to change to $DEPLOY_PATH"

# Check for git repository
if [ ! -d ".git" ]; then
    log_error "Not a git repository. Please clone the repository first."
fi

# Pull latest changes
log_info "Updating code from repository..."
git fetch origin
git reset --hard origin/main

# Install/update Node.js using NVM if not already installed
if ! command -v nvm &> /dev/null; then
    log_info "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

# Load NVM
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install $NODE_VERSION
nvm use $NODE_VERSION

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
fi

# Copy production environment files
log_info "Setting up environment files..."
[ -f "$DEPLOY_PATH/config/production.js" ] && cp "$DEPLOY_PATH/config/production.js" "$DEPLOY_PATH/config/current.js"
[ -f "$DEPLOY_PATH/backend/.env.production" ] && cp "$DEPLOY_PATH/backend/.env.production" "$DEPLOY_PATH/backend/.env"
[ -f "$DEPLOY_PATH/frontend/.env.production" ] && cp "$DEPLOY_PATH/frontend/.env.production" "$DEPLOY_PATH/frontend/.env"

# Set permissions
chmod 600 "$DEPLOY_PATH/backend/.env" "$DEPLOY_PATH/frontend/.env" "$DEPLOY_PATH/config/current.js"

# Backend deployment
log_info "Deploying backend..."
cd "$DEPLOY_PATH/backend" || log_error "Failed to change to backend directory"

# Install backend dependencies
log_info "Installing backend dependencies..."
npm install --production --no-optional --prefer-offline

# Run database migrations if any
if [ -f "node_modules/.bin/sequelize" ]; then
    log_info "Running database migrations..."
    npx sequelize db:migrate --env production || log_warn "Database migration failed"
fi

# Build backend if needed
if [ -f "package.json" ] && grep -q "build" package.json; then
    log_info "Building backend..."
    npm run build || log_warn "Backend build failed"
fi

# Start or restart the backend service using PM2
log_info "Starting/Restarting backend service..."
if pm2 show $PM2_APP_NAME-backend &>/dev/null; then
    pm2 reload $PM2_APP_NAME-backend --update-env
else
    NODE_ENV=production pm2 start src/index.js \
        --name "$PM2_APP_NAME-backend" \
        --log "$DEPLOY_PATH/logs/backend.log" \
        --time \
        --restart-delay=3000 \
        --max-memory-restart 1G \
        -o "$DEPLOY_PATH/logs/backend-out.log" \
        -e "$DEPLOY_PATH/logs/backend-error.log"
fi

# Frontend deployment
log_info "Deploying frontend..."
cd "$DEPLOY_PATH/frontend" || log_error "Failed to change to frontend directory"

# Install frontend dependencies
log_info "Installing frontend dependencies..."
npm install --production --no-optional --prefer-offline

# Build frontend
log_info "Building frontend..."
npm run build || log_error "Frontend build failed"

# Create nginx directory if it doesn't exist
NGINX_WWW_DIR="/var/www/$DOMAIN"
sudo mkdir -p "$NGINX_WWW_DIR"

# Copy build to nginx directory
log_info "Copying frontend files to web directory..."
sudo rsync -a --delete "$DEPLOY_PATH/frontend/build/" "$NGINX_WWW_DIR/" || log_error "Failed to copy frontend files"

# Set proper permissions
log_info "Setting file permissions..."
sudo chown -R www-data:www-data "$NGINX_WWW_DIR"
sudo chmod -R 755 "$NGINX_WWW_DIR"

# Configure Nginx
log_info "Configuring Nginx..."
NGINX_CONF="/etc/nginx/sites-available/$DOMAIN"
sudo bash -c "cat > $NGINX_CONF" <<EOL
server {
    listen 80;
    server_name ${DOMAIN};
    root ${DEPLOY_PATH}/frontend/build;
    index index.html;

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket for OCPP
    location /ocpp {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Enable site if not already enabled
ln -sf /etc/nginx/sites-available/evcharging /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t && systemctl reload nginx

# PM2 process management
log_info "Configuring PM2 process..."
if pm2 list | grep -q "evcharging-backend"; then
    log_info "Restarting backend service..."
    pm2 restart evcharging-backend --update-env
else
    log_info "Starting backend service..."
    cd backend
    NODE_ENV=production pm2 start src/index.js --name evcharging-backend
fi

# Save PM2 configuration
pm2 save

# SSL certificates
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    log_warn "SSL certificates not found. Installing certificates..."
    certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN}
fi

log_info "Deployment completed successfully!"
log_info "Frontend: https://${DOMAIN}"
log_info "Backend API: https://${API_DOMAIN}"
log_info "WebSocket: wss://${API_DOMAIN}/ocpp"
