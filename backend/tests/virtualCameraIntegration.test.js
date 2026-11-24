'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Automation = require('../models/Automation');
const Camera = require('../models/Camera');
const User = require('../models/User');
const broadcastService = require('../services/broadcastService');
const ffmpegService = require('../services/ffmpegService');
const { hardwareEncoderService } = require('../services/hardwareEncoderService');
const cameraService = require('../services/cameraService');
const mediaToolResolver = require('../services/mediaToolResolver');

let mongoServer;

describe('Virtual CCTV Camera, H.265 Transcoding & Hardware GPU Video Encoding Integration', () => {
  let user, cam1, cam2;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    user = await User.create({
      name: 'Virtual Camera Admin',
      email: 'virtcam@liveauto.dev',
      password: 'password123',
      role: 'admin'
    });

    cam1 = new Camera({
      userId: user._id,
      name: 'Virtual Gate CCTV 1 (H.264)',
      ipAddress: '192.168.1.50',
      rtspPort: 554,
      streamPath: '/ch0',
      sourceType: 'RTSP_CAMERA',
      videoCodec: 'h264',
      hasAudio: true,
      audioCodec: 'aac',
      connectionStatus: 'ONLINE'
    });
    cam1.setRtspUrl('rtsp://192.168.1.50:554/ch0');
    await cam1.save();

    cam2 = new Camera({
      userId: user._id,
      name: 'Virtual Perimeter CCTV 2 (H.265/HEVC)',
      ipAddress: '192.168.1.51',
      rtspPort: 554,
      streamPath: '/ch0',
      sourceType: 'RTSP_CAMERA',
      videoCodec: 'hevc',
      hasAudio: false,
      connectionStatus: 'ONLINE'
    });
    cam2.setRtspUrl('rtsp://192.168.1.51:554/ch0');
    await cam2.save();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test('HardwareEncoderService detects local GPU adapter and verifies available encoders', async () => {
    const adapter = hardwareEncoderService.detectAdapter();
    expect(typeof adapter).toBe('string');
    expect(adapter.length).toBeGreaterThan(0);

    const activeEncoder = await hardwareEncoderService.init();
    expect(['h264_mf', 'h264_amf', 'h264_nvenc', 'h264_qsv', 'libx264']).toContain(activeEncoder);

    const telemetry = hardwareEncoderService.getTelemetry();
    expect(telemetry).toHaveProperty('activeEncoder');
    expect(telemetry).toHaveProperty('isHardware');
    expect(telemetry).toHaveProperty('adapterName');
  });

  test('HardwareEncoderService generates valid CBR streaming arguments for live RTMP', () => {
    const encResult = hardwareEncoderService.getEncoderArgs({
      targetFps: 30,
      bitrate: '4500k',
      maxrate: '5000k',
      bufsize: '9000k',
      gop: 60
    });

    expect(Array.isArray(encResult.args)).toBe(true);
    expect(encResult.args).toContain('-c:v');
    expect(encResult.args).toContain('-b:v');
    expect(encResult.args).toContain('4500k');
    expect(encResult.args).toContain('-pix_fmt');
    expect(['yuv420p', 'nv12']).toContain(encResult.args[encResult.args.indexOf('-pix_fmt') + 1]);
    expect(encResult.args).toContain('-g');
    expect(encResult.args).toContain('60');
  });

  test('HardwareEncoderService supports SOFTWARE mode fallback to libx264', () => {
    const swResult = hardwareEncoderService.getEncoderArgs({
      targetFps: 30,
      bitrate: '3000k',
      mode: 'SOFTWARE'
    });

    expect(swResult.encoder).toBe('libx264');
    expect(swResult.isHardware).toBe(false);
    expect(swResult.args).toContain('-c:v');
    expect(swResult.args).toContain('libx264');
    expect(swResult.args).toContain('-profile:v');
    expect(swResult.args).toContain('high');
  });

  test('buildCameraArgs includes pixel format normalization for H.265/HEVC CCTV decoding', () => {
    const rtspUrl = 'rtsp://127.0.0.1:8554/hevc_cam';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/TEST-LIVE-KEY';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
      fps: 30,
      resolution: '1080p',
      bitrate: '4500k'
    });

    expect(args).toContain('-vf');
    const vfIndex = args.indexOf('-vf');
    expect(args[vfIndex + 1]).toMatch(/format=(yuv420p|nv12)/);
    expect(args).toContain('-flvflags');
    expect(args).toContain('no_duration_filesize');
  });

  test('Audio routing: generates synthetic silence fallback when camera has no audio', () => {
    const rtspUrl = 'rtsp://127.0.0.1:8554/silent_cam';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/TEST-LIVE-KEY';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
      audioSourceType: 'CAMERA_AUDIO',
      hasAudio: false
    });

    expect(args).toContain('-f');
    expect(args).toContain('anullsrc=channel_layout=stereo:sample_rate=44100');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('128k');
  });

  test('Audio routing: MICROPHONE mode uses safe thread queue size 4096 to prevent starvation', () => {
    const rtspUrl = 'rtsp://127.0.0.1:8554/cam';
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/TEST-LIVE-KEY';
    const args = ffmpegService.buildCameraArgs(rtspUrl, rtmpsUrl, {
      audioSourceType: 'MICROPHONE',
      audioDeviceName: 'Mock Microphone'
    });

    expect(args).toContain('-thread_queue_size');
    expect(args).toContain('4096');
    expect(args).toContain('-map');
    expect(args).toContain('0:v:0');
    expect(args).toContain('1:a:0');
  });

  test('prepareCameraSources validates and propagates audio/video metadata for 5-minute schedules', async () => {
    const autoDoc = new Automation({
      userId: user._id,
      name: '5-Minute Multi-Camera Broadcast',
      title: '5-Minute Multi-Camera Broadcast',
      sourceType: 'RTSP_CAMERA',
      cameraSchedules: [
        { cameraType: 'RTSP', cameraId: cam1._id, cameraName: 'Gate CCTV 1', durationSeconds: 300, order: 0 },
        { cameraType: 'RTSP', cameraId: cam2._id, cameraName: 'Perimeter CCTV 2', durationSeconds: 300, order: 1 }
      ]
    });
    await autoDoc.save();

    const prepared = await broadcastService.prepareCameraSources(autoDoc);
    expect(prepared.length).toBe(2);
    expect(prepared[0].name).toBe('Gate CCTV 1');
    expect(prepared[0].durationSeconds).toBe(300);
    expect(prepared[0].hasAudio).toBe(true);

    expect(prepared[1].name).toBe('Perimeter CCTV 2');
    expect(prepared[1].durationSeconds).toBe(300);
    expect(prepared[1].hasAudio).toBe(false);
  });

  test('buildMultiCameraArgs scales all camera sources to 1080p with tpad clone protection and clean ZMQ bind syntax', () => {
    const sources = [
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam1', durationSeconds: 300 },
      { type: 'RTSP', targetInputUrl: 'rtsp://127.0.0.1:8554/cam2', durationSeconds: 300 }
    ];
    const rtmpsUrl = 'rtmps://live-api-s.facebook.com:443/rtmp/FB-MULTI';
    const meta = {};
    const args = ffmpegService.buildMultiCameraArgs(sources, rtmpsUrl, {
      fps: 30,
      resolution: '1080p',
      bitrate: '4500k',
      zmqPort: 5588,
      meta
    });

    const filterComplex = args[args.indexOf('-filter_complex') + 1];
    expect(filterComplex).toContain('[0:v][1:v]streamselect@camselect=inputs=2:map=0[vraw]');
    expect(filterComplex).toMatch(/\[vraw\]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:\(ow-iw\)\/2:\(oh-ih\)\/2,fps=30,format=(yuv420p|nv12)\[vsel\]/);
    // Ensure no unescaped or syntax-breaking single quotes in zmq filter description
    expect(filterComplex).toContain('zmq=bind_address=tcp\\\\\\://127.0.0.1\\\\\\:5588[vout]');
    expect(filterComplex).not.toContain("zmq='bind_address=");
  });
});
