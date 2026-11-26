import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { automationAPI } from '../services/api';
import LiveCameraMiniScreen from '../components/LiveCameraMiniScreen';
import LiveFeedScreen from '../components/LiveFeedScreen';
import {
  Tv,
  Radio,
  Camera,
  Maximize2,
  Minimize2,
  X,
  RotateCw,
  Activity,
  Layers,
  Sparkles,
  Zap,
  Clock,
  ShieldCheck
} from 'lucide-react';

/**
 * Dedicated Fullscreen/HDMI Projector for Local Hardware Webcams.
 * Dual-Mode:
 *  - Primary: Direct 0ms hardware getUserMedia rendering.
 *  - Fallback / Live Broadcast: If DirectShow hardware is locked by FFmpeg broadcasting,
 *    automatically routes to MediaMTX WebRTC mirror stream (<500ms ultra-low latency).
 */
const ProjectorWebcamScreen = ({
  cameraName,
  streamPath,
  containerRef,
  hudVisible,
  isFullscreen,
  toggleFullscreen,
  handleClose,
  activeAutomation
}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'webrtc_mirror' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [isMuted, setIsMuted] = useState(true);

  // If an automation is live with LOCAL_CAMERA, it sends a mirror to MediaMTX
  const rawAutoId = typeof activeAutomation?._id === 'object'
    ? (activeAutomation._id._id || activeAutomation._id.id || '')
    : String(activeAutomation?._id || '');
  const cleanAutoId = rawAutoId ? rawAutoId.replace(/[^a-zA-Z0-9_]/g, '').slice(-12) : '';
  const mirrorStreamPath = activeAutomation?.mediaMtxPath || (cleanAutoId ? `webcam_${cleanAutoId}` : null);
  const isAutoStreaming = Boolean(
    activeAutomation &&
    (activeAutomation.status === 'LIVE' ||
     activeAutomation.status === 'ROTATING' ||
     activeAutomation.status === 'STREAMING' ||
     activeAutomation.ffmpegStatus === 'RUNNING')
  );

  const startWebcam = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage('');

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam media capture not supported in this environment');
      }

      let constraints = { video: true, audio: false };
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const query = (cameraName || streamPath || '').toLowerCase();

        const matched = videoInputs.find(d => {
          const lbl = (d.label || '').toLowerCase();
          return query && (lbl.includes(query) || query.includes(lbl));
        });

        if (matched && matched.deviceId) {
          constraints = { video: { deviceId: { exact: matched.deviceId } }, audio: false };
        } else if (videoInputs.length > 0) {
          constraints = { video: { deviceId: { exact: videoInputs[0].deviceId } }, audio: false };
        }
      } catch (_) {
        constraints = { video: true, audio: false };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {});
          setStatus('live');
        };
      }
    } catch (err) {
      console.warn('[ProjectorWebcam] Direct getUserMedia error:', err);
      // If hardware is locked (e.g. FFmpeg is actively broadcasting) and MediaMTX mirror exists:
      if (mirrorStreamPath && isAutoStreaming) {
        console.log('[ProjectorWebcam] Webcam device locked by broadcast; routing to MediaMTX WebRTC mirror:', mirrorStreamPath);
        setStatus('webrtc_mirror');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        if (mirrorStreamPath) {
          setStatus('webrtc_mirror');
        } else {
          setStatus('error');
          setErrorMessage('Camera is currently in use or locked by another application or FFmpeg.');
        }
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('error');
        setErrorMessage('Camera access was blocked by system/browser permissions.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to connect to webcam feed.');
      }
    }
  }, [cameraName, streamPath, mirrorStreamPath, isAutoStreaming]);

  useEffect(() => {
    startWebcam();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [startWebcam]);

  // If direct getUserMedia failed due to device locking during broadcast, use WebRTC mirror from MediaMTX
  if (status === 'webrtc_mirror' && mirrorStreamPath) {
    return (
      <div
        ref={containerRef}
        onDoubleClick={toggleFullscreen}
        className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none cursor-none flex items-center justify-center"
        style={{ cursor: hudVisible ? 'default' : 'none' }}
      >
        <LiveCameraMiniScreen
          streamPath={mirrorStreamPath}
          cameraName={cameraName || 'Webcam Live Stream'}
          isMaximized={true}
          className="!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0"
        />

        {/* Floating Auto-Hiding HUD Overlay */}
        <div
          className={`absolute top-4 left-4 right-4 z-[100000] flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
            hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-white shadow-2xl">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-600 text-[10px] font-black uppercase tracking-wider">
              <Camera className="w-3.5 h-3.5" />
              <span>HDMI WEBCAM LIVE</span>
            </div>
            <span className="text-xs font-bold text-slate-200">{cameraName || 'Webcam'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
              WebRTC Mirror &bull; &lt;500ms
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-white" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Close HDMI Projector (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
      className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none cursor-none flex items-center justify-center"
      style={{ cursor: hudVisible ? 'default' : 'none' }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className={`w-screen h-screen object-cover bg-black ${status === 'live' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />

      {status === 'connecting' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <RotateCw className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
          <h2 className="text-base font-bold text-white">Connecting Webcam Feed...</h2>
          <span className="text-xs text-slate-400 font-mono mt-1">{cameraName || 'Webcam'} &bull; Direct 0ms</span>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 p-6 text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-3">
            <Camera className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-base font-bold text-white">Webcam Standby</h2>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">{errorMessage}</p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={startWebcam}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Retry Webcam</span>
            </button>
            {mirrorStreamPath && (
              <button
                type="button"
                onClick={() => setStatus('webrtc_mirror')}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Tv className="w-3.5 h-3.5 text-emerald-400" />
                <span>Use WebRTC Stream</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Auto-Hiding HUD Overlay */}
      <div
        className={`absolute top-4 left-4 right-4 z-[100000] flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
          hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-white shadow-2xl">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-600 text-[10px] font-black uppercase tracking-wider">
            <Camera className="w-3.5 h-3.5" />
            <span>HDMI WEBCAM FEED</span>
          </div>
          <span className="text-xs font-bold text-slate-200">{cameraName || 'Webcam'}</span>
          {status === 'live' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              0ms Direct
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMuted(prev => !prev)}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <Radio className="w-4 h-4 text-slate-400" /> : <Radio className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Close HDMI Projector (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProjectorScreen = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'ACTIVE_BROADCAST'; // 'ACTIVE_BROADCAST' | 'CCTV' | 'WEBCAM' | 'AUTOMATION'
  const streamPath = searchParams.get('streamPath');
  const cameraName = searchParams.get('cameraName') || 'CCTV Camera';
  const automationIdParam = searchParams.get('automationId');

  const { socket } = useSocket();
  const containerRef = useRef(null);
  const hudTimeoutRef = useRef(null);

  const [activeAutomation, setActiveAutomation] = useState(null);
  const [isLoading, setIsLoading] = useState(mode === 'ACTIVE_BROADCAST');
  const [hudVisible, setHudVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeCameraSlot, setActiveCameraSlot] = useState(null);

  // Fullscreen event listener
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement &&
        (document.fullscreenElement === containerRef.current || containerRef.current?.contains(document.fullscreenElement))
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Fetch currently active live automation for PROGRAM OUTPUT mode
  const fetchActiveAutomation = useCallback(async () => {
    try {
      // 1. If explicit automationId is provided in URL, prioritize fetching it directly
      if (automationIdParam) {
        try {
          const directRes = await automationAPI.getById(automationIdParam);
          const auto = directRes.data?.automation || directRes.data;
          if (auto && (auto._id || auto.id)) {
            setActiveAutomation(auto);
            setIsLoading(false);
            return;
          }
        } catch (directErr) {
          console.warn('[ProjectorScreen] Direct getById failed, checking automation list:', directErr);
        }
      }

      // 2. Fetch full automations list using available API method (getAll or getList)
      const fetchFn = typeof automationAPI.getAll === 'function' 
        ? automationAPI.getAll 
        : (typeof automationAPI.getList === 'function' ? automationAPI.getList : null);

      if (!fetchFn) {
        console.warn('[ProjectorScreen] No valid automation list API found');
        setIsLoading(false);
        return;
      }

      const res = await fetchFn();
      const automations = Array.isArray(res.data?.automations)
        ? res.data.automations
        : (Array.isArray(res.data) ? res.data : []);

      if (automations.length > 0) {
        if (automationIdParam) {
          const matched = automations.find(a => String(a._id) === String(automationIdParam));
          if (matched) {
            setActiveAutomation(matched);
            setIsLoading(false);
            return;
          }
        }

        // 3. Find any active live broadcast or streaming automation
        const live = automations.find(a =>
          ['LIVE', 'STREAMING', 'ROTATING', 'STARTING', 'PREPARING', 'CREATING_BROADCAST'].includes(a.status) ||
          ['RUNNING', 'STARTING'].includes(a.ffmpegStatus) ||
          Boolean(a.activeBroadcastId)
        );

        if (live) {
          setActiveAutomation(live);
          setIsLoading(false);
          return;
        }

        // If in AUTOMATION mode and no live stream, but automation exists:
        if (mode === 'AUTOMATION' && automations.length > 0) {
          setActiveAutomation(automations[0]);
          setIsLoading(false);
          return;
        }
      }

      // If no active broadcast is found, set null to show Standby
      setActiveAutomation(null);
    } catch (err) {
      console.warn('[ProjectorScreen] Failed to fetch active automations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [automationIdParam, mode]);

  useEffect(() => {
    if (mode === 'ACTIVE_BROADCAST' || mode === 'AUTOMATION') {
      fetchActiveAutomation();
      const interval = setInterval(fetchActiveAutomation, 2500);
      return () => clearInterval(interval);
    }
  }, [mode, fetchActiveAutomation]);

  // Join automation room for real-time socket events
  useEffect(() => {
    if (!socket || !activeAutomation?._id) return;
    const autoId = String(activeAutomation._id);
    socket.emit('join:automation', autoId);
    return () => {
      socket.emit('leave:automation', autoId);
    };
  }, [socket, activeAutomation?._id]);

  // Listen for socket events (live rotation switches, status changes, metrics)
  useEffect(() => {
    if (!socket) return;

    const handleCameraSwitched = (data) => {
      console.log('[ProjectorScreen] Stream source switched:', data);
      setActiveCameraSlot(data);
      fetchActiveAutomation();
    };

    const handleMetrics = (data) => {
      if (data?.automationId) {
        if (!activeAutomation || String(activeAutomation._id) !== String(data.automationId)) {
          fetchActiveAutomation();
        }
      }
    };

    const handleStatusUpdate = (data) => {
      console.log('[ProjectorScreen] Status update received:', data);
      fetchActiveAutomation();
    };

    socket.on('camera:active_switched', handleCameraSwitched);
    socket.on('camera:switched', handleCameraSwitched);
    socket.on('media:active_switched', handleCameraSwitched);
    socket.on('youtube:active_switched', handleCameraSwitched);
    socket.on('gstreamer:metrics', handleMetrics);
    socket.on('gstreamer:closed', handleStatusUpdate);
    socket.on('ffmpeg:metrics', handleMetrics);
    socket.on('ffmpeg:closed', handleStatusUpdate);
    socket.on('automation:updated', handleStatusUpdate);
    socket.on('automation:status', handleStatusUpdate);
    socket.on('automation:retrying', handleStatusUpdate);
    socket.on('broadcast:started', handleStatusUpdate);
    socket.on('broadcast:ended', handleStatusUpdate);
    socket.on('broadcast:status', handleStatusUpdate);

    return () => {
      socket.off('camera:active_switched', handleCameraSwitched);
      socket.off('camera:switched', handleCameraSwitched);
      socket.off('media:active_switched', handleCameraSwitched);
      socket.off('youtube:active_switched', handleCameraSwitched);
      socket.off('gstreamer:metrics', handleMetrics);
      socket.off('gstreamer:closed', handleStatusUpdate);
      socket.off('ffmpeg:metrics', handleMetrics);
      socket.off('ffmpeg:closed', handleStatusUpdate);
      socket.off('automation:updated', handleStatusUpdate);
      socket.off('automation:status', handleStatusUpdate);
      socket.off('automation:retrying', handleStatusUpdate);
      socket.off('broadcast:started', handleStatusUpdate);
      socket.off('broadcast:ended', handleStatusUpdate);
      socket.off('broadcast:status', handleStatusUpdate);
    };
  }, [socket, fetchActiveAutomation, activeAutomation]);

  // Mouse move HUD auto-hide
  const handleMouseMove = () => {
    setHudVisible(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setHudVisible(false);
    }, 3500);
  };

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, []);

  // Keyboard controls (Esc to close/exit, F to fullscreen)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(false);
      } else if (containerRef.current) {
        const el = containerRef.current;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(true);
      }
    } catch (_) {}
  };

  const handleClose = async () => {
    if (window.electronAPI?.closeProjector) {
      try {
        await window.electronAPI.closeProjector();
        return;
      } catch (_) {}
    }
    window.close();
  };

  // 1. CCTV Camera Direct Cast
  if (mode === 'CCTV') {
    return (
      <div
        ref={containerRef}
        onDoubleClick={toggleFullscreen}
        className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none cursor-none flex items-center justify-center"
        style={{ cursor: hudVisible ? 'default' : 'none' }}
      >
        <LiveCameraMiniScreen
          streamPath={streamPath}
          cameraName={cameraName}
          isMaximized={true}
          className="!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0"
        />

        {/* Floating Auto-Hiding HUD Overlay */}
        <div
          className={`absolute top-4 left-4 right-4 z-[100000] flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
            hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-white shadow-2xl">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-600 text-[10px] font-black uppercase tracking-wider">
              <Tv className="w-3.5 h-3.5" />
              <span>HDMI CCTV FEED</span>
            </div>
            <span className="text-xs font-bold text-slate-200">{cameraName}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F)'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-white" />}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
              title="Close HDMI Projector (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Local Hardware Webcam Direct Cast
  if (mode === 'WEBCAM') {
    return (
      <ProjectorWebcamScreen
        cameraName={cameraName}
        streamPath={streamPath}
        containerRef={containerRef}
        hudVisible={hudVisible}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        handleClose={handleClose}
        activeAutomation={activeAutomation}
      />
    );
  }

  // 3. Program Output / Active Live Broadcast Cast
  return (
    <div
      ref={containerRef}
      onDoubleClick={toggleFullscreen}
      className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none flex items-center justify-center"
      style={{ cursor: hudVisible ? 'default' : 'none' }}
    >
      {activeAutomation ? (
        <div className="w-full h-full relative">
          <LiveFeedScreen
            automation={activeAutomation}
            isMaximized={true}
            className="!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none"
          />
        </div>
      ) : (
        /* Standby Program Screen when no automation is currently streaming */
        <div className="flex flex-col items-center justify-center p-8 text-center max-w-lg">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center shadow-inner relative z-10">
              <Tv className="w-10 h-10 text-slate-500 animate-pulse" />
            </div>
            <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-ping -z-0" />
            <div className="absolute -inset-4 rounded-full border border-blue-500/20 animate-pulse -z-0" />
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>HDMI PROGRAM OUTPUT MONITOR</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide">
            Broadcast Standby
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
            This display will automatically switch to your live camera rotation as soon as a live broadcast begins.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400 font-mono">
              <RotateCw className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>Listening for Live Broadcast Stream...</span>
            </div>
            <button
              type="button"
              onClick={fetchActiveAutomation}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Check Live Stream Now</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Auto-Hiding HUD Overlay */}
      <div
        className={`absolute top-4 left-4 right-4 z-[100000] flex items-center justify-between transition-opacity duration-300 pointer-events-auto ${
          hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-white shadow-2xl">
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
            activeAutomation ? 'bg-rose-600 text-white shadow-md shadow-rose-950/60' : 'bg-slate-800 text-slate-300'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${activeAutomation ? 'bg-white animate-ping' : 'bg-slate-500'}`} />
            <span>{activeAutomation ? 'HDMI LIVE PROGRAM' : 'HDMI STANDBY'}</span>
          </div>
          {activeAutomation && (
            <span className="text-xs font-bold text-slate-200 truncate max-w-[250px]">
              {activeAutomation.name}
            </span>
          )}
          {activeCameraSlot?.cameraName && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
              Cam: {activeCameraSlot.cameraName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-emerald-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-emerald-400" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-rose-600 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
            title="Close HDMI Projector (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectorScreen;
