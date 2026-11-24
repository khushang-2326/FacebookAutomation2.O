const config = require('../../config/config');
const MetaFacebookProvider = require('./metaFacebookProvider');
const MockFacebookProvider = require('./mockFacebookProvider');
const { Logger } = require('../../utils/logger');

const logger = new Logger('FacebookService');

class FacebookService {
  constructor() {
    this.metaProvider = new MetaFacebookProvider();
    this.mockProvider = new MockFacebookProvider();
    this.isMockMode = config.facebook.mockMode;
    logger.info(`Initialized FacebookService (MockMode: ${this.isMockMode})`);
  }

  setMockMode(enabled) {
    this.isMockMode = Boolean(enabled);
    logger.info(`FacebookService MockMode set to: ${this.isMockMode}`);
  }

  getProvider(forceMock = null) {
    const useMock = forceMock !== null ? forceMock : this.isMockMode;
    return useMock ? this.mockProvider : this.metaProvider;
  }

  getOAuthUrl(state = '', forceMock = null) {
    return this.getProvider(forceMock).getOAuthUrl(state);
  }

  async exchangeCodeForToken(code, forceMock = null) {
    return this.getProvider(forceMock).exchangeCodeForToken(code);
  }

  async getPages(userAccessToken, isMock = false) {
    return this.getProvider(isMock).getPages(userAccessToken);
  }

  async createLiveBroadcast(pageAccessToken, pageId, options = {}, isMock = false) {
    return this.getProvider(isMock).createLiveBroadcast(pageAccessToken, pageId, options);
  }

  async getBroadcastStatus(pageAccessToken, liveVideoId, isMock = false) {
    return this.getProvider(isMock).getBroadcastStatus(pageAccessToken, liveVideoId);
  }

  async publishBroadcast(pageAccessToken, liveVideoId, isMock = false) {
    return this.getProvider(isMock).publishBroadcast(pageAccessToken, liveVideoId);
  }

  async endBroadcast(pageAccessToken, liveVideoId, isMock = false) {
    return this.getProvider(isMock).endBroadcast(pageAccessToken, liveVideoId);
  }
}

// Export singleton instance
module.exports = new FacebookService();
