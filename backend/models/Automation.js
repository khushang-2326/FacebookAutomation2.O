const mongoose = require('mongoose');

const automationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  facebookPageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookPage',
    required: false,
  },
  targetPageIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookPage',
  }],
  destinationPlatform: {
    type: String,
    enum: ['FACEBOOK', 'YOUTUBE', 'CUSTOM_RTMP', 'MULTI_DESTINATION'],
    default: 'FACEBOOK',
  },
  youtubeStreamKey: {
    type: String,
    default: null,
    trim: true,
  },
  youtubeServerUrl: {
    type: String,
    default: 'rtmp://a.rtmp.youtube.com/live2/',
    trim: true,
  },
  sourceType: {
    type: String,
    enum: ['VIDEO_FILE', 'IMAGE', 'YOUTUBE_VIDEO', 'RTSP_CAMERA', 'ONVIF_CAMERA', 'LOCAL_CAMERA'],
    default: 'VIDEO_FILE',
  },
  mediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: false,
  },
  cameraId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Camera',
    required: false,
  },
  // Multi-Camera Cycling Schedule (Supports both CCTV and Webcams)
  cameraSchedules: [{
    cameraType: {
      type: String,
      enum: ['RTSP', 'WEBCAM'],
      default: 'RTSP',
    },
    cameraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      required: false,
      default: null,
    },
    deviceName: {
      type: String,
      default: null,
      trim: true,
    },
    cameraName: {
      type: String,
      default: null,
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 1,
      default: 20,
    },
    order: {
      type: Number,
      default: 0,
    }
  }],
  currentCameraSlotIndex: {
    type: Number,
    default: 0,
  },
  cameraStreamStartedAt: {
    type: Date,
    default: null,
  },
  localCameraDevice: {
    type: String,
    default: null,
    trim: true,
  },
  // Audio Configuration
  audioSourceType: {
    type: String,
    enum: ['CAMERA_AUDIO', 'UPLOADED_AUDIO', 'MICROPHONE', 'MIC_AND_TRACK', 'SILENT'],
    default: 'CAMERA_AUDIO',
  },
  audioMediaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
    required: false,
  },
  audioMediaIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Media',
  }],
  audioDeviceName: {
    type: String,
    default: null,
    trim: true,
  },
  audioTrackVolume: {
    type: Number,
    default: 0.8,
  },
  micVolume: {
    type: Number,
    default: 1.0,
  },
  loopAudio: {
    type: Boolean,
    default: true,
  },
  // The original YouTube page URL. The video is cached locally before streaming.
  youtubeUrl: {
    type: String,
    default: null,
    trim: true,
  },
  youtubeCachePath: {
    type: String,
    default: null,
  },
  // Multi-YouTube Video Playlist & Scheduling
  youtubeSchedules: [{
    youtubeUrl: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 1,
      default: 30,
    },
    order: {
      type: Number,
      default: 0,
    }
  }],
  // Multi-Media (Video / Image) Playlist & Scheduling
  mediaSchedules: [{
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Media',
      required: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    durationSeconds: {
      type: Number,
      required: true,
      min: 1,
      default: 30,
    },
    order: {
      type: Number,
      default: 0,
    }
  }],
  currentMediaSlotIndex: {
    type: Number,
    default: 0,
  },
  mediaStreamStartedAt: {
    type: Date,
    default: null,
  },
  currentYoutubeSlotIndex: {
    type: Number,
    default: 0,
  },
  youtubeStreamStartedAt: {
    type: Date,
    default: null,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: [
      'SCHEDULED',
      'PREPARING',
      'CREATING_BROADCAST',
      'STARTING',
      'STREAMING',
      'LIVE',
      'ROTATING',
      'STOPPING',
      'PAUSED',
      'STOPPED',
      'COMPLETED',
      'FAILED'
    ],
    default: 'SCHEDULED',
  },
  loopVideo: {
    type: Boolean,
    default: true,
  },
  fps: {
    type: Number,
    enum: [30, 60],
    default: 30,
  },
  encoderMode: {
    type: String,
    enum: ['AUTO', 'INTEL_QSV', 'NVIDIA_NVENC', 'AMD_AMF', 'WINDOWS_MF', 'HARDWARE_REQUIRED', 'SOFTWARE'],
    default: 'AUTO',
  },
  isFpsInterpolated: {
    type: Boolean,
    default: false,
  },
  videoBitrate: {
    type: String,
    default: null,
  },
  youtubeResolution: {
    type: String,
    enum: ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p', '4k'],
    default: '1080p',
  },
  youtubeFps: {
    type: Number,
    enum: [30, 60],
    default: 30,
  },
  youtubeBitrate: {
    type: String,
    default: null,
  },
  facebookMode: {
    type: String,
    enum: ['META_GRAPH_API', 'EXTERNAL_STREAM_KEY'],
    default: 'META_GRAPH_API',
  },
  startImmediately: {
    type: Boolean,
    default: true,
  },
  scheduleName: {
    type: String,
    default: null,
    trim: true,
  },
  scheduleMode: {
    type: String,
    enum: ['IMMEDIATE', 'ONE_TIME_FUTURE', 'RECURRING_WINDOW'],
    default: 'IMMEDIATE',
  },
  startDate: {
    type: Date,
    default: null,
  },
  endDate: {
    type: Date,
    default: null,
  },
  daysOfWeek: {
    type: [Number],
    default: [1, 2, 3, 4, 5], // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  },
  dailyStartTime: {
    type: String,
    default: '09:00',
  },
  dailyEndTime: {
    type: String,
    default: '17:00',
  },
  enableDailyWindow: {
    type: Boolean,
    default: false,
  },
  scheduledStartTime: {
    type: Date,
    default: Date.now,
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
  },
  rotationDurationSec: {
    type: Number,
    required: true,
    default: 17400, // 4h 50m
  },
  restartDelaySec: {
    type: Number,
    required: true,
    default: 60, // 60s
  },
  repeatMode: {
    type: String,
    enum: ['INDEFINITE', 'COUNT_LIMITED', 'ONCE', 'DURATION'],
    default: 'INDEFINITE',
  },
  completionMode: {
    type: String,
    enum: ['INDEFINITE', 'DURATION', 'END_TIME'],
    default: 'INDEFINITE',
  },
  totalDurationHours: {
    type: Number,
    default: null,
  },
  totalDurationSec: {
    type: Number,
    default: null,
  },
  targetEndTime: {
    type: Date,
    default: null,
  },
  maxRotations: {
    type: Number,
    default: 0, // 0 = infinite when repeatMode is INDEFINITE
  },
  currentRotationIndex: {
    type: Number,
    default: 0,
  },
  activeBroadcastId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broadcast',
    default: null,
  },
  nextRotationScheduledAt: {
    type: Date,
    default: null,
  },
  lastError: {
    type: String,
    default: null,
  },
  healthStatus: {
    type: String,
    enum: ['HEALTHY', 'WARNING', 'ERROR', 'OFFLINE'],
    default: 'OFFLINE',
  },
  cameraStatus: {
    type: String,
    enum: ['ONLINE', 'OFFLINE', 'CONNECTING', 'AUTHENTICATION_FAILED', 'RTSP_ERROR', 'NOT_TESTED'],
    default: 'NOT_TESTED',
  },
  rtspStatus: {
    type: String,
    enum: ['NOT_TESTED', 'NOT_REQUIRED', 'TESTING', 'CONNECTED', 'DISCONNECTED', 'AUTH_FAILED', 'TIMEOUT'],
    default: 'NOT_TESTED',
  },
  mediamtxStatus: {
    type: String,
    enum: ['NOT_REQUIRED', 'STARTING', 'READY', 'FAILED', 'STOPPED'],
    default: 'NOT_REQUIRED',
  },
  ffprobeStatus: {
    type: String,
    enum: ['NOT_STARTED', 'READY', 'FAILED'],
    default: 'NOT_STARTED',
  },
  ffmpegStatus: {
    type: String,
    enum: ['NOT_STARTED', 'STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'CRASHED', 'FAILED', 'RECOVERING'],
    default: 'NOT_STARTED',
  },
  facebookStatus: {
    type: String,
    enum: ['NOT_STARTED', 'CREATING', 'CREATED', 'CONNECTING', 'LIVE', 'FAILED', 'ENDED'],
    default: 'NOT_STARTED',
  },
  failureStage: {
    type: String,
    enum: ['NONE', 'CAMERA', 'RTSP', 'MEDIAMTX', 'FFPROBE', 'FFMPEG', 'FACEBOOK', 'NETWORK'],
    default: 'NONE',
  },
  failureCode: {
    type: String,
    default: null,
  },
  mediaMtxPath: {
    type: String,
    default: null,
  },
  lastFFmpegError: {
    type: String,
    default: null,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  retryWindowStartedAt: {
    type: Date,
    default: null,
  },
  nextRetryScheduledAt: {
    type: Date,
    default: null,
  },
  ffmpegPid: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Automation', automationSchema);
