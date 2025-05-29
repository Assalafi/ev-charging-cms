# EV Charging CMS - Deployment Guide

This guide provides instructions for deploying the EV Charging CMS to a production environment.

## Prerequisites

- Ubuntu 20.04/22.04 server
- Node.js 16.x
- PostgreSQL 13+
- Nginx
- PM2
- Git

## Server Setup

1. **Update System Packages**
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Install Required Packages**
   ```bash
   sudo apt install -y git nginx postgresql postgresql-contrib build-essential
   ```

3. **Install Node.js using NVM**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   source ~/.bashrc
   nvm install 16
   nvm use 16
   ```

4. **Install PM2**
   ```bash
   npm install -g pm2
   ```

## Database Setup

1. **Create Database and User**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE ev_charging_prod;
   CREATE USER assalafi WITH PASSWORD 'Assalafi@139';
   GRANT ALL PRIVILEGES ON DATABASE ev_charging_prod TO assalafi;
   \q
   ```

2. **Set Up SSL Certificate (Let's Encrypt)**
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d evcharging.eride.ng -d www.evcharging.eride.ng
   ```

## Deployment

1. **Clone Repository**
   ```bash
   sudo mkdir -p /var/www/evcharging
   sudo chown -R $USER:$USER /var/www/evcharging
   git clone <your-repository-url> /var/www/evcharging
   cd /var/www/evcharging
   ```

2. **Set Up Environment Variables**
   ```bash
   cp .env.production .env
   # Edit the .env file with your production settings
   ```

3. **Run Deployment Script**
   ```bash
   chmod +x deploy.sh
   sudo ./deploy.sh
   ```

## GitHub Actions Setup (Optional)

1. Add these secrets to your GitHub repository (Settings > Secrets > Actions):
   - `SSH_PRIVATE_KEY`: Your server's private SSH key
   - `SERVER_IP`: Your server's IP address
   - `SSH_USERNAME`: Your server's SSH username (e.g., `assalafi`)

## Post-Deployment

1. **Verify Services**
   ```bash
   pm2 status
   sudo systemctl status nginx
   sudo systemctl status postgresql
   ```

2. **Set Up Automatic Backups**
   Create a cron job for database backups:
   ```bash
   crontab -e
   ```
   Add the following line (runs daily at 2 AM):
   ```
   0 2 * * * /var/www/evcharging/scripts/backup.sh
   ```

## Maintenance

- **View Logs**: `pm2 logs`
- **Restart Services**: `pm2 restart all`
- **Update Application**:
  ```bash
  cd /var/www/evcharging
  git pull
  ./deploy.sh
  ```

## Troubleshooting

- Check logs in `/var/log/nginx/` for Nginx issues
- Check PM2 logs: `pm2 logs`
- Check application logs in `/var/www/evcharging/logs/`
