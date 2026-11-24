import React, { useState, useEffect } from 'react';
import { RotateCw, Clock } from 'lucide-react';

export const LiveCountdown = ({ targetDate, totalDurationSec = 60, isRotation = true }) => {
  const [timeLeftSec, setTimeLeftSec] = useState(0);

  useEffect(() => {
    if (!targetDate) {
      setTimeLeftSec(0);
      return;
    }

    const updateCountdown = () => {
      const diff = Math.max(0, Math.floor((new Date(targetDate).getTime() - Date.now()) / 1000));
      setTimeLeftSec(diff);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
    }
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const percentRemaining = totalDurationSec > 0
    ? Math.min(100, Math.max(0, (timeLeftSec / totalDurationSec) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 text-slate-400 font-medium">
          {isRotation ? (
            <>
              <RotateCw className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
              Next Auto-Rotation In:
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Scheduled Start In:
            </>
          )}
        </span>
        <span className="font-mono font-bold text-slate-100 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
          {formatTime(timeLeftSec)}
        </span>
      </div>
      <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden border border-slate-700/50">
        <div
          className={`h-full transition-all duration-1000 ${
            isRotation ? 'bg-gradient-to-r from-amber-500 to-emerald-400' : 'bg-blue-500'
          }`}
          style={{ width: `${percentRemaining}%` }}
        />
      </div>
    </div>
  );
};

export default LiveCountdown;
