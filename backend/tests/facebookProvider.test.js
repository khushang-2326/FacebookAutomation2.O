const MockFacebookProvider = require('../services/facebook/mockFacebookProvider');
const { encrypt, decrypt } = require('../utils/crypto');

describe('Facebook Provider & Security Layer', () => {
  let provider;

  beforeAll(() => {
    provider = new MockFacebookProvider();
  });

  test('AES-256-GCM Token Encryption and Decryption', () => {
    const plainToken = 'EAABwzL138ZA0BOZCu49mockSecretToken123456789';
    const encrypted = encrypt(plainToken);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toEqual(plainToken);
    expect(encrypted.split(':').length).toBe(3); // iv:authTag:ciphertext

    const decrypted = decrypt(encrypted);
    expect(decrypted).toEqual(plainToken);
  });

  test('Mock Provider exchanges code for valid token data', async () => {
    const res = await provider.exchangeCodeForToken('mock_test_code_123');
    expect(res).toBeDefined();
    expect(res.accessToken).toContain('mock_eaab_token_');
    expect(res.fbUserId).toBeDefined();
    expect(res.name).toBe('Mock Facebook Creator');
  });

  test('Mock Provider retrieves managed Facebook Pages', async () => {
    const pages = await provider.getPages('mock_user_token');
    expect(Array.isArray(pages)).toBe(true);
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]).toHaveProperty('pageId');
    expect(pages[0]).toHaveProperty('pageAccessToken');
    expect(pages[0]).toHaveProperty('name');
  });

  test('Mock Provider creates Live Broadcast and generates valid RTMPS endpoint', async () => {
    const broadcast = await provider.createLiveBroadcast('mock_token', 'mock_page_1', {
      title: 'Scheduled Morning Live',
      description: 'Continuous 24/7 stream test'
    });

    expect(broadcast).toBeDefined();
    expect(broadcast.id).toContain('mock_live_vid_');
    expect(broadcast.streamUrl).toContain('rtmps://mock-live-api-s.facebook.com');
    expect(broadcast.status).toBe('UNPUBLISHED');
  });

  test('Mock Provider retrieves live status and ends broadcast', async () => {
    const created = await provider.createLiveBroadcast('mock_token', 'mock_page_1', { title: 'Test' });
    const status = await provider.getBroadcastStatus('mock_token', created.id);
    expect(status).toBeDefined();
    expect(status.id).toBe(created.id);

    const ended = await provider.endBroadcast('mock_token', created.id);
    expect(ended.success).toBe(true);
    expect(ended.id).toBe(created.id);
  });
});
