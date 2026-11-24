const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

router.post('/register', agentController.registerAgent);
router.post('/heartbeat', agentController.sendHeartbeat);
router.post('/:agentId/diagnose-camera', agentController.diagnoseCamera);

module.exports = router;
