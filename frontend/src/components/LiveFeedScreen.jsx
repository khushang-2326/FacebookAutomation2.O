import React, { useState, useRef, useEffect } from 'react';
import {
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Radio,
  Share2,
  Youtube,
  Tv,
  Camera,
  Film,
  Sparkles,
  RotateCw,
  Clock,
  Activity
} from 'lucide-react';
import LiveCameraMiniScreen from './LiveCameraMiniScreen';

const API_BASE = 'http://localhost:5000';

export const LiveFeedScreen = ({
  automation,
  telemetry = null,
  isMini = false,
  isMaximized = false,
  onMaximize,
  onMinimize,
  onClose,
  className = ''
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);
  const [videoError, setVideoError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [localCamStream, setLocalCamStream] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async (e) => {
    e?.stopPropagation();
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(false);
      } else if (containerRef.current) {
        const el = containerRef.current;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(true);
      }
    } catch (_) {
      if (window.electronAPI?.toggleFullscreen) {
        try { await window.electronAPI.toggleFullscreen(); } catch (_) {}
      } else if (isMaximized && onMinimize) {
        onMinimize();
      } else if (!isMaximized && onMaximize) {
        onMaximize();
      }
    }
  };

  const sourceType = automation?.sourceType || 'VIDEO_FILE';
  const isVideo = sourceType === 'VIDEO_FILE';
  const isImage = sourceType === 'IMAGE_FILE' || sourceType === 'IMAGE';
  const isLocalCam = sourceType === 'LOCAL_CAMERA';
  const isRtspCam = sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA' || Boolean(automation?.cameraId);
  const isYouTube = sourceType === 'YOUTUBE_VIDEO';
  const hasMultiCamera = Array.isArray(automation?.cameraSchedules) && automation.cameraSchedules.length > 0;

  // If this is an RTSP CCTV camera, Local Webcam feed, or Multi-Camera rotation, use the ultra-low latency WebRTC/LL-HLS LiveCameraMiniScreen
  if (isRtspCam || isLocalCam || hasMultiCamera) {
    return (
      <LiveCameraMiniScreen
        automation={automation}
        telemetry={telemetry}
        isMini={isMini}
        isMaximized={isMaximized}
        onToggleMaximize={isMaximized ? onMinimize : onMaximize}
        onClose={onClose}
        className={className}
      />
    );
  }

  // Resolve video URL for uploaded media (use lightweight 360p preview for in-app low-load monitoring)
  const mediaFilename = automation?.mediaId?.filename;
  const masterMediaUrl = mediaFilename ? `${API_BASE}/uploads/${mediaFilename}` : null;
  const previewMediaUrl = mediaFilename ? `${API_BASE}/api/media/preview/${mediaFilename}` : null;
  const activeVideoSrc = (!isFullscreen && previewMediaUrl) ? previewMediaUrl : (masterMediaUrl || previewMediaUrl);

  // Pause playback when document is hidden (e.g. app minimized) to conserve GPU/CPU
  useEffect(() => {
    const handleVisibility = () => {
      if (!videoRef.current) return;
      if (document.hidden) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const toggleMute = (e) => {
    e?.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    } else {
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  // Determine destinations
  const isMultiDest = automation?.destinationPlatform === 'MULTI_DESTINATION' || (automation?.targetPageIds && automation.targetPageIds.length > 1);
  const isYouTubeDest = automation?.destinationPlatform === 'YOUTUBE' || automation?.facebookPageId?.platform === 'YOUTUBE';

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDoubleClick={toggleFullscreen}
      className={`relative overflow-hidden bg-black select-none group transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen flex flex-col items-center justify-center'
          : isMaximized
          ? 'w-full h-full rounded-2xl border-2 border-emerald-500/40 shadow-2xl'
          : isMini
          ? 'w-full h-full rounded-xl border border-slate-700 shadow-lg'
          : 'w-full aspect-video rounded-2xl border border-slate-800 shadow-xl'
      } ${className}`}
    >
      {/* 1. Main Live Media Render (Low-Load Eco Preview) */}
      {isVideo && (previewMediaUrl || masterMediaUrl) && !videoError ? (
        <video
          ref={videoRef}
          src={activeVideoSrc}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          style={{ contain: 'strict', transform: 'translateZ(0)', willChange: 'transform' }}
          onError={() => {
            if (videoRef.current && videoRef.current.src !== masterMediaUrl && masterMediaUrl) {
              videoRef.current.src = masterMediaUrl;
              videoRef.current.play().catch(() => {});
            } else {
              setVideoError(true);
            }
          }}
          className="w-full h-full object-cover bg-black"
        />
      ) : isImage && masterMediaUrl ? (
        <img
          src={masterMediaUrl}
          alt="Live Stream Visual"
          className="w-full h-full object-cover bg-black"
        />
      ) : isLocalCam && localCamStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover bg-black"
        />
      ) : isYouTube && automation?.youtubeCachePath && !videoError ? (
        <video
          ref={videoRef}
          src={`${API_BASE}/uploads/youtube/${automation.youtubeCachePath.replace(/\\/g, '/').split('/').pop()}`}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          style={{ contain: 'strict', transform: 'translateZ(0)', willChange: 'transform' }}
          onError={() => setVideoError(true)}
          className="w-full h-full object-cover bg-black"
        />
      ) : isYouTube && (automation?.youtubeUrl || (Array.isArray(automation?.youtubeSchedules) && automation.youtubeSchedules.length > 0)) ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4 text-center">
          <Youtube className="w-10 h-10 text-red-500 mb-2 animate-pulse" />
          <p className="text-xs font-semibold text-slate-200 truncate max-w-xs">
            {Array.isArray(automation?.youtubeSchedules) && automation.youtubeSchedules.length > 1
              ? `${automation.youtubeSchedules.length} YouTube Videos in Rotation (${automation.youtubeSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 30), 0)}s loop)`
              : (automation?.youtubeSchedules?.[0]?.title || automation.youtubeUrl)}
          </p>
          <span className="text-[10px] text-slate-400 mt-1">Rebroadcasting YouTube Video Stream</span>
        </div>
      ) : isRtspCam ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
          <Camera className="w-10 h-10 text-emerald-400 mb-2" />
          <p className="text-xs font-bold text-slate-200">
            {automation.cameraId?.name || 'CCTV / IP Camera Stream'}
          </p>
          <span className="text-[10px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-ping" />
            MediaMTX RTSP Active
          </span>
        </div>
      ) : (
        /* Fallback Simulation / Visualizer */
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 p-4 text-center">
          <Film className="w-8 h-8 text-blue-400 mb-2 animate-bounce" />
          <p className="text-xs font-bold text-slate-200">{automation?.name || 'Live Broadcast'}</p>
          <span className="text-[10px] text-slate-400 mt-1">Active Output Feed Transcoding</span>
        </div>
      )}

      {/* 2. Top-Left Live HUD Badge */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5 flex-wrap pointer-events-none">
        {/* LIVE Pill */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-600/90 text-white text-[11px] font-black tracking-wider uppercase shadow-lg shadow-rose-950/60">
          <span className="w-2 h-2 rounded-full bg-white" />
          <span>LIVE</span>
        </div>

        {/* Platform Destinations */}
        {isMultiDest ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-700/80 text-[10px] font-bold text-purple-300 shadow">
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>Dual Stream</span>
          </div>
        ) : isYouTubeDest ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-950/90 border border-red-500/40 text-[10px] font-bold text-red-300 shadow">
            <Youtube className="w-3 h-3 text-red-400" />
            <span>YouTube</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/90 border border-blue-500/40 text-[10px] font-bold text-blue-300 shadow">
            <Share2 className="w-3 h-3 text-blue-400" />
            <span>Facebook</span>
          </div>
        )}

        {/* Rotation Badge */}
        {automation?.currentRotationIndex > 0 && (
          <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-700 text-[10px] font-mono text-slate-300 shadow">
            <span>Rot #{automation.currentRotationIndex}</span>
          </div>
        )}
      </div>

      {/* 3. Top-Right Controls (Maximize / Mute / Close) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        {/* Mute/Unmute Audio */}
        {isVideo && (
          <button
            type="button"
            onClick={toggleMute}
            className="p-1.5 rounded-lg bg-black/80 hover:bg-black text-white border border-white/20 transition-all hover:scale-105 active:scale-95 shadow"
            title={isMuted ? 'Unmute audio' : 'Mute audio'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
        )}

        {/* Dedicated Fullscreen Button */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="p-1 sm:p-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 transition-all hover:scale-105 active:scale-95 shadow-md"
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (Double-click or click)'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* Maximize / Minimize Theater Mode Button */}
        {onMaximize && !isMaximized && !isFullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMaximize();
            }}
            className="p-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-600 text-white border border-blue-400/30 transition-all hover:scale-105 active:scale-95 shadow-md shadow-blue-950/50"
            title="Maximize to Theater Screen"
          >
            <Maximize2 className="w-3.5 h-3.5 text-blue-200" />
          </button>
        )}

        {onMinimize && isMaximized && !isFullscreen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
            className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-slate-600 transition-all hover:scale-105 active:scale-95 shadow"
            title="Minimize to Mini Screen"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-lg bg-black/80 hover:bg-rose-600 text-white/80 hover:text-white border border-white/20 transition-all hover:scale-105 active:scale-95 shadow"
            title="Hide Mini Screen"
          >
            <span className="text-xs font-bold leading-none">✕</span>
          </button>
        )}
      </div>

      {/* 4. Bottom Live Status Gradient Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3 pt-6 transition-opacity ${
          isHovered || isMaximized ? 'opacity-100' : 'opacity-0 sm:opacity-90'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold text-white truncate drop-shadow flex items-center gap-2">
              <span>{automation?.name || 'Live Broadcast Stream'}</span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[9px] border border-emerald-500/30" title="Internal preview running at 360p to minimize CPU/GPU load">
                PREVIEW: 360p ECO
              </span>
            </p>
            <p className="text-[10px] text-slate-300 truncate drop-shadow flex items-center gap-1.5">
              <span>Dest: {automation?.facebookPageId?.name || 'Facebook Live'}</span>
              <span className="text-emerald-400 font-semibold">• Broadcast: {(automation?.youtubeResolution || '1080p').toUpperCase()}</span>
              {telemetry?.fps && <span>• {telemetry.fps} FPS</span>}
              {telemetry?.bitrate && <span>• {telemetry.bitrate}</span>}
            </p>
          </div>

          {/* Quick Maximize Prompt in Mini Mode */}
          {onMaximize && !isMaximized && (
            <button
              type="button"
              onClick={onMaximize}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600/90 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 transition-all shadow"
            >
              <Maximize2 className="w-3 h-3" />
              <span>Maximize</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveFeedScreen;
