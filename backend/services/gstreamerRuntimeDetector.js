'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { Logger } = require('../utils/logger');

const logger = new Logger('GStreamerRuntimeDetector');

class GStreamerRuntimeDetector {
  constructor() {
    this._cachedInfo = null;
    this._pluginCache = new Map();
  }

  /**
   * Discovers and verifies the GStreamer runtime installation on Windows.
   * Checks GSTREAMER_1_0_ROOT_MSVC_X86_64, GSTREAMER_ROOT, GSTREAMER_BIN, PATH,
   * Local Programs, and common system locations.
   */
  detectRuntime() {
    if (this._cachedInfo) {
      return this._cachedInfo;
    }

    const homedir = os.homedir();
    const candidateDirs = [
      process.env.GSTREAMER_BIN,
      process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64 ? path.join(process.env.GSTREAMER_1_0_ROOT_MSVC_X86_64, 'bin') : null,
      process.env.GSTREAMER_ROOT ? path.join(process.env.GSTREAMER_ROOT, 'bin') : null,
      path.join(homedir, 'AppData', 'Local', 'Programs', 'gstreamer', '1.0', 'msvc_x86_64', 'bin'),
      'C:\\gstreamer\\1.0\\msvc_x86_64\\bin',
      'C:\\Program Files\\gstreamer\\1.0\\msvc_x86_64\\bin',
      path.join(__dirname, '..', 'bin', 'gstreamer', 'bin'),
      path.join(process.cwd(), 'backend', 'bin', 'gstreamer', 'bin')
    ].filter(Boolean);

    let binDir = null;
    let gstLaunchExe = null;
    let gstInspectExe = null;

    for (const dir of candidateDirs) {
      const launchPath = path.join(dir, 'gst-launch-1.0.exe');
      const inspectPath = path.join(dir, 'gst-inspect-1.0.exe');
      if (fs.existsSync(launchPath) && fs.existsSync(inspectPath)) {
        binDir = dir;
        gstLaunchExe = launchPath;
        gstInspectExe = inspectPath;
        break;
      }
    }

    // Fallback: check system PATH via where.exe
    if (!gstLaunchExe) {
      try {
        const whereRes = spawnSync('where.exe', ['gst-launch-1.0.exe'], { encoding: 'utf8', windowsHide: true });
        if (whereRes.status === 0 && whereRes.stdout) {
          const firstLine = whereRes.stdout.trim().split(/\r?\n/)[0];
          if (fs.existsSync(firstLine)) {
            gstLaunchExe = firstLine;
            binDir = path.dirname(firstLine);
            gstInspectExe = path.join(binDir, 'gst-inspect-1.0.exe');
          }
        }
      } catch (_) {}
    }

    if (!gstLaunchExe || !fs.existsSync(gstLaunchExe)) {
      this._cachedInfo = {
        available: false,
        version: null,
        binDir: null,
        rootDir: null,
        gstLaunchExe: null,
        gstInspectExe: null,
        plugins: {},
        encoders: {},
        decoders: {},
        error: 'GStreamer MSVC 64-bit runtime not found. Please install GStreamer 1.20+.'
      };
      return this._cachedInfo;
    }

    const rootDir = path.resolve(binDir, '..');
    const version = this._queryVersion(gstLaunchExe);
    const plugins = this._inspectCapabilities(gstInspectExe, binDir);
    const discPath = path.join(binDir, 'gst-discoverer-1.0.exe');
    const gstDiscovererExe = fs.existsSync(discPath) ? discPath : null;

    this._cachedInfo = {
      available: true,
      version,
      binDir,
      rootDir,
      gstLaunchExe,
      gstInspectExe,
      gstDiscovererExe,
      plugins: plugins.features,
      encoders: plugins.encoders,
      decoders: plugins.decoders,
      hwAcceleration: plugins.hwAcceleration
    };

    logger.info(`[GStreamerDetector] Discovered GStreamer v${version} at ${binDir}`);
    return this._cachedInfo;
  }

