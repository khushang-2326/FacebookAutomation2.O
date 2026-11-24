import React, { useState, useEffect } from 'react';
import { automationAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import {
  Repeat,
  Zap,
  Camera,
  Radio,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Play
} from 'lucide-react';

/**
 * Real-Time Live Camera Schedule & Instant Manual Switcher
 * Displays all scheduled camera slots with active on-air indicators,
 * live countdown timers, and 1-click instant camera switching.
 */
export const LiveCameraScheduleSwitcher = ({
  automation,
  onSwitched,
  className = ''
}) => {
  const { socket } = useSocket();
  const schedules = Array.isArray(automation?.cameraSchedules) ? automation.cameraSchedules : [];
  const isLive = automation?.status === 'LIVE' || automation?.status === 'STREAMING';

  const [activeSlotIndex, setActiveSlotIndex] = useState(automation?.currentCameraSlotIndex ?? 0);
  const [streamStartedAt, setStreamStartedAt] = useState(
    automation?.cameraStreamStartedAt
      ? new Date(automation.cameraStreamStartedAt).getTime()
      : Date.now()
  );
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [switchingIndex, setSwitchingIndex] = useState(null);
  const [switchFeedback, setSwitchFeedback] = useState(null);

  // Sync with automation prop
  useEffect(() => {
    if (automation) {
      if (automation.currentCameraSlotIndex !== undefined) {
        setActiveSlotIndex(automation.currentCameraSlotIndex);
      }
      if (automation.cameraStreamStartedAt) {
        setStreamStartedAt(new Date(automation.cameraStreamStartedAt).getTime());
      }
    }
  }, [automation?.currentCameraSlotIndex, automation?.cameraStreamStartedAt]);

  // Listen to socket event for real-time sync across all devices/tabs
  useEffect(() => {
    if (!socket || !automation?._id) return;

    const targetId = String(
      typeof automation._id === 'object'
        ? (automation._id._id || automation._id.id || '')
        : automation._id
    );

    const handleCameraSwitched = (data) => {
      if (String(data?.automationId) === targetId) {
        const slotIdx = data.activeSlotIndex !== undefined ? data.activeSlotIndex : data.slotIndex;
        if (slotIdx !== undefined) {
          setActiveSlotIndex(slotIdx);
        }
        setStreamStartedAt(
          data.cameraStreamStartedAt ? new Date(data.cameraStreamStartedAt).getTime() : Date.now()
        );
        setSwitchFeedback({
          type: 'success',
          message: `Switched live to ${data.cameraName || `Camera #${(slotIdx ?? 0) + 1}`} (${data.durationSeconds || 20}s)`
        });
        setTimeout(() => setSwitchFeedback(null), 4000);
        if (onSwitched) onSwitched(data);
      }
    };

    socket.on('camera:active_switched', handleCameraSwitched);
    return () => {
      socket.off('camera:active_switched', handleCameraSwitched);
    };
  }, [socket, automation?._id, onSwitched]);

  // Real-time calculation of remaining seconds for active camera slot
  useEffect(() => {
    if (!isLive || schedules.length === 0) return;

    const currentSlot = schedules[activeSlotIndex] || schedules[0];
    const slotDuration = Math.max(1, parseInt(currentSlot?.durationSeconds, 10) || 20);

    const updateTimer = () => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - streamStartedAt) / 1000));
      const left = Math.max(0, slotDuration - elapsedSec);
      setSecondsRemaining(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isLive, schedules, streamStartedAt, activeSlotIndex]);

  // Handle manual switch action
  const handleSwitchToSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (switchingIndex !== null) return;

    setSwitchingIndex(slotIdx);
    setSwitchFeedback(null);

    try {
      const res = await automationAPI.switchCamera(automation._id, slotIdx);
      if (res.data?.success) {
        setActiveSlotIndex(slotIdx);
        setStreamStartedAt(Date.now());
        setSecondsRemaining(res.data.durationSeconds || schedules[slotIdx]?.durationSeconds || 20);
        setSwitchFeedback({
          type: 'success',
          message: `Switched stream instantly to Slot #${slotIdx + 1} (${res.data.cameraName || 'Camera'})!`
        });
        if (onSwitched) onSwitched(res.data);
      }
    } catch (err) {
      setSwitchFeedback({
        type: 'error',
        message: err.response?.data?.error || err.message || 'Failed to switch camera stream'
      });
    } finally {
      setSwitchingIndex(null);
      setTimeout(() => setSwitchFeedback(null), 5000);
    }
  };

  if (schedules.length === 0) return null;

  const totalCycleSec = schedules.reduce(
    (sum, s) => sum + Math.max(1, parseInt(s.durationSeconds, 10) || 20),
    0
  );

  return (
    <div className={`glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Repeat className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Live Scheduled Camera Rotation & Instant Switcher</span>
              {isLive && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-extrabold text-rose-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                  LIVE
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Click any camera below to instantly switch the Facebook live stream to that camera for its scheduled duration.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
            {schedules.length} Slots
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-semibold">
            {totalCycleSec}s Cycle
          </span>
        </div>
      </div>

      {/* Feedback Toast */}
      {switchFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-1 ${
            switchFeedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {switchFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{switchFeedback.message}</span>
        </div>
      )}

      {/* Camera Schedule Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {schedules.map((slot, index) => {
          const isWebcam = slot.cameraType === 'WEBCAM' || Boolean(slot.deviceName);
          const displayName = slot.cameraName || (isWebcam ? (slot.deviceName || `Webcam #${index + 1}`) : (slot.cameraId?.name || `CCTV #${index + 1}`));
          const duration = Math.max(1, parseInt(slot.durationSeconds, 10) || 20);
          const isCurrentlyActive = isLive && activeSlotIndex === index;
          const isSwitchingThis = switchingIndex === index;

          // Progress percentage for active slot
          const progressPercent = isCurrentlyActive
            ? Math.min(100, Math.max(0, ((duration - secondsRemaining) / duration) * 100))
            : 0;

          return (
            <div
              key={slot._id || slot.scheduleId || `${index}-${slot.deviceName || slot.cameraId}`}
              onClick={(e) => {
                if (!isCurrentlyActive && isLive) {
                  handleSwitchToSlot(index, e);
                }
              }}
              className={`relative rounded-xl border p-3.5 flex flex-col justify-between transition-all select-none overflow-hidden ${
                isCurrentlyActive
                  ? 'bg-rose-950/20 border-rose-500/70 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
                  : isLive
                  ? 'bg-slate-900/60 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 cursor-pointer hover:shadow-md'
                  : 'bg-slate-900/40 border-slate-800 opacity-75'
              }`}
            >
              {/* Top Progress Bar for Active Streaming Slot */}
              {isCurrentlyActive && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-rose-950/50">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500 ease-linear"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              {/* Slot Header */}
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 font-mono ${
                      isCurrentlyActive
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                          isWebcam
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                      >
                        {isWebcam ? 'Webcam' : 'CCTV'}
                      </span>
                      <h4 className="font-bold text-xs text-slate-100 truncate" title={displayName}>
                        {displayName}
                      </h4>
                    </div>
                  </div>
                </div>

                {isCurrentlyActive ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-[10px] font-bold text-rose-300 shrink-0 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    ON AIR
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {duration}s
                  </span>
                )}
              </div>

              {/* Middle Duration Info */}
              <div className="my-2 flex items-center justify-between text-xs">
                {isCurrentlyActive ? (
                  <div className="flex items-center gap-1.5 text-amber-300 font-bold font-mono">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{secondsRemaining}s remaining</span>
                    <span className="text-[10px] text-slate-400 font-normal">of {duration}s</span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Duration: <strong className="text-slate-200">{duration} sec</strong></span>
                  </span>
                )}
              </div>

              {/* Action / Select Button */}
              <div className="mt-1 pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                {isCurrentlyActive ? (
                  <div className="w-full text-center py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-[11px] font-bold text-rose-300 flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    <span>Selected & Streaming Live</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isSwitchingThis}
                    onClick={(e) => handleSwitchToSlot(index, e)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
                  >
                    {isSwitchingThis ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Selecting Stream...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
                        <span>Select for Instant Streaming</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rotation Chain Preview */}
      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="font-bold text-slate-300 flex items-center gap-1 shrink-0">
          <Repeat className="w-3.5 h-3.5 text-blue-400" />
          <span>Active Rotation Sequence:</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          {schedules.map((s, idx) => {
            const isWebcam = s.cameraType === 'WEBCAM' || Boolean(s.deviceName);
            const name = s.cameraName || (isWebcam ? (s.deviceName || `Webcam #${idx + 1}`) : (s.cameraId?.name || `CCTV #${idx + 1}`));
            const dur = Math.max(1, parseInt(s.durationSeconds, 10) || 20);
            const isActive = isLive && activeSlotIndex === idx;

            return (
              <React.Fragment key={idx}>
                <span
                  className={`px-2 py-0.5 rounded-md font-semibold text-[11px] flex items-center gap-1 transition-all ${
                    isActive
                      ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold scale-105'
                      : 'bg-slate-900 border border-slate-800 text-slate-300'
                  }`}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />}
                  <span>#{idx + 1} {name} ({dur}s)</span>
                </span>
                {idx < schedules.length - 1 ? (
                  <span className="text-slate-600 font-bold">➔</span>
                ) : (
                  <span className="text-blue-400 font-bold">➔ ↺ Loops back to #1</span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveCameraScheduleSwitcher;
