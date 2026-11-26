const mongoose = require('mongoose');
const os = require('os');
const Log = require('../models/Log');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const FacebookPage = require('../models/FacebookPage');
const ffmpegService = require('../services/ffmpegService');
const facebookService = require('../services/facebook/facebookService');
const { mediaToolResolver } = require('../services/mediaToolResolver');
const trialService = require('../services/trialService');
const { hardwareEncoderService } = require('../services/hardwareEncoderService');
const { gstreamerRuntimeDetector } = require('../services/gstreamerRuntimeDetector');
const { gstreamerService } = require('../services/gstreamerService');
const config = require('../config/config');

// @desc    Get trial and license status
// @route   GET /api/system/trial-status
exports.getTrialStatus = async (req, res) => {
  try {
    const status = trialService.getStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get media engine tools health status
// @route   GET /api/system/media-tools
exports.getMediaToolsHealth = async (req, res) => {
  try {
    const health = mediaToolResolver.getHealthStatus(true);
    const gstDiag = gstreamerRuntimeDetector.getDiagnosticSummary();
    res.json({
      success: true,
      ...health,
      gstreamer: gstDiag
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get connected audio and video devices (microphones & webcams)
// @route   GET /api/system/devices
exports.getDevices = async (req, res) => {
  try {
    const devices = mediaToolResolver.getAudioAndVideoDevices();
    let aliasMap = new Map();
    try {
      const CameraAlias = require('../models/CameraAlias');
      const filter = req.user?._id ? { $or: [{ userId: req.user._id }, { userId: null }] } : {};
      const aliases = await CameraAlias.find(filter);
      aliases.forEach(a => aliasMap.set(a.deviceName, a.customName));
    } catch (aliasErr) {}

    const videoDevices = (devices.videoDevices || []).map(d => {
      const custom = aliasMap.get(d.name) || null;
      return {
        ...d,
        customName: custom,
        displayName: custom || d.name,
        label: custom || d.name
      };
    });

    res.json({
      success: true,
      audioDevices: devices.audioDevices || [],
      videoDevices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get system health and performance telemetry
// @route   GET /api/system/health
exports.getHealth = async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED';
    const activeStreamsCount = ffmpegService.activeProcesses.size + gstreamerService.activeProcesses.size;

    const totalAutomations = await Automation.countDocuments();
    const liveAutomations = await Automation.countDocuments({ status: 'LIVE' });
    const totalBroadcasts = await Broadcast.countDocuments();
    const totalPages = await FacebookPage.countDocuments();

    const memUsage = process.memoryUsage();

    res.json({
      success: true,
      status: 'UP',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date(),
      database: {
        status: mongoStatus,
        host: mongoose.connection.host || 'embedded-memory'
      },
      streaming: {
        activeProcesses: activeStreamsCount,
        mockMode: facebookService.isMockMode,
        testMode: config.scheduler.testMode
      },
      counts: {
        totalAutomations,
        liveAutomations,
        totalBroadcasts,
        totalPages
      },
      system: {
        platform: os.platform(),
        cpus: os.cpus().length,
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        processRssMb: Math.round(memUsage.rss / (1024 * 1024)),
        processHeapUsedMb: Math.round(memUsage.heapUsed / (1024 * 1024))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get system diagnostic logs
// @route   GET /api/system/logs
exports.getLogs = async (req, res, next) => {
  try {
    const { level, component, automationId, limit = 100, page = 1 } = req.query;
    const filter = {};

    if (level) filter.level = level;
    if (component) filter.component = component;
    if (automationId) filter.automationId = automationId;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const logs = await Log.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await Log.countDocuments(filter);

    res.json({
      success: true,
      count: logs.length,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
      logs
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get detailed GPU hardware acceleration telemetry and capabilities
// @route   GET /api/system/gpu-diagnostics
exports.getGpuDiagnostics = async (req, res) => {
  try {
    const telemetry = hardwareEncoderService.getTelemetry();
    const gstDiag = gstreamerRuntimeDetector.getDiagnosticSummary();
    res.json({
      success: true,
      diagnostics: {
        ...telemetry,
        gstreamer: gstDiag
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get dedicated GStreamer media engine diagnostic summary
// @route   GET /api/system/gstreamer-diagnostics
exports.getGStreamerDiagnostics = async (req, res) => {
  try {
    const summary = gstreamerRuntimeDetector.getDiagnosticSummary();
    res.json({
      success: true,
      diagnostics: summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update GPU hardware acceleration mode (AUTO | HARDWARE_REQUIRED | SOFTWARE)
// @route   POST /api/system/gpu-mode
exports.setGpuMode = async (req, res) => {
  try {
    const { mode } = req.body;
    const newMode = hardwareEncoderService.setMode(mode);
    res.json({
      success: true,
      mode: newMode,
      message: `GPU acceleration mode updated to ${newMode}`
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

// @desc    Export sanitized hardware diagnostic report for client/support inspection
// @route   GET /api/system/export-diagnostic-report
exports.exportDiagnosticReport = async (req, res) => {
  try {
    const format = req.query.format === 'json' ? 'json' : 'markdown';
    const report = hardwareEncoderService.generateSanitizedDiagnosticReport(format);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="gpu-diagnostic-report.json"');
      return res.send(report);
    } else {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="gpu-diagnostic-report.md"');
      return res.send(report);
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
