const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { Logger } = require('../utils/logger');

const logger = new Logger('MediaTools');

// Error Codes Matrix
const ErrorCodes = {
  MEDIA_ENGINE_NOT_FOUND: 'MEDIA_ENGINE_NOT_FOUND',
  FFMPEG_NOT_FOUND: 'FFMPEG_NOT_FOUND',
  FFPROBE_NOT_FOUND: 'FFPROBE_NOT_FOUND',
  MEDIA_ENGINE_PERMISSION_DENIED: 'MEDIA_ENGINE_PERMISSION_DENIED',
  MEDIA_ENGINE_EXECUTION_FAILED: 'MEDIA_ENGINE_EXECUTION_FAILED',
  MEDIA_ENGINE_INVALID_BINARY: 'MEDIA_ENGINE_INVALID_BINARY',
  MEDIA_ENGINE_ARCHITECTURE_MISMATCH: 'MEDIA_ENGINE_ARCHITECTURE_MISMATCH',

  RTSP_INVALID_URL: 'RTSP_INVALID_URL',
  RTSP_AUTH_FAILED: 'RTSP_AUTH_FAILED',
  RTSP_CONNECTION_FAILED: 'RTSP_CONNECTION_FAILED',
  RTSP_TIMEOUT: 'RTSP_TIMEOUT',
  RTSP_CAMERA_OFFLINE: 'RTSP_CAMERA_OFFLINE',
  RTSP_NO_VIDEO: 'RTSP_NO_VIDEO',
  RTSP_UNSUPPORTED_CODEC: 'RTSP_UNSUPPORTED_CODEC',

  NETWORK_ERROR: 'NETWORK_ERROR'
};

class MediaToolResolver {
  constructor() {
    this._ffmpegCache = null;
    this._ffprobeCache = null;
  }

