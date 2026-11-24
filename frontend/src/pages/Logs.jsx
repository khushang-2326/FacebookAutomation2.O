import React, { useState, useEffect } from 'react';
import { systemAPI } from '../services/api';
import { Terminal, RefreshCw, Filter, Trash2 } from 'lucide-react';

export const Logs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState('');
  const [componentFilter, setComponentFilter] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await systemAPI.getLogs({
        level: levelFilter || undefined,
        component: componentFilter || undefined,
        limit: 150
      });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [levelFilter, componentFilter]);

  const getLevelBadge = (level) => {
    switch (level) {
      case 'error':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'warn':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'debug':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      default:
        return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">System & Stream Logs</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time event logging, scheduler ticks, FFmpeg telemetry, and Meta API audit records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold focus:outline-none"
          >
            <option value="">All Levels</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </select>

          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Refresh Logs"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="glass-panel rounded-2xl border border-slate-800 p-4 font-mono text-xs overflow-hidden">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-200">Live Audit Console</span>
          </div>
          <span className="text-[11px]">Showing last {logs.length} entries</span>
        </div>

        <div className="max-h-[600px] overflow-y-auto space-y-2 pr-2">
          {logs.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No logs recorded for current filters.
            </div>
          ) : (
            logs.map((l) => (
              <div key={l._id} className="flex items-start gap-3 hover:bg-slate-900/50 p-1.5 rounded transition-colors">
                <span className="text-slate-500 text-[11px] shrink-0">
                  {new Date(l.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded border text-[10px] uppercase font-bold shrink-0 ${getLevelBadge(
                    l.level
                  )}`}
                >
                  {l.level}
                </span>
                <span className="text-purple-400 font-semibold shrink-0">[{l.component}]</span>
                <span className="text-slate-200 flex-1 break-all">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Logs;
