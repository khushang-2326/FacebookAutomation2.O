const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { MediaService } = require('../services/mediaService');
const config = require('../config/config');
const { Logger } = require('../utils/logger');

const logger = new Logger('MediaController');

// @desc    Upload media file(s) (Video, Image, or Audio)
// @route   POST /api/media/upload
exports.uploadMedia = async (req, res, next) => {
  try {
    const files = req.files && req.files.length > 0 ? req.files : (req.file ? [req.file] : []);
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'Please upload a video, image, or audio file' });
    }

    const targetMediaType = req.body?.mediaType || req.body?.type || req.body?.targetMediaType || null;
    const processed = [];
    for (const f of files) {
      const media = await MediaService.processUploadedFile(req.user._id, f, targetMediaType);
      processed.push(media);
    }

    res.status(201).json({
      success: true,
      media: processed[0],
      items: processed
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all media for logged in user
// @route   GET /api/media
exports.getMediaList = async (req, res, next) => {
  try {
    const mediaList = await Media.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({
      success: true,
      count: mediaList.length,
      media: mediaList
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single media by ID
// @route   GET /api/media/:id
exports.getMediaById = async (req, res, next) => {
  try {
    const media = await Media.findOne({ _id: req.params.id, userId: req.user._id });
    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    res.json({
      success: true,
      media
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Stream lightweight video preview for in-app low-load monitoring (360p)
// @route   GET /api/media/preview/:filenameOrId
exports.getMediaPreview = async (req, res, next) => {
  try {
    const { filenameOrId } = req.params;
    let targetFilePath = null;
    let targetFilename = null;

    if (mongoose.Types.ObjectId.isValid(filenameOrId)) {
      const media = await Media.findById(filenameOrId);
      if (media) {
        targetFilePath = media.filePath;
        targetFilename = media.filename;
      }
    }

    if (!targetFilePath) {
      targetFilename = filenameOrId;
      const candidatePath = path.join(config.media.uploadDir, targetFilename);
      if (fs.existsSync(candidatePath)) {
        targetFilePath = candidatePath;
      } else {
        const media = await Media.findOne({ filename: targetFilename });
        if (media && fs.existsSync(media.filePath)) {
          targetFilePath = media.filePath;
        }
      }
    }

    if (!targetFilePath || !fs.existsSync(targetFilePath)) {
      return res.status(404).json({ success: false, error: 'Media file not found' });
    }

    const previewInfo = await MediaService.getOrCreateVideoPreview(targetFilePath, targetFilename);
    const fileToStream = (previewInfo && fs.existsSync(previewInfo.previewFilePath))
      ? previewInfo.previewFilePath
      : targetFilePath;

    const stat = fs.statSync(fileToStream);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(fileToStream, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(fileToStream).pipe(res);
    }
  } catch (error) {
    logger.warn(`Error streaming media preview: ${error.message}`);
    next(error);
  }
};

// @desc    Delete media
// @route   DELETE /api/media/:id
exports.deleteMedia = async (req, res, next) => {
  try {
    await MediaService.deleteMedia(req.params.id, req.user._id);
    res.json({
      success: true,
      message: 'Media deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create Sample Demo Media (for instant 1-click test runs)
// @route   POST /api/media/sample
exports.createSampleMedia = async (req, res, next) => {
  try {
    const type = req.body.type || 'VIDEO'; // 'VIDEO', 'IMAGE', or 'AUDIO'
    const sampleDir = config.media.uploadDir;
    if (!fs.existsSync(sampleDir)) {
      fs.mkdirSync(sampleDir, { recursive: true });
    }

    let filename = 'sample-demo-video.mp4';
    let originalName = 'Sample 1080p 60fps Promo Video.mp4';
    let mimeType = 'video/mp4';
    let durationSec = 120;
    let width = 1920;
    let height = 1080;
    let codec = 'h264';

    const filePath = path.join(sampleDir, filename);

    if (type === 'IMAGE') {
      filename = 'sample-demo-poster.jpg';
      originalName = 'Sample Live Event Poster.jpg';
      mimeType = 'image/jpeg';
      durationSec = 0;
      codec = 'jpeg';
      const { mediaToolResolver } = require('../services/mediaToolResolver');
      const ffmpegBin = mediaToolResolver.getFFmpegPath();
      const { execSync } = require('child_process');
      try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100) {
          execSync(`"${ffmpegBin}" -y -f lavfi -i "color=c=navy:s=1920x1080:d=1" -frames:v 1 "${filePath}"`, { stdio: 'ignore' });
        }
      } catch (_) {}
    } else if (type === 'VIDEO') {
      const { mediaToolResolver } = require('../services/mediaToolResolver');
      const ffmpegBin = mediaToolResolver.getFFmpegPath();
      const { execSync } = require('child_process');
      try {
        if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 100) {
          execSync(`"${ffmpegBin}" -y -f lavfi -i "testsrc=size=1920x1080:rate=30" -f lavfi -i "sine=frequency=1000:duration=10" -t 10 -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 128k "${filePath}"`, { stdio: 'ignore' });
        }
      } catch (_) {}
    } else if (type === 'AUDIO') {
      const existingAudioCount = await Media.countDocuments({ userId: req.user._id, mediaType: 'AUDIO' });
      const trackIndex = existingAudioCount + 1;
      filename = `sample-track-${trackIndex}-${Date.now()}.mp3`;
      originalName = `Demo Backing Track #${trackIndex} (Acoustic).mp3`;
      mimeType = 'audio/mpeg';
      durationSec = 60;
      width = 0;
      height = 0;
      codec = 'mp3';

      const audioFilePath = path.join(sampleDir, filename);
      const { mediaToolResolver } = require('../services/mediaToolResolver');
      const ffmpegBin = mediaToolResolver.getFFmpegPath();
      const chordFrequencies = [261.63, 329.63, 392.00, 523.25, 440.00];
      const freq = chordFrequencies[(trackIndex - 1) % chordFrequencies.length];
      const { execSync } = require('child_process');
      try {
        execSync(`"${ffmpegBin}" -y -f lavfi -i "sine=frequency=${freq}:duration=60" -c:a libmp3lame -b:a 128k -ar 44100 "${audioFilePath}"`, { stdio: 'ignore' });
      } catch (e) {
        fs.writeFileSync(audioFilePath, Buffer.from('DEMO_SAMPLE_MEDIA_BUFFER_DATA'));
      }
    }

    const finalPath = path.join(sampleDir, filename);

    // Fallback if file creation failed
    if (!fs.existsSync(finalPath)) {
      fs.writeFileSync(finalPath, Buffer.from('DEMO_SAMPLE_MEDIA_BUFFER_DATA'));
    }

    const media = await Media.create({
      userId: req.user._id,
      filename,
      originalName,
      filePath,
      mimeType,
      mediaType: type,
      fileSizeBytes: 5242880, // 5MB
      durationSec,
      width,
      height,
      hasAudio: true,
      codec
    });

    logger.info(`Created demo sample ${type} media for user ${req.user._id}`);

    res.status(201).json({
      success: true,
      media
    });
  } catch (error) {
    next(error);
  }
};
