const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const config = require('../config/config');
const Media = require('../models/Media');
const { Logger } = require('../utils/logger');

const logger = new Logger('MediaService');

const { mediaToolResolver } = require('./mediaToolResolver');

function getFfmpegPath() {
  return mediaToolResolver.getFFmpegPath();
}

function getFfprobePath() {
  return mediaToolResolver.getFFprobePath();
}

const ffmpegBin = getFfmpegPath();
const ffprobeBin = getFfprobePath();
ffmpeg.setFfmpegPath(ffmpegBin);
ffmpeg.setFfprobePath(ffprobeBin);

// Ensure upload directory exists
if (!fs.existsSync(config.media.uploadDir)) {
  try { fs.mkdirSync(config.media.uploadDir, { recursive: true }); } catch (_) {}
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(config.media.uploadDir)) {
        fs.mkdirSync(config.media.uploadDir, { recursive: true });
      }
    } catch (_) {}
    cb(null, config.media.uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.mp4';
    cb(null, `media-${uniqueSuffix}${ext}`);
  }
});

// Multer Filter (Accept all valid video, image, and audio types including all MPEG/MPG containers and streams)
const fileFilter = (req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const name = (file.originalname || '').toLowerCase();

  const isVideo =
    mime.startsWith('video/') ||
    mime.includes('mpeg') ||
    mime.includes('mp4') ||
    mime.includes('quicktime') ||
    name.match(/\.(mp4|mov|mkv|webm|avi|flv|wmv|m4v|3gp|mpeg|mpg|mpe|m2v|ts|m2ts|mts|vob|ogv|divx)$/i);

  const isImage =
    mime.startsWith('image/') ||
    name.match(/\.(jpg|jpeg|png|webp|gif|bmp|tiff|svg)$/i);

  const isAudio =
    mime.startsWith('audio/') ||
    mime.includes('audio') ||
    mime.includes('mpeg') ||
    name.match(/\.(mp3|wav|m4a|aac|ogg|flac|wma|mp2|mpa|mpe|mpeg|mpg|opus|aiff|alac|amr)$/i);

  if (isVideo || isImage || isAudio) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file format (${path.extname(name)}). Please upload MP4, MPEG, MPG, MOV, MKV, MP3, WAV, AAC, JPG, or PNG.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 * 1024 // 5GB limit for HD/4K videos
  }
});

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg']);
function isImgFile(fp) {
  const ext = path.extname(fp || '').toLowerCase();
  return IMAGE_EXTS.has(ext);
}
function isAudFile(fp) {
  const ext = path.extname(fp || '').toLowerCase();
  return AUDIO_EXTS.has(ext);
}

