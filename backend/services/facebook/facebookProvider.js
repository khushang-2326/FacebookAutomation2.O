/**
 * Base Facebook Provider Interface
 * Both MetaFacebookProvider and MockFacebookProvider implement this contract.
 */
class FacebookProvider {
  /**
   * Generates the OAuth login URL
   * @param {string} state - Random CSRF state token
   * @returns {string} Login URL
   */
  getOAuthUrl(state) {
    throw new Error('Method getOAuthUrl must be implemented');
  }

  /**
   * Exchanges authorization code for long-lived user access token
   * @param {string} code - OAuth authorization code
   * @returns {Promise<{ accessToken: string, expiresIn: number, fbUserId: string, name: string, email?: string }>}
   */
  async exchangeCodeForToken(code) {
    throw new Error('Method exchangeCodeForToken must be implemented');
  }

  /**
   * Fetches all Facebook Pages managed by the user with page access tokens
   * @param {string} userAccessToken - User's access token
   * @returns {Promise<Array<{ pageId: string, name: string, category: string, pictureUrl?: string, pageAccessToken: string, tasks: string[] }>>}
   */
  async getPages(userAccessToken) {
    throw new Error('Method getPages must be implemented');
  }

  /**
   * Creates a live video broadcast for a Facebook Page
   * @param {string} pageAccessToken - Page access token
   * @param {string} pageId - Facebook Page ID
   * @param {{ title: string, description?: string, plannedStartTime?: Date }} options
   * @returns {Promise<{ id: string, streamUrl: string, secureStreamUrl: string, status: string }>}
   */
  async createLiveBroadcast(pageAccessToken, pageId, options = {}) {
    throw new Error('Method createLiveBroadcast must be implemented');
  }

  /**
   * Retrieves current status of a live broadcast
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<{ id: string, status: string, creationTime: string, liveViews?: number }>}
   */
  async getBroadcastStatus(pageAccessToken, liveVideoId) {
    throw new Error('Method getBroadcastStatus must be implemented');
  }

  /**
   * Publishes/Activates an unpublished or scheduled live broadcast to LIVE_NOW
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<{ success: boolean, id: string }>}
   */
  async publishBroadcast(pageAccessToken, liveVideoId) {
    throw new Error('Method publishBroadcast must be implemented');
  }

  /**
   * Ends/terminates a live broadcast
   * @param {string} pageAccessToken - Page access token
   * @param {string} liveVideoId - Live video ID
   * @returns {Promise<{ success: boolean, id: string }>}
   */
  async endBroadcast(pageAccessToken, liveVideoId) {
    throw new Error('Method endBroadcast must be implemented');
  }
}

module.exports = FacebookProvider;
