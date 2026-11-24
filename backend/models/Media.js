const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    enum: ['VIDEO', 'IMAGE', 'AUDIO'],
    required: true,
  },
  fileSizeBytes: {
    type: Number,
    required: true,
  },
  durationSec: {
    type: Number,
    default: 0,
  },
  width: {
    type: Number,
    default: 0,
  },
  height: {
    type: Number,
    default: 0,
  },
  hasAudio: {
    type: Boolean,
    default: true,
  },
  codec: {
    type: String,
    default: 'unknown',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Media', mediaSchema);
