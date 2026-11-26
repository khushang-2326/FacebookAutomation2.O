'use strict';

const cameraService = require('../services/cameraService');
const { gstreamerRuntimeDetector } = require('../services/gstreamerRuntimeDetector');

describe('Camera Service GStreamer Integration', () => {
  test('should detect GStreamer runtime for camera testing', () => {
    const runtime = gstreamerRuntimeDetector.detectRuntime();
    expect(runtime.available).toBe(true);
    expect(runtime.gstLaunchExe).toBeDefined();
    expect(runtime.gstDiscovererExe).toBeDefined();
  });

  test('should return mock success for mock RTSP URLs in test mode', async () => {
    const res = await cameraService.testRtspStream('rtsp://mock-camera.local/live');
    expect(res.passed).toBe(true);
    expect(res.connection).toBe(true);
    expect(res.videoCodec).toBe('h264');
  });

  test('should fail gracefully with descriptive error for unreachable camera', async () => {
    const res = await cameraService.testRtspStream('rtsp://127.0.0.1:55499/nonexistent');
    expect(res.passed).toBe(false);
    expect(res.connection).toBe(false);
    expect(res.error).toBeDefined();
    expect(res.error).toContain('Camera unreachable');
  }, 10000);

  test('should verify frame decode with GStreamer in test mode or mock', async () => {
    const res = await cameraService.verifyFrameDecode('rtsp://mock.local/live');
    expect(res.success).toBe(true);
  });
});
