const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, dialog, screen } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Hardware Acceleration & Chromium GPU Flags for Zero-Load In-App Video Decoding on Windows
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode');
app.commandLine.appendSwitch('enable-features', 'D3D11VideoDecoder,DirectCompositionVideoOverlays,PlatformHEVCDecoderSupport');

// Enforce single application instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;
let splashWindow = null;
let projectorWindow = null;
let tray = null;
let isQuitting = false;

const userDataPath = app.getPath('userData') || __dirname;
process.env.ELECTRON_USER_DATA = userDataPath;

const logFile = path.join(userDataPath, 'electron-app.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}\n`;
  console.log(msg);
  try { fs.appendFileSync(logFile, line); } catch (_) {}
}

process.on('uncaughtException', (err) => {
  log(`UncaughtException: ${err.stack || err.message}`);
});

process.on('unhandledRejection', (reason) => {
  log(`UnhandledRejection: ${reason}`);
});

app.on('second-instance', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.show();
    splashWindow.focus();
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

const isDev = process.env.ELECTRON_IS_DEV === '1' || !app.isPackaged;
const PORT = process.env.PORT || 5000;

// Create Instant Splash Loading Window
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 480,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    show: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html')).catch(() => {});
}

// Helper to poll until target URL responds
function waitForServer(url, maxAttempts = 30, delayMs = 300) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(url, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) {
          resolve(false);
        } else {
          setTimeout(check, delayMs);
        }
      });
    };
    check();
  });
}

// Ensure bundled bin tools (FFmpeg, FFprobe, MediaMTX, MongoDB, yt-dlp) are always prioritized
function setupBundledBinaries() {
  const isWindows = process.platform === 'win32';
  const ffmpegName = isWindows ? 'ffmpeg.exe' : 'ffmpeg';
  const ffprobeName = isWindows ? 'ffprobe.exe' : 'ffprobe';

  let bundledBinDir = null;
  if (process.resourcesPath) {
    const resBin = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(path.join(resBin, ffmpegName))) {
      bundledBinDir = resBin;
    }
  }

  if (!bundledBinDir && process.execPath) {
    const execBin = path.join(path.dirname(process.execPath), 'resources', 'bin');
    if (fs.existsSync(path.join(execBin, ffmpegName))) {
      bundledBinDir = execBin;
    }
  }

  if (!bundledBinDir) {
    const devBin = path.resolve(__dirname, '..', 'backend', 'bin');
    if (fs.existsSync(path.join(devBin, ffmpegName))) {
      bundledBinDir = devBin;
    }
  }

  if (bundledBinDir) {
    process.env.FFMPEG_PATH = path.join(bundledBinDir, ffmpegName);
    process.env.FFPROBE_PATH = path.join(bundledBinDir, ffprobeName);
    process.env.PATH = `${bundledBinDir}${path.delimiter}${process.env.PATH || ''}`;
    log(`[Electron] Bundled binary environment configured: ${bundledBinDir}`);
    log(`[Electron] Explicit FFMPEG_PATH: ${process.env.FFMPEG_PATH}`);
  }

  // Discover and configure GStreamer runtime environment on Windows
  const os = require('os');
  const homedir = os.homedir();
  const gstCandidates = [
    process.env.GSTREAMER_BIN,
    process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64 ? path.join(process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64, 'bin') : null,
    process.env.GSTREAMER_ROOT ? path.join(process.env.GSTREAMER_ROOT, 'bin') : null,
    path.join(homedir, 'AppData', 'Local', 'Programs', 'gstreamer', '1.0', 'msvc_x86_64', 'bin'),
    'C:\\gstreamer\\1.0\\msvc_x86_64\\bin',
    'C:\\Program Files\\gstreamer\\1.0\\msvc_x86_64\\bin',
    bundledBinDir ? path.join(bundledBinDir, 'gstreamer', 'bin') : null
  ].filter(Boolean);

  let gstBinDir = null;
  for (const dir of gstCandidates) {
    if (fs.existsSync(path.join(dir, 'gst-launch-1.0.exe'))) {
      gstBinDir = dir;
      break;
    }
  }

  if (gstBinDir) {
    process.env.GSTREAMER_BIN = gstBinDir;
    const gstRootDir = path.resolve(gstBinDir, '..');
    process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64 = gstRootDir;
    const gstPluginDir = path.join(gstRootDir, 'lib', 'gstreamer-1.0');
    if (fs.existsSync(gstPluginDir)) {
      process.env.GST_PLUGIN_PATH = gstPluginDir;
    }
    process.env.PATH = `${gstBinDir}${path.delimiter}${process.env.PATH || ''}`;
    log(`[Electron] GStreamer runtime environment configured: ${gstBinDir}`);
    log(`[Electron] GST_PLUGIN_PATH: ${process.env.GST_PLUGIN_PATH || 'default'}`);
  } else {
    log('[Electron] Note: GStreamer runtime not detected in standard paths.');
  }
}

