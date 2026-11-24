const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const { connectDB, disconnectDB } = require('./config/database');
const socketService = require('./services/socketService');
const schedulerService = require('./services/schedulerService');
const errorHandler = require('./middleware/errorHandler');
const { Logger } = require('./utils/logger');

const logger = new Logger('Server');

const app = express();
const server = http.createServer(app);

// 1. Security & Core Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: false, // CRITICAL: NEVER send Strict-Transport-Security on local HTTP (causes net::ERR_SSL_PROTOCOL_ERROR)
  contentSecurityPolicy: false // CRITICAL: Allow local video blobs, WebRTC WHEP, MediaSource fMP4 chunks and RTSP/HLS stream proxies
}));

// Clear any previously cached HSTS entries in Chromium
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=0');
  next();
});

app.use(cors({
  origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate Limiting: Exclude localhost/loopback and high-frequency live streaming proxy routes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000,
  skip: (req) => {
    const p = req.path || '';
    if (
      p.startsWith('/hls') ||
      p.startsWith('/whep') ||
      p.startsWith('/mediamtx') ||
      p.startsWith('/system/health')
    ) {
      return true;
    }
    const ip = req.ip || req.connection?.remoteAddress || '';
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  },
  message: { success: false, error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api', limiter);

// 2. Serve Static Uploads
try { fs.mkdirSync(config.media.uploadDir, { recursive: true }); } catch (_) {}
app.use('/uploads', express.static(config.media.uploadDir));

// 3. Trial Enforcement & API Routes
const trialService = require('./services/trialService');

app.use('/api', (req, res, next) => {
  // Allow trial status and system health checks to always pass
  if (
    req.path.startsWith('/system/trial-status') ||
    req.path.startsWith('/system/health')
  ) {
    return next();
  }

  if (trialService.isTrial() && trialService.isExpired()) {
    return res.status(403).json({
      success: false,
      error: 'TRIAL_EXPIRED',
      isTrialExpired: true,
      message: 'Your 5-day trial period has expired. The application is now inactive. Please obtain the full licensed version.'
    });
  }
  next();
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/facebook', require('./routes/facebookRoutes'));
app.use('/api/cameras', require('./routes/cameraRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/automations', require('./routes/automationRoutes'));
app.use('/api/broadcasts', require('./routes/broadcastRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/agents', require('./routes/agentRoutes'));
app.use('/api/system', require('./routes/systemRoutes'));
app.use('/api', require('./routes/liveStreamProxyRoutes'));

// MediaMTX Health / Control API
app.get('/api/mediamtx/health', async (req, res) => {
  try {
    const mtxMgr = require('./services/mediamtxProcessManager');
    const health = await mtxMgr.checkApiHealth();
    res.json({ success: true, ...health, status: mtxMgr.status() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/api/mediamtx/start', async (req, res) => {
  try {
    const mtxMgr = require('./services/mediamtxProcessManager');
    const result = await mtxMgr.start();
    res.json({ success: result.started, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Serve Frontend SPA (Production Desktop / Web)
let frontendDist = path.join(__dirname, '../frontend/dist');
const possibleFrontendPaths = [
  path.join(__dirname, '../frontend/dist'),
  path.join(__dirname, 'frontend/dist'),
  path.join(process.cwd(), 'frontend/dist'),
  path.join(process.resourcesPath || '', 'frontend/dist'),
  path.join(process.resourcesPath || '', 'app/frontend/dist'),
  path.join(process.resourcesPath || '', 'app.asar/frontend/dist'),
];

for (const p of possibleFrontendPaths) {
  if (p && fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    frontendDist = p;
    break;
  }
}

if (fs.existsSync(frontendDist) && fs.existsSync(path.join(frontendDist, 'index.html'))) {
  logger.info(`Serving Frontend SPA from: ${frontendDist}`);
  app.use(express.static(frontendDist, {
    setHeaders: (res) => {
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
  }));
  app.use('/assets', express.static(path.join(frontendDist, 'assets')));
  app.use('/:page/assets', (req, res) => {
    res.sendFile(path.join(frontendDist, 'assets', req.params[0] || req.url));
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  logger.warn(`Frontend dist not found at ${frontendDist}. Running in API-only mode.`);
  // Root Health Route
  app.get('/', (req, res) => {
    res.json({
      name: 'Facebook Live Automation API',
      status: 'ONLINE',
      version: '1.0.0',
      docs: '/api/system/health'
    });
  });
}

// Error Handling Middleware
app.use(errorHandler);

// 4. Server Bootstrap
const PORT = config.port || 5000;

async function bootstrap() {
  try {
    // Initialize Trial Service & License Verification
    trialService.init();

    // Validate Central Media Tools (FFmpeg / FFprobe) on startup
    const { mediaToolResolver } = require('./services/mediaToolResolver');
    mediaToolResolver.validateToolsOnStartup();

    // Initialize GPU Hardware Acceleration & Encoder Probes on startup
    const { hardwareEncoderService } = require('./services/hardwareEncoderService');
    await hardwareEncoderService.init().catch(err => {
      logger.warn(`Hardware encoder startup probe note: ${err.message}`);
    });

    // Start MediaMTX (RTSP server + Control API) BEFORE anything that needs it
    const mtxMgr = require('./services/mediamtxProcessManager');
    const mtxResult = await mtxMgr.start();
    if (mtxResult.started) {
      logger.info(`[MediaMTX] READY — exe: ${mtxResult.exePath || '(adopted)'}, RTSP :8554, API :9997`);
    } else {
      logger.warn(`[MediaMTX] Could not start: ${mtxResult.error || mtxResult.errorCode} — camera streaming will be limited until MediaMTX is available.`);
    }

    // Connect Database (standard or in-memory fallback)
    await connectDB();

    // Initialize Socket.IO
    socketService.init(server, config.clientUrl);

    // Start Persistent Scheduler
    await schedulerService.start();

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${PORT} is already in use by active service. Continuing with existing process.`);
      } else {
        logger.error(`Server error: ${err.message}`);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      const os = require('os');
      const nets = os.networkInterfaces();
      const addresses = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            addresses.push(net.address);
          }
        }
      }

      console.log('================================================================');
      console.log('🚀 FACEBOOK LIVE STREAMING SERVER IS RUNNING (24/7 ONLINE)');
      console.log('================================================================');
      console.log(`💻 Local Machine:      http://localhost:${PORT}`);
      addresses.forEach(ip => {
        console.log(`🌐 Local Network / Wi-Fi: http://${ip}:${PORT}`);
      });
      console.log('================================================================');
      console.log('👉 Open http://localhost:' + PORT + ' in your browser to access the dashboard.');
      console.log('================================================================\n');

      if (process.env.AUTO_OPEN_BROWSER === '1') {
        const { exec } = require('child_process');
        const startCmd = process.platform === 'win32' ? `start http://localhost:${PORT}` : `xdg-open http://localhost:${PORT}`;
        exec(startCmd, () => {});
      }
    });
  } catch (error) {
    logger.warn(`Bootstrap note: ${error.message}`);
  }
}

// Graceful Shutdown
const shutdown = async (signal) => {
  logger.warn(`Received ${signal}. Shutting down gracefully...`);
  schedulerService.stop();
  const ffmpegService = require('./services/ffmpegService');
  await ffmpegService.emergencyStopAll();
  // Stop managed MediaMTX process
  try {
    const mtxMgr = require('./services/mediamtxProcessManager');
    await mtxMgr.stop();
  } catch (_) {}
  await disconnectDB();
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  bootstrap();
}

module.exports = { app, server, bootstrap, shutdown };
