const mongoose = require('mongoose');

const streamProcessSchema = new mongoose.Schema({
  broadcastId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broadcast',
    required: true,
  },
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true,
  },
  pid: {
    type: Number,
    required: true,
  },
  command: {
    type: String,
  },
  status: {
    type: String,
    enum: ['SPAWNED', 'RUNNING', 'STOPPING', 'TERMINATED', 'CRASHED'],
    default: 'SPAWNED',
  },
  restartCount: {
    type: Number,
    default: 0,
  },
  lastHeartbeat: {
    type: Date,
    default: Date.now,
  },
  fps: {
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
  bitrate: {
    type: String,
    default: '0kbits/s',
  },
  speed: {
    type: String,
    default: '1.0x',
  },
  droppedFrames: {
    type: Number,
    default: 0,
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

module.exports = mongoose.model('StreamProcess', streamProcessSchema);