  _queryVersion(gstLaunchExe) {
    try {
      const res = spawnSync(gstLaunchExe, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
      if (res.status === 0 && res.stdout) {
        const match = res.stdout.match(/version\s+([0-9.]+)/i);
        return match ? match[1] : '1.28.9';
      }
    } catch (_) {}
    return '1.0';
  }

  _inspectElement(gstInspectExe, binDir, elementName) {
    if (this._pluginCache.has(elementName)) {
      return this._pluginCache.get(elementName);
    }
    const env = { ...process.env, PATH: `${binDir};${process.env.PATH || ''}` };
    try {
      const res = spawnSync(gstInspectExe, [elementName], { encoding: 'utf8', env, windowsHide: true, timeout: 4000 });
      const available = res.status === 0 && Boolean(res.stdout) && !res.stdout.includes('No such element or plugin');
      this._pluginCache.set(elementName, available);
      return available;
    } catch (_) {
      this._pluginCache.set(elementName, false);
      return false;
    }
  }

  _inspectCapabilities(gstInspectExe, binDir) {
    const check = (name) => this._inspectElement(gstInspectExe, binDir, name);

    const hasD3d11 = check('d3d11');
    const hasD3d11H264Dec = check('d3d11h264dec');
    const hasD3d11H265Dec = check('d3d11h265dec');
    const hasD3d11Scale = check('d3d11scale');
    const hasD3d11VideoSink = check('d3d11videosink');
    const hasD3d11Upload = check('d3d11upload');
    const hasD3d11Download = check('d3d11download');
    const hasInputSelector = check('input-selector');
    const hasRtspSrc = check('rtspsrc');
    const hasRtp264Depay = check('rtph264depay');
    const hasRtp265Depay = check('rtph265depay');
    const hasRtmp2Sink = check('rtmp2sink');
    const hasFlvMux = check('flvmux');
    const hasWasapiSrc = check('wasapisrc');
    const hasMfVideoSrc = check('mfvideosrc');
    const hasKsVideoSrc = check('ksvideosrc');
    const hasAutoVideoSrc = check('autovideosrc');
    const hasAudioTestSrc = check('audiotestsrc');
    const hasVideoScale = check('videoscale');
    const hasVideoConvert = check('videoconvert');

    // Hardware Encoders
    const hasQsvH264 = check('qsvh264enc');
    const hasQsvH265 = check('qsvh265enc');
    const hasAmfH264 = check('amfh264enc');
    const hasAmfH265 = check('amfh265enc');
    const hasNvH264 = check('nvh264enc');
    const hasNvH265 = check('nvh265enc');
    const hasD3d11H264Enc = check('d3d11h264enc');
    const hasD3d11H265Enc = check('d3d11h265enc');
    const hasX264 = check('x264enc');
    const hasX265 = check('x265enc');

    // Resolve best available H.264 Encoder (priority: QSV -> NVENC -> AMF -> D3D11 -> CPU)
    let bestH264Enc = 'x264enc';
    if (hasQsvH264) bestH264Enc = 'qsvh264enc';
    else if (hasNvH264) bestH264Enc = 'nvh264enc';
    else if (hasAmfH264) bestH264Enc = 'amfh264enc';
    else if (hasD3d11H264Enc) bestH264Enc = 'd3d11h264enc';
    else if (hasX264) bestH264Enc = 'x264enc';

    // Resolve best available H.265 / HEVC Encoder
    let bestH265Enc = 'x265enc';
    if (hasQsvH265) bestH265Enc = 'qsvh265enc';
    else if (hasNvH265) bestH265Enc = 'nvh265enc';
    else if (hasAmfH265) bestH265Enc = 'amfh265enc';
    else if (hasD3d11H265Enc) bestH265Enc = 'd3d11h265enc';
    else if (hasX265) bestH265Enc = 'x265enc';

    // Resolve best available Decoders
    const bestH264Dec = hasD3d11H264Dec ? 'd3d11h264dec' : (check('qsvh264dec') ? 'qsvh264dec' : 'avdec_h264');
    const bestH265Dec = hasD3d11H265Dec ? 'd3d11h265dec' : (check('qsvh265dec') ? 'qsvh265dec' : 'avdec_h265');

    return {
      features: {
        d3d11: hasD3d11,
        d3d11h264dec: hasD3d11H264Dec,
        d3d11h265dec: hasD3d11H265Dec,
        d3d11scale: hasD3d11Scale,
        d3d11videosink: hasD3d11VideoSink,
        d3d11upload: hasD3d11Upload,
        d3d11download: hasD3d11Download,
        inputSelector: hasInputSelector,
        rtspSrc: hasRtspSrc,
        rtpH264: hasRtp264Depay,
        rtpH265: hasRtp265Depay,
        rtmp2sink: hasRtmp2Sink,
        flvmux: hasFlvMux,
        wasapisrc: hasWasapiSrc,
        mfvideosrc: hasMfVideoSrc,
        ksvideosrc: hasKsVideoSrc,
        autovideosrc: hasAutoVideoSrc,
        audiotestsrc: hasAudioTestSrc,
        videoscale: hasVideoScale,
        videoconvert: hasVideoConvert,
        intelQsv: hasQsvH264 || hasQsvH265,
        amdAmf: hasAmfH264 || hasAmfH265,
        nvidiaNvenc: hasNvH264 || hasNvH265
      },
      encoders: {
        h264: bestH264Enc,
        h265: bestH265Enc,
        h264IsHardware: bestH264Enc !== 'x264enc',
        h265IsHardware: bestH265Enc !== 'x265enc'
      },
      decoders: {
        h264: bestH264Dec,
        h265: bestH265Dec,
        h264IsHardware: bestH264Dec.startsWith('d3d11') || bestH264Dec.startsWith('qsv'),
        h265IsHardware: bestH265Dec.startsWith('d3d11') || bestH265Dec.startsWith('qsv')
      },
      hwAcceleration: {
        vendor: hasQsvH264 ? 'INTEL' : (hasNvH264 ? 'NVIDIA' : (hasAmfH264 ? 'AMD' : 'GENERIC_D3D11')),
        d3d11ZeroCopy: hasD3d11 && hasD3d11Scale && (hasD3d11H264Dec || hasD3d11H265Dec)
      }
    };
  }

  /**
   * Diagnostic summary payload for REST API and health checks.
   */
  getDiagnosticSummary() {
    const info = this.detectRuntime();
    if (!info.available) {
      return {
        gstreamerAvailable: false,
        error: info.error
      };
    }

    return {
      gstreamerAvailable: true,
      version: info.version,
      binDir: info.binDir,
      d3d11Available: info.plugins.d3d11,
      d3d11VideoSink: info.plugins.d3d11videosink,
      inputSelectorAvailable: info.plugins.inputSelector,
      rtspAvailable: info.plugins.rtspSrc,
      intelQsvAvailable: info.plugins.intelQsv,
      amdAmfAvailable: info.plugins.amdAmf,
      nvidiaNvencAvailable: info.plugins.nvidiaNvenc,
      activeH264Encoder: info.encoders.h264,
      activeH265Encoder: info.encoders.h265,
      activeH264Decoder: info.decoders.h264,
      activeH265Decoder: info.decoders.h265,
      d3d11ZeroCopyActive: info.hwAcceleration.d3d11ZeroCopy,
      gpuVendor: info.hwAcceleration.vendor
    };
  }
}

const gstreamerRuntimeDetector = new GStreamerRuntimeDetector();
module.exports = { GStreamerRuntimeDetector, gstreamerRuntimeDetector };
