const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['debug', 'info', 'warn', 'error'],
    default: 'info',
    index: true,
  },
  component: {
    type: String,
    default: 'System',
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  automationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    default: null,
    index: true,
  },
  broadcastId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broadcast',
    default: null,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// TTL index to automatically prune old logs after 30 days if desired
logSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);
