const Broadcast = require('../models/Broadcast');
const Automation = require('../models/Automation');
const FacebookPage = require('../models/FacebookPage');
const Media = require('../models/Media');
const facebookService = require('./facebook/facebookService');
const ffmpegService = require('./ffmpegService');
const { gstreamerService } = require('./gstreamerService');
const { gstreamerRuntimeDetector } = require('./gstreamerRuntimeDetector');
const { Logger } = require('../utils/logger');

const logger = new Logger('BroadcastService');

const cameraService = require('./cameraService');
const mediamtxService = require('./mediamtxService');
const { mediaToolResolver } = require('./mediaToolResolver');
const youtubeService = require('./youtubeService');
const fs = require('fs');
const trialService = require('./trialService');

class BroadcastService {
  constructor() {
    this.switchingLocks = new Set();
  }

  /**
   * Prepares and validates all scheduled camera sources (CCTV RTSP & Local Webcam)
   * registering MediaMTX proxy paths for seamless live switching
   */
  async prepareCameraSources(automation) {
    if (!Array.isArray(automation.cameraSchedules) || automation.cameraSchedules.length === 0) {
      return [];
    }
    const isTestMode = process.env.SCHEDULER_TEST_MODE === 'true';

    const promises = automation.cameraSchedules.map(async (sched) => {
      if (sched.cameraType === 'WEBCAM' || sched.deviceName) {
        const rawDev = sched.deviceName || automation.localCameraDevice || '';
        const devName = await mediaToolResolver.resolveVideoDeviceName(rawDev);
        return {
          type: 'WEBCAM',
          deviceName: devName || rawDev,
          name: sched.cameraName || devName || 'Webcam',
          durationSeconds: Math.max(1, sched.durationSeconds || 20),
          hasAudio: false,
          videoCodec: 'rawvideo'
        };
      } else if (sched.cameraId || automation.cameraId) {
        let cam = sched.cameraId;
        if (typeof cam === 'string' || (cam && !cam.ipAddress && !cam.getRtspUrl && (cam._id || cam.id))) {
          const targetId = typeof cam === 'string' ? cam : (cam._id || cam.id);
          try {
            const Camera = require('../models/Camera');
            cam = await Camera.findById(targetId);
          } catch (_) {}
        }
        if (!cam && automation.cameraId) {
          cam = automation.cameraId;
        }
        if (cam) {
          const rawUrl = cameraService.resolveRtspUrl(cam);
          const pathName = cameraService.getMediaMtxPath(cam);

          let probeInfo = {
            hasAudio: Boolean(cam.hasAudio),
            videoCodec: cam.videoCodec || 'h264',
            audioCodec: cam.audioCodec || null,
            resolution: '1080p',
            fps: 30
          };

          // 10-Step Preflight Validation for production environments
          if (!isTestMode && rawUrl && !rawUrl.includes('mock')) {
            const probeRes = await cameraService.testRtspStream(rawUrl);
            if (probeRes.passed) {
              probeInfo = {
                hasAudio: Boolean(probeRes.hasAudio),
                videoCodec: probeRes.videoCodec || 'h264',
                audioCodec: probeRes.audioCodec || null,
                resolution: probeRes.resolution || '1080p',
                fps: probeRes.fps || 30
              };
            } else {
              logger.warn(`Pre-flight probe warning for camera "${cam.name}": ${probeRes.error}`);
            }

            // Verify decodable video frames from raw RTSP URL
            await cameraService.verifyFrameDecode(rawUrl, 3000).catch(() => {});
          }

          const mtxResult = await mediamtxService.registerProxyPath(pathName, rawUrl, automation._id);
          const localUrl = mtxResult.success ? mtxResult.rtspUrl : mediamtxService.getRtspUrl(pathName);

          if (mtxResult.success) {
            await mediamtxService.waitForPathReady(pathName, 6000).catch(() => {});
          }

          // Verify MediaMTX is relaying frames from proxied URL
          if (!isTestMode && mtxResult.success && !rawUrl.includes('mock')) {
            await cameraService.verifyFrameDecode(localUrl, 3000).catch(() => {});
          }

          return {
            type: 'RTSP',
            camera: cam,
            name: sched.cameraName || cam.name || 'CCTV Camera',
            rawRtspUrl: rawUrl,
            targetInputUrl: localUrl,
            durationSeconds: Math.max(1, sched.durationSeconds || 20),
            mediaMtxPath: pathName,
            hasAudio: probeInfo.hasAudio,
            videoCodec: probeInfo.videoCodec,
            audioCodec: probeInfo.audioCodec,
            resolution: probeInfo.resolution,
            fps: probeInfo.fps
          };
        }
      }
      return null;
    });
    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  /**
   * Prepares and starts a new live broadcast session on Facebook with pre-flight pipeline validation
   */
  async startBroadcast(automationId, rotationIndex = 1) {
    if (trialService.isTrial() && trialService.isExpired()) {
      throw new Error('Trial period has expired. Live streaming is deactivated.');
    }

    // Ensure GPU Hardware Acceleration manager is initialized before stream construction
    const { hardwareEncoderService } = require('./hardwareEncoderService');
    await hardwareEncoderService.init().catch(err => {
      logger.warn(`Hardware encoder pre-stream probe note: ${err.message}`);
    });

    const automation = await Automation.findById(automationId)
      .populate('facebookPageId')
      .populate('targetPageIds')
      .populate('mediaId')
      .populate('mediaSchedules.mediaId')
      .populate('cameraId')
      .populate('cameraSchedules.cameraId')
      .populate('audioMediaId')
      .populate('audioMediaIds');

    if (!automation) {
      throw new Error(`Automation ${automationId} not found`);
    }

    // Terminate any stale / lingering GStreamer or FFmpeg processes for this automation before starting new broadcast
    try {
      await Promise.allSettled([
        gstreamerService.stopStreamsForAutomation(automation._id),
        ffmpegService.stopStreamsForAutomation(automation._id)
      ]);
    } catch (_) {}

    // Resolve target pages
    let targetPages = [];
    if (Array.isArray(automation.targetPageIds) && automation.targetPageIds.length > 0) {
      targetPages = automation.targetPageIds;
    } else if (automation.facebookPageId) {
      targetPages = [automation.facebookPageId];
    }

    const page = targetPages[0] || automation.facebookPageId;
    const isYouTubeTarget = automation.destinationPlatform === 'YOUTUBE' || (targetPages.length === 1 && targetPages[0]?.platform === 'YOUTUBE');
    const isLocalCamera = automation.sourceType === 'LOCAL_CAMERA';
    const isRtspCamera = automation.sourceType === 'RTSP_CAMERA' || automation.sourceType === 'ONVIF_CAMERA';
    const isCamera = isLocalCamera || isRtspCamera;
    const isYouTube = automation.sourceType === 'YOUTUBE_VIDEO';
    const firstSchedMedia = Array.isArray(automation.mediaSchedules) && automation.mediaSchedules.length > 0 ? automation.mediaSchedules[0]?.mediaId : null;
    let mediaOrCamera = isRtspCamera ? automation.cameraId : (isLocalCamera ? { device: automation.localCameraDevice, filename: 'Webcam' } : (isYouTube ? { filename: 'YouTube video' } : (automation.mediaId || firstSchedMedia)));

    if ((targetPages.length === 0 && !isYouTubeTarget) || (!mediaOrCamera && !isYouTube)) {
      throw new Error(`Invalid automation: missing ${targetPages.length === 0 ? 'streaming destination or ' : ''}${isCamera ? 'camera' : isYouTube ? 'YouTube' : 'media'} source`);
    }

    logger.info(`Starting Broadcast rotation #${rotationIndex} for Automation "${automation.name}" (${targetPages.length} Target Destinations Active)`);

    // Prevent duplicate broadcast creation if already active or creating
    if (automation.activeBroadcastId && automation.status === 'LIVE') {
      const activeBc = await Broadcast.findById(automation.activeBroadcastId);
      if (activeBc && (activeBc.status === 'LIVE' || activeBc.status === 'STREAMING')) {
        logger.warn(`Automation ${automation._id} already has an active live broadcast ${activeBc._id}. Reusing.`);
        return activeBc;
      }
    }

    // 1. STAGE: PREPARING
    automation.status = 'PREPARING';
    automation.healthStatus = 'HEALTHY';
    automation.failureStage = 'NONE';
    automation.failureCode = null;
    automation.lastError = null;
    await automation.save();

    let mediaMtxPathName = null;
    let targetInputRtspUrl = null;

    const hasMultiCamera = Array.isArray(automation.cameraSchedules) && automation.cameraSchedules.length > 1;

    // 2. PRE-FLIGHT STEP 1 & 2: CAMERA / RTSP & MEDIAMTX VALIDATION
    if (hasMultiCamera) {
      automation.cameraStatus = 'CONNECTING';
      automation.rtspStatus = 'TESTING';
      await automation.save();

      logger.info(`Pre-flight: Preparing Multi-Camera Cycling (${automation.cameraSchedules.length} cameras) for Automation ${automation._id}`);
      const preparedSources = await this.prepareCameraSources(automation);

      if (preparedSources.length === 0) {
        throw new Error('No valid cameras (CCTV or Webcam) available in multi-camera schedule');
      }

      const cleanAutoId = automation._id.toString().slice(-12);
      mediaMtxPathName = `live_${cleanAutoId}`;
      const firstRtsp = preparedSources.find(s => s.type === 'RTSP');
      targetInputRtspUrl = firstRtsp ? firstRtsp.targetInputUrl : null;
      automation.cameraStatus = 'ONLINE';
      automation.rtspStatus = 'CONNECTED';
      automation.mediamtxStatus = 'READY';
      automation.ffprobeStatus = 'READY';
      automation.mediaMtxPath = mediaMtxPathName;

      // Determine initial active slot according to lifecycle:
      // - Fresh start (rotationIndex === 1, or previous status was STOPPED, IDLE, or PREPARING): strictly Slot 1 (index 0).
      // - Resume or retry: preserve saved currentCameraSlotIndex if within valid bounds.
      const isFreshStart = rotationIndex === 1 || ['STOPPED', 'IDLE', 'PREPARING'].includes(automation.status);
      const startingSlotIdx = (!isFreshStart && typeof automation.currentCameraSlotIndex === 'number' && automation.currentCameraSlotIndex >= 0 && automation.currentCameraSlotIndex < preparedSources.length)
        ? automation.currentCameraSlotIndex
        : 0;
      automation.currentCameraSlotIndex = startingSlotIdx;
      automation.cameraStreamStartedAt = new Date();
      await automation.save();

      const activeSource = preparedSources[startingSlotIdx] || preparedSources[0];

      mediaOrCamera = {
        isMultiCamera: true,
        cameraSchedules: preparedSources,
        currentSlotIndex: startingSlotIdx,
        activeSource,
        ...activeSource,
        filename: `Multi-Camera (${preparedSources.length} cameras)`,
      };
    } else if (isRtspCamera) {
      automation.cameraStatus = 'CONNECTING';
      automation.rtspStatus = 'TESTING';
      automation.mediamtxStatus = 'STARTING';
      await automation.save();
      const rawRtspUrl = cameraService.resolveRtspUrl(mediaOrCamera);
      logger.info(`Pre-flight: Fast testing RTSP camera and registering MediaMTX for Automation ${automation._id}`);

      mediaMtxPathName = cameraService.getMediaMtxPath(mediaOrCamera);

      // Concurrently test RTSP reachability and register MediaMTX proxy path
      const [rtspTest, mtxResult] = await Promise.all([
        cameraService.testRtspStream(rawRtspUrl),
        mediamtxService.registerProxyPath(mediaMtxPathName, rawRtspUrl, automation._id)
      ]);

      if (!rtspTest.passed && !rtspTest.connection) {
        logger.error(`Pre-flight failed: Camera RTSP stream unreachable: ${rtspTest.error}`);
        automation.status = 'FAILED';
        automation.cameraStatus = 'OFFLINE';
        automation.rtspStatus = 'DISCONNECTED';
        automation.failureStage = 'RTSP';
        automation.failureCode = 'RTSP_UNREACHABLE';
        automation.healthStatus = 'ERROR';
        automation.lastError = rtspTest.error || 'Camera RTSP connection unreachable';
        await automation.save();
        throw new Error(automation.lastError);
      }

      automation.cameraStatus = 'ONLINE';
      automation.rtspStatus = 'CONNECTED';

      if (!mtxResult.success) {
        logger.error(`Pre-flight failed: MediaMTX path registration error: ${mtxResult.error}`);
        automation.status = 'FAILED';
        automation.mediamtxStatus = 'FAILED';
        automation.failureStage = 'MEDIAMTX';
        automation.failureCode = mtxResult.errorCode || 'MEDIAMTX_REGISTRATION_FAILED';
        automation.healthStatus = 'ERROR';
        automation.lastError = mtxResult.error || 'Failed to register MediaMTX camera path';
        await automation.save();
        throw new Error(automation.lastError);
      }

      // Wait for MediaMTX to establish RTSP connection and have frames ready
      await mediamtxService.waitForPathReady(mediaMtxPathName, 6000).catch(() => {});

      mediaOrCamera.hasAudio = rtspTest.hasAudio ?? Boolean(mediaOrCamera.hasAudio);
      mediaOrCamera.videoCodec = rtspTest.videoCodec || mediaOrCamera.videoCodec || 'h264';
      mediaOrCamera.audioCodec = rtspTest.audioCodec || mediaOrCamera.audioCodec || null;
      mediaOrCamera.sourceFps = rtspTest.fps || mediaOrCamera.fps || 25;

      // Verify decodable video frames from proxied MediaMTX path before launching FFmpeg
      if (process.env.SCHEDULER_TEST_MODE !== 'true' && !rawRtspUrl.includes('mock')) {
        await cameraService.verifyFrameDecode(mtxResult.rtspUrl, 3000).catch(() => {});
      }

      automation.mediamtxStatus = 'READY';
      automation.mediaMtxPath = mediaMtxPathName;
      targetInputRtspUrl = mtxResult.rtspUrl;
      automation.ffprobeStatus = 'READY';
      await automation.save();
    } else {
      if (isLocalCamera) {
        mediaMtxPathName = `webcam_${automation._id.toString().slice(-12)}`;
        automation.mediaMtxPath = mediaMtxPathName;
        automation.cameraStatus = 'ONLINE';
        automation.rtspStatus = 'NOT_TESTED';
        automation.mediamtxStatus = 'READY';
        automation.ffprobeStatus = 'READY';
        await automation.save();
      } else {
        automation.cameraStatus = 'NOT_TESTED';
        automation.rtspStatus = 'NOT_TESTED';
        automation.mediamtxStatus = 'NOT_REQUIRED';
        automation.ffprobeStatus = 'READY';
        await automation.save();
      }
    }

    // Download once and stream a cached MP4 (or scheduled active slot) for YouTube sources.
    if (isYouTube) {
      const hasSchedules = Array.isArray(automation.youtubeSchedules) && automation.youtubeSchedules.length > 0;

      if (hasSchedules && automation.youtubeSchedules.length > 1) {
        logger.info(`Preparing Multi-YouTube playlist (${automation.youtubeSchedules.length} items) for automation ${automation._id}`);
        const startingSlotIdx = (typeof automation.currentYoutubeSlotIndex === 'number' && automation.currentYoutubeSlotIndex >= 0 && automation.currentYoutubeSlotIndex < automation.youtubeSchedules.length)
          ? automation.currentYoutubeSlotIndex
          : 0;
        const targetSlot = automation.youtubeSchedules[startingSlotIdx] || automation.youtubeSchedules[0];
        let filePath = await youtubeService.downloadVideo(targetSlot.youtubeUrl.trim(), automation._id);
        automation.youtubeCachePath = filePath;
        automation.currentYoutubeSlotIndex = startingSlotIdx;
        automation.youtubeStreamStartedAt = new Date();
        await automation.save();
        mediaOrCamera = { filePath, mediaType: 'VIDEO', hasAudio: true, filename: targetSlot.title || 'YouTube video' };

        // Pre-cache other youtube videos asynchronously in background so switching is instant
        (async () => {
          for (const s of automation.youtubeSchedules) {
            try {
              await youtubeService.downloadVideo(s.youtubeUrl.trim(), automation._id);
            } catch (_) {}
          }
        })().catch(() => {});
      } else {
        const targetUrl = (hasSchedules ? automation.youtubeSchedules[0]?.youtubeUrl : automation.youtubeUrl) || automation.youtubeUrl;
        let filePath = automation.youtubeCachePath;
        if (!filePath || !fs.existsSync(filePath)) {
          filePath = await youtubeService.downloadVideo(targetUrl, automation._id);
          automation.youtubeCachePath = filePath;
          await automation.save();
        }
        mediaOrCamera = { filePath, mediaType: 'VIDEO', hasAudio: true, filename: 'YouTube video' };
      }
    }

    // Multi-Media (Video / Image) Playlist Handling
    const isLocalMedia = (automation.sourceType === 'VIDEO_FILE' || automation.sourceType === 'IMAGE');
    const hasMediaSchedules = Array.isArray(automation.mediaSchedules) && automation.mediaSchedules.length > 1;

    if (isLocalMedia && hasMediaSchedules) {
      logger.info(`Preparing Multi-Media playlist (${automation.mediaSchedules.length} items) for automation ${automation._id}`);
      const validMediaItems = [];
      for (let i = 0; i < automation.mediaSchedules.length; i++) {
        const s = automation.mediaSchedules[i];
        let m = s.mediaId;
        if (typeof m === 'string' || (m && !m.filePath && (m._id || m.id))) {
          const targetId = typeof m === 'string' ? m : (m._id || m.id);
          try {
            m = await Media.findById(targetId);
          } catch (_) {}
        }
        const fPath = m ? (m.filePath || m.path) : null;
        if (fPath && fs.existsSync(fPath)) {
          validMediaItems.push({
            slotIndex: i,
            filePath: fPath,
            title: s.title || (m ? (m.originalName || m.filename) : '') || `Clip #${i + 1}`,
            durationSeconds: Math.max(1, s.durationSeconds || (m && m.durationSec ? Math.round(m.durationSec) : 30)),
            hasAudio: m ? m.hasAudio : true,
            mediaType: m ? m.mediaType : 'VIDEO'
          });
        }
      }

      if (validMediaItems.length > 0) {
        if (validMediaItems.length > 1) {
          logger.info(`Stitching continuous Multi-Video playlist (${validMediaItems.length} clips) for Automation "${automation.name}"`);
          const stitchedFilePath = await ffmpegService.stitchVideoPlaylist(validMediaItems, automation._id);
          automation.currentMediaSlotIndex = 0;
          automation.mediaStreamStartedAt = new Date();
          await automation.save();
          mediaOrCamera = {
            filePath: stitchedFilePath,
            mediaType: 'VIDEO',
            hasAudio: true,
            filename: `Playlist (${validMediaItems.length} clips)`
          };
        } else {
          const startingSlotIdx = (typeof automation.currentMediaSlotIndex === 'number' && automation.currentMediaSlotIndex >= 0 && automation.currentMediaSlotIndex < validMediaItems.length)
            ? automation.currentMediaSlotIndex
            : 0;
          const currentItem = validMediaItems[startingSlotIdx] || validMediaItems[0];
          automation.currentMediaSlotIndex = startingSlotIdx;
          automation.mediaStreamStartedAt = new Date();
          await automation.save();
          mediaOrCamera = {
            filePath: currentItem.filePath,
            mediaType: currentItem.mediaType,
            hasAudio: currentItem.hasAudio,
            filename: currentItem.title
          };
        }
      } else {
        logger.warn(`None of the scheduled media files exist on disk, using primary mediaId.`);
      }
    }

    // 3. PRE-FLIGHT STEP 4: MEDIA ENGINE VALIDATION
    const isCameraStreaming = Boolean(
      isRtspCamera ||
      isLocalCamera ||
      (automation.cameraSchedules && automation.cameraSchedules.length > 0) ||
      (mediaOrCamera && (mediaOrCamera.isMultiCamera || mediaOrCamera.type === 'RTSP' || mediaOrCamera.type === 'WEBCAM'))
    );
    const gstCheck = gstreamerRuntimeDetector.detectRuntime();

    if (isCameraStreaming) {
      if (!gstCheck.available) {
        const gstErr = `Live camera broadcasting requires GStreamer MSVC 64-bit runtime: ${gstCheck.error || 'GStreamer not found'}. Please install GStreamer 1.20+ MSVC binaries.`;
        logger.error(`Pre-flight failed: ${gstErr}`);
        automation.status = 'FAILED';
        automation.gstreamerStatus = 'FAILED';
        automation.mediaEngineStatus = 'FAILED';
        automation.failureStage = 'GSTREAMER';
        automation.failureCode = 'GSTREAMER_NOT_INSTALLED';
        automation.healthStatus = 'ERROR';
        automation.lastError = gstErr;
        await automation.save();
        throw new Error(gstErr);
      }
      automation.mediaEngine = 'GSTREAMER';
      automation.gstreamerStatus = 'STARTING';
      automation.mediaEngineStatus = 'STARTING';
      automation.ffmpegStatus = 'RUNNING'; // backwards compatibility for status badges
      await automation.save();
      logger.info(`[BroadcastService] Pre-flight: GStreamer media engine validated for live camera streaming.`);
    } else {
      automation.mediaEngine = 'FFMPEG';
      automation.ffmpegStatus = 'STARTING';
      automation.mediaEngineStatus = 'STARTING';
      await automation.save();

      const ffmpegCheck = mediaToolResolver.resolveFFmpeg();
      if (!ffmpegCheck.available) {
        logger.error(`Pre-flight failed: Media engine binary missing or unusable: ${ffmpegCheck.error}`);
        automation.status = 'FAILED';
        automation.ffmpegStatus = 'FAILED';
        automation.failureStage = 'FFMPEG';
        automation.failureCode = 'MEDIA_ENGINE_MISSING';
        automation.healthStatus = 'ERROR';
        automation.lastError = ffmpegCheck.error || 'Media engine executable unavailable';
        await automation.save();
        throw new Error(automation.lastError);
      }
    }

    // 4. PRE-FLIGHT STEP 5: DESTINATION VALIDATION & BROADCAST CREATION
    automation.facebookStatus = 'CREATING';
    automation.status = 'CREATING_BROADCAST';
    await automation.save();

    const ingestUrls = [];
    let primaryFbBroadcast = null;

    if (targetPages.length > 0) {
      for (const targetPage of targetPages) {
        const isYT = targetPage.platform === 'YOUTUBE' || targetPage.category?.includes('YouTube') || targetPage.name?.toLowerCase().includes('youtube');
        let fbBroadcast;

        if (isYT) {
          let streamKey = null;
          if (typeof targetPage.getPageAccessToken === 'function') {
            try { streamKey = targetPage.getPageAccessToken(); } catch (_) {}
          }
          if (!streamKey && targetPage.encryptedPageAccessToken) {
            try {
              const { decrypt } = require('../utils/encryption');
              streamKey = decrypt(targetPage.encryptedPageAccessToken);
            } catch (_) {}
          }
          if (!streamKey) {
            streamKey = automation.youtubeStreamKey;
          }
          const baseUrl = (targetPage.serverUrl || automation.youtubeServerUrl || 'rtmp://a.rtmp.youtube.com/live2/').replace(/\/?$/, '/');
          const fullRtmpUrl = `${baseUrl}${streamKey?.trim()}`;
          fbBroadcast = {
            id: `yt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            streamUrl: fullRtmpUrl,
            secureStreamUrl: fullRtmpUrl,
            ingestUrl: fullRtmpUrl,
            status: 'LIVE_NOW'
          };
          logger.info(`Using direct YouTube Live RTMP Ingest URL for target "${targetPage.name}"`);
        } else {
          const pageAccessToken = targetPage.getPageAccessToken();
          const isMock = targetPage.isMock || facebookService.isMockMode;
          const isStreamKeyMode = targetPage.streamType === 'STREAM_KEY' || automation.facebookMode === 'EXTERNAL_STREAM_KEY';

          if (isStreamKeyMode) {
            const serverUrl = (targetPage.serverUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/').replace(/\/?$/, '/');
            const fullRtmpUrl = `${serverUrl}${pageAccessToken}`;
            fbBroadcast = {
              id: `rtmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              streamUrl: fullRtmpUrl,
              secureStreamUrl: fullRtmpUrl,
              ingestUrl: fullRtmpUrl,
              status: 'LIVE_NOW'
            };
            logger.info(`Using direct Facebook Live RTMPS Stream Key for Target "${targetPage.name}"`);
          } else {
            try {
              fbBroadcast = await facebookService.createLiveBroadcast(
                pageAccessToken,
                targetPage.pageId,
                {
                  title: `${automation.title}${rotationIndex > 1 ? ` (Part ${rotationIndex})` : ''}`,
                  description: automation.description,
                  status: 'LIVE_NOW'
                },
                isMock
              );
            } catch (fbErr) {
              logger.warn(`Meta Facebook broadcast creation warning for ${targetPage.name}: ${fbErr.message}. Falling back to direct stream key.`);
              const serverUrl = (targetPage.serverUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/').replace(/\/?$/, '/');
              const fullRtmpUrl = `${serverUrl}${pageAccessToken}`;
              fbBroadcast = {
                id: `rtmp_fallback_${Date.now()}`,
                streamUrl: fullRtmpUrl,
                secureStreamUrl: fullRtmpUrl,
                ingestUrl: fullRtmpUrl,
                status: 'LIVE_NOW'
              };
            }
          }
        }

        const url = fbBroadcast.ingestUrl || fbBroadcast.secureStreamUrl || fbBroadcast.streamUrl;
        if (url) {
          ingestUrls.push(url);
          const isRealUrl = !url.includes('mock-live-api-s.facebook.com') && !url.startsWith('mock://');
          if (!primaryFbBroadcast || (isRealUrl && primaryFbBroadcast.streamUrl?.includes('mock-live-api-s.facebook.com'))) {
            primaryFbBroadcast = fbBroadcast;
          }
        }
      }
    } else if (isYouTubeTarget && automation.youtubeStreamKey) {
      const baseUrl = (automation.youtubeServerUrl || 'rtmp://a.rtmp.youtube.com/live2/').replace(/\/?$/, '/');
      const fullRtmpUrl = `${baseUrl}${automation.youtubeStreamKey.trim()}`;
      primaryFbBroadcast = {
        id: `yt_${Date.now()}`,
        streamUrl: fullRtmpUrl,
        secureStreamUrl: fullRtmpUrl,
        ingestUrl: fullRtmpUrl,
        status: 'LIVE_NOW'
      };
      ingestUrls.push(fullRtmpUrl);
    }

    if ((automation.destinationPlatform === 'MULTI_DESTINATION' || Boolean(automation.youtubeStreamKey)) && automation.youtubeStreamKey) {
      const baseUrl = (automation.youtubeServerUrl || 'rtmp://a.rtmp.youtube.com/live2/').replace(/\/?$/, '/');
      const fullRtmpUrl = `${baseUrl}${automation.youtubeStreamKey.trim()}`;
      if (!ingestUrls.includes(fullRtmpUrl)) {
        ingestUrls.push(fullRtmpUrl);
        logger.info(`Added multi-destination YouTube Live RTMP target: ${baseUrl}****`);
      }
    }

    if (ingestUrls.length === 0) {
      const errStr = 'DESTINATION_INGEST_URL_MISSING: Ingest URL could not be obtained for stream broadcast.';
      logger.error(errStr);
      automation.status = 'FAILED';
      automation.facebookStatus = 'FAILED';
      automation.failureStage = 'FACEBOOK';
      automation.failureCode = 'DESTINATION_INGEST_URL_MISSING';
      automation.healthStatus = 'ERROR';
      automation.lastError = errStr;
      await automation.save();
      throw new Error(errStr);
    }

    // Filter real ingest URLs (non-mock) if any exist
    const realIngestUrls = ingestUrls.filter(u => 
      typeof u === 'string' && 
      !u.includes('mock-live-api-s.facebook.com') && 
      !u.startsWith('mock://')
    );
    const activeIngestUrls = realIngestUrls.length > 0 ? realIngestUrls : ingestUrls;
    // Deduplicate identical destination URLs to prevent parallel connection collision on same stream key
    const uniqueIngestUrls = [...new Set(activeIngestUrls.map(u => typeof u === 'string' ? u.trim() : u))].filter(Boolean);
    const finalStreamTarget = uniqueIngestUrls.length === 1 ? uniqueIngestUrls[0] : uniqueIngestUrls;
    const fbBroadcast = primaryFbBroadcast || { id: `bc_${Date.now()}`, ingestUrl: uniqueIngestUrls[0] };

    // Resolve destination resolution and frame rate
    const isMultiDest = uniqueIngestUrls.length > 1 || automation.destinationPlatform === 'MULTI_DESTINATION';
    let resolvedResolution = '1080p';
    let resolvedFps = automation.fps === 60 ? 60 : 30;

    const ytPage = targetPages.find(p => p.platform === 'YOUTUBE' || p.category?.includes('YouTube') || p.name?.toLowerCase().includes('youtube'));
    const fbPage = targetPages.find(p => p.platform === 'FACEBOOK' || (!p.platform && !p.category?.includes('YouTube') && !p.name?.toLowerCase().includes('youtube')));
    const hasYouTubeTarget = isYouTubeTarget || isMultiDest || Boolean(ytPage) || Boolean(automation.youtubeStreamKey);

    let ytResolution = automation.youtubeResolution || ytPage?.resolution || '1080p';
    if (ytPage?.resolution && ytPage.resolution !== '1080p' && (!automation.youtubeResolution || automation.youtubeResolution === '1080p')) {
      ytResolution = ytPage.resolution;
    }
    let fbResolution = fbPage?.resolution || '1080p';
    if (fbResolution === '1440p' || fbResolution === '2160p' || fbResolution === '4k') {
      fbResolution = '1080p'; // Facebook Live RTMP standard ingestion ceiling
    }

    if (hasYouTubeTarget) {
      resolvedResolution = ytResolution;
      resolvedFps = (automation.youtubeFps === 60 || (!automation.youtubeFps && automation.fps === 60) || ytPage?.fps === 60) ? 60 : 30;
    } else {
      // Direct Facebook Live stream: honor user-chosen resolution (defaulting to 1080p)
      resolvedResolution = fbResolution;
      resolvedFps = automation.fps === 60 ? 60 : 30;
    }

    if (mediaOrCamera && mediaOrCamera.sourceFps) {
      if (resolvedFps === 60 && mediaOrCamera.sourceFps <= 30) {
        logger.info(`[BroadcastService] Camera source FPS is ${mediaOrCamera.sourceFps} while broadcast output requested at 60 FPS. Pacing stream to 60 CFR.`);
        automation.isFpsInterpolated = true;
      } else {
        automation.isFpsInterpolated = false;
      }
    }

    const { resolveResolutionProfile } = require('./ffmpegService');
    const resProfile = resolveResolutionProfile(resolvedResolution, resolvedFps);

    automation.facebookStatus = 'CREATED';
    await automation.save();

    // 5. CREATE BROADCAST RECORD IN DB
    const activeTargetPage = targetPages.find(p => !p.isMock) || targetPages[0] || page;
    const broadcast = await Broadcast.create({
      automationId: automation._id,
      facebookPageId: activeTargetPage ? activeTargetPage._id : undefined,
      destinationPlatform: isYouTubeTarget ? 'YOUTUBE' : (uniqueIngestUrls.length > 1 ? 'MULTI_DESTINATION' : 'FACEBOOK'),
      fbLiveVideoId: fbBroadcast.id,
      streamUrl: fbBroadcast.streamUrl || uniqueIngestUrls[0],
      secureStreamUrl: fbBroadcast.secureStreamUrl || uniqueIngestUrls[0],
      mediaMtxPath: mediaMtxPathName,
      rotationIndex,
      targetFps: resolvedFps,
      targetResolution: resProfile.key,
      targetWidth: resProfile.width,
      targetHeight: resProfile.height,
      status: 'CREATING_BROADCAST',
      scheduledStartTime: new Date(),
    });

    automation.activeBroadcastId = broadcast._id;
    automation.currentRotationIndex = rotationIndex;
    await automation.save();

    // 6. SPAWN LIVE STREAM (GStreamer for Live Cameras, FFmpeg for Legacy/Media items)
    try {
      broadcast.status = 'STREAMING';
      await broadcast.save();

      automation.status = 'STREAMING';
      automation.facebookStatus = 'CONNECTING';
      await automation.save();

      const isCameraStream = Boolean(
        isRtspCamera ||
        isLocalCamera ||
        (automation.cameraSchedules && automation.cameraSchedules.length > 0) ||
        (mediaOrCamera && (mediaOrCamera.isMultiCamera || mediaOrCamera.type === 'RTSP' || mediaOrCamera.type === 'WEBCAM'))
      );

      if (isCameraStream) {
        if (!gstreamerService.isAvailable()) {
          const gstErr = 'Live camera broadcasting requires GStreamer MSVC 64-bit runtime. Please install GStreamer 1.20+ MSVC binaries.';
          throw new Error(gstErr);
        }
        logger.info(`[BroadcastService] Spawning live camera stream via GStreamer engine for Broadcast ${broadcast._id}`);
        await gstreamerService.startCameraStream(broadcast, automation, mediaOrCamera, finalStreamTarget, {
          youtubeResolution: ytResolution,
          facebookResolution: fbResolution
        });
        automation.mediaEngine = 'GSTREAMER';
        automation.gstreamerStatus = 'RUNNING';
        automation.mediaEngineStatus = 'RUNNING';
        automation.ffmpegStatus = 'RUNNING';
      } else {
        logger.info(`[BroadcastService] Spawning static media stream via FFmpeg for Broadcast ${broadcast._id}`);
        await ffmpegService.startStream(broadcast, automation, mediaOrCamera, finalStreamTarget, {
          youtubeResolution: ytResolution,
          facebookResolution: fbResolution
        });
        automation.mediaEngine = 'FFMPEG';
        automation.mediaEngineStatus = 'RUNNING';
      }

      // 7. MARK BROADCAST & AUTOMATION AS LIVE
      broadcast.status = 'LIVE';
      broadcast.actualStartTime = new Date();
      await broadcast.save();

      automation.status = 'LIVE';
      automation.facebookStatus = 'LIVE';
      automation.ffmpegStatus = 'RUNNING';
      automation.healthStatus = 'HEALTHY';
      automation.lastError = null;
      automation.retryCount = 0; // Reset retry counter on successful live stream
      automation.retryWindowStartedAt = null;
      automation.nextRetryScheduledAt = null;

      // Calculate next rotation schedule time
      let nextRotation = new Date(Date.now() + (automation.rotationDurationSec * 1000));
      if (automation.targetEndTime && automation.targetEndTime < nextRotation) {
        nextRotation = automation.targetEndTime;
      }
      automation.nextRotationScheduledAt = nextRotation;
      await automation.save();

      logger.info(`Broadcast #${rotationIndex} is now LIVE (ID: ${broadcast._id}, FB Video ID: ${fbBroadcast.id}, Path: /${mediaMtxPathName || 'N/A'})`);

      try {
        const socketService = require('./socketService');
        socketService.emitGlobal('broadcast:started', {
          automationId: automation._id.toString(),
          broadcastId: broadcast._id.toString(),
          mediaMtxPath: mediaMtxPathName,
          rotationIndex
        });
        socketService.emitGlobal('automation:updated', {
          automationId: automation._id.toString(),
          status: 'LIVE'
        });
      } catch (_) {}

      return broadcast;
    } catch (streamError) {
      const failureStage = streamError.stage || 'FFMPEG';
      logger.error(`Failed to launch stream for Broadcast ${broadcast._id} (Stage: ${failureStage}): ${streamError.message}`);
      broadcast.status = 'FAILED';
      broadcast.failureStage = failureStage;
      broadcast.errorMessage = streamError.message;
      await broadcast.save();

      automation.status = 'FAILED';
      automation.ffmpegStatus = 'FAILED';
      automation.failureStage = failureStage;
      automation.healthStatus = 'ERROR';
      automation.lastError = streamError.message;
      await automation.save();

      if (
        page && 
        page.streamType !== 'STREAM_KEY' && 
        typeof page.getPageAccessToken === 'function' && 
        fbBroadcast?.id && 
        !String(fbBroadcast.id).startsWith('rtmp_') && 
        !String(fbBroadcast.id).startsWith('yt_')
      ) {
        try {
          const token = page.getPageAccessToken();
          await facebookService.endBroadcast(token, fbBroadcast.id, Boolean(page.isMock));
        } catch (_) {}
      }
      throw streamError;
    }
  }

  /**
   * Ends an active live broadcast cleanly: terminates FFmpeg stream, releases MediaMTX path, ends broadcast on Facebook.
   */
  async endBroadcast(broadcastId, reason = 'ROTATION') {
    const broadcast = await Broadcast.findById(broadcastId).populate('facebookPageId');
    if (!broadcast) {
      logger.warn(`Cannot end broadcast ${broadcastId}: Not found`);
      return null;
    }

    if (broadcast.status === 'ENDED' || broadcast.status === 'FAILED') {
      logger.info(`Broadcast ${broadcastId} is already finished (${broadcast.status})`);
      return broadcast;
    }

    logger.info(`Ending Broadcast ${broadcastId} (FB Video ID: ${broadcast.fbLiveVideoId}, Reason: ${reason})`);

    // 1. Stop active streaming processes (GStreamer & FFmpeg)
    await Promise.allSettled([
      gstreamerService.stopStream(broadcast._id),
      ffmpegService.stopStream(broadcast._id)
    ]);

    // 2. Release MediaMTX proxy paths if active (only when stopping/completing, not during rotation or live module update)
    const isContinuing = reason === 'ROTATION' || reason === 'LIVE_MODULE_UPDATE';
    if (!isContinuing) {
      if (broadcast.mediaMtxPath) {
        await mediamtxService.removeProxyPath(broadcast.mediaMtxPath, broadcast.automationId).catch(() => {});
      }
      const autoDoc = await Automation.findById(broadcast.automationId).populate('cameraSchedules.cameraId').catch(() => null);
      if (autoDoc && Array.isArray(autoDoc.cameraSchedules)) {
        for (const sched of autoDoc.cameraSchedules) {
          if (sched.cameraId) {
            const camPath = cameraService.getMediaMtxPath(sched.cameraId);
            await mediamtxService.removeProxyPath(camPath, broadcast.automationId).catch(() => {});
          }
        }
      }
    }

    // 3. Terminate live broadcast on Meta (if using Graph API)
    const isMetaLive = broadcast.facebookPageId && 
      broadcast.facebookPageId.streamType !== 'STREAM_KEY' && 
      broadcast.destinationPlatform !== 'YOUTUBE' &&
      !String(broadcast.fbLiveVideoId).startsWith('yt_') &&
      !String(broadcast.fbLiveVideoId).startsWith('rtmp_');

    if (isMetaLive) {
      try {
        const pageAccessToken = broadcast.facebookPageId.getPageAccessToken();
        const isMock = broadcast.facebookPageId.isMock || facebookService.isMockMode;
        await facebookService.endBroadcast(pageAccessToken, broadcast.fbLiveVideoId, isMock);
      } catch (fbErr) {
        logger.warn(`Could not terminate FB broadcast ${broadcast.fbLiveVideoId}: ${fbErr.message}`);
      }
    }

    // 4. Update Automation sub-component statuses
    await Automation.updateOne(
      { _id: broadcast.automationId },
      {
        $set: {
          ffmpegStatus: 'STOPPED',
          facebookStatus: 'ENDED',
          mediamtxStatus: 'STOPPED'
        }
      }
    ).catch(() => {});

    // 5. Finalize broadcast record
    const now = new Date();
    const startTime = broadcast.actualStartTime || broadcast.scheduledStartTime;
    const durationSec = Math.max(0, Math.round((now.getTime() - startTime.getTime()) / 1000));

    broadcast.status = 'ENDED';
    broadcast.actualEndTime = now;
    broadcast.durationSec = durationSec;
    await broadcast.save();

    logger.info(`Broadcast ${broadcastId} ended cleanly. Total duration: ${durationSec}s`);

    try {
      const socketService = require('./socketService');
      socketService.emitGlobal('broadcast:ended', {
        automationId: broadcast.automationId?.toString(),
        broadcastId: broadcast._id.toString(),
        reason
      });
      socketService.emitGlobal('automation:updated', {
        automationId: broadcast.automationId?.toString(),
        status: 'ENDED'
      });
    } catch (_) {}

    return broadcast;
  }

  /**
   * Instantly switches the active streaming camera in a live multi-camera schedule.
   * Hot-restarts the FFmpeg encoder with the selected camera slot at index 0 for its scheduled duration,
   * keeping the exact same Facebook Live broadcast and stream key active without dropping viewers.
   */
  async switchLiveCamera(automationId, slotIndex, options = { isManual: true }) {
    const lockKey = String(automationId);
    if (this.switchingLocks.has(lockKey)) {
      logger.warn(`[BroadcastService] Camera switch already in progress for Automation ${lockKey}. Ignoring concurrent request.`);
      return { success: false, reason: 'SWITCH_IN_PROGRESS' };
    }
    this.switchingLocks.add(lockKey);

    try {
      const automation = await Automation.findById(automationId).populate('cameraSchedules.cameraId');
      if (!automation) {
        throw new Error('Automation not found');
      }
      if (!Array.isArray(automation.cameraSchedules) || automation.cameraSchedules.length === 0) {
        throw new Error('Automation does not have scheduled cameras configured.');
      }

      const idx = parseInt(slotIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= automation.cameraSchedules.length) {
        throw new Error(`Invalid camera slot index: ${slotIndex}. Total slots: ${automation.cameraSchedules.length}`);
      }

      const selectedSched = automation.cameraSchedules[idx];
      const selectedCameraName = selectedSched?.cameraName || selectedSched?.deviceName || (selectedSched?.cameraId?.name) || `Camera Slot #${idx + 1}`;
      const targetDuration = Math.max(1, selectedSched?.durationSeconds || 20);

      const isLive = ['LIVE', 'STREAMING'].includes(automation.status) || automation.ffmpegStatus === 'RUNNING';
      const broadcast = automation.activeBroadcastId ? await Broadcast.findById(automation.activeBroadcastId) : null;

      if (!isLive || !broadcast) {
        // Stream is not currently live on broadcast server; update selected slot index and notify clients
        automation.currentCameraSlotIndex = idx;
        automation.cameraStreamStartedAt = new Date();
        await automation.save();

        try {
          const socketService = require('./socketService');
          const switchPayload = {
            automationId: automation._id.toString(),
            activeSlotIndex: idx,
            slotIndex: idx,
            cameraName: selectedCameraName,
            durationSeconds: targetDuration,
            streamStartedAt: new Date().toISOString(),
            cameraStreamStartedAt: new Date().toISOString(),
            isLiveSwitch: false
          };
          socketService.emitToAutomation(automation._id.toString(), 'camera:active_switched', switchPayload);
          socketService.emitGlobal('camera:active_switched', switchPayload);
        } catch (sockErr) {
          logger.error(`[BroadcastService] Failed to emit camera:active_switched socket event: ${sockErr.message}`);
        }

        return {
          success: true,
          slotIndex: idx,
          cameraName: selectedCameraName,
          durationSeconds: targetDuration,
          streamStartedAt: new Date().toISOString(),
          isLiveSwitch: false
        };
      }

      // Check if this switch is running multi-camera or routine scheduled rotation
      const isManual = options && options.isManual !== false;

      // 1. PRIMARY ENGINE: Zero-disconnect GStreamer in-process input-selector switch
      const isGstActive = gstreamerService.activeProcesses.has(broadcast._id.toString());
      if (isGstActive) {
        logger.info(`[BroadcastService] Performing ZERO-DISCONNECT GStreamer camera switch (${isManual ? 'MANUAL' : 'SCHEDULED'}) to Slot #${idx + 1} (${selectedCameraName}) for Automation ${automation._id}. GStreamer pipeline, RTMPS, and HDMI remain uninterrupted.`);
        const gstRes = await gstreamerService.switchCamera(broadcast._id, idx);

        const now = new Date();
        automation.currentCameraSlotIndex = idx;
        automation.cameraStreamStartedAt = now;
        await automation.save();

        try {
          const socketService = require('./socketService');
          const switchPayload = {
            automationId: automation._id.toString(),
            activeSlotIndex: idx,
            slotIndex: idx,
            cameraName: selectedCameraName,
            durationSeconds: targetDuration,
            streamStartedAt: now.toISOString(),
            cameraStreamStartedAt: now.toISOString(),
            isLiveSwitch: true,
            uninterrupted: true,
            inPlace: true,
            engine: 'GSTREAMER',
            latencyMs: gstRes?.latencyMs || 0.1
          };
          socketService.emitToAutomation(automation._id.toString(), 'camera:active_switched', switchPayload);
          socketService.emitGlobal('camera:active_switched', switchPayload);
        } catch (_) {}

        return {
          success: true,
          activeSlotIndex: idx,
          cameraName: selectedCameraName,
          durationSeconds: targetDuration,
          cameraStreamStartedAt: now,
          uninterrupted: true,
          inPlace: true,
          engine: 'GSTREAMER',
          latencyMs: gstRes?.latencyMs || 0.1
        };
      }

      // If GStreamer pipeline is not active for this live camera broadcast, raise error
      logger.error(`[BroadcastService] Cannot switch camera: GStreamer broadcast ${broadcast._id} is not running.`);
      throw new Error(`Live camera broadcast ${broadcast._id} is not active on GStreamer engine.`);

      // 3. Update automation DB state
      const now = new Date();
      automation.currentCameraSlotIndex = idx;
      automation.cameraStreamStartedAt = now;
      await automation.save();

      // 4. Emit socket event for real-time UI synchronization
      try {
        const socketService = require('./socketService');
        const switchPayload = {
          automationId: automation._id.toString(),
          activeSlotIndex: idx,
          slotIndex: idx,
          cameraName: targetCamera.name,
          durationSeconds: targetCamera.durationSeconds,
          streamStartedAt: now.toISOString(),
          cameraStreamStartedAt: now.toISOString(),
          isLiveSwitch: true,
          uninterrupted: false
        };
        socketService.emitToAutomation(automation._id.toString(), 'camera:active_switched', switchPayload);
        socketService.emitGlobal('camera:active_switched', switchPayload);
      } catch (_) {}

      return {
        success: true,
        activeSlotIndex: idx,
        cameraName: targetCamera.name,
        durationSeconds: targetCamera.durationSeconds,
        cameraStreamStartedAt: now,
        uninterrupted: false
      };
    } finally {
      this.switchingLocks.delete(lockKey);
    }
  }

  /**
   * Instantly switches the active streaming media (video or image) in a live multi-media playlist.
   */
  async switchLiveMedia(automationId, slotIndex) {
    const lockKey = String(automationId);
    if (this.switchingLocks.has(lockKey)) {
      logger.warn(`[BroadcastService] Media switch already in progress for Automation ${lockKey}. Ignoring concurrent request.`);
      return { success: false, reason: 'SWITCH_IN_PROGRESS' };
    }
    this.switchingLocks.add(lockKey);

    try {
      const automation = await Automation.findById(automationId).populate('mediaSchedules.mediaId');
      if (!automation) throw new Error('Automation not found');
      if (!Array.isArray(automation.mediaSchedules) || automation.mediaSchedules.length === 0) {
        throw new Error('Automation does not have scheduled media configured.');
      }

      const idx = parseInt(slotIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= automation.mediaSchedules.length) {
        throw new Error(`Invalid media slot index: ${slotIndex}. Total slots: ${automation.mediaSchedules.length}`);
      }

      const selectedSched = automation.mediaSchedules[idx];
      let m = selectedSched.mediaId;
      if (typeof m === 'string' || (m && !m.filePath && (m._id || m.id))) {
        const targetId = typeof m === 'string' ? m : (m._id || m.id);
        try {
          const Media = require('../models/Media');
          m = await Media.findById(targetId);
        } catch (_) {}
      }
      const fPath = m ? (m.filePath || m.path) : null;
      if (!fPath || !fs.existsSync(fPath)) {
        throw new Error(`Media file for slot #${idx + 1} does not exist on disk`);
      }

      const clipTitle = selectedSched.title || (m ? (m.originalName || m.filename) : '') || `Clip #${idx + 1}`;
      const targetDuration = Math.max(1, selectedSched.durationSeconds || (m && m.durationSec ? Math.round(m.durationSec) : 30));

      const isLive = ['LIVE', 'STREAMING'].includes(automation.status) || automation.ffmpegStatus === 'RUNNING';
      const broadcast = automation.activeBroadcastId ? await Broadcast.findById(automation.activeBroadcastId) : null;

      const now = new Date();
      automation.currentMediaSlotIndex = idx;
      automation.mediaStreamStartedAt = now;
      await automation.save();

      if (isLive && broadcast) {
        const targetMedia = {
          filePath: fPath,
          title: clipTitle,
          mediaType: m ? m.mediaType : 'VIDEO',
          hasAudio: m ? m.hasAudio : true,
          durationSeconds: targetDuration
        };
        await ffmpegService.switchMediaStream(broadcast, automation, targetMedia, idx);
      }

      try {
        const socketService = require('./socketService');
        const payload = {
          automationId: automation._id.toString(),
          activeSlotIndex: idx,
          title: clipTitle,
          durationSeconds: targetDuration,
          mediaStreamStartedAt: now.toISOString(),
          isLiveSwitch: Boolean(isLive && broadcast)
        };
        socketService.emitToAutomation(automation._id.toString(), 'media:active_switched', payload);
        socketService.emitGlobal('media:active_switched', payload);
      } catch (_) {}

      return {
        success: true,
        activeSlotIndex: idx,
        title: clipTitle,
        durationSeconds: targetDuration,
        mediaStreamStartedAt: now
      };
    } finally {
      this.switchingLocks.delete(lockKey);
    }
  }

  /**
   * Instantly switches the active streaming YouTube video in a live playlist.
   */
  async switchLiveYouTube(automationId, slotIndex) {
    const lockKey = String(automationId);
    if (this.switchingLocks.has(lockKey)) {
      logger.warn(`[BroadcastService] YouTube switch already in progress for Automation ${lockKey}. Ignoring concurrent request.`);
      return { success: false, reason: 'SWITCH_IN_PROGRESS' };
    }
    this.switchingLocks.add(lockKey);

    try {
      const automation = await Automation.findById(automationId);
      if (!automation) throw new Error('Automation not found');
      if (!Array.isArray(automation.youtubeSchedules) || automation.youtubeSchedules.length === 0) {
        throw new Error('Automation does not have scheduled YouTube videos configured.');
      }

      const idx = parseInt(slotIndex, 10);
      if (isNaN(idx) || idx < 0 || idx >= automation.youtubeSchedules.length) {
        throw new Error(`Invalid YouTube slot index: ${slotIndex}. Total slots: ${automation.youtubeSchedules.length}`);
      }

      const selectedSched = automation.youtubeSchedules[idx];
      const targetUrl = selectedSched.youtubeUrl.trim();
      const clipTitle = selectedSched.title || 'YouTube Video';
      const targetDuration = Math.max(1, selectedSched.durationSeconds || 30);

      const fPath = await youtubeService.downloadVideo(targetUrl, automation._id);
      automation.youtubeCachePath = fPath;

      const isLive = ['LIVE', 'STREAMING'].includes(automation.status) || automation.ffmpegStatus === 'RUNNING';
      const broadcast = automation.activeBroadcastId ? await Broadcast.findById(automation.activeBroadcastId) : null;

      const now = new Date();
      automation.currentYoutubeSlotIndex = idx;
      automation.youtubeStreamStartedAt = now;
      await automation.save();

      if (isLive && broadcast) {
        const targetMedia = {
          filePath: fPath,
          title: clipTitle,
          mediaType: 'VIDEO',
          hasAudio: true,
          durationSeconds: targetDuration
        };
        await ffmpegService.switchMediaStream(broadcast, automation, targetMedia, idx);
      }

      try {
        const socketService = require('./socketService');
        const payload = {
          automationId: automation._id.toString(),
          activeSlotIndex: idx,
          title: clipTitle,
          durationSeconds: targetDuration,
          youtubeStreamStartedAt: now.toISOString(),
          isLiveSwitch: Boolean(isLive && broadcast)
        };
        socketService.emitToAutomation(automation._id.toString(), 'youtube:active_switched', payload);
        socketService.emitGlobal('youtube:active_switched', payload);
      } catch (_) {}

      return {
        success: true,
        activeSlotIndex: idx,
        title: clipTitle,
        durationSeconds: targetDuration,
        youtubeStreamStartedAt: now
      };
    } finally {
      this.switchingLocks.delete(lockKey);
    }
  }
}

module.exports = new BroadcastService();
