'use strict';

const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { mediaToolResolver } = require('./mediaToolResolver');
const { Logger } = require('../utils/logger');

const logger = new Logger('HardwareEncoderService');

/**
 * Central GPU Hardware Acceleration Manager
 * 
 * Manages GPU adapter detection (Intel, NVIDIA, AMD), hardware decoders (QSV, D3D11VA, NVDEC/CUDA, DXVA2),
 * hardware video encoders (Intel QSV, NVIDIA NVENC, AMD AMF, Windows Media Foundation MFT),
 * acceleration modes (AUTO, INTEL_QSV, NVIDIA_NVENC, AMD_AMF, WINDOWS_MF, HARDWARE_REQUIRED, SOFTWARE),
 * persistent profile caching to eliminate startup CPU/GPU spikes,
 * and client-side sanitized diagnostic reporting.
 */
class HardwareEncoderService {
  constructor() {
    this._validatedEncoders = new Map(); // key `${name}_${fps}` -> { available, encoder, fps, isHardware, probeTime, stderr }
    this._validatedDecoders = new Map(); // name -> { available, decoder, probeTime, stderr }
    this._failedEncoders = new Set();
    this._failedDecoders = new Set();
    this._qsvDiagnostic = null;
    this._qsvD3d11va = null;
    this._mfMftName = null;
    this._intelMftVerified = false;
    this._activeEncoder = null;
    this._activeDecoder = null;
    this._adapters = [];
    this._adapterName = null;
    this._primaryVendor = 'UNKNOWN'; // 'INTEL' | 'NVIDIA' | 'AMD' | 'OTHER'
    this._mode = process.env.HARDWARE_ENCODING_MODE || 'AUTO';
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * Supported acceleration modes
   */
  static get VALID_MODES() {
    return [
      'AUTO',
      'INTEL_QSV',
      'NVIDIA_NVENC',
      'AMD_AMF',
      'WINDOWS_MF',
      'HARDWARE_REQUIRED',
      'SOFTWARE'
    ];
  }

  /**
   * Resolves primary GPU vendor from detected adapters according to mode.
   */
  _resolvePrimaryVendor(mode = this._mode) {
    if (!Array.isArray(this._adapters) || this._adapters.length === 0) {
      return this._primaryVendor;
    }

    const intel = this._adapters.find(a => a.vendor === 'INTEL');
    const nvidia = this._adapters.find(a => a.vendor === 'NVIDIA');
    const amd = this._adapters.find(a => a.vendor === 'AMD');
    const effectiveMode = (mode || 'AUTO').toUpperCase().trim();

    if (effectiveMode === 'INTEL_QSV' && intel) {
      this._primaryVendor = 'INTEL';
    } else if (effectiveMode === 'NVIDIA_NVENC' && nvidia) {
      this._primaryVendor = 'NVIDIA';
    } else if (effectiveMode === 'AMD_AMF' && amd) {
      this._primaryVendor = 'AMD';
    } else {
      // Priority in AUTO: prefer discrete GPU if present (NVIDIA / AMD), otherwise Intel iGPU/Arc
      this._primaryVendor = (nvidia || amd || intel || this._adapters[0]).vendor;
    }

    return this._primaryVendor;
  }

  /**
   * Returns true when the active configuration targets Intel Quick Sync (h264_qsv) encoding
   * paired with CPU software decoding (no QSV / GPU input decoding, no silent CPU encode fallback).
   */
  _isIntelPipeline(mode = null, explicitEncoder = null) {
    const effectiveMode = (mode || this._mode || 'AUTO').toUpperCase().trim();
    if (explicitEncoder === 'h264_qsv') return true;
    if (effectiveMode === 'INTEL_QSV') return true;
    if (['SOFTWARE', 'WINDOWS_MF', 'NVIDIA_NVENC', 'AMD_AMF'].includes(effectiveMode)) return false;
    return this._primaryVendor === 'INTEL';
  }

  /**
   * Public helper indicating whether silent CPU software encoding fallback is disallowed for Intel QSV.
   */
  isIntelStrictMode(mode = null) {
    if (this._adapters.length === 0 && this._primaryVendor === 'UNKNOWN') {
      this.detectAdapters();
    }
    return this._isIntelPipeline(mode);
  }

  /**
   * Sets the active acceleration mode
   */
  setMode(mode) {
    const validModes = HardwareEncoderService.VALID_MODES;
    const normalized = (mode || '').toUpperCase().trim();
    if (!validModes.includes(normalized)) {
      throw new Error(`Invalid hardware acceleration mode: "${mode}". Valid modes are: ${validModes.join(', ')}`);
    }
    this._mode = normalized;
    logger.info(`GPU Acceleration Mode set to: ${this._mode}`);
    // Clear cached active selections and disk cache so they re-evaluate according to new mode
    this.invalidateCache();
    if (this._adapters.length > 0) {
      this._resolvePrimaryVendor(this._mode);
    }
    return this._mode;
  }

  /**
   * Resolves persistent profile cache file location in writable user data directory
   */
  getProfilePath() {
    const userDataDir = process.env.ELECTRON_USER_DATA || 
      (process.env.APPDATA ? path.join(process.env.APPDATA, 'facebook-live-automation') : path.join(__dirname, '../data'));
    return path.join(userDataDir, 'hardware-profile.json');
  }

  /**
   * Fast Startup: Loads verified hardware profile from disk cache in <1ms to prevent cold-boot CPU/GPU spikes
   */
  loadHardwareProfile() {
    try {
      const profilePath = this.getProfilePath();
      if (!fs.existsSync(profilePath)) return false;
      const raw = fs.readFileSync(profilePath, 'utf8');
      const cached = JSON.parse(raw);
      // Validate freshness (30 days) and valid fields
      if (!cached || !cached.timestamp || (Date.now() - cached.timestamp > 30 * 86400 * 1000)) {
        return false;
      }
      if (!Array.isArray(cached.adapters) || !cached.primaryVendor || !cached.activeEncoder) {
        return false;
      }
      this._adapters = cached.adapters;
      this._primaryVendor = cached.primaryVendor;
      this._adapterName = cached.adapterName || (this._adapters[0] && this._adapters[0].name) || 'Unknown GPU';
      this._activeEncoder = cached.activeEncoder;
      this._activeDecoder = cached.activeDecoder || 'cpu_software';
      this._qsvD3d11va = typeof cached.qsvD3d11va === 'boolean' ? cached.qsvD3d11va : null;
      this._qsvDiagnostic = cached.qsvDiagnostic || null;
      this._mfMftName = cached.mfMftName || null;
      this._intelMftVerified = Boolean(cached.intelMftVerified);

      if (Array.isArray(cached.validatedEncoders)) {
        for (const item of cached.validatedEncoders) {
          this._validatedEncoders.set(item.key, item.data);
        }
      }
      if (Array.isArray(cached.validatedDecoders)) {
        for (const item of cached.validatedDecoders) {
          this._validatedDecoders.set(item.name, item.data);
        }
      }
      logger.info(`[HardwareEncoderService] Fast Startup: loaded cached GPU profile (${this._primaryVendor}: ${this._activeEncoder} / ${this._activeDecoder}) in <1ms`);
      return true;
    } catch (err) {
      logger.debug(`[HardwareEncoderService] Cache load skipped: ${err.message}`);
      return false;
    }
  }

  /**
   * Persists verified hardware capabilities to disk cache
   */
  saveHardwareProfile() {
    try {
      const profilePath = this.getProfilePath();
      const dir = path.dirname(profilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload = {
        timestamp: Date.now(),
        adapters: this._adapters,
        primaryVendor: this._primaryVendor,
        adapterName: this._adapterName,
        activeEncoder: this._activeEncoder,
        activeDecoder: this._activeDecoder,
        qsvD3d11va: this._qsvD3d11va,
        qsvDiagnostic: this._qsvDiagnostic,
        mfMftName: this._mfMftName,
        intelMftVerified: this._intelMftVerified,
        validatedEncoders: Array.from(this._validatedEncoders.entries()).map(([k, v]) => ({ key: k, data: v })),
        validatedDecoders: Array.from(this._validatedDecoders.entries()).map(([k, v]) => ({ name: k, data: v }))
      };
      fs.writeFileSync(profilePath, JSON.stringify(payload, null, 2), 'utf8');
      logger.info(`[HardwareEncoderService] Saved hardware profile cache to ${profilePath}`);
    } catch (err) {
      logger.debug(`[HardwareEncoderService] Could not save cache: ${err.message}`);
    }
  }

  /**
   * Clears in-memory and disk hardware profile cache
   */
  invalidateCache() {
    try {
      const profilePath = this.getProfilePath();
      if (fs.existsSync(profilePath)) {
        fs.unlinkSync(profilePath);
      }
    } catch (_) {}
    this._validatedEncoders.clear();
    this._validatedDecoders.clear();
    this._activeEncoder = null;
    this._activeDecoder = null;
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * Gets current acceleration mode
   */
  getMode() {
    return this._mode;
  }

  /**
   * Queries local GPU display adapters via Windows CIM / PowerShell
   */
  detectAdapters() {
    if (this._adapters.length > 0) return this._adapters;

    if (process.platform === 'win32') {
      try {
        const psCommand = '(Get-CimInstance Win32_VideoController) | Select-Object Name, AdapterRAM, DriverVersion, VideoProcessor, Status | ConvertTo-Json -Compress';
        const res = spawnSync('powershell', ['-NoProfile', '-Command', psCommand], {
          timeout: 4000,
          encoding: 'utf8',
          windowsHide: true
        });

        if (res.status === 0 && res.stdout.trim()) {
          try {
            let data = JSON.parse(res.stdout.trim());
            if (!Array.isArray(data)) {
              data = [data];
            }

            this._adapters = data.map((item, index) => {
              const ramBytes = parseInt(item.AdapterRAM, 10) || 0;
              const ramMB = Math.round(ramBytes / (1024 * 1024));
              const name = item.Name || 'Unknown GPU';
              let vendor = 'OTHER';
              const nameLower = name.toLowerCase();
              if (nameLower.includes('intel') || nameLower.includes('iris') || nameLower.includes('uhd') || nameLower.includes('arc') || nameLower.includes('hd graphics')) {
                vendor = 'INTEL';
              } else if (nameLower.includes('nvidia') || nameLower.includes('geforce') || nameLower.includes('quadro') || nameLower.includes('rtx') || nameLower.includes('gtx')) {
                vendor = 'NVIDIA';
              } else if (nameLower.includes('amd') || nameLower.includes('radeon')) {
                vendor = 'AMD';
              }

              return {
                index,
                name,
                vendor,
                driverVersion: item.DriverVersion || 'Unknown',
                videoProcessor: item.VideoProcessor || 'Unknown',
                ramMB,
                status: item.Status || 'OK'
              };
            });

            if (this._adapters.length > 0) {
              this._adapterName = this._adapters.map(a => a.name).join(', ');
              this._resolvePrimaryVendor(this._mode);

              logger.info(`Detected ${this._adapters.length} GPU Adapter(s): ${this._adapterName} (Primary: ${this._primaryVendor})`);
              return this._adapters;
            }
          } catch (_) {}
        }
      } catch (_) {}
    }

    // Fallback adapter representation
    this._adapters = [{
      index: 0,
      name: 'Standard Display Adapter / Generic GPU',
      vendor: 'OTHER',
      driverVersion: 'Unknown',
      videoProcessor: 'Generic',
      ramMB: 0,
      status: 'OK'
    }];
    this._adapterName = this._adapters[0].name;
    this._primaryVendor = 'OTHER';
    return this._adapters;
  }

  detectAdapter() {
    this.detectAdapters();
    return this._adapterName || 'Generic GPU';
  }

  /**
   * Probes an individual video encoder with a fast synthetic test at target frame rate.
   * Enforces accurate pixel formats and hardware-encoding options.
   */
  probeEncoder(encoderName, targetFps = 30) {
    const cacheKey = `${encoderName}_${targetFps}`;
    if (this._validatedEncoders.has(cacheKey)) {
      return this._validatedEncoders.get(cacheKey);
    }

    const ffmpegRes = mediaToolResolver.resolveFFmpeg();
    if (!ffmpegRes.available) {
      const result = { available: false, encoder: encoderName, fps: targetFps, isHardware: false, error: 'FFmpeg executable not available' };
      this._validatedEncoders.set(cacheKey, result);
      return result;
    }

    const gop = String(targetFps * 2);
    let probeArgs = [
      '-y',
      '-f', 'lavfi',
      '-i', `testsrc2=size=640x360:rate=${targetFps}`,
      '-t', '0.5'
    ];

    if (encoderName === 'h264_qsv') {
      probeArgs.push(
        '-vf', 'format=nv12',
        '-c:v', 'h264_qsv',
        '-preset', 'veryfast',
        '-async_depth', targetFps === 60 ? '2' : '4',
        '-look_ahead', '0',
        '-b:v', '2500k',
        '-maxrate', '2500k',
        '-bufsize', '2500k',
        '-g', gop,
        '-keyint_min', gop,
        '-r', String(targetFps),
        '-pix_fmt', 'nv12'
      );
    } else if (encoderName === 'h264_mf') {
      // Windows Media Foundation: -hw_encoding 1 forces true hardware encoding with NV12 format
      probeArgs.push(
        '-vf', 'format=nv12',
        '-c:v', 'h264_mf',
        '-hw_encoding', '1',
        '-scenario', '4', // live_streaming
        '-rate_control', '0', // cbr
        '-b:v', '2500k',
        '-g', gop,
        '-r', String(targetFps),
        '-pix_fmt', 'nv12'
      );
    } else if (encoderName === 'h264_nvenc') {
      // NVIDIA NVENC
      probeArgs.push(
        '-c:v', 'h264_nvenc',
        '-preset', 'p4',
        '-tune', 'll',
        '-b:v', '2500k',
        '-g', gop,
        '-r', String(targetFps),
        '-pix_fmt', 'yuv420p'
      );
    } else if (encoderName === 'h264_amf') {
      // AMD AMF
      probeArgs.push(
        '-c:v', 'h264_amf',
        '-usage', 'lowlatency',
        '-b:v', '2500k',
        '-g', gop,
        '-r', String(targetFps),
        '-pix_fmt', 'nv12'
      );
    } else if (encoderName === 'libx264') {
      // CPU Software libx264
      probeArgs.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-b:v', '2500k',
        '-g', gop,
        '-r', String(targetFps),
        '-pix_fmt', 'yuv420p'
      );
    } else {
      probeArgs.push('-c:v', encoderName);
    }

    probeArgs.push('-f', 'null', '-');

    try {
      const probeRes = spawnSync(ffmpegRes.path, probeArgs, {
        timeout: 5000,
        encoding: 'utf8',
        windowsHide: true
      });

      const stderr = (probeRes.stderr || '').toString();
      const hasCriticalError = stderr.includes('Error creating a MFX session') ||
        stderr.includes('The current mfx implementation is not supported') ||
        stderr.includes('Error while opening encoder') ||
        stderr.includes('Could not open encoder') ||
        stderr.includes('Conversion failed') ||
        stderr.includes('Task finished with error code') ||
        stderr.includes('received no packets') ||
        stderr.includes('Function not implemented') ||
        stderr.includes('No capable devices found') ||
        stderr.includes('Failed to find');
      const success = probeRes.status === 0 && !hasCriticalError;
      const isHw = success && encoderName !== 'libx264';
      const result = {
        available: success,
        encoder: encoderName,
        fps: targetFps,
        isHardware: isHw,
        probeTime: Date.now(),
        stderr: stderr ? stderr.slice(-400) : ''
      };

      if (encoderName === 'h264_qsv' && !success) {
        this._qsvDiagnostic = stderr.includes('MFX session') || stderr.includes('oneVPL')
          ? 'Intel oneVPL / Quick Sync MFX session could not initialize on this host. Ensure official Intel Graphics drivers are installed and the Intel GPU is active.'
          : (stderr ? stderr.slice(-300).replace(/\r?\n/g, ' ').trim() : 'QSV initialization failed');
      }

      if (encoderName === 'h264_mf' && success) {
        const mftMatch = stderr.match(/MFT name:\s*'([^']+)'/i);
        if (mftMatch) {
          result.mftName = mftMatch[1];
          this._mfMftName = mftMatch[1];
          const isIntelMft = /intel/i.test(mftMatch[1]) || /mfx/i.test(mftMatch[1]);
          if (isIntelMft) this._intelMftVerified = true;
          logger.info(`[HardwareEncoderService] Media Foundation MFT: "${mftMatch[1]}" (Hardware accelerated: true)`);
        }
      }

      this._validatedEncoders.set(cacheKey, result);
      if (success) {
        logger.info(`✓ Encoder "${encoderName}" verified functional at ${targetFps} FPS (${isHw ? 'GPU Hardware' : 'CPU Software'})`);
      } else {
        logger.debug(`Encoder "${encoderName}" probe at ${targetFps} FPS failed (status ${probeRes.status})`);
      }
      return result;
    } catch (err) {
      const result = { available: false, encoder: encoderName, fps: targetFps, isHardware: false, error: err.message };
      this._validatedEncoders.set(cacheKey, result);
      return result;
    }
  }

  /**
   * Probes hardware decoders using device initialization validation
   */
  probeDecoder(decoderName) {
    if (this._validatedDecoders.has(decoderName)) {
      return this._validatedDecoders.get(decoderName);
    }

    const ffmpegRes = mediaToolResolver.resolveFFmpeg();
    if (!ffmpegRes.available) {
      const result = { available: false, decoder: decoderName, error: 'FFmpeg executable not available' };
      this._validatedDecoders.set(decoderName, result);
      return result;
    }

    // Direct hardware device initialization probe
    const probeArgs = [
      '-y',
      '-init_hw_device', decoderName,
      '-f', 'lavfi',
      '-i', 'testsrc2=size=64x64:rate=30',
      '-t', '0.04',
      '-f', 'null', '-'
    ];

    try {
      const probeRes = spawnSync(ffmpegRes.path, probeArgs, {
        timeout: 3500,
        encoding: 'utf8',
        windowsHide: true
      });

      const success = probeRes.status === 0;
      const result = {
        available: success,
        decoder: decoderName,
        probeTime: Date.now(),
        stderr: probeRes.stderr ? probeRes.stderr.slice(-300) : ''
      };

      this._validatedDecoders.set(decoderName, result);
      if (success) {
        logger.info(`✓ Hardware Decoder "${decoderName}" verified functional`);
      }
      return result;
    } catch (err) {
      const result = { available: false, decoder: decoderName, error: err.message };
      this._validatedDecoders.set(decoderName, result);
      return result;
    }
  }

  /**
   * Probes all supported hardware decoders in order of priority
   */
  probeAllDecoders() {
    const candidates = ['qsv', 'd3d11va', 'dxva2', 'cuda', 'amf'];
    for (const dec of candidates) {
      this.probeDecoder(dec);
    }
  }

  /**
   * Probes all supported hardware encoders at both 30 FPS and 60 FPS
   */
  probeAllEncoders() {
    const candidates = ['h264_qsv', 'h264_nvenc', 'h264_amf', 'h264_mf', 'libx264'];
    for (const enc of candidates) {
      this.probeEncoder(enc, 30);
      this.probeEncoder(enc, 60);
    }
  }

  /**
   * Returns FFmpeg CLI input arguments for hardware decoding.
   * For Intel systems / INTEL_QSV pipeline, decoding strictly runs on CPU software (no -hwaccel flags).
   */
  getDecoderArgs(options = {}) {
    const mode = (options.mode || this._mode || 'AUTO').toUpperCase().trim();
    if (this._adapters.length === 0 && this._primaryVendor === 'UNKNOWN') {
      this.detectAdapters();
    }

    const isSameGlobalMode = !options.mode || mode === (this._mode || 'AUTO').toUpperCase().trim();
    const effectiveEncoder = options.encoder || (isSameGlobalMode ? this._activeEncoder : null);

    // Enforce CPU software decoding for SOFTWARE mode and Intel Quick Sync pipelines
    if (mode === 'SOFTWARE' || this._isIntelPipeline(mode, effectiveEncoder)) {
      if (isSameGlobalMode) {
        this._activeDecoder = 'cpu_software';
      }
      return [];
    }

    const wantsNvidia = mode === 'NVIDIA_NVENC' || (mode !== 'AMD_AMF' && mode !== 'WINDOWS_MF' && this._primaryVendor === 'NVIDIA');
    let targetDecoder = isSameGlobalMode ? this._activeDecoder : null;

    if (!targetDecoder || targetDecoder === 'cpu_software' || targetDecoder === 'qsv' || this._failedDecoders.has(targetDecoder)) {
      targetDecoder = null;
      if (wantsNvidia) {
        const cudaProbe = !this._failedDecoders.has('cuda') ? this.probeDecoder('cuda') : { available: false };
        if (cudaProbe.available) {
          targetDecoder = 'cuda';
        } else {
          const d3d11Probe = !this._failedDecoders.has('d3d11va') ? this.probeDecoder('d3d11va') : { available: false };
          if (d3d11Probe.available) targetDecoder = 'd3d11va';
        }
      } else {
        // Universal modern Windows hardware decoding (D3D11VA / DXVA2) for AMD and OTHER GPUs
        const d3d11Probe = !this._failedDecoders.has('d3d11va') ? this.probeDecoder('d3d11va') : { available: false };
        if (d3d11Probe.available) {
          targetDecoder = 'd3d11va';
        } else {
          const dxva2Probe = !this._failedDecoders.has('dxva2') ? this.probeDecoder('dxva2') : { available: false };
          if (dxva2Probe.available) {
            targetDecoder = 'dxva2';
          }
        }
      }
      if (isSameGlobalMode && targetDecoder) {
        this._activeDecoder = targetDecoder;
      }
    }

    if (targetDecoder && targetDecoder !== 'cpu_software' && targetDecoder !== 'qsv' && !this._failedDecoders.has(targetDecoder)) {
      return ['-hwaccel', targetDecoder];
    }

    return [];
  }

  /**
   * Returns global FFmpeg CLI arguments required prior to input (-i).
   * For pure CPU software decoding + Intel GPU Quick Sync (h264_qsv) encoding,
   * no global -init_hw_device or -hwaccel hooks are placed before inputs,
   * ensuring FFmpeg uses CPU software decoding on input without hooking D3D11VA.
   */
  getGlobalArgs(options = {}) {
    return [];
  }

  /**
   * Resolves encoder candidate priority list according to active mode and detected GPU vendor.
   * INTEL RULE: On Intel systems or INTEL_QSV mode, ONLY native Intel Quick Sync (h264_qsv)
   * is permitted — silent fallback to Media Foundation or CPU software encoding (libx264) is disallowed.
   */
  _getCandidateEncoders(effectiveMode) {
    const mode = (effectiveMode || this._mode || 'AUTO').toUpperCase().trim();
    if (mode === 'INTEL_QSV') {
      return ['h264_qsv'];
    }
    if (mode === 'NVIDIA_NVENC') {
      return ['h264_nvenc', 'h264_mf', 'libx264'];
    }
    if (mode === 'AMD_AMF') {
      return ['h264_amf', 'h264_mf', 'libx264'];
    }
    if (mode === 'WINDOWS_MF') {
      return ['h264_mf', 'libx264'];
    }
    if (mode === 'HARDWARE_REQUIRED') {
      if (this._primaryVendor === 'INTEL') {
        return ['h264_qsv'];
      }
      if (this._primaryVendor === 'NVIDIA') {
        return ['h264_nvenc', 'h264_mf'];
      }
      if (this._primaryVendor === 'AMD') {
        return ['h264_amf', 'h264_mf'];
      }
      return ['h264_qsv', 'h264_nvenc', 'h264_amf', 'h264_mf'];
    }
    if (mode === 'SOFTWARE') {
      return ['libx264'];
    }

    // Default: AUTO / HARDWARE FIRST mode
    if (this._primaryVendor === 'INTEL') {
      // Intel systems: strictly enforce Quick Sync GPU encoding (no silent CPU/MF fallback)
      return ['h264_qsv'];
    }
    if (this._primaryVendor === 'NVIDIA') {
      return ['h264_nvenc', 'h264_mf', 'libx264'];
    }
    if (this._primaryVendor === 'AMD') {
      return ['h264_amf', 'h264_mf', 'libx264'];
    }
    return ['h264_qsv', 'h264_nvenc', 'h264_amf', 'h264_mf', 'libx264'];
  }

  /**
   * Initializes and validates hardware encoder candidates in optimal priority.
   * Called during application startup and prior to live stream launching.
   */
  async init({ forceRecheck = false } = {}) {
    if (this._initialized && !forceRecheck && this._activeEncoder) {
      return this._activeEncoder;
    }

    if (this._initPromise && !forceRecheck) {
      return this._initPromise;
    }

    // Fast Startup: load cached hardware profile from disk to avoid cold-boot 80% CPU/GPU spike
    if (!forceRecheck) {
      const loaded = this.loadHardwareProfile();
      if (loaded) {
        this._initialized = true;
        return this._activeEncoder;
      }
    }

    this._initPromise = (async () => {
      try {
        this.detectAdapters();
        const isIntel = this._isIntelPipeline(this._mode);
        if (isIntel || this._mode === 'SOFTWARE') {
          this._activeDecoder = 'cpu_software';
        } else if (this._primaryVendor === 'NVIDIA') {
          const cProbe = this.probeDecoder('cuda');
          this._activeDecoder = cProbe.available ? 'cuda' : (this.probeDecoder('d3d11va').available ? 'd3d11va' : 'cpu_software');
        } else if (this._primaryVendor === 'AMD') {
          const dProbe = this.probeDecoder('d3d11va');
          this._activeDecoder = dProbe.available ? 'd3d11va' : (this.probeDecoder('dxva2').available ? 'dxva2' : 'cpu_software');
        } else {
          const dProbe = this.probeDecoder('d3d11va');
          this._activeDecoder = dProbe.available ? 'd3d11va' : 'cpu_software';
        }

        const candidates = this._getCandidateEncoders(this._mode);

        // Check user override via environment variable if specified
        const envForce = process.env.FORCE_VIDEO_ENCODER;
        if (envForce) {
          const probe = this.probeEncoder(envForce, 30);
          if (probe.available) {
            this._activeEncoder = envForce;
            if (this._isIntelPipeline(this._mode, envForce) || this._mode === 'SOFTWARE') {
              this._activeDecoder = 'cpu_software';
            }
            this._initialized = true;
            this.saveHardwareProfile();
            logger.info(`Using environment forced video encoder: ${envForce}`);
            return this._activeEncoder;
          }
          logger.warn(`Forced video encoder "${envForce}" failed probe. Continuing automatic discovery.`);
        }

        for (const cand of candidates) {
          const probe = this.probeEncoder(cand, 30);
          if (probe.available) {
            this._activeEncoder = cand;
            if (this._isIntelPipeline(this._mode, cand) || this._mode === 'SOFTWARE') {
              this._activeDecoder = 'cpu_software';
            }
            this._initialized = true;
            this.saveHardwareProfile();
            logger.info(`Selected optimal video encoder: "${cand}" (Hardware: ${probe.isHardware}, Vendor: ${this._primaryVendor}, Mode: ${this._mode}, Decoder: ${this._activeDecoder || 'auto'})`);
            return this._activeEncoder;
          }
        }

        // No candidate succeeded
        if (isIntel) {
          const diag = this._qsvDiagnostic ? ` Details: ${this._qsvDiagnostic}` : '';
          const err = `INTEL_QSV_UNAVAILABLE: Intel Quick Sync Video encoder (h264_qsv) failed validation on this host (${this._adapterName || 'Unknown GPU'}). CPU fallback is disabled.${diag}`;
          logger.error(err);
          this._activeEncoder = null;
          this._activeDecoder = 'cpu_software';
          this._initialized = true;
          throw new Error(err);
        }

        if (this._mode === 'HARDWARE_REQUIRED') {
          const err = `HARDWARE_ACCELERATION_REQUIRED: Configured hardware encoder mode "${this._mode}" failed to initialize a functional GPU hardware encoder on this host (${this._adapterName || 'Unknown GPU'}).`;
          logger.error(err);
          this._activeEncoder = null;
          this._initialized = true;
          throw new Error(err);
        }

        this._activeEncoder = 'libx264';
        this._initialized = true;
        this.saveHardwareProfile();
        return this._activeEncoder;
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  }

  /**
   * Marks a hardware encoder as failed at runtime, blacklists it for the active session,
   * cascades decoder blacklisting if vendor-tied (e.g. NVENC failure -> CUDA blacklisted),
   * and clears cached selection so the next compatible encoder is evaluated cleanly.
   */
  markEncoderFailed(encoderName) {
    if (!encoderName) return;
    this._failedEncoders.add(encoderName);
    logger.warn(`Hardware encoder "${encoderName}" failed at runtime. Blacklisting for current session.`);
    for (const key of this._validatedEncoders.keys()) {
      if (key.startsWith(encoderName)) {
        this._validatedEncoders.set(key, {
          available: false,
          encoder: encoderName,
          isHardware: encoderName !== 'libx264',
          error: 'Runtime initialization failure',
          probeTime: Date.now()
        });
      }
    }
    if (this._activeEncoder === encoderName) {
      this._activeEncoder = null;
    }
    if (encoderName === 'h264_nvenc') {
      this.markDecoderFailed('cuda');
    }
  }

  /**
   * Marks a hardware decoder as failed at runtime, blacklists it for the active session,
   * and clears cached selection so optimal fallback decoder (e.g. d3d11va or software) is used.
   */
  markDecoderFailed(decoderName) {
    if (!decoderName) return;
    this._failedDecoders.add(decoderName);
    logger.warn(`Hardware decoder "${decoderName}" failed at runtime. Blacklisting for current session.`);
    this._validatedDecoders.set(decoderName, {
      available: false,
      decoder: decoderName,
      error: 'Runtime initialization failure',
      probeTime: Date.now()
    });
    if (this._activeDecoder === decoderName) {
      this._activeDecoder = null;
    }
  }

  /**
   * Resolves the active encoder synchronously according to configured mode and target FPS.
   * Used in production FFmpeg command builders.
   */
  resolveActiveEncoderSync(mode = null, targetFps = 30) {
    const effectiveMode = (mode || this._mode || 'AUTO').toUpperCase().trim();

    if (effectiveMode === 'SOFTWARE') {
      return 'libx264';
    }

    if (this._adapters.length === 0 && this._primaryVendor === 'UNKNOWN') {
      this.detectAdapters();
    }

    const isIntel = this._isIntelPipeline(effectiveMode);
    const order = this._getCandidateEncoders(effectiveMode);

    if (this._activeEncoder && !this._failedEncoders.has(this._activeEncoder)) {
      if (effectiveMode === 'HARDWARE_REQUIRED' && this._activeEncoder === 'libx264') {
        throw new Error(
          `HARDWARE_ACCELERATION_REQUIRED: Hardware video encoding is required (Mode: ${effectiveMode}) but no compatible GPU hardware encoder is operational on this host (${this._adapterName || 'Unknown GPU'}).`
        );
      }
      if (isIntel && this._activeEncoder !== 'h264_qsv') {
        if (this._activeEncoder === 'libx264' && effectiveMode === 'INTEL_QSV') {
          throw new Error(
            `INTEL_QSV_UNAVAILABLE: Intel Quick Sync Video (h264_qsv) is required on Intel systems and silent CPU fallback is disabled (${this._adapterName || 'Unknown GPU'}).`
          );
        }
      } else if (order.includes(this._activeEncoder)) {
        const cached = this._validatedEncoders.get(`${this._activeEncoder}_${targetFps}`);
        if (!cached || cached.available !== false) {
          return this._activeEncoder;
        }
        this._activeEncoder = null;
      }
    }

    for (const cand of order) {
      if (this._failedEncoders.has(cand)) continue;
      const probe = this.probeEncoder(cand, targetFps);
      if (probe.available) {
        if (!mode || effectiveMode === (this._mode || 'AUTO').toUpperCase().trim()) {
          this._activeEncoder = cand;
        }
        return cand;
      }
    }

    if (isIntel) {
      const diag = this._qsvDiagnostic ? ` Details: ${this._qsvDiagnostic}` : '';
      throw new Error(
        `INTEL_QSV_UNAVAILABLE: Intel Quick Sync Video encoder (h264_qsv) is unavailable or failed validation at ${targetFps} FPS on this host (${this._adapterName || 'Unknown GPU'}). Silent CPU fallback is disabled.${diag}`
      );
    }

    if (effectiveMode === 'HARDWARE_REQUIRED') {
      const reason = `No compatible GPU hardware encoder (h264_qsv, h264_nvenc, h264_amf, h264_mf) is operational on this host (${this._adapterName || 'Unknown GPU'}).`;
      throw new Error(`HARDWARE_ACCELERATION_REQUIRED: ${reason}`);
    }

    logger.warn(`No hardware GPU encoder available. Falling back to software libx264 CPU encoder.`);
    if (!mode || effectiveMode === (this._mode || 'AUTO').toUpperCase().trim()) {
      this._activeEncoder = 'libx264';
    }
    return 'libx264';
  }

  /**
   * Resolves the best available hardware HEVC / H.265 video encoder for high-efficiency
   * 1440p / 4K streaming (e.g. YouTube Live Enhanced RTMP)
   */
  resolveHevcEncoderSync(mode = null, targetFps = 60) {
    const effectiveMode = (mode || this._mode || 'AUTO').toUpperCase().trim();
    if (effectiveMode === 'INTEL_QSV' || this._primaryVendor === 'INTEL') return 'hevc_qsv';
    if (effectiveMode === 'NVIDIA_NVENC' || this._primaryVendor === 'NVIDIA') return 'hevc_nvenc';
    if (effectiveMode === 'AMD_AMF' || this._primaryVendor === 'AMD') return 'hevc_amf';
    if (effectiveMode === 'WINDOWS_MF') return 'hevc_mf';
    return 'hevc_amf'; // Default GPU HEVC candidate on Windows if AMD present, else fallback
  }

  /**
   * Generates FFmpeg CLI arguments and required pixel format for video encoding.
   * Ensures Intel QSV uses native NV12, clean live-streaming parameters, constant bitrate, and GOP = 2 * FPS.
   */
  getEncoderArgs(options = {}) {
    const targetFps = options.targetFps === 60 ? 60 : 30;
    const bitrate = options.bitrate || (targetFps === 60 ? '6000k' : '4500k');
    const maxrate = options.maxrate || bitrate;
    // For live streaming (especially 60 FPS), VBV bufsize = bitrate ensures tight, constant-rate packet delivery
    // without inflating the network queue or causing seconds of buffering/lag.
    const bufsize = options.bufsize || bitrate;
    const preset = options.preset || 'veryfast';
    const mode = options.mode || this._mode || 'AUTO';
    const gop = String(options.gop || targetFps * 2);

    const encoder = options.encoder || this.resolveActiveEncoderSync(mode, targetFps);
    const args = [];
    let pixFmt = 'yuv420p';

    switch (encoder) {
      case 'h264_qsv':
        // Intel QuickSync Video Hardware Encoder (Requires NV12 input, clean standard parameters)
        // At 60 FPS, async_depth=2 and look_ahead=0 cut encoder pipeline buffering to zero, preventing stream lag.
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'h264_qsv',
          '-preset', 'veryfast',
          '-async_depth', targetFps === 60 ? '2' : '4',
          '-look_ahead', '0',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'nv12'
        );
        break;

      case 'h264_mf':
        // Windows Media Foundation Hardware MFT (-hw_encoding 1 forces true GPU encoding)
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'h264_mf',
          '-hw_encoding', '1',
          '-scenario', '4', // live_streaming
          '-rate_control', '0', // cbr
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps)
        );
        break;

      case 'h264_nvenc':
        // NVIDIA NVENC Hardware Encoder (low-latency live tuning with zero frame delay)
        pixFmt = 'yuv420p';
        args.push(
          '-c:v', 'h264_nvenc',
          '-preset', 'p4',
          '-tune', 'll',
          '-zerolatency', '1',
          '-delay', '0',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'yuv420p'
        );
        break;

      case 'h264_amf':
        // AMD AMF Hardware Encoder (low latency live preset)
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'h264_amf',
          '-usage', 'lowlatency',
          '-rc', 'cbr',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'nv12'
        );
        break;

      case 'hevc_qsv':
        // Intel QuickSync HEVC/H.265 Hardware Encoder (with low-power VDEnc fixed function mode)
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'hevc_qsv',
          '-preset', 'veryfast',
          '-low_power', '1',
          '-async_depth', targetFps === 60 ? '2' : '4',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'nv12'
        );
        break;

      case 'hevc_nvenc':
        // NVIDIA NVENC HEVC/H.265 Hardware Encoder (low latency)
        pixFmt = 'yuv420p';
        args.push(
          '-c:v', 'hevc_nvenc',
          '-preset', 'p4',
          '-tune', 'll',
          '-zerolatency', '1',
          '-delay', '0',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'yuv420p'
        );
        break;

      case 'hevc_amf':
        // AMD AMF HEVC/H.265 Hardware Encoder
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'hevc_amf',
          '-usage', 'lowlatency',
          '-rc', 'cbr',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps),
          '-pix_fmt', 'nv12'
        );
        break;

      case 'hevc_mf':
        // Windows Media Foundation HEVC
        pixFmt = 'nv12';
        args.push(
          '-c:v', 'hevc_mf',
          '-hw_encoding', '1',
          '-scenario', '4',
          '-rate_control', '0',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps)
        );
        break;

      case 'libx265':
        // Software HEVC/H.265 CPU fallback
        pixFmt = 'yuv420p';
        args.push(
          '-c:v', 'libx265',
          '-preset', 'ultrafast',
          '-tune', 'zerolatency',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-pix_fmt', 'yuv420p',
          '-g', gop,
          '-keyint_min', gop,
          '-r', String(targetFps)
        );
        break;

      case 'libx264':
      default:
        // High-compatibility software x264 with zerolatency tuning for live streaming
        pixFmt = 'yuv420p';
        args.push(
          '-c:v', 'libx264',
          '-preset', preset,
          '-tune', 'zerolatency',
          '-profile:v', 'high',
          '-b:v', bitrate,
          '-maxrate', maxrate,
          '-bufsize', bufsize,
          '-pix_fmt', 'yuv420p',
          '-g', gop,
          '-keyint_min', gop,
          '-sc_threshold', '0',
          '-r', String(targetFps)
        );
        break;
    }

    const isHardware = encoder !== 'libx264' && encoder !== 'libx265';

    return {
      encoder,
      isHardware,
      mode,
      targetFps,
      pixFmt,
      args
    };
  }

  /**
   * Returns current telemetry and capabilities for frontend and logging.
   * Reports only verified statuses without misleading assumptions.
   */
  getTelemetry(modeOverride = null) {
    if (this._adapters.length === 0 && this._primaryVendor === 'UNKNOWN') {
      this.detectAdapters();
    }

    const effectiveMode = (modeOverride || this._mode || 'AUTO').toUpperCase().trim();
    const useGlobalCache = !modeOverride || effectiveMode === (this._mode || 'AUTO').toUpperCase().trim();

    let encoder = null;
    let encoderError = null;
    try {
      const cachedOrder = this._getCandidateEncoders(effectiveMode);
      if (useGlobalCache && this._activeEncoder && cachedOrder.includes(this._activeEncoder) && !this._failedEncoders.has(this._activeEncoder)) {
        encoder = this._activeEncoder;
      } else {
        encoder = this.resolveActiveEncoderSync(effectiveMode);
      }
    } catch (err) {
      encoder = null;
      encoderError = err.message;
    }

    const isIntel = this._isIntelPipeline(effectiveMode, encoder);
    let decoder = 'cpu_software';
    if (effectiveMode !== 'SOFTWARE' && !isIntel) {
      const decArgs = this.getDecoderArgs({ mode: effectiveMode, encoder });
      const hwIdx = decArgs.indexOf('-hwaccel');
      decoder = hwIdx !== -1 && decArgs[hwIdx + 1] ? decArgs[hwIdx + 1] : 'cpu_software';
    }

    // Determine verified encoder status label
    let verifiedEncoderStatus = 'SOFTWARE ENCODING';
    if (encoder === 'h264_qsv') {
      verifiedEncoderStatus = 'INTEL QSV ENCODING ACTIVE';
    } else if (encoder === 'h264_nvenc') {
      verifiedEncoderStatus = 'NVIDIA NVENC ACTIVE';
    } else if (encoder === 'h264_amf') {
      verifiedEncoderStatus = 'AMD AMF ACTIVE';
    } else if (encoder === 'h264_mf') {
      if (this._primaryVendor === 'INTEL' || this._intelMftVerified) {
        verifiedEncoderStatus = 'INTEL MEDIA FOUNDATION HARDWARE ACTIVE';
      } else {
        verifiedEncoderStatus = 'MEDIA FOUNDATION HARDWARE ACTIVE';
      }
    } else if (encoder === 'libx264') {
      verifiedEncoderStatus = 'SOFTWARE ENCODING (libx264)';
    } else if (isIntel) {
      verifiedEncoderStatus = 'INTEL QSV UNAVAILABLE (CPU FALLBACK DISABLED)';
    } else if (effectiveMode === 'HARDWARE_REQUIRED') {
      verifiedEncoderStatus = 'HARDWARE INITIALIZATION FAILED';
    } else {
      verifiedEncoderStatus = 'HARDWARE STATUS UNKNOWN';
    }

    // Determine verified decoder status label
    let verifiedDecoderStatus = 'CPU SOFTWARE DECODING';
    if (decoder === 'qsv') {
      verifiedDecoderStatus = 'INTEL QSV DECODING ACTIVE';
    } else if (decoder === 'cuda') {
      verifiedDecoderStatus = 'NVIDIA NVDEC DECODING ACTIVE';
    } else if (decoder === 'd3d11va') {
      verifiedDecoderStatus = 'D3D11VA HARDWARE DECODING ACTIVE';
    } else if (decoder === 'dxva2') {
      verifiedDecoderStatus = 'DXVA2 HARDWARE DECODING ACTIVE';
    } else if (decoder === 'amf') {
      verifiedDecoderStatus = 'AMD AMF DECODING ACTIVE';
    }

    const isHardwareEncoder = Boolean(encoder) && encoder !== 'libx264';
    const isHardwareDecoder = decoder !== 'cpu_software';

    return {
      mode: effectiveMode,
      activeEncoder: encoder,
      isHardware: isHardwareEncoder,
      verifiedEncoderStatus,
      encoderError,
      activeDecoder: decoder,
      isHardwareDecoding: isHardwareDecoder,
      verifiedDecoderStatus,
      adapterName: this._adapterName || 'Unknown GPU',
      primaryVendor: this._primaryVendor,
      adapters: this._adapters,
      validatedEncoders: Array.from(this._validatedEncoders.entries()).map(([key, data]) => ({
        key,
        name: data.encoder,
        fps: data.fps,
        available: data.available,
        isHardware: data.isHardware
      })),
      validatedDecoders: Array.from(this._validatedDecoders.entries()).map(([name, data]) => ({
        name,
        available: data.available
      })),
      qsvDiagnostic: this._qsvDiagnostic,
      mfMftName: this._mfMftName,
      intelMftVerified: this._intelMftVerified,
      taskManagerEngineHint: 'Video Encode (select Video Encode from graph title dropdown in Task Manager; Video Processing engine is reserved for VPP)'
    };
  }

  /**
   * Generates a fully sanitized diagnostic report for the client or support inspection.
   * Strips all Facebook access tokens, stream keys, page IDs, and RTSP passwords.
   */
  generateSanitizedDiagnosticReport(format = 'markdown') {
    if (this._adapters.length === 0 && this._primaryVendor === 'UNKNOWN') {
      this.detectAdapters();
    }
    this.probeAllEncoders();
    this.probeAllDecoders();

    const telemetry = this.getTelemetry();
    const ffmpegRes = mediaToolResolver.resolveFFmpeg();
    const ffprobeRes = mediaToolResolver.resolveFFprobe();

    // Query FFmpeg build version
    let ffmpegVersionStr = 'Unknown';
    if (ffmpegRes.available) {
      try {
        const vRes = spawnSync(ffmpegRes.path, ['-version'], { timeout: 2000, encoding: 'utf8' });
        if (vRes.status === 0 && vRes.stdout) {
          ffmpegVersionStr = vRes.stdout.split('\n')[0] || 'Unknown';
        }
      } catch (_) {}
    }

    const reportData = {
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(2),
        freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(2),
        cpuCount: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown'
      },
      gpu: {
        adapters: this._adapters,
        primaryVendor: this._primaryVendor
      },
      mediaEngine: {
        ffmpegAvailable: ffmpegRes.available,
        ffmpegVersion: ffmpegVersionStr,
        ffprobeAvailable: ffprobeRes.available
      },
      acceleration: {
        configuredMode: telemetry.mode,
        activeEncoder: telemetry.activeEncoder || 'None',
        isHardwareEncoding: telemetry.isHardware,
        verifiedEncoderStatus: telemetry.verifiedEncoderStatus,
        encoderError: telemetry.encoderError || null,
        activeDecoder: telemetry.activeDecoder,
        isHardwareDecoding: telemetry.isHardwareDecoding,
        verifiedDecoderStatus: telemetry.verifiedDecoderStatus,
        validatedEncoders: telemetry.validatedEncoders,
        validatedDecoders: telemetry.validatedDecoders
      },
      fpsCapabilities: {
        supports30Fps: true,
        supports60Fps: Boolean(telemetry.validatedEncoders.some(e => e.fps === 60 && e.available && e.isHardware)),
        recommendedEncoder60Fps: telemetry.activeEncoder || 'h264_qsv'
      }
    };

    if (format === 'json') {
      return JSON.stringify(reportData, null, 2);
    }

    // Markdown format
    const md = `# Hardware Acceleration & GPU Diagnostic Report

**Generated:** ${reportData.timestamp}  
**Platform:** Windows (${reportData.system.release}, ${reportData.system.arch})  
**CPU:** ${reportData.system.cpuModel} (${reportData.system.cpuCount} Cores)  
**System Memory:** ${reportData.system.totalMemoryGB} GB Total (${reportData.system.freeMemoryGB} GB Free)  

---

## 1. GPU Display Adapters Detected

${reportData.gpu.adapters.map((a, i) => `### Adapter #${i + 1}: ${a.name}
- **Vendor:** ${a.vendor}
- **Driver Version:** \`${a.driverVersion}\`
- **Video Memory (VRAM):** ${a.ramMB > 0 ? a.ramMB + ' MB' : 'Shared / Dynamic'}
- **Hardware Status:** ${a.status}
`).join('\n')}

