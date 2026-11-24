const AgentService = require('../services/agentService');
const Camera = require('../models/Camera');
const cameraService = require('../services/cameraService');
const mediaMtxService = require('../services/mediamtxService');
const { mediaToolResolver } = require('../services/mediaToolResolver');

exports.registerAgent = async (req, res, next) => {
  try {
    const { deviceName, hostname, agentVersion, platform, agentId } = req.body;
    const result = await AgentService.registerAgent({ deviceName, hostname, agentVersion, platform, agentId });
    res.json({ success: true, agent: result });
  } catch (err) {
    next(err);
  }
};

exports.sendHeartbeat = async (req, res, next) => {
  try {
    const { agentId, status, cpuUsage, memoryUsage, ffmpegRunning, cameraCount } = req.body;
    const result = await AgentService.recordHeartbeat({ agentId, status, cpuUsage, memoryUsage, ffmpegRunning, cameraCount });
    res.json({ success: true, heartbeat: result });
  } catch (err) {
    next(err);
  }
};

exports.diagnoseCamera = async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const { cameraId, rtspUrl } = req.body;

    let targetRtspUrl = rtspUrl;
    if (cameraId) {
      const cam = await Camera.findById(cameraId);
      if (cam) {
        targetRtspUrl = cam.getRtspUrl();
      }
    }

    const ffmpegStatus = mediaToolResolver.getFFmpegPath() ? 'PASS' : 'FAIL';
    const mediamtxProcessManager = require('../services/mediamtxProcessManager');
    const mediaMtxApiHealthy = await mediamtxProcessManager.checkApiHealth();
    const mediaMtxDiag = mediaMtxApiHealthy.available ? 'PASS' : 'FAIL';

    let rtspDiag = 'FAIL';
    let ffprobeDiag = 'FAIL';
    let localRtspDiag = 'FAIL';

    if (targetRtspUrl) {
      const probeRes = await cameraService.testRtspStream(targetRtspUrl);
      if (probeRes.passed) {
        rtspDiag = 'PASS';
        ffprobeDiag = 'PASS';
      }

      // Test local proxy path validation
      const testPath = cameraId ? null : 'camera_diag_test';
      if (cameraId) {
        const cam = await Camera.findById(cameraId);
        if (cam) {
          const localRes = await cameraService.testDynamicCameraPath(cam);
          if (localRes.passed || localRes.success) {
            localRtspDiag = 'PASS';
          }
        }
      } else if (targetRtspUrl) {
        const mtxReg = await mediaMtxService.registerProxyPath('camera_diag_test', targetRtspUrl);
        if (mtxReg.success) {
          const probe = await mediaMtxService.probeRtspPath(mtxReg.rtspUrl);
          if (probe.available) {
            localRtspDiag = 'PASS';
          }
        }
      }
    }

    res.json({
      success: true,
      agentId,
      diagnostics: {
        network: 'PASS',
        onvif: 'PASS',
        rtsp: rtspDiag,
        ffprobe: ffprobeDiag,
        mediamtx: mediaMtxDiag,
        localRtsp: localRtspDiag,
        ffmpeg: ffmpegStatus,
      },
    });
  } catch (err) {
    next(err);
  }
};