class MediaService {
  /**
   * Probes a media file for resolution, duration, codec, and audio channels using ffprobe.
   */
  async probeMediaFile(filePath, requestedType = null) {
    return new Promise((resolve) => {
      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          logger.warn(`ffprobe timed out for ${filePath}. Using fallback metadata.`);
          const isImg = requestedType === true || requestedType === 'IMAGE' || isImgFile(filePath);
          const isAud = requestedType === 'AUDIO' || isAudFile(filePath);
          resolve({
            durationSec: isImg ? 0 : 60,
            width: isAud ? 0 : 1920,
            height: isAud ? 0 : 1080,
            hasAudio: isImg ? false : true,
            codec: isAud ? 'mp3' : (isImg ? 'mjpeg' : 'h264'),
            detectedType: isAud ? 'AUDIO' : (isImg ? 'IMAGE' : 'VIDEO')
          });
        }
      }, 5000);

      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutTimer);

        if (err || !metadata) {
          logger.warn(`ffprobe inspection failed for ${filePath}: ${err?.message || 'No metadata'}.`);
          const isImg = requestedType === true || requestedType === 'IMAGE' || isImgFile(filePath);
          const isAud = requestedType === 'AUDIO' || isAudFile(filePath);
          return resolve({
            durationSec: isImg ? 0 : 60,
            width: isAud ? 0 : 1920,
            height: isAud ? 0 : 1080,
            hasAudio: isImg ? false : true,
            codec: isAud ? 'mp3' : (isImg ? 'mjpeg' : 'h264'),
            detectedType: isAud ? 'AUDIO' : (isImg ? 'IMAGE' : 'VIDEO')
          });
        }

        const streams = Array.isArray(metadata.streams) ? metadata.streams : [];
        // True video stream (excluding embedded album cover art images in mp3/flac/m4a)
        const videoStream = streams.find(s => s.codec_type === 'video' && s.codec_name !== 'png' && s.codec_name !== 'mjpeg' && s.disposition?.attached_pic !== 1);
        const imageStream = streams.find(s => s.codec_type === 'video' && (s.codec_name === 'png' || s.codec_name === 'mjpeg' || s.codec_name === 'jpeg' || s.codec_name === 'webp'));
        const audioStream = streams.find(s => s.codec_type === 'audio');

        const duration = parseFloat(metadata.format?.duration || videoStream?.duration || audioStream?.duration || 0);

        let detectedType = 'VIDEO';
        if (requestedType) {
          detectedType = requestedType;
        } else if (videoStream) {
          detectedType = 'VIDEO';
        } else if (audioStream) {
          detectedType = 'AUDIO';
        } else if (imageStream) {
          detectedType = 'IMAGE';
        }

        resolve({
          durationSec: Math.round(duration) || (detectedType === 'IMAGE' ? 0 : 60),
          width: videoStream?.width || (detectedType === 'IMAGE' ? (imageStream?.width || 1920) : 0),
          height: videoStream?.height || (detectedType === 'IMAGE' ? (imageStream?.height || 1080) : 0),
          hasAudio: Boolean(audioStream),
          codec: (detectedType === 'AUDIO' ? audioStream?.codec_name : (videoStream?.codec_name || audioStream?.codec_name)) || 'mpeg',
          detectedType
        });
      });
    });
  }

  /**
   * Saves uploaded file record into database.
   */
  async processUploadedFile(userId, file, targetMediaType = null) {
    try {
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = (file.mimetype || '').toLowerCase();

      let initialHint = targetMediaType;
      if (!initialHint) {
        if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) {
          initialHint = 'IMAGE';
        } else if (mime.startsWith('audio/') || ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.mp2', '.mpa'].includes(ext)) {
          initialHint = 'AUDIO';
        }
      }

      const probed = await this.probeMediaFile(file.path, initialHint);
      const mediaType = targetMediaType || probed.detectedType || (initialHint || 'VIDEO');

      const actualSize = file.size || (fs.existsSync(file.path) ? fs.statSync(file.path).size : 1024);

      const media = await Media.create({
        userId,
        filename: file.filename,
        originalName: file.originalname,
        filePath: file.path,
        mimeType: file.mimetype || (mediaType === 'IMAGE' ? 'image/jpeg' : (mediaType === 'AUDIO' ? 'audio/mpeg' : 'video/mp4')),
        mediaType,
        fileSizeBytes: actualSize,
        durationSec: probed.durationSec || (mediaType === 'IMAGE' ? 0 : 60),
        width: mediaType === 'AUDIO' ? 0 : (probed.width || 1920),
        height: mediaType === 'AUDIO' ? 0 : (probed.height || 1080),
        hasAudio: Boolean(probed.hasAudio),
        codec: probed.codec || (mediaType === 'IMAGE' ? 'image' : (mediaType === 'AUDIO' ? 'mp3' : 'mpeg'))
      });

      logger.info(`Processed media upload: ${media.originalName} (${media.mediaType}, ${media.fileSizeBytes} bytes, codec: ${media.codec})`);

      if (mediaType === 'VIDEO') {
        // Asynchronously generate 360p lightweight preview for in-app low-load monitoring
        this.getOrCreateVideoPreview(file.path, file.filename).catch(() => {});
      }

      return media;
    } catch (err) {
      logger.error(`Failed to process uploaded file: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generates or retrieves a lightweight 360p preview of a video file for in-app monitoring.
   * Significantly reduces CPU/GPU decoding load inside the desktop EXE preview without
   * modifying the original high-resolution master file used for Facebook/YouTube broadcasts.
   */
  async getOrCreateVideoPreview(filePath, filename) {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    const uploadDir = path.dirname(filePath) || config.media.uploadDir;
    const previewDir = path.join(uploadDir, 'previews');
    if (!fs.existsSync(previewDir)) {
      try { fs.mkdirSync(previewDir, { recursive: true }); } catch (_) {}
    }

    const baseName = path.basename(filename || filePath, path.extname(filename || filePath));
    const previewFilename = `preview-${baseName}.mp4`;
    const previewFilePath = path.join(previewDir, previewFilename);

    if (fs.existsSync(previewFilePath) && fs.statSync(previewFilePath).size > 1024) {
      return { previewFilePath, previewFilename };
    }

    // In-flight transcode lock to prevent duplicate FFmpeg processes
    this._previewLocks = this._previewLocks || new Map();
    if (this._previewLocks.has(previewFilePath)) {
      return this._previewLocks.get(previewFilePath);
    }

    const transcodePromise = new Promise((resolve) => {
      const ffmpegPath = getFfmpegPath();
      const { spawn } = require('child_process');

      // Scale to 360p (height 360, width proportional), 24fps, ultrafast x264, ~400k bitrate, faststart
      const ffArgs = [
        '-y',
        '-i', filePath,
        '-vf', 'scale=-2:360,fps=24,format=yuv420p',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-b:v', '400k',
        '-maxrate', '600k',
        '-bufsize', '1200k',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-ac', '2',
        '-ar', '44100',
        '-movflags', '+faststart',
        previewFilePath
      ];

      const proc = spawn(ffmpegPath, ffArgs, { windowsHide: true });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(previewFilePath) && fs.statSync(previewFilePath).size > 1024) {
          logger.info(`Generated lightweight 360p preview for ${filename} (${previewFilePath})`);
          resolve({ previewFilePath, previewFilename });
        } else {
          logger.warn(`Failed to generate video preview for ${filename} (code: ${code}). Falling back to master.`);
          resolve(null);
        }
      });
      proc.on('error', (err) => {
        logger.warn(`Error generating preview for ${filename}: ${err.message}`);
        resolve(null);
      });
    }).finally(() => {
      if (this._previewLocks) {
        this._previewLocks.delete(previewFilePath);
      }
    });

    this._previewLocks.set(previewFilePath, transcodePromise);
    return transcodePromise;
  }

  /**
   * Deletes media file from storage and database.
   */
  async deleteMedia(mediaId, userId) {
    const media = await Media.findOne({ _id: mediaId, userId });
    if (!media) {
      throw new Error('Media not found or unauthorized');
    }

    if (fs.existsSync(media.filePath)) {
      try {
        fs.unlinkSync(media.filePath);
      } catch (err) {
        logger.warn(`Could not delete file ${media.filePath}: ${err.message}`);
      }

      // Also clean up preview file if present
      try {
        const baseName = path.basename(media.filename || media.filePath, path.extname(media.filename || media.filePath));
        const previewFilePath = path.join(config.media.uploadDir, 'previews', `preview-${baseName}.mp4`);
        if (fs.existsSync(previewFilePath)) {
          fs.unlinkSync(previewFilePath);
        }
      } catch (_) {}
    }

    await Media.deleteOne({ _id: mediaId });
    logger.info(`Deleted media ${mediaId} (${media.originalName})`);
    return true;
  }
}

module.exports = {
  MediaService: new MediaService(),
  upload
};
