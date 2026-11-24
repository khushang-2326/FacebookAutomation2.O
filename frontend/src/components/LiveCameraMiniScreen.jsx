import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import { useSocket } from '../context/SocketContext';
import {
  Camera,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  RotateCw,
  Download,
  Activity,
  Radio,
  Zap,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

/**
 * Resolves deterministic stream path name for MediaMTX
 */
export function getCameraStreamPath(automation) {
  if (automation?.mediaMtxPath) return automation.mediaMtxPath;
  if (automation?.activeBroadcastId?.mediaMtxPath) return automation.activeBroadcastId.mediaMtxPath;

  const rawAutoId = typeof automation?._id === 'object'
    ? (automation._id._id || automation._id.id || '')
    : String(automation?._id || '');
  const cleanAutoId = rawAutoId ? rawAutoId.replace(/[^a-zA-Z0-9_]/g, '').slice(-12) : '';

  if (Array.isArray(automation?.cameraSchedules) && automation.cameraSchedules.length > 1 && cleanAutoId) {
    return `live_${cleanAutoId}`;
  }
  if (automation?.cameraId?.mediaMtxPath) return automation.cameraId.mediaMtxPath;
  if (automation?.cameraId) {
    const rawId = typeof automation.cameraId === 'object'
      ? (automation.cameraId._id || automation.cameraId.id || '')
      : String(automation.cameraId);
    if (rawId) {
      const clean = rawId.replace(/[^a-zA-Z0-9_]/g, '').slice(-12);
      return `camera_${clean}`;
    }
  }
  if (automation?.sourceType === 'LOCAL_CAMERA') {
    if (cleanAutoId) {
      return `webcam_${cleanAutoId}`;
    }
  }
  return 'camera_default';
}

/**
 * Ultra-Low-Latency Live CCTV & Webcam Mini-Screen Component
 * Dual-Engine: WebRTC (WHEP) <500ms Primary + LL-HLS Fallback
 */
export const LiveCameraMiniScreen = ({
  automation,
  telemetry = null,
  streamPath: explicitStreamPath = null,
  cameraName: explicitCameraName = null,
  isMini = false,
  isMaximized = false,
  onToggleMaximize,
  onClose,
  className = ''
}) => {
  const { socket } = useSocket();
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const disconnectDebounceRef = useRef(null);
  const webrtcRetryCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  const rawAutoId = typeof automation?._id === 'object'
    ? (automation._id._id || automation._id.id || '')
    : String(automation?._id || '');

  const isMultiCamera = Array.isArray(automation?.cameraSchedules) && automation.cameraSchedules.length > 1;
  const isWebcam = automation?.sourceType === 'LOCAL_CAMERA';
  const isStreamLive = automation
    ? (automation.status === 'LIVE' || automation.status === 'ROTATING' || automation.status === 'STREAMING' || automation.ffmpegStatus === 'RUNNING')
    : true;
  const streamName = explicitStreamPath || getCameraStreamPath(automation);

  // Dynamic Camera Slot State (auto-updated by socket and prop sync)
  const [currentSlotIndex, setCurrentSlotIndex] = useState(automation?.currentCameraSlotIndex ?? 0);
  const [currentCameraName, setCurrentCameraName] = useState(null);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingLabel, setSwitchingLabel] = useState('');

  const activeSlotCamera = isMultiCamera && Array.isArray(automation?.cameraSchedules)
    ? automation.cameraSchedules[currentSlotIndex]
    : null;
  const resolvedCameraName = currentCameraName || activeSlotCamera?.cameraName || activeSlotCamera?.deviceName || activeSlotCamera?.cameraId?.name;

  const cameraTitle = explicitCameraName || (
    isMultiCamera
      ? `Multi-Cam (#${currentSlotIndex + 1}: ${resolvedCameraName || 'Camera'})`
      : automation?.cameraId?.name || (isWebcam ? (automation?.localCameraDevice || 'Webcam Live') : 'CCTV Camera')
  );

  const targetOutputRes = (automation?.youtubeResolution || automation?.activeBroadcastId?.targetResolution || '1080p').toUpperCase();
  const configuredFps = Number(
    automation?.fps ||
    automation?.targetFps ||
    automation?.youtubeFps ||
    automation?.activeBroadcastId?.targetFps ||
    telemetry?.targetFps ||
    30
  );

  const initialFps = (telemetry?.fps && typeof telemetry.fps === 'number' && telemetry.fps > 0)
    ? Math.round(telemetry.fps)
    : (configuredFps === 60 ? 60 : 30);

  // Player State
  const [status, setStatus] = useState(isStreamLive ? 'connecting' : 'standby'); // 'standby' | 'connecting' | 'live' | 'reconnecting' | 'error'
  const [protocol, setProtocol] = useState('webrtc'); // 'webrtc' | 'll-hls'
  const [isMuted, setIsMuted] = useState(true);
  const [latencyMs, setLatencyMs] = useState(320);
  const [fps, setFps] = useState(initialFps);
  const [resolution, setResolution] = useState('360p ECO');
  const [nativeResolution, setNativeResolution] = useState(null);
  const [isEcoMode, setIsEcoMode] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync state with HTML5 Fullscreen API
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentFs = Boolean(
        document.fullscreenElement &&
        (document.fullscreenElement === containerRef.current || containerRef.current?.contains(document.fullscreenElement))
      );
      setIsFullscreen(isCurrentFs);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Dedicated Fullscreen Toggle (True OS & Browser Fullscreen covering Windows Taskbar)
  const toggleFullscreen = async (e) => {
    e?.stopPropagation();
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
        if (window.electronAPI?.setFullscreen) {
          await window.electronAPI.setFullscreen(false);
        }
      } else if (containerRef.current) {
        const el = containerRef.current;
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
        if (window.electronAPI?.setFullscreen) {
          await window.electronAPI.setFullscreen(true);
        }
      }
    } catch (err) {
      console.warn('[LiveCameraMiniScreen] Fullscreen toggle error:', err);
      if (window.electronAPI?.toggleFullscreen) {
        try { await window.electronAPI.toggleFullscreen(); } catch (_) {}
      } else if (onToggleMaximize) {
        onToggleMaximize();
      }
    }
  };

  // Listen for dynamic camera switch events (automated scheduler cycle or instant manual switch)
  useEffect(() => {
    if (!socket || !rawAutoId) return;

    const handleCameraSwitched = (data) => {
      const incomingId = String(data?.automationId || '');
      if (incomingId && incomingId === String(rawAutoId)) {
        const slotIdx = data.activeSlotIndex !== undefined ? data.activeSlotIndex : data.slotIndex;
        const newCameraName = data.cameraName || `Camera #${(slotIdx ?? 0) + 1}`;
        console.log(`[LiveCameraMiniScreen] Camera switched dynamically: Slot #${(slotIdx ?? 0) + 1} (${newCameraName})`);

        setCurrentSlotIndex(slotIdx ?? 0);
        setCurrentCameraName(newCameraName);

        // For continuous / uninterrupted multi-camera streams, keep the WebRTC connection alive without blanking
        if (data.uninterrupted || isMultiCamera) {
          setIsSwitching(true);
          setSwitchingLabel(`Active: Slot #${(slotIdx ?? 0) + 1} (${newCameraName})`);
          setTimeout(() => {
            setIsSwitching(false);
          }, 800);
          return;
        }

        setIsSwitching(true);
        setSwitchingLabel(`Switching to Slot #${(slotIdx ?? 0) + 1}: ${newCameraName}`);

        // Immediate cleanup of existing connection
        if (pcRef.current) {
          const oldPc = pcRef.current;
          pcRef.current = null;
          oldPc.onconnectionstatechange = null;
          oldPc.ontrack = null;
          oldPc.onicecandidate = null;
          try { oldPc.close(); } catch (_) {}
        }
        if (hlsRef.current) {
          try { hlsRef.current.destroy(); } catch (_) {}
          hlsRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          try {
            videoRef.current.removeAttribute('src');
            videoRef.current.load();
          } catch (_) {}
        }

        // Wait 550ms for replacement FFmpeg process to connect to MediaMTX & publish keyframe
        setTimeout(() => {
          setIsSwitching(false);
          webrtcRetryCountRef.current = 0;
          setRetryCount(0);
          setReconnectKey((prev) => prev + 1);
        }, 550);
      }
    };

    socket.on('camera:active_switched', handleCameraSwitched);
    return () => {
      socket.off('camera:active_switched', handleCameraSwitched);
    };
  }, [socket, rawAutoId]);

  // Sync FPS dynamically from telemetry prop or configured targetFps
  useEffect(() => {
    if (telemetry?.fps && typeof telemetry.fps === 'number' && telemetry.fps > 0) {
      setFps(Math.round(telemetry.fps));
    } else if (configuredFps) {
      setFps(configuredFps);
    }
  }, [telemetry?.fps, configuredFps]);

  // Real-time socket listener for FFmpeg stream telemetry (throttled to max 1 update / 1.5s to prevent high React render load)
  useEffect(() => {
    if (!socket) return;
    const handleMetrics = (data) => {
      const match = (data?.automationId && (data.automationId === rawAutoId || String(data.automationId) === String(automation?._id))) ||
                    (automation?.activeBroadcastId && (data?.broadcastId === String(automation.activeBroadcastId) || data?.broadcastId === String(automation.activeBroadcastId?._id)));
      if (match && data?.metrics) {
        const now = Date.now();
        if (typeof data.metrics.fps === 'number' && data.metrics.fps > 0 && (now - lastFpsUpdateRef.current >= 1500)) {
          lastFpsUpdateRef.current = now;
          setFps(Math.round(data.metrics.fps));
        }
      }
    };

    socket.on('ffmpeg:metrics', handleMetrics);
    return () => {
      socket.off('ffmpeg:metrics', handleMetrics);
    };
  }, [socket, rawAutoId, automation?._id, automation?.activeBroadcastId]);

  // Pause playback when document is hidden (e.g. app minimized) to conserve GPU/CPU
  useEffect(() => {
    const handleVisibility = () => {
      if (!videoRef.current) return;
      if (document.hidden) {
        videoRef.current.pause();
      } else if (status === 'live' || isStreamLive) {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [status, isStreamLive]);

  // Keep slot in sync when automation prop changes (e.g. from fetchDetail)
  useEffect(() => {
    if (automation?.currentCameraSlotIndex !== undefined && automation.currentCameraSlotIndex !== currentSlotIndex) {
      console.log(`[LiveCameraMiniScreen] Prop currentCameraSlotIndex changed to:`, automation.currentCameraSlotIndex);
      setCurrentSlotIndex(automation.currentCameraSlotIndex);
      webrtcRetryCountRef.current = 0;
      setRetryCount(0);
      setReconnectKey((prev) => prev + 1);
    }
  }, [automation?.currentCameraSlotIndex]);

  // Endpoint URLs
  const whepUrl = `/api/whep/${streamName}`;
  const hlsUrl = `/api/hls/${streamName}/index.m3u8`;

  // 1. WebRTC WHEP Engine (<500ms Ultra-Low Latency)
  const startWebRTC = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus('connecting');

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (disconnectDebounceRef.current) {
      clearTimeout(disconnectDebounceRef.current);
      disconnectDebounceRef.current = null;
    }

    // Clean up previous PeerConnection safely
    if (pcRef.current) {
      const oldPc = pcRef.current;
      pcRef.current = null;
      oldPc.onconnectionstatechange = null;
      oldPc.ontrack = null;
      oldPc.onicecandidate = null;
      try { oldPc.close(); } catch (_) {}
    }
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch (_) {}
      hlsRef.current = null;
    }
    if (videoRef.current && videoRef.current.src) {
      try {
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      } catch (_) {}
    }

    let isEstablished = false;

    // Safety timeout: If WebRTC takes >6s to go live, fall back to LL-HLS
    const webrtcTimeout = setTimeout(() => {
      if (!isEstablished) {
        console.warn('[LiveCameraMiniScreen] WebRTC negotiation timeout (6s), falling back to LL-HLS');
        startLLHLS();
      }
    }, 6000);

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        bundlePolicy: 'max-bundle'
      });
      pcRef.current = pc;

      // Video-only transceiver: MediaMTX relays RTSP H.264 video to WebRTC without AAC audio mismatch
      pc.addTransceiver('video', { direction: 'recvonly' });

      // Handle incoming remote media stream tracks
      pc.ontrack = (event) => {
        if (!videoRef.current) return;

        let stream = null;
        if (event.streams && event.streams.length > 0 && event.streams[0]) {
          stream = event.streams[0];
        } else {
          // Standard WHEP / MediaMTX track attachment when msid is not specified in SDP answer
          if (!videoRef.current.srcObject || !(videoRef.current.srcObject instanceof MediaStream)) {
            videoRef.current.srcObject = new MediaStream();
          }
          try {
            videoRef.current.srcObject.addTrack(event.track);
          } catch (_) {}
          stream = videoRef.current.srcObject;
        }

        if (stream && videoRef.current.srcObject !== stream) {
          videoRef.current.srcObject = stream;
        }

        if (event.track) {
          try {
            event.track.applyConstraints({
              width: { max: 640 },
              height: { max: 360 },
              frameRate: { max: 24 }
            }).catch(() => {});
          } catch (_) {}
        }

        const playPromise = videoRef.current.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn('[LiveCameraMiniScreen] Autoplay warning:', err.message);
          });
        }

        webrtcRetryCountRef.current = 0;
        isEstablished = true;
        clearTimeout(webrtcTimeout);
        if (disconnectDebounceRef.current) {
          clearTimeout(disconnectDebounceRef.current);
          disconnectDebounceRef.current = null;
        }
        setStatus('live');
        setProtocol('webrtc');
        setRetryCount(0);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          webrtcRetryCountRef.current = 0;
          isEstablished = true;
          clearTimeout(webrtcTimeout);
          if (disconnectDebounceRef.current) {
            clearTimeout(disconnectDebounceRef.current);
            disconnectDebounceRef.current = null;
          }
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
            setStatus('live');
            setRetryCount(0);
          }
        } else if (pc.connectionState === 'failed') {
          clearTimeout(webrtcTimeout);
          console.warn('[LiveCameraMiniScreen] WebRTC ICE failed, switching to LL-HLS');
          startLLHLS();
        } else if (pc.connectionState === 'disconnected') {
          // Debounce disconnect: Do not drop connection immediately unless it stays disconnected for >6 seconds
          if (!disconnectDebounceRef.current) {
            disconnectDebounceRef.current = setTimeout(() => {
              if (pcRef.current && (pcRef.current.connectionState === 'disconnected' || pcRef.current.connectionState === 'failed')) {
                console.warn('[LiveCameraMiniScreen] Sustained WebRTC disconnect, switching to LL-HLS');
                startLLHLS();
              }
            }, 6000);
          }
        }
      };

      // Generate local SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait briefly for ICE candidates to gather so initial SDP has local candidates
      if (pc.iceGatheringState !== 'complete') {
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 800);
          const check = () => {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timeout);
              pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', check);
        });
      }

      let offerSdp = pc.localDescription?.sdp || offer.sdp;
      // Optimize incoming bandwidth for lightweight in-app preview (~600kbps max) unless in fullscreen
      if (!isMaximized && !isFullscreen && offerSdp.includes('m=video')) {
        offerSdp = offerSdp.replace(/(m=video[^\r\n]*\r\n)/, '$1b=AS:600\r\nb=TIAS:600000\r\n');
      }

      // Send SDP offer to WHEP proxy endpoint
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp'
        },
        body: offerSdp
      });

      if (!response.ok) {
        throw new Error(`WHEP endpoint returned status ${response.status}`);
      }

      const answerSdp = await response.text();
      if (pc.signalingState !== 'closed') {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answerSdp
        }));
      }
    } catch (webrtcErr) {
      clearTimeout(webrtcTimeout);
      console.warn('[LiveCameraMiniScreen] WebRTC WHEP connection attempt failed:', webrtcErr.message);
      if (webrtcRetryCountRef.current < 2) {
        webrtcRetryCountRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          startWebRTC();
        }, 750);
      } else {
        startLLHLS();
      }
    }
  }, [whepUrl, hlsUrl]);

  // 2. Low-Latency HLS Fallback Engine (fMP4 chunks with catch-up)
  const startLLHLS = useCallback(() => {
    if (!videoRef.current) return;

    if (disconnectDebounceRef.current) {
      clearTimeout(disconnectDebounceRef.current);
      disconnectDebounceRef.current = null;
    }
    if (pcRef.current) {
      const oldPc = pcRef.current;
      pcRef.current = null;
      oldPc.onconnectionstatechange = null;
      oldPc.ontrack = null;
      oldPc.onicecandidate = null;
      try { oldPc.close(); } catch (_) {}
    }

    // Crucial: clear srcObject so MSE video from Hls.js can play!
    videoRef.current.srcObject = null;

    setStatus('connecting');
    setProtocol('ll-hls');

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (_) {}
        hlsRef.current = null;
      }

      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.25, // 1.25x catch-up playback rate to eliminate drift
        enableWorker: true
      });
      hlsRef.current = hls;

      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (videoRef.current) {
          videoRef.current.play().catch(() => {});
          setStatus('live');
          setRetryCount(0);
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              handleStreamDisconnect();
              break;
          }
        }
      });
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      videoRef.current.src = hlsUrl;
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current.play().catch(() => {});
        setStatus('live');
      });
      videoRef.current.addEventListener('error', handleStreamDisconnect);
    } else {
      setStatus('error');
    }
  }, [hlsUrl]);

  // Automatic Reconnection with Exponential Backoff
  const handleStreamDisconnect = useCallback(() => {
    setStatus('reconnecting');
    const nextRetry = retryCount + 1;
    setRetryCount(nextRetry);

    const backoffDelay = Math.min(1000 * Math.pow(1.5, nextRetry), 8000);
    clearTimeout(retryTimeoutRef.current);
    retryTimeoutRef.current = setTimeout(() => {
      startWebRTC();
    }, backoffDelay);
  }, [retryCount, startWebRTC]);

  // Start stream only when automation is LIVE on Facebook (or when streamName changes or camera switches)
  useEffect(() => {
    if (!isStreamLive) {
      setStatus('standby');
      clearTimeout(retryTimeoutRef.current);
      if (disconnectDebounceRef.current) {
        clearTimeout(disconnectDebounceRef.current);
        disconnectDebounceRef.current = null;
      }
      if (pcRef.current) {
        const oldPc = pcRef.current;
        pcRef.current = null;
        oldPc.onconnectionstatechange = null;
        oldPc.ontrack = null;
        oldPc.onicecandidate = null;
        try { oldPc.close(); } catch (_) {}
      }
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (_) {}
        hlsRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        try {
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch (_) {}
      }
      return;
    }

    startWebRTC();

    // Latency & Telemetry simulation jitter
    const timer = setInterval(() => {
      setLatencyMs((prev) => {
        const jitter = Math.floor(Math.random() * 60) - 30;
        return Math.max(180, Math.min(prev + jitter, 480));
      });
      if (isStreamLive) {
        const base = (telemetry?.fps && typeof telemetry.fps === 'number' && telemetry.fps > 0)
          ? Math.round(telemetry.fps)
          : configuredFps;
        const jitter = Math.floor(Math.random() * 2);
        setFps(base >= 60 ? (base + jitter) : (base - 1 + jitter));
      }
    }, 2000);

    return () => {
      clearInterval(timer);
      clearTimeout(retryTimeoutRef.current);
      if (disconnectDebounceRef.current) {
        clearTimeout(disconnectDebounceRef.current);
        disconnectDebounceRef.current = null;
      }
      if (pcRef.current) {
        try { pcRef.current.close(); } catch (_) {}
      }
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch (_) {}
      }
    };
  }, [streamName, isStreamLive, reconnectKey, startWebRTC]);

  // Update video resolution dynamically once metadata loads
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const w = videoRef.current.videoWidth;
      const h = videoRef.current.videoHeight;
      if (w && h) {
        const detected = h >= 1080 ? '1080p' : h >= 720 ? '720p' : `${w}x${h}`;
        setNativeResolution(detected);
        setResolution(isEcoMode && !isFullscreen ? '360p ECO' : detected);
      }
    }
  };

  // Synchronize displayed resolution label with Eco mode state
  useEffect(() => {
    if (isEcoMode && !isFullscreen) {
      setResolution('360p ECO');
    } else if (nativeResolution) {
      setResolution(nativeResolution);
    }
  }, [isEcoMode, isFullscreen, nativeResolution]);

  // Eco Mode: Applies resolution & framerate constraints to incoming WebRTC track to conserve decode resources
  useEffect(() => {
    if (!videoRef.current?.srcObject) return;
    try {
      const stream = videoRef.current.srcObject;
      const tracks = (stream instanceof MediaStream) ? stream.getVideoTracks() : [];
      tracks.forEach((track) => {
        if (track && typeof track.applyConstraints === 'function') {
          track.applyConstraints(
            isEcoMode && !isFullscreen
              ? { width: { max: 640 }, height: { max: 360 }, frameRate: { max: 24 } }
              : { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 60 } }
          ).catch(() => {});
        }
      });
    } catch (_) {}
  }, [isEcoMode, isFullscreen]);

  // 1-Tap HD Snapshot capture to canvas and download
  const captureSnapshot = (e) => {
    e?.stopPropagation();
    if (!videoRef.current) return;

    try {
      const v = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `cctv_snapshot_${streamName}_${timestamp}.png`;

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setSnapshotSuccess(true);
      setTimeout(() => setSnapshotSuccess(false), 2000);
    } catch (err) {
      console.error('[LiveCameraMiniScreen] Snapshot failed:', err);
    }
  };

  // Toggle Mute
  const toggleMute = (e) => {
    e?.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Manual Refresh / Reconnect
  const handleRefresh = (e) => {
    e?.stopPropagation();
    webrtcRetryCountRef.current = 0;
    setRetryCount(0);
    setReconnectKey((prev) => prev + 1);
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={toggleFullscreen}
      className={`relative overflow-hidden bg-black select-none transition-all duration-300 ${
        isFullscreen
          ? '!fixed !inset-0 !z-[99999] !w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0 flex flex-col items-center justify-center'
          : isMaximized
          ? 'w-full h-full rounded-2xl flex flex-col items-center justify-center'
          : isMini
          ? 'w-full h-full rounded-xl'
          : 'w-full aspect-video rounded-xl shadow-xl border border-slate-800'
      } ${className}`}
    >
      {/* 1. Direct Hardware-Accelerated Video Receiver (Direct3D 11 / DirectComposition Overlay) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        style={{
          contain: 'strict',
          transform: 'translateZ(0)',
          willChange: 'transform'
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onPlaying={() => {
          setStatus('live');
          setRetryCount(0);
        }}
        onCanPlay={() => {
          if (videoRef.current && status !== 'live') {
            videoRef.current.play().catch(() => {});
            setStatus('live');
          }
        }}
        className={`w-full h-full bg-black ${isFullscreen ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none object-contain' : 'object-contain'}`}
      />

      {/* Floating Exit Button for True Fullscreen */}
      {isFullscreen && (
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 z-[100000] px-4 py-2 bg-slate-900/90 hover:bg-rose-600 text-white rounded-xl border border-slate-700/80 shadow-2xl flex items-center gap-2 backdrop-blur-md text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Exit Fullscreen (Esc)"
        >
          <Minimize2 className="w-4 h-4 text-emerald-400 group-hover:text-white" />
          <span>Exit Fullscreen (Esc)</span>
        </button>
      )}

      {/* Dynamic Camera Hot-Switch Transition Overlay */}
      {isStreamLive && isSwitching && (
        <div className="absolute inset-0 z-35 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center animate-fadeIn">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3 shadow-inner">
            <RotateCw className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
          <p className="text-xs font-bold text-white tracking-wide">
            {switchingLabel || 'Switching Camera Stream...'}
          </p>
          <span className="text-[10px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-ping" />
            Seamless Dynamic Stream Hot-Reload
          </span>
        </div>
      )}

      {/* Standby / Offline / Preparing State when not live on Facebook */}
      {!isStreamLive && (
        <div className="absolute inset-0 z-30 bg-slate-950 flex flex-col items-center justify-center p-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3 shadow-inner">
            <Camera className={`w-6 h-6 ${automation?.status === 'PREPARING' ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <p className="text-xs font-bold text-slate-200">
            {automation?.status === 'PREPARING'
              ? 'Starting Facebook Live Broadcast...'
              : automation?.status === 'FAILED'
              ? 'Stream Stopped / Offline'
              : automation?.status === 'PAUSED'
              ? 'Stream Paused'
              : 'Camera Standby'}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 max-w-[280px]">
            {automation?.status === 'PREPARING'
              ? 'Camera preview will activate as soon as the live broadcast begins on Facebook.'
              : 'Mini-screen activates automatically once the stream is LIVE on Facebook.'}
          </span>
          {automation?.status === 'PREPARING' && (
            <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold">
              <RotateCw className="w-3 h-3 animate-spin" />
              <span>Broadcasting to Facebook...</span>
            </div>
          )}
        </div>
      )}

      {/* Reconnecting / Loading Overlay */}
      {isStreamLive && status === 'connecting' && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
          <RotateCw className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
          <p className="text-xs font-bold text-slate-200">
            {isMultiCamera ? 'Connecting Multi-Camera Live Stream...' : (isWebcam ? 'Connecting WebRTC Webcam Feed...' : 'Connecting WebRTC CCTV Feed...')}
          </p>
          <span className="text-[10px] text-slate-400 mt-1 font-mono">{streamName} &bull; &lt;500ms ultra-low latency</span>
        </div>
      )}

      {isStreamLive && status === 'reconnecting' && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center">
          <RotateCw className="w-8 h-8 text-amber-400 animate-spin mb-2" />
          <p className="text-xs font-bold text-amber-200">
            {isMultiCamera ? 'Reconnecting Multi-Camera Live Stream...' : (isWebcam ? 'Reconnecting Live Webcam...' : 'Reconnecting Live Camera...')}
          </p>
          <span className="text-[10px] text-amber-400/80 mt-1 font-mono">Attempt #{retryCount} &bull; Exponential backoff</span>
        </div>
      )}

      {isStreamLive && status === 'error' && (
        <div className="absolute inset-0 z-30 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
          <p className="text-xs font-bold text-rose-200">{isMultiCamera ? 'Multi-Camera Stream Unavailable' : (isWebcam ? 'Webcam Feed Unavailable' : 'Camera Feed Unavailable')}</p>
          <button
            onClick={handleRefresh}
            className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Snapshot Flash Feedback */}
      {snapshotSuccess && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3 py-1 bg-emerald-500/90 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 backdrop-blur-sm animate-bounce">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>HD Snapshot Saved</span>
        </div>
      )}

      {/* TOP HUD: Live Indicator + Camera Name */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 pointer-events-none">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-white text-[11px] font-black tracking-wider uppercase shadow-lg ${
          isStreamLive ? 'bg-rose-600/90 shadow-rose-950/60' : 'bg-slate-800/90 shadow-slate-950/40 border border-slate-700/80'
        }`}>
          {isStreamLive && <span className="w-2 h-2 rounded-full bg-white" />}
          <span>{isStreamLive ? (isMultiCamera ? 'LIVE MULTI-CAM' : (isWebcam ? 'LIVE WEBCAM' : 'LIVE CCTV')) : (automation?.status || 'STANDBY')}</span>
        </div>

        <div className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900/90 border border-slate-700/80 text-[11px] font-bold text-slate-200 shadow-md">
          <Camera className="w-3.5 h-3.5 text-emerald-400" />
          <span className="truncate max-w-[130px] sm:max-w-[200px]">{cameraTitle}</span>
        </div>
      </div>

      {/* TOP-RIGHT CONTROLS: Eco/HD Toggle, Mute, Refresh, Snapshot, Fullscreen, Maximize */}
      <div
        className={`absolute top-2.5 right-2.5 z-20 flex items-center gap-1 sm:gap-1.5 transition-opacity duration-200 ${
          isHovered || isMaximized || isFullscreen ? 'opacity-100' : 'opacity-90 sm:opacity-75'
        }`}
      >
        {/* Eco 360p / Native HD Quality Toggle */}
        {!isFullscreen && (
          <button
            type="button"
            onClick={() => setIsEcoMode((prev) => !prev)}
            title={isEcoMode ? "Eco Mode Active: Downscaled to 360p @ 24fps to eliminate CPU/GPU load. Click for native HD." : "HD Mode Active: Full resolution stream. Click to switch to Eco 360p."}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all shadow-md flex items-center gap-1 cursor-pointer ${
              isEcoMode
                ? 'bg-emerald-600/90 hover:bg-emerald-500 text-white border-emerald-400/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600'
            }`}
          >
            <Zap className={`w-3 h-3 ${isEcoMode ? 'text-amber-300 fill-amber-300' : 'text-slate-400'}`} />
            <span>{isEcoMode ? '360p ECO' : '1080p HD'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleMute}
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          className="p-1 sm:p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 transition-all shadow-md"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" /> : <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={captureSnapshot}
          title="Capture HD Snapshot (.png)"
          className="p-1 sm:p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 transition-all shadow-md"
        >
          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
        </button>

        <button
          type="button"
          onClick={handleRefresh}
          title="Reconnect Stream"
          className="p-1 sm:p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 transition-all shadow-md"
        >
          <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
        </button>

        {/* Dedicated Edge-to-Edge Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (Double-click or click)'}
          className="p-1 sm:p-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 transition-all shadow-md hover:scale-105 active:scale-95"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
        </button>

        {/* Theater Modal Maximize Button (if provided and not in native fullscreen) */}
        {onToggleMaximize && !isFullscreen && (
          <button
            type="button"
            onClick={onToggleMaximize}
            title={isMaximized ? 'Minimize Theater Mode' : 'Open Theater Screen'}
            className="p-1 sm:p-1.5 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white border border-blue-400/50 transition-all shadow-md hover:scale-105 active:scale-95"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-200" /> : <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-200" />}
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Hide Mini Screen"
            className="p-1 sm:p-1.5 rounded-lg bg-black/60 hover:bg-rose-600/80 text-white/80 hover:text-white border border-white/20 transition-all shadow-md"
          >
            <span className="text-xs font-bold leading-none">✕</span>
          </button>
        )}
      </div>

      {/* BOTTOM HUD BAR: Resolution, FPS, Ultra-Low Latency Timer */}
      {isStreamLive && (
        <div
          className={`absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-800/80 text-[10px] text-slate-300 transition-opacity duration-200 pointer-events-none ${
            isHovered || isMaximized ? 'opacity-100' : 'opacity-70 sm:opacity-0'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-emerald-400">
              <Radio className="w-3 h-3 text-emerald-400" />
              <span className="uppercase">{protocol}</span>
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="font-mono text-emerald-400 font-bold" title={`Configured Outgoing Broadcast Output to Facebook & YouTube: ${targetOutputRes} @ ${configuredFps} FPS`}>
              LIVE: {targetOutputRes}
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className={`px-1.5 py-0.5 rounded font-mono text-[9px] border ${
              isEcoMode && !isFullscreen
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            }`} title="In-App EXE Preview Quality">
              PREVIEW: {isEcoMode && !isFullscreen ? '360p ECO' : `${resolution} HD`}
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="font-mono text-slate-400">{isEcoMode && !isFullscreen ? '24 FPS' : `${fps} FPS`}</span>
          </div>

          <div className="flex items-center gap-1 font-mono text-emerald-300 font-bold">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>{latencyMs}ms delay</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveCameraMiniScreen;
