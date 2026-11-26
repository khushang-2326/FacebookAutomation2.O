import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { automationAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import StatusPill from '../components/StatusPill';
import LiveCountdown from '../components/LiveCountdown';
import TelemetryPanel from '../components/TelemetryPanel';
import { EditAutomationModal } from '../components/EditAutomationModal';
import LiveFeedScreen from '../components/LiveFeedScreen';
import LiveFeedTheaterModal from '../components/LiveFeedTheaterModal';
import LiveCameraScheduleSwitcher from '../components/LiveCameraScheduleSwitcher';
import {
  Radio,
  RotateCw,
  Play,
  Pause,
  Square,
  ShieldCheck,
  Clock,
  Terminal,
  Trash2,
  Share2,
  Video,
  Camera,
  ArrowLeft,
  Activity,
  Layers,
  AlertTriangle,
  AlertCircle,
  Youtube,
  Mic,
  Music,
  Sparkles,
  VolumeX,
  Sliders,
  Maximize2,
  Tv,
  Info
} from 'lucide-react';
import { castToExternalDisplay } from '../utils/projectorCast';

export const AutomationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, joinAutomationRoom, leaveAutomationRoom, latestMetrics } = useSocket();

  const [automation, setAutomation] = useState(null);
  const [broadcasts, setBroadcasts] = useState([]);
  const [activeProcess, setActiveProcess] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRotating, setIsRotating] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTheaterOpen, setIsTheaterOpen] = useState(false);

  const fetchDetail = async () => {
    try {
      const res = await automationAPI.getById(id);
      setAutomation(res.data.automation);
      setBroadcasts(res.data.broadcasts || []);
      setActiveProcess(res.data.activeProcess || null);
      setNotFound(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        console.error('Failed to load automation details:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();

    const interval = setInterval(() => {
      if (!notFound) fetchDetail();
    }, 5000);

    return () => clearInterval(interval);
  }, [id, notFound]);

  useEffect(() => {
    if (!socket || !id) return;

    joinAutomationRoom(id);

    const handleMetrics = (data) => {
      if (data.automationId === id) {
        setActiveProcess((prev) => ({
          ...prev,
          metrics: data.metrics,
        }));
      }
    };

    const handleClosed = () => {
      fetchDetail();
    };

    const handleCameraSwitched = (data) => {
      if (String(data?.automationId) === String(id)) {
        fetchDetail();
      }
    };

    const handleMediaSwitched = (data) => {
      if (String(data?.automationId) === String(id)) {
        fetchDetail();
      }
    };

    const handleYoutubeSwitched = (data) => {
      if (String(data?.automationId) === String(id)) {
        fetchDetail();
      }
    };

    const handleAutomationUpdated = (data) => {
      if (String(data?._id || data?.automationId) === String(id)) {
        fetchDetail();
      }
    };

    socket.on('gstreamer:metrics', handleMetrics);
    socket.on('gstreamer:closed', handleClosed);
    socket.on('ffmpeg:metrics', handleMetrics);
    socket.on('ffmpeg:closed', handleClosed);
    socket.on('camera:active_switched', handleCameraSwitched);
    socket.on('media:active_switched', handleMediaSwitched);
    socket.on('youtube:active_switched', handleYoutubeSwitched);
    socket.on('automation:retrying', handleAutomationUpdated);
    socket.on('automation:updated', handleAutomationUpdated);

    return () => {
      leaveAutomationRoom(id);
      socket.off('gstreamer:metrics', handleMetrics);
      socket.off('gstreamer:closed', handleClosed);
      socket.off('ffmpeg:metrics', handleMetrics);
      socket.off('ffmpeg:closed', handleClosed);
      socket.off('camera:active_switched', handleCameraSwitched);
      socket.off('media:active_switched', handleMediaSwitched);
      socket.off('youtube:active_switched', handleYoutubeSwitched);
      socket.off('automation:retrying', handleAutomationUpdated);
      socket.off('automation:updated', handleAutomationUpdated);
    };
  }, [id, socket]);

  const handleRotateNow = async () => {
    setIsRotating(true);
    try {
      await automationAPI.rotateNow(id);
      await fetchDetail();
    } catch (err) {
      alert(`Rotate failed: ${err.message}`);
    } finally {
      setIsRotating(false);
    }
  };

  const handlePause = async () => {
    try {
      await automationAPI.pause(id);
      await fetchDetail();
    } catch (err) {
      alert(`Pause failed: ${err.message}`);
    }
  };

  const handleResume = async () => {
    try {
      await automationAPI.resume(id);
      await fetchDetail();
    } catch (err) {
      const stage = err.response?.data?.stage ? ` [Stage: ${err.response.data.stage}]` : '';
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message;
      alert(`Resume Failed${stage}\n\n${errMsg}`);
    }
  };

  const handleStop = async () => {
    if (!window.confirm('Stop this automation and end the live stream?')) return;
    try {
      await automationAPI.stop(id);
      await fetchDetail();
    } catch (err) {
      alert(`Stop failed: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this automation permanently?')) return;
    try {
      await automationAPI.delete(id);
      navigate('/');
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RotateCw className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (notFound || !automation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-slate-100 mb-2">Automation Session Expired or Removed</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          This automation session is no longer active or the server database was reset.
        </p>
        <Link
          to="/"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-blue-500/20"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const isLive = automation.status === 'LIVE';
  const isRotatingState = automation.status === 'ROTATING';
  const currentMetrics = latestMetrics[id] || activeProcess?.metrics;

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200 mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight">{automation.name}</h2>
            <StatusPill status={automation.status} size="lg" />
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-xs text-slate-400">
              Live Stream Control & Telemetry Center
            </p>
            {automation.youtubeResolution && (
              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-mono">
                YT: {automation.youtubeResolution.toUpperCase()} @ {automation.youtubeFps || automation.fps || 30}FPS
              </span>
            )}
            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded font-mono">
              OUTPUT: {automation.fps || 30} FPS
            </span>
          </div>
          {automation.scheduleMode === 'RECURRING_WINDOW' && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  {automation.scheduleName ? `${automation.scheduleName}: ` : ''}
                  {automation.daysOfWeek?.length === 7 ? 'Everyday' : automation.daysOfWeek?.map(d => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]).join(', ')} ({automation.dailyStartTime} - {automation.dailyEndTime} {automation.timezone})
                </span>
              </span>
              {(automation.startDate || automation.endDate) && (
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 font-mono">
                  📅 {automation.startDate ? new Date(automation.startDate).toLocaleDateString() : 'Start'} to {automation.endDate ? new Date(automation.endDate).toLocaleDateString() : 'Continuous'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Live Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => castToExternalDisplay({ mode: 'AUTOMATION', automationId: id })}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500 text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95 cursor-pointer"
            title="Cast this Live Stream directly to HDMI / External Screen"
          >
            <Tv className="w-4 h-4 text-indigo-400 group-hover:text-white" />
            <span>Cast to HDMI</span>
          </button>

          <button
            onClick={() => navigate(`/automations/${id}/edit`)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/20"
            title="Modify Live Automation Modules (Title, Video, Audio, Destination, Timezone, Schedule)"
          >
            <Sliders className="w-4 h-4" />
            <span>Modify Stream & Modules</span>
          </button>

          <button
            onClick={handleRotateNow}
            disabled={!isLive || isRotating}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              isLive
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-lg shadow-amber-500/10'
                : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
            }`}
            title="Force immediate broadcast rotation"
          >
            <RotateCw className={`w-4 h-4 ${isRotating ? 'animate-spin' : 'animate-spin-slow'}`} />
            <span>Rotate Now</span>
          </button>

          {isLive ? (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 text-xs font-bold transition-all"
            >
              <Pause className="w-4 h-4" />
              <span>Pause</span>
            </button>
          ) : (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all"
            >
              <Play className="w-4 h-4" />
              <span>Resume Stream</span>
            </button>
          )}

          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all"
          >
            <Square className="w-4 h-4" />
            <span>Stop</span>
          </button>

          <button
            onClick={handleDelete}
            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
            title="Delete Automation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scheduled Broadcast Retrying Alert */}
      {automation?.status === 'SCHEDULED' && automation?.retryCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start justify-between gap-3 text-amber-200">
          <div className="flex items-start gap-3 min-w-0">
            <RotateCw className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-spin" />
            <div className="min-w-0 space-y-1">
              <h4 className="font-bold text-sm text-amber-300">
                Scheduled Broadcast Pending Start (Retry Attempt #{automation.retryCount})
              </h4>
              <p className="text-xs text-amber-200/90 font-mono">{automation.lastError || 'Retrying live stream start for 5 minutes before showing error.'}</p>
              {automation.nextRetryScheduledAt && (
                <p className="text-[11px] text-amber-300/80">
                  Next retry scheduled at: {new Date(automation.nextRetryScheduledAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Failure Stage Diagnostic Alert */}
      {automation?.status === 'FAILED' && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start justify-between gap-3 text-rose-200">
          <div className="flex items-start gap-3 min-w-0">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-1">
              <h4 className="font-bold text-sm text-rose-300">
                Pipeline Failure at Stage: <span className="font-mono underline">{automation.failureStage || 'UNKNOWN'}</span>
              </h4>
              <p className="text-xs text-rose-200/90 font-mono">{automation.lastError || 'Automation execution encountered an error.'}</p>
              
              <div className="pt-2 text-[11px] text-amber-200/90 bg-amber-950/30 p-2.5 rounded-xl border border-amber-500/20 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip for Stream Key Mode:</strong> In Facebook Live Producer settings, enable <strong>"Auto-start live video when stream key connects"</strong>, or click <strong>"Go Live"</strong> inside Facebook Live Producer. Otherwise, Facebook automatically drops preview streams after 5 minutes.
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleResume}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 shrink-0 flex items-center gap-1.5 transition-all"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Retry / Resume Stream</span>
          </button>
        </div>
      )}

      {/* 6-Stage Pipeline Architecture Status Matrix */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center justify-between">
          <span>End-to-End Live Stream Pipeline Status</span>
          <span className="font-mono text-[10px] text-slate-500">MediaMTX Path: /{automation.mediaMtxPath || 'auto_live'}</span>
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Stage 1: Camera */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">1. Camera</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${automation.cameraStatus === 'ONLINE' ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm' : automation.cameraStatus === 'CONNECTING' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{automation.cameraStatus || (automation.sourceType?.includes('CAMERA') ? 'ONLINE' : 'N/A')}</span>
            </div>
          </div>

          {/* Stage 2: RTSP */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">2. RTSP Transport</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${automation.rtspStatus === 'CONNECTED' ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm' : automation.rtspStatus === 'TESTING' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{automation.rtspStatus || (automation.sourceType?.includes('CAMERA') ? 'CONNECTED' : 'N/A')}</span>
            </div>
          </div>

          {/* Stage 3: MediaMTX */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">3. MediaMTX Relay</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${automation.mediamtxStatus === 'READY' ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm' : automation.mediamtxStatus === 'STARTING' ? 'bg-amber-400 animate-pulse' : automation.mediamtxStatus === 'NOT_REQUIRED' ? 'bg-slate-500' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{automation.mediamtxStatus || (automation.sourceType?.includes('CAMERA') ? 'READY' : 'N/A')}</span>
            </div>
          </div>

          {/* Stage 4: FFprobe */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">4. FFprobe Test</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${automation.ffprobeStatus === 'READY' ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm' : automation.ffprobeStatus === 'NOT_STARTED' ? 'bg-slate-500' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{automation.ffprobeStatus || 'READY'}</span>
            </div>
          </div>

          {/* Stage 5: GStreamer Engine */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">5. GStreamer Engine</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${(automation.gstreamerStatus === 'RUNNING' || automation.mediaEngineStatus === 'RUNNING' || (automation.status === 'LIVE' && !['FAILED', 'STOPPED'].includes(automation.gstreamerStatus))) ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm animate-pulse' : (automation.gstreamerStatus === 'STARTING' || automation.status === 'PREPARING') ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">
                {automation.gstreamerStatus || automation.mediaEngineStatus || (automation.status === 'LIVE' ? 'RUNNING' : automation.status === 'PREPARING' ? 'STARTING' : 'STOPPED')}
              </span>
            </div>
          </div>

          {/* Stage 6: Facebook RTMPS */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] text-slate-400 uppercase font-bold">6. Facebook Live</span>
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`w-2 h-2 rounded-full ${automation.facebookStatus === 'LIVE' || automation.status === 'LIVE' ? 'bg-emerald-400 shadow-emerald-500/50 shadow-sm animate-pulse' : automation.facebookStatus === 'CREATING' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-xs font-mono font-bold text-slate-200">{automation.facebookStatus || (automation.status === 'LIVE' ? 'LIVE' : 'ENDED')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Target Destination Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="relative shrink-0">
            <img
              src={automation.facebookPageId?.pictureUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'}
              alt="Destination"
              className="w-12 h-12 rounded-xl object-cover border border-slate-700"
            />
            {automation.destinationPlatform === 'MULTI_DESTINATION' || (automation.targetPageIds && automation.targetPageIds.length > 1) ? (
              <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-0.5 rounded-full shadow">
                <Sparkles className="w-3 h-3 text-amber-300" />
              </span>
            ) : (automation.destinationPlatform === 'YOUTUBE' || automation.facebookPageId?.platform === 'YOUTUBE' ? (
              <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-0.5 rounded-full shadow">
                <Youtube className="w-3 h-3" />
              </span>
            ) : (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white p-0.5 rounded-full shadow">
                <Share2 className="w-3 h-3" />
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">
              {automation.destinationPlatform === 'MULTI_DESTINATION' || (automation.targetPageIds && automation.targetPageIds.length > 1)
                ? `Multi-Stream (${automation.targetPageIds?.length || 2} Platforms)`
                : (automation.destinationPlatform === 'YOUTUBE' || automation.facebookPageId?.platform === 'YOUTUBE' ? 'YouTube Live Channel' : 'Facebook Destination')}
            </p>
            <h4 className="font-bold text-sm text-indigo-300 truncate">
              {automation.targetPageIds && automation.targetPageIds.length > 1
                ? automation.targetPageIds.map(p => p.name || 'Destination').join(' + ')
                : (automation.facebookPageId?.name || 'Live Channel')}
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {automation.destinationPlatform === 'MULTI_DESTINATION' ? 'SIMULTANEOUS RESTREAM' : (automation.facebookPageId?.isMock ? 'MOCK' : 'OFFICIAL')}
            </span>
          </div>
        </div>

        {/* Video Source Card (Webcam / RTSP / Video) */}
        {automation?.sourceType === 'LOCAL_CAMERA' ? (
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Camera className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Live Webcam / Camera</p>
              <h4 className="font-bold text-sm text-slate-100 truncate">{automation.localCameraDevice || 'DirectShow Webcam'}</h4>
              <span className="text-[10px] text-blue-400 font-mono">
                DirectShow {automation.fps || 30}fps Live
              </span>
            </div>
          </div>
        ) : (automation?.sourceType === 'RTSP_CAMERA' || automation?.sourceType === 'ONVIF_CAMERA' || automation?.cameraId) ? (
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <Radio className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">CCTV Camera Stream</p>
              <h4 className="font-bold text-sm text-slate-100 truncate">{automation.cameraId?.name || 'Physical IP Camera'}</h4>
              <span className="text-[10px] text-cyan-400 font-mono">
                {automation.cameraId?.manufacturer || 'RTSP Active'}
              </span>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Video className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Looping Media</p>
              <h4 className="font-bold text-sm text-slate-100 truncate">{automation.mediaId?.originalName || 'Video File'}</h4>
              <span className="text-[10px] text-slate-500 font-mono">
                {automation.mediaId?.mediaType || 'MP4'} • {automation.mediaId?.width || '1920'}x{automation.mediaId?.height || '1080'}
              </span>
            </div>
          </div>
        )}

        {/* Audio Configuration Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            {automation.audioSourceType === 'MICROPHONE' ? (
              <Mic className="w-6 h-6" />
            ) : automation.audioSourceType === 'MIC_AND_TRACK' ? (
              <Sparkles className="w-6 h-6 text-purple-400" />
            ) : automation.audioSourceType === 'UPLOADED_AUDIO' ? (
              <Music className="w-6 h-6 text-purple-400" />
            ) : automation.audioSourceType === 'CAMERA_AUDIO' ? (
              <Radio className="w-6 h-6 text-indigo-400" />
            ) : (
              <VolumeX className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-400 uppercase font-semibold">Audio Configuration</p>
            <h4 className="font-bold text-sm text-indigo-300 truncate">
              {automation.audioSourceType === 'MIC_AND_TRACK'
                ? 'Singer Mode (Mic + MP3)'
                : automation.audioSourceType === 'MICROPHONE'
                ? 'Live Microphone'
                : automation.audioSourceType === 'UPLOADED_AUDIO'
                ? (automation.audioMediaIds?.length > 1 ? `MP3 Playlist (${automation.audioMediaIds.length} Tracks)` : 'MP3 Backing Track')
                : automation.audioSourceType === 'CAMERA_AUDIO'
                ? 'CCTV / Camera Audio'
                : 'Silent (Mute Stream)'}
            </h4>
            <span className="text-[10px] text-slate-400 truncate block">
              {automation.audioSourceType === 'MIC_AND_TRACK'
                ? `Mic: ${Math.round((automation.micVolume ?? 1) * 100)}% • Music: ${Math.round((automation.audioTrackVolume ?? 0.8) * 100)}%`
                : (automation.audioMediaIds?.length > 1
                    ? `${automation.audioMediaIds.length} MP3 Tracks in Loop Sequence`
                    : (automation.audioDeviceName || automation.audioMediaId?.originalName || (automation.audioSourceType === 'CAMERA_AUDIO' ? 'Built-in CCTV Mic' : 'Muted Audio Stream')))}
            </span>
          </div>
        </div>

        {/* Rotation Countdown Card */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-center">
          <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">
            Auto-Rotation (Part #{automation.currentRotationIndex || 1})
          </p>
          <LiveCountdown
            targetDate={automation.nextRotationScheduledAt}
            totalDurationSec={automation.rotationDurationSec}
            isRotation={isLive || isRotatingState}
          />
        </div>
      </div>

      {/* Live Stream Output Screen with Maximize */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isLive ? 'bg-rose-500 animate-ping' : 'bg-slate-500'}`} />
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wider">
              {isLive ? 'Active Live Feed Output' : 'Stream Media Output Feed'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsTheaterOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-bold transition-all shadow-md hover:scale-105 active:scale-95"
            title="Maximize to Theater Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Maximize Screen</span>
          </button>
        </div>

        <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-700/80 bg-black relative shadow-2xl">
          <LiveFeedScreen
            automation={automation}
            telemetry={currentMetrics}
            onMaximize={() => setIsTheaterOpen(true)}
          />
        </div>
      </div>

      {/* Live Camera Rotation Schedule & Instant Switcher */}
      {Array.isArray(automation?.cameraSchedules) && automation.cameraSchedules.length > 0 && (
        <LiveCameraScheduleSwitcher
          automation={automation}
          onSwitched={fetchDetail}
        />
      )}

      {/* Real-Time FFmpeg Telemetry Component */}
      <TelemetryPanel
        metrics={currentMetrics}
        activeProcess={activeProcess}
        isLive={isLive}
      />

      {/* Visual Broadcast Rotation Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-base text-slate-100">Broadcast Session Rotations</h3>
          </div>
          <span className="text-xs text-slate-400">Total Rotations: {broadcasts.length}</span>
        </div>

        {broadcasts.length === 0 ? (
          <div className="glass-panel p-8 rounded-2xl text-center border border-slate-800 text-slate-400 text-xs">
            No live broadcasts created yet for this schedule.
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <div
                key={b._id}
                className={`glass-panel p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  b.status === 'LIVE'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                      b.status === 'LIVE'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    #{b.rotationIndex}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-200">
                        Rotation Part #{b.rotationIndex}
                      </span>
                      <StatusPill status={b.status} size="sm" />
                    </div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                      FB Video ID: <span className="text-blue-300 font-semibold">{b.fbLiveVideoId}</span>
                    </p>
                    {b.secureStreamUrl || b.streamUrl ? (
                      <p className="text-[10px] font-mono text-slate-500 truncate max-w-md" title={b.secureStreamUrl || b.streamUrl}>
                        Ingest: {(b.secureStreamUrl || b.streamUrl).replace(/(\/rtmp\/|\/rtmps\/|\/live-api-s.facebook.com\/)([^?]+)/i, '$1****')}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Start Time</span>
                    <span className="text-slate-200 font-mono">
                      {b.actualStartTime ? new Date(b.actualStartTime).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Duration</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {b.durationSec}s
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block text-[10px]">Status</span>
                    <span className="font-semibold text-slate-300">{b.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditAutomationModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        automation={automation}
        onSaved={fetchDetail}
      />

      {/* Maximized Theater Modal */}
      {isTheaterOpen && (
        <LiveFeedTheaterModal
          automation={automation}
          telemetry={currentMetrics}
          onClose={() => setIsTheaterOpen(false)}
          onMinimize={() => setIsTheaterOpen(false)}
          onRefresh={fetchDetail}
        />
      )}
    </div>
  );
};

export default AutomationDetail;

