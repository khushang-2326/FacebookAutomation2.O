const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true,
  },
  facebookPageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookPage',
    required: false,
  },
  destinationPlatform: {
    type: String,
    enum: ['FACEBOOK', 'YOUTUBE', 'CUSTOM_RTMP', 'MULTI_DESTINATION'],
    default: 'FACEBOOK',
  },
  fbLiveVideoId: {
    type: String,
    required: true,
  },
  streamUrl: {
    type: String,
    required: true,
  },
  secureStreamUrl: {
    type: String,
  },
  rotationIndex: {
    type: Number,
    required: true,
    default: 1,
  },
  status: {
    type: String,
    enum: [
      'PREPARING',
      'CREATING_BROADCAST',
      'UNPUBLISHED',
      'STREAMING',
      'LIVE',
      'ROTATING',
      'STOPPING',
      'ENDED',
      'COMPLETED',
      'FAILED',
      'CRASHED'
    ],
    default: 'PREPARING',
  },
  scheduledStartTime: {
    type: Date,
    default: Date.now,
  },
  actualStartTime: {
    type: Date,
    default: null,
  },
  actualEndTime: {
    type: Date,
    default: null,
  },
  durationSec: {
    type: Number,
    default: 0,
  },
  targetFps: {
    type: Number,
    default: 30,
  },
  targetResolution: {
    type: String,
    default: '1080p',
  },
  targetWidth: {
    type: Number,
    default: 1920,
  },
  targetHeight: {
    type: Number,
    default: 1080,
  },
  metricsLog: [
    {
      timestamp: { type: Date, default: Date.now },
      fps: { type: Number, default: 0 },
      bitrate: { type: String, default: '0kbits/s' },
      speed: { type: String, default: '1.0x' },
      droppedFrames: { type: Number, default: 0 },
    },
  ],
  errorMessage: {
    type: String,
    default: null,
  },
  failureStage: {
    type: String,
    enum: ['NONE', 'CAMERA', 'RTSP', 'MEDIAMTX', 'FFPROBE', 'FFMPEG', 'FACEBOOK', 'NETWORK'],
    default: 'NONE',
  },
  failureCode: {
    type: String,
    default: null,
  },
  mediaMtxPath: {
    type: String,
    default: null,
  },
  ffmpegPid: {
    type: Number,
    default: null,
  },
  exitCode: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

broadcastSchema.methods.getMaskedIngestUrl = function () {
  const url = this.secureStreamUrl || this.streamUrl || '';
  if (!url) return '';
  // Mask stream key after last slash or query params
  return url.replace(/(\/rtmp\/|\/rtmps\/|\/live-api-s.facebook.com\/)([^?]+)/i, (m, prefix, key) => {
    const masked = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '****';
    return `${prefix}${masked}`;
  });
};

module.exports = mongoose.model('Broadcast', broadcastSchema);
