import React from 'react';
import { Activity, Cpu, Gauge, Zap, AlertTriangle } from 'lucide-react';

export const TelemetryPanel = ({ metrics, activeProcess, isLive = true }) => {
  const data = metrics || (activeProcess && activeProcess.metrics) || {
    frame: 0,
    framesReceived: 0,
    fps: 0,
    bitrate: '0kbits/s',
    speed: '0.0x',
    droppedFrames: 0,
  };

  const pid = activeProcess?.pid || 'N/A';
  const isMock = activeProcess?.isMock;
  const targetFps = data.targetFps || 30;
  const targetResolution = data.targetResolution || activeProcess?.targetResolution;
  const isOverloaded = data.encoderOverload || (data.speed && parseFloat(data.speed) < 0.95);

  return (
    <div className="glass-panel p-5 rounded-2xl border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
          <h3 className="font-semibold text-slate-100 text-sm tracking-wide">GStreamer Real-Time Telemetry</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-purple-500/15 text-purple-300 border-purple-500/30">
            ENGINE: {data.engine || activeProcess?.engine || 'GSTREAMER'}
          </span>
          {data.encoder && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              data.isHardwareEncoder !== false && data.encoder !== 'libx264'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              {data.isHardwareEncoder !== false && data.encoder !== 'libx264' ? '⚡ GPU: ' : '💻 CPU: '}{data.encoder}
            </span>
          )}
          {data.decoder && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                data.decoder === 'cpu_software'
                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`}
              title={data.verifiedDecoderStatus || (data.decoder === 'cpu_software' ? 'CPU Software Decoding' : `Hardware Decoding (${data.decoder})`)}
            >
              {data.decoder === 'cpu_software' ? '💻 DEC: CPU' : `DEC: ${data.decoder}`}
            </span>
          )}
          <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">
            TARGET: {targetResolution ? `${targetResolution.toUpperCase()} @ ` : ''}{targetFps} FPS
          </span>
          {data.isFpsInterpolated && (
            <span className="text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded" title="Source stream is 30 FPS, frames paced to 60 CFR">
              PACED ({data.sourceFps || 30} ➔ 60)
            </span>
          )}
          {isMock && (
            <span className="text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded">
              SIMULATED STREAM
            </span>
          )}
          <span className="text-xs text-slate-400 font-mono">PID: <strong className="text-slate-200">{pid}</strong></span>
        </div>
      </div>

      {isOverloaded && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Encoder Bottleneck:</strong> Real-time processing speed is {data.speed || '<1.0x'} (below 1.00x). The hardware is unable to sustain {targetResolution ? `${targetResolution.toUpperCase()} @ ` : ''}{targetFps} FPS in real time, which can cause live buffering or freezing. Consider switching to a lower resolution or 30 FPS.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {/* Frames Received */}
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Frames Transmitted</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-cyan-300">{data.frame || data.framesReceived || 0}</span>
            <span className="text-[10px] text-slate-400 uppercase">frames</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
            <div className="bg-cyan-400 h-1 rounded-full w-full animate-pulse" />
          </div>
        </div>

        {/* FPS */}
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Frame Rate</span>
            <Gauge className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-100">{data.fps || 0}</span>
            <span className="text-[10px] text-slate-400 uppercase">fps</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((data.fps || 0) / 60) * 100)}%` }}
            />
          </div>
        </div>

        {/* Bitrate */}
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Bitrate</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-100">{data.bitrate || '0k'}</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
            <div className="bg-emerald-500 h-1 rounded-full w-4/5 animate-pulse" />
          </div>
        </div>

        {/* Speed */}
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Encoding Speed</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold font-mono text-slate-100">{data.speed || '0.0x'}</span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
            <div className="bg-purple-500 h-1 rounded-full w-full" />
          </div>
        </div>

        {/* Dropped Frames */}
        <div className="glass-card p-3 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span>Dropped Frames</span>
            <AlertTriangle className={`w-4 h-4 ${data.droppedFrames > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-xl font-bold font-mono ${data.droppedFrames > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
              {data.droppedFrames || 0}
            </span>
          </div>
          <div className="mt-2 w-full bg-slate-800 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${data.droppedFrames > 0 ? 'bg-amber-500 w-1/3' : 'bg-slate-700 w-0'}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TelemetryPanel;
