const crypto = require('crypto');
const FacebookProvider = require('./facebookProvider');
const { Logger } = require('../../utils/logger');

const logger = new Logger('MockFacebookProvider');

class MockFacebookProvider extends FacebookProvider {
  constructor() {
    super();
    // Stateful in-memory mock store
    this.broadcasts = new Map();
  }

  getOAuthUrl(state = '') {
    return `/mock-facebook-auth?state=${encodeURIComponent(state)}&status=ready`;
  }

  async exchangeCodeForToken(code) {
    logger.info(`[MOCK] Exchanging mock OAuth authorization code: ${code}`);
    const mockFbUserId = 'mock_fb_user_100092837461829';
    return {
      accessToken: `mock_eaab_token_${crypto.randomBytes(24).toString('hex')}`,
      expiresIn: 5184000, // 60 days
      fbUserId: mockFbUserId,
      name: 'Mock Facebook Creator',
      email: 'creator@mock-facebook.dev'
    };
  }

  async getPages(userAccessToken) {
    logger.info(`[MOCK] Fetching Facebook Pages for token: ${userAccessToken?.substring(0, 15)}...`);
    return [
      {
        pageId: 'mock_page_101293847561001',
        name: 'Official Brand Live Channel',
        category: 'Media / News Company',
        pictureUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60',
        pageAccessToken: `mock_page_token_channel_1_${crypto.randomBytes(16).toString('hex')}`,
        tasks: ['MANAGE', 'CREATE_CONTENT', 'MODERATE', 'LIVE_VIDEOS']
      },
      {
        pageId: 'mock_page_101293847561002',
        name: 'Gaming & 24/7 Music Stream',
        category: 'Gaming Video Creator',
        pictureUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=150&auto=format&fit=crop&q=60',
        pageAccessToken: `mock_page_token_gaming_2_${crypto.randomBytes(16).toString('hex')}`,
        tasks: ['MANAGE', 'CREATE_CONTENT', 'LIVE_VIDEOS']
      },
      {
        pageId: 'mock_page_101293847561003',
        name: 'Product Announcements & Events',
        category: 'Product/Service',
        pictureUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=150&auto=format&fit=crop&q=60',
        pageAccessToken: `mock_page_token_events_3_${crypto.randomBytes(16).toString('hex')}`,
        tasks: ['MANAGE', 'CREATE_CONTENT', 'LIVE_VIDEOS']
      }
    ];
  }

  async createLiveBroadcast(pageAccessToken, pageId, options = {}) {
    const liveVideoId = `mock_live_vid_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const streamKey = `FB-${liveVideoId}-${crypto.randomBytes(8).toString('hex')}`;
    const streamUrl = `rtmps://mock-live-api-s.facebook.com:443/rtmp/${streamKey}`;
    const secureStreamUrl = streamUrl;

    const broadcastRecord = {
      id: liveVideoId,
      pageId,
      title: options.title || 'Live Stream',
      description: options.description || '',
      status: 'UNPUBLISHED',
      streamUrl,
      secureStreamUrl,
      creationTime: new Date().toISOString(),
      liveViews: Math.floor(Math.random() * 45) + 5
    };

    this.broadcasts.set(liveVideoId, broadcastRecord);
    logger.info(`[MOCK] Created Live Broadcast: ${liveVideoId} for Page: ${pageId}`);

    return {
      id: liveVideoId,
      streamUrl,
      secureStreamUrl,
      ingestUrl: secureStreamUrl,
      status: 'UNPUBLISHED'
    };
  }

  async getBroadcastStatus(pageAccessToken, liveVideoId) {
    const record = this.broadcasts.get(liveVideoId);
    if (!record) {
      return {
        id: liveVideoId,
        status: 'LIVE',
        creationTime: new Date().toISOString(),
        liveViews: 12
      };
    }
    // Simulate view growth
    record.liveViews = (record.liveViews || 10) + Math.floor(Math.random() * 3);
    return record;
  }

  async publishBroadcast(pageAccessToken, liveVideoId) {
    logger.info(`[MOCK] Publishing Live Broadcast ${liveVideoId} to LIVE_NOW`);
    if (this.broadcasts.has(liveVideoId)) {
      const record = this.broadcasts.get(liveVideoId);
      record.status = 'LIVE';
      this.broadcasts.set(liveVideoId, record);
    }
    return {
      success: true,
      id: liveVideoId
    };
  }

  async endBroadcast(pageAccessToken, liveVideoId) {
    logger.info(`[MOCK] Ending Live Broadcast: ${liveVideoId}`);
    if (this.broadcasts.has(liveVideoId)) {
      const record = this.broadcasts.get(liveVideoId);
      record.status = 'VOD';
      this.broadcasts.set(liveVideoId, record);
    }
    return {
      success: true,
      id: liveVideoId
    };
  }
}

module.exports = MockFacebookProvider;
