'use strict';

const { gstreamerPipelineBuilder } = require('../services/gstreamerPipelineBuilder');
const { gstreamerService } = require('../services/gstreamerService');

describe('GStreamer Pipeline Builder', () => {
  const sampleCameras = [
    { rtspUrl: 'rtsp://192.168.1.100:554/live/ch0', videoCodec: 'h265' },
    { rtspUrl: 'rtsp://192.168.1.101:554/live/ch0', videoCodec: 'h264' }
  ];

  test('should construct a multi-camera input-selector pipeline', () => {
    const pipeline = gstreamerPipelineBuilder.buildPipeline({
      cameras: sampleCameras,
      facebook: { rtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/fb-key', width: 1920, height: 1080, fps: 60, bitrate: 6000 },
      youtube: { rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2/yt-key', width: 2560, height: 1440, fps: 60, bitrate: 14000, codec: 'h265' },
      hdmi: { enabled: true, adapter: 0, fullscreen: true },
      audio: { source: 'silence', bitrate: 128 }
    });

    expect(pipeline).toContain('input-selector name=cam_selector');
    expect(pipeline).toContain('tee name=program_tee');
    expect(pipeline).toContain('cam_selector.sink_0');
    expect(pipeline).toContain('cam_selector.sink_1');
    expect(pipeline).toContain('queue name=fb_q');
    expect(pipeline).toContain('queue name=yt_q');
    expect(pipeline).toContain('queue name=hdmi_q');
    expect(pipeline).toContain('d3d11videosink');
    expect(pipeline).toContain('flvmux name=fb_mux');
    expect(pipeline).toContain('flvmux name=yt_mux');
    expect(pipeline).toContain('rtmp2sink location="rtmps://live-api-s.facebook.com:443/rtmp/fb-key"');
    expect(pipeline).toContain('rtmp2sink location="rtmp://a.rtmp.youtube.com/live2/yt-key"');
  });

  test('should calculate correct GOP for 60 FPS and 30 FPS (2-second keyframe)', () => {
    const pipe60 = gstreamerPipelineBuilder.buildPipeline({
      cameras: [{ rtspUrl: 'rtsp://192.168.1.100:554/ch0' }],
      facebook: { rtmpUrl: 'rtmp://fb/stream', fps: 60, bitrate: 6000 }
    });
    // For 60 FPS, GOP is 120 (either gop-size=120 or key-int-max=120)
    expect(pipe60).toMatch(/(?:gop-size=120|key-int-max=120)/);

    const pipe30 = gstreamerPipelineBuilder.buildPipeline({
      cameras: [{ rtspUrl: 'rtsp://192.168.1.100:554/ch0' }],
      facebook: { rtmpUrl: 'rtmp://fb/stream', fps: 30, bitrate: 4000 }
    });
    // For 30 FPS, GOP is 60 (either gop-size=60 or key-int-max=60)
    expect(pipe30).toMatch(/(?:gop-size=60|key-int-max=60)/);
  });

  test('should isolate queues with leaky downstream to prevent cross-branch stalls', () => {
    const pipeline = gstreamerPipelineBuilder.buildPipeline({
      cameras: sampleCameras,
      facebook: { rtmpUrl: 'rtmp://fb/stream' },
      youtube: { rtmpUrl: 'rtmp://yt/stream' },
      hdmi: { enabled: true }
    });

    expect(pipeline).toContain('queue name=fb_q max-size-buffers=60 max-size-time=2000000000 max-size-bytes=0 leaky=downstream');
    expect(pipeline).toContain('queue name=yt_q max-size-buffers=60 max-size-time=2000000000 max-size-bytes=0 leaky=downstream');
    expect(pipeline).toContain('queue name=hdmi_q max-size-buffers=5 max-size-time=100000000 max-size-bytes=0 leaky=downstream');
  });
});

describe('GStreamer In-Process Engine Service', () => {
  test('should report GStreamer service availability', () => {
    expect(gstreamerService.isAvailable()).toBe(true);
  });
});
