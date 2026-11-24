const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/crypto');

const facebookAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  fbUserId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  encryptedAccessToken: {
    type: String,
    required: true,
  },
  tokenExpiresAt: {
    type: Date,
  },
  isMock: {
    type: Boolean,
    default: false,
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

// Getter and Setter for accessToken
facebookAccountSchema.methods.setAccessToken = function (plainToken) {
  this.encryptedAccessToken = encrypt(plainToken);
};

facebookAccountSchema.methods.getAccessToken = function () {
  return decrypt(this.encryptedAccessToken);
};

module.exports = mongoose.model('FacebookAccount', facebookAccountSchema);
