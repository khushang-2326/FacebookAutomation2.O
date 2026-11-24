# Production VPS Deployment Guide (Ubuntu / PM2 / Nginx)

This guide walks you through deploying the Facebook Live Scheduled Automation Platform to an Ubuntu 22.04 / 24.04 VPS.

---

## 1. Prerequisites & System Packages

Update your server and install Node.js 20+, FFmpeg, and MongoDB:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install FFmpeg and Git
sudo apt install -y ffmpeg git build-essential

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 Process Manager globally
sudo npm install -g pm2
```

---

## 2. Clone & Setup Project

```bash
# Clone repository
git clone https://github.com/your-org/facebook-live-automation.git /var/www/facebook-live-automation
cd /var/www/facebook-live-automation

# Install backend dependencies
cd backend
npm install --production

# Install frontend dependencies & build
cd ../frontend
npm install
npm run build
```

---

## 3. Configure Production Environment

Create `/var/www/facebook-live-automation/backend/.env`:

```env
PORT=5000
NODE_ENV=production
JWT_SECRET=your_super_strong_jwt_secret_key_here
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
MONGODB_URI=mongodb://localhost:27017/facebook_live_automation

FACEBOOK_APP_ID=your_real_app_id
FACEBOOK_APP_SECRET=your_real_app_secret
FACEBOOK_REDIRECT_URI=https://yourdomain.com/api/facebook/callback
FACEBOOK_MOCK_MODE=false
SCHEDULER_TEST_MODE=false

DEFAULT_ROTATION_DURATION=17400
DEFAULT_RESTART_DELAY=60
SCHEDULER_TICK_INTERVAL_MS=5000
CLIENT_URL=https://yourdomain.com
```

---

## 4. Run with PM2

```bash
cd /var/www/facebook-live-automation/backend
pm2 start server.js --name "fb-live-backend"
pm2 save
pm2 startup
```

---

## 5. Configure Nginx Reverse Proxy with SSL

Create `/etc/nginx/sites-available/facebook-live`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend Single Page App
    location / {
        root /var/www/facebook-live-automation/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Uploads Static Assets
    location /uploads/ {
        alias /var/www/facebook-live-automation/backend/uploads/;
        expires 30d;
    }

    # Backend API Reverse Proxy
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (Socket.IO) Proxy
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable site and install Let's Encrypt SSL:

```bash
sudo ln -s /etc/nginx/sites-available/facebook-live /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install SSL with Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```
