import React, { useState, useEffect } from 'react';
import { broadcastAPI } from '../services/api';
import StatusPill from '../components/StatusPill';
import { History, RefreshCw, Layers, Clock, AlertTriangle } from 'lucide-react';

export const BroadcastHistory = () => {
  const [broadcasts, setBroadcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchBroadcasts = async () => {
    try {
      const res = await broadcastAPI.getList({
        status: statusFilter || undefined,
        limit: 100
      });
      setBroadcasts(res.data.broadcasts || []);
    } catch (err) {
      console.error('Failed to load broadcast history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBroadcasts();
  }, [statusFilter]);

  const formatDuration = (sec) => {
    if (!sec) return '0s';
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Broadcast Session History</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Audit history of all individual Facebook Live video broadcasts, rotation cycles, and durations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="LIVE">Live Now</option>
            <option value="ENDED">Ended (Normal)</option>
            <option value="ROTATING">Rotating</option>
            <option value="FAILED">Failed</option>
            <option value="CRASHED">Crashed / Recovered</option>
          </select>

          <button
            onClick={fetchBroadcasts}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Refresh History"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Broadcasts Table */}
      {broadcasts.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center border border-slate-800 text-slate-400">
          <History className="w-8 h-8 mx-auto mb-2 text-slate-500" />
          <p className="text-sm font-medium text-slate-300">No broadcast sessions found</p>
          <p className="text-xs mt-1">Sessions will appear here once an automation starts broadcasting.</p>
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5">Rotation</th>
                  <th className="px-6 py-3.5">Automation</th>
                  <th className="px-6 py-3.5">Facebook Page</th>
                  <th className="px-6 py-3.5">Live Video ID</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Started At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {broadcasts.map((b) => (
                  <tr key={b._id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                        Part #{b.rotationIndex}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-200">
                      {b.automationId?.name || 'Automation'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-300 font-medium">{b.facebookPageId?.name || 'Page'}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-[11px] text-slate-400">
                      {b.fbLiveVideoId}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-emerald-400">
                      {formatDuration(b.durationSec)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusPill status={b.status} size="sm" />
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-[11px]">
                      {b.actualStartTime ? new Date(b.actualStartTime).toLocaleString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BroadcastHistory;
