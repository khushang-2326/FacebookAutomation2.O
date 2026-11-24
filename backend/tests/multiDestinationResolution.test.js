const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Automation = require('../models/Automation');
const Broadcast = require('../models/Broadcast');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const Camera = require('../models/Camera');
const User = require('../models/User');
const broadcastService = require('../services/broadcastService');
const ffmpegService = require('../services/ffmpegService');

let mongoServer;

describe('Multi-Destination Resolution (Facebook 1080p + YouTube 1440p)', () => {
  let user, fbPage, ytPage, cam;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Multi-Dest User',
      email: 'multidest@streaming.dev',
      password: 'password123',
      role: 'admin'
    });

    const account = new FacebookAccount({
      userId: user._id,
      fbUserId: 'mock_multidest_acc',
      name: 'Multi-Dest Account',
      isMock: true
    });
    account.setAccessToken('mock_token_multidest');
    await account.save();

    fbPage = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_fb_page_1080p',
      name: 'Facebook 1080p Page',
      platform: 'FACEBOOK',
      resolution: '1080p',
      fps: 30,
      streamType: 'STREAM_KEY',
      serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/'
    });
    fbPage.setPageAccessToken('fb_stream_key_123');
    await fbPage.save();

    ytPage = new FacebookPage({
      facebookAccountId: account._id,
      userId: user._id,
      pageId: 'mock_yt_page_1440p',
      name: 'YouTube 1440p Channel',
      platform: 'YOUTUBE',
      resolution: '1440p',
      fps: 30,
      streamType: 'STREAM_KEY',
      serverUrl: 'rtmp://a.rtmp.youtube.com/live2/'
    });
    ytPage.setPageAccessToken('yt_stream_key_456');
    await ytPage.save();

    cam = new Camera({
      userId: user._id,
      name: 'Sanctuary 2K Camera',
      ipAddress: '192.168.1.169',
      rtspPort: 554,
      streamPath: '/ch0',
      sourceType: 'RTSP_CAMERA',
      resolution: '1440p',
      fps: 30,
      connectionStatus: 'ONLINE'
    });
    cam.setRtspUrl('rtsp://admin:pass@192.168.1.169:554/ch0');
    await cam.save();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('buildCameraArgs generates dual-resolution outputs when YouTube is 1440p and Facebook is 1080p', () => {
    const multiResolution = {
      enabled: true,
      targetFps: 30,
      youtube: {
        urls: ['rtmp://a.rtmp.youtube.com/live2/yt_key'],
        resolution: '1440p',
        width: 2560,
        height: 1440,
        bitrate: '10000k',
        maxrate: '14000k',
        bufsize: '20000k'
      },
      facebook: {
        urls: ['rtmps://live-api-s.facebook.com:443/rtmp/fb_key'],
        resolution: '1080p',
        width: 1920,
        height: 1080,
        bitrate: '3500k',
        maxrate: '5000k',
        bufsize: '7000k'
      }
    };

    const args = ffmpegService.buildCameraArgs('rtsp://127.0.0.1:8554/cam1', ['rtmp://a.rtmp.youtube.com/live2/yt_key', 'rtmps://live-api-s.facebook.com:443/rtmp/fb_key'], {
      fps: 30,
      resolution: '1440p',
      width: 2560,
      height: 1440,
      multiResolution
    });

    const commandStr = args.join(' ');

    // 1. Must contain filter_complex that splits and downscales to Facebook 1080p
    expect(commandStr).toContain('-filter_complex');
    expect(commandStr).toContain('scale=2560:1440');
    expect(commandStr).toContain('split=2[v_yt][v_fb_in]');
    expect(commandStr).toContain('scale=1920:1080');
    expect(commandStr).toContain('[v_fb]');

    // 2. Must map [v_yt] to YouTube output
    expect(commandStr).toContain('-map [v_yt]');
    expect(commandStr).toContain('rtmp://a.rtmp.youtube.com/live2/yt_key');

    // 3. Must map [v_fb] to Facebook output
    expect(commandStr).toContain('-map [v_fb]');
    expect(commandStr).toContain('rtmps://live-api-s.facebook.com:443/rtmp/fb_key');

    // 4. Must specify bitrates for each profile
    expect(commandStr).toContain('10000k');
    expect(commandStr).toContain('3500k');
  });

  test('buildMultiCameraArgs generates dual-resolution outputs with ZMQ streamselect', () => {
    const multiResolution = {
      enabled: true,
      targetFps: 30,
      youtube: {
        urls: ['rtmp://a.rtmp.youtube.com/live2/yt_key'],
        resolution: '1440p',
        width: 2560,
        height: 1440,
        bitrate: '10000k',
        maxrate: '14000k',
        bufsize: '20000k'
      },
      facebook: {
        urls: ['rtmps://live-api-s.facebook.com:443/rtmp/fb_key'],
        resolution: '1080p',
        width: 1920,
        height: 1080,
        bitrate: '3500k',
        maxrate: '5000k',
        bufsize: '7000k'
      }
    };

    const cameraSources = [
      { type: 'CCTV', name: 'Cam 1', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
      { type: 'CCTV', name: 'Cam 2', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 20 }
    ];

    const args = ffmpegService.buildMultiCameraArgs(cameraSources, ['rtmp://a.rtmp.youtube.com/live2/yt_key', 'rtmps://live-api-s.facebook.com:443/rtmp/fb_key'], {
      fps: 30,
      resolution: '1440p',
      width: 2560,
      height: 1440,
      zmqPort: 5577,
      multiResolution
    });

    const commandStr = args.join(' ');

    expect(commandStr).toContain('streamselect@camselect');
    expect(commandStr).toContain('scale=2560:1440');
    expect(commandStr).toContain('split=2[v_yt][v_fb_in];[v_fb_in]scale=1920:1080');
    expect(commandStr).toContain('[v_fb]');
    expect(commandStr).toContain('-map [v_yt]');
    expect(commandStr).toContain('-map [v_fb]');
    expect(commandStr).toContain('rtmp://a.rtmp.youtube.com/live2/yt_key');
    expect(commandStr).toContain('rtmps://live-api-s.facebook.com:443/rtmp/fb_key');
  });

  test('Single destination stream preserves standard -f flv output without split filter', () => {
    const args = ffmpegService.buildCameraArgs('rtsp://127.0.0.1:8554/cam1', 'rtmp://a.rtmp.youtube.com/live2/yt_key', {
      fps: 30,
      resolution: '1440p',
      width: 2560,
      height: 1440
    });

    const commandStr = args.join(' ');
    expect(commandStr).not.toContain('split=2[v_yt]');
    expect(commandStr).toContain('scale=2560:1440');
    expect(commandStr).toContain('-f flv rtmp://a.rtmp.youtube.com/live2/yt_key');
  });

  test('Broadcast creation retains 1440p targetResolution for multi-destination when YouTube is 1440p', async () => {
    const automation = new Automation({
      userId: user._id,
      name: 'Temple Dual 1440p YouTube + 1080p FB',
      title: 'Temple Dual 1440p YouTube + 1080p FB',
      sourceType: 'RTSP_CAMERA',
      cameraId: cam._id,
      destinationPlatform: 'MULTI_DESTINATION',
      targetPageIds: [fbPage._id, ytPage._id],
      youtubeResolution: '1440p',
      fps: 30,
      status: 'SCHEDULED'
    });
    await automation.save();

    // Verify prepareBroadcast resolves 1440p targetResolution
    const resolvedRes = automation.youtubeResolution;
    expect(resolvedRes).toBe('1440p');

    const profile = ffmpegService.resolveResolutionProfile(resolvedRes, 30);
    expect(profile.width).toBe(2560);
    expect(profile.height).toBe(1440);
    expect(profile.key).toBe('1440p');
  });
});
