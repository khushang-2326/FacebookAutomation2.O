const ffmpegService = require('../services/ffmpegService');

describe('FFmpeg Service & Argument Builder', () => {
  test('buildVideoArgs generates correct arguments for infinite looping with libx264/aac', () => {
    const filePath = '/var/media/sample_video.mp4';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-123456';
    const args = ffmpegService.buildVideoArgs(filePath, rtmpsUrl, {
      bitrate: '3000k',
      maxrate: '3500k'
    });

    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain('-stream_loop');
    expect(args).toContain('-1');
    expect(args).toContain(filePath);
    expect(args).toContain(rtmpsUrl);
    expect(args).toContain('-c:v');
    expect(args.some(a => ['libx264', 'h264_mf', 'h264_qsv', 'h264_nvenc', 'h264_amf'].includes(a))).toBe(true);
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-f');
    expect(args).toContain('flv');
  });

  test('buildVideoArgs omits -stream_loop when loopVideo is false', () => {
    const filePath = '/var/media/single_play.mp4';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-SINGLE';
    const args = ffmpegService.buildVideoArgs(filePath, rtmpsUrl, { loopVideo: false });

    expect(Array.isArray(args)).toBe(true);
    expect(args).not.toContain('-stream_loop');
    expect(args).toContain(filePath);
  });

  test('buildImageArgs generates static loop and synthetic silent audio track', () => {
    const filePath = '/var/media/poster.jpg';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-789012';
    const args = ffmpegService.buildImageArgs(filePath, rtmpsUrl);

    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain('-loop');
    expect(args).toContain('1');
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=44100');
    expect(args).toContain('-c:v');
    expect(args.some(a => ['libx264', 'h264_mf', 'h264_qsv', 'h264_nvenc', 'h264_amf'].includes(a))).toBe(true);
    expect(args).toContain(rtmpsUrl);
  });

  test('buildCameraArgs applies 30 FPS defaults and robust RTSP motion buffer options', () => {
    const rtspUrl = 'rtsp://192.168.1.100:554/stream1';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-LIVE';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, { fps: 30 });

    expect(args).toContain('-r');
    expect(args[args.indexOf('-r') + 1]).toBe('30');
    expect(args).toContain('-g');
    expect(args[args.indexOf('-g') + 1]).toBe('60'); // 2s GOP at 30fps
    expect(args).toContain('-keyint_min');
    expect(args[args.indexOf('-keyint_min') + 1]).toBe('60');
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toContain('fps=30');

    // Anti-freezing RTSP flags
    expect(args).not.toContain('nobuffer');
    expect(args).toContain('-buffer_size');
    expect(args[args.indexOf('-buffer_size') + 1]).toBe('4194304');
    expect(args).toContain('-max_delay');
    expect(args).toContain('-avoid_negative_ts');
  });

  test('buildCameraArgs applies 60 FPS settings with scaled GOP and higher motion bitrate', () => {
    const rtspUrl = 'rtsp://192.168.1.100:554/stream1';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-LIVE';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, { fps: 60 });

    expect(args).toContain('-r');
    expect(args[args.indexOf('-r') + 1]).toBe('60');
    expect(args).toContain('-g');
    expect(args[args.indexOf('-g') + 1]).toBe('120'); // 2s GOP at 60fps
    expect(args).toContain('-keyint_min');
    expect(args[args.indexOf('-keyint_min') + 1]).toBe('120');
    expect(args).toContain('-b:v');
    expect(args[args.indexOf('-b:v') + 1]).toBe('5500k');
    expect(args).toContain('-maxrate');
    expect(args[args.indexOf('-maxrate') + 1]).toBe('6500k');
    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toContain('fps=60');
  });

  test('buildMultiCameraArgs generates correct 60 FPS filtergraph and input queue sizes', () => {
    const sources = [
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 30 }
    ];
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI';
    const args = ffmpegService.buildMultiCameraArgs(sources, rtmpsUrl, { fps: 60 });

    expect(args).toContain('-r');
    expect(args[args.indexOf('-r') + 1]).toBe('60');
    expect(args).toContain('-g');
    expect(args[args.indexOf('-g') + 1]).toBe('120');
    expect(args).toContain('-filter_complex');
    const filterComplex = args[args.indexOf('-filter_complex') + 1];
    expect(filterComplex).toContain('fps=60');
    expect(args).not.toContain('nobuffer');
  });

  test('parseStderrMetrics identifies real-time encoding and detects encoder overload', () => {
    const normalStderr = 'frame=  345 fps= 60.00 q=28.0 size=    4250kB time=00:00:11.50 bitrate=5624.5kbits/s speed=1.02x drop=0';
    const normalParsed = ffmpegService.parseStderrMetrics(normalStderr);
    expect(normalParsed.fps).toBe(60.00);
    expect(normalParsed.speedFactor).toBe(1.02);
    expect(normalParsed.encoderOverload).toBe(false);
    expect(normalParsed.isRealtime).toBe(true);

    const overloadedStderr = 'frame=  500 fps= 42.10 q=32.0 size=    5100kB time=00:00:15.00 bitrate=4800.0kbits/s speed=0.72x drop=15';
    const overloadedParsed = ffmpegService.parseStderrMetrics(overloadedStderr);
    expect(overloadedParsed.speedFactor).toBe(0.72);
    expect(overloadedParsed.encoderOverload).toBe(true);
    expect(overloadedParsed.isRealtime).toBe(false);
    expect(overloadedParsed.droppedFrames).toBe(15);
  });

  test('parseStderrMetrics correctly extracts FPS, bitrate, speed, and frame count', () => {
    const sampleStderr = 'frame=  345 fps= 29.97 q=28.0 size=    4250kB time=00:00:11.50 bitrate=3024.5kbits/s speed=1.00x drop=2';
    const parsed = ffmpegService.parseStderrMetrics(sampleStderr);

    expect(parsed).toBeDefined();
    expect(parsed.fps).toBe(29.97);
    expect(parsed.bitrate).toBe('3024.5kbits/s');
    expect(parsed.speed).toBe('1.00x');
    expect(parsed.droppedFrames).toBe(2);
    expect(parsed.frame).toBe(345);
  });

  test('buildCameraArgs generates correct arguments for DirectShow webcam and microphone', () => {
    const videoDevice = 'HP TrueVision HD Camera';
    const micDevice = 'Microphone Array (Realtek(R) Audio)';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-LIVE';
    const args = ffmpegService.buildCameraArgs(videoDevice, rtmpsUrl, {
      isLocalCamera: true,
      audioSourceType: 'MICROPHONE',
      audioDeviceName: micDevice
    });

    expect(args).toContain('-f');
    expect(args).toContain('dshow');
    expect(args).toContain(`video=${videoDevice}`);
    expect(args).toContain(`audio=${micDevice}`);
    expect(args).toContain(rtmpsUrl);
  });

  test('buildCameraArgs generates amix filter for Singer Mode (Mic + Backing Track)', () => {
    const videoDevice = 'HP TrueVision HD Camera';
    const micDevice = 'Microphone Array (Realtek(R) Audio)';
    const audioPath = 'C:/media/backing_track.mp3';
    const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YT-KEY';
    const args = ffmpegService.buildCameraArgs(videoDevice, rtmpsUrl, {
      isLocalCamera: true,
      audioSourceType: 'MIC_AND_TRACK',
      audioDeviceName: micDevice,
      audioFilePath: audioPath,
      micVolume: 1.0,
      audioTrackVolume: 0.8
    });

    expect(args).toContain(`video=${videoDevice}`);
    expect(args).toContain(`audio=${micDevice}`);
    expect(args).toContain(audioPath);
    expect(args).toContain('-filter_complex');
    expect(args).toContain(rtmpsUrl);
  });

  test('buildMultiCameraArgs with zmqPort generates streamselect and zmq filter for zero-disconnect switching', () => {
    const sources = [
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 30 }
    ];
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI';
    const meta = {};
    const args = ffmpegService.buildMultiCameraArgs(sources, rtmpsUrl, {
      fps: 30,
      zmqPort: 5566,
      meta
    });

    expect(args).toContain('-filter_complex');
    const filterComplex = args[args.indexOf('-filter_complex') + 1];
    expect(filterComplex).toContain('[0:v][1:v]streamselect@camselect=inputs=2:map=0[vraw]');
    expect(filterComplex).toMatch(/\[vraw\]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:\(ow-iw\)\/2:\(oh-ih\)\/2,fps=30,format=(nv12|yuv420p)\[vsel\]/);
    expect(filterComplex).toContain('zmq=bind_address=tcp\\\\\\://127.0.0.1\\\\\\:5566[vout]');
    expect(meta.numUniqueInputs).toBe(2);
    expect(meta.streamSelectFilterName).toBe('streamselect@camselect');
    expect(args).toContain('-timeout');
    expect(args).toContain('30000000');
  });

  test('switchCameraInPlace calls zmqClient sendCommand without restarting process', async () => {
    const broadcastId = 'test-broadcast-123';
    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: true, reply: '0 Error number 0' })
    };

    ffmpegService.activeProcesses.set(broadcastId, {
      isMultiCamera: true,
      zmqPort: 5566,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    const result = await ffmpegService.switchCameraInPlace(broadcastId, 1);
    expect(result.success).toBe(true);
    expect(result.inPlace).toBe(true);
    expect(result.slotIndex).toBe(1);
    expect(result.uniqueIndex).toBe(1);
    expect(mockZmqClient.sendCommand).toHaveBeenCalledWith('streamselect@camselect', 'map', '1');

    // Clean up
    ffmpegService.activeProcesses.delete(broadcastId);
  });

  test('switchCameraInPlace returns failure when ZMQ sendCommand fails on both target and fallback', async () => {
    const broadcastId = 'test-broadcast-failed';
    const mockZmqClient = {
      sendCommand: jest.fn().mockResolvedValue({ success: false, error: 'Function not implemented' })
    };

    ffmpegService.activeProcesses.set(broadcastId, {
      isMultiCamera: true,
      zmqPort: 5566,
      zmqClient: mockZmqClient,
      streamSelectFilterName: 'streamselect@camselect',
      numUniqueInputs: 2,
      scheduleToUniqueInputIndex: [0, 1]
    });

    const result = await ffmpegService.switchCameraInPlace(broadcastId, 1);
    expect(result.success).toBe(false);
    expect(result.inPlace).toBe(false);
    expect(result.error).toBe('Function not implemented');
    expect(mockZmqClient.sendCommand).toHaveBeenCalledTimes(2);

    ffmpegService.activeProcesses.delete(broadcastId);
  });

  test('switchCameraInPlace returns IN_PLACE_NOT_SUPPORTED when not a multi-camera stream', async () => {
    const broadcastId = 'single-camera-broadcast';
    ffmpegService.activeProcesses.set(broadcastId, {
      isMultiCamera: false
    });

    const result = await ffmpegService.switchCameraInPlace(broadcastId, 1);
    expect(result.success).toBe(false);
    expect(result.inPlace).toBe(false);
    expect(result.reason).toBe('IN_PLACE_NOT_SUPPORTED');

    ffmpegService.activeProcesses.delete(broadcastId);
  });

  describe('Configurable Streaming Quality (144p to 4K) & Bitrate Profiles', () => {
    test('resolveResolutionProfile maps all 8 tiers with correct dimensions and bitrates', () => {
      const tiers = [
        { key: '144p', width: 256, height: 144, b30: '400k', b60: '600k' },
        { key: '240p', width: 426, height: 240, b30: '600k', b60: '900k' },
        { key: '360p', width: 640, height: 360, b30: '1000k', b60: '1500k' },
        { key: '480p', width: 854, height: 480, b30: '1500k', b60: '2500k' },
        { key: '720p', width: 1280, height: 720, b30: '2500k', b60: '4000k' },
        { key: '1080p', width: 1920, height: 1080, b30: '4500k', b60: '5500k' },
        { key: '1440p', width: 2560, height: 1440, b30: '10000k', b60: '16000k' },
        { key: '2160p', width: 3840, height: 2160, b30: '25000k', b60: '38000k' },
        { key: '4k', width: 3840, height: 2160, b30: '25000k', b60: '38000k' },
      ];

      for (const t of tiers) {
        const p30 = ffmpegService.resolveResolutionProfile(t.key, 30);
        expect(p30.width).toBe(t.width);
        expect(p30.height).toBe(t.height);
        expect(p30.bitrate).toBe(t.b30);

        const p60 = ffmpegService.resolveResolutionProfile(t.key, 60);
        expect(p60.width).toBe(t.width);
        expect(p60.height).toBe(t.height);
        expect(p60.bitrate).toBe(t.b60);
      }
    });

    test('resolveResolutionProfile falls back safely to 1080p for unknown or empty resolution', () => {
      const p = ffmpegService.resolveResolutionProfile('invalid_res', 30);
      expect(p.width).toBe(1920);
      expect(p.height).toBe(1080);
      expect(p.bitrate).toBe('4500k');
    });

    test('buildCameraArgs applies 4K (3840x2160) at 60 FPS with recommended CBR bitrate and GOP', () => {
      const rtspUrl = 'rtsp://192.168.1.100:554/stream1';
      const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YOUTUBE-KEY';
      const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
        resolution: '2160p',
        fps: 60
      });

      expect(args).toContain('-r');
      expect(args[args.indexOf('-r') + 1]).toBe('60');
      expect(args).toContain('-g');
      expect(args[args.indexOf('-g') + 1]).toBe('120'); // 2s GOP at 60fps
      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('38000k');
      expect(args).toContain('-maxrate');
      expect(args[args.indexOf('-maxrate') + 1]).toBe('50000k');
      expect(args).toContain('-bufsize');
      expect(args[args.indexOf('-bufsize') + 1]).toBe('76000k');
      expect(args).toContain('-vf');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).toContain('scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:(ow-iw)/2:(oh-ih)/2');
      expect(vf).toContain('fps=60');
    });

    test('buildCameraArgs applies 720p at 30 FPS with correct scaling and bitrate', () => {
      const rtspUrl = 'rtsp://192.168.1.100:554/stream1';
      const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YOUTUBE-KEY';
      const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
        resolution: '720p',
        fps: 30
      });

      expect(args).toContain('-r');
      expect(args[args.indexOf('-r') + 1]).toBe('30');
      expect(args).toContain('-g');
      expect(args[args.indexOf('-g') + 1]).toBe('60');
      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('2500k');
      expect(args).toContain('-vf');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).toContain('scale=1280:720');
      expect(vf).toContain('pad=1280:720:(ow-iw)/2:(oh-ih)/2');
    });

    test('buildCameraArgs applies 144p ultra-low bandwidth profile', () => {
      const rtspUrl = 'rtsp://192.168.1.100:554/stream1';
      const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YOUTUBE-KEY';
      const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
        resolution: '144p',
        fps: 30
      });

      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('400k');
      expect(args).toContain('-vf');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).toContain('scale=256:144');
    });

    test('buildMultiCameraArgs scales all camera sources to configured 4K resolution and preserves in-place ZMQ switching', () => {
      const sources = [
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 30 }
      ];
      const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YOUTUBE-KEY';
      const meta = {};
      const args = ffmpegService.buildMultiCameraArgs(sources, rtmpsUrl, {
        resolution: '4k',
        fps: 60,
        zmqPort: 5577,
        meta
      });

      expect(args).toContain('-filter_complex');
      const filterComplex = args[args.indexOf('-filter_complex') + 1];
      // Post-selection scaling to 3840:2160 @ 60 FPS
      expect(filterComplex).toContain('[0:v][1:v]streamselect@camselect=inputs=2:map=0[vraw]');
      expect(filterComplex).toMatch(/\[vraw\]scale=3840:2160:force_original_aspect_ratio=decrease,pad=3840:2160:\(ow-iw\)\/2:\(oh-ih\)\/2,fps=60,format=(nv12|yuv420p)\[vsel\]/);
      expect(filterComplex).toContain('zmq=bind_address=tcp\\\\\\://127.0.0.1\\\\\\:5577[vout]');
      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('38000k');
    });

    test('buildVideoArgs supports configurable resolution scaling without distorting aspect ratio', () => {
      const filePath = '/var/media/sample_video.mp4';
      const rtmpsUrl = 'rtmp://a.rtmp.youtube.com/live2/YOUTUBE-KEY';
      const args = ffmpegService.buildVideoArgs(filePath, rtmpsUrl, {
        resolution: '1440p',
        fps: 60
      });

      expect(args).toContain('-vf');
      const vf = args[args.indexOf('-vf') + 1];
      expect(vf).toContain('scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440:(ow-iw)/2:(oh-ih)/2');
      expect(args).toContain('-b:v');
      expect(args[args.indexOf('-b:v') + 1]).toBe('16000k');
    });
  });

  describe('Intel Pipeline: CPU Software Decoding + Intel QSV (h264_qsv) GPU Encoding', () => {
    const { hardwareEncoderService } = require('../services/hardwareEncoderService');
    let snapshot;

    beforeEach(() => {
      snapshot = {
        mode: hardwareEncoderService._mode,
        adapters: [...hardwareEncoderService._adapters],
        adapterName: hardwareEncoderService._adapterName,
        primaryVendor: hardwareEncoderService._primaryVendor,
        activeEncoder: hardwareEncoderService._activeEncoder,
        activeDecoder: hardwareEncoderService._activeDecoder,
        validatedEncoders: new Map(hardwareEncoderService._validatedEncoders),
        validatedDecoders: new Map(hardwareEncoderService._validatedDecoders),
        failedEncoders: new Set(hardwareEncoderService._failedEncoders),
        failedDecoders: new Set(hardwareEncoderService._failedDecoders)
      };

      // Simulate Intel GPU laptop where h264_qsv passes 30 & 60 FPS validation
      hardwareEncoderService._adapters = [{ index: 0, name: 'Intel(R) Iris(R) Xe Graphics', vendor: 'INTEL' }];
      hardwareEncoderService._adapterName = 'Intel(R) Iris(R) Xe Graphics';
      hardwareEncoderService._primaryVendor = 'INTEL';
      hardwareEncoderService._mode = 'AUTO';
      hardwareEncoderService._activeEncoder = 'h264_qsv';
      hardwareEncoderService._activeDecoder = null;
      hardwareEncoderService._failedEncoders.clear();
      hardwareEncoderService._failedDecoders.clear();
      hardwareEncoderService._validatedEncoders.set('h264_qsv_30', { available: true, encoder: 'h264_qsv', fps: 30, isHardware: true });
      hardwareEncoderService._validatedEncoders.set('h264_qsv_60', { available: true, encoder: 'h264_qsv', fps: 60, isHardware: true });
    });

    afterEach(() => {
      hardwareEncoderService._mode = snapshot.mode;
      hardwareEncoderService._adapters = snapshot.adapters;
      hardwareEncoderService._adapterName = snapshot.adapterName;
      hardwareEncoderService._primaryVendor = snapshot.primaryVendor;
      hardwareEncoderService._activeEncoder = snapshot.activeEncoder;
      hardwareEncoderService._activeDecoder = snapshot.activeDecoder;
      hardwareEncoderService._validatedEncoders = snapshot.validatedEncoders;
      hardwareEncoderService._validatedDecoders = snapshot.validatedDecoders;
      hardwareEncoderService._failedEncoders = snapshot.failedEncoders;
      hardwareEncoderService._failedDecoders = snapshot.failedDecoders;
    });

    test('buildCameraArgs uses CPU software decode (no -hwaccel) and h264_qsv GPU encode at 30 & 60 FPS on Intel', () => {
      const args30 = ffmpegService.buildCameraArgs(
        'rtsp://127.0.0.1:8554/cam1',
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-KEY',
        { fps: 30, resolution: '1080p' }
      );

      expect(args30).not.toContain('-hwaccel');
      expect(args30).not.toContain('qsv'); // Only 'h264_qsv' should be present, never decoder 'qsv'
      expect(args30).toContain('-c:v');
      expect(args30[args30.indexOf('-c:v') + 1]).toBe('h264_qsv');
      expect(args30[args30.indexOf('-async_depth') + 1]).toBe('4');
      expect(args30[args30.indexOf('-look_ahead') + 1]).toBe('0');
      expect(args30[args30.indexOf('-pix_fmt') + 1]).toBe('nv12');
      expect(args30[args30.indexOf('-vf') + 1]).toContain('format=nv12');
      expect(args30).not.toContain('libx264');
      expect(args30).not.toContain('h264_mf');

      const args60 = ffmpegService.buildCameraArgs(
        'rtsp://127.0.0.1:8554/cam1',
        'rtmp://a.rtmp.youtube.com/live2/YT-KEY',
        { fps: 60, resolution: '1080p', encoderMode: 'INTEL_QSV' }
      );
      expect(args60).not.toContain('-hwaccel');
      expect(args60[args60.indexOf('-c:v') + 1]).toBe('h264_qsv');
      expect(args60[args60.indexOf('-async_depth') + 1]).toBe('2');
      expect(args60[args60.indexOf('-r') + 1]).toBe('60');
      expect(args60[args60.indexOf('-pix_fmt') + 1]).toBe('nv12');
    });

    test('buildMultiCameraArgs uses CPU decoding on all RTSP inputs, ZMQ streamselect, and h264_qsv GPU encoding', () => {
      const sources = [
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 20 }
      ];
      const args = ffmpegService.buildMultiCameraArgs(
        sources,
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI',
        { fps: 60, resolution: '1080p', zmqPort: 5588, encoderMode: 'INTEL_QSV' }
      );

      expect(args).not.toContain('-hwaccel');
      expect(args).toContain('-c:v');
      expect(args[args.indexOf('-c:v') + 1]).toBe('h264_qsv');
      expect(args[args.indexOf('-pix_fmt') + 1]).toBe('nv12');
      expect(args).not.toContain('libx264');
      const filterComplex = args[args.indexOf('-filter_complex') + 1];
      expect(filterComplex).toContain('streamselect@camselect=inputs=2:map=0[vraw]');
      expect(filterComplex).toContain('format=nv12[vsel]');
      expect(filterComplex).toContain('zmq=bind_address=tcp\\\\\\://127.0.0.1\\\\\\:5588[vout]');
    });

    test('buildMultiCameraArgs with 2+ cameras enforces CPU decoding and zero -init_hw_device on Intel QSV', () => {
      hardwareEncoderService._activeEncoder = 'h264_qsv';
      const sources = [
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 20 },
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 20 },
        { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam3', durationSeconds: 20 }
      ];
      const args = ffmpegService.buildMultiCameraArgs(
        sources,
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI',
        { fps: 30, resolution: '1080p', encoderMode: 'INTEL_QSV' }
      );
      const initHwDeviceCount = args.filter(a => a === '-init_hw_device').length;
      expect(initHwDeviceCount).toBe(0);
      expect(args[0]).toBe('-y');
      expect(args).not.toContain('-init_hw_device');
      expect(args).not.toContain('-hwaccel');
      expect(args).toContain('h264_qsv');
    });

    test('buildCameraArgs preserves NVIDIA hardware decode + NVENC encode when NVIDIA GPU mode is active', () => {
      hardwareEncoderService._adapters = [{ index: 0, name: 'NVIDIA GeForce RTX 3060', vendor: 'NVIDIA' }];
      hardwareEncoderService._primaryVendor = 'NVIDIA';
      hardwareEncoderService._mode = 'NVIDIA_NVENC';
      hardwareEncoderService._activeEncoder = 'h264_nvenc';
      hardwareEncoderService._activeDecoder = 'cuda';
      hardwareEncoderService._validatedEncoders.set('h264_nvenc_30', { available: true, encoder: 'h264_nvenc', fps: 30, isHardware: true });

      const args = ffmpegService.buildCameraArgs(
        'rtsp://127.0.0.1:8554/cam1',
        'rtmps://live-api-s.facebook.com:443/rtmp/FB-KEY',
        { fps: 30, resolution: '1080p', encoderMode: 'NVIDIA_NVENC' }
      );

      expect(args).toContain('-hwaccel');
      expect(args[args.indexOf('-hwaccel') + 1]).toBe('cuda');
      expect(args[args.indexOf('-c:v') + 1]).toBe('h264_nvenc');
    });
  });
});
