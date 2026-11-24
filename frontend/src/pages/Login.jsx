import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Radio, ShieldCheck, Lock, ArrowRight, Zap } from 'lucide-react';

export const Login = () => {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdminDevLogin, setShowAdminDevLogin] = useState(false);

  const handleFacebookLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/facebook/login', {
        headers: { Accept: 'application/json' }
      });
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        window.location.href = '/api/facebook/login';
      }
    } catch (err) {
      window.location.href = '/api/facebook/login';
    }
  };

  const handleAdminDevSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login('admin@liveautomation.dev', 'password123');
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Dev login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-600/30 mx-auto mb-4">
          <Radio className="w-7 h-7 text-white animate-pulse" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
          FB live auto 2.0
        </h2>
        <p className="mt-1.5 text-xs text-slate-400">
          Persistent Scheduled Automation & Rotation Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4">
        <div className="glass-panel py-8 px-6 sm:px-8 rounded-3xl border border-slate-800 shadow-2xl space-y-6 text-center">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold text-left">
              {error}
            </div>
          )}

          {/* Primary Action: Continue with Facebook */}
          <button
            type="button"
            onClick={handleFacebookLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-2xl bg-[#1877F2] hover:bg-[#166FE5] text-white text-sm font-bold tracking-wide transition-all shadow-xl shadow-blue-600/25 active:scale-95 disabled:opacity-50"
          >
            <svg className="w-5 h-5 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            <span>{loading ? 'Connecting Facebook...' : 'Continue with Facebook'}</span>
          </button>

          {/* Security Guarantee Text */}
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Securely sign in using your Facebook account</span>
          </div>

          {/* Internal Dev Admin Fallback Toggle */}
          <div className="pt-6 border-t border-slate-800/80">
            {!showAdminDevLogin ? (
              <button
                type="button"
                onClick={() => setShowAdminDevLogin(true)}
                className="text-[11px] text-slate-500 hover:text-slate-400 font-medium transition-colors"
              >
                Internal Dev / Offline Override Mode
              </button>
            ) : (
              <form onSubmit={handleAdminDevSubmit} className="space-y-3 pt-2">
                <p className="text-[11px] text-amber-400 font-semibold">Development Admin Override</p>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Enter Dev Admin Workspace</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
