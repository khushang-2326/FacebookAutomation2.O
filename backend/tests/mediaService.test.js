const { MediaService } = require('../services/mediaService');

describe('Media Service & Metadata Inspection', () => {
  test('Probing image media returns valid simulated dimensions and no audio', async () => {
    const probe = await MediaService.probeMediaFile('/mock/path/poster.jpg', true);
    expect(probe).toBeDefined();
    expect(probe.width).toBe(1920);
    expect(probe.height).toBe(1080);
    expect(probe.hasAudio).toBe(false);
    expect(probe.durationSec).toBe(0);
  });

  test('Probing fallback video returns standard 1080p resolution and audio metadata', async () => {
    const probe = await MediaService.probeMediaFile('/non_existent_mock_file.mp4', false);
    expect(probe).toBeDefined();
    expect(probe.width).toBe(1920);
    expect(probe.height).toBe(1080);
    expect(probe.hasAudio).toBe(true);
  });
});
