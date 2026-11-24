const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const Media = require('../models/Media');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const StreamProcess = require('../models/StreamProcess');
const schedulerService = require('../services/schedulerService');

let mongoServer;

describe('Crash & Orphan State Recovery', () => {
  let user, page, media, automation, broadcast, streamProc;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Recovery User',
      email: 'recovery@test.dev',
      password: 'password123'
    });

    const account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_recovery_fb_user',
      name: 'Recovery FB Account',
      isMock: true
    });
    account.setAccessToken('mock_token');
    await account.save();

    page = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_recovery_page',
      name: 'Recovery Page',
      isMock: true
    });
    page.setPageAccessToken('mock_page_token');
    await page.save();

    media = await Media.create({
      userId: user._id,
      filename: 'video.mp4',
      originalName: 'Recovery.mp4',
      filePath: '/tmp/recovery.mp4',
      mimeType: 'video/mp4',
      mediaType: 'VIDEO',
      fileSizeBytes: 1000
    });

    // Create orphaned broadcast with dead PID
    broadcast = await Broadcast.create({
      automationId: new mongoose.Types.ObjectId(),
      facebookPageId: page._id,
      fbLiveVideoId: 'mock_dead_fb_live_123',
      streamUrl: 'rtmps://mock-live-api-s.facebook.com/rtmp/dead',
      status: 'LIVE',
      rotationIndex: 1,
      scheduledStartTime: new Date()
    });

    // Create orphaned dead process
    streamProc = await StreamProcess.create({
      broadcastId: broadcast._id,
      automationId: broadcast.automationId,
      pid: 99999999, // Impossible dead PID
      status: 'RUNNING'
    });

    // Create orphaned LIVE automation
    automation = await Automation.create({
      _id: broadcast.automationId,
      userId: user._id,
      name: 'Orphaned Live Stream',
      facebookPageId: page._id,
      mediaId: media._id,
      title: 'Crash Recovery Stream',
      status: 'LIVE',
      activeBroadcastId: broadcast._id
    });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('Startup reconciliation marks dead broadcast as CRASHED and pauses automation safely', async () => {
    await schedulerService.reconcileStartupState();

    const reconciledBroadcast = await Broadcast.findById(broadcast._id);
    expect(reconciledBroadcast.status).toBe('CRASHED');
    expect(reconciledBroadcast.errorMessage).toContain('Recovered after server restart');

    const reconciledProc = await StreamProcess.findById(streamProc._id);
    expect(reconciledProc.status).toBe('CRASHED');

    const reconciledAuto = await Automation.findById(automation._id);
    expect(reconciledAuto.status).toBe('PAUSED');
    expect(reconciledAuto.healthStatus).toBe('WARNING');
    expect(reconciledAuto.lastError).toContain('Recovered from unexpected shutdown');
  });
});
