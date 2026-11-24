import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Maximize2,
  Minimize2,
  X,
  Radio,
  ChevronDown,
  ChevronUp,
  Share2,
  Youtube,
  Sparkles,
  Layers
} from 'lucide-react';
import LiveFeedScreen from './LiveFeedScreen';
import LiveFeedTheaterModal from './LiveFeedTheaterModal';
import { automationAPI } from '../services/api';

export const FloatingLivePlayer = () => {
  const [liveAutomations, setLiveAutomations] = useState([]);
  const [selectedAutoIndex, setSelectedAutoIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // Poll for active live automations
  const fetchLive = async () => {
    try {
      const res = await automationAPI.getList();
      const list = res.data.automations || [];
      const active = list.filter((a) => a.status === 'LIVE' || a.status === 'ROTATING');
      setLiveAutomations(active);
    } catch (_) {}
  };

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset dismissed state if a new live stream starts
  useEffect(() => {
    if (liveAutomations.length > 0) {
      // Keep selected index within bounds
      if (selectedAutoIndex >= liveAutomations.length) {
        setSelectedAutoIndex(0);
      }
    } else {
      setIsMaximized(false);
    }
  }, [liveAutomations.length]);

  const location = useLocation();

  // If user is already on a page that directly renders the stream (AutomationDetail, CameraWall, Projector),
  // suppress the floating player to prevent duplicate video decoding and heavy CPU/GPU load!
  const isDedicatedStreamPage =
    location.pathname.startsWith('/automations/') ||
    location.pathname === '/camera-wall' ||
    location.pathname === '/projector';

  if (liveAutomations.length === 0 || isDismissed || isDedicatedStreamPage) {
    return null;
  }

  const activeAuto = liveAutomations[selectedAutoIndex] || liveAutomations[0];

  return (
    <>
      {/* 1. Fullscreen Theater Modal when Maximized */}
      {isMaximized && activeAuto && (
        <LiveFeedTheaterModal
          automation={activeAuto}
          onClose={() => setIsMaximized(false)}
          onMinimize={() => setIsMaximized(false)}
          onRefresh={fetchLive}
        />
      )}

      {/* 2. Floating Mini Screen (Bottom-Right Corner) */}
      {!isMaximized && (
        <aside
          aria-label="Live Stream Preview Mini Screen"
          className={`fixed bottom-4 right-4 z-40 transition-all duration-300 ease-in-out select-none ${
            isCollapsed ? 'w-64' : 'w-72 sm:w-84'
          }`}
        >
          <div className="bg-slate-900/95 backdrop-blur-2xl border-2 border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden">
            {/* Mini Player Top Control Header */}
            <div className="flex items-center justify-between p-2 px-3 bg-slate-950/90 border-b border-slate-800 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px] tracking-wider uppercase shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  <span>LIVE</span>
                </span>
                <span className="font-bold text-slate-200 truncate text-[11px]" title={activeAuto.name}>
                  {activeAuto.name}
                </span>
              </div>

              {/* Right buttons: Multi stream selector, Collapse, Maximize, Close */}
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {liveAutomations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSelectedAutoIndex((prev) => (prev + 1) % liveAutomations.length)}
                    className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-600/30 text-purple-300 hover:bg-purple-600/50"
                    title={`Switch active view (${selectedAutoIndex + 1}/${liveAutomations.length})`}
                  >
                    {selectedAutoIndex + 1}/{liveAutomations.length}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title={isCollapsed ? 'Expand mini screen' : 'Collapse'}
                >
                  {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsMaximized(true)}
                  className="p-1 rounded-md text-emerald-400 hover:text-white hover:bg-emerald-600 transition-colors"
                  title="Fullscreen / Theater Screen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsDismissed(true)}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950 transition-colors"
                  title="Close mini screen"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Mini Player Video Screen */}
            {!isCollapsed && (
              <div className="relative aspect-video w-full bg-black">
                <LiveFeedScreen
                  automation={activeAuto}
                  isMini={true}
                  onMaximize={() => setIsMaximized(true)}
                />
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
};

export default FloatingLivePlayer;
