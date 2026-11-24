const config = require('../config/config');
const facebookService = require('../services/facebook/facebookService');
const { hardwareEncoderService } = require('../services/hardwareEncoderService');

// In-memory runtime overrides
const runtimeSettings = {
  facebookMockMode: config.facebook.mockMode,
  schedulerTestMode: config.scheduler.testMode,
  defaultFps: 30,
  defaultRotationDuration: config.scheduler.defaultRotationDuration,
  defaultRestartDelay: config.scheduler.defaultRestartDelay,
  testRotationDuration: config.scheduler.testRotationDuration,
  testRestartDelay: config.scheduler.testRestartDelay,
  facebookAppId: config.facebook.appId,
  facebookRedirectUri: config.facebook.redirectUri
};

// @desc    Get runtime system settings
// @route   GET /api/settings
exports.getSettings = async (req, res) => {
  res.json({
    success: true,
    settings: {
      ...runtimeSettings,
      facebookMockMode: facebookService.isMockMode,
      schedulerTestMode: config.scheduler.testMode,
      encryptionConfigured: Boolean(config.encryptionKey),
      gpuAccelerationMode: hardwareEncoderService.getMode(),
      gpuTelemetry: hardwareEncoderService.getTelemetry()
    }
  });
};

// @desc    Update runtime settings
// @route   PUT /api/settings
exports.updateSettings = async (req, res) => {
  const {
    facebookMockMode,
    schedulerTestMode,
    defaultRotationDuration,
    defaultRestartDelay,
    testRotationDuration,
    testRestartDelay,
    facebookAppId,
    facebookAppSecret
  } = req.body;

  if (facebookMockMode !== undefined) {
    runtimeSettings.facebookMockMode = Boolean(facebookMockMode);
    facebookService.setMockMode(Boolean(facebookMockMode));
  }

  if (schedulerTestMode !== undefined) {
    runtimeSettings.schedulerTestMode = Boolean(schedulerTestMode);
    config.scheduler.testMode = Boolean(schedulerTestMode);
  }

  if (req.body.defaultFps) {
    const fpsVal = parseInt(req.body.defaultFps, 10);
    if (fpsVal === 30 || fpsVal === 60) {
      runtimeSettings.defaultFps = fpsVal;
    }
  }

  if (defaultRotationDuration) runtimeSettings.defaultRotationDuration = parseInt(defaultRotationDuration, 10);
  if (defaultRestartDelay) runtimeSettings.defaultRestartDelay = parseInt(defaultRestartDelay, 10);
  if (testRotationDuration) runtimeSettings.testRotationDuration = parseInt(testRotationDuration, 10);
  if (testRestartDelay) runtimeSettings.testRestartDelay = parseInt(testRestartDelay, 10);
  if (req.body.gpuAccelerationMode) {
    try {
      hardwareEncoderService.setMode(req.body.gpuAccelerationMode);
    } catch (_) {}
  }
  if (facebookAppId) runtimeSettings.facebookAppId = facebookAppId;
  if (facebookAppSecret) config.facebook.appSecret = facebookAppSecret;

  res.json({
    success: true,
    message: 'Settings updated successfully',
    settings: {
      ...runtimeSettings,
      facebookMockMode: facebookService.isMockMode,
      schedulerTestMode: config.scheduler.testMode
    }
  });
};
