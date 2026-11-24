import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { cameraAPI, systemAPI } from '../services/api';
import LiveCameraMiniScreen from '../components/LiveCameraMiniScreen';
import {
  Camera,
  Video,
  Radio,
  RefreshCw,
  Plus,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Download,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  Grid3X3,
  Columns2,
  Square,
  Sparkles,
  ArrowRight,
  Shield,
  Layers,
  Activity,
  Cpu,
  Tv,
  Edit2
} from 'lucide-react';
import EditCameraModal from '../components/EditCameraModal';
import { castToExternalDisplay } from '../utils/projectorCast';

/**
 * Dedicated Live Webcam Card
 * Connects directly to local hardware webcam via HTML5 WebRTC getUserMedia
 */
const WebcamMiniCard = ({ device, onMaximize, onGoLive, onEdit }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const viewportRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // 'connecting' | 'live' | 'error' | 'denied'
  const [errorMessage, setErrorMessage] = useState('');
  const [isMuted, setIsMuted] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [snapshotSuccess, setSnapshotSuccess] = useState(false);
  const [isTrueFullscreen, setIsTrueFullscreen] = useState(false);
  const displayName = device.displayName || device.customName || device.name;

  // Sync state with HTML5 Fullscreen API
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement &&
        (document.fullscreenElement === viewportRef.current || viewportRef.current?.contains(document.fullscreenElement))
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
      } else if (viewportRef.current) {
        const el = viewportRef.current;
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(true);
      }
    } catch (err) {
      console.warn('Webcam fullscreen error:', err);
      onMaximize({ type: 'WEBCAM', device, stream: streamRef.current });
    }
  };

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

      // Enumerate browser video devices to match device label if possible
      let constraints = { video: true, audio: false };
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        const matched = videoInputs.find(d => 
          d.label && device.name && (d.label.toLowerCase().includes(device.name.toLowerCase()) || device.name.toLowerCase().includes(d.label.toLowerCase()))
        );

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
      console.warn(`[WebcamMiniCard] Could not initialize webcam "${device.name}":`, err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStatus('denied');
        setErrorMessage('Camera access was blocked by browser permissions.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setStatus('error');
        setErrorMessage('Camera is currently in use by another application or FFmpeg.');
      } else {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to connect to webcam feed.');
      }
    }
  }, [device]);

  useEffect(() => {
    startWebcam();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [startWebcam]);

  const handleSnapshot = (e) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    try {
      const v = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `webcam_snapshot_${(device.name || 'cam').replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.png`;
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
      console.error('Snapshot failed:', err);
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group relative rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-xl overflow-hidden flex flex-col transition-all duration-200"
    >
      {/* Video Viewport Container */}
      <div
        ref={viewportRef}
        onDoubleClick={toggleTrueFullscreen}
        className={`relative bg-black overflow-hidden flex items-center justify-center transition-all ${
          isTrueFullscreen
            ? '!fixed !inset-0 !z-[99999] !w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0'
            : 'aspect-video'
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          className={`w-full h-full bg-black ${status === 'live' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300 ${
            isTrueFullscreen ? '!w-screen !h-screen !max-w-none !max-h-none object-contain' : 'object-cover'
          }`}
        />

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

        {/* Loading Overlay */}
        {status === 'connecting' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 p-4 text-center">
            <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin mb-2" />
            <span className="text-xs font-bold text-slate-200">Connecting Webcam...</span>
            <span className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[200px]">{displayName}</span>
          </div>
        )}

        {/* Error Overlay */}
        {(status === 'error' || status === 'denied') && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center">
            <AlertCircle className="w-7 h-7 text-amber-400 mb-1.5" />
            <span className="text-xs font-bold text-slate-200">
              {status === 'denied' ? 'Permission Required' : 'Webcam Standby'}
            </span>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[220px] leading-relaxed">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={startWebcam}
              className="mt-2.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 rounded-lg flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Snapshot Success Toast */}
        {snapshotSuccess && (
          <div className="absolute top-10 left-1/2 -translate-x-1/2 z-30 px-3 py-1 bg-emerald-500/90 text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1.5 backdrop-blur-sm animate-bounce">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>HD Snapshot Saved</span>
          </div>
        )}

        {/* Top HUD Badges */}
        <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 pointer-events-none">
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-white text-[10px] font-black tracking-wider uppercase shadow-md ${
            status === 'live' ? 'bg-indigo-600/90' : 'bg-slate-800/90 border border-slate-700'
          }`}>
            {status === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />}
            <span>{status === 'live' ? 'WEBCAM LIVE' : 'WEBCAM'}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950/70 border border-slate-800 text-slate-300 font-mono backdrop-blur-sm">
            0ms Direct
          </span>
        </div>

        {/* Hover Controls (Edit, Snapshot, True Fullscreen, Theater) */}
        <div className={`absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5 transition-opacity duration-200 ${
          isHovered ? 'opacity-100' : 'opacity-0'
        }`}>
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(device); }}
              title="Rename Webcam"
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-md shadow-md transition-all"
            >
              <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          )}
          {status === 'live' && (
            <button
              type="button"
              onClick={handleSnapshot}
              title="Capture HD Snapshot"
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-md shadow-md transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
            </button>
          )}
          {/* True Fullscreen Button covering Windows Taskbar */}
          <button
            type="button"
            onClick={toggleTrueFullscreen}
            title="Full Screen (Covers whole screen including Windows Taskbar)"
            className="p-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-400/50 backdrop-blur-md shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-white" />
          </button>
          <button
            type="button"
            onClick={() => onMaximize({ type: 'WEBCAM', device, stream: streamRef.current })}
            title="Theater Screen Mode"
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 backdrop-blur-md shadow-md transition-all cursor-pointer"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-400" />
          </button>
        </div>
      </div>

      {/* Card Info & Footer */}
      <div className="p-3 bg-slate-900/95 flex items-center justify-between gap-3 border-t border-slate-800/80">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <h3 className="text-xs font-bold text-slate-200 truncate">{displayName}</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">
            {device.customName ? `${device.name} • ` : ''}{device.type || 'DirectShow'} &bull; Local Hardware
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(device)}
              title="Rename Webcam"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs transition-all shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
            </button>
          )}
          <button
            type="button"
            onClick={() => castToExternalDisplay({ mode: 'WEBCAM', streamPath: displayName, cameraName: displayName })}
            title="Cast Webcam directly to HDMI / External Display"
            className="px-2 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <Tv className="w-3 h-3 text-indigo-400 group-hover:text-white" />
            <span className="hidden sm:inline">HDMI</span>
          </button>
          <button
            type="button"
            onClick={() => onGoLive({ type: 'WEBCAM', device })}
            className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm"
          >
            <Radio className="w-3 h-3 text-indigo-400 group-hover/btn:text-white" />
            <span>Stream</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Dedicated Live CCTV Camera Card
 * Renders WebRTC (WHEP) / LL-HLS via MediaMTX
 */
