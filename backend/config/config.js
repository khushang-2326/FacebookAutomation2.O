const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'fallback_secret_jwt_facebook_automation',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  encryptionKey: process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  
  // Database
  mongodbUri: process.env.MONGODB_URI || '',

  // Meta Facebook API
  facebook: {
    appId: process.env.FACEBOOK_APP_ID || '',
    appSecret: process.env.FACEBOOK_APP_SECRET || '',
    redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:5000/api/facebook/callback',
    apiVersion: process.env.META_GRAPH_API_VERSION || process.env.FACEBOOK_API_VERSION || 'v21.0',
    mockMode: process.env.FACEBOOK_MOCK_MODE === 'true', // Production safe: false by default
  },

  // Scheduler & Rotation
  scheduler: {
    testMode: process.env.SCHEDULER_TEST_MODE === 'true', // Production safe: false by default
    defaultRotationDuration: parseInt(process.env.DEFAULT_ROTATION_DURATION, 10) || 17400, // 4h 50m
    defaultRestartDelay: parseInt(process.env.DEFAULT_RESTART_DELAY, 10) || 60, // 60s
    testRotationDuration: parseInt(process.env.TEST_ROTATION_DURATION, 10) || 15, // 15s in test mode
    testRestartDelay: parseInt(process.env.TEST_RESTART_DELAY, 10) || 3, // 3s in test mode
    tickIntervalMs: parseInt(process.env.SCHEDULER_TICK_INTERVAL_MS, 10) || 1000,
  },

  // Media & Uploads (guaranteed writable outside read-only app.asar)
  media: {
    uploadDir: process.env.ELECTRON_USER_DATA 
      ? path.join(process.env.ELECTRON_USER_DATA, 'uploads')
      : (process.env.APPDATA 
          ? path.join(process.env.APPDATA, 'facebook-live-automation', 'uploads')
          : path.join(__dirname, '../uploads')),
    maxFileSizeMb: 500,
    allowedMimeTypes: [
      'video/mp4',
      'video/quicktime',
      'video/x-matroska',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  },

  // Set YTDLP_PATH when yt-dlp is not available on the system PATH.
  youtube: {
    ytdlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  },

  // Client CORS
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173'
};
