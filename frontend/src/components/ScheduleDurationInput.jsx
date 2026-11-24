import React, { useState, useEffect } from 'react';

/**
 * ScheduleDurationInput
 * 
 * Provides separate Minute and Second inputs for camera, media, and YouTube rotation schedules.
 * Stores and emits total seconds (durationSeconds) for 100% backward compatibility with the database.
 * 
 * Features:
 * - Direct keyboard typing (numbers, backspace, delete, paste) with no aggressive snapping.
 * - ArrowUp / ArrowDown with smart rollover:
 *   59s + ArrowUp -> increments minute, sets seconds to 0.
 *   0s + ArrowDown -> decrements minute (if > 0), sets seconds to 59.
 * - Backward-compatible: converts total seconds (e.g. 20s -> 0m 20s, 300s -> 5m 0s, 330s -> 5m 30s).
 */
export default function ScheduleDurationInput({
  value = 20,
  onChange,
  minSeconds = 1,
  maxSeconds = 86400,
  label = 'Show for:',
  color = 'blue', // 'blue' | 'red' | 'indigo' | 'emerald'
  disabled = false
}) {
  const numVal = typeof value === 'number' && !isNaN(value) ? Math.max(0, value) : (parseInt(value, 10) || 20);
  const initialMin = Math.floor(numVal / 60);
  const initialSec = numVal % 60;

  const [minStr, setMinStr] = useState(String(initialMin));
  const [secStr, setSecStr] = useState(String(initialSec));
  const [isFocused, setIsFocused] = useState(false);

  // Synchronize when value changes externally while not actively typing
  useEffect(() => {
    if (!isFocused) {
      const m = Math.floor(numVal / 60);
      const s = numVal % 60;
      setMinStr(String(m));
      setSecStr(String(s));
    }
  }, [numVal, isFocused]);

  const commitValue = (mVal, sVal) => {
    const m = Math.max(0, parseInt(mVal, 10) || 0);
    const s = Math.max(0, Math.min(59, parseInt(sVal, 10) || 0));
    let total = m * 60 + s;
    if (total < minSeconds) total = minSeconds;
    if (total > maxSeconds) total = maxSeconds;

    if (onChange) {
      onChange(total);
    }
    return total;
  };

  const handleMinChange = (e) => {
    const text = e.target.value.replace(/[^0-9]/g, '');
    setMinStr(text);
    if (text !== '') {
      commitValue(text, secStr);
    }
  };

  const handleSecChange = (e) => {
    let text = e.target.value.replace(/[^0-9]/g, '');
    if (text !== '') {
      let sNum = parseInt(text, 10);
      if (sNum > 59) sNum = 59;
      text = String(sNum);
    }
    setSecStr(text);
    if (text !== '') {
      commitValue(minStr, text);
    }
  };

  const handleMinKeyDown = (e) => {
    const currentMin = parseInt(minStr, 10) || 0;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newMin = currentMin + 1;
      setMinStr(String(newMin));
      commitValue(newMin, secStr);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newMin = Math.max(0, currentMin - 1);
      setMinStr(String(newMin));
      commitValue(newMin, secStr);
    }
  };

  const handleSecKeyDown = (e) => {
    const currentSec = parseInt(secStr, 10) || 0;
    const currentMin = parseInt(minStr, 10) || 0;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentSec >= 59) {
        // Roll over: 59s -> 0s, increment minute
        const newMin = currentMin + 1;
        setMinStr(String(newMin));
        setSecStr('0');
        commitValue(newMin, 0);
      } else {
        const newSec = currentSec + 1;
        setSecStr(String(newSec));
        commitValue(minStr, newSec);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentSec <= 0) {
        if (currentMin > 0) {
          // Roll down: 0s -> 59s, decrement minute
          const newMin = currentMin - 1;
          setMinStr(String(newMin));
          setSecStr('59');
          commitValue(newMin, 59);
        } else {
          // Can't decrement below 0s when 0m
          setSecStr('0');
          commitValue(0, 0);
        }
      } else {
        const newSec = currentSec - 1;
        setSecStr(String(newSec));
        commitValue(minStr, newSec);
      }
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const m = parseInt(minStr, 10) || 0;
    const s = parseInt(secStr, 10) || 0;
    const total = commitValue(m, s);
    setMinStr(String(Math.floor(total / 60)));
    setSecStr(String(total % 60));
  };

  // Theme accent colors
  const colorStyles = {
    blue: {
      text: 'text-blue-400',
      border: 'border-blue-500/30',
      focus: 'focus-within:border-blue-500'
    },
    red: {
      text: 'text-red-400',
      border: 'border-red-500/30',
      focus: 'focus-within:border-red-500'
    },
    indigo: {
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      focus: 'focus-within:border-indigo-500'
    },
    emerald: {
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      focus: 'focus-within:border-emerald-500'
    }
  }[color] || {
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    focus: 'focus-within:border-blue-500'
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 bg-slate-950/90 border border-slate-700/80 rounded-lg px-2.5 py-1 shadow-inner ${colorStyles.focus} transition-all`}
    >
      {label && (
        <span className="text-[11px] text-slate-400 font-medium select-none whitespace-nowrap">
          {label}
        </span>
      )}

      {/* Minutes Input */}
      <div className="flex items-center gap-0.5">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={minStr}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onChange={handleMinChange}
          onKeyDown={handleMinKeyDown}
          onBlur={handleBlur}
          className="w-8 bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-center font-bold text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 select-all"
          title="Minutes (type or use ArrowUp/Down)"
        />
        <span className={`text-[11px] font-semibold ${colorStyles.text} select-none`}>m</span>
      </div>

      <span className="text-slate-600 font-bold select-none">:</span>

      {/* Seconds Input */}
      <div className="flex items-center gap-0.5">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={secStr}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onChange={handleSecChange}
          onKeyDown={handleSecKeyDown}
          onBlur={handleBlur}
          className="w-8 bg-slate-900 border border-slate-800 rounded px-1 py-0.5 text-center font-bold text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 select-all"
          title="Seconds (0-59, type or use ArrowUp/Down)"
        />
        <span className={`text-[11px] font-semibold ${colorStyles.text} select-none`}>s</span>
      </div>
    </div>
  );
}
