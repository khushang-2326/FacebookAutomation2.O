const Broadcast = require('../models/Broadcast');
const broadcastService = require('../services/broadcastService');
const ffmpegService = require('../services/ffmpegService');
const { gstreamerService } = require('../services/gstreamerService');

// @desc    Get all broadcasts history with filters
// @route   GET /api/broadcasts
exports.getBroadcasts = async (req, res, next) => {
  try {
    const { automationId, status, limit = 50, page = 1 } = req.query;
    const filter = {};

    if (automationId) filter.automationId = automationId;
    if (status) filter.status = status;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const broadcasts = await Broadcast.find(filter)
      .populate('automationId', 'name title')
      .populate('facebookPageId', 'name pageId pictureUrl')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    const total = await Broadcast.countDocuments(filter);

    res.json({
      success: true,
      count: broadcasts.length,
      total,
      page: parseInt(page, 10),
      pages: Math.ceil(total / parseInt(limit, 10)),
      broadcasts
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single broadcast details
// @route   GET /api/broadcasts/:id
exports.getBroadcastById = async (req, res, next) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id)
      .populate('automationId')
      .populate('facebookPageId', 'name pageId pictureUrl');

    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast session not found' });
    }

    const bId = broadcast._id.toString();
    const gstEntry = gstreamerService.activeProcesses.get(bId);
    const activeEntry = gstEntry || ffmpegService.activeProcesses.get(bId);

    res.json({
      success: true,
      broadcast,
      mediaEngine: gstEntry ? 'GSTREAMER' : (activeEntry ? 'FFMPEG' : 'NONE'),
      liveTelemetry: activeEntry ? (activeEntry.metrics || null) : null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    End specific broadcast
// @route   POST /api/broadcasts/:id/end
exports.endBroadcast = async (req, res, next) => {
  try {
    const broadcast = await broadcastService.endBroadcast(req.params.id, 'MANUAL_USER_STOP');
    res.json({
      success: true,
      broadcast
    });
  } catch (error) {
    next(error);
  }
};