const CctvMiniCard = ({ camera, onMaximize, onGoLive, onEdit }) => {
  const cleanId = String(camera.id || camera._id || '').replace(/[^a-zA-Z0-9_]/g, '').slice(-12);
  const streamPath = camera.mediaMtxPath || `camera_${cleanId}`;

  return (
    <div className="group relative rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 shadow-xl overflow-hidden flex flex-col transition-all duration-200">
      {/* Video Viewport Container */}
      <div className="relative aspect-video bg-black overflow-hidden">
        <LiveCameraMiniScreen
          streamPath={streamPath}
          cameraName={camera.name}
          className="w-full h-full"
          onToggleMaximize={() => onMaximize({ type: 'CCTV', camera, streamPath })}
        />
      </div>

      {/* Card Info & Footer */}
      <div className="p-3 bg-slate-900/95 flex items-center justify-between gap-3 border-t border-slate-800/80">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <h3 className="text-xs font-bold text-slate-200 truncate">{camera.name}</h3>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-400 font-mono truncate">
              {camera.maskedRtspUrl || `${camera.ipAddress}:${camera.port || 554}`}
            </span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20">
              RTSP
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(camera)}
              title="Edit Camera Details"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs transition-all shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5 text-slate-400 hover:text-slate-200" />
            </button>
          )}
          <button
            type="button"
            onClick={() => castToExternalDisplay({ mode: 'CCTV', streamPath, cameraName: camera.name })}
            title="Cast this CCTV Camera directly to HDMI / External Display"
            className="px-2 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-indigo-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm cursor-pointer"
          >
            <Tv className="w-3 h-3 text-indigo-400 group-hover:text-white" />
            <span className="hidden sm:inline">HDMI</span>
          </button>
          <button
            type="button"
            onClick={() => onGoLive({ type: 'CCTV', camera })}
            className="px-2.5 py-1.5 bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 hover:border-blue-500 text-blue-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all shadow-sm"
          >
            <Radio className="w-3 h-3 text-blue-400 group-hover/btn:text-white" />
            <span>Stream</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Theater Mode Fullscreen Modal for High-Res Focused Viewing
 * Supports True Edge-to-Edge Fullscreen covering entire monitor & Windows Taskbar
 */
