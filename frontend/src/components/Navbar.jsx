import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { systemAPI, automationAPI } from '../services/api';
import { useTrial } from '../context/TrialContext';
import { Radio, AlertOctagon, Wifi, ShieldCheck, LogOut, RefreshCw, Clock, Tv } from 'lucide-react';
import { castToExternalDisplay } from '../utils/projectorCast';

export const Navbar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isConnected } = useSocket();
  const { isTrial, isExpired, remainingDays, remainingHours, remainingMinutes } = useTrial();
  const [health, setHealth] = useState(null);
  const [isEmergencyStopping, setIsEmergencyStopping] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fetchHealth = async () => {
    try {
      const res = await systemAPI.getHealth();
      setHealth(res.data);
    } catch (_) {}
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleEmergencyStop = async () => {
    if (!window.confirm('⚠️ ARE YOU SURE? This will immediately terminate ALL live streams across the entire platform!')) {
      return;
    }
    setIsEmergencyStopping(true);
    try {
      await automationAPI.emergencyStop();
      alert('✅ Emergency Stop executed: All active broadcasts and processes terminated.');
      fetchHealth();
    } catch (err) {
      alert(`Error during emergency stop: ${err.message}`);
    } finally {
      setIsEmergencyStopping(false);
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Global status indicators */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-slate-300 font-medium">
            {isConnected ? 'Real-time WebSocket' : 'Connecting WebSocket...'}
          </span>
        </div>

        {isTrial && (
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
            isExpired
              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          }`}>
            <Clock className={`w-3.5 h-3.5 ${isExpired ? 'text-rose-400' : 'text-amber-400'}`} />
            <span>
              {isExpired
                ? 'Trial Expired'
                : remainingDays > 0
                ? `Trial: ${remainingDays}d ${remainingHours}h remaining`
                : `Trial: ${remainingHours}h ${remainingMinutes}m remaining`}
            </span>
          </div>
        )}

        {health?.streaming?.mockMode && (
          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
            Mock Mode Active
          </span>
        )}

        {health?.streaming?.testMode && (
          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
            Test Mode (15s/3s)
          </span>
        )}

        {health?.counts?.liveAutomations > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold animate-pulse">
            <Radio className="w-3.5 h-3.5" />
            <span>{health.counts.liveAutomations} LIVE BROADCASTS</span>
          </div>
        )}
      </div>

      {/* Right: HDMI Cast + Emergency Stop + User Account */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={() => castToExternalDisplay({ mode: 'ACTIVE_BROADCAST' })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 hover:border-indigo-500 text-xs font-bold transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
          title="Cast Active Live Broadcast to HDMI / External Screen"
        >
          <Tv className="w-3.5 h-3.5 text-indigo-400 group-hover:text-white" />
          <span className="hidden md:inline">HDMI Screen</span>
        </button>

        <button
          onClick={handleEmergencyStop}
          disabled={isEmergencyStopping}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold tracking-wide transition-all shadow-lg shadow-rose-950/50 hover:scale-105 active:scale-95"
          title="Instantly stop all active live streams across all pages"
        >
          <AlertOctagon className={`w-4 h-4 text-rose-400 ${isEmergencyStopping ? 'animate-spin' : ''}`} />
          <span>{isEmergencyStopping ? 'STOPPING ALL...' : 'EMERGENCY KILL ALL'}</span>
        </button>

        <div className="h-6 w-px bg-slate-800" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-xs text-white shadow-md">
            {user?.name ? user.name.substring(0, 2).toUpperCase() : 'AD'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-slate-200">{user?.name || 'Admin User'}</p>
            <p className="text-[10px] text-slate-400">{user?.email || 'admin@liveautomation.dev'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-lg transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
