'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { Logger } = require('../utils/logger');

const logger = new Logger('MediaMTXProcess');

const RTSP_PORT = parseInt(process.env.MEDIAMTX_RTSP_PORT, 10) || 8554;
const API_PORT  = parseInt(process.env.MEDIAMTX_API_PORT,  10) || 9997;

// --------------------------------------------------------------------------
// Executable + config resolution
// --------------------------------------------------------------------------
function resolveMediaMtxExecutable() {
  const candidates = [];
  const push = (p) => { if (p) candidates.push(p); };

  const exe = 'mediamtx.exe';

  // 1. Bundled inside Electron resources/bin (packaged EXE)
  if (process.resourcesPath) {
    push(path.join(process.resourcesPath, 'bin', exe));
    push(path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'bin', exe));
  }
  if (process.execPath) {
    const d = path.dirname(process.execPath);
    push(path.join(d, 'resources', 'bin', exe));
  }

  // 2. Dev / source layout
  const appDir = path.resolve(__dirname, '..');
  push(path.join(appDir, 'bin', exe));

  const rootDir = path.resolve(__dirname, '../..');
  push(path.join(rootDir, 'backend', 'bin', exe));

  // 3. CWD
  push(path.join(process.cwd(), 'backend', 'bin', exe));
  push(path.join(process.cwd(), 'bin', exe));

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveMediaMtxConfig(exePath) {
  // Prefer a config file next to the executable
  if (exePath) {
    const sibling = path.join(path.dirname(exePath), 'mediamtx.yml');
    if (fs.existsSync(sibling)) return sibling;
  }
  return null;
}

