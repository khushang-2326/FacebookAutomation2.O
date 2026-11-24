const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  agentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  deviceName: {
    type: String,
    default: 'Local PC',
  },
  hostname: {
    type: String,
    default: 'localhost',
  },
  agentVersion: {
    type: String,
    default: '1.0.0',
  },
  platform: {
    type: String,
    default: 'windows',
  },
  status: {
    type: String,
    enum: ['ONLINE', 'OFFLINE', 'BUSY', 'MAINTENANCE'],
    default: 'ONLINE',
  },
  connectionToken: {
    type: String,
  },
  cpuUsage: {
    type: Number,
    default: 0,
  },
  memoryUsage: {
    type: Number,
    default: 0,
  },
  ffmpegRunning: {
    type: Boolean,
    default: false,
  },
  activeCameraCount: {
    type: Number,
    default: 0,
  },
  lastSeenAt: {
    type: Date,
    default: Date.now,
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

agentSchema.methods.isAlive = function (timeoutMs = 60000) {
  if (!this.lastSeenAt) return false;
  return (Date.now() - new Date(this.lastSeenAt).getTime()) < timeoutMs;
};

module.exports = mongoose.model('Agent', agentSchema);
