const facebookAuthService = require('../services/facebook/facebookAuthService');
const FacebookAccount = require('../models/FacebookAccount');
const FacebookPage = require('../models/FacebookPage');
const { Logger } = require('../utils/logger');

const logger = new Logger('FacebookAuthController');

// @desc    Initiate Facebook OAuth Login (Redirects browser or returns authUrl)
// @route   GET /api/facebook/login
exports.login = async (req, res, next) => {
  try {
    const state = JSON.stringify({ timestamp: Date.now() });
    const isMock = req.query.mock === 'true';
    const authUrl = facebookAuthService.getOAuthUrl(state, isMock);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true, authUrl });
    }

    return res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

// @desc    Handle Facebook OAuth Callback
// @route   GET /api/facebook/callback
exports.callback = async (req, res, next) => {
  try {
    const { code, state, isMock, error, error_description } = req.query;

    if (error) {
      logger.error(`Facebook OAuth error callback: ${error_description || error}`);
      return res.redirect(`/login?error=${encodeURIComponent(error_description || error)}`);
    }

    const effectiveCode = code || (req.body && req.body.code);
    if (!effectiveCode) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    const isMockOverride = isMock === 'true' || Boolean(req.body && req.body.isMock);
    const tokenData = await facebookAuthService.exchangeCodeForToken(effectiveCode, isMockOverride);
    const authResult = await facebookAuthService.findOrCreateUserAndGenerateJwt(tokenData);

    logger.info(`User "${authResult.user.email}" authenticated via Facebook OAuth`);

    if (req.headers.accept && req.headers.accept.includes('application/json') && !req.query.code) {
      return res.json({
        success: true,
        token: authResult.token,
        user: authResult.user
      });
    }

    // Redirect to frontend dashboard with token in URL query
    return res.redirect(`/?token=${authResult.token}&fb_connected=true`);
  } catch (error) {
    logger.error(`Facebook Auth Callback Failed: ${error.message}`);
    return res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
};

// @desc    Get Facebook connection status for active user
// @route   GET /api/facebook/status
exports.getStatus = async (req, res, next) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.user._id });
    const pagesCount = await FacebookPage.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      connected: Boolean(account),
      account: account ? {
        id: account._id,
        name: account.name,
        email: account.email,
        fbUserId: account.fbUserId,
        isMock: account.isMock
      } : null,
      pagesCount
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Disconnect Facebook Account & Sessions
// @route   POST /api/facebook/logout
exports.logout = async (req, res, next) => {
  try {
    const account = await FacebookAccount.findOne({ userId: req.user._id });
    if (account) {
      await FacebookPage.deleteMany({ facebookAccountId: account._id });
      await FacebookAccount.deleteOne({ _id: account._id });
    }

    res.json({
      success: true,
      message: 'Facebook account disconnected successfully.'
    });
  } catch (error) {
    next(error);
  }
};
