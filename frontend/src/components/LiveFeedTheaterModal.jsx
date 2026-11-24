import React, { useState, useEffect } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  Radio,
  Share2,
  Youtube,
  RotateCw,
  Pause,
  Play,
  Square,
  Volume2,
  VolumeX,
  Activity,
  Layers,
  Sparkles,
  Clock,
  ShieldCheck,
  AlertOctagon,
  Tv,
  ExternalLink
} from 'lucide-react';
import LiveCountdown from './LiveCountdown';
import LiveFeedScreen from './LiveFeedScreen';
import { automationAPI } from '../services/api';
import { castToExternalDisplay } from '../utils/projectorCast';

export const LiveFeedTheaterModal = ({
  automation,
  telemetry = null,
  onClose,
  onMinimize,
  onRefresh
}) => {
  const modalRef = useRef(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isTrueFullscreen, setIsTrueFullscreen] = useState(false);

  // Sync state with HTML5 Fullscreen API
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement &&
        (document.fullscreenElement === modalRef.current || modalRef.current?.contains(document.fullscreenElement))
      );
      setIsTrueFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const toggleTrueFullscreen = async (e) => {
    e?.stopPropagation();
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(false);
      } else if (modalRef.current) {
        const el = modalRef.current;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(true);
      }
    } catch (err) {
      console.warn('[LiveFeedTheaterModal] Fullscreen error:', err);
      if (window.electronAPI?.toggleFullscreen) {
        try { await window.electronAPI.toggleFullscreen(); } catch (_) {}
      }
    }
  };

  if (!automation) return null;

  const handleRotateNow = async () => {
    setIsRotating(true);
    try {
      await automationAPI.rotateNow(automation._id);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Rotate failed: ${err.message}`);
    } finally {
      setIsRotating(false);
    }
  };

  const handleStop = async () => {
    if (!window.confirm(`Stop live broadcast for "${automation.name}"?`)) return;
    setIsStopping(true);
    try {
      await automationAPI.stop(automation._id);
      if (onRefresh) onRefresh();
      if (onClose) onClose();
    } catch (err) {
      alert(`Stop failed: ${err.message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const isMultiDest = automation.destinationPlatform === 'MULTI_DESTINATION' || (automation.targetPageIds && automation.targetPageIds.length > 1);
  const isYouTubeDest = automation.destinationPlatform === 'YOUTUBE' || automation.facebookPageId?.platform === 'YOUTUBE';

  // Handle ESC key to minimize or close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (onMinimize) onMinimize();
        else if (onClose) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMinimize, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (onMinimize) onMinimize();
      else if (onClose) onClose();
    }
  };

  return (
    <div
      ref={modalRef}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-300 ${
        isTrueFullscreen
          ? '!z-[99999] !w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0 bg-black'
          : 'bg-slate-950/95 backdrop-blur-2xl p-3 sm:p-6 overflow-y-auto cursor-pointer animate-in fade-in duration-200'
      }`}
    >
      {/* Floating Exit Button for True Fullscreen */}
      {isTrueFullscreen && (
        <button
          type="button"
          onClick={toggleTrueFullscreen}
          className="absolute top-4 right-4 z-[100000] px-4 py-2 bg-slate-900/90 hover:bg-rose-600 text-white rounded-xl border border-slate-700/80 shadow-2xl flex items-center gap-2 backdrop-blur-md text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer"
          title="Exit Fullscreen (Esc)"
        >
          <Minimize2 className="w-4 h-4 text-emerald-400 group-hover:text-white" />
          <span>Exit Fullscreen (Esc)</span>
        </button>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-slate-900 flex flex-col overflow-hidden transition-all ${
          isTrueFullscreen
            ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none bg-black'
            : 'w-full max-w-6xl border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl max-h-[95vh] cursor-default'
        }`}
      >
        {/* 1. Modal Top Bar */}
        <div className={`h-16 border-b border-slate-800 bg-slate-950/80 px-4 sm:px-6 flex items-center justify-between shrink-0 ${isTrueFullscreen ? 'hidden' : ''}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-600 text-white text-xs font-black tracking-wider uppercase shadow-md shadow-rose-950/60">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <span>LIVE FEED</span>
            </div>

            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white truncate">
                {automation.name}
              </h3>
              <p className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                <span>Dest: <strong>{automation.facebookPageId?.name || 'Facebook Live'}</strong></span>
                <span>•</span>
                <span>Rotation #{automation.currentRotationIndex || 1}</span>
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Cast to HDMI Button */}
            <button
              type="button"
              onClick={() => castToExternalDisplay({ mode: 'AUTOMATION', automationId: automation._id })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-md shadow-indigo-600/30 cursor-pointer"
              title="Cast this Live Stream to HDMI / External Screen"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cast HDMI</span>
            </button>

            {/* Dedicated True Fullscreen Button covering Windows Taskbar */}
            <button
              type="button"
              onClick={toggleTrueFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 text-xs font-bold transition-all hover:scale-105 active:scale-95 shadow-md shadow-emerald-600/30 cursor-pointer"
              title="Full Screen (Covers whole screen including Windows Taskbar)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Full Screen</span>
            </button>

            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all hover:scale-105 active:scale-95"
                title="Minimize back to mini screen in corner"
              >
                <Minimize2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Mini Screen</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
              title="Close Theater Mode"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Main Content Grid (16:9 Screen + Telemetry Panel) */}
        <div className={`flex-1 overflow-y-auto ${
          isTrueFullscreen
            ? '!w-screen !h-screen !p-0 !m-0 flex items-center justify-center bg-black'
            : 'grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6'
        }`}>
          {/* Video Player */}
          <div className={`${
            isTrueFullscreen
              ? '!w-screen !h-screen !max-w-none !max-h-none flex items-center justify-center bg-black'
              : 'lg:col-span-2 flex flex-col justify-center'
          }`}>
            <div
              onDoubleClick={toggleTrueFullscreen}
              className={`relative overflow-hidden bg-black flex items-center justify-center ${
                isTrueFullscreen
                  ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !shadow-none'
                  : 'aspect-video w-full rounded-2xl shadow-2xl border-2 border-slate-800'
              }`}
            >
              <LiveFeedScreen
                automation={automation}
                telemetry={telemetry}
                isMaximized={true}
                onMinimize={onMinimize}
                className={isTrueFullscreen ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none' : ''}
              />
            </div>

            {/* Quick Live Controls Bar under video (hidden in fullscreen) */}
            {!isTrueFullscreen && (
              <div className="mt-3.5 flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRotateNow}
                    disabled={isRotating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold transition-all shadow-sm"
                    title="Rotate to next continuous live session"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isRotating ? 'animate-spin' : ''}`} />
                    <span>{isRotating ? 'Rotating...' : 'Rotate Now'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStop}
                    disabled={isStopping}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all shadow-sm"
                    title="Stop broadcast immediately"
                  >
                    <Square className="w-3.5 h-3.5 text-rose-400" />
                    <span>{isStopping ? 'Stopping...' : 'Stop Broadcast'}</span>
                  </button>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                  <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>Real-Time Output Stream Active</span>
                </div>
              </div>
            )}
          </div>

          {/* Right Col: Live Stream Telemetry & Meta (hidden in fullscreen) */}
          {!isTrueFullscreen && (
            <div className="space-y-4">
            {/* Auto-Rotation Countdown Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-400" />
                <span>Next Auto-Rotation Countdown</span>
              </span>
              <LiveCountdown
                currentRotationIndex={automation.currentRotationIndex}
                lastRotatedAt={automation.lastRotatedAt}
                rotationDurationSec={automation.rotationDurationSec || 18000}
                onRotateNow={handleRotateNow}
              />
            </div>

            {/* Destination Channels Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Share2 className="w-4 h-4 text-indigo-400" />
                <span>Active Streaming Destinations</span>
              </span>

              <div className="space-y-2">
                {automation.targetPageIds && automation.targetPageIds.length > 0 ? (
                  automation.targetPageIds.map((dest, idx) => (
                    <div
                      key={dest._id || idx}
                      className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {dest.platform === 'YOUTUBE' ? (
                          <Youtube className="w-4 h-4 text-red-400 shrink-0" />
                        ) : (
                          <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                        <span className="font-semibold text-slate-200 truncate">{dest.name}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        LIVE
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="font-semibold text-slate-200 truncate">
                        {automation.facebookPageId?.name || 'Facebook Live'}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      LIVE
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Source Details Card */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <span className="font-bold text-slate-300">Broadcast Source Specs</span>
              <div className="space-y-1.5 text-slate-400 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span>Source Type:</span>
                  <span className="text-slate-200 font-bold">{automation.sourceType}</span>
                </div>
                {automation.mediaId && (
                  <div className="flex justify-between">
                    <span>Media File:</span>
                    <span className="text-slate-200 truncate max-w-[150px]">{automation.mediaId.originalName}</span>
                  </div>
                )}
                {automation.audioSourceType && (
                  <div className="flex justify-between">
                    <span>Audio Mode:</span>
                    <span className="text-purple-300">{automation.audioSourceType}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Looping:</span>
                  <span className="text-emerald-400">Continuous 24/7</span>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default LiveFeedTheaterModal;
