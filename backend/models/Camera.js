const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const cameraSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  streamPath: {
    type: String,
    required: true,
    default: '/ch1',
    trim: true,
  },
  location: {
    type: String,
    default: 'POS Checkout Counter 1',
    trim: true,
  },
  mediamtxHost: {
    type: String,
    default: '127.0.0.1',
  },
  rtspPort: {
    type: Number,
    default: 8554,
  },
  apiPort: {
    type: Number,
    default: 9997,
  },
  online: {
    type: Boolean,
    default: true,
  },
  sourceType: {
    type: String,
    enum: ['MEDIAMTX_RTSP', 'RTSP_CAMERA', 'ONVIF_CAMERA'],
    default: 'MEDIAMTX_RTSP',
  },
  ipAddress: {
    type: String,
    trim: true,
    default: '127.0.0.1',
  },
  port: {
    type: Number,
    default: 8554,
  },
  encryptedUsername: {
    type: String,
  },
  encryptedPassword: {
    type: String,
  },
  encryptedRtspUrl: {
    type: String,
    required: true,
  },
  onvifEnabled: {
    type: Boolean,
    default: false,
  },
  onvifProfile: {
    type: String,
    default: 'Profile_1',
  },
  manufacturer: {
    type: String,
    default: 'Generic / IP Camera',
  },
  model: {
    type: String,
    default: 'HD IP Camera',
  },
  serialNumber: {
    type: String,
  },
  connectionStatus: {
    type: String,
    enum: [
      'ONLINE',
      'OFFLINE',
      'CONNECTING',
      'AUTHENTICATION_FAILED',
      'RTSP_ERROR',
      'DISCOVERED',
      'NOT_TESTED'
    ],
    default: 'NOT_TESTED',
  },
  mediaMtxPath: {
    type: String,
    trim: true,
  },
  agentId: {
    type: String,
    default: 'local_agent_default',
  },
  videoCodec: {
    type: String,
    default: 'h264',
  },
  resolution: {
    type: String,
    default: '1920x1080',
  },
  fps: {
    type: Number,
    default: 25,
  },
  hasAudio: {
    type: Boolean,
    default: false,
  },
  status: {
    discovery: {
      type: String,
      enum: ['NOT_TESTED', 'DISCOVERING', 'DISCOVERED', 'FAILED'],
      default: 'NOT_TESTED',
    },
    onvif: {
      type: String,
      enum: ['NOT_TESTED', 'VERIFIED', 'AUTH_REQUIRED', 'FAILED'],
      default: 'NOT_TESTED',
    },
    rtsp: {
      type: String,
      enum: ['NOT_TESTED', 'TESTING', 'CONNECTED', 'AUTH_FAILED', 'TIMEOUT', 'FAILED'],
      default: 'NOT_TESTED',
    },
    ffprobe: {
      type: String,
      enum: ['NOT_STARTED', 'TESTING', 'READY', 'FAILED'],
      default: 'NOT_STARTED',
    },
    overall: {
      type: String,
      enum: ['UNKNOWN', 'ONLINE', 'OFFLINE'],
      default: 'UNKNOWN',
    },
  },
  mediaMtxStatus: {
    type: String,
    enum: ['NOT_STARTED', 'READY', 'FAILED'],
    default: 'NOT_STARTED',
  },
  ffmpegStatus: {
    type: String,
    enum: ['NOT_STARTED', 'STREAMING', 'STOPPED', 'FAILED'],
    default: 'NOT_STARTED',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Credential Cryptography Methods (AES-256-GCM)
cameraSchema.methods.setCredentials = function (username, password) {
  if (username) this.encryptedUsername = encrypt(username);
  if (password) this.encryptedPassword = encrypt(password);
};

cameraSchema.methods.getCredentials = function () {
  return {
    username: this.encryptedUsername ? decrypt(this.encryptedUsername) : '',
    password: this.encryptedPassword ? decrypt(this.encryptedPassword) : ''
  };
};

cameraSchema.methods.setRtspUrl = function (rtspUrl) {
  this.encryptedRtspUrl = encrypt(rtspUrl);
};

cameraSchema.methods.getRtspUrl = function () {
  return decrypt(this.encryptedRtspUrl);
};

// Masked RTSP URL for safe UI display (e.g. rtsp://admin:********@192.168.1.100:554/live)
cameraSchema.methods.getMaskedRtspUrl = function () {
  try {
    const raw = this.getRtspUrl();
    return raw.replace(/:\/\/(.*?):(.*?)@/, '://$1:********@');
  } catch (_) {
    return 'rtsp://********@camera:554/stream';
  }
};

// Deterministic MediaMTX Path Generator Method
cameraSchema.methods.getMediaMtxPath = function () {
  if (this.mediaMtxPath && typeof this.mediaMtxPath === 'string') {
    const clean = this.mediaMtxPath.replace(/[^a-zA-Z0-9_]/g, '');
    if (clean) return clean;
  }
  const cleanId = this._id ? this._id.toString().replace(/[^a-zA-Z0-9_]/g, '').slice(-12) : 'default';
  return `camera_${cleanId}`;
};

cameraSchema.pre('save', function (next) {
  if (!this.mediaMtxPath) {
    this.mediaMtxPath = this.getMediaMtxPath();
  }
  next();
});

module.exports = mongoose.model('Camera', cameraSchema);