const TheaterModal = ({ activeItem, onClose, onGoLive }) => {
  const theaterVideoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (activeItem?.type === 'WEBCAM' && activeItem?.stream && theaterVideoRef.current) {
      theaterVideoRef.current.srcObject = activeItem.stream;
      theaterVideoRef.current.play().catch(() => {});
    }
  }, [activeItem]);

  // Sync state with HTML5 Fullscreen API
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

  // Dedicated Full Screen Toggle (covers Windows Taskbar completely)
  const toggleFullscreen = async (e) => {
    e?.stopPropagation();
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
        if (window.electronAPI?.setFullscreen) await window.electronAPI.setFullscreen(false);
      } else if (containerRef.current) {
        const el = containerRef.current;
        if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' });
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        }
        if (window.electronAPI?.setFullscreen) {
          await window.electronAPI.setFullscreen(true);
        }
      }
    } catch (err) {
      console.warn('[TheaterModal] Fullscreen error:', err);
      if (window.electronAPI?.toggleFullscreen) {
        try { await window.electronAPI.toggleFullscreen(); } catch (_) {}
      }
    }
  };

  if (!activeItem) return null;

  const isWebcam = activeItem.type === 'WEBCAM';
  const title = isWebcam ? activeItem.device?.name : activeItem.camera?.name;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-black flex flex-col transition-all duration-300 ${
        isFullscreen
          ? '!z-[99999] !w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !p-0 !m-0'
          : 'bg-black/95 backdrop-blur-md animate-in fade-in duration-200'
      }`}
    >
      {/* Top Bar - hidden during True Fullscreen to achieve 100% edge-to-edge monitor coverage */}
      {!isFullscreen && (
        <div className="h-14 px-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isWebcam ? 'bg-indigo-600/20 text-indigo-400' : 'bg-blue-600/20 text-blue-400'}`}>
              {isWebcam ? <Camera className="w-5 h-5" /> : <Video className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                  isWebcam ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'
                }`}>
                  {isWebcam ? 'WEBCAM' : 'CCTV RTSP'}
                </span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono block">
                HD Real-Time Stream &bull; &lt;500ms Ultra-Low Latency
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* HDMI Projector Button */}
            <button
              type="button"
              onClick={() => castToExternalDisplay({
                mode: isWebcam ? 'WEBCAM' : 'CCTV',
                streamPath: activeItem.streamPath || (isWebcam ? title : ''),
                cameraName: title
              })}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Cast this stream directly to HDMI / External Display"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Cast HDMI</span>
            </button>

            {/* Dedicated True Fullscreen Button covering Windows Taskbar */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
              title="Full Screen (Covers whole screen including Windows Taskbar)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Full Screen</span>
            </button>
            <button
              type="button"
              onClick={() => onGoLive(activeItem)}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Create Live Stream</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Close Theater Mode"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

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

      {/* Main Large Viewport */}
      <div
        onDoubleClick={toggleFullscreen}
        className={`flex-1 bg-black flex items-center justify-center ${
          isFullscreen ? '!p-0 !m-0 !w-screen !h-screen' : 'p-4'
        }`}
      >
        <div
          className={`overflow-hidden bg-slate-950 relative flex items-center justify-center ${
            isFullscreen
              ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none !border-none !shadow-none'
              : 'w-full max-w-6xl aspect-video rounded-2xl border border-slate-800 shadow-2xl'
          }`}
        >
          {isWebcam ? (
            <video
              ref={theaterVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-contain bg-black ${isFullscreen ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none' : ''}`}
            />
          ) : (
            <LiveCameraMiniScreen
              streamPath={activeItem.streamPath}
              cameraName={activeItem.camera?.name}
              isMaximized={true}
              onToggleMaximize={onClose}
              className={`w-full h-full ${isFullscreen ? '!w-screen !h-screen !max-w-none !max-h-none !rounded-none' : ''}`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Main Camera Wall Page Component
 */
export const CameraWall = () => {
  const navigate = useNavigate();
  const [cctvCameras, setCctvCameras] = useState([]);
  const [webcams, setWebcams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'CCTV' | 'WEBCAM'
  const [gridLayout, setGridLayout] = useState('auto'); // 'auto' | '2x2' | '3x3' | '1x1'
  const [theaterCamera, setTheaterCamera] = useState(null);
  const [editingCamera, setEditingCamera] = useState(null);

  const loadCamerasAndWebcams = async () => {
    try {
      setIsRefreshing(true);
      // 1. Fetch saved CCTV cameras
      const camRes = await cameraAPI.getList().catch(() => ({ data: { cameras: [] } }));
      const camList = camRes.data.cameras || [];
      setCctvCameras(camList);

      // 2. Prepare MediaMTX proxy paths in the background
      cameraAPI.preparePreviews().catch(err => console.warn('preparePreviews error:', err));

      // 3. Fetch connected hardware webcams
      const devRes = await systemAPI.getDevices().catch(() => ({ data: { videoDevices: [] } }));
      const vDevs = devRes.data.videoDevices || [];
      setWebcams(vDevs);
    } catch (err) {
      console.error('Failed to load camera devices:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCamerasAndWebcams();
  }, []);

  const handleGoLive = (item) => {
    if (item.type === 'CCTV') {
      navigate(`/automations/new?sourceType=RTSP_CAMERA&cameraId=${item.camera.id || item.camera._id}`);
    } else if (item.type === 'WEBCAM') {
      navigate(`/automations/new?sourceType=LOCAL_CAMERA&webcam=${encodeURIComponent(item.device.name)}`);
    }
  };

  const totalCctv = cctvCameras.length;
  const totalWebcams = webcams.length;
  const totalCameras = totalCctv + totalWebcams;

  // Filtered lists
  const showCctv = activeFilter === 'ALL' || activeFilter === 'CCTV';
  const showWebcam = activeFilter === 'ALL' || activeFilter === 'WEBCAM';

  // Dynamic grid class based on layout setting
  const getGridClass = () => {
    if (gridLayout === '1x1') return 'grid-cols-1 max-w-4xl mx-auto';
    if (gridLayout === '2x2') return 'grid-cols-1 md:grid-cols-2';
    if (gridLayout === '3x3') return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
    // 'auto' responsive layout
    return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md">
              <LayoutGrid className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-extrabold text-slate-100 tracking-tight">
              Camera Multi-Screen Wall
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              Live Feeds
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Real-time mini-screen previews for all connected CCTV IP cameras, laptop cameras, and USB webcams.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => castToExternalDisplay({ mode: 'ACTIVE_BROADCAST' })}
            className="px-3 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 text-xs font-bold text-indigo-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Cast Currently Active Live Automation to HDMI Screen"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white" />
            <span>Cast Live to HDMI</span>
          </button>

          <button
            type="button"
            onClick={loadCamerasAndWebcams}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Scan & Refresh</span>
          </button>

          <Link
            to="/cameras"
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/25 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add CCTV Camera</span>
          </Link>
        </div>
      </div>

      {/* Stats Chips & Filters Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Cameras ({totalCameras})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('CCTV')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'CCTV'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span>CCTV ({totalCctv})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('WEBCAM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeFilter === 'WEBCAM'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-indigo-400" />
            <span>Webcams ({totalWebcams})</span>
          </button>
        </div>

        {/* Grid Layout Switcher */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">Grid:</span>
          <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setGridLayout('auto')}
              title="Responsive Auto Grid"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                gridLayout === 'auto' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGridLayout('2x2')}
              title="2 Columns Grid"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                gridLayout === '2x2' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGridLayout('3x3')}
              title="3 Columns Grid"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                gridLayout === '3x3' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setGridLayout('1x1')}
              title="Single Focus (1 Large Feed)"
              className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                gridLayout === '1x1' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Mini-Screens Grid */}
      {loading ? (
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
          <h3 className="text-sm font-bold text-slate-200">Detecting Camera Devices & Live Feeds...</h3>
          <p className="text-xs text-slate-400 mt-1">Establishing MediaMTX RTSP proxies and scanning local webcams</p>
        </div>
      ) : totalCameras === 0 ? (
        <div className="p-16 rounded-3xl bg-slate-900/40 border border-slate-800/80 text-center flex flex-col items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4 shadow-lg shadow-blue-600/10">
            <Camera className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-100">No Cameras Detected</h3>
          <p className="text-xs text-slate-400 max-w-md mt-1 mb-6 leading-relaxed">
            You don't have any CCTV IP cameras configured or connected webcams detected yet. Add an RTSP/ONVIF camera or connect a USB webcam to view live mini-screens.
          </p>
          <div className="flex items-center gap-3">
            <Link
              to="/cameras"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add CCTV Camera</span>
            </Link>
            <button
              type="button"
              onClick={loadCamerasAndWebcams}
              className="px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Rescan Devices</span>
            </button>
          </div>
        </div>
      ) : (
        <div className={`grid gap-4 ${getGridClass()}`}>
          {/* Render CCTV Mini-Screens */}
          {showCctv && cctvCameras.map((camera) => (
            <CctvMiniCard
              key={camera.id || camera._id}
              camera={camera}
              onMaximize={(item) => setTheaterCamera(item)}
              onGoLive={handleGoLive}
              onEdit={(item) => setEditingCamera({ ...item, isWebcam: false, type: 'CCTV' })}
            />
          ))}

          {/* Render Webcam Mini-Screens */}
          {showWebcam && webcams.map((dev) => (
            <WebcamMiniCard
              key={dev.name}
              device={dev}
              onMaximize={(item) => setTheaterCamera(item)}
              onGoLive={handleGoLive}
              onEdit={(devItem) => setEditingCamera({ ...devItem, isWebcam: true, type: 'WEBCAM' })}
            />
          ))}
        </div>
      )}

      {/* Theater Mode Fullscreen Modal */}
      {theaterCamera && (
        <TheaterModal
          activeItem={theaterCamera}
          onClose={() => setTheaterCamera(null)}
          onGoLive={handleGoLive}
        />
      )}

      {/* Edit / Rename Camera Modal */}
      <EditCameraModal
        isOpen={Boolean(editingCamera)}
        camera={editingCamera}
        onClose={() => setEditingCamera(null)}
        onSaved={() => loadCamerasAndWebcams()}
        onDeleted={() => loadCamerasAndWebcams()}
      />
    </div>
  );
};

export default CameraWall;
