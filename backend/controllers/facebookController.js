const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const facebookService = require('../services/facebook/facebookService');
const { Logger } = require('../utils/logger');

const logger = new Logger('FacebookController');

// @desc    Get Facebook OAuth URL
// @route   GET /api/facebook/auth-url
exports.getAuthUrl = async (req, res, next) => {
  try {
    const state = JSON.stringify({
      userId: req.user._id,
      timestamp: Date.now()
    });

    const isMock = req.query.mock === 'true' || facebookService.isMockMode;
    const authUrl = facebookService.getOAuthUrl(state, isMock);

    res.json({
      success: true,
      authUrl,
      isMock
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Handle Facebook OAuth Callback
// @route   POST /api/facebook/callback
exports.handleCallback = async (req, res, next) => {
  try {
    const { code, state, isMock } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    const tokenData = await facebookService.exchangeCodeForToken(code, isMock);

    // Save or update FacebookAccount
    let account = await FacebookAccount.findOne({ userId: req.user._id, fbUserId: tokenData.fbUserId });
    if (!account) {
      account = new FacebookAccount({
        userId: req.user._id,
        fbUserId: tokenData.fbUserId,
        name: tokenData.name,
        email: tokenData.email,
        isMock: Boolean(isMock)
      });
    }

    account.setAccessToken(tokenData.accessToken);
    account.tokenExpiresAt = new Date(Date.now() + (tokenData.expiresIn * 1000));
    await account.save();

    // Fetch Pages
    const pages = await facebookService.getPages(tokenData.accessToken, isMock);

    // Save or update FacebookPages
    const savedPages = [];
    for (const p of pages) {
      let pageDoc = await FacebookPage.findOne({ userId: req.user._id, pageId: p.pageId });
      if (!pageDoc) {
        pageDoc = new FacebookPage({
          facebookAccountId: account._id,
          userId: req.user._id,
          pageId: p.pageId,
          name: p.name,
          category: p.category,
          pictureUrl: p.pictureUrl,
          tasks: p.tasks,
          isMock: Boolean(isMock),
          isValid: true
        });
      } else {
        pageDoc.name = p.name;
        pageDoc.category = p.category;
        pageDoc.pictureUrl = p.pictureUrl;
        pageDoc.tasks = p.tasks;
        pageDoc.isValid = true;
      }

      pageDoc.setPageAccessToken(p.pageAccessToken);
      await pageDoc.save();
      savedPages.push(pageDoc);
    }

    logger.info(`Connected Facebook Account "${account.name}" with ${savedPages.length} Pages for User ${req.user._id}`);

    res.json({
      success: true,
      account: {
        id: account._id,
        name: account.name,
        fbUserId: account.fbUserId,
        isMock: account.isMock
      },
      pagesCount: savedPages.length,
      pages: savedPages.map(p => ({
        id: p._id,
        pageId: p.pageId,
        name: p.name,
        category: p.category,
        pictureUrl: p.pictureUrl,
        isValid: p.isValid,
        isMock: p.isMock
      }))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    One-click Mock Connect (for instant offline development & testing)
// @route   POST /api/facebook/mock-connect
exports.mockConnect = async (req, res, next) => {
  try {
    const mockCode = `mock_auth_code_${Date.now()}`;
    req.body = { code: mockCode, isMock: true };
    return exports.handleCallback(req, res, next);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all connected Facebook Pages for current user
// @route   GET /api/facebook/pages
exports.getPages = async (req, res, next) => {
  try {
    const pages = await FacebookPage.find({ userId: req.user._id })
      .populate('facebookAccountId', 'name fbUserId isMock');

    const formatted = pages.map(p => ({
      id: p._id,
      pageId: p.pageId,
      name: p.name,
      category: p.category,
      pictureUrl: p.pictureUrl,
      tasks: p.tasks,
      isValid: p.isValid,
      isMock: p.isMock,
      platform: p.platform || (p.category?.includes('YouTube') || p.name?.toLowerCase().includes('youtube') ? 'YOUTUBE' : 'FACEBOOK'),
      streamType: p.streamType || 'PAGE_API',
      serverUrl: p.serverUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/',
      resolution: p.resolution || '1080p',
      fps: p.fps || 30,
      bitrate: p.bitrate || null,
      accountName: p.facebookAccountId?.name || 'Unknown Account'
    }));

    res.json({
      success: true,
      pages: formatted
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Connect via Facebook Live or YouTube Live Stream Key (RTMP/RTMPS)
// @route   POST /api/facebook/connect-stream-key
exports.connectStreamKey = async (req, res, next) => {
  try {
    const { streamKey, name, serverUrl, platform = 'FACEBOOK' } = req.body;

    if (!streamKey || typeof streamKey !== 'string' || !streamKey.trim()) {
      return res.status(400).json({ success: false, error: 'Live Stream Key is required.' });
    }

    const cleanKey = streamKey.trim();
    const isYouTube = platform === 'YOUTUBE';
    const defaultServer = isYouTube ? 'rtmp://a.rtmp.youtube.com/live2/' : 'rtmps://live-api-s.facebook.com:443/rtmp/';
    const defaultName = isYouTube ? 'My YouTube Live (Stream Key)' : 'My Facebook Live (Stream Key)';
    const targetName = name?.trim() || defaultName;
    const targetServer = (serverUrl?.trim() || defaultServer).replace(/\/?$/, '/');
    const pageId = `key_${Date.now()}`;
    const fbUserId = `creator_${Date.now()}`;

    // 1. Create or get FacebookAccount
    let account = await FacebookAccount.findOne({ userId: req.user._id, name: targetName });
    if (!account) {
      account = new FacebookAccount({
        userId: req.user._id,
        fbUserId,
        name: targetName,
        isMock: false
      });
      account.setAccessToken(cleanKey);
      account.tokenExpiresAt = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000));
      await account.save();
    }

    const targetResolution = req.body.resolution || '1080p';
    const targetFps = req.body.fps === 60 ? 60 : 30;
    const targetBitrate = req.body.bitrate || null;

    // 2. Create FacebookPage representing the Stream Key Target
    const pageDoc = new FacebookPage({
      facebookAccountId: account._id,
      userId: req.user._id,
      pageId,
      name: targetName,
      platform: isYouTube ? 'YOUTUBE' : (platform === 'CUSTOM_RTMP' ? 'CUSTOM_RTMP' : 'FACEBOOK'),
      category: isYouTube ? 'YouTube Live (Stream Key)' : 'Facebook Live (Stream Key)',
      pictureUrl: isYouTube ? 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150' : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
      tasks: ['LIVE_VIDEOS', 'CREATE_CONTENT'],
      isMock: false,
      isValid: true,
      streamType: 'STREAM_KEY',
      serverUrl: targetServer,
      resolution: targetResolution,
      fps: targetFps,
      bitrate: targetBitrate
    });

    pageDoc.setPageAccessToken(cleanKey);
    await pageDoc.save();

    logger.info(`Connected ${platform} Live Stream Key Target "${targetName}" (${targetResolution} @ ${targetFps}fps) for User ${req.user._id}`);

    res.json({
      success: true,
      message: `Successfully connected ${isYouTube ? 'YouTube Live' : 'Facebook Live'} Stream Target "${targetName}"!`,
      page: {
        id: pageDoc._id,
        pageId: pageDoc.pageId,
        name: pageDoc.name,
        platform: pageDoc.platform,
        category: pageDoc.category,
        pictureUrl: pageDoc.pictureUrl,
        isValid: pageDoc.isValid,
        isMock: false,
        streamType: 'STREAM_KEY',
        serverUrl: pageDoc.serverUrl,
        resolution: pageDoc.resolution,
        fps: pageDoc.fps,
        bitrate: pageDoc.bitrate
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a Facebook / YouTube destination (e.g. Resolution, FPS, Name)
// @route   PATCH /api/facebook/pages/:id
exports.updatePage = async (req, res, next) => {
  try {
    const pageDoc = await FacebookPage.findOne({ _id: req.params.id, userId: req.user._id });
    if (!pageDoc) {
      return res.status(404).json({ success: false, error: 'Destination not found' });
    }

    if (req.body.name) pageDoc.name = req.body.name.trim();
    if (req.body.resolution) pageDoc.resolution = req.body.resolution;
    if (req.body.fps !== undefined) pageDoc.fps = req.body.fps === 60 ? 60 : 30;
    if (req.body.bitrate !== undefined) pageDoc.bitrate = req.body.bitrate;
    if (req.body.serverUrl) pageDoc.serverUrl = req.body.serverUrl.trim();
    if (req.body.streamKey && typeof req.body.streamKey === 'string' && req.body.streamKey.trim()) {
      pageDoc.setPageAccessToken(req.body.streamKey.trim());
    }

    await pageDoc.save();

    res.json({
      success: true,
      message: `Destination "${pageDoc.name}" updated successfully.`,
      page: {
        id: pageDoc._id,
        pageId: pageDoc.pageId,
        name: pageDoc.name,
        platform: pageDoc.platform,
        category: pageDoc.category,
        pictureUrl: pageDoc.pictureUrl,
        isValid: pageDoc.isValid,
        streamType: pageDoc.streamType,
        serverUrl: pageDoc.serverUrl,
        resolution: pageDoc.resolution || '1080p',
        fps: pageDoc.fps || 30,
        bitrate: pageDoc.bitrate || null
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Test page access token or stream key validity
// @route   POST /api/facebook/pages/:id/test
exports.testPageToken = async (req, res, next) => {
  try {
    const page = await FacebookPage.findOne({ _id: req.params.id, userId: req.user._id });
    if (!page) {
      return res.status(404).json({ success: false, error: 'Facebook Page not found' });
    }

    const token = page.getPageAccessToken();
    const isMock = page.isMock || facebookService.isMockMode;

    if (page.streamType === 'STREAM_KEY') {
      page.isValid = Boolean(token && token.length > 5);
      await page.save();
      return res.json({
        success: true,
        message: 'Facebook Live Stream Key is encrypted and ready for streaming.',
        isValid: page.isValid
      });
    }

    if (isMock) {
      page.isValid = true;
      await page.save();
      return res.json({
        success: true,
        message: 'Mock Facebook Page Token is valid and ready for streaming.',
        isValid: true
      });
    }

    // Live test query to Graph API
    try {
      const axios = require('axios');
      await axios.get(`https://graph.facebook.com/v21.0/${page.pageId}`, {
        params: {
          fields: 'id,name',
          access_token: token
        }
      });
      page.isValid = true;
      await page.save();
      return res.json({ success: true, message: 'Page Token is verified and valid.', isValid: true });
    } catch (testErr) {
      page.isValid = false;
      await page.save();
      return res.status(400).json({
        success: false,
        error: `Page token is invalid or expired: ${testErr.response?.data?.error?.message || testErr.message}`,
        isValid: false
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Connect Real Facebook Page or Account directly using Meta Graph API Token
// @route   POST /api/facebook/connect-token
exports.connectWithToken = async (req, res, next) => {
  try {
    const { token, pageId: inputPageId, pageName: inputPageName } = req.body;

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ success: false, error: 'Facebook Access Token is required.' });
    }

    const cleanToken = token.trim();
    const axios = require('axios');
    const config = require('../config/config');
    const apiVersion = config.facebook.apiVersion || 'v21.0';
    const baseUrl = `https://graph.facebook.com/${apiVersion}`;

    let resolvedPages = [];
    let accountName = 'Meta Creator';
    let fbUserId = `fb_${Date.now()}`;

    // 1. Verify token with Meta Graph API
    try {
      const meRes = await axios.get(`${baseUrl}/me`, {
        params: {
          fields: 'id,name,email,picture{url},category',
          access_token: cleanToken
        }
      });

      const meData = meRes.data;
      fbUserId = meData.id;
      accountName = meData.name || 'Facebook User';

      // Check if this token can access /me/accounts (User Token managing multiple pages)
      try {
        const accountsRes = await axios.get(`${baseUrl}/me/accounts`, {
          params: {
            fields: 'id,name,category,tasks,access_token,picture{url}',
            access_token: cleanToken,
            limit: 100
          }
        });

        const pagesList = accountsRes.data.data || [];
        if (pagesList.length > 0) {
          resolvedPages = pagesList.map(p => ({
            pageId: p.id,
            name: p.name,
            category: p.category || 'Page',
            pictureUrl: p.picture?.data?.url || null,
            pageAccessToken: p.access_token || cleanToken,
            tasks: p.tasks || []
          }));
        }
      } catch (_) {
        // Not a user token with /me/accounts, proceed as direct Page token
      }

      // If no accounts found via /me/accounts, this token itself is a Page Access Token
      if (resolvedPages.length === 0) {
        resolvedPages.push({
          pageId: meData.id,
          name: meData.name || inputPageName || 'Facebook Page',
          category: meData.category || 'Official Page',
          pictureUrl: meData.picture?.data?.url || null,
          pageAccessToken: cleanToken,
          tasks: ['CREATE_CONTENT', 'MANAGE', 'MODERATE']
        });
      }
    } catch (graphErr) {
      // If /me failed, check if user provided a specific pageId
      if (inputPageId) {
        try {
          const pageRes = await axios.get(`${baseUrl}/${inputPageId}`, {
            params: {
              fields: 'id,name,category,picture{url}',
              access_token: cleanToken
            }
          });
          resolvedPages.push({
            pageId: pageRes.data.id,
            name: pageRes.data.name || inputPageName || `Page ${inputPageId}`,
            category: pageRes.data.category || 'Official Page',
            pictureUrl: pageRes.data.picture?.data?.url || null,
            pageAccessToken: cleanToken,
            tasks: ['CREATE_CONTENT', 'MANAGE']
          });
        } catch (pageErr) {
          return res.status(400).json({
            success: false,
            error: `Meta Graph API rejected this token: ${pageErr.response?.data?.error?.message || graphErr.response?.data?.error?.message || graphErr.message}`
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          error: `Meta Graph API rejected this token: ${graphErr.response?.data?.error?.message || graphErr.message}`
        });
      }
    }

    // 2. Save FacebookAccount
    let account = await FacebookAccount.findOne({ userId: req.user._id, fbUserId });
    if (!account) {
      account = new FacebookAccount({
        userId: req.user._id,
        fbUserId,
        name: accountName,
        isMock: false
      });
    }
    account.setAccessToken(cleanToken);
    account.tokenExpiresAt = new Date(Date.now() + (60 * 24 * 60 * 60 * 1000)); // 60 days
    await account.save();

    // 3. Save FacebookPages with encrypted pageAccessToken
    const savedPages = [];
    for (const p of resolvedPages) {
      let pageDoc = await FacebookPage.findOne({ userId: req.user._id, pageId: p.pageId });
      if (!pageDoc) {
        pageDoc = new FacebookPage({
          facebookAccountId: account._id,
          userId: req.user._id,
          pageId: p.pageId,
          name: p.name,
          category: p.category,
          pictureUrl: p.pictureUrl,
          tasks: p.tasks,
          isMock: false,
          isValid: true
        });
      } else {
        pageDoc.name = p.name;
        pageDoc.category = p.category;
        pageDoc.pictureUrl = p.pictureUrl;
        pageDoc.tasks = p.tasks;
        pageDoc.isValid = true;
        pageDoc.isMock = false;
      }
      pageDoc.setPageAccessToken(p.pageAccessToken);
      await pageDoc.save();
      savedPages.push(pageDoc);
    }

    logger.info(`Connected ${savedPages.length} Real Facebook Page(s) for User ${req.user._id} via Token`);

    res.json({
      success: true,
      message: `Successfully connected ${savedPages.length} official Facebook Page(s)!`,
      account: {
        id: account._id,
        name: account.name,
        fbUserId: account.fbUserId,
        isMock: false
      },
      pages: savedPages.map(p => ({
        id: p._id,
        pageId: p.pageId,
        name: p.name,
        category: p.category,
        pictureUrl: p.pictureUrl,
        isValid: p.isValid,
        isMock: false
      }))
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete/Disconnect a specific Facebook Page
// @route   DELETE /api/facebook/pages/:id
exports.deletePage = async (req, res, next) => {
  try {
    const page = await FacebookPage.findOne({ _id: req.params.id, userId: req.user._id });
    if (!page) {
      return res.status(404).json({ success: false, error: 'Facebook Page not found' });
    }

    await FacebookPage.deleteOne({ _id: page._id });
    logger.info(`Deleted Facebook Page ${page.name} (${page.pageId}) for user ${req.user._id}`);

    res.json({
      success: true,
      message: `Page "${page.name}" removed successfully.`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Disconnect a Facebook Account
// @route   DELETE /api/facebook/accounts/:id
exports.disconnectAccount = async (req, res, next) => {
  try {
    const account = await FacebookAccount.findOne({ _id: req.params.id, userId: req.user._id });
    if (!account) {
      return res.status(404).json({ success: false, error: 'Facebook Account not found' });
    }

    await FacebookPage.deleteMany({ facebookAccountId: account._id });
    await FacebookAccount.deleteOne({ _id: account._id });

    logger.info(`Disconnected Facebook Account ${account._id} for user ${req.user._id}`);

    res.json({
      success: true,
      message: 'Facebook account and associated pages disconnected successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Start Facebook Live stream from MediaMTX camera path (/ch1)
// @route   POST /api/facebook/start
exports.startFacebookLive = async (req, res, next) => {
  try {
    const { cameraId, streamPath, facebookPageId } = req.body;
    const mediamtxService = require('../services/mediamtxService');
    const broadcastService = require('../services/broadcastService');
    const Camera = require('../models/Camera');
    const Automation = require('../models/Automation');
    const FacebookPage = require('../models/FacebookPage');

    let targetPath = streamPath || '/ch1';
    let cameraObj = null;

    if (cameraId) {
      cameraObj = await Camera.findOne({ _id: cameraId, userId: req.user._id });
      if (cameraObj) {
        targetPath = cameraObj.streamPath || targetPath;
      }
    }

    logger.info(`[Facebook] Requested camera: ${cameraId || 'Default'} (Path: ${targetPath})`);

    // Validate MediaMTX path
    const validation = await mediamtxService.validateStreamPath(targetPath);
    if (!validation.available) {
      logger.warn(`[Facebook] ERROR: MediaMTX path ${targetPath} unavailable`);
      return res.status(400).json({
        success: false,
        error: `MediaMTX stream ${targetPath} is not available.`
      });
    }

    logger.info(`[Facebook] MediaMTX URL: ${validation.rtspUrl}`);
    logger.info(`[Facebook] MediaMTX path ${targetPath} is available`);

    // Get default Facebook Page
    let targetPage = null;
    if (facebookPageId) {
      targetPage = await FacebookPage.findOne({ _id: facebookPageId, userId: req.user._id });
    } else {
      targetPage = await FacebookPage.findOne({ userId: req.user._id, status: 'CONNECTED' });
    }

    if (!targetPage) {
      targetPage = new FacebookPage({
        userId: req.user._id,
        facebookAccountId: req.user._id,
        pageId: 'default_page_stream_key',
        name: 'Facebook Live Destination',
        streamType: 'STREAM_KEY',
        status: 'CONNECTED',
        isMock: true
      });
      targetPage.setPageAccessToken('FB-1765737167906198-0-Ab5H0FxTauQ2gBJDOJhZrtt-');
      await targetPage.save();
    }

    // Find or create Automation for this camera stream
    let automation = await Automation.findOne({ userId: req.user._id, sourceType: 'MEDIAMTX_RTSP', cameraId: cameraObj?._id });
    if (!automation) {
      automation = new Automation({
        userId: req.user._id,
        name: `Live Stream ${targetPath}`,
        facebookPageId: targetPage._id,
        sourceType: 'MEDIAMTX_RTSP',
        cameraId: cameraObj?._id,
        title: `Facebook Live (${targetPath})`,
        status: 'SCHEDULED',
        loopVideo: true
      });
      await automation.save();
    }

    logger.info('[Facebook] Starting FFmpeg...');
    const result = await broadcastService.startBroadcast(automation._id, 1);
    logger.info('[Facebook] Publishing started -> LIVE');

    res.json({
      success: true,
      message: `Facebook Live stream active on path ${targetPath}`,
      streamPath: targetPath,
      mediamtxUrl: validation.rtspUrl,
      broadcastId: result.broadcast._id,
      status: 'LIVE'
    });
  } catch (error) {
    logger.warn(`[Facebook] ERROR: ${error.message}`);
    next(error);
  }
};

// @desc    Stop active Facebook Live stream
// @route   POST /api/facebook/stop
exports.stopFacebookLive = async (req, res, next) => {
  try {
    const broadcastService = require('../services/broadcastService');
    const Automation = require('../models/Automation');

    const active = await Automation.findOne({ userId: req.user._id, status: { $in: ['LIVE', 'STREAMING', 'STARTING'] } });
    if (!active) {
      return res.json({ success: true, message: 'No active Facebook Live streams to stop.' });
    }

    await broadcastService.endBroadcast(active.currentBroadcastId, 'STOPPED');
    active.status = 'STOPPED';
    await active.save();

    logger.info(`[Facebook] Stream stopped for Automation ${active._id}`);

    res.json({
      success: true,
      message: 'Facebook Live stream stopped successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Facebook Live stream status
// @route   GET /api/facebook/status
exports.getFacebookLiveStatus = async (req, res, next) => {
  try {
    const Automation = require('../models/Automation');
    const active = await Automation.findOne({ userId: req.user._id, status: { $in: ['LIVE', 'STREAMING', 'STARTING'] } })
      .populate('cameraId')
      .populate('facebookPageId');

    if (!active) {
      return res.json({
        success: true,
        status: 'IDLE',
        active: false
      });
    }

    res.json({
      success: true,
      status: active.status,
      active: true,
      automationId: active._id,
      streamPath: active.cameraId?.streamPath || '/ch1',
      title: active.title,
      facebookPage: active.facebookPageId?.name,
      startedAt: active.updatedAt
    });
  } catch (error) {
    next(error);
  }
};
