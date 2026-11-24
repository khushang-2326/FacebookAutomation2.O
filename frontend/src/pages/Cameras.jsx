import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { cameraAPI, systemAPI } from '../services/api';
import EditCameraModal from '../components/EditCameraModal';
import {
  Camera,
  Video,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Lock,
  Wifi,
  Radio,
  Server,
  ShieldCheck,
  Sparkles,
  Layers,
  LayoutGrid,
  X,
  Edit2,
  Tag,
  Tv,
  ExternalLink,
  Zap,
  Sliders
} from 'lucide-react';

export const Cameras = () => {
  const [cameras, setCameras] = useState([]);
  const [webcams, setWebcams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [editingCamera, setEditingCamera] = useState(null);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalTab, setModalTab] = useState('rtsp'); // 'rtsp' | 'onvif'
  
  // Manual RTSP Form
  const [cameraName, setCameraName] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // ONVIF Discovery State
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredCameras, setDiscoveredCameras] = useState([]);
  const [selectedDiscovered, setSelectedDiscovered] = useState(null);

  const fetchCameras = async () => {
    try {
      const res = await cameraAPI.getList();
      setCameras(res.data.cameras || []);
    } catch (err) {
      console.error('Failed to fetch cameras:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebcams = async () => {
    try {
      const devRes = await systemAPI.getDevices();
      setWebcams(devRes.data?.videoDevices || []);
    } catch (err) {
      console.warn('Failed to fetch webcams:', err);
    }
  };

  useEffect(() => {
    fetchCameras();
    fetchWebcams();
  }, []);

  const handleTestRtspUrl = async () => {
    if (!rtspUrl) return;
    setTestResult({ loading: true });
    try {
      const res = await cameraAPI.testUrl({ rtspUrl, username, password });
      setTestResult(res.data.testResult);
    } catch (err) {
      setTestResult({ passed: false, error: err.response?.data?.error || err.message });
    }
  };

  const handleSaveCamera = async (e) => {
    e.preventDefault();
    if (!cameraName) return;
    setIsSubmitting(true);
    try {
      await cameraAPI.create({
        name: cameraName,
        sourceType: modalTab === 'onvif' ? 'ONVIF_CAMERA' : 'RTSP_CAMERA',
        rtspUrl,
        username,
        password,
        onvifEnabled: modalTab === 'onvif'
      });
      setMessage({ type: 'success', text: `Camera "${cameraName}" added successfully!` });
      setShowAddModal(false);
      resetForm();
      fetchCameras();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestCamera = async (id) => {
    setTestingId(id);
    try {
      const res = await cameraAPI.testCamera(id);
      setMessage({
        type: res.data.success ? 'success' : 'error',
        text: res.data.success
          ? 'Camera RTSP test passed cleanly! Stream is active.'
          : `Camera test failed: ${res.data.testResult?.error || 'Unreachable'}`
      });
      fetchCameras();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteCamera = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove Camera "${name}"?`)) return;
    try {
      await cameraAPI.deleteCamera(id);
      setMessage({ type: 'success', text: `Camera "${name}" removed.` });
      fetchCameras();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const handleScanOnvif = async () => {
    setIsScanning(true);
    setDiscoveredCameras([]);
    try {
      const res = await cameraAPI.discover();
      setDiscoveredCameras(res.data.cameras || []);
    } catch (err) {
      console.error('ONVIF scan error:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const resetForm = () => {
    setCameraName('');
    setRtspUrl('');
    setUsername('admin');
    setPassword('');
    setTestResult(null);
    setSelectedDiscovered(null);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Camera className="w-6 h-6 text-blue-500" />
            <span>CCTV & IP Security Cameras</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Connect local RTSP / ONVIF IP security cameras for continuous 24/7 Facebook Live broadcasts.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          <Link
            to="/projector"
            target="_blank"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition-all shadow-sm"
          >
            <Tv className="w-4 h-4 text-purple-400" />
            <span>Launch HDMI Projector</span>
          </Link>
          <Link
            to="/camera-wall"
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-sm"
          >
            <LayoutGrid className="w-4 h-4 text-blue-400" />
            <span>View Camera Wall</span>
          </Link>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add IP Camera</span>
          </button>
        </div>
      </div>

      {/* 4K Live Camera Switcher & Dual Broadcasting Architecture Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-slate-900/40 border border-blue-500/20 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">
                4K Live Studio & Switcher
              </span>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-wider border border-purple-500/30">
                Dual Broadcast (FB + YT)
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium">
              Camera Input: Set RTSP to <span className="text-emerald-400 font-semibold">4K60 (15–25 Mbps CBR, GOP 120 / 2s keyframe)</span>. Live switcher routes active camera instantly to <span className="text-blue-400 font-semibold">Facebook 1080p60 (H.264)</span> + <span className="text-rose-400 font-semibold">YouTube 1440p60 (H.265 / HEVC)</span> with zero-latency HDMI cast.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/automations/new"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md transition-all"
            >
              <Zap className="w-4 h-4" />
              <span>Create Switcher Broadcast</span>
            </Link>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-xs font-semibold flex items-center justify-between border ${
          message.type === 'success' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        }`}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="p-1 hover:opacity-80"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Camera Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Loading cameras...</div>
      ) : cameras.length === 0 ? (
        <div className="glass-panel p-12 text-center rounded-3xl border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-400 flex items-center justify-center mx-auto">
            <Camera className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-200">No CCTV Cameras Connected Yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Add your security camera via RTSP URL or ONVIF discovery to broadcast live surveillance, storefront feeds, or events directly to your Facebook Page.
          </p>
          <button
            onClick={() => { resetForm(); setShowAddModal(true); }}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Connect First Camera</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {cameras.map((c) => (
            <div key={c.id} className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all">
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">{c.name}</h3>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">{c.ipAddress || '192.168.1.100'}:{c.port || 554}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                    c.connectionStatus === 'ONLINE'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}>
                    {c.connectionStatus === 'ONLINE' ? '🟢 ONLINE' : '🔴 OFFLINE'}
                  </span>
                </div>

                <div className="space-y-1.5 pt-2 text-[11px] text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stream URL:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[180px]">{c.maskedRtspUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Codec / Res:</span>
                    <span>{c.videoCodec?.toUpperCase() || 'H.264'} ({c.resolution || '1080p'} @ {c.fps || 25}fps)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Manufacturer:</span>
                    <span>{c.manufacturer}</span>
                  </div>

                  {/* Component Health Sub-Status Badges */}
                  <div className="pt-2 flex flex-wrap gap-1">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      c.status?.rtsp === 'CONNECTED' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      RTSP: {c.status?.rtsp || 'TESTED'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      c.status?.ffprobe === 'READY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      FFPROBE: {c.status?.ffprobe || 'READY'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                      c.mediaMtxStatus === 'READY' ? 'bg-blue-500/20 text-blue-300' : 'bg-slate-800 text-slate-400'
                    }`}>
                      MEDIAMTX: {c.mediaMtxStatus || 'READY'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleTestCamera(c.id)}
                  disabled={testingId === c.id}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingId === c.id ? 'animate-spin' : ''}`} />
                  <span>{testingId === c.id ? 'Testing...' : 'Test RTSP'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingCamera(c)}
                    className="px-2.5 py-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 border border-blue-500/20 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                    title="Edit & Rename Camera"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCamera(c.id, c.name)}
                    className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Delete Camera"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connected Local Webcams Section */}
      <div className="space-y-4 pt-6 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Connected Local Webcams & Custom Labels
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Set custom names for your USB and built-in webcams to easily identify them in schedules.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchWebcams}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Rescan connected USB & built-in webcams"
            >
              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Rescan</span>
            </button>
            <span className="text-xs text-indigo-300 font-mono px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              {webcams.length} {webcams.length === 1 ? 'Webcam' : 'Webcams'}
            </span>
          </div>
        </div>

        {webcams.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-1">
            <p className="text-xs text-slate-400 font-semibold">No Local Webcams Detected</p>
            <p className="text-[11px] text-slate-500">Connect a USB webcam or turn on your built-in camera, then click Rescan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {webcams.map((w, idx) => {
              const displayName = w.customName || w.displayName || w.label || w.name;
              return (
                <div
                  key={w.name || idx}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between space-y-4 hover:border-indigo-500/40 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          Webcam #{idx + 1}
                        </span>
                        <h4 className="text-sm font-bold text-slate-100 mt-1 truncate" title={displayName}>
                          {displayName}
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                        ONLINE
                      </span>
                    </div>

                    <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] font-mono text-slate-400 space-y-0.5">
                      <span className="text-[9px] uppercase font-bold text-slate-500 block">Device Name:</span>
                      <p className="truncate text-slate-300 text-xs" title={w.name}>{w.name}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">DirectShow USB / Internal</span>
                    <button
                      onClick={() => setEditingCamera({ isWebcam: true, deviceName: w.name, customName: w.customName, name: displayName })}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                      title="Rename Webcam Display Name"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Rename</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Universal Edit Camera Modal */}
      <EditCameraModal
        isOpen={Boolean(editingCamera)}
        camera={editingCamera}
        onClose={() => setEditingCamera(null)}
        onSaved={() => {
          fetchCameras();
          fetchWebcams();
        }}
        onDeleted={() => {
          fetchCameras();
          fetchWebcams();
        }}
      />

      {/* Add Camera Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg p-6 rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <Camera className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-slate-100">Add CCTV / IP Camera</h3>
              </div>
              <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setModalTab('rtsp')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  modalTab === 'rtsp' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Option A: Manual RTSP URL
              </button>
              <button
                type="button"
                onClick={() => { setModalTab('onvif'); handleScanOnvif(); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  modalTab === 'onvif' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Option B: Discover ONVIF
              </button>
            </div>

            {modalTab === 'rtsp' ? (
              <form onSubmit={handleSaveCamera} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Camera Name</label>
                  <input
                    type="text"
                    required
                    value={cameraName}
                    onChange={(e) => setCameraName(e.target.value)}
                    placeholder="e.g. Front Door Security Camera"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">RTSP Stream URL</label>
                  <input
                    type="text"
                    required
                    value={rtspUrl}
                    onChange={(e) => setRtspUrl(e.target.value)}
                    placeholder="rtsp://admin:password@192.168.1.55:554/live/0/MAIN"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Format: <code className="text-blue-400">rtsp://username:password@192.168.1.55:554/live/0/MAIN</code>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Camera Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        const newU = e.target.value;
                        setUsername(newU);
                        setRtspUrl(prev => {
                          if (!prev) return `rtsp://${newU}:${password || ''}@192.168.1.55:554/live/0/MAIN`;
                          const match = prev.match(/^rtsp:\/\/(?:([^:@]+)(?::([^@]*))?@)?(.+)$/i);
                          if (match) {
                            return `rtsp://${newU}:${password || ''}@${match[3]}`;
                          }
                          return prev;
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Camera Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        const newP = e.target.value;
                        setPassword(newP);
                        setRtspUrl(prev => {
                          
                          const match = prev.match(/^rtsp:\/\/(?:([^:@]+)(?::([^@]*))?@)?(.+)$/i);
                          if (match) {
                            return `rtsp://${username || 'admin'}:${newP}@${match[3]}`;
                          }
                          return prev;
                        });
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {testResult && (
                  <div className={`p-3 rounded-xl text-xs ${testResult.passed ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'}`}>
                    {testResult.loading ? (<p>Testing Connection...</p>) : testResult.passed ? (
                      <p>{testResult.details || `✓ Connection verified: ${testResult.resolution} @ ${testResult.fps}fps (${testResult.videoCodec})`}</p>
                    ) : (
                      <p>❌ {testResult.error}</p>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={handleTestRtspUrl}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                  >
                    Test Connection
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Camera'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Discovered Local ONVIF IP Cameras:</span>
                  <button
                    onClick={handleScanOnvif}
                    disabled={isScanning}
                    className="px-3 py-1 rounded-lg bg-slate-800 text-xs text-blue-400 font-semibold hover:bg-slate-700 flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>Scan Network</span>
                  </button>
                </div>

                {isScanning ? (
                  <div className="py-8 text-center text-xs text-slate-400">Scanning local network for ONVIF cameras...</div>
                ) : discoveredCameras.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">No cameras found automatically. Use manual RTSP tab.</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {discoveredCameras.map((cam, idx) => (
                      <div
                        key={idx}
                        onClick={() => {
                          setSelectedDiscovered(cam);
                          setCameraName(cam.name || `${cam.manufacturer} Camera`);
                          setRtspUrl(`rtsp://${cam.ipAddress}:${cam.port}/live/0/MAIN`);
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-xs ${
                          selectedDiscovered?.ipAddress === cam.ipAddress
                            ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                        }`}
                      >
                        <div>
                          <p className="font-bold">{cam.name || cam.manufacturer}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{cam.ipAddress}:{cam.port} ({cam.model || 'ONVIF'})</p>
                        </div>
                        <CheckCircle2 className={`w-4 h-4 ${selectedDiscovered?.ipAddress === cam.ipAddress ? 'text-blue-400' : 'text-slate-600'}`} />
                      </div>
                    ))}
                  </div>
                )}

                {selectedDiscovered && (
                  <button
                    onClick={() => setModalTab('rtsp')}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg transition-all"
                  >
                    Configure Credentials & Stream URL
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Cameras;





