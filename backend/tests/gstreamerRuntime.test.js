'use strict';

const { gstreamerRuntimeDetector } = require('../services/gstreamerRuntimeDetector');

describe('GStreamer Runtime Detector', () => {
  test('should detect installed GStreamer runtime on system', () => {
    const runtime = gstreamerRuntimeDetector.detectRuntime();
    expect(runtime).toBeDefined();
    expect(runtime.available).toBe(true);
    expect(runtime.version).toBeDefined();
    expect(runtime.binDir).toBeDefined();
    expect(runtime.gstLaunchExe).toBeDefined();
    expect(runtime.gstInspectExe).toBeDefined();
  });

  test('should verify required GStreamer plugins are present', () => {
    const runtime = gstreamerRuntimeDetector.detectRuntime();
    expect(runtime.plugins).toBeDefined();
    expect(runtime.plugins.inputSelector).toBe(true);
    expect(runtime.plugins.rtspSrc).toBe(true);
    expect(runtime.plugins.flvmux).toBe(true);
    expect(runtime.plugins.rtmp2sink).toBe(true);
    expect(runtime.plugins.d3d11).toBe(true);
    expect(runtime.plugins.d3d11videosink).toBe(true);
  });

  test('should resolve hardware encoders and decoders', () => {
    const runtime = gstreamerRuntimeDetector.detectRuntime();
    expect(runtime.encoders).toBeDefined();
    expect(runtime.encoders.h264).toBeDefined();
    expect(runtime.encoders.h265).toBeDefined();

    expect(runtime.decoders).toBeDefined();
    expect(runtime.decoders.h264).toBeDefined();
    expect(runtime.decoders.h265).toBeDefined();
  });

  test('should produce formatted diagnostic summary for API', () => {
    const summary = gstreamerRuntimeDetector.getDiagnosticSummary();
    expect(summary).toBeDefined();
    expect(summary.gstreamerAvailable).toBe(true);
    expect(summary.version).toBeDefined();
    expect(summary.d3d11Available).toBe(true);
    expect(summary.d3d11VideoSink).toBe(true);
    expect(summary.inputSelectorAvailable).toBe(true);
    expect(summary.rtspAvailable).toBe(true);
    expect(summary.activeH264Encoder).toBeDefined();
    expect(summary.activeH265Encoder).toBeDefined();
  });
});
