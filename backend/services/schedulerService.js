const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const FacebookPage = require('../models/FacebookPage');
const Media = require('../models/Media');
const StreamProcess = require('../models/StreamProcess');
const broadcastService = require('./broadcastService');
const ffmpegService = require('./ffmpegService');
const { gstreamerService } = require('./gstreamerService');
const config = require('../config/config');
const { Logger } = require('../utils/logger');
const fs = require('fs');
const youtubeService = require('./youtubeService');

const logger = new Logger('SchedulerService');

class SchedulerService {
  constructor() {
    this.timer = null;
    this.isRunning = false;
    this.isProcessingTick = false;
    this.tickIntervalMs = config.scheduler.tickIntervalMs || 1000;
  }

  /**
   * Starts the scheduler loop and runs initial crash reconciliation
   */
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting Scheduler Loop (Tick: ${this.tickIntervalMs}ms, TestMode: ${config.scheduler.testMode})`);

    // Run reconciliation on startup to clean up orphaned processes from previous runs/crashes
    await this.reconcileStartupState();

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`Unhandled error during scheduler tick: ${err.message}`);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stops the scheduler loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('Scheduler Loop stopped.');
  }

  _getZonedParts(date, timeZone = 'Asia/Kolkata') {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      const parts = {};
      formatter.formatToParts(date).forEach(p => { parts[p.type] = p.value; });
      const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const dayOfWeek = dayMap[parts.weekday] !== undefined ? dayMap[parts.weekday] : date.getDay();
      const hour = parseInt(parts.hour, 10) % 24;
      const minute = parseInt(parts.minute, 10);
      const timeMinutes = hour * 60 + minute;
      return { dayOfWeek, timeMinutes, parts };
    } catch (err) {
      return { dayOfWeek: date.getDay(), timeMinutes: date.getHours() * 60 + date.getMinutes() };
    }
  }

  _evaluateScheduleCondition(auto, now = new Date()) {
    if (auto.scheduleMode !== 'RECURRING_WINDOW') {
      return { shouldBeLive: true, reason: 'STANDARD' };
    }

    // 1. Date Range Check
    if (auto.startDate && now < new Date(auto.startDate)) {
      return { shouldBeLive: false, reason: 'BEFORE_START_DATE' };
    }
    if (auto.endDate && now > new Date(auto.endDate)) {
      return { shouldBeLive: false, reason: 'AFTER_END_DATE' };
    }

    const { dayOfWeek, timeMinutes } = this._getZonedParts(now, auto.timezone || 'Asia/Kolkata');

    // 2. Days of Week Check
    if (Array.isArray(auto.daysOfWeek) && auto.daysOfWeek.length > 0) {
      if (!auto.daysOfWeek.includes(dayOfWeek)) {
        return { shouldBeLive: false, reason: 'DAY_NOT_SELECTED' };
      }
    }

    // 3. Daily Time Window Check
    if (auto.enableDailyWindow && auto.dailyStartTime && auto.dailyEndTime) {
      const [sH, sM] = auto.dailyStartTime.split(':').map(Number);
      const [eH, eM] = auto.dailyEndTime.split(':').map(Number);
      const startMin = (sH || 0) * 60 + (sM || 0);
      const endMin = (eH || 0) * 60 + (eM || 0);

      let inWindow = false;
      if (startMin <= endMin) {
        inWindow = timeMinutes >= startMin && timeMinutes <= endMin;
      } else {
        // Midnight crossover e.g. 22:00 to 06:00
        inWindow = timeMinutes >= startMin || timeMinutes <= endMin;
      }

      if (!inWindow) {
        return { shouldBeLive: false, reason: 'OUTSIDE_DAILY_TIME_WINDOW' };
      }
    }

    return { shouldBeLive: true, reason: 'ACTIVE_WINDOW' };
  }

  /**
   * Single scheduler cycle inspecting database states
   */
  async tick() {
    if (this.isProcessingTick) return;
    this.isProcessingTick = true;

    try {
      const now = new Date();

      // 1. Process SCHEDULED automations
      const scheduledAutomations = await Automation.find({ status: 'SCHEDULED' });

      for (const auto of scheduledAutomations) {
        if (auto.nextRetryScheduledAt && auto.nextRetryScheduledAt > now) {
          continue;
        }

        if (auto.nextRetryScheduledAt && auto.nextRetryScheduledAt <= now) {
          logger.info(`Scheduler: Scheduled retry window active for "${auto.name}" (${auto._id}, Attempt #${(auto.retryCount || 0) + 1}). Retrying start...`);
          await this._handleStartScheduled(auto);
          continue;
        }

