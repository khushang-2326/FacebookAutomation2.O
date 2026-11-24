const express = require('express');
const router = express.Router();
const {
  getHealth,
  getLogs,
  getMediaToolsHealth,
  getDevices,
  getTrialStatus,
  getGpuDiagnostics,
  setGpuMode,
  exportDiagnosticReport
} = require('../controllers/systemController');
const { protect } = require('../middleware/auth');

router.get('/health', getHealth);
router.get('/trial-status', getTrialStatus);
router.get('/media-tools', getMediaToolsHealth);
router.get('/devices', getDevices);
router.get('/gpu-diagnostics', getGpuDiagnostics);
router.post('/gpu-mode', setGpuMode);
router.get('/export-diagnostic-report', exportDiagnosticReport);
router.get('/logs', protect, getLogs);

module.exports = router;
