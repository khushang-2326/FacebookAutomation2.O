const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('../../config/config');
const User = require('../../models/User');
const FacebookAccount = require('../../models/FacebookAccount');
const { Logger } = require('../../utils/logger');

const logger = new Logger('FacebookAuthService');

class FacebookAuthService {
  constructor() {
    this.apiVersion = process.env.META_GRAPH_API_VERSION || process.env.FACEBOOK_API_VERSION || 'v21.0';
  }

  get isMockMode() {
    return process.env.FACEBOOK_MOCK_MODE === 'true' || config.facebook?.mockMode;
  }

  /**
   * Generates the official Meta OAuth authorization URL
   */
  getOAuthUrl(state = '', isMockOverride = null) {
    const isMock = isMockOverride !== null ? isMockOverride : this.isMockMode;
    const appId = process.env.FACEBOOK_APP_ID || config.facebook?.appId || '';
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || config.facebook?.redirectUri || 'http://localhost:5000/api/facebook/callback';

    const isPlaceholderAppId = !appId || appId.includes('mock') || appId.includes('your_') || appId.length < 10;

    if (isMock || isPlaceholderAppId) {
      logger.info('Generating Mock Facebook OAuth URL for development testing');
      return `http://localhost:5000/api/facebook/callback?code=mock_fb_code_${Date.now()}&state=${encodeURIComponent(state)}&isMock=true`;
    }

    const scope = 'email,public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,publish_video';
    const authUrl = `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&response_type=code`;

    logger.info(`Generated official Meta OAuth URL (Version ${this.apiVersion}) for App ID ${appId}`);
    return authUrl;
  }

  /**
   * Exchanges OAuth authorization code for Facebook User Access Token & Profile
   */
  async exchangeCodeForToken(code, isMockOverride = null) {
    const isMock = isMockOverride !== null ? isMockOverride : (code.startsWith('mock_') || this.isMockMode);
    const appId = process.env.FACEBOOK_APP_ID || config.facebook?.appId;
    const appSecret = process.env.FACEBOOK_APP_SECRET || config.facebook?.appSecret;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI || config.facebook?.redirectUri || 'http://localhost:5000/api/facebook/callback';

    if (isMock || !appId || !appSecret) {
      logger.info(`Processing Mock Facebook Token Exchange for code: ${code}`);
      return {
        accessToken: `mock_eaab_token_${Date.now()}`,
        expiresIn: 5184000, // 60 days
        fbUserId: 'mock_fb_user_1001',
        name: 'Facebook User',
        email: 'user@facebook.com',
        pictureUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        isMock: true
      };
    }

    try {
      // 1. Exchange Code for User Access Token
      const tokenUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token`;
      const tokenRes = await axios.get(tokenUrl, {
        params: {
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: redirectUri,
          code
        }
      });

      const { access_token: accessToken, expires_in: expiresIn } = tokenRes.data;

      // 2. Fetch User Profile
      const meUrl = `https://graph.facebook.com/${this.apiVersion}/me`;
      const meRes = await axios.get(meUrl, {
        params: {
          fields: 'id,name,email,picture.type(large)',
          access_token: accessToken
        }
      });

      const { id: fbUserId, name, email, picture } = meRes.data;

      logger.info(`Successfully authenticated Facebook User "${name}" (${fbUserId})`);

      return {
        accessToken,
        expiresIn: expiresIn || 5184000,
        fbUserId,
        name: name || 'Facebook User',
        email: email || `${fbUserId}@facebook.com`,
        pictureUrl: picture?.data?.url || null,
        isMock: false
      };
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Facebook OAuth Token Exchange failed: ${errMsg}`);
      throw new Error(`Meta OAuth Authorization Failed: ${errMsg}`);
    }
  }

  /**
   * Finds or creates a local application User and generates JWT session token
   */
  async findOrCreateUserAndGenerateJwt(tokenData) {
    let user = await User.findOne({ email: tokenData.email });

    if (!user) {
      user = await User.create({
        name: tokenData.name,
        email: tokenData.email,
        password: `fb_oauth_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        role: 'admin'
      });
      logger.info(`Created new local User "${user.email}" via Facebook OAuth`);
    } else {
      user.name = tokenData.name;
      await user.save();
    }

    // Save or update FacebookAccount document linked to User
    let account = await FacebookAccount.findOne({ userId: user._id, fbUserId: tokenData.fbUserId });
    if (!account) {
      account = new FacebookAccount({
        userId: user._id,
        fbUserId: tokenData.fbUserId,
        name: tokenData.name,
        email: tokenData.email,
        isMock: tokenData.isMock
      });
    }
    account.setAccessToken(tokenData.accessToken);
    account.tokenExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));
    await account.save();

    // Sign Application JWT
    const jwtToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        facebookConnected: true,
        facebookAccountName: account.name
      },
      token: jwtToken
    };
  }
}

module.exports = new FacebookAuthService();
