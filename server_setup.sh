#!/bin/bash

# Update system packages
echo "Updating system packages..."
apt update && apt upgrade -y

# Install required software
echo "Installing Node.js, npm, PostgreSQL, and Nginx..."
apt install -y curl gnupg2 ca-certificates lsb-release
curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
apt install -y nodejs postgresql postgresql-contrib nginx git certbot python3-certbot-nginx

# Start and enable PostgreSQL and Nginx
systemctl start postgresql
systemctl enable postgresql
systemctl start nginx
systemctl enable nginx

# Create PostgreSQL user and database
echo "Setting up PostgreSQL database..."
sudo -u postgres psql -c "CREATE USER evcharging WITH PASSWORD 'evcharging_password';"
sudo -u postgres psql -c "CREATE DATABASE evcharging OWNER evcharging;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE evcharging TO evcharging;"

# Create a deployment directory
echo "Creating deployment directory..."
mkdir -p /var/www/evcharging

# Clone the repository (you will need to manually provide access to your repository)
echo "To clone your repository, you will need to run: git clone https://github.com/Assalafi/ev-charging-cms.git /var/www/evcharging"

# Setup Node.js application
echo "Setting up Node.js environment..."
npm install -g pm2
cd /var/www/evcharging

# Setup Nginx configuration
echo "Setting up Nginx configuration..."
cat > /etc/nginx/sites-available/evcharging << 'EOL'
server {
    listen 80;
    server_name evcharging.eride.ng 167.71.240.212;

    location / {
        root /var/www/evcharging/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOL

# Enable the site
ln -s /etc/nginx/sites-available/evcharging /etc/nginx/sites-enabled/

# Remove default nginx site
rm /etc/nginx/sites-enabled/default

# Setup SSL with Certbot (interactive step)
echo "To set up SSL, run: certbot --nginx -d evcharging.eride.ng"

# Restart Nginx
systemctl restart nginx

echo "Basic server setup complete!"
echo "Next steps:"
echo "1. Clone your repository"
echo "2. Install frontend dependencies: cd /var/www/evcharging/frontend && npm install"
echo "3. Build frontend: cd /var/www/evcharging/frontend && npm run build"
echo "4. Install backend dependencies: cd /var/www/evcharging/backend && npm install"
echo "5. Configure environment variables: Create .env file in /var/www/evcharging/backend"
echo "6. Start backend with PM2: cd /var/www/evcharging/backend && pm2 start src/index.js --name evcharging-backend"
echo "7. Setup SSL certificate: certbot --nginx -d evcharging.eride.ng"
