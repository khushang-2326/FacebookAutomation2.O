import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { automationAPI, systemAPI } from '../services/api';
import MetricsCard from '../components/MetricsCard';
import StatusPill from '../components/StatusPill';
import LiveCountdown from '../components/LiveCountdown';
import LiveFeedScreen from '../components/LiveFeedScreen';
import LiveFeedTheaterModal from '../components/LiveFeedTheaterModal';
import { LiveCameraScheduleSwitcher } from '../components/LiveCameraScheduleSwitcher';
import {
  Radio,
  Share2,
  Film,
  PlusCircle,
  Play,
  Pause,
  RotateCw,
  ArrowUpRight,
  Activity,
  Layers,
  AlertOctagon,
  Maximize2,
  X,
  Tv
} from 'lucide-react';

export const Dashboard = () => {
  const [automations, setAutomations] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [isStoppingAll, setIsStoppingAll] = useState(false);
  const [maximizedAutomation, setMaximizedAutomation] = useState(null);

  const fetchData = async () => {
    try {
      const [autoRes, healthRes] = await Promise.all([
        automationAPI.getList(),
        systemAPI.getHealth()
      ]);
      setAutomations(autoRes.data.automations || []);
      setHealth(healthRes.data || null);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const liveAutomations = automations.filter(a => a.status === 'LIVE' || a.status === 'ROTATING');

  const handleRotateNow = async (id) => {
    try {
      await automationAPI.rotateNow(id);
      fetchData();
    } catch (err) {
      alert(`Rotate failed: ${err.message}`);
    }
  };

  const handlePause = async (id) => {
    try {
      await automationAPI.pause(id);
      fetchData();
    } catch (err) {
      alert(`Pause failed: ${err.message}`);
    }
  };

  const handleResume = async (id) => {
    try {
      await automationAPI.resume(id);
      fetchData();
    } catch (err) {
      alert(`Resume failed: ${err.message}`);
    }
  };

  const handleEmergencyStop = async () => {
    setIsStoppingAll(true);
    try {
      await automationAPI.emergencyStop();
      await fetchData();
      setShowEmergencyModal(false);
    } catch (err) {
      alert(`Emergency Stop failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsStoppingAll(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Live Automation Dashboard</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Monitor, rotate, and schedule continuous Facebook Live broadcasts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {liveAutomations.length > 0 && (
            <button
              onClick={() => setShowEmergencyModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-xs font-bold shadow-lg shadow-rose-600/10 transition-all hover:scale-105 active:scale-95"
            >
              <AlertOctagon className="w-4 h-4 text-rose-400" />
              <span>STOP ALL BROADCASTS</span>
            </button>
          )}

          <Link
            to="/automations/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all hover:scale-105 active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Automation</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="Active Live Streams"
          value={health?.counts?.liveAutomations || 0}
          subtitle="Currently broadcasting"
          icon={Radio}
          color="emerald"
        />
        <MetricsCard
          title="Total Automations"
          value={health?.counts?.totalAutomations || 0}
          subtitle="Configured schedules"
          icon={Layers}
          color="blue"
        />
        <MetricsCard
          title="Total Broadcast Sessions"
          value={health?.counts?.totalBroadcasts || 0}
          subtitle="Rotations completed"
          icon={Activity}
          color="purple"
        />
        <MetricsCard
          title="Connected Facebook Pages"
          value={health?.counts?.totalPages || 0}
          subtitle="Authorized ingest targets"
          icon={Share2}
          color="amber"
        />
      </div>

      {/* Active Live Streams Section */}
      {liveAutomations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <h3 className="font-bold text-base text-slate-100">Live Active Broadcasts</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Auto-refreshing every 4s
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {liveAutomations.map((auto) => (
              <div
                key={auto._id}
                className="glass-panel p-5 rounded-2xl border border-slate-800 relative overflow-hidden transition-all hover:border-slate-700"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusPill status={auto.status} />
                      <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                        Rotation #{auto.currentRotationIndex || 1}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-100 text-base">{auto.name}</h4>
                    <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                      <span>Page: <strong>{auto.facebookPageId?.name || 'Facebook Page'}</strong></span>
                      <span>•</span>
                      <span>Media: {auto.mediaId?.originalName || 'Video'}</span>
                    </p>
                  </div>
                  <Link
                    to={`/automations/${auto._id}`}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    title="View details and live telemetry"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Live Feed Mini Screen */}
                <div className="my-3 rounded-xl overflow-hidden border border-slate-700/80 bg-black aspect-video relative shadow-lg">
                  <LiveFeedScreen
                    automation={auto}
                    isMini={true}
                    onMaximize={() => setMaximizedAutomation(auto)}
                  />
                </div>

                {/* Live Camera Switcher (if scheduled cameras configured) */}
                {Array.isArray(auto.cameraSchedules) && auto.cameraSchedules.length > 1 && (
                  <div className="my-3">
                    <LiveCameraScheduleSwitcher automation={auto} />
                  </div>
                )}

                {/* Countdown to Next Auto-Rotation */}
                <div className="my-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <LiveCountdown
                    targetDate={auto.nextRotationScheduledAt}
                    totalDurationSec={auto.rotationDurationSec}
                    isRotation={true}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRotateNow(auto._id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold transition-all"
                      title="Force immediate live stream rotation"
                    >
                      <RotateCw className="w-3.5 h-3.5 animate-spin-slow" />
                      <span>Rotate Now</span>
                    </button>

                    <a
                      href="/projector"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 font-semibold transition-all"
                      title="Cast Program Output to HDMI Display / Projector"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>HDMI Cast</span>
                    </a>

                    {auto.status === 'LIVE' ? (
                      <button
                        onClick={() => handlePause(auto._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-semibold transition-all"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResume(auto._id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold transition-all"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Resume</span>
                      </button>
                    )}
                  </div>

                  <Link
                    to={`/automations/${auto._id}`}
                    className="text-blue-400 hover:text-blue-300 font-semibold"
                  >
                    Open Live Control Center →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Automations Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-100">All Scheduled Automations</h3>
          <span className="text-xs text-slate-400">Total: {automations.length}</span>
        </div>

        {automations.length === 0 ? (
          <div className="glass-panel p-12 rounded-2xl text-center border border-slate-800">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4 text-blue-400">
              <Radio className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-slate-200 text-base">No automations scheduled yet</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
              Create your first scheduled live stream automation with automated rotation and looping media.
            </p>
            <Link
              to="/automations/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create First Automation</span>
            </Link>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5">Automation Name</th>
                    <th className="px-6 py-3.5">Target Page</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Start Time & Timezone</th>
                    <th className="px-6 py-3.5">Target Duration</th>
                    <th className="px-6 py-3.5">Rotation</th>
                    <th className="px-6 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {automations.map((auto) => (
                    <tr key={auto._id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <Link to={`/automations/${auto._id}`} className="font-semibold text-slate-100 hover:text-blue-400">
                          {auto.name}
                        </Link>
                        <p className="text-[11px] text-slate-400">{auto.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-200">{auto.facebookPageId?.name || 'Page'}</span>
                        <p className="text-[10px] text-slate-500">{auto.facebookPageId?.category}</p>
                      </td>
                      <td className="px-6 py-4">
                        <StatusPill status={auto.status} />
                      </td>
                      <td className="px-6 py-4">
                        {auto.scheduleMode === 'RECURRING_WINDOW' ? (
                          <div>
                            <span className="inline-block px-2 py-0.5 mb-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded">
                              {auto.scheduleName || 'Recurring Window'}
                            </span>
                            <p className="font-mono text-slate-200 text-xs">
                              {auto.dailyStartTime || '00:00'} - {auto.dailyEndTime || '23:59'}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {Array.isArray(auto.daysOfWeek) && auto.daysOfWeek.length > 0 ? auto.daysOfWeek.join(', ') : 'Everyday'}
                            </p>
                            <p className="text-[10px] text-blue-400 font-mono">{auto.timezone || 'Asia/Kolkata'}</p>
                          </div>
                        ) : (
                          <div>
                            <span className="font-mono text-slate-200 text-xs">
                              {new Date(auto.scheduledStartTime).toLocaleString([], { timeZone: auto.timezone || undefined, dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                            <p className="text-[10px] text-blue-400 font-mono">{auto.timezone || 'Asia/Kolkata'}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-300">
                        {auto.totalDurationSec ? (
                          (() => {
                            const sec = auto.totalDurationSec;
                            const hrs = Math.floor(sec / 3600);
                            const mins = Math.round((sec % 3600) / 60);
                            if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
                            if (hrs > 0) return `${hrs} ${hrs === 1 ? 'Hour' : 'Hours'}`;
                            return `${mins} ${mins === 1 ? 'Minute' : 'Minutes'}`;
                          })()
                        ) : auto.totalDurationHours ? (
                          `${auto.totalDurationHours} Hours`
                        ) : (
                          '24/7 Indefinite'
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-bold text-blue-400">
                          #{auto.currentRotationIndex || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={`/automations/${auto._id}`}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
                        >
                          <span>Manage</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Emergency Stop Confirmation Modal */}
      {showEmergencyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="glass-panel w-full max-w-md p-6 rounded-2xl border border-rose-500/30 bg-slate-900 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Emergency Stop All Streams?</h3>
                <p className="text-xs text-slate-400">Immediate platform-wide broadcast termination</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This action will <strong>immediately stop all active FFmpeg video streams</strong> and end all live broadcasts on your Facebook Pages. All running schedules will be paused.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEmergencyModal(false)}
                disabled={isStoppingAll}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmergencyStop}
                disabled={isStoppingAll}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isStoppingAll ? (
                  <span>Terminating Streams...</span>
                ) : (
                  <>
                    <AlertOctagon className="w-4 h-4" />
                    <span>Confirm Emergency Stop</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Maximized Theater Modal */}
      {maximizedAutomation && (
        <LiveFeedTheaterModal
          automation={maximizedAutomation}
          onClose={() => setMaximizedAutomation(null)}
          onMinimize={() => setMaximizedAutomation(null)}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
};

export default Dashboard;
