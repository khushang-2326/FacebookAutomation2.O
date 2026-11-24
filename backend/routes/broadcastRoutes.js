const express = require('express');
const router = express.Router();
const {
  getBroadcasts,
  getBroadcastById,
  endBroadcast
} = require('../controllers/broadcastController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getBroadcasts);
router.get('/:id', protect, getBroadcastById);
router.post('/:id/end', protect, endBroadcast);

module.exports = router;
