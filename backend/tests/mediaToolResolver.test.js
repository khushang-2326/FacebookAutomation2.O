const { mediaToolResolver, ErrorCodes } = require('../services/mediaToolResolver');

describe('Central Media Tool Resolver (mediaToolResolver.js)', () => {
  beforeEach(() => {
    // Clear caches before each test
    mediaToolResolver._ffmpegCache = null;
    mediaToolResolver._ffprobeCache = null;
  });

  test('Resolves valid FFmpeg executable and version', () => {
    const status = mediaToolResolver.resolveFFmpeg(true);
    expect(status).toBeDefined();
    expect(status.available).toBe(true);
    expect(status.path).toBeDefined();
    expect(typeof status.path).toBe('string');
    expect(status.version).toBeDefined();
  });

  test('Resolves valid FFprobe executable and version', () => {
    const status = mediaToolResolver.resolveFFprobe(true);
    expect(status).toBeDefined();
    expect(status.available).toBe(true);
    expect(status.path).toBeDefined();
    expect(typeof status.path).toBe('string');
    expect(status.version).toBeDefined();
  });

  test('getFFmpegPath() returns verified executable path', () => {
    const ffmpegPath = mediaToolResolver.getFFmpegPath();
    expect(ffmpegPath).not.toBe('ffmpeg');
    expect(ffmpegPath).toContain('ffmpeg.exe');
  });

  test('getFFprobePath() returns verified executable path', () => {
    const ffprobePath = mediaToolResolver.getFFprobePath();
    expect(ffprobePath).not.toBe('ffprobe');
    expect(ffprobePath).toContain('ffprobe.exe');
  });

  test('getHealthStatus() returns comprehensive media engine readiness', () => {
    const health = mediaToolResolver.getHealthStatus(true);
    expect(health).toBeDefined();
    expect(health.mediaEngineReady).toBe(true);
    expect(health.ffmpeg.available).toBe(true);
    expect(health.ffprobe.available).toBe(true);
    expect(health.system.platform).toBe(process.platform);
  });

  test('categorizeError correctly maps ENOENT to FFPROBE_NOT_FOUND', () => {
    const err = new Error('spawn ffprobe ENOENT');
    const cat = mediaToolResolver.categorizeError(err);
    expect(cat.errorCode).toBe(ErrorCodes.FFPROBE_NOT_FOUND);
    expect(cat.userMessage).toBe('Video Analysis Engine Unavailable');
  });

  test('categorizeError correctly maps 401 to RTSP_AUTH_FAILED', () => {
    const err = new Error('Server returned 401 Unauthorized');
    const cat = mediaToolResolver.categorizeError(err);
    expect(cat.errorCode).toBe(ErrorCodes.RTSP_AUTH_FAILED);
    expect(cat.userMessage).toBe('Camera Authentication Failed');
  });

  test('categorizeError correctly maps timeout to RTSP_CONNECTION_FAILED', () => {
    const err = new Error('Connection refused / etimeout');
    const cat = mediaToolResolver.categorizeError(err);
    expect(cat.errorCode).toBe(ErrorCodes.RTSP_CONNECTION_FAILED);
    expect(cat.userMessage).toBe('Camera Unreachable');
  });

  test('maskRtspUrl safely hides credentials', () => {
    const rawUrl = 'rtsp://admin:SECRET_PASSWORD_123@192.168.1.55:554/live/0/MAIN';
    const masked = mediaToolResolver.maskRtspUrl(rawUrl);
    expect(masked).toBe('rtsp://admin:********@192.168.1.55:554/live/0/MAIN');
    expect(masked).not.toContain('SECRET_PASSWORD_123');
  });
});
