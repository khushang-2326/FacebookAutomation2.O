'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const Camera = require('../models/Camera');
const User = require('../models/User');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const schedulerService = require('../services/schedulerService');
const ffmpegService = require('../services/ffmpegService');

let mongoServer;

describe('Camera Schedule Duration (Min/Sec) & Instant Zero-Disconnect Switching Test Suite', () => {
  let user, page, cam1, cam2;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Switch Test Admin',
      email: 'switch-test@live.dev',
      password: 'password123',
      role: 'admin'
    });

    const account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_fb_user_switch',
      name: 'Switch FB Account',
      isMock: true
    });
    account.setAccessToken('mock_access_token_switch');
    await account.save();

    page = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'page_cam_switch_1',
      name: 'CCTV Switch Test Page',
      category: 'Security',
      isMock: true,
      isValid: true,
      streamType: 'STREAM_KEY'
    });
    page.setPageAccessToken('live_pk_test_switch_page');
    await page.save();

    cam1 = new Camera({
      userId: user._id,
      name: 'Main Entrance Camera',
      ipAddress: '192.168.1.101',
      rtspPort: 554,
      streamPath: '/ch0',
      sourceType: 'RTSP_CAMERA',
      connectionStatus: 'ONLINE'
    });
    cam1.setRtspUrl('rtsp://192.168.1.101:554/ch0');
    await cam1.save();

    cam2 = new Camera({
      userId: user._id,
      name: 'Backyard Perimeter Camera',
      ipAddress: '192.168.1.102',
      rtspPort: 554,
      streamPath: '/ch0',
      sourceType: 'RTSP_CAMERA',
      connectionStatus: 'ONLINE'
    });
    cam2.setRtspUrl('rtsp://192.168.1.102:554/ch0');
    await cam2.save();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(() => {
    schedulerService.stop();
    ffmpegService.activeProcesses.clear();
  });

  // TEST 1: Two cameras configured with 20 seconds each
  test('Test 1: Two cameras at 20s each cycle sequentially and loop back', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: '20s Dual Camera Cycling',
      title: '20s Dual Camera Cycling Feed',
      sourceType: 'RTSP_CAMERA',
      destinationPlatform: 'FACEBOOK',
      facebookPageId: page._id,
      status: 'LIVE',
      currentCameraSlotIndex: 0,
      cameraStreamStartedAt: new Date(Date.now() - 21000), // 21s elapsed
      rotationDurationSec: 17400,
      nextRotationScheduledAt: new Date(Date.now() + 17400000),
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Cam 1', durationSeconds: 20, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, cameraName: 'Cam 2', durationSeconds: 20, order: 1 }
      ]
    });

    const mockBroadcast = await Broadcast.create({
      automationId: auto._id,
      facebookPageId: page._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_test1',
      fbLiveVideoId: 'mock_vid_test1',
      actualStartTime: new Date()
    });
    auto.activeBroadcastId = mockBroadcast._id;
    await auto.save();

    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true, code: 0, reply: '0 Error number 0' })
    };
    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      isMultiCamera: true,
      zmqPort: 62010,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    // 1st cycle: 21s elapsed on slot 0 -> switch to slot 1
    await schedulerService.tick();
    let updatedAuto = await Automation.findById(auto._id);
    expect(updatedAuto.currentCameraSlotIndex).toBe(1);
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '1');

    // 2nd cycle: 21s elapsed on slot 1 -> loops back to slot 0
    updatedAuto.cameraStreamStartedAt = new Date(Date.now() - 21000);
    await updatedAuto.save();

    await schedulerService.tick();
    updatedAuto = await Automation.findById(auto._id);
    expect(updatedAuto.currentCameraSlotIndex).toBe(0);
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '0');
  });

  // TEST 2: Two cameras configured with 300 seconds (5 minutes) each
  test('Test 2: Two cameras at 300s each stay on active camera at 120s and switch only at 300s', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: '5-Minute Camera Rotation',
      title: '5-Minute Camera Rotation Feed',
      sourceType: 'RTSP_CAMERA',
      destinationPlatform: 'FACEBOOK',
      facebookPageId: page._id,
      status: 'LIVE',
      currentCameraSlotIndex: 0,
      cameraStreamStartedAt: new Date(Date.now() - 120000), // 120s elapsed
      rotationDurationSec: 17400,
      nextRotationScheduledAt: new Date(Date.now() + 17400000),
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Cam 1', durationSeconds: 300, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, cameraName: 'Cam 2', durationSeconds: 300, order: 1 }
      ]
    });

    const mockBroadcast = await Broadcast.create({
      automationId: auto._id,
      facebookPageId: page._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_test2',
      fbLiveVideoId: 'mock_vid_test2',
      actualStartTime: new Date()
    });
    auto.activeBroadcastId = mockBroadcast._id;
    await auto.save();

    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true, code: 0, reply: '0 Error number 0' })
    };
    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      isMultiCamera: true,
      zmqPort: 62011,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    // Check at 120s: should NOT switch
    await schedulerService.tick();
    let updatedAuto = await Automation.findById(auto._id);
    expect(updatedAuto.currentCameraSlotIndex).toBe(0);
    expect(mockZmqClient.sendCommand).not.toHaveBeenCalled();

    // Check at 300s: should switch to slot 1
    updatedAuto.cameraStreamStartedAt = new Date(Date.now() - 300000);
    await updatedAuto.save();

    await schedulerService.tick();
    updatedAuto = await Automation.findById(auto._id);
    expect(updatedAuto.currentCameraSlotIndex).toBe(1);
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '1');
  });

  // TEST 3: Schedule input with 5 minutes 30 seconds -> 330 seconds
  test('Test 3: Schedule input with 5 min 30 sec converts correctly to 330 seconds', async () => {
    const minutes = 5;
    const seconds = 30;
    const totalSeconds = (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
    expect(totalSeconds).toBe(330);

    const auto = await Automation.create({
      userId: user._id,
      name: '5m 30s Schedule Test',
      title: '5m 30s Schedule Test Feed',
      sourceType: 'RTSP_CAMERA',
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Cam 1', durationSeconds: totalSeconds, order: 0 }
      ]
    });

    const savedAuto = await Automation.findById(auto._id);
    expect(savedAuto.cameraSchedules[0].durationSeconds).toBe(330);

    // Verify reverse calculation for frontend display
    const durSec = savedAuto.cameraSchedules[0].durationSeconds;
    const displayMin = Math.floor(durSec / 60);
    const displaySec = durSec % 60;
    expect(displayMin).toBe(5);
    expect(displaySec).toBe(30);
  });

  // TEST 4: Manual instant camera switch via ZMQ without restarting FFmpeg
  test('Test 4: Manual instant camera switch sends ZMQ map command without process restart', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: 'Manual Switch Automation',
      title: 'Manual Switch Live Feed',
      sourceType: 'RTSP_CAMERA',
      currentCameraSlotIndex: 0
    });

    const mockBroadcast = await Broadcast.create({
      userId: user._id,
      automationId: auto._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_test4',
      fbLiveVideoId: 'mock_vid_test4'
    });

    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true, code: 0, reply: '0 Error number 0 occurred' })
    };

    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      pid: 99991,
      isMultiCamera: true,
      zmqPort: 62012,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    const result = await ffmpegService.switchCameraInPlace(mockBroadcast._id.toString(), 1);
    expect(result.success).toBe(true);
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '1');
    expect(ffmpegService.activeProcesses.get(mockBroadcast._id.toString()).pid).toBe(99991); // PID unchanged!
  });

  // TEST 5: ZMQ failure handling returns safe error and does not report false success
  test('Test 5: ZMQ connection or command error returns clean error without false success', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: 'ZMQ Error Automation',
      title: 'ZMQ Error Live Feed',
      sourceType: 'RTSP_CAMERA',
      currentCameraSlotIndex: 0
    });

    const mockBroadcast = await Broadcast.create({
      userId: user._id,
      automationId: auto._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_test5',
      fbLiveVideoId: 'mock_vid_test5'
    });

    const mockZmqClient = {
      sendCommand: jest.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:62015'))
    };

    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      pid: 99992,
      isMultiCamera: true,
      zmqPort: 62013,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    const result = await ffmpegService.switchCameraInPlace(mockBroadcast._id.toString(), 1);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED|failed/i);
  });

  // TEST 6: Rapid repeated switching prevents race conditions
  test('Test 6: Rapid repeated switching handles concurrent requests gracefully', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: 'Rapid Switch Automation',
      title: 'Rapid Switch Live Feed',
      sourceType: 'RTSP_CAMERA',
      currentCameraSlotIndex: 0
    });

    const mockBroadcast = await Broadcast.create({
      userId: user._id,
      automationId: auto._id,
      status: 'LIVE',
      streamUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/live_test6',
      fbLiveVideoId: 'mock_vid_test6'
    });

    let callCount = 0;
    const mockZmqClient = {
      sendCommand: jest.fn().mockImplementation(async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 50));
        return { success: true, code: 0, reply: '0 Error number 0' };
      })
    };

    ffmpegService.activeProcesses.set(mockBroadcast._id.toString(), {
      pid: 99993,
      isMultiCamera: true,
      zmqPort: 62014,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 3,
      scheduleToUniqueInputIndex: [0, 1, 2]
    });

    const promises = [
      ffmpegService.switchCameraInPlace(mockBroadcast._id.toString(), 1),
      ffmpegService.switchCameraInPlace(mockBroadcast._id.toString(), 2)
    ];

    const results = await Promise.all(promises);
    expect(results.some(r => r.success === true)).toBe(true);
  });

  // TEST 7: Multi-destination Facebook + YouTube switching preservation
  test('Test 7: Multi-destination output args preserve both Facebook and YouTube targets with onfail=ignore', () => {
    const targets = [
      'rtmps://live-api-s.facebook.com:443/rtmp/FB-STREAM-KEY',
      'rtmp://a.rtmp.youtube.com/live2/YT-STREAM-KEY'
    ];
    const outArgs = ffmpegService._formatOutputArgs(targets);
    expect(outArgs).toContain('-f');
    expect(outArgs).toContain('tee');
    const teeString = outArgs[outArgs.indexOf('tee') + 1];
    expect(teeString).toContain('FB-STREAM-KEY');
    expect(teeString).toContain('YT-STREAM-KEY');
    expect(teeString).toContain('onfail=ignore');
  });

  // TEST 8: CCTV (Slot 1) + Webcam (Slot 2) maintains user-defined slot order and maps to input 0 (CCTV)
  test('Test 8: CCTV (Slot 1) + Webcam (Slot 2) starts with CCTV as input 0 and maps initial streamselect to input 0', () => {
    const cameraSources = [
      {
        type: 'RTSP',
        name: 'Main Entrance CCTV',
        targetInputUrl: 'rtsp://127.0.0.1:8554/live_cctv1',
        durationSeconds: 20
      },
      {
        type: 'WEBCAM',
        name: 'USB Webcam Slot 2',
        deviceName: 'Integrated Camera',
        durationSeconds: 20
      }
    ];

    const buildMeta = {};
    const args = ffmpegService.buildMultiCameraArgs(cameraSources, 'rtmps://live-api-s.facebook.com:443/rtmp/testkey', {
      initialSlotIndex: 0,
      zmqPort: 62055,
      meta: buildMeta
    });

    expect(buildMeta.scheduleToUniqueInputIndex).toEqual([0, 1]);
    expect(buildMeta.numUniqueInputs).toBe(2);

    const filterIdx = args.indexOf('-filter_complex');
    expect(filterIdx).toBeGreaterThan(-1);
    const filterComplex = args[filterIdx + 1];

    // Verify streamselect starts with map=0 (Slot 0 / CCTV)
    expect(filterComplex).toContain('streamselect@camselect=inputs=2:map=0');

    // Verify input 0 is RTSP and input 1 is DirectShow (Webcam)
    const iIndices = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-i') iIndices.push(args[i + 1]);
    }
    expect(iIndices[0]).toBe('rtsp://127.0.0.1:8554/live_cctv1');
    expect(iIndices[1]).toContain('video=');
  });

  // TEST 9: Webcam (Slot 1) + CCTV (Slot 2) starts with Webcam as input 0 (NO hardcoded CCTV first)
  test('Test 9: Webcam (Slot 1) + CCTV (Slot 2) starts with Webcam as input 0 and maps initial streamselect to input 0', () => {
    const cameraSources = [
      {
        type: 'WEBCAM',
        name: 'USB Webcam Slot 1',
        deviceName: 'Integrated Camera',
        durationSeconds: 20
      },
      {
        type: 'RTSP',
        name: 'Main Entrance CCTV',
        targetInputUrl: 'rtsp://127.0.0.1:8554/live_cctv1',
        durationSeconds: 20
      }
    ];

    const buildMeta = {};
    const args = ffmpegService.buildMultiCameraArgs(cameraSources, 'rtmps://live-api-s.facebook.com:443/rtmp/testkey', {
      initialSlotIndex: 0,
      zmqPort: 62056,
      meta: buildMeta
    });

    expect(buildMeta.scheduleToUniqueInputIndex).toEqual([0, 1]);
    expect(buildMeta.numUniqueInputs).toBe(2);

    const filterIdx = args.indexOf('-filter_complex');
    expect(filterIdx).toBeGreaterThan(-1);
    const filterComplex = args[filterIdx + 1];

    // Verify streamselect starts with map=0 (Slot 0 / Webcam)
    expect(filterComplex).toContain('streamselect@camselect=inputs=2:map=0');

    // Verify input 0 is DirectShow (Webcam) and input 1 is RTSP (CCTV)
    const iIndices = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-i') iIndices.push(args[i + 1]);
    }
    expect(iIndices[0]).toContain('video=');
    expect(iIndices[1]).toBe('rtsp://127.0.0.1:8554/live_cctv1');
  });

  // TEST 10: startStream executes with multi-camera schedule without isMultiCamSchedule reference error
  test('Test 10: startStream does not throw ReferenceError for isMultiCamSchedule', async () => {
    const auto = await Automation.create({
      userId: user._id,
      name: 'Multi-Cam Reference Test',
      title: 'Multi-Cam Reference Feed',
      sourceType: 'RTSP_CAMERA',
      currentCameraSlotIndex: 0,
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, durationSeconds: 20, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, durationSeconds: 20, order: 1 }
      ]
    });

    const mockBroadcast = await Broadcast.create({
      userId: user._id,
      automationId: auto._id,
      status: 'CREATING_BROADCAST',
      streamUrl: 'mock://live-api-s.facebook.com:443/rtmp/mock_multi',
      fbLiveVideoId: 'mock_vid_multi_ref'
    });

    const multiMediaOrCamera = {
      isMultiCamera: true,
      cameraSchedules: [
        { type: 'RTSP', name: 'Cam 1', targetInputUrl: 'rtsp://127.0.0.1:8554/live_1', durationSeconds: 20 },
        { type: 'RTSP', name: 'Cam 2', targetInputUrl: 'rtsp://127.0.0.1:8554/live_2', durationSeconds: 20 }
      ],
      currentSlotIndex: 0,
      filename: 'Multi-Camera (2 cameras)'
    };

    // In mock mode, startStream should resolve without throwing ReferenceError: isMultiCamSchedule is not defined
    await expect(ffmpegService.startStream(mockBroadcast, auto, multiMediaOrCamera, 'mock://live-api-s.facebook.com:443/rtmp/mock_multi'))
      .resolves.toBeDefined();
  });
});