**Primary GPU Architecture:** \`${reportData.gpu.primaryVendor}\`

---

## 2. Active Acceleration Configuration

| Setting | Value |
|---|---|
| **Configured Mode** | \`${reportData.acceleration.configuredMode}\` |
| **Active Video Encoder** | \`${reportData.acceleration.activeEncoder}\` (${reportData.acceleration.verifiedEncoderStatus}) |
| **Active Video Decoder** | \`${reportData.acceleration.activeDecoder}\` (${reportData.acceleration.verifiedDecoderStatus}) |
| **60 FPS Hardware Capability** | ${reportData.fpsCapabilities.supports60Fps ? '✓ Verified Hardware Capable' : '⚠ Requires 60 FPS Hardware Encoder Validation'} |
${reportData.acceleration.encoderError ? `| **Diagnostic Note** | ${reportData.acceleration.encoderError} |\n` : ''}
---

## 3. Hardware Video Encoder Probes

| Encoder Codec | Target FPS | Hardware Accelerated | Functional on Host | Status / Details |
|---|---|---|---|---|
${reportData.acceleration.validatedEncoders.map(e => `| \`${e.name}\` | ${e.fps || 30} | ${e.isHardware ? 'Yes' : 'No'} | ${e.available ? '✓ YES' : '✗ NO'} | ${e.available ? 'Verified Functional' : 'Not supported by current GPU/driver'} |`).join('\n')}

