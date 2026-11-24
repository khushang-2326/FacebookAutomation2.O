const express = require('express');
const router = express.Router();
const {
  uploadMedia,
  getMediaList,
  getMediaById,
  getMediaPreview,
  deleteMedia,
  createSampleMedia
} = require('../controllers/mediaController');
const { upload } = require('../services/mediaService');
const { protect } = require('../middleware/auth');

const uploadFlexible = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
    }
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
};

router.post('/upload', protect, uploadFlexible, uploadMedia);
router.post('/sample', protect, createSampleMedia);
router.get('/preview/:filenameOrId', getMediaPreview);
router.get('/', protect, getMediaList);
router.get('/:id', protect, getMediaById);
router.delete('/:id', protect, deleteMedia);

module.exports = router;
