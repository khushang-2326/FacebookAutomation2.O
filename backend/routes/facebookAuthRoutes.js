const express = require('express');
const router = express.Router();
const facebookAuthController = require('../controllers/facebookAuthController');
const { protect } = require('../middleware/auth');

// Public Meta OAuth endpoints
router.get('/login', facebookAuthController.login);
router.get('/callback', facebookAuthController.callback);
router.post('/callback', facebookAuthController.callback);

// Protected Status & Logout endpoints
router.get('/status', protect, facebookAuthController.getStatus);
router.post('/logout', protect, facebookAuthController.logout);

module.exports = router;
