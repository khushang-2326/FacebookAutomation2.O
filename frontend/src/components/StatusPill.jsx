import React from 'react';

const statusConfig = {
  LIVE: {
    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500 animate-pulse',
    label: 'LIVE NOW',
  },
  STREAMING: {
    bg: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    dot: 'bg-teal-500 animate-pulse',
    label: 'STREAMING',
  },
  CREATING_BROADCAST: {
    bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    dot: 'bg-indigo-500 animate-pulse',
    label: 'CREATING BROADCAST',
  },
  PREPARING: {
    bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dot: 'bg-blue-500 animate-ping',
    label: 'PREPARING',
  },
  ROTATING: {
    bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500 animate-spin',
    label: 'AUTO ROTATING',
  },
  STOPPING: {
    bg: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    dot: 'bg-orange-500 animate-pulse',
    label: 'STOPPING',
  },
  STARTING: {
    bg: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dot: 'bg-blue-500 animate-ping',
    label: 'STARTING STREAM',
  },
  SCHEDULED: {
    bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    dot: 'bg-sky-500',
    label: 'SCHEDULED',
  },
  PAUSED: {
    bg: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    dot: 'bg-yellow-500',
    label: 'PAUSED',
  },
  STOPPED: {
    bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-500',
    label: 'STOPPED',
  },
  COMPLETED: {
    bg: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    dot: 'bg-purple-500',
    label: 'COMPLETED',
  },
  FAILED: {
    bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    dot: 'bg-rose-500',
    label: 'FAILED',
  },
  CRASHED: {
    bg: 'bg-red-500/10 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
    label: 'CRASH RECOVERED',
  },
  ENDED: {
    bg: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-500',
    label: 'ENDED',
  },
};

export const StatusPill = ({ status, size = 'md', className = '' }) => {
  const current = statusConfig[status] || statusConfig.STOPPED;

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${current.bg} ${sizeClasses[size] || sizeClasses.md} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${current.dot}`} />
      {current.label}
    </span>
  );
};

export default StatusPill;
