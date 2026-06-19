# EV Charging CMS Deployment Guide

## 1. Connect to Your Server

Open a terminal on your local machine and connect to your server:

```bash
ssh root@167.71.240.212
```

Enter your password when prompted: `Assalafi139@Assalafi`

## 2. Server Initial Setup

Once logged in, execute these commands to update the server and create a non-root user (more secure):

```bash
# Update system packages
apt update && apt upgrade -y

# Install sudo if not installed
apt install -y sudo

# Create a new user with sudo privileges
adduser evadmin
# (set a strong password when prompted)

# Add user to sudo group
usermod -aG sudo evadmin

# Setup SSH key authentication (optional but recommended)
mkdir -p /home/evadmin/.ssh
chmod 700 /home/evadmin/.ssh
# Copy your SSH public key to /home/evadmin/.ssh/authorized_keys
chown -R evadmin:evadmin /home/evadmin/.ssh
chmod 600 /home/evadmin/.ssh/authorized_keys
```

## 3. Install Required Software

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Install Nginx
sudo apt install -y nginx

# Install Git
sudo apt install -y git

# Install PM2 (for Node.js process management)
sudo npm install -g pm2
```

## 4. Configure PostgreSQL

```bash
# Login as postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
CREATE USER evcharging WITH PASSWORD 'secure_password_here';
CREATE DATABASE evcharging OWNER evcharging;
GRANT ALL PRIVILEGES ON DATABASE evcharging TO evcharging;
\q
```

## 5. Clone and Setup Your Application

```bash
# Create directory for application
sudo mkdir -p /var/www/evcharging
sudo chown -R evadmin:evadmin /var/www/evcharging

# Clone your repository
cd /var/www
git clone https://github.com/Assalafi/ev-charging-cms.git evcharging
cd evcharging

# Install backend dependencies
cd backend
npm install

# Set environment variables
cat > .env << 'EOL'
NODE_ENV=production

# Backend Configuration
BACKEND_PORT=4000
BACKEND_HOST=0.0.0.0
BACKEND_URL=https://evcharging.eride.ng

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=evcharging
DB_USER=evcharging
DB_PASSWORD=secure_password_here

# Security
JWT_SECRET=your_secure_jwt_secret

# Web Dashboard
DASHBOARD_PORT=3002
DASHBOARD_HOST=0.0.0.0
DASHBOARD_URL=https://evcharging.eride.ng

# MQTT Configuration
MQTT_ENABLED=true
MQTT_BROKER=mqtt://localhost
MQTT_USERNAME=your_mqtt_username
MQTT_PASSWORD=your_mqtt_password
EOL

# Install frontend dependencies
cd ../frontend
npm install

# Build frontend for production
npm run build
```

## 6. Configure Nginx

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/evcharging
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name evcharging.eride.ng 167.71.240.212;

    location / {
        root /var/www/evcharging/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

        # Backend API
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Web Dashboard
    location /dashboard/ {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket for OCPP
    location /ocpp/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/evcharging /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 7. Start the Backend with PM2

```bash
# Start the backend server
cd /var/www/evcharging/backend
pm2 start src/index.js --name evcharging-backend

# Start the web dashboard
cd /var/www/evcharging/web-dashboard
pm2 start server.js --name evcharging-dashboard
pm2 startup
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u evadmin --hp /home/evadmin
pm2 save
```

## 8. Configure DNS for Your Domain

1. Log into your domain registrar's dashboard
2. Find the DNS management section for eride.ng
3. Add an A record:
   - Host/Name: evcharging
   - Value/Points to: 167.71.240.212
   - TTL: 3600 (or as recommended)

## 9. Setup SSL with Certbot

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d evcharging.eride.ng

# Follow the interactive prompts
# Choose to redirect all HTTP traffic to HTTPS when asked
```

## 10. Final Setup and Testing

```bash
# Allow Nginx through firewall
sudo apt install -y ufw
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw enable

# Restart everything to ensure proper operation
sudo systemctl restart nginx
pm2 restart all
```

Visit your site at https://evcharging.eride.ng or http://167.71.240.212 to confirm it's working.

## 11. Database Migration (if needed)

If you have existing database schemas or seed data:

```bash
cd /var/www/evcharging/backend
# Run your migrations/seeds
# Example: npm run migrate
```

## Troubleshooting

### Check Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
```

### Check Application Logs
```bash
pm2 logs evcharging-backend
```

### Restart Services
```bash
sudo systemctl restart nginx
pm2 restart evcharging-backend
```
