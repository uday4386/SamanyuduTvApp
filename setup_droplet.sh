#!/bin/bash

# ==============================================================================
# Samanyudu TV - Automated Droplet Setup Script
# Target: Ubuntu 22.04 LTS
# ==============================================================================

echo "🚀 Starting Samanyudu TV Server Setup..."

# 1. Update System
sudo apt update && sudo apt upgrade -y

# 2. Install Essentials (Node.js 20.x, PostgreSQL, Nginx, Git)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql postgresql-contrib nginx git

# 3. Install PM2 Globally
sudo npm install -g pm2

# 4. Configure PostgreSQL
echo "📋 Configuring Database..."
sudo -u postgres psql -c "CREATE DATABASE samanyudu;"
sudo -u postgres psql -c "CREATE USER sam_user WITH PASSWORD 'samanyudu_secure_123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE samanyudu TO sam_user;"

# 5. Setup Firewall (UFW)
echo "🛡️ Configuring Firewall..."
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw --force enable

# 6. Create Web Directory
sudo mkdir -p /var/www/samanyudu
sudo chown -R $USER:$USER /var/www/samanyudu

echo "✅ Server dependencies installed!"
echo "--------------------------------------------------------"
echo "IP: 64.227.166.123"
echo "DB Name: samanyudu"
echo "DB User: sam_user"
echo "DB Pass: samanyudu_secure_123"
echo "--------------------------------------------------------"
echo "👉 NEXT STEP: Upload your code to /var/www/samanyudu"
