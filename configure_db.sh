sudo -u postgres psql -c "CREATE DATABASE samanyudu;"
sudo -u postgres psql -c "CREATE USER sam_user WITH PASSWORD 'samanyudu_secure_123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE samanyudu TO sam_user;"
echo "DB Configured"
