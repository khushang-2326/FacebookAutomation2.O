import React from 'react';
import { Lock, ShieldAlert, AlertTriangle, Key, ExternalLink, RefreshCw } from 'lucide-react';

export const TrialExpiredModal = ({ message, onRetry }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl p-4 select-none animate-in fade-in duration-300">
      <div className="max-w-md w-full bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-rose-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-rose-950/60 text-center relative overflow-hidden">
        {/* Top ambient glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Lock Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-5 shadow-lg shadow-rose-950/50">
          <Lock className="w-8 h-8" />
        </div>

        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider mb-3">
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Evaluation Period Concluded</span>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-black text-white tracking-tight mb-2">
          30-Day Trial Expired
        </h2>

        {/* Explanation */}
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          {message || 'Your 30-day evaluation period for Facebook Live Streamer has expired on 7-11-2026. All streaming automation engines, broadcasting pipelines, and background services have been deactivated.'}
        </p>

        {/* Info card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-300 space-y-2 mb-6">
          <div className="flex items-center gap-2 text-rose-400 font-semibold">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Application Inactive</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            To continue 24/7 uninterrupted live streaming, unlimited playlists, RTSP multi-camera broadcast, and automatic schedule management, upgrade to the full licensed version.
          </p>
        </div>

        {/* Action Button */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onRetry}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 active:scale-98"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Check License Status Again</span>
          </button>
        </div>

        <p className="mt-4 text-[10px] text-slate-500">
          Software ID: com.facebook.liveautomation • Trial Engine v1.3
        </p>
      </div>
    </div>
  );
};

export default TrialExpiredModal;