// 1. Initialize Embedded Backend
async function startBackend() {
  try {
    setupBundledBinaries();
    log('[Electron] Starting application...');
    log(`[Electron] Environment: ${isDev ? 'DEVELOPMENT' : 'PACKAGED / PRODUCTION'}`);
    log(`[Electron] Backend URL: http://localhost:${PORT}`);
    log('[Electron] Starting embedded backend bootstrap...');
    const { bootstrap } = require('../backend/server');
    await bootstrap();
    log(`[Electron] Embedded backend initialized successfully on port ${PORT}`);
  } catch (err) {
    log(`[Electron] Backend init notice: ${err.stack || err.message}`);
  }
}

// 2. Create Native Desktop Window
async function createWindow() {
  try {
    const trialService = require('../backend/services/trialService');
    if (trialService.isTrial() && trialService.isExpired()) {
      const status = trialService.getStatus();
      const expiryLabel = status.hardExpiryLabel || 'Trial Deadline';
      log(`[Electron] Trial has expired (${expiryLabel}). Closing application immediately.`);
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      dialog.showMessageBoxSync({
        type: 'error',
        title: `Trial Period Expired (${expiryLabel})`,
        message: 'Trial License Expired',
        detail: `This 30-day trial version has expired (${expiryLabel}).\n\nThere is no way to run this trial executable after expiration. The application will now close.\n\nPlease obtain the full licensed version to continue using Facebook Live Streamer.`,
        buttons: ['Close Application']
      });
      isQuitting = true;
      app.quit();
      process.exit(0);
      return;
    }
  } catch (tErr) {
    log(`[Electron] Trial check error: ${tErr.message}`);
  }

  let appTitle = 'Facebook Live Streamer';
  try {
    const trialService = require('../backend/services/trialService');
    if (trialService.isTrial()) {
      const status = trialService.getStatus();
      const expiryLabel = status.hardExpiryLabel || '30 Days';
      appTitle = status.isExpired
        ? 'Facebook Live Streamer (Trial Expired - Closed)'
        : `Facebook Live Streamer (30-Day Trial - ${status.remainingDays}d left, Ends ${expiryLabel})`;
    }
  } catch (_) {}

  // Periodic expiration enforcement while application is open
  setInterval(() => {
    try {
      const trialService = require('../backend/services/trialService');
      if (trialService.isTrial() && trialService.isExpired()) {
        const status = trialService.getStatus();
        const expiryLabel = status.hardExpiryLabel || 'Trial Deadline';
        isQuitting = true;
        dialog.showMessageBoxSync({
          type: 'error',
          title: `Trial Period Expired (${expiryLabel})`,
          message: 'Trial License Expired',
          detail: `The 30-day trial period expired (${expiryLabel}). The application will now close.`,
          buttons: ['Close Application']
        });
        app.quit();
        process.exit(0);
      }
    } catch (_) {}
  }, 15000);

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#030712',
    title: appTitle,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    }
  });

  // Grant media/camera permissions automatically for local streaming
  if (mainWindow.webContents.session) {
    mainWindow.webContents.session.setPermissionCheckHandler(() => true);
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      callback(true);
    });
  }

  const targetURL = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}/`;
  log(`[Electron] Frontend URL: ${targetURL}`);
  log('[Electron] Loading frontend...');

  // Attach WebContents event handlers for load diagnostics
  mainWindow.webContents.on('did-finish-load', () => {
    log('[Electron] Frontend loaded successfully');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // Ignore user aborts (ERR_ABORTED)
    // Also ignore navigation away from error page (retry button)
    if (validatedURL && validatedURL.startsWith('file://')) return;

    log('[Electron] FRONTEND LOAD FAILED');
    log(`Error Code: ${errorCode} (${errorDescription})`);
    log(`URL: ${validatedURL}`);

    // Load static error.html (data: URLs are blocked by Electron security)
    const errorPage = path.join(__dirname, 'error.html');
    const params = new URLSearchParams({
      url: validatedURL || `http://localhost:${PORT}/`,
      code: String(errorCode),
      desc: errorDescription || 'ERR_CONNECTION_REFUSED'
    });
    mainWindow.loadFile(errorPage, { query: Object.fromEntries(params) }).catch(() => {});
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) {
      log(`[WebConsole] (${sourceId}:${line}) ${message}`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    log(`[Electron] Renderer process gone: ${details.reason} (Exit code: ${details.exitCode})`);
  });

  // Wait up to 30 seconds (120 × 250ms) for backend to fully start
  // MongoDB embedded server can take 10-15 seconds on first run
  const isServerAvailable = await waitForServer(targetURL, 120, 250);
  if (!isServerAvailable) {
    log(`[Electron] Warning: ${targetURL} did not respond within 30s. Attempting load anyway...`);
  }

  // Clear Chromium session cache to ensure newest frontend build is loaded and any HSTS cache is removed
  try {
    await mainWindow.webContents.session.clearCache();
    await mainWindow.webContents.session.clearStorageData({ storages: ['cachestorage', 'serviceworkers'] });
    await mainWindow.webContents.session.clearHostResolverCache();
  } catch (_) {}

  mainWindow.loadURL(targetURL, { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' }).catch((err) => {
    log(`[Electron] loadURL error: ${err.message}`);
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Failsafe timer to guarantee window visibility
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 2500);

  // Minimize to tray on close
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Facebook Live Streamer',
          body: 'Application minimized to system tray. Live broadcasts will continue running in background.'
        }).show();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Window Fullscreen IPC handlers (true OS fullscreen covering Windows Taskbar)
