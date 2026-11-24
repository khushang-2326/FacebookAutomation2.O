const mongoose = require('mongoose');

const cameraAliasSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  deviceName: {
    type: String,
    required: true,
    trim: true,
  },
  customName: {
    type: String,
    required: true,
    trim: true,
  },
  deviceType: {
    type: String,
    enum: ['WEBCAM', 'AUDIO', 'CAMERA'],
    default: 'WEBCAM',
  }
}, { timestamps: true });

cameraAliasSchema.index({ userId: 1, deviceName: 1 });

module.exports = mongoose.model('CameraAlias', cameraAliasSchema);
