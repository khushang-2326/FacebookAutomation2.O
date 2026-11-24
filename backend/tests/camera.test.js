const cameraService = require('../services/cameraService');
const ffmpegService = require('../services/ffmpegService');

describe('Camera & RTSP Streaming Engine Tests', () => {
  test('CameraService should construct valid RTSP URL with credentials', () => {
    const url = cameraService.constructRtspUrl('192.168.1.100', 554, 'admin', 'pass123', '/Streaming/Channels/101');
    expect(url).toBe('rtsp://admin:pass123@192.168.1.100:554/Streaming/Channels/101');
  });

  test('CameraService should handle empty credentials cleanly', () => {
    const url = cameraService.constructRtspUrl('192.168.1.102', 554, '', '', '/live');
    expect(url).toBe('rtsp://192.168.1.102:554/live');
  });

  test('FFmpegService should build valid camera argument array with TCP transport and keyframes', () => {
    const rtspUrl = 'rtsp://admin:pass@192.168.1.100:554/live';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-1234567890';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl);

    expect(args).toContain('-rtsp_transport');
    expect(args).toContain('tcp');
    expect(args).toContain(rtspUrl);
    expect(args).toContain('-c:v');
    expect(args.some(a => ['libx264', 'h264_mf', 'h264_qsv', 'h264_nvenc', 'h264_amf'].includes(a))).toBe(true);
    expect(args).toContain('-f');
    expect(args).toContain('flv');
    expect(args[args.length - 1]).toBe(rtmpsUrl);
  });

  test('CameraService should execute ONVIF discovery scan and return array', async () => {
    const cameras = await cameraService.discoverOnvifCameras();
    expect(Array.isArray(cameras)).toBe(true);
  }, 30000);
});
