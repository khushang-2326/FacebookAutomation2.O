'use strict';

const path = require('path');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const { gstreamerRuntimeDetector } = require('./gstreamerRuntimeDetector');
const { gstreamerPipelineBuilder } = require('./gstreamerPipelineBuilder');
const { Logger } = require('../utils/logger');

const logger = new Logger('GStreamerService');

class GStreamerService extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map(); // broadcastId -> ProcessEntry
    this._rpcIdCounter = 1;
    this._telemetryTimer = null;
  }

  /**
   * Checks if GStreamer runtime is available on the host system.
   */
  isAvailable() {
    const info = gstreamerRuntimeDetector.detectRuntime();
    return Boolean(info && info.available);
  }

  /**
   * Starts a live camera broadcast using the persistent GStreamer engine.
   * Supports single RTSP cameras or multi-camera schedules with instantaneous pad switching.
   *
   * @param {Object} broadcast - Broadcast mongoose document
   * @param {Object} automation - Automation mongoose document
   * @param {Object} mediaOrCamera - Camera configuration / multi-camera payload
   * @param {Object} streamTarget - Stream target { rtmpUrl, streamKey, ... }
   * @param {Object} options - Additional options { facebookResolution, youtubeResolution, hdmi, audio }
   */
  async startCameraStream(broadcast, automation, mediaOrCamera, streamTarget, options = {}) {
    const broadcastId = broadcast._id.toString();

    // Check if stream already exists for this broadcast
    if (this.activeProcesses.has(broadcastId)) {
      logger.warn(`[GStreamerService] Stream already active for broadcast ${broadcastId}. Stopping previous instance.`);
      await this.stopStream(broadcastId);
    }

    const runtimeInfo = gstreamerRuntimeDetector.detectRuntime();
    if (!runtimeInfo.available) {
      throw new Error(`GStreamer runtime unavailable: ${runtimeInfo.error}`);
    }

    // 1. Prepare camera sources
    let cameraList = [];
    if (mediaOrCamera.isMultiCamera && Array.isArray(mediaOrCamera.cameraSchedules)) {
      cameraList = mediaOrCamera.cameraSchedules.map(c => ({
        rtspUrl: c.rtspUrl || c.url,
        videoCodec: c.videoCodec || 'h264',
        audioCodec: c.audioCodec || 'aac',
        fps: c.fps || c.sourceFps || 30
      }));
    } else {
      const cameraService = require('./cameraService');
      const rtspUrl = cameraService.resolveRtspUrl(mediaOrCamera);
      cameraList = [{
        rtspUrl,
        videoCodec: mediaOrCamera.videoCodec || 'h264',
        audioCodec: mediaOrCamera.audioCodec || 'aac',
        fps: mediaOrCamera.fps || mediaOrCamera.sourceFps || 30
      }];
    }

    // 2. Prepare Facebook destination
    let fbConfig = null;
    const finalFbUrl = streamTarget?.rtmpUrl
      ? `${streamTarget.rtmpUrl.replace(/\/$/, '')}/${streamTarget.streamKey || ''}`
      : null;

    if (finalFbUrl && !automation.isYouTubeTarget) {
      const fbRes = options.facebookResolution || { width: 1920, height: 1080 };
      const fps = automation.targetFps || 60;
      fbConfig = {
        rtmpUrl: finalFbUrl,
        width: fbRes.width || 1920,
        height: fbRes.height || 1080,
        fps,
        bitrate: automation.targetBitrate || 6000
      };
    }

    // 3. Prepare YouTube destination
    let ytConfig = null;
    let ytUrl = null;
    if (automation.isYouTubeTarget && finalFbUrl) {
      ytUrl = finalFbUrl;
    } else if (automation.youtubeStreamUrl) {
      ytUrl = automation.youtubeStreamKey
        ? `${automation.youtubeStreamUrl.replace(/\/$/, '')}/${automation.youtubeStreamKey}`
        : automation.youtubeStreamUrl;
    }

    if (ytUrl) {
      const ytRes = options.youtubeResolution || { width: 2560, height: 1440 };
      const fps = automation.targetFps || 60;
      ytConfig = {
        rtmpUrl: ytUrl,
        width: ytRes.width || 2560,
        height: ytRes.height || 1440,
        fps,
        bitrate: automation.youtubeBitrate || 14000,
        codec: automation.youtubeCodec || 'h265'
      };
    }

    // 4. Prepare HDMI destination
    const hdmiConfig = {
      enabled: Boolean(automation.enableHdmiOutput || options.hdmi?.enabled),
      adapter: typeof automation.hdmiAdapterIndex === 'number' ? automation.hdmiAdapterIndex : 0,
      fullscreen: Boolean(automation.hdmiFullscreen ?? true)
    };

    // 5. Build GStreamer Pipeline String
    const pipelineStr = gstreamerPipelineBuilder.buildPipeline({
      cameras: cameraList,
      facebook: fbConfig,
      youtube: ytConfig,
      hdmi: hdmiConfig,
      audio: {
        source: automation.audioSource || 'silence',
        device: automation.audioDeviceName || null,
        bitrate: automation.audioBitrate || 128
      },
      runtimeInfo
    });

    logger.info(`[GStreamerService] Launching GStreamer Daemon for Broadcast ${broadcastId} with ${cameraList.length} camera inputs.`);

    // 6. Spawn Python GStreamer Daemon
    const pythonScript = path.resolve(__dirname, 'gstreamer_engine.py');
    const pythonExe = process.env.PYTHON_PATH || 'python';

    const child = spawn(pythonExe, [pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        GSTREAMER_BIN: runtimeInfo.binDir,
        PATH: `${runtimeInfo.binDir};${process.env.PATH || ''}`
      }
    });

    const pendingRequests = new Map();

    const entry = {
      broadcastId,
      automationId: automation._id.toString(),
      child,
      pendingRequests,
      status: 'INITIALIZING',
      cameraList,
      activeSlot: 0,
      isMultiCamera: cameraList.length > 1,
      startedAt: new Date(),
      pipelineStr
    };

    this.activeProcesses.set(broadcastId, entry);

    // Set up line-by-line stdio parsing
    let stdoutBuffer = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop(); // keep partial line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = jsonParseSafe(line);
          if (!msg) continue;

          // Event notification
          if (msg.event) {
            this._handleEngineEvent(broadcastId, msg.event, msg.data);
          }
          // Response to RPC request
          else if (typeof msg.id !== 'undefined') {
            const cb = pendingRequests.get(msg.id);
            if (cb) {
              pendingRequests.delete(msg.id);
              if (msg.error) {
                cb.reject(new Error(msg.error));
              } else {
                cb.resolve(msg.result);
              }
            }
          }
        } catch (err) {
          logger.warn(`[GStreamerService] Failed to parse engine output: ${err.message} (Line: ${line})`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const errStr = data.toString().trim();
      if (errStr) {
        logger.debug(`[GStreamer Engine STDERR] ${errStr}`);
      }
    });

    child.on('close', (code, signal) => {
      logger.info(`[GStreamerService] Engine process for broadcast ${broadcastId} exited (code: ${code}, signal: ${signal})`);
      entry.status = 'STOPPED';
      this.activeProcesses.delete(broadcastId);
      this.emit('processClosed', { broadcastId, automationId: entry.automationId, code, signal });
      this.emit('stream:stopped', { broadcastId, code, signal });
      if (this.activeProcesses.size === 0) {
        this._stopTelemetryTicker();
      }
    });

    child.on('error', (err) => {
      logger.error(`[GStreamerService] Engine child process error for broadcast ${broadcastId}: ${err.message}`);
      entry.status = 'ERROR';
      this.emit('stream:error', { broadcastId, automationId: entry.automationId, error: err.message });
    });

    // 7. Initialize and start pipeline via JSON-RPC
    try {
      await this._sendRpc(entry, 'init', {
        binDir: runtimeInfo.binDir,
        pipeline: pipelineStr
      });

      const startRes = await this._sendRpc(entry, 'start');
      entry.status = 'RUNNING';

      // Set initial starting camera pad if starting at a specific index
      const startSlot = mediaOrCamera.currentSlotIndex || 0;
      if (startSlot > 0 && startSlot < cameraList.length) {
        await this._sendRpc(entry, 'switch_camera', { slot: startSlot });
        entry.activeSlot = startSlot;
      }

      this._startTelemetryTicker();

      logger.info(`[GStreamerService] Broadcast ${broadcastId} is actively streaming on GStreamer engine.`);
      return { success: true, broadcastId, status: 'RUNNING' };
    } catch (err) {
      logger.error(`[GStreamerService] Failed to start pipeline for broadcast ${broadcastId}: ${err.message}`);
      await this.stopStream(broadcastId);
      throw err;
    }
  }

  /**
   * Switches the active camera pad in-process on the running GStreamer input-selector.
   * Zero disconnect, keeps Facebook, YouTube, HDMI, audio, and telemetry alive.
   *
   * @param {string} broadcastId
   * @param {number} slotIndex
   * @returns {Promise<Object>}
   */
  async switchCamera(broadcastId, slotIndex) {
    const entry = this.activeProcesses.get(String(broadcastId));
    if (!entry || entry.status !== 'RUNNING') {
      throw new Error(`GStreamer broadcast ${broadcastId} is not running`);
    }

    const idx = parseInt(slotIndex, 10);
    if (isNaN(idx) || idx < 0 || idx >= entry.cameraList.length) {
      throw new Error(`Invalid camera slot index: ${slotIndex} (Available: 0 to ${entry.cameraList.length - 1})`);
    }

    logger.info(`[GStreamerService] Switching broadcast ${broadcastId} to Slot #${idx + 1} (${idx}) in-process.`);

    const res = await this._sendRpc(entry, 'switch_camera', { slot: idx });
    entry.activeSlot = idx;

    // Emit socket event for real-time UI feedback
    try {
      const socketService = require('./socketService');
      const switchPayload = {
        broadcastId,
        automationId: entry.automationId,
        activeSlotIndex: idx,
        slotIndex: idx,
        latencyMs: res?.latencyMs || 0.1,
        uninterrupted: true,
        engine: 'GSTREAMER',
        timestamp: new Date().toISOString()
      };
      socketService.emitToAutomation(entry.automationId, 'camera:active_switched', switchPayload);
      socketService.emitGlobal('camera:active_switched', switchPayload);
    } catch (_) {}

    return {
      success: true,
      activeSlotIndex: idx,
      latencyMs: res?.latencyMs || 0.1,
      uninterrupted: true,
      engine: 'GSTREAMER'
    };
  }

  /**
   * Stops a running GStreamer broadcast cleanly.
   *
   * @param {string} broadcastId
   */
  async stopStream(broadcastId) {
    const entry = this.activeProcesses.get(String(broadcastId));
    if (!entry) {
      return { success: true, alreadyStopped: true };
    }

    logger.info(`[GStreamerService] Stopping GStreamer stream for broadcast ${broadcastId}`);
    try {
      await Promise.race([
        this._sendRpc(entry, 'stop'),
        new Promise(resolve => setTimeout(resolve, 2000))
      ]);
    } catch (_) {}

    // Gracefully terminate child process if still alive
    if (entry.child && !entry.child.killed) {
      try {
        entry.child.stdin.end();
      } catch (_) {}
      setTimeout(() => {
        if (entry.child && !entry.child.killed) {
          try {
            entry.child.kill('SIGTERM');
          } catch (_) {}
        }
      }, 500);
    }

    this.activeProcesses.delete(String(broadcastId));
    return { success: true, stopped: true };
  }

  /**
   * Stops all active GStreamer streams for a given automation.
   */
  async stopStreamsForAutomation(automationId) {
    const idStr = String(automationId);
    const stopped = [];
    for (const [bId, entry] of this.activeProcesses.entries()) {
      if (entry.automationId === idStr) {
        await this.stopStream(bId);
        stopped.push(bId);
      }
    }
    return { success: true, stopped };
  }

  /**
   * Queries real-time pipeline telemetry from the running engine.
   */
  async getTelemetry(broadcastId) {
    const entry = this.activeProcesses.get(String(broadcastId));
    if (!entry || entry.status !== 'RUNNING') {
      return { status: 'STOPPED', running: false, uptimeSeconds: 0 };
    }

    try {
      const res = await this._sendRpc(entry, 'get_telemetry');
      return {
        ...res,
        engine: 'GSTREAMER',
        activeSlotIndex: entry.activeSlot,
        cameraCount: entry.cameraList.length
      };
    } catch (err) {
      return { status: 'ERROR', error: err.message };
    }
  }

  /**
   * Starts periodic 1-second telemetry query loop across active GStreamer streams.
   */
  _startTelemetryTicker() {
    if (this._telemetryTimer) return;
    this._telemetryTimer = setInterval(async () => {
      if (this.activeProcesses.size === 0) {
        this._stopTelemetryTicker();
        return;
      }

      for (const [broadcastId, entry] of this.activeProcesses.entries()) {
        if (entry.status !== 'RUNNING') continue;
        try {
          const raw = await this._sendRpc(entry, 'get_telemetry');
          const elapsedSec = Math.max(1, Math.round((Date.now() - entry.startedAt.getTime()) / 1000));
          const currentCam = entry.cameraList[entry.activeSlot] || entry.cameraList[0] || {};

          const metrics = {
            broadcastId,
            automationId: entry.automationId,
            engine: 'GSTREAMER',
            pipelineState: raw?.status || 'PLAYING',
            fps: raw?.fps || 60,
            targetFps: 60,
            bitrate: raw?.bitrate || 6000,
            targetBitrate: 6000,
            droppedFrames: raw?.droppedFrames || 0,
            uptimeSeconds: raw?.uptimeSeconds || elapsedSec,
            activeSlotIndex: entry.activeSlot,
            cameraCount: entry.cameraList.length,
            currentCamera: currentCam.name || `Slot #${entry.activeSlot + 1}`,
            videoCodec: currentCam.videoCodec || 'h264',
            audioCodec: currentCam.audioCodec || 'aac',
            resolution: '1920x1080',
            facebookConnected: true,
            youtubeConnected: Boolean(entry.pipelineStr && entry.pipelineStr.includes('yt_mux')),
            hdmiActive: Boolean(entry.pipelineStr && entry.pipelineStr.includes('d3d11videosink')),
            timestamp: new Date().toISOString()
          };

          entry.metrics = metrics;
          this.emit('metrics', metrics);
        } catch (_) {}
      }
    }, 1000);
  }

  _stopTelemetryTicker() {
    if (this._telemetryTimer) {
      clearInterval(this._telemetryTimer);
      this._telemetryTimer = null;
    }
  }

  /**
   * Returns active GStreamer pipeline entry for an automation ID.
   */
  getActivePipeline(automationId) {
    const autoIdStr = String(automationId);
    for (const [, entry] of this.activeProcesses.entries()) {
      if (entry.automationId === autoIdStr) return entry;
    }
    return null;
  }

  /**
   * Checks whether a broadcast or automation currently has a running GStreamer pipeline.
   */
  isRunning(id) {
    const idStr = String(id);
    if (this.activeProcesses.has(idStr)) {
      return this.activeProcesses.get(idStr).status === 'RUNNING';
    }
    const entry = this.getActivePipeline(idStr);
    return Boolean(entry && entry.status === 'RUNNING');
  }

  /**
   * Checks whether an OS process ID is alive.
   */
  isPidAlive(pid) {
    if (!pid || typeof pid !== 'number') return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return e.code === 'EPERM';
    }
  }

  /**
   * Returns health and uptime state for an automation.
   */
  getHealth(automationId) {
    const entry = this.getActivePipeline(automationId);
    if (!entry) return { status: 'STOPPED', running: false, uptimeSeconds: 0 };
    return {
      status: entry.status,
      running: entry.status === 'RUNNING',
      uptimeSeconds: entry.startedAt ? Math.round((Date.now() - entry.startedAt.getTime()) / 1000) : 0,
      activeSlotIndex: entry.activeSlot,
      cameraCount: entry.cameraList?.length || 1,
      metrics: entry.metrics || null
    };
  }

  /**
   * Emergency stop all running GStreamer broadcasts immediately.
   */
  async emergencyStopAll() {
    logger.warn('[GStreamerService] Emergency Stop: stopping all active GStreamer streams');
    const promises = [];
    for (const broadcastId of this.activeProcesses.keys()) {
      promises.push(this.stopStream(broadcastId));
    }
    await Promise.allSettled(promises);
    this._stopTelemetryTicker();
    return { success: true };
  }

  /**
   * Gets current state of a broadcast.
   */
  getStatus(broadcastId) {
    const entry = this.activeProcesses.get(String(broadcastId));
    return entry ? entry.status : 'STOPPED';
  }

  /**
   * Handles asynchronous events emitted by the GStreamer engine.
   */
  _handleEngineEvent(broadcastId, eventName, data) {
    logger.debug(`[GStreamer Event] (${broadcastId}) ${eventName}: ${JSON.stringify(data)}`);
    this.emit(eventName, { broadcastId, data });

    if (eventName === 'error') {
      logger.error(`[GStreamer Error] Broadcast ${broadcastId}: ${data.debug || data.message}`);
    } else if (eventName === 'camera_switched') {
      logger.info(`[GStreamer Switched] Broadcast ${broadcastId} -> Slot ${data.slot} (Pad: ${data.pad}, Latency: ${data.latencyMs}ms)`);
    }
  }

  /**
   * Sends a JSON-RPC request to the GStreamer engine daemon over stdin.
   */
  _sendRpc(entry, method, params = {}) {
    return new Promise((resolve, reject) => {
      if (!entry.child || entry.child.killed || !entry.child.stdin.writable) {
        return reject(new Error('Engine child process stdin is not writable'));
      }

      const id = this._rpcIdCounter++;
      const payload = JSON.stringify({ id, method, params }) + '\n';

      const timeout = setTimeout(() => {
        entry.pendingRequests.delete(id);
        reject(new Error(`RPC timeout waiting for response to '${method}' (id: ${id})`));
      }, 10000);

      entry.pendingRequests.set(id, {
        resolve: (res) => {
          clearTimeout(timeout);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      entry.child.stdin.write(payload);
    });
  }
}

function jsonParseSafe(str) {
  try {
    return JSON.parse(str);
  } catch (_) {
    return null;
  }
}

const gstreamerService = new GStreamerService();
module.exports = { GStreamerService, gstreamerService };
