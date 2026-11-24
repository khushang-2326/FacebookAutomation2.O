const express = require('express');
const router = express.Router();
const cameraController = require('../controllers/cameraController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(cameraController.getCameras)
  .post(cameraController.createCamera);

router.post('/test-url', cameraController.testRtspUrl);
router.post('/discover', cameraController.discoverCameras);
router.post('/prepare-previews', cameraController.preparePreviews);

router.put('/webcams/rename', cameraController.renameWebcam);
router.post('/webcams/delete', cameraController.deleteWebcamAlias);
router.delete('/webcams/alias', cameraController.deleteWebcamAlias);
router.get('/webcams/aliases', cameraController.getWebcamAliases);

router.route('/:id')
  .get(cameraController.getCameraById)
  .put(cameraController.updateCamera)
  .delete(cameraController.deleteCamera);

router.post('/:id/test', cameraController.testCamera);

module.exports = router;
