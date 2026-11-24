import React, { useState, useEffect } from 'react';
import { facebookAPI } from '../services/api';
import {
  Share2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Trash2,
  Shield,
  Key,
  HelpCircle,
  ExternalLink,
  PlusCircle,
  X,
  Youtube,
  Tv
} from 'lucide-react';

export const FacebookConnect = () => {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testingPageId, setTestingPageId] = useState(null);
  const [isConnectingMock, setIsConnectingMock] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [connectTab, setConnectTab] = useState('youtube_stream_key'); // 'youtube_stream_key' | 'facebook_stream_key' | 'token'
  const [streamKeyInput, setStreamKeyInput] = useState('');
  const [streamKeyName, setStreamKeyName] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [youtubeResolution, setYoutubeResolution] = useState('1080p');
  const [youtubeFps, setYoutubeFps] = useState(30);
  const [tokenInput, setTokenInput] = useState('');
  const [pageIdInput, setPageIdInput] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [tokenSuccess, setTokenSuccess] = useState('');

  const fetchPages = async () => {
    try {
      const res = await facebookAPI.getPages();
      setPages(res.data.pages || []);
    } catch (err) {
      console.error('Failed to fetch streaming destinations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
  }, []);

  const handleMockConnect = async () => {
    setIsConnectingMock(true);
    try {
      await facebookAPI.mockConnect();
      await fetchPages();
      alert('✅ Connected Mock Facebook Creator with 3 sample test pages!');
    } catch (err) {
      alert(`Mock connect failed: ${err.message}`);
    } finally {
      setIsConnectingMock(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setIsSubmittingToken(true);
    setTokenError('');
    setTokenSuccess('');

    try {
      if (connectTab === 'youtube_stream_key') {
        if (!streamKeyInput.trim()) {
          setTokenError('Please paste your YouTube Live Stream Key.');
          setIsSubmittingToken(false);
          return;
        }
        const res = await facebookAPI.connectStreamKey({
          streamKey: streamKeyInput.trim(),
          name: streamKeyName.trim() || 'My YouTube Live Channel',
          platform: 'YOUTUBE',
          serverUrl: serverUrlInput.trim() || 'rtmp://a.rtmp.youtube.com/live2/',
          resolution: youtubeResolution,
          fps: Number(youtubeFps) === 60 ? 60 : 30
        });
        setTokenSuccess(res.data.message || 'Successfully connected YouTube Live!');
        setStreamKeyInput('');
      } else if (connectTab === 'facebook_stream_key') {
        if (!streamKeyInput.trim()) {
          setTokenError('Please paste your Facebook Live Stream Key.');
          setIsSubmittingToken(false);
          return;
        }
        const res = await facebookAPI.connectStreamKey({
          streamKey: streamKeyInput.trim(),
          name: streamKeyName.trim() || 'My Facebook Live (Stream Key)',
          platform: 'FACEBOOK',
          serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/'
        });
        setTokenSuccess(res.data.message || 'Successfully connected Facebook Stream Key!');
        setStreamKeyInput('');
      } else {
        if (!tokenInput.trim()) {
          setTokenError('Please paste your Facebook Page Access Token or User Token.');
          setIsSubmittingToken(false);
          return;
        }
        const res = await facebookAPI.connectWithToken({
          token: tokenInput.trim(),
          pageId: pageIdInput.trim() || undefined
        });
        setTokenSuccess(res.data.message || 'Successfully connected Facebook Page!');
        setTokenInput('');
        setPageIdInput('');
      }

      await fetchPages();
      setTimeout(() => {
        setShowTokenModal(false);
        setTokenSuccess('');
      }, 1500);
    } catch (err) {
      setTokenError(err.response?.data?.error || err.message || 'Failed to connect target.');
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const handleTestToken = async (pageId) => {
    setTestingPageId(pageId);
    try {
      const res = await facebookAPI.testPageToken(pageId);
      alert(`✅ ${res.data.message}`);
      await fetchPages();
    } catch (err) {
      alert(`❌ Test failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingPageId(null);
    }
  };

  const handleDeletePage = async (pageId, pageName) => {
    if (!window.confirm(`Are you sure you want to disconnect "${pageName}"?`)) return;
    try {
      await facebookAPI.deletePage(pageId);
      await fetchPages();
    } catch (err) {
      alert(`Failed to remove destination: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Streaming Destinations (Facebook & YouTube)</h2>
        <p className="text-sm text-slate-400 mt-0.5">
          Connect your YouTube Live channels and Facebook Pages / Stream Keys to enable automated live broadcasting.
        </p>
      </div>

      {/* Quick Connect Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: YouTube Live Stream Key */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-red-500/40 transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 group-hover:scale-105 transition-transform">
                <Youtube className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                YouTube Live
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1">YouTube Live Stream Key</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Stream live straight to your YouTube channel using your YouTube Studio Stream Key.
            </p>
          </div>
          <button
            onClick={() => {
              setConnectTab('youtube_stream_key');
              setShowTokenModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-red-600/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Connect YouTube Live</span>
          </button>
        </div>

        {/* Card 2: Facebook Live Stream Key */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-blue-500/40 transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
                <Share2 className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                Facebook Live
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1">Facebook Stream Key</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Connect via Facebook Live Producer stream key without complex app review.
            </p>
          </div>
          <button
            onClick={() => {
              setConnectTab('facebook_stream_key');
              setShowTokenModal(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-blue-600/20"
          >
            <Key className="w-4 h-4" />
            <span>Connect Facebook Key</span>
          </button>
        </div>

        {/* Card 3: 1-Click Mock Test */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-purple-500/40 transition-all group">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
                <Zap className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                Instant Simulation
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mb-1">One-Click Mock Account</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Loads simulated live stream endpoints for offline testing of automated rotations.
            </p>
          </div>
          <button
            onClick={handleMockConnect}
            disabled={isConnectingMock}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-purple-600/20"
          >
            <RefreshCw className={`w-4 h-4 ${isConnectingMock ? 'animate-spin' : ''}`} />
            <span>{isConnectingMock ? 'Connecting...' : 'Connect Mock Account'}</span>
          </button>
        </div>
      </div>

      {/* Connected Destinations List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-100">Authorized Destinations ({pages.length})</h3>
            <p className="text-xs text-slate-400">Channels and pages available for scheduled live stream broadcasts.</p>
          </div>
          <button
            onClick={fetchPages}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors border border-slate-800"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {pages.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center border border-slate-800 text-slate-400 space-y-3">
            <Tv className="w-10 h-10 mx-auto text-slate-600" />
            <p className="text-base font-semibold text-slate-200">No Streaming Destinations connected yet</p>
            <p className="text-xs max-w-md mx-auto text-slate-400 leading-relaxed">
              Connect YouTube Live or Facebook Live using your stream keys to start broadcasting.
            </p>
            <button
              onClick={() => {
                setConnectTab('youtube_stream_key');
                setShowTokenModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/20 transition-all"
            >
              <Youtube className="w-4 h-4" />
              <span>Connect YouTube Live</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pages.map((page) => {
              const isYT = page.platform === 'YOUTUBE' || page.category?.includes('YouTube') || page.name?.toLowerCase().includes('youtube');
              return (
                <div
                  key={page.id}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between relative group hover:border-slate-700 transition-all"
                >
                  <div>
                    <div className="flex items-start gap-3 mb-3">
                      <div className="relative shrink-0">
                        <img
                          src={page.pictureUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60'}
                          alt={page.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-700"
                        />
                        {isYT ? (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white p-0.5 rounded-full shadow">
                            <Youtube className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="absolute -top-1.5 -right-1.5 bg-blue-600 text-white p-0.5 rounded-full shadow">
                            <Share2 className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-100 text-sm truncate">{page.name}</h4>
                        <p className="text-[11px] text-slate-400 truncate">{page.category}</p>
                        <p className="text-[10px] font-mono text-slate-500 mt-0.5">Target ID: {page.pageId}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mb-4">
                      {isYT ? (
                        <>
                          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                            YOUTUBE LIVE
                          </span>
                          <span className="text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700/60 px-2 py-0.5 rounded font-mono">
                            {(page.resolution || '1080p').toUpperCase()} {page.fps || 30}FPS
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          FACEBOOK LIVE
                        </span>
                      )}

                      {page.isValid && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                          <CheckCircle className="w-3 h-3" /> AES-256 Verified
                        </span>
                      )}

                      {page.isMock && (
                        <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          MOCK
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleTestToken(page.id)}
                      disabled={testingPageId === page.id}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5 text-blue-400" />
                      <span>{testingPageId === page.id ? 'Verifying...' : 'Test Connection'}</span>
                    </button>

                    <button
                      onClick={() => handleDeletePage(page.id, page.name)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors border border-slate-800"
                      title="Remove Destination"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Connect Modal */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">Connect Live Destination</h3>
                  <p className="text-xs text-slate-400">YouTube Live or Facebook Live</p>
                </div>
              </div>
              <button
                onClick={() => setShowTokenModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setConnectTab('youtube_stream_key')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  connectTab === 'youtube_stream_key'
                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Youtube className="w-3.5 h-3.5" />
                <span>YouTube Live</span>
              </button>

              <button
                type="button"
                onClick={() => setConnectTab('facebook_stream_key')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  connectTab === 'facebook_stream_key'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Facebook Key</span>
              </button>

              <button
                type="button"
                onClick={() => setConnectTab('token')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  connectTab === 'token'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Page Token</span>
              </button>
            </div>

            {tokenError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{tokenError}</span>
              </div>
            )}

            {tokenSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{tokenSuccess}</span>
              </div>
            )}

            <form onSubmit={handleConnect} className="space-y-4">
              {connectTab === 'youtube_stream_key' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      YouTube Live Stream Key <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={streamKeyInput}
                      onChange={(e) => setStreamKeyInput(e.target.value)}
                      placeholder="e.g. abcd-1234-efgh-5678-ijkl"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-red-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      From YouTube Studio &gt; Go Live &gt; Stream Settings.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Channel / Destination Name
                    </label>
                    <input
                      type="text"
                      value={streamKeyName}
                      onChange={(e) => setStreamKeyName(e.target.value)}
                      placeholder="e.g. My YouTube Live Channel"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-red-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        YouTube Streaming Quality / Resolution
                      </label>
                      <select
                        value={youtubeResolution}
                        onChange={(e) => setYoutubeResolution(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-red-500 focus:outline-none"
                      >
                        <option value="144p">144p (256 × 144) — Ultra Low Bandwidth</option>
                        <option value="240p">240p (426 × 240) — Low Bandwidth</option>
                        <option value="360p">360p (640 × 360) — SD</option>
                        <option value="480p">480p (854 × 480) — Enhanced SD</option>
                        <option value="720p">720p HD (1280 × 720)</option>
                        <option value="1080p">1080p Full HD (1920 × 1080) — Recommended</option>
                        <option value="1440p">1440p QHD / 2K (2560 × 1440)</option>
                        <option value="2160p">2160p UHD / 4K (3840 × 2160) — Cinema 4K</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Output Frame Rate (FPS)
                      </label>
                      <select
                        value={youtubeFps}
                        onChange={(e) => setYoutubeFps(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-red-500 focus:outline-none"
                      >
                        <option value={30}>30 FPS (Standard / Stable)</option>
                        <option value={60}>60 FPS (Ultra Smooth Motion)</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div className="flex items-center justify-between font-mono text-slate-300">
                      <span>Dimensions: {
                        youtubeResolution === '144p' ? '256 × 144 (16:9)' :
                        youtubeResolution === '240p' ? '426 × 240 (16:9)' :
                        youtubeResolution === '360p' ? '640 × 360 (16:9)' :
                        youtubeResolution === '480p' ? '854 × 480 (16:9)' :
                        youtubeResolution === '720p' ? '1280 × 720 (16:9 HD)' :
                        youtubeResolution === '1080p' ? '1920 × 1080 (16:9 Full HD)' :
                        youtubeResolution === '1440p' ? '2560 × 1440 (16:9 2K QHD)' :
                        '3840 × 2160 (16:9 4K UHD)'
                      }</span>
                      <span className="text-red-400 font-semibold">{
                        youtubeResolution === '144p' ? (youtubeFps === 60 ? '600 Kbps CBR' : '400 Kbps CBR') :
                        youtubeResolution === '240p' ? (youtubeFps === 60 ? '900 Kbps CBR' : '600 Kbps CBR') :
                        youtubeResolution === '360p' ? (youtubeFps === 60 ? '1,500 Kbps CBR' : '1,000 Kbps CBR') :
                        youtubeResolution === '480p' ? (youtubeFps === 60 ? '2,500 Kbps CBR' : '1,500 Kbps CBR') :
                        youtubeResolution === '720p' ? (youtubeFps === 60 ? '4,000 Kbps CBR' : '2,500 Kbps CBR') :
                        youtubeResolution === '1080p' ? (youtubeFps === 60 ? '5,500–6,500 Kbps CBR' : '3,000–3,500 Kbps CBR') :
                        youtubeResolution === '1440p' ? (youtubeFps === 60 ? '16,000 Kbps CBR' : '10,000 Kbps CBR') :
                        (youtubeFps === 60 ? '38,000 Kbps CBR' : '25,000 Kbps CBR')
                      }</span>
                    </div>
                    {youtubeResolution === '144p' && (
                      <p className="text-amber-400 text-[10px]">
                        ⚠️ <em>Note: YouTube Live ingestion officially recommends 240p or higher. 144p is encoded via standard RTMP for ultra-constrained networks.</em>
                      </p>
                    )}
                    {(youtubeResolution === '1440p' || youtubeResolution === '2160p') && (
                      <p className="text-purple-300 text-[10px]">
                        🚀 <em>High Bandwidth: Streaming at {youtubeResolution === '2160p' ? '4K UHD' : '2K QHD'} requires a stable upload speed of at least 35+ Mbps and dedicated encoder hardware.</em>
                      </p>
                    )}
                  </div>
                </>
              ) : connectTab === 'facebook_stream_key' ? (
                <>
                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5 text-blue-300">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>Important Facebook Live Producer Settings:</span>
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px] leading-relaxed">
                      <li>In Facebook Live Producer, choose <b>Streaming software</b> (not Webcam).</li>
                      <li>Under <i>Stream software setup</i>, click <b>Advanced settings</b> and turn ON <b>Persistent stream key</b>.</li>
                      <li>Turn ON <b>Auto-start live video</b> so Facebook begins automatically.</li>
                      <li>Copy the <b>Stream key</b> and paste it below.</li>
                    </ol>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Facebook Live Stream Key <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={streamKeyInput}
                      onChange={(e) => setStreamKeyInput(e.target.value)}
                      placeholder="FB-1763375718142343-0-Ab77HlndsxyDssZ"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Destination Name
                    </label>
                    <input
                      type="text"
                      value={streamKeyName}
                      onChange={(e) => setStreamKeyName(e.target.value)}
                      placeholder="e.g. My Facebook Page Stream Key"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Page Access Token <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="EAA..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Page ID <span className="text-slate-500 text-[11px]">(Optional, auto-detected)</span>
                    </label>
                    <input
                      type="text"
                      value={pageIdInput}
                      onChange={(e) => setPageIdInput(e.target.value)}
                      placeholder="e.g. 102938475610293"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTokenModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingToken}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20"
                >
                  {isSubmittingToken ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  <span>{isSubmittingToken ? 'Connecting...' : 'Connect Destination'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacebookConnect;
