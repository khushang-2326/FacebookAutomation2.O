const mediamtxService = require('../services/mediamtxService');
const ffmpegService = require('../services/ffmpegService');

describe('MediaMTX Single Camera Ingestion Engine Tests', () => {
  test('MediaMTXService should resolve RTSP URL for channel /ch1', () => {
    const url = mediamtxService.getRtspUrl('/ch1');
    expect(url).toBe('rtsp://127.0.0.1:8554/ch1');
  });

  test('MediaMTXService should validate stream path /ch1', async () => {
    const res = await mediamtxService.validateStreamPath('/ch1');
    expect(res).toHaveProperty('available');
    if (res.available) {
      expect(res.rtspUrl).toContain('/ch1');
    } else {
      expect(res).toHaveProperty('error');
    }
  });

  test('FFmpegService should build valid camera streaming args for MediaMTX RTSP input', () => {
    const rtspUrl = 'rtsp://127.0.0.1:8554/ch1';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-1234567890';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl);

    expect(args).toContain('-rtsp_transport');
    expect(args).toContain('tcp');
    expect(args).toContain(rtspUrl);
    expect(args).toContain('-c:v');
    expect(args.some(a => ['libx264', 'h264_mf', 'h264_qsv', 'h264_nvenc', 'h264_amf'].includes(a))).toBe(true);
    expect(args[args.length - 1]).toBe(rtmpsUrl);
  });
});