        if (auto.scheduleMode === 'RECURRING_WINDOW') {
          const cond = this._evaluateScheduleCondition(auto, now);
          if (cond.shouldBeLive) {
            logger.info(`Scheduler: Recurring automation "${auto.name}" (${auto._id}) entered active working window. Starting broadcast.`);
            await this._handleStartScheduled(auto);
          }
        } else if (auto.scheduledStartTime && auto.scheduledStartTime <= now) {
          await this._handleStartScheduled(auto);
        }
      }

      // 1.5. Process active RECURRING_WINDOW automations that have exited their window
      const activeRecurring = await Automation.find({
        scheduleMode: 'RECURRING_WINDOW',
        status: { $in: ['LIVE', 'STREAMING', 'STARTING', 'CREATING_BROADCAST', 'PREPARING', 'ROTATING'] }
      });

      for (const auto of activeRecurring) {
        const cond = this._evaluateScheduleCondition(auto, now);
        if (!cond.shouldBeLive) {
          logger.info(`Scheduler: Recurring automation "${auto.name}" (${auto._id}) exited working window (${cond.reason}). Stopping stream cleanly.`);
          if (auto.activeBroadcastId) {
            await broadcastService.endBroadcast(auto.activeBroadcastId, 'COMPLETED');
          }
          auto.status = 'SCHEDULED';
          auto.healthStatus = 'OFFLINE';
          auto.activeBroadcastId = null;
          await auto.save();
        }
      }

      // 2. Process LIVE automations that have reached their target completion time
      const completedAutomations = await Automation.find({
        status: { $in: ['LIVE', 'STREAMING'] },
        targetEndTime: { $ne: null, $lte: now }
      });

      for (const auto of completedAutomations) {
        logger.info(`Scheduler: Target completion time reached for automation "${auto.name}" (${auto._id}). Completing.`);
        if (auto.activeBroadcastId) {
          await broadcastService.endBroadcast(auto.activeBroadcastId, 'COMPLETED');
        }
        auto.status = 'COMPLETED';
        auto.healthStatus = 'OFFLINE';
        auto.activeBroadcastId = null;
        await auto.save();
      }

      // 2.5. Process LIVE multi-camera automations due for slot cycling
      const multiCamAutomations = await Automation.find({
        status: { $in: ['LIVE', 'STREAMING'] },
        'cameraSchedules.1': { $exists: true }
      });

      for (const auto of multiCamAutomations) {
        if (!auto.activeBroadcastId) continue;
        const schedules = auto.cameraSchedules;
        if (!Array.isArray(schedules) || schedules.length <= 1) continue;

        const currentSlotIdx = (typeof auto.currentCameraSlotIndex === 'number' && auto.currentCameraSlotIndex >= 0 && auto.currentCameraSlotIndex < schedules.length)
          ? auto.currentCameraSlotIndex
          : 0;
        const currentSlot = schedules[currentSlotIdx] || schedules[0];
        const slotDuration = Math.max(1, currentSlot?.durationSeconds || 20);

        const startedAt = auto.cameraStreamStartedAt ? new Date(auto.cameraStreamStartedAt).getTime() : 0;
        const elapsedSec = (Date.now() - startedAt) / 1000;

        if (elapsedSec >= slotDuration) {
          const nextSlotIdx = (currentSlotIdx + 1) % schedules.length;
          logger.info(`Scheduler: Camera slot #${currentSlotIdx + 1} (${currentSlot.cameraName || 'Camera'}) duration ${slotDuration}s reached for Automation "${auto.name}". Cycling to Slot #${nextSlotIdx + 1}...`);

          try {
            const broadcastService = require('./broadcastService');
            const switchRes = await broadcastService.switchLiveCamera(auto._id, nextSlotIdx, { isManual: false });
            if (switchRes && !switchRes.success) {
              logger.warn(`Scheduler: Camera slot cycle did not succeed for "${auto.name}": ${switchRes.error || switchRes.reason}. Backing off for 5s.`);
              auto.cameraStreamStartedAt = new Date(Date.now() - ((slotDuration - 5) * 1000));
              await auto.save();
            }
          } catch (camErr) {
            logger.error(`Scheduler: Failed to cycle live camera for "${auto.name}": ${camErr.message}. Backing off for 5s.`);
            auto.cameraStreamStartedAt = new Date(Date.now() - ((slotDuration - 5) * 1000));
            await auto.save();
          }
        }
      }

      // 2.6. Process LIVE multi-media (Video / Image) automations due for slot cycling
      const multiMediaAutomations = await Automation.find({
        status: { $in: ['LIVE', 'STREAMING', 'ROTATING'] },
        sourceType: { $in: ['VIDEO_FILE', 'IMAGE'] },
        'mediaSchedules.1': { $exists: true }
      });

      for (const auto of multiMediaAutomations) {
        if (!auto.activeBroadcastId) continue;
        const schedules = auto.mediaSchedules;
        if (!Array.isArray(schedules) || schedules.length <= 1) continue;

        const currentSlotIdx = (typeof auto.currentMediaSlotIndex === 'number' && auto.currentMediaSlotIndex >= 0 && auto.currentMediaSlotIndex < schedules.length)
          ? auto.currentMediaSlotIndex
          : 0;
        const currentSlot = schedules[currentSlotIdx] || schedules[0];
        const slotDuration = Math.max(1, currentSlot?.durationSeconds || 30);

        const startedAt = auto.mediaStreamStartedAt ? new Date(auto.mediaStreamStartedAt).getTime() : 0;
        const elapsedSec = (Date.now() - startedAt) / 1000;

        if (elapsedSec >= slotDuration) {
          const nextSlotIdx = (currentSlotIdx + 1) % schedules.length;
          logger.info(`Scheduler: Media slot #${currentSlotIdx + 1} (${currentSlot.title || 'Clip'}) duration ${slotDuration}s reached for Automation "${auto.name}". Cycling to Slot #${nextSlotIdx + 1}...`);
          
          const nowTime = new Date();
          auto.currentMediaSlotIndex = nextSlotIdx;
          auto.mediaStreamStartedAt = nowTime;
          await auto.save();

          try {
            const socketService = require('./socketService');
            socketService.emitToAutomation(auto._id.toString(), 'media:active_switched', {
              automationId: auto._id.toString(),
              activeSlotIndex: nextSlotIdx,
              title: schedules[nextSlotIdx]?.title || `Clip #${nextSlotIdx + 1}`,
              durationSeconds: Math.max(1, schedules[nextSlotIdx]?.durationSeconds || 30),
              mediaStreamStartedAt: nowTime.toISOString()
            });
            socketService.emitGlobal('media:active_switched', {
              automationId: auto._id.toString(),
              activeSlotIndex: nextSlotIdx,
              title: schedules[nextSlotIdx]?.title || `Clip #${nextSlotIdx + 1}`,
              durationSeconds: Math.max(1, schedules[nextSlotIdx]?.durationSeconds || 30),
              mediaStreamStartedAt: nowTime.toISOString()
            });
          } catch (_) {}
        }
      }

      // 2.7. Process LIVE multi-YouTube automations due for slot cycling
      const multiYtAutomations = await Automation.find({
        status: { $in: ['LIVE', 'STREAMING', 'ROTATING'] },
        sourceType: 'YOUTUBE_VIDEO',
        'youtubeSchedules.1': { $exists: true }
      });

      for (const auto of multiYtAutomations) {
        if (!auto.activeBroadcastId) continue;
        const schedules = auto.youtubeSchedules;
        if (!Array.isArray(schedules) || schedules.length <= 1) continue;

        const currentSlotIdx = (typeof auto.currentYoutubeSlotIndex === 'number' && auto.currentYoutubeSlotIndex >= 0 && auto.currentYoutubeSlotIndex < schedules.length)
          ? auto.currentYoutubeSlotIndex
          : 0;
        const currentSlot = schedules[currentSlotIdx] || schedules[0];
        const slotDuration = Math.max(1, currentSlot?.durationSeconds || 30);

        const startedAt = auto.youtubeStreamStartedAt ? new Date(auto.youtubeStreamStartedAt).getTime() : 0;
        const elapsedSec = (Date.now() - startedAt) / 1000;

        if (elapsedSec >= slotDuration) {
          const nextSlotIdx = (currentSlotIdx + 1) % schedules.length;
          logger.info(`Scheduler: YouTube slot #${currentSlotIdx + 1} (${currentSlot.title || 'YouTube Video'}) duration ${slotDuration}s reached for Automation "${auto.name}". Cycling to Slot #${nextSlotIdx + 1}...`);
          try {
            await broadcastService.switchLiveYouTube(auto._id, nextSlotIdx);
          } catch (ytErr) {
            logger.error(`Scheduler: Failed to cycle YouTube slot for Automation ${auto._id}: ${ytErr.message}`);
          }
        }
      }

      // 3. Process LIVE automations due for rotation (only if not completed)
      const liveAutomations = await Automation.find({
        status: { $in: ['LIVE', 'STREAMING'] },
        nextRotationScheduledAt: { $lte: now }
      });

      for (const auto of liveAutomations) {
        await this._handleTriggerRotation(auto);
      }

      // 4. Process ROTATING automations waiting for restart delay to complete
      const rotatingAutomations = await Automation.find({
        status: 'ROTATING',
        nextRotationScheduledAt: { $lte: now }
      });

      for (const auto of rotatingAutomations) {
        await this._handleResumeRotation(auto);
      }

    } catch (err) {
      logger.error(`Error in scheduler tick cycle: ${err.message}`);
    } finally {
      this.isProcessingTick = false;
    }
  }

  /**
   * Pre-flight health and validity check before starting an automation
   */
  async preflightCheck(automationId) {
    const automation = await Automation.findById(automationId)
      .populate('facebookPageId')
      .populate('targetPageIds')
      .populate('mediaId')
      .populate('mediaSchedules.mediaId')
      .populate('cameraId');

    if (!automation) throw new Error('Automation not found');

    const issues = [];
    
    // Resolve all target page destinations
    const allPages = [
      automation.facebookPageId,
      ...(Array.isArray(automation.targetPageIds) ? automation.targetPageIds : [])
    ].filter(Boolean);

    const isYouTubeTarget = automation.destinationPlatform === 'YOUTUBE' ||
      (automation.facebookPageId && (automation.facebookPageId.platform === 'YOUTUBE' || automation.facebookPageId.category?.includes('YouTube'))) ||
      (Array.isArray(automation.targetPageIds) && automation.targetPageIds.some(p => p.platform === 'YOUTUBE' || p.category?.includes('YouTube')));

    if (allPages.length === 0 && (!automation.youtubeStreamKey || !automation.youtubeStreamKey.trim())) {
      issues.push('Destination is not associated with this automation');
    } else {
      // Validate Facebook destinations if present
      const fbPages = allPages.filter(p => p.platform === 'FACEBOOK' || (!p.platform && !p.category?.includes('YouTube')));
      for (const p of fbPages) {
        if (!p.isValid && p.streamType !== 'STREAM_KEY') {
          issues.push(`Facebook Page "${p.name || 'Facebook'}" token is marked as invalid or expired`);
        }
      }
      // Validate YouTube destination stream key if present
      if (isYouTubeTarget || allPages.some(p => p.platform === 'YOUTUBE')) {
        let hasYtKey = Boolean(automation.youtubeStreamKey && automation.youtubeStreamKey.trim());
        if (!hasYtKey) {
          const ytPages = allPages.filter(p => p.platform === 'YOUTUBE' || p.category?.includes('YouTube'));
          for (const yp of ytPages) {
            try {
              if (typeof yp.getPageAccessToken === 'function') {
                if (yp.getPageAccessToken()) {
                  hasYtKey = true;
                  break;
                }
              } else if (yp.encryptedPageAccessToken) {
                const { decrypt } = require('../utils/encryption');
                if (decrypt(yp.encryptedPageAccessToken)) {
                  hasYtKey = true;
                  break;
                }
              }
            } catch (_) {}
          }
        }
        if (!hasYtKey) {
          issues.push('YouTube Stream Key is missing or invalid for YouTube Live destination');
        }
      }
    }

    const isLocalCamera = automation.sourceType === 'LOCAL_CAMERA';
    const isRtspCamera = automation.sourceType === 'RTSP_CAMERA' || automation.sourceType === 'ONVIF_CAMERA' || Boolean(automation.cameraId);
    const isCamera = isLocalCamera || isRtspCamera;

    if (isCamera) {
      const hasCameraSchedules = Array.isArray(automation.cameraSchedules) && automation.cameraSchedules.length > 0;
      if (isRtspCamera && !automation.cameraId && !hasCameraSchedules) {
        issues.push('CCTV Camera is not assigned to this automation');
      }
      if (isLocalCamera && !automation.localCameraDevice && !hasCameraSchedules) {
        issues.push('Webcam device is not assigned to this automation');
      }
    } else if (automation.sourceType === 'YOUTUBE_VIDEO') {
      const hasSchedules = Array.isArray(automation.youtubeSchedules) && automation.youtubeSchedules.length > 0;
      const validUrl = hasSchedules
        ? automation.youtubeSchedules.some(s => youtubeService.isYouTubeUrl(s.youtubeUrl))
        : youtubeService.isYouTubeUrl(automation.youtubeUrl);

      if (!validUrl) {
        issues.push('A valid YouTube video URL is required');
      } else if (!(await youtubeService.isAvailable())) {
        issues.push('yt-dlp is required for YouTube sources. Install it or set YTDLP_PATH.');
      }
    } else {
      // Check Media (single or multi-media playlist)
      const hasMediaSchedules = Array.isArray(automation.mediaSchedules) && automation.mediaSchedules.length > 0;
      const targetMediaDocs = hasMediaSchedules
        ? automation.mediaSchedules.map(s => s.mediaId).filter(Boolean)
        : (automation.mediaId ? [automation.mediaId] : []);

      if (targetMediaDocs.length === 0) {
        issues.push('Media file or video playlist is not assigned to this automation');
      } else {
        let validCount = 0;
        for (const mDoc of targetMediaDocs) {
          const filePath = mDoc.filePath || mDoc.path;
          const isTestMock = (config.scheduler?.testMode || process.env.SCHEDULER_TEST_MODE === 'true') && filePath && filePath.includes('mock');
          if (isTestMock) {
            validCount++;
            continue;
          }
          if (!filePath || !fs.existsSync(filePath)) {
            issues.push(`Media file does not exist on disk: ${filePath || 'Unknown'}`);
          } else {
            try {
              fs.accessSync(filePath, fs.constants.R_OK);
              validCount++;
            } catch (err) {
              issues.push(`Media file is not readable on disk: ${filePath} (${err.message})`);
            }
          }
        }
        if (validCount === 0 && issues.length === 0) {
          issues.push('No playable media clips found on disk');
        }
      }
    }

    return {
      passed: issues.length === 0,
      issues
    };
  }

  /**
   * Starts a scheduled automation with atomic lock
   */
  async _handleStartScheduled(automation) {
    const autoId = automation._id || automation;
    // Atomic state claim to prevent duplicate triggers
    const claimedAuto = await Automation.findOneAndUpdate(
      { _id: autoId, status: 'SCHEDULED' },
      { $set: { status: 'PREPARING' } },
      { new: true }
    );

    if (!claimedAuto) {
      // Another worker/tick claimed this scheduled item
      return;
    }

    logger.info(`Scheduler: Starting claimed scheduled automation "${claimedAuto.name}" (${claimedAuto._id})`);

    // Clean up any stale streams before launching
    try {
      await Promise.allSettled([
        gstreamerService.stopStreamsForAutomation(claimedAuto._id),
        ffmpegService.stopStreamsForAutomation(claimedAuto._id)
      ]);
    } catch (_) {}

    const preflight = await this.preflightCheck(claimedAuto._id);
    if (!preflight.passed) {
      const reason = preflight.issues.join('; ');
      logger.warn(`Preflight failed for automation ${claimedAuto._id}: ${reason}`);
      await this._handleScheduledStartFailure(claimedAuto, reason, 'FACEBOOK');
      return;
    }

    try {
      await broadcastService.startBroadcast(claimedAuto._id, 1);
      // Clean up retry tracking on successful start
      await Automation.updateOne(
        { _id: claimedAuto._id },
        {
          $set: {
            retryCount: 0,
            retryWindowStartedAt: null,
            nextRetryScheduledAt: null
          }
        }
      ).catch(() => {});
    } catch (err) {
      logger.error(`Failed to start broadcast for ${claimedAuto._id}: ${err.message}`);
      await this._handleScheduledStartFailure(claimedAuto, err.message, claimedAuto.failureStage || 'STREAM');
    }
  }

  /**
   * Handles failure to start a scheduled broadcast with a 5-minute retry window at regular intervals
   */
  async _handleScheduledStartFailure(claimedAuto, errorMessage, failureStage = 'FACEBOOK') {
    const RETRY_WINDOW_MS = process.env.SCHEDULED_RETRY_WINDOW_MS 
      ? parseInt(process.env.SCHEDULED_RETRY_WINDOW_MS, 10) 
      : 5 * 60 * 1000; // 5 minutes (300,000 ms)

    const RETRY_INTERVAL_MS = process.env.SCHEDULED_RETRY_INTERVAL_MS 
      ? parseInt(process.env.SCHEDULED_RETRY_INTERVAL_MS, 10) 
      : 15 * 1000; // 15 seconds regular interval

    const now = new Date();
    const currentDoc = await Automation.findById(claimedAuto._id);
    if (!currentDoc) return;

    const windowStart = currentDoc.retryWindowStartedAt ? new Date(currentDoc.retryWindowStartedAt) : now;
    const elapsedMs = now.getTime() - windowStart.getTime();

    if (elapsedMs < RETRY_WINDOW_MS) {
      // Within 5-minute retry window: keep retrying at regular intervals without showing hard error
      const nextRetry = new Date(now.getTime() + RETRY_INTERVAL_MS);
      const newRetryCount = (currentDoc.retryCount || 0) + 1;
      const remainingSec = Math.max(0, Math.round((RETRY_WINDOW_MS - elapsedMs) / 1000));
      const retryErrorMsg = `Facebook Live start pending (Attempt #${newRetryCount}): ${errorMessage}. Retrying every ${Math.round(RETRY_INTERVAL_MS / 1000)}s (${remainingSec}s window remaining)...`;

      logger.warn(`Scheduler: Automation "${currentDoc.name}" (${currentDoc._id}) start failed. ${retryErrorMsg}`);

      await Automation.updateOne(
        { _id: currentDoc._id },
        {
          $set: {
            status: 'SCHEDULED',
            healthStatus: 'WARNING',
            failureStage,
            retryCount: newRetryCount,
            retryWindowStartedAt: windowStart,
            nextRetryScheduledAt: nextRetry,
            lastError: retryErrorMsg
          }
        }
      );

      try {
        const socketService = require('./socketService');
        socketService.emitToAutomation(currentDoc._id.toString(), 'automation:retrying', {
          automationId: currentDoc._id.toString(),
          retryCount: newRetryCount,
          nextRetryScheduledAt: nextRetry.toISOString(),
          retryWindowRemainingSec: remainingSec,
          error: errorMessage,
          message: retryErrorMsg
        });
        socketService.emitGlobal('automation:updated', {
          _id: currentDoc._id.toString(),
          status: 'SCHEDULED',
          healthStatus: 'WARNING',
          retryCount: newRetryCount,
          nextRetryScheduledAt: nextRetry.toISOString(),
          lastError: retryErrorMsg
        });
      } catch (_) {}
    } else {
      // 5-minute retry window exceeded: now transition to FAILED and show hard error
      const finalErrorMsg = `Failed to start Facebook Live after 5 minutes of retries (${currentDoc.retryCount || 1} attempts): ${errorMessage}`;
      logger.error(`Scheduler: Automation "${currentDoc.name}" (${currentDoc._id}) exceeded 5-minute retry window. Marked as FAILED: ${errorMessage}`);

      await Automation.updateOne(
        { _id: currentDoc._id },
        {
          $set: {
            status: 'FAILED',
            healthStatus: 'ERROR',
            failureStage,
            retryWindowStartedAt: null,
            nextRetryScheduledAt: null,
            lastError: finalErrorMsg
          }
        }
      );

      try {
        const socketService = require('./socketService');
        socketService.emitToAutomation(currentDoc._id.toString(), 'automation:failed', {
          automationId: currentDoc._id.toString(),
          error: finalErrorMsg,
          failureStage
        });
        socketService.emitGlobal('automation:updated', {
          _id: currentDoc._id.toString(),
          status: 'FAILED',
          healthStatus: 'ERROR',
          failureStage,
          lastError: finalErrorMsg
        });
      } catch (_) {}
    }
  }

  /**
   * Handles rotation time expiration: ends current broadcast and prepares next rotation
   */
  async _handleTriggerRotation(automation) {
    logger.info(`Scheduler: Rotation duration reached for automation "${automation.name}" (${automation._id}). Rotating...`);

    // Check target completion time
    if (automation.targetEndTime && new Date() >= automation.targetEndTime) {
      logger.info(`Automation ${automation._id} has reached its targetEndTime. Completing.`);
      if (automation.activeBroadcastId) {
        await broadcastService.endBroadcast(automation.activeBroadcastId, 'COMPLETED');
      }
      automation.status = 'COMPLETED';
      automation.healthStatus = 'OFFLINE';
      automation.activeBroadcastId = null;
      await automation.save();
      return;
    }

    // Check repeat limits
    if (automation.repeatMode === 'ONCE') {
      logger.info(`Automation ${automation._id} has repeatMode ONCE. Completing.`);
      if (automation.activeBroadcastId) {
        await broadcastService.endBroadcast(automation.activeBroadcastId, 'COMPLETED');
      }
      automation.status = 'COMPLETED';
      automation.healthStatus = 'OFFLINE';
      automation.activeBroadcastId = null;
      await automation.save();
      return;
    }

    if (automation.repeatMode === 'COUNT_LIMITED' && automation.currentRotationIndex >= automation.maxRotations) {
      logger.info(`Automation ${automation._id} reached max rotations (${automation.maxRotations}). Completing.`);
      if (automation.activeBroadcastId) {
        await broadcastService.endBroadcast(automation.activeBroadcastId, 'COMPLETED');
      }
      automation.status = 'COMPLETED';
      automation.healthStatus = 'OFFLINE';
      automation.activeBroadcastId = null;
      await automation.save();
      return;
    }

    // End current active broadcast
    if (automation.activeBroadcastId) {
      await broadcastService.endBroadcast(automation.activeBroadcastId, 'ROTATION');
    }

    // Transition to ROTATING and set restart delay timeout
    automation.status = 'ROTATING';
    automation.healthStatus = 'HEALTHY';
    const delaySec = automation.restartDelaySec || (config.scheduler.testMode ? config.scheduler.testRestartDelay : config.scheduler.defaultRestartDelay);
    automation.nextRotationScheduledAt = new Date(Date.now() + (delaySec * 1000));
    await automation.save();

    logger.info(`Automation ${automation._id} is now ROTATING. Next rotation will start in ${delaySec}s.`);
  }

  /**
   * Resumes rotation after restart delay has elapsed with atomic lock
   */
  async _handleResumeRotation(automation) {
    const claimedAuto = await Automation.findOneAndUpdate(
      { _id: automation._id, status: 'ROTATING' },
      { $set: { status: 'PREPARING' } },
      { new: true }
    );

    if (!claimedAuto) {
      return;
    }

    const nextRotationIndex = claimedAuto.currentRotationIndex + 1;
    logger.info(`Scheduler: Restart delay complete for automation "${claimedAuto.name}". Launching rotation #${nextRotationIndex}...`);

    try {
      await broadcastService.startBroadcast(claimedAuto._id, nextRotationIndex);
    } catch (err) {
      logger.error(`Failed to launch rotation #${nextRotationIndex} for ${claimedAuto._id}: ${err.message}`);
    }
  }

  /**
   * Manual Force Rotation Trigger
   */
  async triggerRotationNow(automationId) {
    const automation = await Automation.findById(automationId);
    if (!automation) throw new Error('Automation not found');
    if (automation.status !== 'LIVE') {
      throw new Error(`Cannot rotate automation in status "${automation.status}". Must be LIVE.`);
    }

    logger.info(`Manual rotation triggered for Automation ${automationId}`);
    await this._handleTriggerRotation(automation);
    return automation;
  }

  /**
   * Manual Pause
   */
  async pauseAutomation(automationId) {
    const automation = await Automation.findById(automationId);
    if (!automation) throw new Error('Automation not found');

    if (automation.activeBroadcastId) {
      await broadcastService.endBroadcast(automation.activeBroadcastId, 'PAUSED');
    }

    automation.status = 'PAUSED';
    automation.healthStatus = 'OFFLINE';
    automation.retryCount = 0;
    automation.retryWindowStartedAt = null;
    automation.nextRetryScheduledAt = null;
    await automation.save();

    logger.info(`Automation ${automationId} paused.`);
    return automation;
  }

  /**
   * Manual Resume
   */
  async resumeAutomation(automationId) {
    const automation = await Automation.findById(automationId);
    if (!automation) throw new Error('Automation not found');

    const allowedStatuses = ['PAUSED', 'STOPPED', 'FAILED', 'CRASHED', 'SCHEDULED', 'PREPARING', 'RECOVERING', 'ERROR', 'IDLE', 'CREATING_BROADCAST'];
    if (!allowedStatuses.includes(automation.status)) {
      let livePid = null;
      const gstEntry = gstreamerService.getActivePipeline(automation._id);
      if (gstEntry && gstEntry.child) {
        livePid = gstEntry.child.pid;
      }
      if (!livePid) {
        for (const [, entry] of ffmpegService.activeProcesses.entries()) {
          if (entry.automationId && entry.automationId.toString() === automation._id.toString()) {
            livePid = entry.pid;
            break;
          }
        }
      }
      if (livePid) {
        throw new Error(`Automation "${automation.name}" is already actively streaming (PID ${livePid}). Please stop or wait for rotation before resuming.`);
      }
      logger.warn(`Automation status was "${automation.status}" but no active streaming process found. Allowing retry/resume.`);
    }

    // Clean up any stale/orphaned processes or resources for this automation before restarting
    await Promise.allSettled([
      gstreamerService.stopStreamsForAutomation(automation._id),
      ffmpegService.stopStreamsForAutomation(automation._id)
    ]);

    const nextIndex = (automation.currentRotationIndex || 0) + 1;
    logger.info(`Resuming Automation ${automationId} at rotation #${nextIndex}`);
    await broadcastService.startBroadcast(automationId, nextIndex);

    return Automation.findById(automationId);
  }

  /**
   * Manual Stop
   */
  async stopAutomation(automationId) {
    const automation = await Automation.findById(automationId);
    if (!automation) throw new Error('Automation not found');

    if (automation.activeBroadcastId) {
      await broadcastService.endBroadcast(automation.activeBroadcastId, 'STOPPED');
    }

    automation.status = 'STOPPED';
    automation.healthStatus = 'OFFLINE';
    automation.activeBroadcastId = null;
    automation.currentCameraSlotIndex = 0; // Reset to Slot 1 for next clean start
    automation.retryCount = 0;
    automation.retryWindowStartedAt = null;
    automation.nextRetryScheduledAt = null;
    await automation.save();

    logger.info(`Automation ${automationId} stopped (currentCameraSlotIndex reset to 0).`);
    return automation;
  }

  /**
   * Startup State Reconciler:
   * Inspects database for automations left in LIVE / ROTATING / STARTING / PREPARING states from a prior crash or server restart.
   * Cleans up orphaned OS processes and safely reconciles status.
   */
  async reconcileStartupState() {
    logger.info('Running startup crash and orphan state reconciliation...');

    try {
      // Find all automations in active or transition states
      const activeAutomations = await Automation.find({
        status: { $in: ['LIVE', 'ROTATING', 'STARTING', 'PREPARING', 'CREATING_BROADCAST'] }
      });

      for (const auto of activeAutomations) {
        logger.warn(`Reconciling orphaned automation: "${auto.name}" (ID: ${auto._id}, Status: ${auto.status})`);

        if (auto.status === 'PREPARING' || auto.status === 'CREATING_BROADCAST') {
          auto.status = 'STOPPED';
          auto.healthStatus = 'OFFLINE';
          auto.failureStage = 'NONE';
          auto.failureCode = null;
          auto.lastError = null;
          await auto.save();
          continue;
        }

        if (auto.activeBroadcastId) {
          const broadcast = await Broadcast.findById(auto.activeBroadcastId);
          if (broadcast && (broadcast.status === 'LIVE' || broadcast.status === 'STREAMING')) {
            // Check if process is alive in memory/OS
            const streamProc = await StreamProcess.findOne({ broadcastId: broadcast._id, status: 'RUNNING' });
            const isAlive = streamProc && (gstreamerService.isPidAlive(streamProc.pid) || ffmpegService.isPidAlive(streamProc.pid));

            if (!isAlive) {
              logger.warn(`Process for broadcast ${broadcast._id} is no longer running. Marking as CRASHED/RECOVERED.`);
              broadcast.status = 'CRASHED';
              broadcast.errorMessage = 'Recovered after server restart';
              broadcast.actualEndTime = new Date();
              await broadcast.save();

              if (streamProc) {
                streamProc.status = 'CRASHED';
                await streamProc.save();
              }
            }
          }
        }

        // Set automation back to scheduled or ready for restart
        auto.status = 'PAUSED';
        auto.healthStatus = 'WARNING';
        auto.lastError = 'Recovered from unexpected shutdown. Please resume when ready.';
        await auto.save();
      }

      logger.info(`Reconciliation complete. Handled ${activeAutomations.length} active automations.`);
    } catch (reconcileErr) {
      logger.error(`Error during startup reconciliation: ${reconcileErr.message}`);
    }
  }

  /**
   * Global Emergency Stop: Kills all streams and marks automations as STOPPED
   */
  async emergencyStopAll() {
    logger.warn('EMERGENCY STOP EXECUTED: Stopping all active broadcasts across the platform.');
    await Promise.allSettled([
      gstreamerService.emergencyStopAll(),
      ffmpegService.emergencyStopAll()
    ]);

    await Broadcast.updateMany(
      { status: { $in: ['LIVE', 'STREAMING', 'ROTATING'] } },
      { $set: { status: 'ENDED', actualEndTime: new Date(), errorMessage: 'Terminated by Emergency Stop' } }
    );

    await Automation.updateMany(
      { status: { $in: ['LIVE', 'STARTING', 'ROTATING'] } },
      { $set: { status: 'STOPPED', healthStatus: 'OFFLINE', activeBroadcastId: null } }
    );

    return true;
  }
}

module.exports = new SchedulerService();
