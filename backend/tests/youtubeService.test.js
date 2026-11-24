const youtubeService = require('../services/youtubeService');

describe('YouTube source validation', () => {
  test.each(['https://www.youtube.com/watch?v=abc123', 'https://youtu.be/abc123', 'https://m.youtube.com/watch?v=abc123'])('accepts %s', (url) => {
    expect(youtubeService.isYouTubeUrl(url)).toBe(true);
  });
  test.each(['https://example.com/watch?v=abc123', 'rtsp://camera.local/live', 'not a url'])('rejects %s', (url) => {
    expect(youtubeService.isYouTubeUrl(url)).toBe(false);
  });
});
