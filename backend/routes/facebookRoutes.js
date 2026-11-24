const express = require('express');
const router = express.Router();
const {
  getAuthUrl,
  handleCallback,
  mockConnect,
  connectWithToken,
  connectStreamKey,
  getPages,
  testPageToken,
  deletePage,
  updatePage,
  disconnectAccount
} = require('../controllers/facebookController');
const { protect } = require('../middleware/auth');

const facebookController = require('../controllers/facebookController');
const facebookAuthController = require('../controllers/facebookAuthController');

// Public Facebook OAuth authentication routes
router.get('/login', facebookAuthController.login);
router.get('/callback', facebookAuthController.callback);

// Protected Facebook Status & Logout routes
router.get('/status', protect, facebookAuthController.getStatus);
router.post('/logout', protect, facebookAuthController.logout);

// Page & Destination Management routes
router.get('/auth-url', protect, getAuthUrl);
router.post('/callback', protect, handleCallback);
router.post('/mock-connect', protect, mockConnect);
router.post('/connect-token', protect, connectWithToken);
router.post('/connect-stream-key', protect, connectStreamKey);
router.get('/pages', protect, getPages);
router.patch('/pages/:id', protect, updatePage);
router.post('/pages/:id/test', protect, testPageToken);
router.delete('/pages/:id', protect, deletePage);
// MediaMTX Facebook Live Start/Stop/Status routes
router.post('/start', protect, facebookController.startFacebookLive);
router.post('/stop', protect, facebookController.stopFacebookLive);
router.get('/live-status', protect, facebookController.getFacebookLiveStatus);

module.exports = router;