// --------------------------------------------------------------------------
// API health probe
// --------------------------------------------------------------------------
function probeApi(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/v3/paths/list', method: 'GET' },
      (res) => { res.resume(); resolve(res.statusCode === 200); }
    );
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// --------------------------------------------------------------------------
// Wait for API with poll loop (no fixed sleep)
// --------------------------------------------------------------------------
async function waitForApi(host, port, maxAttempts = 40, intervalMs = 250) {
  for (let i = 0; i < maxAttempts; i++) {
    const ok = await probeApi(host, port);
    if (ok) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// --------------------------------------------------------------------------
// MediaMTX Process Manager (singleton)
// --------------------------------------------------------------------------
class MediaMTXProcessManager {
  constructor() {
    this._proc       = null;   // child_process reference
    this._state      = 'STOPPED'; // STOPPED | STARTING | RUNNING | FAILED
    this._apiHost    = process.env.MEDIAMTX_API_HOST || '127.0.0.1';
    this._apiPort    = API_PORT;
    this._rtspPort   = RTSP_PORT;
    this._exePath    = null;
    this._cfgPath    = null;
    this._startError = null;
  }

  // ---- public state -------------------------------------------------------

  get state()      { return this._state; }
  get isRunning()  { return this._state === 'RUNNING' && this._proc && !this._proc.killed; }
  get apiHost()    { return this._apiHost; }
  get apiPort()    { return this._apiPort; }
  get rtspPort()   { return this._rtspPort; }

  // ---- start --------------------------------------------------------------

  async start() {
    if (this._state === 'RUNNING' && this._proc && !this._proc.killed) {
      // Already up — verify API still responds
      const ok = await probeApi(this._apiHost, this._apiPort);
      if (ok) {
        logger.info('[MediaMTXProcess] Already running and API is healthy.');
        return { started: true, reused: true };
      }
      // Process alive but API dead — fall through to restart
      logger.warn('[MediaMTXProcess] Process exists but API is unresponsive. Restarting...');
      await this.stop();
    }

    if (this._state === 'STARTING') {
      logger.info('[MediaMTXProcess] Startup already in progress — waiting...');
      const ok = await waitForApi(this._apiHost, this._apiPort, 40, 250);
      this._state = ok ? 'RUNNING' : 'FAILED';
      return { started: ok };
    }

    this._state      = 'STARTING';
    this._startError = null;

    // Resolve executable
    this._exePath = resolveMediaMtxExecutable();
    if (!this._exePath) {
      this._state      = 'FAILED';
      this._startError = 'mediamtx.exe not found. Expected at backend/bin/mediamtx.exe';
      logger.error(`[MediaMTXProcess] ${this._startError}`);
      return { started: false, error: this._startError, errorCode: 'MEDIAMTX_BINARY_NOT_FOUND' };
    }

    this._cfgPath = resolveMediaMtxConfig(this._exePath);

    logger.info(`[MediaMTXProcess] Executable : ${this._exePath}`);
    logger.info(`[MediaMTXProcess] Config      : ${this._cfgPath || '(none — using defaults)'}`);
    logger.info(`[MediaMTXProcess] RTSP port   : ${this._rtspPort}`);
    logger.info(`[MediaMTXProcess] API  port   : ${this._apiPort}`);

    // Check for pre-existing port ownership
    const apiAlreadyUp = await probeApi(this._apiHost, this._apiPort);
    if (apiAlreadyUp) {
      logger.info('[MediaMTXProcess] Port :9997 already answering — adopting existing MediaMTX instance.');
      this._state = 'RUNNING';
      return { started: true, adopted: true };
    }

    // Spawn MediaMTX
    const args = this._cfgPath ? [this._cfgPath] : [];
    this._proc = spawn(this._exePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: false,
    });

    // Capture startup log
    let startupLog = '';
    const appendLog = (d) => {
      const s = d.toString();
      startupLog += s;
      if (s.includes('[API]') || s.includes('[RTSP]') || s.includes('ERR') || s.includes('WAR')) {
        logger.info(`[MediaMTX] ${s.trim()}`);
      }
    };
    this._proc.stdout.on('data', appendLog);
    this._proc.stderr.on('data', appendLog);

    this._proc.on('error', (err) => {
      this._state      = 'FAILED';
      this._startError = err.message;
      logger.error(`[MediaMTXProcess] spawn error: ${err.message}`);
    });

    this._proc.on('exit', (code, signal) => {
      if (this._state === 'RUNNING') {
        logger.warn(`[MediaMTXProcess] Process exited unexpectedly (code=${code}, signal=${signal}). Will restart on next request.`);
        this._state = 'STOPPED';
        this._proc  = null;
      }
    });

    // Wait for API to be ready (up to 10 seconds)
    const ready = await waitForApi(this._apiHost, this._apiPort, 40, 250);

    if (!ready) {
      this._state      = 'FAILED';
      this._startError = `MediaMTX API did not become ready on :${this._apiPort} within 10s. Startup log:\n${startupLog.slice(0, 800)}`;
      logger.error(`[MediaMTXProcess] ${this._startError}`);
      try { this._proc.kill(); } catch (_) {}
      return {
        started:   false,
        error:     this._startError,
        errorCode: 'MEDIAMTX_API_TIMEOUT',
        startupLog
      };
    }

    this._state = 'RUNNING';
    logger.info(`[MediaMTXProcess] READY — RTSP :${this._rtspPort}  API :${this._apiPort}`);
    return { started: true, exePath: this._exePath, cfgPath: this._cfgPath };
  }

  // ---- stop ---------------------------------------------------------------

  async stop() {
    if (this._proc) {
      try { this._proc.kill('SIGTERM'); } catch (_) {}
      await new Promise(r => setTimeout(r, 500));
      try { this._proc.kill('SIGKILL'); } catch (_) {}
      this._proc = null;
    }
    this._state = 'STOPPED';
    logger.info('[MediaMTXProcess] Stopped.');
  }

  // ---- health check -------------------------------------------------------

  async checkApiHealth() {
    const available = await probeApi(this._apiHost, this._apiPort);
    return {
      available,
      host:    this._apiHost,
      port:    this._apiPort,
      rtspPort: this._rtspPort,
      state:   this._state,
      exePath: this._exePath,
      cfgPath: this._cfgPath,
    };
  }

  // ---- diagnostics --------------------------------------------------------

  status() {
    return {
      state:      this._state,
      pid:        this._proc ? this._proc.pid : null,
      exePath:    this._exePath,
      cfgPath:    this._cfgPath,
      rtspPort:   this._rtspPort,
      apiPort:    this._apiPort,
      startError: this._startError,
    };
  }
}

module.exports = new MediaMTXProcessManager();

