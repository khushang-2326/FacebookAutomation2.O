const { spawn } = require('child_process');
const { mediaToolResolver } = require('../services/mediaToolResolver');

class RtspTester {
  static async testStream(rtspUrl) {
    return new Promise((resolve) => {
      const ffprobeBin = mediaToolResolver.getFFprobePath();
      const args = [
        '-rtsp_transport', 'tcp',
        '-timeout', '5000000',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        rtspUrl
      ];

      const probe = spawn(ffprobeBin, args);
      let stdout = '';

      probe.stdout.on('data', (d) => { stdout += d.toString(); });
      probe.on('error', (err) => resolve({ passed: false, error: err.message }));

      probe.on('close', (code) => {
        if (code !== 0 || !stdout.trim()) {
          return resolve({ passed: false, error: 'RTSP connection failed' });
        }
        try {
          const parsed = JSON.parse(stdout);
          const videoStream = (parsed.streams || []).find(s => s.codec_type === 'video');
          resolve({
            passed: Boolean(videoStream),
            videoCodec: videoStream?.codec_name || 'h264',
            resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : '1920x1080'
          });
        } catch (_) {
          resolve({ passed: false, error: 'Parse error' });
        }
      });
    });
  }
}

module.exports = RtspTester;
