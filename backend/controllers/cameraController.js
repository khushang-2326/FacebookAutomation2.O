const Camera = require('../models/Camera');
const cameraService = require('../services/cameraService');
const mediamtxService = require('../services/mediamtxService');
const { Logger } = require('../utils/logger');

const logger = new Logger('CameraController');

// @desc    Create/Save a new Camera
// @route   POST /api/cameras
exports.createCamera = async (req, res, next) => {
  try {
    const {
      name,
      streamPath,
      location,
      sourceType,
      rtspUrl,
      ipAddress,
      port,
      username,
      password,
      onvifEnabled,
      onvifProfile,
      manufacturer,
      model,
      serialNumber
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Camera name is required' });
    }

    const cleanStreamPath = streamPath || (rtspUrl ? rtspUrl.slice(rtspUrl.lastIndexOf('/')) : '/live/0/MAIN');
    let finalRtspUrl = rtspUrl;
    if (!finalRtspUrl && ipAddress && ipAddress !== '127.0.0.1') {
      finalRtspUrl = cameraService.constructRtspUrl(ipAddress, port || 554, username, password, cleanStreamPath);
    } else if (!finalRtspUrl) {
      finalRtspUrl = mediamtxService.getRtspUrl(cleanStreamPath);
    } else {
      finalRtspUrl = cameraService.injectCredentialsIntoUrl(finalRtspUrl, username, password);
    }

    // Validate MediaMTX stream
    const testResult = await mediamtxService.validateStreamPath(cleanStreamPath);

    const camera = new Camera({
      userId: req.user._id,
      name: name.trim(),
      streamPath: cleanStreamPath.startsWith('/') ? cleanStreamPath : `/${cleanStreamPath}`,
      location: location || 'POS Checkout Counter 1',
      sourceType: sourceType || 'MEDIAMTX_RTSP',
      ipAddress: ipAddress || '127.0.0.1',
      port: port || 8554,
      onvifEnabled: Boolean(onvifEnabled),
      onvifProfile: onvifProfile || 'Profile S/T',
      manufacturer: manufacturer || 'MediaMTX Camera',
      model: model || 'RTSP Stream Path',
      serialNumber: serialNumber || '',
      connectionStatus: testResult.available ? 'ONLINE' : 'RTSP_ERROR',
      videoCodec: testResult.videoCodec || 'h264',
      resolution: testResult.resolution || '1920x1080',
      fps: testResult.fps || 30,
      hasAudio: Boolean(testResult.hasAudio),
      lastSeenAt: testResult.available ? new Date() : null
    });

    camera.setCredentials(username || '', password || '');
    camera.setRtspUrl(finalRtspUrl);
    await camera.save();

    logger.info(`Saved Camera "${camera.name}" (${camera._id}) for User ${req.user._id}`);

    res.json({
      success: true,
      message: `Camera "${camera.name}" saved successfully!`,
      camera: {
        id: camera._id,
        name: camera.name,
        sourceType: camera.sourceType,
        ipAddress: camera.ipAddress,
        port: camera.port,
        maskedRtspUrl: camera.getMaskedRtspUrl(),
        connectionStatus: camera.connectionStatus,
        videoCodec: camera.videoCodec,
        resolution: camera.resolution,
        fps: camera.fps,
        hasAudio: camera.hasAudio,
        manufacturer: camera.manufacturer,
        model: camera.model,
        testResult
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all saved cameras for user
// @route   GET /api/cameras
exports.getCameras = async (req, res, next) => {
  try {
    const cameras = await Camera.find({ userId: req.user._id }).sort({ createdAt: -1 });

    const formatted = cameras.map(c => ({
      id: c._id,
      name: c.name,
      sourceType: c.sourceType,
      ipAddress: c.ipAddress,
      port: c.port,
      maskedRtspUrl: c.getMaskedRtspUrl(),
      connectionStatus: c.connectionStatus,
      onvifEnabled: c.onvifEnabled,
      onvifProfile: c.onvifProfile,
      manufacturer: c.manufacturer,
      model: c.model,
      serialNumber: c.serialNumber,
      mediaMtxPath: c.mediaMtxPath || cameraService.getMediaMtxPath(c),
      videoCodec: c.videoCodec,
      resolution: c.resolution,
      fps: c.fps,
      hasAudio: c.hasAudio,
      lastSeenAt: c.lastSeenAt,
      createdAt: c.createdAt
    }));

    res.json({
      success: true,
      cameras: formatted
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Prepare / register MediaMTX proxy paths for all user CCTV cameras for live preview
// @route   POST /api/cameras/prepare-previews
exports.preparePreviews = async (req, res, next) => {
  try {
    const cameras = await Camera.find({ userId: req.user._id });
    const results = [];
    for (const cam of cameras) {
      try {
        const rawUrl = cameraService.resolveRtspUrl(cam);
        const pathName = cameraService.getMediaMtxPath(cam);
        const mtxRes = await mediamtxService.registerProxyPath(pathName, rawUrl);
        results.push({
          id: cam._id,
          name: cam.name,
          mediaMtxPath: pathName,
          success: mtxRes.success,
          rtspUrl: mtxRes.rtspUrl
        });
      } catch (err) {
        results.push({
          id: cam._id,
          name: cam.name,
          error: err.message
        });
      }
    }
    res.json({ success: true, previews: results });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single camera details
// @route   GET /api/cameras/:id
exports.getCameraById = async (req, res, next) => {
  try {
    const camera = await Camera.findOne({ _id: req.params.id, userId: req.user._id });
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    res.json({
      success: true,
      camera: {
        id: camera._id,
        name: camera.name,
        sourceType: camera.sourceType,
        ipAddress: camera.ipAddress,
        port: camera.port,
        maskedRtspUrl: camera.getMaskedRtspUrl(),
        connectionStatus: camera.connectionStatus,
        videoCodec: camera.videoCodec,
        resolution: camera.resolution,
        fps: camera.fps,
        hasAudio: camera.hasAudio,
        manufacturer: camera.manufacturer,
        model: camera.model,
        lastSeenAt: camera.lastSeenAt
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test RTSP Stream URL directly (before saving)
// @route   POST /api/cameras/test-url
exports.testRtspUrl = async (req, res, next) => {
  try {
    const { rtspUrl, username, password } = req.body;
    if (!rtspUrl) {
      return res.status(400).json({ success: false, error: 'RTSP URL is required for testing' });
    }

    const finalRtspUrl = cameraService.injectCredentialsIntoUrl(rtspUrl, username, password);
    const testResult = await cameraService.testRtspStream(finalRtspUrl);
    res.json({
      success: testResult.passed,
      testResult
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test saved camera connection & dynamic MediaMTX path relay
// @route   POST /api/cameras/:id/test
exports.testCamera = async (req, res, next) => {
  try {
    const camera = await Camera.findOne({ _id: req.params.id, userId: req.user._id });
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    // Ensure MediaMTX is started before the camera test
    try {
      const mtxMgr = require('../services/mediamtxProcessManager');
      const mtxResult = await mtxMgr.start();
      if (!mtxResult.started) {
        return res.json({
          success: false,
          connectionStatus: 'UNKNOWN',       // NOT OFFLINE — MediaMTX failed, not the camera
          mediaMtxStatus: 'FAILED',
          rtspStatus: 'NOT_TESTED',
          errorCode: mtxResult.errorCode || 'MEDIAMTX_START_FAILED',
          error: mtxResult.error || 'MediaMTX could not be started. Camera RTSP not tested.',
          testResult: { success: false, cameraStatus: 'UNKNOWN', mediaMtxStatus: 'FAILED' }
        });
      }
    } catch (mtxErr) {
      logger.warn(`MediaMTX pre-start failed: ${mtxErr.message}`);
    }

    const testResult = await cameraService.testDynamicCameraPath(camera._id);

    // Determine separate status fields
    const cameraStatus  = testResult.cameraStatus  || 'UNKNOWN';
    const rtspStatus    = testResult.rtspStatus     || 'NOT_TESTED';
    const mediaMtxState = testResult.errorCode === 'MEDIAMTX_UNAVAILABLE' ? 'FAILED' : 'READY';

    res.json({
      success: testResult.success,
      connectionStatus: cameraStatus,   // Physical camera status only
      mediaMtxStatus:  mediaMtxState,
      rtspStatus,
      testResult
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Discover ONVIF cameras on local network
// @route   POST /api/cameras/discover
exports.discoverCameras = async (req, res, next) => {
  try {
    const discovered = await cameraService.discoverOnvifCameras();
    res.json({
      success: true,
      count: discovered.length,
      cameras: discovered
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update / Rename a camera
// @route   PUT /api/cameras/:id
exports.updateCamera = async (req, res, next) => {
  try {
    const camera = await Camera.findOne({ _id: req.params.id, userId: req.user._id });
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    const {
      name,
      location,
      ipAddress,
      port,
      streamPath,
      rtspUrl,
      username,
      password,
      sourceType
    } = req.body;

    const oldName = camera.name;
    if (name && name.trim()) {
      camera.name = name.trim();
    }
    if (location !== undefined) camera.location = location;
    if (sourceType) camera.sourceType = sourceType;
    if (ipAddress) camera.ipAddress = ipAddress;
    if (port) camera.port = Number(port);
    if (streamPath) camera.streamPath = streamPath.startsWith('/') ? streamPath : `/${streamPath}`;

    if (username !== undefined || password !== undefined) {
      camera.setCredentials(username || '', password || '');
    }

    if (rtspUrl) {
      const finalRtspUrl = cameraService.injectCredentialsIntoUrl(rtspUrl, username, password);
      camera.setRtspUrl(finalRtspUrl);
    } else if (ipAddress && ipAddress !== '127.0.0.1') {
      const finalRtspUrl = cameraService.constructRtspUrl(ipAddress, camera.port || 554, username, password, camera.streamPath);
      camera.setRtspUrl(finalRtspUrl);
    }

    await camera.save();

    // Propagate new name to all existing Automation camera schedules
    if (name && name.trim() !== oldName) {
      try {
        const { Automation } = require('../models/Automation');
        await Automation.updateMany(
          { 'cameraSchedules.cameraId': camera._id },
          { $set: { 'cameraSchedules.$[elem].cameraName': camera.name } },
          { arrayFilters: [{ 'elem.cameraId': camera._id }] }
        );
      } catch (autoErr) {
        logger.warn(`Failed to propagate camera rename to automations: ${autoErr.message}`);
      }
    }

    try {
      const socketService = require('../services/socketService');
      socketService.broadcast('camera:updated', {
        id: camera._id,
        name: camera.name,
        location: camera.location,
        sourceType: camera.sourceType,
        ipAddress: camera.ipAddress,
        port: camera.port,
        maskedRtspUrl: camera.getMaskedRtspUrl()
      });
    } catch (sockErr) {}

    logger.info(`Updated Camera "${camera.name}" (${camera._id}) for User ${req.user._id}`);

    res.json({
      success: true,
      message: `Camera "${camera.name}" updated successfully!`,
      camera: {
        id: camera._id,
        name: camera.name,
        location: camera.location,
        sourceType: camera.sourceType,
        ipAddress: camera.ipAddress,
        port: camera.port,
        maskedRtspUrl: camera.getMaskedRtspUrl(),
        connectionStatus: camera.connectionStatus,
        videoCodec: camera.videoCodec,
        resolution: camera.resolution,
        fps: camera.fps
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Rename / set custom label for local Webcam device
// @route   PUT /api/cameras/webcams/rename
exports.renameWebcam = async (req, res, next) => {
  try {
    const { deviceName, customName } = req.body;
    if (!deviceName || !deviceName.trim()) {
      return res.status(400).json({ success: false, error: 'deviceName is required' });
    }

    const cleanDevName = deviceName.trim();
    const cleanCustomName = (customName || '').trim() || cleanDevName;

    const CameraAlias = require('../models/CameraAlias');
    const filter = {
      $or: [
        { deviceName: cleanDevName, userId: req.user?._id || null },
        { deviceName: cleanDevName }
      ]
    };

    const alias = await CameraAlias.findOneAndUpdate(
      filter,
      {
        userId: req.user?._id || null,
        deviceName: cleanDevName,
        customName: cleanCustomName,
        deviceType: 'WEBCAM'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Propagate webcam custom name to all Automation camera schedules
    try {
      const Automation = require('../models/Automation');
      await Automation.updateMany(
        { 'cameraSchedules.deviceName': cleanDevName },
        { $set: { 'cameraSchedules.$[elem].cameraName': cleanCustomName } },
        { arrayFilters: [{ 'elem.deviceName': cleanDevName }] }
      );
    } catch (autoErr) {
      logger.warn(`Failed to propagate webcam rename to automations: ${autoErr.message}`);
    }

    try {
      const socketService = require('../services/socketService');
      socketService.broadcast('webcam:renamed', {
        deviceName: cleanDevName,
        customName: cleanCustomName
      });
      socketService.broadcast('camera:updated', {
        isWebcam: true,
        deviceName: cleanDevName,
        name: cleanCustomName
      });
    } catch (sockErr) {}

    logger.info(`Renamed Webcam "${cleanDevName}" to "${cleanCustomName}"`);

    res.json({
      success: true,
      message: `Webcam renamed to "${cleanCustomName}"`,
      alias: {
        deviceName: cleanDevName,
        customName: cleanCustomName
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all webcam aliases
// @route   GET /api/cameras/webcams/aliases
exports.getWebcamAliases = async (req, res, next) => {
  try {
    const CameraAlias = require('../models/CameraAlias');
    const aliases = await CameraAlias.find({});
    res.json({
      success: true,
      aliases: aliases.map(a => ({
        deviceName: a.deviceName,
        customName: a.customName
      }))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a camera
// @route   DELETE /api/cameras/:id
exports.deleteCamera = async (req, res, next) => {
  try {
    const camera = await Camera.findOne({ _id: req.params.id, userId: req.user._id });
    if (!camera) {
      return res.status(404).json({ success: false, error: 'Camera not found' });
    }

    await Camera.deleteOne({ _id: camera._id });
    logger.info(`Deleted Camera "${camera.name}" (${camera._id}) for User ${req.user._id}`);

    res.json({
      success: true,
      message: `Camera "${camera.name}" deleted successfully.`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete / reset custom webcam alias
// @route   POST /api/cameras/webcams/delete or DELETE /api/cameras/webcams/alias
exports.deleteWebcamAlias = async (req, res, next) => {
  try {
    const deviceName = req.body?.deviceName || req.query?.deviceName;
    if (!deviceName || !deviceName.trim()) {
      return res.status(400).json({ success: false, error: 'deviceName is required' });
    }

    const cleanDevName = deviceName.trim();
    const CameraAlias = require('../models/CameraAlias');
    const filter = {
      deviceName: cleanDevName,
      ...(req.user?._id ? { $or: [{ userId: req.user._id }, { userId: null }] } : {})
    };

    await CameraAlias.deleteMany(filter);

    // Revert webcam name in Automation camera schedules back to deviceName
    try {
      const Automation = require('../models/Automation');
      await Automation.updateMany(
        { 'cameraSchedules.deviceName': cleanDevName },
        { $set: { 'cameraSchedules.$[elem].cameraName': cleanDevName } },
        { arrayFilters: [{ 'elem.deviceName': cleanDevName }] }
      );
    } catch (_) {}

    try {
      const socketService = require('../services/socketService');
      socketService.broadcast('webcam:renamed', {
        deviceName: cleanDevName,
        customName: cleanDevName
      });
      socketService.broadcast('camera:updated', {
        isWebcam: true,
        deviceName: cleanDevName,
        name: cleanDevName
      });
    } catch (_) {}

    logger.info(`Deleted custom alias for webcam "${cleanDevName}"`);

    res.json({
      success: true,
      message: `Webcam alias removed. Reverted to "${cleanDevName}".`
    });
  } catch (error) {
    next(error);
  }
};


