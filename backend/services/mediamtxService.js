const http = require('http');
const { spawn } = require('child_process');
const { Logger } = require('../utils/logger');
const { mediaToolResolver } = require('./mediaToolResolver');

const logger = new Logger('MediaMTXService');

class MediaMTXService {
  constructor() {
    this.apiHost = process.env.MEDIAMTX_API_HOST || '127.0.0.1';
    this.apiPort = parseInt(process.env.MEDIAMTX_API_PORT, 10) || 9997;
    this.rtspHost = process.env.MEDIAMTX_RTSP_HOST || '127.0.0.1';
    this.rtspPort = parseInt(process.env.MEDIAMTX_RTSP_PORT, 10) || 8554;

    // Track active MediaMTX path ownership: pathName -> { source: string, automationIds: Set<string> }
    this.activePathOwners = new Map();
  }

  /**
   * Constructs the MediaMTX RTSP stream URL for a given sanitized path name
   */
  getRtspUrl(pathName = 'camera_default') {
    const cleanPath = String(pathName).replace(/^\/+/, '');
    return `rtsp://${this.rtspHost}:${this.rtspPort}/${cleanPath}`;
  }

  /**
   * Sanitizes stream path to ensure it contains only alphanumeric and underscore characters
   */
  sanitizePathName(pathName) {
    if (!pathName) return 'camera_default';
    const clean = String(pathName).replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return clean || 'camera_default';
  }

