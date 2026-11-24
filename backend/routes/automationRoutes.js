const express = require('express');
const router = express.Router();
const {
  createAutomation,
  getAutomations,
  getAutomationById,
  updateAutomation,
  deleteAutomation,
  startAutomation,
  pauseAutomation,
  resumeAutomation,
  stopAutomation,
  rotateNow,
  preflight,
  emergencyStop,
  diagnoseAutomation,
  switchLiveCamera,
  switchLiveMedia,
  switchLiveYouTube
} = require('../controllers/automationController');
const { protect } = require('../middleware/auth');

router.post('/emergency-stop', protect, emergencyStop);

router.route('/')
  .post(protect, createAutomation)
  .get(protect, getAutomations);

router.route('/:id')
  .get(protect, getAutomationById)
  .put(protect, updateAutomation)
  .delete(protect, deleteAutomation);

router.post('/:id/start', protect, startAutomation);
router.post('/:id/pause', protect, pauseAutomation);
router.post('/:id/resume', protect, resumeAutomation);
router.post('/:id/stop', protect, stopAutomation);
router.post('/:id/rotate-now', protect, rotateNow);
router.post('/:id/switch-camera', protect, switchLiveCamera);
router.post('/:id/switch-media', protect, switchLiveMedia);
router.post('/:id/switch-youtube', protect, switchLiveYouTube);
router.post('/:id/preflight', protect, preflight);
router.post('/:id/diagnose', protect, diagnoseAutomation);

module.exports = router;
