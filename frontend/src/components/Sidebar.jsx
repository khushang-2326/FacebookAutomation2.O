import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Share2,
  Video,
  PlusCircle,
  History,
  Settings,
  ShieldCheck,
  Camera,
  LayoutGrid
} from 'lucide-react';

export const Sidebar = () => {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/camera-wall', label: 'Camera Wall', icon: LayoutGrid },
    { to: '/automations/new', label: 'Create Automation', icon: PlusCircle, highlight: true },
    { to: '/cameras', label: 'Cameras', icon: Camera },
    { to: '/facebook', label: 'Facebook Pages', icon: Share2 },
    { to: '/media', label: 'Media Library', icon: Video },
    { to: '/history', label: 'Broadcast History', icon: History },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col justify-between shrink-0 h-screen sticky top-0">
      {/* Brand Header */}
      <div>
        <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-slate-100 tracking-tight leading-none">
              FB live auto 2.0
            </h1>
            <span className="text-[10px] text-blue-400 font-semibold tracking-wider uppercase">
              Rotation Engine
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : item.highlight
                    ? 'bg-blue-600/10 text-blue-400 hover:bg-blue-600/20 border border-blue-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Footer Security Badge */}
      <div className="p-4 m-4 rounded-2xl bg-slate-900/60 border border-slate-800/80">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Meta API v21.0 Compliant</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Encrypted AES-256-GCM tokens. Infinite auto-rotation before duration limits.
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