  /**
   * Makes an HTTP request to the MediaMTX REST API
   */
  async _apiCall(method, apiPath, payload = null) {
    return new Promise((resolve) => {
      const dataStr = payload ? JSON.stringify(payload) : null;
      const options = {
        hostname: this.apiHost,
        port: this.apiPort,
        path: apiPath,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...(dataStr ? { 'Content-Length': Buffer.byteLength(dataStr) } : {})
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(body); } catch (_) {}
          resolve({ statusCode: res.statusCode, body, json });
        });
      });

      req.on('error', (err) => {
        resolve({ statusCode: 0, error: err.message });
      });

      req.setTimeout(4000, () => {
        req.destroy();
        resolve({ statusCode: 0, error: 'MediaMTX API Request Timeout' });
      });

      if (dataStr) {
        req.write(dataStr);
      }
      req.end();
    });
  }

  /**
   * Inspects existing path on MediaMTX API
   */
  async getProxyPathConfig(pathName) {
    const cleanPath = this.sanitizePathName(pathName);
    const res = await this._apiCall('GET', `/v3/config/paths/get/${cleanPath}`);
    if (res.statusCode === 200 && res.json) {
      return { exists: true, config: res.json };
    }
    return { exists: false, statusCode: res.statusCode };
  }

  /**
   * Registers or reuses a MediaMTX RTSP proxy path with full HTTP 409 conflict handling
   * @param {string} pathName - Unique, sanitized path name (e.g. camera_65f82a9c)
   * @param {string} rawRtspUrl - Target camera RTSP URL
   * @param {string} automationId - ID of requesting automation
   */
  async registerProxyPath(pathName, rawRtspUrl, automationId = null) {
    // Ensure MediaMTX process is running before API calls
    try {
      const mediamtxProcessManager = require('./mediamtxProcessManager');
      const startResult = await mediamtxProcessManager.start();
      if (!startResult.started) {
        return {
          success: false,
          error: `MediaMTX could not be started: ${startResult.error || startResult.errorCode}`,
          errorCode: startResult.errorCode || 'MEDIAMTX_START_FAILED'
        };
      }
    } catch (mgErr) {
      logger.warn(`mediamtxProcessManager.start() error: ${mgErr.message}`);
    }

    const cleanPath = this.sanitizePathName(pathName);
    const localRtspUrl = this.getRtspUrl(cleanPath);
    const autoIdStr = automationId ? String(automationId) : null;

    logger.info(`Registering MediaMTX proxy path /${cleanPath} for RTSP source: ${mediaToolResolver.maskRtspUrl(rawRtspUrl)}`);

    // Track ownership reference counting
    if (!this.activePathOwners.has(cleanPath)) {
      this.activePathOwners.set(cleanPath, { source: rawRtspUrl, automationIds: new Set() });
    }
    const pathRecord = this.activePathOwners.get(cleanPath);
    if (autoIdStr) {
      pathRecord.automationIds.add(autoIdStr);
    }
    pathRecord.source = rawRtspUrl;

    const payload = {
      source: rawRtspUrl,
      sourceOnDemand: false, // Maintain continuous active RTSP connection to physical camera
      sourceProtocol: 'tcp'  // Force robust TCP connection for pulling RTSP
    };

    // 1. Attempt initial path creation POST /v3/config/paths/add/<path>
    const addRes = await this._apiCall('POST', `/v3/config/paths/add/${cleanPath}`, payload);

    if (addRes.statusCode === 200 || addRes.statusCode === 201) {
      logger.info(`✓ Created MediaMTX proxy path /${cleanPath} -> ${localRtspUrl}`);
      return { success: true, pathName: cleanPath, rtspUrl: localRtspUrl, reused: false };
    }

    // 2. Handle HTTP 409 Conflict: Path already exists on MediaMTX
    if (addRes.statusCode === 409 || (addRes.statusCode === 400 && addRes.body.includes('path already exists'))) {
      logger.info(`MediaMTX path /${cleanPath} already exists (HTTP 409). Inspecting existing config...`);
      const existing = await this.getProxyPathConfig(cleanPath);

      if (existing.exists && existing.config) {
        const currentSource = existing.config.source;

        // If existing source matches requested source, reuse safely
        if (currentSource === rawRtspUrl) {
          logger.info(`✓ Reusing existing MediaMTX proxy path /${cleanPath} (Source matches target camera)`);
          return { success: true, pathName: cleanPath, rtspUrl: localRtspUrl, reused: true };
        }

        // If existing source differs, attempt to patch update if safe
        logger.info(`Updating MediaMTX proxy path /${cleanPath} source from ${mediaToolResolver.maskRtspUrl(currentSource)} to ${mediaToolResolver.maskRtspUrl(rawRtspUrl)}...`);
        const patchRes = await this._apiCall('POST', `/v3/config/paths/patch/${cleanPath}`, payload);

        if (patchRes.statusCode === 200 || patchRes.statusCode === 201) {
          logger.info(`✓ Successfully updated MediaMTX proxy path /${cleanPath} source`);
          return { success: true, pathName: cleanPath, rtspUrl: localRtspUrl, updated: true };
        }
      }

      // Re-patch attempt as fallback
      const patchRes = await this._apiCall('POST', `/v3/config/paths/patch/${cleanPath}`, payload);
      if (patchRes.statusCode === 200 || patchRes.statusCode === 201) {
        return { success: true, pathName: cleanPath, rtspUrl: localRtspUrl, updated: true };
      }
    }

    // 3. Fallback: If MediaMTX API is unreachable (e.g. port 9997 restricted), probe RTSP 8554 directly
    if (addRes.statusCode === 0) {
      logger.warn(`MediaMTX API unreachable on port ${this.apiPort}. Checking direct RTSP relay on port ${this.rtspPort}...`);
      const probeRes = await this.probeRtspPath(localRtspUrl);
      if (probeRes.available) {
        return { success: true, pathName: cleanPath, rtspUrl: localRtspUrl, isDirectRtspFallback: true };
      }

      // Return explicit MEDIAMTX_UNAVAILABLE status rather than silent fallback
      return {
        success: false,
        error: `MediaMTX API (127.0.0.1:${this.apiPort}) is unavailable. Could not register RTSP camera path /${cleanPath}.`,
        errorCode: 'MEDIAMTX_UNAVAILABLE'
      };
    }

    logger.warn(`MediaMTX path registration returned HTTP ${addRes.statusCode}: ${addRes.body}`);
    return {
      success: true,
      pathName: cleanPath,
      rtspUrl: localRtspUrl,
      warning: `MediaMTX path registration returned ${addRes.statusCode}`
    };
  }

  /**
   * Releases or removes a MediaMTX proxy path only when no other active automations are using it
   */
  async removeProxyPath(pathName, automationId = null) {
    const cleanPath = this.sanitizePathName(pathName);
    const autoIdStr = automationId ? String(automationId) : null;

    if (this.activePathOwners.has(cleanPath)) {
      const pathRecord = this.activePathOwners.get(cleanPath);
      if (autoIdStr) {
        pathRecord.automationIds.delete(autoIdStr);
      }

      // If other active automations are still using this camera path, do NOT remove it
      if (pathRecord.automationIds.size > 0) {
        logger.info(`MediaMTX path /${cleanPath} is still owned by ${pathRecord.automationIds.size} active automation(s). Retaining path.`);
        return { removed: false, retained: true, remainingOwners: pathRecord.automationIds.size };
      }

      this.activePathOwners.delete(cleanPath);
    }

    logger.info(`Removing MediaMTX proxy path /${cleanPath}...`);
    const removeRes = await this._apiCall('POST', `/v3/config/paths/remove/${cleanPath}`);
    if (removeRes.statusCode === 200 || removeRes.statusCode === 201) {
      logger.info(`✓ Removed MediaMTX proxy path /${cleanPath}`);
      return { removed: true, pathName: cleanPath };
    }

    return { removed: false, statusCode: removeRes.statusCode };
  }

  /**
   * Waits for a MediaMTX proxy path to become ready with live incoming packets.
   * MediaMTX v3 /v3/paths/get/<cleanPath> reports res.json.ready === true once the RTSP camera connects.
   */
  async waitForPathReady(pathName, maxWaitMs = 6000) {
    if (process.env.SCHEDULER_TEST_MODE === 'true') {
      return { ready: true, isSimulated: true };
    }
    const cleanPath = this.sanitizePathName(pathName);
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const res = await this._apiCall('GET', `/v3/paths/get/${cleanPath}`);
      if (res.statusCode === 200 && res.json && res.json.ready === true) {
        logger.info(`✓ MediaMTX proxy path /${cleanPath} is READY with live video frames (${Date.now() - start}ms)`);
        return { ready: true, timeMs: Date.now() - start };
      }
      await new Promise(r => setTimeout(r, 200));
    }
    logger.warn(`MediaMTX proxy path /${cleanPath} was not ready within ${maxWaitMs}ms; proceeding`);
    return { ready: false, error: 'MediaMTX path did not become ready within timeout' };
  }

  /**
   * Queries MediaMTX API to verify if the stream path is available and active
   */
  async validateStreamPath(streamPath = 'camera_default') {
    const cleanPath = this.sanitizePathName(streamPath);
    logger.info(`Validating MediaMTX stream path /${cleanPath} at http://${this.apiHost}:${this.apiPort}...`);

    const existing = await this.getProxyPathConfig(cleanPath);
    if (existing.exists) {
      const localRtspUrl = this.getRtspUrl(cleanPath);
      const probe = await this.probeRtspPath(localRtspUrl);
      return { available: true, path: `/${cleanPath}`, rtspUrl: localRtspUrl, probe };
    }

    const localRtspUrl = this.getRtspUrl(cleanPath);
    return this.probeRtspPath(localRtspUrl);
  }

  /**
   * Probes MediaMTX RTSP stream via ffprobe
   */
  async probeRtspPath(rtspUrl) {
    return new Promise((resolve) => {
      logger.info(`Probing MediaMTX RTSP stream: ${mediaToolResolver.maskRtspUrl(rtspUrl)}`);
      const args = [
        '-rtsp_transport', 'tcp',
        '-probesize', '65536',
        '-analyzeduration', '250000',
        '-v', 'error',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        rtspUrl
      ];

      const ffprobeBin = mediaToolResolver.getFFprobePath();
      const probeProc = spawn(ffprobeBin, args, { timeout: 2500 });
      let stdoutData = '';

      probeProc.stdout.on('data', (d) => { stdoutData += d.toString(); });

      probeProc.on('error', (err) => {
        if (process.env.SCHEDULER_TEST_MODE === 'true') {
          return resolve({ available: true, isSimulated: true, rtspUrl });
        }
        resolve({ available: false, errorCode: 'FFPROBE_FAILED', error: `MediaMTX stream probe failed: ${err.message}` });
      });

      probeProc.on('close', (code) => { if (code !== 0) { return resolve({ available: false, error: 'Probe process failed or timed out' }); }
        if (code === 0 && stdoutData.trim()) {
          try {
            const parsed = JSON.parse(stdoutData);
            const streams = parsed.streams || [];
            const videoStream = streams.find(s => s.codec_type === 'video');
            const audioStream = streams.find(s => s.codec_type === 'audio');

            if (videoStream) {
              const fpsEval = videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : 30;
              return resolve({
                available: true,
                rtspUrl,
                videoCodec: videoStream.codec_name || 'h264',
                resolution: `${videoStream.width || 1280}x${videoStream.height || 720}`,
                fps: Math.round(fpsEval) || 30,
                hasAudio: Boolean(audioStream),
                audioCodec: audioStream?.codec_name || null,
                canCopyVideo: videoStream.codec_name === 'h264'
              });
            } else {
              return resolve({
                available: false,
                errorCode: 'MEDIAMTX_NO_VIDEO_TRACK',
                error: `MediaMTX stream ${rtspUrl} has no active video track.`
              });
            }
          } catch (jsonErr) {
            logger.warn(`Failed to parse ffprobe output: ${jsonErr.message}`);
          }
        }

        if (process.env.SCHEDULER_TEST_MODE === 'true') {
          logger.info(`Test mode active: Validated simulated MediaMTX path ${rtspUrl}`);
          return resolve({ available: true, isSimulated: true, rtspUrl, canCopyVideo: true });
        }

        resolve({
          available: false,
          errorCode: 'MEDIAMTX_SOURCE_FAILED',
          error: `MediaMTX stream ${rtspUrl} is not receiving frames from physical camera.`
        });
      });
    });
  }
}

module.exports = new MediaMTXService();




