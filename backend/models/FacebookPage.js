const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const facebookPageSchema = new mongoose.Schema({
  facebookAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookAccount',
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  pageId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    default: 'General',
  },
  pictureUrl: {
    type: String,
  },
  encryptedPageAccessToken: {
    type: String,
    required: true,
  },
  tasks: {
    type: [String],
    default: ['CREATE_CONTENT', 'MANAGE', 'LIVE_VIDEOS'],
  },
  isValid: {
    type: Boolean,
    default: true,
  },
  isMock: {
    type: Boolean,
    default: false,
  },
  platform: {
    type: String,
    enum: ['FACEBOOK', 'YOUTUBE', 'CUSTOM_RTMP'],
    default: 'FACEBOOK',
  },
  streamType: {
    type: String,
    enum: ['PAGE_API', 'STREAM_KEY'],
    default: 'PAGE_API',
  },
  serverUrl: {
    type: String,
    default: 'rtmps://live-api-s.facebook.com:443/rtmp/',
  },
  resolution: {
    type: String,
    enum: ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4k'],
    default: '1080p',
  },
  fps: {
    type: Number,
    enum: [30, 60],
    default: 30,
  },
  bitrate: {
    type: String,
    default: null,
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

facebookPageSchema.methods.setPageAccessToken = function (plainToken) {
  this.encryptedPageAccessToken = encrypt(plainToken);
};

facebookPageSchema.methods.getPageAccessToken = function () {
  return decrypt(this.encryptedPageAccessToken);
};

module.exports = mongoose.model('FacebookPage', facebookPageSchema);
