const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const Media = require('../models/Media');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const Camera = require('../models/Camera');
const broadcastService = require('../services/broadcastService');
const schedulerService = require('../services/schedulerService');
const facebookService = require('../services/facebook/facebookService');
const config = require('../config/config');

let mongoServer;

describe('Persistent Scheduler & Broadcast Rotation Engine', () => {
  let user, page, media, automation;

  beforeAll(async () => {
    facebookService.setMockMode(true);
    config.scheduler.testMode = true;

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Test Scheduler User',
      email: 'scheduler@test.dev',
      password: 'password123',
      role: 'admin'
    });

    const account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_fb_user_test',
      name: 'Scheduler Test User',
      isMock: true
    });
    account.setAccessToken('mock_access_token_123');
    await account.save();

    page = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_page_test_1',
      name: 'Automated 24/7 Test Stream',
      category: 'Broadcasting',
      isMock: true,
      isValid: true
    });
    page.setPageAccessToken('mock_page_token_123');
    await page.save();

    media = await Media.create({
      userId: user._id,
      filename: 'test_video.mp4',
      originalName: 'Continuous Loop Promo.mp4',
      filePath: '/tmp/mock_test_video.mp4',
      mimeType: 'video/mp4',
      mediaType: 'VIDEO',
      fileSizeBytes: 5000000,
      durationSec: 30
    });
  });

  afterAll(async () => {
    schedulerService.stop();
    await broadcastService.endBroadcast(automation?.activeBroadcastId).catch(() => {});
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('Creates scheduled automation with 1-second rotation for test', async () => {
    automation = await Automation.create({
      userId: user._id,
      name: 'High Frequency Rotation Test',
      facebookPageId: page._id,
      mediaId: media._id,
      title: 'Automated Loop Stream',
      status: 'SCHEDULED',
      scheduledStartTime: new Date(),
      rotationDurationSec: 1, // 1s for fast test
      restartDelaySec: 1,      // 1s restart delay
      repeatMode: 'INDEFINITE'
    });

    expect(automation).toBeDefined();
    expect(automation.status).toBe('SCHEDULED');
  });

  test('Starts Broadcast #1 and updates Automation to LIVE state', async () => {
    const broadcast1 = await broadcastService.startBroadcast(automation._id, 1);

    expect(broadcast1).toBeDefined();
    expect(broadcast1.status).toBe('LIVE');
    expect(broadcast1.rotationIndex).toBe(1);
    expect(broadcast1.streamUrl).toContain('rtmps://');

    const updatedAuto = await Automation.findById(automation._id);
    expect(updatedAuto.status).toBe('LIVE');
    expect(updatedAuto.currentRotationIndex).toBe(1);
    expect(updatedAuto.activeBroadcastId.toString()).toBe(broadcast1._id.toString());
  });

  test('Scheduler tick triggers rotation transition when duration expires', async () => {
    // Fast-forward nextRotationScheduledAt to the past
    await Automation.updateOne(
      { _id: automation._id },
      { $set: { nextRotationScheduledAt: new Date(Date.now() - 5000) } }
    );

    await schedulerService.tick();

    const rotatingAuto = await Automation.findById(automation._id);
    expect(rotatingAuto.status).toBe('ROTATING');

    const pastBroadcast = await Broadcast.findOne({ automationId: automation._id, rotationIndex: 1 });
    expect(pastBroadcast.status).toBe('ENDED');
  });

  test('Scheduler tick resumes rotation #2 after restart delay', async () => {
    // Fast-forward restart delay to past
    await Automation.updateOne(
      { _id: automation._id },
      { $set: { nextRotationScheduledAt: new Date(Date.now() - 5000) } }
    );

    await schedulerService.tick();

    const liveAuto = await Automation.findById(automation._id);
    expect(liveAuto.status).toBe('LIVE');
    expect(liveAuto.currentRotationIndex).toBe(2);

    const broadcast2 = await Broadcast.findOne({ automationId: automation._id, rotationIndex: 2 });
    expect(broadcast2).toBeDefined();
    expect(broadcast2.status).toBe('LIVE');
    expect(broadcast2.facebookPageId.toString()).toBe(page._id.toString()); // Inherits same Facebook Page
  });

  test('Scheduler tick triggers rotation to Broadcast #3 with same configuration', async () => {
    // Trigger rotation #2 -> ROTATING
    await Automation.updateOne(
      { _id: automation._id },
      { $set: { nextRotationScheduledAt: new Date(Date.now() - 5000) } }
    );
    await schedulerService.tick();

    // Trigger restart delay -> Broadcast #3
    await Automation.updateOne(
      { _id: automation._id },
      { $set: { nextRotationScheduledAt: new Date(Date.now() - 5000) } }
    );
    await schedulerService.tick();

    const liveAuto = await Automation.findById(automation._id);
    expect(liveAuto.status).toBe('LIVE');
    expect(liveAuto.currentRotationIndex).toBe(3);

    const broadcast3 = await Broadcast.findOne({ automationId: automation._id, rotationIndex: 3 });
    expect(broadcast3).toBeDefined();
    expect(broadcast3.status).toBe('LIVE');
    expect(broadcast3.facebookPageId.toString()).toBe(page._id.toString()); // Same page reused
  });

  test('Stops automation cleanly and creates no additional broadcasts', async () => {
    const stopped = await schedulerService.stopAutomation(automation._id);
    expect(stopped.status).toBe('STOPPED');
    expect(stopped.activeBroadcastId).toBeNull();

    // Verify tick does not spawn new broadcasts
    await schedulerService.tick();
    const broadcasts = await Broadcast.find({ automationId: automation._id });
    expect(broadcasts.length).toBe(3); // Exactly #1, #2, #3
  });

  describe('Scheduled Start 5-Minute Retry Engine', () => {
    let failingAuto;

    beforeEach(async () => {
      // Create an automation with a non-existent media file to trigger start/preflight failure
      failingAuto = await Automation.create({
        userId: user._id,
        name: 'Retry Verification Automation',
        facebookPageId: page._id,
        sourceType: 'VIDEO_FILE',
        // Omit mediaId to trigger preflight failure
        title: 'Retry Verification Stream',
        status: 'SCHEDULED',
        scheduledStartTime: new Date(),
        retryCount: 0,
        retryWindowStartedAt: null,
        nextRetryScheduledAt: null
      });
    });

    afterEach(async () => {
      if (failingAuto) {
        await Automation.deleteOne({ _id: failingAuto._id });
      }
    });

    test('Scheduled automation that fails to start keeps status SCHEDULED and health WARNING within 5 mins', async () => {
      await schedulerService._handleStartScheduled(failingAuto);

      const updated = await Automation.findById(failingAuto._id);
      expect(updated.status).toBe('SCHEDULED');
      expect(updated.healthStatus).toBe('WARNING');
      expect(updated.retryCount).toBe(1);
      expect(updated.retryWindowStartedAt).toBeDefined();
      expect(updated.nextRetryScheduledAt).toBeDefined();
      expect(new Date(updated.nextRetryScheduledAt).getTime()).toBeGreaterThan(Date.now());
      expect(updated.lastError).toContain('Retrying every');
    });

    test('Scheduler tick honors nextRetryScheduledAt before re-attempting', async () => {
      // Set initial retry state with future nextRetryScheduledAt (15s from now)
      const futureRetry = new Date(Date.now() + 15000);
      await Automation.updateOne(
        { _id: failingAuto._id },
        {
          $set: {
            retryCount: 1,
            retryWindowStartedAt: new Date(),
            nextRetryScheduledAt: futureRetry
          }
        }
      );

      // Tick runs while nextRetryScheduledAt is in future: should skip
      await schedulerService.tick();
      let doc = await Automation.findById(failingAuto._id);
      expect(doc.retryCount).toBe(1); // Not incremented yet

      // Now fast-forward nextRetryScheduledAt to past
      await Automation.updateOne(
        { _id: failingAuto._id },
        {
          $set: {
            nextRetryScheduledAt: new Date(Date.now() - 1000)
          }
        }
      );

      // Tick runs: should trigger scheduled retry and increment count
      await schedulerService.tick();
      doc = await Automation.findById(failingAuto._id);
      expect(doc.status).toBe('SCHEDULED');
      expect(doc.retryCount).toBe(2);
      expect(doc.healthStatus).toBe('WARNING');
    });

    test('Transitions to FAILED and ERROR only after 5-minute retry window expires', async () => {
      // Simulate 6 minutes having passed since retry window began
      const sixMinutesAgo = new Date(Date.now() - 360000);
      await Automation.updateOne(
        { _id: failingAuto._id },
        {
          $set: {
            retryCount: 10,
            retryWindowStartedAt: sixMinutesAgo,
            nextRetryScheduledAt: new Date(Date.now() - 1000)
          }
        }
      );

      const docBefore = await Automation.findById(failingAuto._id);
      await schedulerService._handleStartScheduled(docBefore);

      const docAfter = await Automation.findById(failingAuto._id);
      expect(docAfter.status).toBe('FAILED');
      expect(docAfter.healthStatus).toBe('ERROR');
      expect(docAfter.retryWindowStartedAt).toBeNull();
      expect(docAfter.nextRetryScheduledAt).toBeNull();
      expect(docAfter.lastError).toContain('Failed to start Facebook Live after 5 minutes of retries');
    });

    test('Recovers and clears retry state when broadcast successfully starts', async () => {
      // Update failingAuto to have valid media so it can start successfully
      await Automation.updateOne(
        { _id: failingAuto._id },
        {
          $set: {
            mediaId: media._id,
            retryCount: 3,
            retryWindowStartedAt: new Date(),
            nextRetryScheduledAt: new Date(Date.now() - 1000)
          }
        }
      );

      const validDoc = await Automation.findById(failingAuto._id);
      await schedulerService._handleStartScheduled(validDoc);

      const docAfter = await Automation.findById(failingAuto._id);
      expect(docAfter.status).toBe('LIVE');
      expect(docAfter.healthStatus).toBe('HEALTHY');
      expect(docAfter.retryCount).toBe(0);
      expect(docAfter.retryWindowStartedAt).toBeNull();
      expect(docAfter.nextRetryScheduledAt).toBeNull();

      // Clean up the broadcast spawned
      if (docAfter.activeBroadcastId) {
        await broadcastService.endBroadcast(docAfter.activeBroadcastId).catch(() => {});
      }
    });
  });
});
