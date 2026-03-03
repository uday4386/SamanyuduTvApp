cd /var/www/samanyudu/backend_api
pm2 start index.js --name samanyudu-api
pm2 save
pm2 startup systemd -u root --hp /root