ipcMain.handle('window:toggle-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const nextState = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(nextState);
    return nextState;
  }
  return false;
});

ipcMain.handle('window:set-fullscreen', (event, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(Boolean(flag));
    return mainWindow.isFullScreen();
  }
  return false;
});

ipcMain.handle('window:is-fullscreen', () => {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false;
});

// External HDMI Projector Display IPC handlers
ipcMain.handle('window:get-displays', () => {
  try {
    const allDisplays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();
    return allDisplays.map((disp, idx) => ({
      id: disp.id,
      label: disp.id === primary.id ? `Primary Screen (${disp.bounds.width}x${disp.bounds.height})` : `HDMI / Screen #${idx + 1} (${disp.bounds.width}x${disp.bounds.height})`,
      isPrimary: disp.id === primary.id,
      bounds: disp.bounds
    }));
  } catch (err) {
    log(`[Projector] get-displays error: ${err.message}`);
    return [];
  }
});

ipcMain.handle('window:cast-to-display', async (event, payload = {}) => {
  try {
    const { route = '/projector', displayId = null } = payload;
    const allDisplays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    // Select target display: chosen displayId, or first external HDMI display, or primary
    let targetDisplay = null;
    if (displayId) {
      targetDisplay = allDisplays.find(d => String(d.id) === String(displayId));
    }
    if (!targetDisplay) {
      targetDisplay = allDisplays.find(d => d.id !== primary.id) || primary;
    }

    const { x, y, width, height } = targetDisplay.bounds;
    const isExternal = targetDisplay.id !== primary.id;

    if (projectorWindow && !projectorWindow.isDestroyed()) {
      projectorWindow.setBounds({ x, y, width, height });
      if (isExternal) {
        projectorWindow.setFullScreen(true);
      }
      projectorWindow.show();
      projectorWindow.focus();
    } else {
      projectorWindow = new BrowserWindow({
        x: x + 20,
        y: y + 20,
        width: isExternal ? width : 1280,
        height: isExternal ? height : 720,
        frame: !isExternal,
        fullscreen: isExternal,
        backgroundColor: '#000000',
        title: 'HDMI Live Output Projector',
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: false
        }
      });

      projectorWindow.on('closed', () => {
        projectorWindow = null;
      });
    }

    const baseURL = isDev ? 'http://localhost:5173' : `http://localhost:${PORT}`;
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    const targetURL = `${baseURL}${cleanRoute}`;

    log(`[Projector] Casting to display ${targetDisplay.id} (${width}x${height}, external: ${isExternal}): ${targetURL}`);
    await projectorWindow.loadURL(targetURL);
    projectorWindow.show();
    if (isExternal) {
      projectorWindow.setFullScreen(true);
    }
    projectorWindow.focus();

    return {
      success: true,
      isExternal,
      displayLabel: isExternal ? 'HDMI External Display' : 'Primary Display'
    };
  } catch (err) {
    log(`[Projector] castToDisplay error: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('window:close-projector', () => {
  if (projectorWindow && !projectorWindow.isDestroyed()) {
    projectorWindow.close();
    projectorWindow = null;
    return true;
  }
  return false;
});

ipcMain.handle('window:is-projector-active', () => {
  return Boolean(projectorWindow && !projectorWindow.isDestroyed());
});

// 3. System Tray Setup
function createTray() {
  // Simple 16x16 / 32x32 SVG tray icon
  const svgIcon = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#3b82f6">
      <circle cx="12" cy="12" r="10" fill="#1e3a8a"/>
      <polygon points="10,8 16,12 10,16" fill="#60a5fa"/>
    </svg>
  `;
  const iconBuffer = Buffer.from(svgIcon);
  const trayIcon = nativeImage.createFromBuffer(iconBuffer).resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Facebook Live Streamer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Status: Background Engine Active',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit Facebook Live Streamer',
      click: async () => {
        isQuitting = true;
        try {
          const { shutdown } = require('../backend/server');
          await shutdown('ELECTRON_EXIT');
        } catch (_) {}
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });
}

// 4. App Lifecycle Events
app.whenReady().then(async () => {
  createSplashWindow();
  createTray();
  await startBackend();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', async () => {
  isQuitting = true;
  try {
    const { shutdown } = require('../backend/server');
    await shutdown('APP_QUIT');
  } catch (_) {}
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});
