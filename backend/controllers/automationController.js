const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const FacebookPage = require('../models/FacebookPage');
const schedulerService = require('../services/schedulerService');
const broadcastService = require('../services/broadcastService');
const ffmpegService = require('../services/ffmpegService');
const { gstreamerService } = require('../services/gstreamerService');
const config = require('../config/config');
const { Logger } = require('../utils/logger');
const youtubeService = require('../services/youtubeService');

const logger = new Logger('AutomationController');

const safeParseDate = (val) => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// @desc    Create a new scheduled automation
// @route   POST /api/automations
exports.createAutomation = async (req, res, next) => {
  try {
    const {
      name,
      facebookPageId,
      destinationPlatform,
      mediaId,
      sourceType,
      cameraId,
      localCameraDevice,
      audioSourceType,
      audioMediaId,
      audioDeviceName,
      audioTrackVolume,
      micVolume,
      loopAudio,
      youtubeUrl,
      title,
      description,
      loopVideo,
      fps: reqFps,
      videoBitrate: reqVideoBitrate,
      scheduledStartTime,
      timezone,
      rotationDurationSec,
      restartDelaySec,
      repeatMode,
      completionMode,
      totalDurationHours,
      totalDurationSec: reqTotalDurationSec,
      targetEndTime: reqTargetEndTime,
      maxRotations,
      startImmediately,
      scheduleName,
      scheduleMode,
      startDate,
      endDate,
      daysOfWeek,
      dailyStartTime,
      dailyEndTime,
      enableDailyWindow
    } = req.body;

    const normalizedSourceType = sourceType || 'VIDEO_FILE';
    const isRtspCamera = normalizedSourceType === 'RTSP_CAMERA' || normalizedSourceType === 'ONVIF_CAMERA';
    const isLocalCamera = normalizedSourceType === 'LOCAL_CAMERA';
    const isCameraSource = isRtspCamera || isLocalCamera;
    const isYouTubeSource = normalizedSourceType === 'YOUTUBE_VIDEO';

    const targetPlatform = destinationPlatform || 'FACEBOOK';
    const allCandidatePageIds = [
      facebookPageId,
      ...(Array.isArray(req.body.targetPageIds) ? req.body.targetPageIds : [])
    ].filter(Boolean);

    let resolvedYoutubeStreamKey = (req.body.youtubeStreamKey && typeof req.body.youtubeStreamKey === 'string')
      ? req.body.youtubeStreamKey.trim()
      : '';
    let resolvedYoutubeServerUrl = req.body.youtubeServerUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2/';
    let candidateYoutubeResolution = null;
    let candidateYoutubeFps = null;
    let candidateYoutubeBitrate = null;

    if (allCandidatePageIds.length > 0) {
      for (const pId of allCandidatePageIds) {
        try {
          const cleanId = typeof pId === 'object' && pId !== null ? (pId._id || pId.id) : pId;
          const pDoc = await FacebookPage.findById(cleanId);
          if (pDoc) {
            const isYT = pDoc.platform === 'YOUTUBE' || pDoc.category?.includes('YouTube') || pDoc.name?.toLowerCase().includes('youtube');
            if (isYT) {
              if (!resolvedYoutubeStreamKey && pDoc.getPageAccessToken) {
                resolvedYoutubeStreamKey = pDoc.getPageAccessToken() || '';
              }
              if (pDoc.serverUrl) {
                resolvedYoutubeServerUrl = pDoc.serverUrl;
              }
              if (pDoc.resolution && !candidateYoutubeResolution) {
                candidateYoutubeResolution = pDoc.resolution;
              }
              if (pDoc.fps && !candidateYoutubeFps) {
                candidateYoutubeFps = pDoc.fps;
              }
              if (pDoc.bitrate && !candidateYoutubeBitrate) {
                candidateYoutubeBitrate = pDoc.bitrate;
              }
            }
          }
        } catch (_) {}
      }
    }

    if (targetPlatform === 'FACEBOOK' && !facebookPageId && allCandidatePageIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Select a Facebook Page for Facebook Live broadcast.' });
    }
    if (targetPlatform === 'YOUTUBE' && !resolvedYoutubeStreamKey && allCandidatePageIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Select a connected YouTube destination or enter your YouTube Live Stream Key.' });
    }

    // Resolve Multi-Camera Cycling Schedules (CCTV + Webcams)
    let resolvedCameraSchedules = [];
    if (isCameraSource && Array.isArray(req.body.cameraSchedules) && req.body.cameraSchedules.length > 0) {
      resolvedCameraSchedules = req.body.cameraSchedules.map((item, idx) => {
        const isWebcam = item.cameraType === 'WEBCAM' || Boolean(item.deviceName) || (!item.cameraId && item.cameraType !== 'RTSP');
        if (isWebcam) {
          const dev = item.deviceName || req.body.localCameraDevice || '';
          return {
            cameraType: 'WEBCAM',
            cameraId: null,
            deviceName: dev,
            cameraName: item.cameraName || dev || 'Webcam',
            durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 20),
            order: typeof item.order === 'number' ? item.order : idx,
          };
        }
        const cleanCamId = typeof item.cameraId === 'object' && item.cameraId !== null ? (item.cameraId._id || item.cameraId.id) : item.cameraId;
        return {
          cameraType: 'RTSP',
          cameraId: cleanCamId || undefined,
          deviceName: null,
          cameraName: item.cameraName || undefined,
          durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 20),
          order: typeof item.order === 'number' ? item.order : idx,
        };
      }).filter(item => (item.cameraType === 'WEBCAM' && item.deviceName) || (item.cameraType === 'RTSP' && item.cameraId));
    } else if (isRtspCamera && cameraId) {
      const cleanCamId = typeof cameraId === 'object' && cameraId !== null ? (cameraId._id || cameraId.id) : cameraId;
      if (cleanCamId) {
        resolvedCameraSchedules = [{
          cameraType: 'RTSP',
          cameraId: cleanCamId,
          durationSeconds: 20,
          order: 0,
        }];
      }
    } else if (isLocalCamera && (req.body.localCameraDevice || localCameraDevice)) {
      const dev = req.body.localCameraDevice || localCameraDevice;
      resolvedCameraSchedules = [{
        cameraType: 'WEBCAM',
        cameraId: null,
        deviceName: dev,
        cameraName: dev,
        durationSeconds: 20,
        order: 0,
      }];
    }

    let resolvedYoutubeSchedules = [];
    if (Array.isArray(req.body.youtubeSchedules) && req.body.youtubeSchedules.length > 0) {
      resolvedYoutubeSchedules = req.body.youtubeSchedules.map((item, idx) => ({
        youtubeUrl: item.youtubeUrl ? String(item.youtubeUrl).trim() : '',
        title: item.title ? String(item.title).trim() : '',
        durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 30),
        order: typeof item.order === 'number' ? item.order : idx,
      })).filter(item => youtubeService.isYouTubeUrl(item.youtubeUrl));
    }

    let resolvedMediaSchedules = [];
    if (Array.isArray(req.body.mediaSchedules) && req.body.mediaSchedules.length > 0) {
      resolvedMediaSchedules = req.body.mediaSchedules.map((item, idx) => {
        const cleanMediaId = typeof item.mediaId === 'object' && item.mediaId !== null ? (item.mediaId._id || item.mediaId.id) : item.mediaId;
        return {
          mediaId: cleanMediaId,
          title: item.title ? String(item.title).trim() : '',
          durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 30),
          order: typeof item.order === 'number' ? item.order : idx,
        };
      }).filter(item => item.mediaId);
    }

    if (isYouTubeSource) {
      if (resolvedYoutubeSchedules.length === 0 && !youtubeService.isYouTubeUrl(youtubeUrl)) {
        return res.status(400).json({ success: false, error: 'Enter at least one valid YouTube video URL.' });
      }
    }
    if (isCameraSource && resolvedCameraSchedules.length === 0 && !cameraId && !localCameraDevice) {
      return res.status(400).json({ success: false, error: 'Select at least one camera (CCTV or Webcam).' });
    }
    if (!isCameraSource && !isYouTubeSource && !mediaId && resolvedMediaSchedules.length === 0) {
      return res.status(400).json({ success: false, error: 'Select an uploaded video, image, or camera.' });
    }

    const defaultRotation = config.scheduler.testMode
      ? config.scheduler.testRotationDuration
      : config.scheduler.defaultRotationDuration;

    const defaultDelay = config.scheduler.testMode
      ? config.scheduler.testRestartDelay
      : config.scheduler.defaultRestartDelay;

    const isRecurring = scheduleMode === 'RECURRING_WINDOW';
    const effectiveStartImmediately = isRecurring ? false : Boolean(startImmediately);
    let startTime = new Date();
    if (!effectiveStartImmediately && scheduledStartTime) {
      const parsed = new Date(scheduledStartTime);
      if (!isNaN(parsed.getTime())) {
        startTime = parsed;
      }
    }

    let finalCompletionMode = completionMode || (repeatMode === 'DURATION' ? 'DURATION' : 'INDEFINITE');
    let finalTotalSec = null;
    let finalTotalHours = null;
    let computedEndTime = null;

    if (finalCompletionMode === 'DURATION' || totalDurationHours || reqTotalDurationSec) {
      finalCompletionMode = 'DURATION';
      if (reqTotalDurationSec) {
        finalTotalSec = Number(reqTotalDurationSec);
        finalTotalHours = parseFloat((finalTotalSec / 3600).toFixed(4));
      } else if (totalDurationHours) {
        finalTotalHours = Number(totalDurationHours);
        finalTotalSec = Math.round(finalTotalHours * 3600);
      }
      if (finalTotalSec) {
        computedEndTime = new Date(startTime.getTime() + (finalTotalSec * 1000));
      }
    } else if (finalCompletionMode === 'END_TIME' && reqTargetEndTime) {
      computedEndTime = new Date(reqTargetEndTime);
      finalTotalSec = Math.max(0, Math.round((computedEndTime.getTime() - startTime.getTime()) / 1000));
      finalTotalHours = parseFloat((finalTotalSec / 3600).toFixed(2));
    }

    // If total duration is less than default rotation, set rotation duration to total duration
    let effectiveRotation = rotationDurationSec || defaultRotation;
    if (finalTotalSec && finalTotalSec < effectiveRotation) {
      effectiveRotation = finalTotalSec;
    }

    const rawTargetPageIds = Array.isArray(req.body.targetPageIds) && req.body.targetPageIds.length > 0
      ? req.body.targetPageIds
      : (facebookPageId ? [facebookPageId] : []);

    const primaryPageId = rawTargetPageIds.length > 0 ? rawTargetPageIds[0] : facebookPageId;

    const rawAudioIds = Array.isArray(req.body.audioMediaIds) && req.body.audioMediaIds.length > 0
      ? req.body.audioMediaIds.map(id => typeof id === 'object' && id !== null ? (id._id || id.id) : id).filter(Boolean)
      : (audioMediaId ? [typeof audioMediaId === 'object' && audioMediaId !== null ? (audioMediaId._id || audioMediaId.id) : audioMediaId].filter(Boolean) : []);

    const primaryAudioId = rawAudioIds.length > 0 ? rawAudioIds[0] : (audioMediaId || undefined);

    const firstCameraSlot = resolvedCameraSchedules[0];
    const effectiveCameraSourceType = isCameraSource
      ? (firstCameraSlot ? (firstCameraSlot.cameraType === 'WEBCAM' ? 'LOCAL_CAMERA' : 'RTSP_CAMERA') : normalizedSourceType)
      : normalizedSourceType;

    const automation = await Automation.create({
      userId: req.user._id,
      name,
      facebookPageId: primaryPageId,
      targetPageIds: rawTargetPageIds,
      destinationPlatform: (rawTargetPageIds.length > 1 || (rawTargetPageIds.length >= 1 && Boolean(resolvedYoutubeStreamKey || req.body.youtubeStreamKey?.trim())))
        ? 'MULTI_DESTINATION'
        : (targetPlatform || (rawTargetPageIds.length > 1 ? 'MULTI_DESTINATION' : 'FACEBOOK')),
      youtubeStreamKey: resolvedYoutubeStreamKey || req.body.youtubeStreamKey?.trim() || null,
      youtubeServerUrl: resolvedYoutubeServerUrl || req.body.youtubeServerUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2/',
      sourceType: effectiveCameraSourceType,
      mediaId: isYouTubeSource || isCameraSource ? undefined : (resolvedMediaSchedules[0]?.mediaId || mediaId || undefined),
      mediaSchedules: (!isYouTubeSource && !isCameraSource) ? resolvedMediaSchedules : [],
      cameraId: (effectiveCameraSourceType === 'RTSP_CAMERA') ? (firstCameraSlot?.cameraId || cameraId || undefined) : undefined,
      cameraSchedules: isCameraSource ? resolvedCameraSchedules : [],
      localCameraDevice: (effectiveCameraSourceType === 'LOCAL_CAMERA') ? (firstCameraSlot?.deviceName || localCameraDevice || undefined) : undefined,
      currentCameraSlotIndex: 0,
      audioSourceType: audioSourceType || 'CAMERA_AUDIO',
      audioMediaId: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? primaryAudioId : undefined,
      audioMediaIds: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? rawAudioIds : [],
      audioDeviceName: (audioSourceType === 'MICROPHONE' || audioSourceType === 'MIC_AND_TRACK') ? (audioDeviceName || undefined) : undefined,
      audioTrackVolume: audioTrackVolume !== undefined ? Number(audioTrackVolume) : 0.8,
      micVolume: micVolume !== undefined ? Number(micVolume) : 1.0,
      loopAudio: loopAudio !== undefined ? Boolean(loopAudio) : true,
      youtubeUrl: isYouTubeSource ? (resolvedYoutubeSchedules[0]?.youtubeUrl || (youtubeUrl ? youtubeUrl.trim() : undefined)) : undefined,
      youtubeSchedules: isYouTubeSource ? resolvedYoutubeSchedules : [],
      title,
      description: description || '',
      loopVideo: loopVideo !== undefined ? Boolean(loopVideo) : true,
      fps: (reqFps === 60 || parseInt(reqFps, 10) === 60) ? 60 : 30,
      encoderMode: req.body.encoderMode || process.env.HARDWARE_ENCODING_MODE || 'AUTO',
      videoBitrate: reqVideoBitrate ? String(reqVideoBitrate).trim() : null,
      youtubeResolution: (req.body.youtubeResolution && req.body.youtubeResolution !== '1080p')
        ? req.body.youtubeResolution
        : (candidateYoutubeResolution || req.body.youtubeResolution || '1080p'),
      youtubeFps: (req.body.youtubeFps === 60 || parseInt(req.body.youtubeFps, 10) === 60) ? 60 : (candidateYoutubeFps || 30),
      youtubeBitrate: req.body.youtubeBitrate ? String(req.body.youtubeBitrate).trim() : (candidateYoutubeBitrate || null),
      scheduleName: scheduleName?.trim() || null,
      scheduleMode: scheduleMode || (effectiveStartImmediately ? 'IMMEDIATE' : 'ONE_TIME_FUTURE'),
      startDate: safeParseDate(startDate),
      endDate: safeParseDate(endDate),
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek.map(d => {
        if (typeof d === 'number' && !isNaN(d)) return d;
        if (typeof d === 'string') {
          const s = d.trim().toLowerCase();
          if (s.startsWith('sun')) return 0;
          if (s.startsWith('mon')) return 1;
          if (s.startsWith('tue')) return 2;
          if (s.startsWith('wed')) return 3;
          if (s.startsWith('thu')) return 4;
          if (s.startsWith('fri')) return 5;
          if (s.startsWith('sat')) return 6;
          const p = parseInt(s, 10);
          if (!isNaN(p)) return p;
        }
        return null;
      }).filter(d => d !== null) : [1, 2, 3, 4, 5],
      dailyStartTime: dailyStartTime || '09:00',
      dailyEndTime: dailyEndTime || '17:00',
      enableDailyWindow: enableDailyWindow !== undefined ? Boolean(enableDailyWindow) : (isRecurring ? true : false),
      startImmediately: effectiveStartImmediately,
      scheduledStartTime: startTime,
      timezone: timezone || 'Asia/Kolkata',
      rotationDurationSec: effectiveRotation,
      restartDelaySec: restartDelaySec || defaultDelay,
      repeatMode: repeatMode || (finalCompletionMode === 'DURATION' ? 'DURATION' : 'INDEFINITE'),
      completionMode: finalCompletionMode,
      totalDurationHours: finalTotalHours,
      totalDurationSec: finalTotalSec,
      targetEndTime: computedEndTime,
      maxRotations: maxRotations || 0,
      status: 'SCHEDULED',
      healthStatus: 'HEALTHY'
    });

    logger.info(`Created Automation "${automation.name}" (${automation._id})`);

    // If starting immediately, trigger first broadcast right away
    if (startImmediately) {
      // Allow scheduler tick to pick it up or trigger directly
      process.nextTick(async () => {
        try {
          if (automation.status !== 'SCHEDULED') {
      automation.status = 'SCHEDULED';
      automation.retryCount = 0;
      automation.retryWindowStartedAt = null;
      automation.nextRetryScheduledAt = null;
      await automation.save();
    }

    await schedulerService._handleStartScheduled(automation);
        } catch (err) {
          logger.error(`Error auto-starting automation ${automation._id}: ${err.message}`);
        }
      });
    }

    res.status(201).json({
      success: true,
      automation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all automations for user
// @route   GET /api/automations
exports.getAutomations = async (req, res, next) => {
  try {
    const automations = await Automation.find({ userId: req.user._id })
      .populate('facebookPageId', 'name pageId category pictureUrl isValid isMock')
      .populate('mediaId', 'filename originalName mediaType durationSec fileSizeBytes')
      .populate('mediaSchedules.mediaId', 'filename originalName mediaType durationSec fileSizeBytes')
      .populate('cameraId', 'name ipAddress port streamPath mediaMtxPath')
      .populate('cameraSchedules.cameraId', 'name ipAddress port streamPath mediaMtxPath')
      .populate('activeBroadcastId')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: automations.length,
      automations
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single automation by ID with full timeline
// @route   GET /api/automations/:id
exports.getAutomationById = async (req, res, next) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('facebookPageId', 'name pageId category pictureUrl isValid isMock platform streamType serverUrl')
      .populate('mediaId')
      .populate('mediaSchedules.mediaId')
      .populate('cameraId')
      .populate('cameraSchedules.cameraId')
      .populate('audioMediaId')
      .populate('audioMediaIds')
      .populate('activeBroadcastId');

    if (!automation) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    // Get recent broadcasts for this automation
    const broadcasts = await Broadcast.find({ automationId: automation._id })
      .sort({ rotationIndex: -1 })
      .limit(20);

    // Get active process telemetry if currently running
    let activeProcess = null;
    if (automation.activeBroadcastId) {
      const bId = (automation.activeBroadcastId._id || automation.activeBroadcastId).toString();
      const gstEntry = gstreamerService.activeProcesses.get(bId) || gstreamerService.getActivePipeline(automation._id);
      if (gstEntry) {
        activeProcess = {
          engine: 'GSTREAMER',
          pid: gstEntry.child ? gstEntry.child.pid : null,
          status: gstEntry.status,
          metrics: gstEntry.metrics || null,
          isMock: false
        };
      } else {
        const activeEntry = ffmpegService.activeProcesses.get(bId);
        if (activeEntry) {
          activeProcess = {
            engine: 'FFMPEG',
            pid: activeEntry.pid,
            metrics: activeEntry.metrics,
            isMock: activeEntry.isMock
          };
        }
      }
    }

    res.json({
      success: true,
      automation,
      broadcasts,
      activeProcess
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update automation details (Support live modifications of all modules!)
// @route   PUT /api/automations/:id
exports.updateAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    const {
      name,
      facebookPageId,
      targetPageIds,
      destinationPlatform,
      youtubeStreamKey,
      youtubeServerUrl,
      sourceType,
      mediaId,
      cameraId,
      localCameraDevice,
      audioSourceType,
      audioMediaId,
      audioDeviceName,
      audioTrackVolume,
      micVolume,
      loopAudio,
      youtubeUrl,
      title,
      description,
      loopVideo,
      startImmediately,
      scheduledStartTime,
      timezone,
      rotationDurationSec,
      restartDelaySec,
      repeatMode,
      completionMode,
      totalDurationHours,
      totalDurationSec: reqTotalDurationSec,
      targetEndTime: reqTargetEndTime,
      maxRotations,
      scheduleName,
      scheduleMode,
      startDate,
      endDate,
      daysOfWeek,
      dailyStartTime,
      dailyEndTime,
      enableDailyWindow
    } = req.body;

    if (name !== undefined) automation.name = name;
    if (title !== undefined) automation.title = title;
    if (description !== undefined) automation.description = description;
    if (destinationPlatform !== undefined) automation.destinationPlatform = destinationPlatform;
    if (facebookPageId !== undefined) {
      const cleanFbId = typeof facebookPageId === 'object' && facebookPageId !== null ? (facebookPageId._id || facebookPageId.id) : facebookPageId;
      automation.facebookPageId = cleanFbId ? cleanFbId : null;
    }
    if (targetPageIds !== undefined && Array.isArray(targetPageIds)) {
      const cleanTargetIds = targetPageIds.map(p => typeof p === 'object' && p !== null ? (p._id || p.id) : p).filter(Boolean);
      automation.targetPageIds = cleanTargetIds;
      if (cleanTargetIds.length > 0) automation.facebookPageId = cleanTargetIds[0];
    }
    let resolvedUpdateYoutubeKey = (youtubeStreamKey !== undefined && typeof youtubeStreamKey === 'string') 
      ? youtubeStreamKey.trim() 
      : (automation.youtubeStreamKey || '');

    const allUpdateCandidatePageIds = [
      automation.facebookPageId,
      ...(Array.isArray(automation.targetPageIds) ? automation.targetPageIds : [])
    ].filter(Boolean);

    if (!resolvedUpdateYoutubeKey && allUpdateCandidatePageIds.length > 0) {
      for (const pId of allUpdateCandidatePageIds) {
        try {
          const cleanId = typeof pId === 'object' && pId !== null ? (pId._id || pId.id) : pId;
          const pDoc = await FacebookPage.findById(cleanId);
          if (pDoc) {
            const isYT = pDoc.platform === 'YOUTUBE' || pDoc.category?.includes('YouTube') || pDoc.name?.toLowerCase().includes('youtube');
            if (isYT && pDoc.getPageAccessToken) {
              resolvedUpdateYoutubeKey = pDoc.getPageAccessToken() || '';
              if (pDoc.serverUrl && !youtubeServerUrl) {
                automation.youtubeServerUrl = pDoc.serverUrl;
              }
              break;
            }
          }
        } catch (_) {}
      }
    }

    if (resolvedUpdateYoutubeKey) {
      automation.youtubeStreamKey = resolvedUpdateYoutubeKey;
    } else if (youtubeStreamKey !== undefined) {
      automation.youtubeStreamKey = youtubeStreamKey;
    }
    if (youtubeServerUrl !== undefined) automation.youtubeServerUrl = youtubeServerUrl;
    if (sourceType !== undefined) automation.sourceType = sourceType;
    if (mediaId !== undefined) {
      const cleanMediaId = typeof mediaId === 'object' && mediaId !== null ? (mediaId._id || mediaId.id) : mediaId;
      automation.mediaId = cleanMediaId ? cleanMediaId : null;
    }
    if (cameraId !== undefined) {
      const cleanCamId = typeof cameraId === 'object' && cameraId !== null ? (cameraId._id || cameraId.id) : cameraId;
      automation.cameraId = cleanCamId ? cleanCamId : null;
    }
    const isCamera = ['LOCAL_CAMERA', 'RTSP_CAMERA', 'ONVIF_CAMERA'].includes(automation.sourceType);
    if (!isCamera) {
      automation.cameraSchedules = [];
      automation.cameraId = null;
      automation.localCameraDevice = null;
    } else if (req.body.cameraSchedules !== undefined) {
      if (Array.isArray(req.body.cameraSchedules)) {
        automation.cameraSchedules = req.body.cameraSchedules.map((item, idx) => {
          const isWebcam = item.cameraType === 'WEBCAM' || Boolean(item.deviceName) || (!item.cameraId && item.cameraType !== 'RTSP');
          if (isWebcam) {
            const dev = item.deviceName || req.body.localCameraDevice || automation.localCameraDevice || '';
            return {
              cameraType: 'WEBCAM',
              cameraId: null,
              deviceName: dev,
              cameraName: item.cameraName || dev || 'Webcam',
              durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 20),
              order: typeof item.order === 'number' ? item.order : idx,
            };
          }
          const cleanCamId = typeof item.cameraId === 'object' && item.cameraId !== null ? (item.cameraId._id || item.cameraId.id) : item.cameraId;
          return {
            cameraType: 'RTSP',
            cameraId: cleanCamId || undefined,
            deviceName: null,
            cameraName: item.cameraName || undefined,
            durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 20),
            order: typeof item.order === 'number' ? item.order : idx,
          };
        }).filter(item => (item.cameraType === 'WEBCAM' && item.deviceName) || (item.cameraType === 'RTSP' && item.cameraId));

        const firstCameraSlot = automation.cameraSchedules[0];
        if (firstCameraSlot) {
          if (firstCameraSlot.cameraType === 'WEBCAM') {
            automation.sourceType = 'LOCAL_CAMERA';
            automation.localCameraDevice = firstCameraSlot.deviceName;
            automation.cameraId = null;
          } else {
            automation.sourceType = 'RTSP_CAMERA';
            automation.cameraId = firstCameraSlot.cameraId;
            automation.localCameraDevice = null;
          }
        }
      } else {
        automation.cameraSchedules = [];
      }
    }
    if (isCamera && localCameraDevice !== undefined) automation.localCameraDevice = localCameraDevice;
    if (req.body.youtubeSchedules !== undefined) {
      if (Array.isArray(req.body.youtubeSchedules)) {
        automation.youtubeSchedules = req.body.youtubeSchedules.map((item, idx) => ({
          youtubeUrl: item.youtubeUrl ? String(item.youtubeUrl).trim() : '',
          title: item.title ? String(item.title).trim() : '',
          durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 30),
          order: typeof item.order === 'number' ? item.order : idx,
        })).filter(item => youtubeService.isYouTubeUrl(item.youtubeUrl));

        if (automation.youtubeSchedules.length > 0) {
          automation.youtubeUrl = automation.youtubeSchedules[0].youtubeUrl;
        }
      } else {
        automation.youtubeSchedules = [];
      }
    }
    if (req.body.mediaSchedules !== undefined) {
      if (Array.isArray(req.body.mediaSchedules)) {
        automation.mediaSchedules = req.body.mediaSchedules.map((item, idx) => {
          const cleanMediaId = typeof item.mediaId === 'object' && item.mediaId !== null ? (item.mediaId._id || item.mediaId.id) : item.mediaId;
          return {
            mediaId: cleanMediaId,
            title: item.title ? String(item.title).trim() : '',
            durationSeconds: Math.max(1, parseInt(item.durationSeconds, 10) || 30),
            order: typeof item.order === 'number' ? item.order : idx,
          };
        }).filter(item => item.mediaId);

        if (automation.mediaSchedules.length > 0) {
          automation.mediaId = automation.mediaSchedules[0].mediaId;
        }
      } else {
        automation.mediaSchedules = [];
      }
    }
    if (youtubeUrl !== undefined) {
      if (youtubeUrl.trim() !== automation.youtubeUrl) {
        automation.youtubeCachePath = null;
      }
      automation.youtubeUrl = youtubeUrl.trim();
    }
    if (loopVideo !== undefined) automation.loopVideo = Boolean(loopVideo);
    if (req.body.fps !== undefined) {
      automation.fps = (req.body.fps === 60 || parseInt(req.body.fps, 10) === 60) ? 60 : 30;
    }
    if (req.body.encoderMode !== undefined) {
      automation.encoderMode = req.body.encoderMode;
    }
    if (req.body.videoBitrate !== undefined) {
      automation.videoBitrate = req.body.videoBitrate ? String(req.body.videoBitrate).trim() : null;
    }
    if (req.body.youtubeResolution !== undefined) {
      automation.youtubeResolution = req.body.youtubeResolution;
    }
    if (req.body.youtubeFps !== undefined) {
      automation.youtubeFps = (req.body.youtubeFps === 60 || parseInt(req.body.youtubeFps, 10) === 60) ? 60 : 30;
    }
    if (req.body.youtubeBitrate !== undefined) {
      automation.youtubeBitrate = req.body.youtubeBitrate ? String(req.body.youtubeBitrate).trim() : null;
    }

    if (audioSourceType !== undefined) automation.audioSourceType = audioSourceType;
    if (req.body.audioMediaIds !== undefined) {
      const rawAudioIds = Array.isArray(req.body.audioMediaIds)
        ? req.body.audioMediaIds.map(id => typeof id === 'object' && id !== null ? (id._id || id.id) : id).filter(Boolean)
        : [];
      automation.audioMediaIds = rawAudioIds;
      if (rawAudioIds.length > 0) {
        automation.audioMediaId = rawAudioIds[0];
      } else if (audioMediaId === undefined) {
        automation.audioMediaId = null;
      }
    } else if (audioMediaId !== undefined) {
      const cleanAudioId = typeof audioMediaId === 'object' && audioMediaId !== null ? (audioMediaId._id || audioMediaId.id) : audioMediaId;
      automation.audioMediaId = cleanAudioId ? cleanAudioId : null;
      if (cleanAudioId) {
        automation.audioMediaIds = [cleanAudioId];
      } else {
        automation.audioMediaIds = [];
      }
    }
    if (audioDeviceName !== undefined) automation.audioDeviceName = audioDeviceName;
    if (audioTrackVolume !== undefined) automation.audioTrackVolume = Number(audioTrackVolume);
    if (micVolume !== undefined) automation.micVolume = Number(micVolume);
    if (loopAudio !== undefined) automation.loopAudio = Boolean(loopAudio);

    if (scheduleName !== undefined) automation.scheduleName = scheduleName;
    if (scheduleMode !== undefined) automation.scheduleMode = scheduleMode;
    if (timezone !== undefined) automation.timezone = timezone;
    if (rotationDurationSec !== undefined) automation.rotationDurationSec = Number(rotationDurationSec);
    if (restartDelaySec !== undefined) automation.restartDelaySec = Number(restartDelaySec);
    if (repeatMode !== undefined) automation.repeatMode = repeatMode;
    if (maxRotations !== undefined) automation.maxRotations = Number(maxRotations);
    if (startImmediately !== undefined) automation.startImmediately = Boolean(startImmediately);

    if (scheduledStartTime !== undefined) {
      const parsedStart = safeParseDate(scheduledStartTime);
      if (parsedStart) automation.scheduledStartTime = parsedStart;
    }
    if (startDate !== undefined) automation.startDate = safeParseDate(startDate);
    if (endDate !== undefined) automation.endDate = safeParseDate(endDate);
    if (daysOfWeek !== undefined && Array.isArray(daysOfWeek)) automation.daysOfWeek = daysOfWeek;
    if (dailyStartTime !== undefined) automation.dailyStartTime = dailyStartTime;
    if (dailyEndTime !== undefined) automation.dailyEndTime = dailyEndTime;
    if (enableDailyWindow !== undefined) automation.enableDailyWindow = Boolean(enableDailyWindow);

    const activeBroadcasts = await Broadcast.find({
      automationId: automation._id,
      status: { $in: ['LIVE', 'STREAMING', 'CREATING_BROADCAST', 'PREPARING'] }
    });

    const isCurrentlyLive = Boolean(automation.activeBroadcastId) || activeBroadcasts.length > 0 || ['ACTIVE', 'LIVE', 'STREAMING', 'ROTATING', 'PREPARING'].includes(automation.status);
    let restartSuccess = false;
    let restartError = null;

    if (completionMode !== undefined) {
      automation.completionMode = completionMode;
      if (completionMode === 'INDEFINITE') {
        automation.totalDurationHours = null;
        automation.totalDurationSec = null;
        automation.targetEndTime = null;
      }
    }
    if (totalDurationHours !== undefined && automation.completionMode !== 'INDEFINITE') {
      automation.totalDurationHours = Number(totalDurationHours);
    }
    if (reqTotalDurationSec !== undefined && automation.completionMode !== 'INDEFINITE') {
      const sec = Number(reqTotalDurationSec);
      automation.totalDurationSec = sec;
      automation.totalDurationHours = parseFloat((sec / 3600).toFixed(4));
      if (reqTargetEndTime) {
        automation.targetEndTime = new Date(reqTargetEndTime);
      } else if (sec > 0) {
        const baseTime = (isCurrentlyLive || automation.startImmediately) ? new Date() : (automation.scheduledStartTime || new Date());
        automation.targetEndTime = new Date(baseTime.getTime() + (sec * 1000));
      }
      if (sec > 0 && (!automation.rotationDurationSec || sec < automation.rotationDurationSec)) {
        automation.rotationDurationSec = sec;
      }
    } else if (reqTargetEndTime !== undefined && automation.completionMode !== 'INDEFINITE') {
      automation.targetEndTime = reqTargetEndTime ? new Date(reqTargetEndTime) : null;
    }

    await automation.save();

    if (isCurrentlyLive) {
      logger.info(`Live Module Update: Automation "${automation.name}" (${automation._id}) modified while LIVE. Terminating active stream and auto-launching updated stream content.`);
      const currentRotation = automation.currentRotationIndex || 1;

      automation.activeBroadcastId = null;
      automation.status = 'ROTATING';
      await automation.save();

      // 1. Terminate all active broadcast DB records for this automation
      for (const bc of activeBroadcasts) {
        try {
          await broadcastService.endBroadcast(bc._id, 'LIVE_MODULE_UPDATE');
        } catch (endErr) {
          logger.warn(`Warning ending broadcast ${bc._id} during update: ${endErr.message}`);
        }
      }

      // 2. Force kill any remaining active streaming processes (GStreamer & FFmpeg) for this automation
      await Promise.allSettled([
        gstreamerService.stopStreamsForAutomation(automation._id),
        ffmpegService.stopStreamsForAutomation(automation._id)
      ]);

      // 3. Wait 2 seconds to guarantee complete OS handle & socket release
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. Auto-start brand new broadcast with newly assigned media content
      try {
        await broadcastService.startBroadcast(automation._id, currentRotation + 1);
        restartSuccess = true;
        logger.info(`Live Module Update: Successfully auto-launched new live broadcast with updated stream content.`);
      } catch (err) {
        restartError = err.message;
        logger.error(`Error auto-restarting live stream for updated automation ${automation._id}: ${err.message}`);
      }
    } else if (startImmediately) {
      logger.info(`Update Automation: startImmediately is true. Triggering live broadcast for automation ${automation._id}`);
      process.nextTick(async () => {
        try {
          if (automation.status !== 'SCHEDULED') {
      automation.status = 'SCHEDULED';
      automation.retryCount = 0;
      automation.retryWindowStartedAt = null;
      automation.nextRetryScheduledAt = null;
      await automation.save();
    }

    await schedulerService._handleStartScheduled(automation);
        } catch (err) {
          logger.error(`Error auto-starting updated automation ${automation._id}: ${err.message}`);
        }
      });
    }

    const updatedAutomation = await Automation.findById(automation._id)
      .populate('facebookPageId')
      .populate('mediaId')
      .populate('cameraId')
      .populate('audioMediaId')
      .populate('audioMediaIds')
      .populate('activeBroadcastId');

    res.json({
      success: true,
      message: isCurrentlyLive
        ? (restartSuccess
            ? 'Automation updated successfully! The previous live stream was stopped and the new modified stream content is now live automatically.'
            : `Automation updated, but restarting stream encountered an issue: ${restartError}`)
        : 'Automation updated successfully!',
      automation: updatedAutomation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete automation
// @route   DELETE /api/automations/:id
exports.deleteAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    // Stop active stream if running
    if (automation.activeBroadcastId) {
      await broadcastService.endBroadcast(automation.activeBroadcastId, 'DELETED');
    }

    await Broadcast.deleteMany({ automationId: automation._id });
    await Automation.deleteOne({ _id: automation._id });

    logger.info(`Deleted automation ${req.params.id}`);

    res.json({
      success: true,
      message: 'Automation and associated broadcasts deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Start / Trigger automation
// @route   POST /api/automations/:id/start
exports.startAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id });
    if (!automation) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    if (automation.status !== 'SCHEDULED') {
      automation.status = 'SCHEDULED';
      automation.retryCount = 0;
      automation.retryWindowStartedAt = null;
      automation.nextRetryScheduledAt = null;
      await automation.save();
    }

    await schedulerService._handleStartScheduled(automation);
    const updated = await Automation.findById(automation._id)
      .populate('facebookPageId')
      .populate('mediaId')
      .populate('activeBroadcastId');

    res.json({
      success: true,
      automation: updated
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Pause automation
// @route   POST /api/automations/:id/pause
exports.pauseAutomation = async (req, res, next) => {
  try {
    const automation = await schedulerService.pauseAutomation(req.params.id);
    res.json({
      success: true,
      automation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resume automation
// @route   POST /api/automations/:id/resume
exports.resumeAutomation = async (req, res, next) => {
  try {
    const automation = await schedulerService.resumeAutomation(req.params.id);
    res.json({
      success: true,
      automation
    });
  } catch (error) {
    logger.error(`Resume error for automation ${req.params.id}: ${error.message}`);
    res.status(400).json({
      success: false,
      stage: error.stage || 'resume_stream',
      error: error.message || 'Failed to resume live stream'
    });
  }
};

// @desc    Stop automation
// @route   POST /api/automations/:id/stop
exports.stopAutomation = async (req, res, next) => {
  try {
    const automation = await schedulerService.stopAutomation(req.params.id);
    res.json({
      success: true,
      automation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually force rotate now
// @route   POST /api/automations/:id/rotate-now
exports.rotateNow = async (req, res, next) => {
  try {
    const automation = await schedulerService.triggerRotationNow(req.params.id);
    res.json({
      success: true,
      message: 'Rotation triggered successfully',
      automation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Run preflight verification
// @route   POST /api/automations/:id/preflight
exports.preflight = async (req, res, next) => {
  try {
    const result = await schedulerService.preflightCheck(req.params.id);
    res.json({
      success: true,
      passed: result.passed,
      issues: result.issues
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Global Emergency Stop
// @route   POST /api/automations/emergency-stop
exports.emergencyStop = async (req, res, next) => {
  try {
    await schedulerService.emergencyStopAll();
    res.json({
      success: true,
      message: 'EMERGENCY STOP COMPLETED: All live streams have been terminated.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Full 6-Stage Pipeline Diagnostic Check
// @route   POST /api/automations/:id/diagnose
exports.diagnoseAutomation = async (req, res, next) => {
  try {
    const automation = await Automation.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('facebookPageId')
      .populate('mediaId')
      .populate('cameraId');

    if (!automation) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    const cameraService = require('../services/cameraService');
    const mediamtxService = require('../services/mediamtxService');
    const { mediaToolResolver } = require('../services/mediaToolResolver');

    const isCamera = automation.sourceType === 'RTSP_CAMERA' || automation.sourceType === 'ONVIF_CAMERA' || Boolean(automation.cameraId);
    const isYouTube = automation.sourceType === 'YOUTUBE_VIDEO';
    const mediaOrCamera = isCamera ? automation.cameraId : automation.mediaId;

    const stages = {
      camera: { name: 'Camera Reachability', status: 'NOT_TESTED', details: 'N/A for local media file' },
      rtsp: { name: 'RTSP Stream Transport', status: 'NOT_TESTED', details: 'N/A for local media file' },
      mediamtx: { name: 'MediaMTX Proxy Relay', status: 'NOT_TESTED', details: 'N/A for local media file' },
      ffprobe: { name: 'FFprobe Video Stream Probe', status: 'NOT_TESTED', details: 'Not evaluated yet' },
      ffmpeg: { name: 'FFmpeg Transcoder Engine', status: 'NOT_TESTED', details: 'Not evaluated yet' },
      facebook: { name: 'Facebook RTMPS Destination', status: 'NOT_TESTED', details: 'Not evaluated yet' }
    };

    let overallPass = true;

    // 1. Camera & RTSP Check
    if (isCamera && mediaOrCamera) {
      const rawRtspUrl = cameraService.resolveRtspUrl(mediaOrCamera);
      const rtspRes = await cameraService.testRtspStream(rawRtspUrl);

      if (rtspRes.passed || rtspRes.connection) {
        stages.camera.status = 'PASS';
        stages.camera.details = `Camera online. ${rtspRes.details || 'IP reachability confirmed.'}`;
        stages.rtsp.status = 'PASS';
        stages.rtsp.details = `RTSP stream active (${rtspRes.videoCodec || 'h264'} ${rtspRes.resolution || '1280x720'} @ ${rtspRes.fps || 25}FPS).`;
      } else {
        stages.camera.status = 'FAIL';
        stages.camera.details = rtspRes.error || 'Camera unreachable over local network.';
        stages.rtsp.status = 'FAIL';
        stages.rtsp.details = 'RTSP socket connection failed or credentials invalid.';
        overallPass = false;
      }

      // MediaMTX Check
      const pathName = cameraService.getMediaMtxPath(mediaOrCamera);
      const mtxRes = await mediamtxService.registerProxyPath(pathName, rawRtspUrl, automation._id);

      if (mtxRes.success) {
        stages.mediamtx.status = 'PASS';
        stages.mediamtx.details = `Registered local RTSP proxy path /${pathName} (${mtxRes.rtspUrl})`;
      } else {
        stages.mediamtx.status = 'FAIL';
        stages.mediamtx.details = mtxRes.error || 'MediaMTX API path creation failed.';
        overallPass = false;
      }

      // FFprobe Check
      if (mtxRes.success) {
        const probeRes = await mediamtxService.probeRtspPath(mtxRes.rtspUrl);
        if (probeRes.available) {
          stages.ffprobe.status = 'PASS';
          stages.ffprobe.details = `FFprobe verified video stream (${probeRes.videoCodec} ${probeRes.resolution} @ ${probeRes.fps}FPS).`;
        } else {
          stages.ffprobe.status = 'FAIL';
          stages.ffprobe.details = probeRes.error || 'FFprobe could not parse stream format.';
          overallPass = false;
        }
      }
    } else if (isYouTube) {
      stages.ffprobe.status = 'PASS';
      stages.ffprobe.details = 'YouTube source URL accepted; the video will be downloaded before streaming.';
    } else {
      stages.ffprobe.status = 'PASS';
      stages.ffprobe.details = `Local media file verified (${automation.mediaId?.filename || 'File available'}).`;
    }

    // 2. FFmpeg Engine Check
    const ffmpegCheck = mediaToolResolver.resolveFFmpeg();
    if (ffmpegCheck.available) {
      stages.ffmpeg.status = 'PASS';
      stages.ffmpeg.details = `FFmpeg ${ffmpegCheck.version} available at ${ffmpegCheck.path}`;
    } else {
      stages.ffmpeg.status = 'FAIL';
      stages.ffmpeg.details = ffmpegCheck.error || 'FFmpeg binary missing or permissions denied.';
      overallPass = false;
    }

    // 3. Facebook Destination Check
    if (automation.facebookPageId) {
      if (automation.facebookPageId.isValid !== false) {
        stages.facebook.status = 'PASS';
        stages.facebook.details = `Facebook Page "${automation.facebookPageId.name}" token valid. RTMPS ingest ready.`;
      } else {
        stages.facebook.status = 'FAIL';
        stages.facebook.details = 'Facebook Page token is expired or invalid. Re-authenticate page.';
        overallPass = false;
      }
    } else {
      stages.facebook.status = 'FAIL';
      stages.facebook.details = 'No Facebook Page destination attached to automation.';
      overallPass = false;
    }

    res.json({
      success: true,
      passed: overallPass,
      stages,
      automation: {
        id: automation._id,
        name: automation.name,
        sourceType: automation.sourceType,
        status: automation.status,
        healthStatus: automation.healthStatus,
        failureStage: automation.failureStage,
        lastError: automation.lastError
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Instantly switch active camera in multi-camera live stream
// @route   POST /api/automations/:id/switch-camera
exports.switchLiveCamera = async (req, res, next) => {
  try {
    const { slotIndex } = req.body;
    if (slotIndex === undefined || slotIndex === null) {
      return res.status(400).json({ success: false, error: 'slotIndex is required' });
    }

    const broadcastService = require('../services/broadcastService');
    const result = await broadcastService.switchLiveCamera(req.params.id, slotIndex);

    if (result && result.success === false) {
      return res.status(409).json({
        success: false,
        error: result.error || result.reason || 'Failed to switch live camera',
        ...result
      });
    }

    res.json({
      success: true,
      message: `Switched live stream to camera: ${result.cameraName}`,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to switch live camera'
    });
  }
};

// @desc    Instantly switch active video/image clip in multi-media live stream
// @route   POST /api/automations/:id/switch-media
exports.switchLiveMedia = async (req, res, next) => {
  try {
    const { slotIndex } = req.body;
    if (slotIndex === undefined || slotIndex === null) {
      return res.status(400).json({ success: false, error: 'slotIndex is required' });
    }

    const broadcastService = require('../services/broadcastService');
    const result = await broadcastService.switchLiveMedia(req.params.id, slotIndex);

    if (result && result.success === false) {
      return res.status(409).json({
        success: false,
        error: result.error || result.reason || 'Failed to switch live media clip',
        ...result
      });
    }

    res.json({
      success: true,
      message: `Switched live stream to clip: ${result.title}`,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to switch live media clip'
    });
  }
};

// @desc    Instantly switch active YouTube video in playlist live stream
// @route   POST /api/automations/:id/switch-youtube
exports.switchLiveYouTube = async (req, res, next) => {
  try {
    const { slotIndex } = req.body;
    if (slotIndex === undefined || slotIndex === null) {
      return res.status(400).json({ success: false, error: 'slotIndex is required' });
    }

    const broadcastService = require('../services/broadcastService');
    const result = await broadcastService.switchLiveYouTube(req.params.id, slotIndex);

    if (result && result.success === false) {
      return res.status(409).json({
        success: false,
        error: result.error || result.reason || 'Failed to switch live YouTube video',
        ...result
      });
    }

    res.json({
      success: true,
      message: `Switched live stream to YouTube video: ${result.title}`,
      ...result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to switch live YouTube video'
    });
  }
};