  /**
   * Generates candidate binary paths in order of priority:
   * 1. Bundled application binaries (process.resourcesPath, AppDir, relative paths)
   * 2. Explicit environment / configuration paths (FFMPEG_PATH / FFPROBE_PATH)
   * 3. Application-relative paths
   * 4. System PATH
   * 5. Known Windows installation directories
   */
  _getCandidates(toolName) {
    const isWindows = process.platform === 'win32';
    const binaryName = isWindows ? `${toolName}.exe` : toolName;
    const envVar = toolName.toUpperCase() === 'FFMPEG' ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;

    const candidates = [];

    // Helper to safely push existing/non-empty string paths
    const addCandidate = (p, source) => {
      if (p && typeof p === 'string' && p.trim()) {
        const cleanPath = path.normalize(p.trim());
        if (!candidates.some(c => c.path === cleanPath)) {
          candidates.push({ path: cleanPath, source });
        }
      }
    };

    // 1. Bundled application binaries (Electron / Packaged Build)
    if (process.resourcesPath) {
      addCandidate(path.join(process.resourcesPath, 'bin', binaryName), 'Bundled (Resources)');
      addCandidate(path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', 'bin', binaryName), 'Bundled (ASAR Unpacked)');
    }

    if (process.execPath) {
      const execDir = path.dirname(process.execPath);
      addCandidate(path.join(execDir, 'bin', binaryName), 'Bundled (ExecDir/bin)');
      addCandidate(path.join(execDir, 'resources', 'bin', binaryName), 'Bundled (ExecDir/resources)');
    }

    // 2. Explicit environment variables / Configuration
    if (envVar) {
      addCandidate(envVar, 'Environment Variable');
    }

    // 3. Application-relative paths
    const appDir = path.resolve(__dirname, '..');
    const rootDir = path.resolve(__dirname, '../..');
    addCandidate(path.join(appDir, 'bin', binaryName), 'App Bin');
    addCandidate(path.join(rootDir, 'backend', 'bin', binaryName), 'Backend Bin');
    addCandidate(path.join(rootDir, 'camera-agent', 'bin', binaryName), 'Camera Agent Bin');
    addCandidate(path.join(rootDir, 'bin', binaryName), 'Root Bin');
    addCandidate(path.join(process.cwd(), 'backend', 'bin', binaryName), 'CWD Backend Bin');
    addCandidate(path.join(process.cwd(), 'bin', binaryName), 'CWD Bin');

    // 4. Known Windows installation locations
    if (isWindows) {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

      const knownWinDirs = [
        'C:\\ffmpeg\\bin',
        'C:\\Program Files\\FFmpeg\\bin',
        'C:\\Program Files (x86)\\FFmpeg\\bin',
        'C:\\tools\\ffmpeg\\bin',
        'C:\\chocolatey\\bin',
        path.join(localAppData, 'Programs', 'FFmpeg', 'bin'),
        path.join(localAppData, 'FFmpeg', 'bin'),
        path.join(appData, 'FFmpeg', 'bin'),
        path.join(os.homedir(), 'ffmpeg', 'bin')
      ];

      for (const winDir of knownWinDirs) {
        addCandidate(path.join(winDir, binaryName), 'Known Windows Directory');
      }
    }

    // 5. System PATH Fallback
    addCandidate(binaryName, 'System PATH');

    return candidates;
  }

  /**
   * Validates if a binary candidate can be executed and parses its version string.
   */
  _validateExecutable(candidatePath) {
    if (!candidatePath) return { valid: false, error: 'No path provided', code: ErrorCodes.MEDIA_ENGINE_NOT_FOUND };

    // If it's a specific path (not bare binaryName for system PATH), verify file exists
    if (candidatePath.includes(path.sep) || candidatePath.includes('/') || candidatePath.includes(':')) {
      if (!fs.existsSync(candidatePath)) {
        return { valid: false, error: `File not found at ${candidatePath}`, code: ErrorCodes.MEDIA_ENGINE_NOT_FOUND };
      }
      try {
        const stat = fs.statSync(candidatePath);
        if (!stat.isFile()) {
          return { valid: false, error: `Path ${candidatePath} is not a file`, code: ErrorCodes.MEDIA_ENGINE_INVALID_BINARY };
        }
      } catch (err) {
        return { valid: false, error: `Cannot stat file: ${err.message}`, code: ErrorCodes.MEDIA_ENGINE_PERMISSION_DENIED };
      }
    }

    // Attempt actual execution with -version
    try {
      const res = spawnSync(candidatePath, ['-version'], {
        timeout: 3000,
        encoding: 'utf8',
        windowsHide: true
      });

      if (res.error) {
        const errCode = res.error.code;
        if (errCode === 'ENOENT') {
          return { valid: false, error: 'Executable not found in system environment', code: ErrorCodes.MEDIA_ENGINE_NOT_FOUND };
        }
        if (errCode === 'EACCES' || errCode === 'EPERM') {
          return { valid: false, error: 'Permission denied when launching binary', code: ErrorCodes.MEDIA_ENGINE_PERMISSION_DENIED };
        }
        return { valid: false, error: res.error.message, code: ErrorCodes.MEDIA_ENGINE_EXECUTION_FAILED };
      }

      if (res.status !== 0) {
        return { valid: false, error: `Process exited with code ${res.status}`, code: ErrorCodes.MEDIA_ENGINE_EXECUTION_FAILED };
      }

      const output = (res.stdout || '') + (res.stderr || '');
      const versionMatch = output.match(/(?:ffmpeg|ffprobe)\s+version\s+([^\s,]+)/i) || output.match(/version\s+([^\s,]+)/i);
      const version = versionMatch ? versionMatch[1] : '7.x-verified';

      return {
        valid: true,
        path: candidatePath,
        version,
        rawOutput: output.substring(0, 200)
      };
    } catch (err) {
      return { valid: false, error: `Execution exception: ${err.message}`, code: ErrorCodes.MEDIA_ENGINE_EXECUTION_FAILED };
    }
  }

  /**
   * Resolves FFmpeg executable path.
   */
  resolveFFmpeg(forceRevalidate = false) {
    if (this._ffmpegCache && !forceRevalidate) {
      return this._ffmpegCache;
    }

    const candidates = this._getCandidates('ffmpeg');
    for (const c of candidates) {
      const result = this._validateExecutable(c.path);
      if (result.valid) {
        this._ffmpegCache = {
          available: true,
          path: c.path,
          version: result.version,
          source: c.source
        };
        return this._ffmpegCache;
      }
    }

    this._ffmpegCache = {
      available: false,
      path: null,
      version: null,
      source: null,
      errorCode: ErrorCodes.FFMPEG_NOT_FOUND,
      error: 'FFmpeg executable could not be located or executed.'
    };
    return this._ffmpegCache;
  }

  /**
   * Resolves FFprobe executable path.
   */
  resolveFFprobe(forceRevalidate = false) {
    if (this._ffprobeCache && !forceRevalidate) {
      return this._ffprobeCache;
    }

    const candidates = this._getCandidates('ffprobe');
    for (const c of candidates) {
      const result = this._validateExecutable(c.path);
      if (result.valid) {
        this._ffprobeCache = {
          available: true,
          path: c.path,
          version: result.version,
          source: c.source
        };
        return this._ffprobeCache;
      }
    }

    this._ffprobeCache = {
      available: false,
      path: null,
      version: null,
      source: null,
      errorCode: ErrorCodes.FFPROBE_NOT_FOUND,
      error: 'FFprobe executable could not be located or executed.'
    };
    return this._ffprobeCache;
  }

  /**
   * Returns valid FFmpeg executable path string or 'ffmpeg' fallback.
   */
  getFFmpegPath() {
    const res = this.resolveFFmpeg();
    return res.available ? res.path : 'ffmpeg';
  }

  /**
   * Returns valid FFprobe executable path string or 'ffprobe' fallback.
   */
  getFFprobePath() {
    const res = this.resolveFFprobe();
    return res.available ? res.path : 'ffprobe';
  }

  /**
   * Returns detailed health status object for system API endpoints & diagnostics UI.
   */
  getHealthStatus(forceRevalidate = false) {
    const ffmpegStatus = this.resolveFFmpeg(forceRevalidate);
    const ffprobeStatus = this.resolveFFprobe(forceRevalidate);

    const mediaEngineReady = ffmpegStatus.available && ffprobeStatus.available;

    let diagnosticCode = null;
    let userMessage = null;

    if (!ffmpegStatus.available && !ffprobeStatus.available) {
      diagnosticCode = 'MEDIA-001-002';
      userMessage = 'Video Analysis & Streaming Engines are unavailable. Required media components are missing.';
    } else if (!ffmpegStatus.available) {
      diagnosticCode = 'MEDIA-001';
      userMessage = 'Streaming Engine (FFmpeg) is unavailable. Please repair or restart the application.';
    } else if (!ffprobeStatus.available) {
      diagnosticCode = 'MEDIA-002';
      userMessage = 'Video Analysis Engine (FFprobe) is unavailable. Stream inspection cannot be performed.';
    } else {
      userMessage = 'Media engine READY';
    }

    return {
      mediaEngineReady,
      diagnosticCode,
      userMessage,
      ffmpeg: {
        available: ffmpegStatus.available,
        path: ffmpegStatus.path || 'Not Found',
        version: ffmpegStatus.version || 'Unavailable',
        source: ffmpegStatus.source || 'None',
        error: ffmpegStatus.error || null
      },
      ffprobe: {
        available: ffprobeStatus.available,
        path: ffprobeStatus.path || 'Not Found',
        version: ffprobeStatus.version || 'Unavailable',
        source: ffprobeStatus.source || 'None',
        error: ffprobeStatus.error || null
      },
      system: {
        platform: process.platform,
        arch: os.arch(),
        nodeVersion: process.version,
        cwd: process.cwd(),
        execPath: process.execPath,
        resourcesPath: process.resourcesPath || null
      }
    };
  }

  /**
   * Logs initialization health report on backend startup.
   */
  validateToolsOnStartup() {
    logger.info('[MediaTools] Initializing Central Media Tool Resolver...');
    const health = this.getHealthStatus(true);

    if (health.ffmpeg.available) {
      logger.info(`[MediaTools] FFmpeg: ${health.ffmpeg.path} (v${health.ffmpeg.version}) [Source: ${health.ffmpeg.source}]`);
    } else {
      logger.warn(`[MediaTools] FFmpeg NOT FOUND: ${health.ffmpeg.error}`);
    }

    if (health.ffprobe.available) {
      logger.info(`[MediaTools] FFprobe: ${health.ffprobe.path} (v${health.ffprobe.version}) [Source: ${health.ffprobe.source}]`);
    } else {
      logger.warn(`[MediaTools] FFprobe NOT FOUND: ${health.ffprobe.error}`);
    }

    if (health.mediaEngineReady) {
      logger.info('[MediaTools] Media engine READY');
    } else {
      logger.warn(`[MediaTools] Media engine NOT READY: ${health.userMessage}`);
    }

    return health;
  }

  /**
   * Sanitizes RTSP URLs for safe logging (masks passwords).
   */
  maskRtspUrl(rtspUrl) {
    if (!rtspUrl || typeof rtspUrl !== 'string') return '';
    return rtspUrl.replace(/:\/\/(.*?):(.*?)@/, '://$1:********@');
  }

  /**
   * Categorizes errors into user-friendly and technical diagnostic structures.
   */
  categorizeError(err, context = 'RTSP') {
    const rawMsg = err?.message || String(err || '');
    const lower = rawMsg.toLowerCase();

    if (lower.includes('enoent') || lower.includes('not found') || lower.includes('ffprobe could not be started')) {
      return {
        errorCode: ErrorCodes.FFPROBE_NOT_FOUND,
        userMessage: 'Video Analysis Engine Unavailable',
        description: 'FFprobe could not be started. Required media components are missing or unexecutable.',
        technicalDetails: rawMsg,
        suggestion: 'Ensure ffmpeg.exe and ffprobe.exe are located in application bin folder.'
      };
    }

    if (lower.includes('eacces') || lower.includes('eperm') || lower.includes('permission denied')) {
      return {
        errorCode: ErrorCodes.MEDIA_ENGINE_PERMISSION_DENIED,
        userMessage: 'Media Engine Permission Denied',
        description: 'Windows blocked execution of media engine tools.',
        technicalDetails: rawMsg,
        suggestion: 'Run application as Administrator or check antivirus permissions.'
      };
    }

    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth')) {
      return {
        errorCode: ErrorCodes.RTSP_AUTH_FAILED,
        userMessage: 'Camera Authentication Failed',
        description: 'Incorrect username or password provided for the camera RTSP stream.',
        technicalDetails: rawMsg,
        suggestion: 'Verify camera RTSP credentials in settings.'
      };
    }

    if (lower.includes('404') || lower.includes('not found')) {
      return {
        errorCode: ErrorCodes.RTSP_INVALID_URL,
        userMessage: 'Invalid Stream Path',
        description: 'Camera is reachable, but the specified RTSP URL path does not exist.',
        technicalDetails: rawMsg,
        suggestion: 'Check stream path (e.g. /live/0/MAIN or /ch1).'
      };
    }

    if (lower.includes('refused') || lower.includes('timeout') || lower.includes('unreachable') || lower.includes('etimeout')) {
      return {
        errorCode: ErrorCodes.RTSP_CONNECTION_FAILED,
        userMessage: 'Camera Unreachable',
        description: 'Unable to establish TCP/UDP connection to camera IP address or RTSP port (554).',
        technicalDetails: rawMsg,
        suggestion: 'Verify camera is powered on and connected to local network.'
      };
    }

    return {
      errorCode: ErrorCodes.RTSP_CONNECTION_FAILED,
      userMessage: 'RTSP Connection Error',
      description: rawMsg || 'An unknown error occurred while probing RTSP stream.',
      technicalDetails: rawMsg,
      suggestion: 'Retry connection or check camera status.'
    };
  }
}

const mediaToolResolver = new MediaToolResolver();
module.exports = {
  mediaToolResolver,
  MediaToolResolver,
  ErrorCodes
};
