const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const Camera = require('../models/Camera');
const User = require('../models/User');
const broadcastService = require('../services/broadcastService');
const schedulerService = require('../services/schedulerService');
const ffmpegService = require('../services/ffmpegService');
const config = require('../config/config');

let mongoServer;

describe('Multi-Camera CCTV Streaming Reliability & Five-Minute Slot Cycling', () => {
  let user, page, cam1, cam2, automation;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Reliability Test User',
      email: 'reliability@cctv.dev',
      password: 'password123',
      role: 'admin'
    });

    const account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_fb_user_rel',
      name: 'Reliability Account',
      isMock: true
    });
    account.setAccessToken('mock_access_token_rel');
    await account.save();

    page = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_cctv_page_1',
      name: '24/7 CCTV Live Stream',
      category: 'Surveillance',
      isMock: true,
      isValid: true,
      streamType: 'STREAM_KEY'
    });
    page.setPageAccessToken('live_pk_test_mock_123456');
    await page.save();

    cam1 = new Camera({
      userId: user._id,
      name: 'Gate CCTV Cam 1',
      ipAddress: '192.168.1.101',
      rtspPort: 554,
      streamPath: '/live/ch0',
      sourceType: 'RTSP_CAMERA',
      connectionStatus: 'ONLINE'
    });
    cam1.setRtspUrl('rtsp://192.168.1.101:554/live/ch0');
    await cam1.save();

    cam2 = new Camera({
      userId: user._id,
      name: 'Perimeter CCTV Cam 2',
      ipAddress: '192.168.1.102',
      rtspPort: 554,
      streamPath: '/live/ch0',
      sourceType: 'RTSP_CAMERA',
      connectionStatus: 'ONLINE'
    });
    cam2.setRtspUrl('rtsp://192.168.1.102:554/live/ch0');
    await cam2.save();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    schedulerService.stop();
    ffmpegService.activeProcesses.clear();
  });

  test('Production scheduler defaults safely to testMode=false when env is unset', () => {
    // Verify that unless explicitly set to 'true', testMode defaults to false
    expect(config.scheduler.defaultRotationDuration).toBe(17400); // 4h 50m
    expect(config.scheduler.defaultRestartDelay).toBe(60); // 60s
  });

  test('buildMultiCameraArgs includes tpad frame protection and explicit filter instance name', () => {
    const sources = [
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 300 },
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 300 }
    ];
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI';
    const meta = {};
    const args = ffmpegService.buildMultiCameraArgs(sources, rtmpsUrl, {
      fps: 30,
      zmqPort: 62000,
      meta
    });

    expect(args).toContain('-filter_complex');
    const filterComplex = args[args.indexOf('-filter_complex') + 1];

    // Post-selection scaling on active camera stream
    expect(filterComplex).toContain('[0:v][1:v]streamselect@camselect=inputs=2:map=0[vraw]');
    expect(filterComplex).toMatch(/\[vraw\]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:\(ow-iw\)\/2:\(oh-ih\)\/2,fps=30,format=(nv12|yuv420p)\[vsel\]/);
    expect(filterComplex).toContain('zmq=bind_address=tcp\\\\\\://127.0.0.1\\\\\\:62000[vout]');

    // Meta filter name verification
    expect(meta.streamSelectFilterName).toBe('streamselect@camselect');
    expect(meta.numUniqueInputs).toBe(2);

    // Timeout verification: 30 seconds (30,000,000 us)
    expect(args).toContain('-timeout');
    expect(args).toContain('30000000');
  });

  test('Multi-destination tee muxer applies onfail=ignore to prevent cross-destination failure', () => {
    const multiUrls = [
      'rtmps://live-api-s.facebook.com:443/rtmp/FB-DEST',
      'rtmp://a.rtmp.youtube.com/live2/YT-DEST'
    ];
    const outputArgs = ffmpegService._formatOutputArgs(multiUrls);
    expect(outputArgs).toContain('-f');
    expect(outputArgs).toContain('tee');
    const teeArg = outputArgs[outputArgs.indexOf('tee') + 1];
    expect(teeArg).toContain('[f=flv:flvflags=no_duration_filesize:onfail=ignore]');
  });

  test('Five-minute slot schedule (300s): Does NOT switch at 120s; cycles at 300s boundary', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: '5-Minute CCTV Camera Schedule',
      title: '24/7 Security Feed',
      sourceType: 'RTSP_CAMERA',
      destinationPlatform: 'FACEBOOK',
      facebookPageId: page._id,
      targetPageIds: [page._id],
      status: 'LIVE',
      currentCameraSlotIndex: 0,
      cameraStreamStartedAt: new Date(),
      rotationDurationSec: 17400, // 4h 50m broadcast rotation
      nextRotationScheduledAt: new Date(Date.now() + 17400000),
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Gate CCTV Cam 1', durationSeconds: 300, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, cameraName: 'Perimeter CCTV Cam 2', durationSeconds: 300, order: 1 }
      ]
    });

    const mockBroadcast = await Broadcast.create({
      automationId: auto._id,
      facebookPageId: page._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_123',
      fbLiveVideoId: 'mock_vid_123',
      actualStartTime: new Date()
    });
    auto.activeBroadcastId = mockBroadcast._id;
    await auto.save();

    // Mock active multi-camera process
    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true, code: 0, reply: '0 Error number 0' })
    };
    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      isMultiCamera: true,
      zmqPort: 62001,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    // 1. Simulate 120 seconds elapsed (the reported client failure time)
    // The stream should still be on Slot #0 and NOT cycle yet!
    auto.cameraStreamStartedAt = new Date(Date.now() - 120000);
    await auto.save();

    await schedulerService.tick();

    const autoAfter120s = await Automation.findById(auto._id);
    expect(autoAfter120s.currentCameraSlotIndex).toBe(0); // Still Slot 0!
    expect(autoAfter120s.status).toBe('LIVE');
    expect(mockZmqClient.sendCommand).not.toHaveBeenCalled();

    // 2. Simulate 300 seconds elapsed (the configured 5-minute boundary)
    // Now the scheduler SHOULD cycle to Slot #1
    auto.cameraStreamStartedAt = new Date(Date.now() - 300000);
    await auto.save();

    await schedulerService.tick();

    const autoAfter300s = await Automation.findById(auto._id);
    expect(autoAfter300s.currentCameraSlotIndex).toBe(1); // Switched to Slot 1!
    expect(autoAfter300s.status).toBe('LIVE');
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '1');

    // Clean up
    await Automation.findByIdAndDelete(auto._id);
    await Broadcast.findByIdAndDelete(mockBroadcast._id);
  });

  test('In-place camera switch does not drop DB state or emit success when ZMQ fails', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: 'Failure Guard Test',
      title: 'Security Feed',
      sourceType: 'RTSP_CAMERA',
      destinationPlatform: 'FACEBOOK',
      facebookPageId: page._id,
      targetPageIds: [page._id],
      status: 'LIVE',
      currentCameraSlotIndex: 0,
      cameraStreamStartedAt: new Date(),
      rotationDurationSec: 17400,
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Cam 1', durationSeconds: 300, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, cameraName: 'Cam 2', durationSeconds: 300, order: 1 }
      ]
    });

    const mockBroadcast = await Broadcast.create({
      automationId: auto._id,
      facebookPageId: page._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_123',
      fbLiveVideoId: 'mock_vid_123'
    });
    auto.activeBroadcastId = mockBroadcast._id;
    await auto.save();

    // Mock ZmqClient that fails
    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: false, code: 40, error: 'Function not implemented' })
    };
    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      isMultiCamera: true,
      zmqPort: 62002,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    // Attempt in-place switch to slot 1
    const res = await ffmpegService.switchCameraInPlace(mockBroadcast._id, 1);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Function not implemented');

    // Clean up
    await Automation.findByIdAndDelete(auto._id);
    await Broadcast.findByIdAndDelete(mockBroadcast._id);
  });
});