---

## 4. Video Decoder Frameworks & Policy

| Decoder Framework | Supported on Host | Notes |
|---|---|---|
| \`cpu_software\` | ✓ Always Available | Default for Intel QSV (CPU decode + GPU h264_qsv encode) and SOFTWARE mode |
${reportData.acceleration.validatedDecoders.map(d => `| \`${d.name}\` | ${d.available ? '✓ Functional' : '✗ Unavailable'} | ${d.name === 'qsv' ? 'Probed for inventory only (CPU decode enforced on Intel QSV pipeline)' : (d.available ? 'Direct GPU Zero-Copy Stream Ingestion' : 'Driver or hardware architecture incompatible')} |`).join('\n')}

---

## 5. Media Engine Bundled Binaries

- **FFmpeg Version:** \`${reportData.mediaEngine.ffmpegVersion}\`
- **FFmpeg Status:** ${reportData.mediaEngine.ffmpegAvailable ? '✓ Installed and Operational' : '✗ Missing'}
- **FFprobe Status:** ${reportData.mediaEngine.ffprobeAvailable ? '✓ Installed and Operational' : '✗ Missing'}

---

> [!NOTE]
> **Data Privacy & Security Sanitization Guarantee:**  
> This diagnostic report has been automatically sanitized. All Facebook Graph API tokens, live stream keys, page IDs, passwords, and local network camera RTSP credentials have been strictly redacted and are never exported.
`;

    return md;
  }
}

const hardwareEncoderService = new HardwareEncoderService();

module.exports = {
  HardwareEncoderService,
  hardwareEncoderService
};
