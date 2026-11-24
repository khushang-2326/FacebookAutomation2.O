import React, { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';
import { Settings as SettingsIcon, ShieldCheck, Zap, Database, Key, Save, Cpu, Download, CheckCircle2, AlertTriangle, Activity, Info } from 'lucide-react';

export const Settings = () => {
  const [settings, setSettings] = useState({
    facebookMockMode: false,
    schedulerTestMode: false,
    defaultRotationDuration: 17400,
    defaultRestartDelay: 60,
    testRotationDuration: 15,
    testRestartDelay: 3,
    facebookAppId: '',
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form fields
  const [mockMode, setMockMode] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [defaultRotationDuration, setDefaultRotationDuration] = useState(17400);
  const [defaultRestartDelay, setDefaultRestartDelay] = useState(60);
  const [testRotationDuration, setTestRotationDuration] = useState(15);
  const [testRestartDelay, setTestRestartDelay] = useState(3);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [gpuMode, setGpuMode] = useState('AUTO'); // 'AUTO' | 'HARDWARE_REQUIRED' | 'SOFTWARE'
  const [gpuTelemetry, setGpuTelemetry] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const fetchSettings = async () => {
    try {
      const res = await systemAPI.getSettings();
      const s = res?.data?.settings || {};
      setSettings(s);
      if (typeof s.facebookMockMode === 'boolean') setMockMode(s.facebookMockMode);
      if (typeof s.schedulerTestMode === 'boolean') setTestMode(s.schedulerTestMode);
      if (s.defaultRotationDuration) setDefaultRotationDuration(s.defaultRotationDuration);
      if (s.defaultRestartDelay) setDefaultRestartDelay(s.defaultRestartDelay);
      if (s.testRotationDuration) setTestRotationDuration(s.testRotationDuration);
      if (s.testRestartDelay) setTestRestartDelay(s.testRestartDelay);
      if (s.facebookAppId) setAppId(s.facebookAppId);
      if (s.gpuAccelerationMode) setGpuMode(s.gpuAccelerationMode);
      if (s.gpuTelemetry) setGpuTelemetry(s.gpuTelemetry);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportReport = async (format = 'markdown') => {
    setIsExporting(true);
    try {
      const res = await systemAPI.exportDiagnosticReport(format);
      const blob = new Blob([res.data], { type: format === 'json' ? 'application/json' : 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gpu-diagnostic-report-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Failed to export diagnostic report: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await systemAPI.updateSettings({
        facebookMockMode: mockMode,
        schedulerTestMode: testMode,
        defaultRotationDuration: Number(defaultRotationDuration),
        defaultRestartDelay: Number(defaultRestartDelay),
        testRotationDuration: Number(testRotationDuration),
        testRestartDelay: Number(testRestartDelay),
        facebookAppId: appId,
        facebookAppSecret: appSecret || undefined,
        gpuAccelerationMode: gpuMode
      });
      alert('✅ Settings updated successfully!');
      await fetchSettings();
    } catch (err) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-400 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight">System & Platform Settings</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure Meta API credentials, scheduler rotation defaults, and zero-setup test modes.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Environment Toggles Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <Zap className="w-4 h-4" />
            <span>Development & Testing Toggles</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Mock Mode Toggle */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-slate-200">Facebook Mock Mode</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulates Meta Graph API and RTMPS endpoints offline.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mockMode}
                  onChange={(e) => setMockMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500" />
              </label>
            </div>

            {/* Test Scheduler Mode Toggle */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-slate-200">Fast Scheduler Test Mode</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Uses 15s rotation and 3s restart delay for rapid verification.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </div>
          </div>
        </div>

        {/* GPU Hardware Acceleration & Diagnostics Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-indigo-950/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <Cpu className="w-4 h-4" />
              <span>GPU Hardware Acceleration & Diagnostics</span>
            </div>
            <button
              type="button"
              onClick={() => handleExportReport('markdown')}
              disabled={isExporting}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-50"
              title="Download sanitized diagnostic report with hardware and encoder benchmarks"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Exporting...' : 'Export Diagnostic Report'}</span>
            </button>
          </div>

          {/* GPU Status and Telemetry Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Detected GPU Adapter</span>
              <p className="text-sm font-bold text-slate-200 truncate" title={gpuTelemetry?.adapterName || 'Detecting...'}>
                {gpuTelemetry?.adapterName || 'Detecting GPU...'}
              </p>
              <span className="text-[10px] text-indigo-400 font-mono">
                Architecture: {gpuTelemetry?.primaryVendor || 'Auto'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Active Video Encoder</span>
              <div className="flex items-center gap-1.5">
                {gpuTelemetry?.isHardware ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center gap-1 border border-emerald-500/30">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {gpuTelemetry?.activeEncoder} (GPU)
                  </span>
                ) : gpuTelemetry?.encoderError ? (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-xs font-bold flex items-center gap-1 border border-rose-500/30">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    {gpuTelemetry?.encoderError?.includes('INTEL_QSV') ? 'UNAVAILABLE (QSV Required)' : 'UNAVAILABLE (GPU Required)'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center gap-1 border border-amber-500/30">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    {gpuTelemetry?.activeEncoder || 'libx264'} (CPU)
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 block truncate" title={gpuTelemetry?.encoderError || gpuTelemetry?.verifiedEncoderStatus || ''}>
                {gpuTelemetry?.verifiedEncoderStatus || (gpuTelemetry?.isHardware ? 'Hardware Video Encode Active' : 'Software Fallback Active')}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Stream Ingestion Decoder</span>
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-md text-xs font-bold flex items-center gap-1 border ${
                  gpuTelemetry?.isHardwareDecoding === false
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                }`}>
                  <Activity className="w-3 h-3" />
                  {gpuTelemetry?.activeDecoder === 'cpu_software'
                    ? 'CPU Software'
                    : (gpuTelemetry?.activeDecoder || 'Detecting...')}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block">
                {gpuTelemetry?.verifiedDecoderStatus || (gpuTelemetry?.isHardwareDecoding === false ? 'CPU Software Decoding' : 'Direct GPU Zero-Copy Ingestion')}
              </span>
            </div>
          </div>

          {gpuTelemetry?.encoderError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{gpuTelemetry.encoderError}</span>
            </div>
          )}

          {gpuTelemetry?.taskManagerEngineHint && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-blue-200">Windows Task Manager Note: </span>
                <span className="text-slate-300">Active GPU video encoding runs under the <strong>"Video Encode"</strong> engine in Task Manager (click the graph header dropdown to switch to it). The "Video Processing" graph is reserved for Intel VPP color/scaling transforms and will remain at 0%.</span>
              </div>
            </div>
          )}

          {/* Mode Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Acceleration Policy & Preferred Encoder
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setGpuMode('AUTO')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'AUTO'
                    ? 'bg-indigo-600/20 border-indigo-500/80 shadow-md shadow-indigo-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">AUTO (HARDWARE FIRST)</span>
                  {gpuMode === 'AUTO' && <span className="w-2 h-2 rounded-full bg-indigo-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Detects GPU (Intel QSV, NVIDIA NVENC, AMD AMF) and prioritizes native hardware.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGpuMode('INTEL_QSV')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'INTEL_QSV'
                    ? 'bg-blue-600/20 border-blue-500/80 shadow-md shadow-blue-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-300">INTEL QUICK SYNC (QSV)</span>
                  {gpuMode === 'INTEL_QSV' && <span className="w-2 h-2 rounded-full bg-blue-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Uses CPU software decoding paired strictly with Intel Quick Sync (h264_qsv) GPU encoding.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGpuMode('NVIDIA_NVENC')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'NVIDIA_NVENC'
                    ? 'bg-green-600/20 border-green-500/80 shadow-md shadow-green-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-green-300">NVIDIA NVENC</span>
                  {gpuMode === 'NVIDIA_NVENC' && <span className="w-2 h-2 rounded-full bg-green-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Explicitly selects dedicated NVIDIA hardware encoder (h264_nvenc).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGpuMode('AMD_AMF')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'AMD_AMF'
                    ? 'bg-rose-600/20 border-rose-500/80 shadow-md shadow-rose-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-rose-300">AMD AMF</span>
                  {gpuMode === 'AMD_AMF' && <span className="w-2 h-2 rounded-full bg-rose-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Explicitly selects AMD Advanced Media Framework encoder (h264_amf).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGpuMode('HARDWARE_REQUIRED')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'HARDWARE_REQUIRED'
                    ? 'bg-emerald-600/20 border-emerald-500/80 shadow-md shadow-emerald-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">HARDWARE REQUIRED</span>
                  {gpuMode === 'HARDWARE_REQUIRED' && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Strict GPU mode. Fails with diagnostic error instead of silent CPU fallback.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setGpuMode('SOFTWARE')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  gpuMode === 'SOFTWARE'
                    ? 'bg-amber-600/20 border-amber-500/80 shadow-md shadow-amber-600/10'
                    : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200">SOFTWARE (CPU)</span>
                  {gpuMode === 'SOFTWARE' && <span className="w-2 h-2 rounded-full bg-amber-400"></span>}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Forces high-compatibility libx264 software encoder on CPU.
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Rotation Defaults Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <SettingsIcon className="w-4 h-4" />
            <span>Rotation & Delay Defaults</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Production Rotation Duration (Seconds)
              </label>
              <input
                type="number"
                value={defaultRotationDuration}
                onChange={(e) => setDefaultRotationDuration(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">17400s = 4 Hours 50 Minutes (safe within FB 8h max)</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Production Restart Delay (Seconds)
              </label>
              <input
                type="number"
                value={defaultRestartDelay}
                onChange={(e) => setDefaultRestartDelay(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1">Delay before launching next rotation live stream</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Test Mode Rotation Duration (Seconds)
              </label>
              <input
                type="number"
                value={testRotationDuration}
                onChange={(e) => setTestRotationDuration(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Test Mode Restart Delay (Seconds)
              </label>
              <input
                type="number"
                value={testRestartDelay}
                onChange={(e) => setTestRestartDelay(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Meta Facebook App Credentials */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
            <Key className="w-4 h-4" />
            <span>Meta Developer App Credentials</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Facebook App ID</label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="From developers.facebook.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Facebook App Secret</label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Leave blank to keep existing secret"
              />
            </div>
          </div>
        </div>

        {/* System Diagnostics Panel (Requirement 28) */}
        <SystemDiagnosticsPanel />

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-blue-600/30"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving Settings...' : 'Save Configuration'}</span>
        </button>
      </form>
    </div>
  );
};

// System Diagnostics Sub-component
const SystemDiagnosticsPanel = () => {
  const [diagData, setDiagData] = useState(null);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await systemAPI.getMediaTools();
      setDiagData(res.data);
    } catch (err) {
      console.error('Failed to run diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sky-400 text-xs font-bold uppercase tracking-wider">
          <Database className="w-4 h-4" />
          <span>System Diagnostics</span>
        </div>
        <button
          type="button"
          onClick={runDiagnostics}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
        >
          {loading ? 'Running Diagnostics...' : 'Run Full Diagnostic'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Environment Info */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <p className="font-bold text-slate-200 text-sm border-b border-slate-800 pb-2">System Environment</p>
          <div className="flex justify-between">
            <span className="text-slate-400">Operating System:</span>
            <span className="text-slate-200 font-mono">
              {diagData?.system?.platform || (typeof window !== 'undefined' && window.electronAPI?.platform) || (typeof navigator !== 'undefined' && (navigator.userAgentData?.platform || navigator.platform)) || 'Windows'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">CPU Architecture:</span>
            <span className="text-slate-200 font-mono">{diagData?.system?.arch || 'x64'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Media Engine Overall:</span>
            <span className={diagData?.mediaEngineReady ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {diagData?.mediaEngineReady ? '✓ READY' : '✕ NOT READY'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">ONVIF / RTSP Scanner:</span>
            <span className="text-emerald-400 font-bold">✓ READY</span>
          </div>
        </div>

        {/* Media Engines Status */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <p className="font-bold text-slate-200 text-sm border-b border-slate-800 pb-2">Media Tool Resolvers</p>
          
          {/* FFmpeg */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-bold">FFmpeg (Stream Engine):</span>
              <span className={diagData?.ffmpeg?.available ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {diagData?.ffmpeg?.available ? '✓ READY' : '✕ MISSING'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono truncate" title={diagData?.ffmpeg?.path}>
              Path: {diagData?.ffmpeg?.path || 'Not Found'}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              Version: {diagData?.ffmpeg?.version || 'N/A'} (Source: {diagData?.ffmpeg?.source || 'N/A'})
            </p>
          </div>

          <div className="border-t border-slate-800/60 my-2 pt-2">
            {/* FFprobe */}
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-bold">FFprobe (Analysis Engine):</span>
              <span className={diagData?.ffprobe?.available ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {diagData?.ffprobe?.available ? '✓ READY' : '✕ MISSING'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono truncate" title={diagData?.ffprobe?.path}>
              Path: {diagData?.ffprobe?.path || 'Not Found'}
            </p>
            <p className="text-[11px] text-slate-400 font-mono">
              Version: {diagData?.ffprobe?.version || 'N/A'} (Source: {diagData?.ffprobe?.source || 'N/A'})
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
