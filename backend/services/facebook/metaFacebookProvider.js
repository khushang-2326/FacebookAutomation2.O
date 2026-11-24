const axios = require('axios');
const FacebookProvider = require('./facebookProvider');
const config = require('../../config/config');
const { Logger } = require('../../utils/logger');

const logger = new Logger('MetaFacebookProvider');

class MetaFacebookProvider extends FacebookProvider {
  constructor() {
    super();
    this.appId = config.facebook.appId;
    this.appSecret = config.facebook.appSecret;
    this.redirectUri = config.facebook.redirectUri;
    this.apiVersion = config.facebook.apiVersion || 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  getOAuthUrl(state = '') {
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_posts',
      'publish_video',
      'pages_manage_engagement'
    ].join(',');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: state
    });

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForToken(code) {
    try {
      // 1. Exchange code for short-lived user access token
      const tokenRes = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          client_id: this.appId,
          client_secret: this.appSecret,
          redirect_uri: this.redirectUri,
          code: code
        }
      });

      const shortLivedToken = tokenRes.data.access_token;

      // 2. Upgrade to long-lived user access token (60 days)
      const longLivedRes = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      const longLivedToken = longLivedRes.data.access_token;
      const expiresIn = longLivedRes.data.expires_in || 5184000; // default 60 days

      // 3. Fetch user profile
      const userProfileRes = await axios.get(`${this.baseUrl}/me`, {
        params: {
          fields: 'id,name,email',
          access_token: longLivedToken
        }
      });

      return {
        accessToken: longLivedToken,
        expiresIn: expiresIn,
        fbUserId: userProfileRes.data.id,
        name: userProfileRes.data.name,
        email: userProfileRes.data.email
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to exchange Facebook OAuth code: ${errorMsg}`);
      throw new Error(`Meta OAuth Exchange failed: ${errorMsg}`);
    }
  }

  async getPages(userAccessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/me/accounts`, {
        params: {
          fields: 'id,name,category,tasks,access_token,picture{url}',
          access_token: userAccessToken,
          limit: 100
        }
      });

      const pages = (response.data.data || []).map(p => ({
        pageId: p.id,
        name: p.name,
        category: p.category || 'Page',
        pictureUrl: p.picture?.data?.url || null,
        pageAccessToken: p.access_token,
        tasks: p.tasks || []
      }));

      return pages;
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to fetch Meta Pages: ${errorMsg}`);
      throw new Error(`Meta Fetch Pages failed: ${errorMsg}`);
    }
  }

  async createLiveBroadcast(pageAccessToken, pageId, options = {}) {
    try {
      const payload = {
        title: options.title || 'Live Stream',
        description: options.description || '',
        status: options.status || 'LIVE_NOW', // Or 'UNPUBLISHED'
        stream_type: 'REGULAR'
      };

      if (options.plannedStartTime) {
        payload.planned_start_time = Math.floor(new Date(options.plannedStartTime).getTime() / 1000);
      }

      const response = await axios.post(`${this.baseUrl}/${pageId}/live_videos`, payload, {
        params: {
          access_token: pageAccessToken
        }
      });

      const data = response.data;
      const ingestUrl = data.secure_stream_url || data.stream_url || data.secureStreamUrl || data.streamUrl;
      logger.info(`Successfully created Meta Live Broadcast ID: ${data.id} on Page ${pageId}`);

      return {
        id: data.id,
        streamUrl: data.stream_url || ingestUrl,
        secureStreamUrl: data.secure_stream_url || ingestUrl,
        ingestUrl: ingestUrl,
        status: data.status || 'UNPUBLISHED'
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to create Meta Live Broadcast for Page ${pageId}: ${errorMsg}`);
      throw new Error(`Meta Create Live Broadcast failed: ${errorMsg}`);
    }
  }

  async getBroadcastStatus(pageAccessToken, liveVideoId) {
    try {
      const response = await axios.get(`${this.baseUrl}/${liveVideoId}`, {
        params: {
          fields: 'id,status,creation_time,live_views,stream_url,secure_stream_url,video{id,published}',
          access_token: pageAccessToken
        }
      });

      return {
        id: response.data.id,
        status: response.data.status,
        creationTime: response.data.creation_time,
        liveViews: response.data.live_views || 0,
        streamUrl: response.data.stream_url,
        secureStreamUrl: response.data.secure_stream_url,
        published: response.data.video?.published ?? (response.data.status === 'LIVE' || response.data.status === 'LIVE_NOW')
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to get Meta Live Broadcast status for ${liveVideoId}: ${errorMsg}`);
      throw new Error(`Meta Get Live Status failed: ${errorMsg}`);
    }
  }

  async publishBroadcast(pageAccessToken, liveVideoId) {
    try {
      const response = await axios.post(`${this.baseUrl}/${liveVideoId}`, {
        status: 'LIVE_NOW'
      }, {
        params: {
          access_token: pageAccessToken
        }
      });

      logger.info(`Successfully published Meta Live Broadcast ${liveVideoId} to LIVE_NOW`);
      return {
        success: true,
        id: liveVideoId,
        data: response.data
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to publish Meta Live Broadcast ${liveVideoId}: ${errorMsg}`);
      throw new Error(`Meta Publish Live Broadcast failed: ${errorMsg}`);
    }
  }

  async endBroadcast(pageAccessToken, liveVideoId) {
    try {
      const response = await axios.post(`${this.baseUrl}/${liveVideoId}`, {
        end_live_video: true
      }, {
        params: {
          access_token: pageAccessToken
        }
      });

      logger.info(`Successfully terminated Meta Live Broadcast ${liveVideoId}`);
      return {
        success: response.data?.success || true,
        id: liveVideoId
      };
    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      logger.error(`Failed to end Meta Live Broadcast ${liveVideoId}: ${errorMsg}`);
      // Return non-throwing response if broadcast was already finished
      return {
        success: false,
        id: liveVideoId,
        error: errorMsg
      };
    }
  }
}

module.exports = MetaFacebookProvider;
