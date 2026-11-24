import React, { useState, useEffect } from 'react';
import { mediaAPI } from '../services/api';
import {
  Video,
  UploadCloud,
  Film,
  Image as ImageIcon,
  Trash2,
  Play,
  Volume2,
  VolumeX,
  Clock,
  HardDrive,
  Plus,
  Music,
  Headphones
} from 'lucide-react';

export const MediaLibrary = () => {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingSample, setIsCreatingSample] = useState(false);
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'VIDEO' | 'AUDIO' | 'IMAGE'
  const [previewMedia, setPreviewMedia] = useState(null);

  const fetchMedia = async () => {
    try {
      const res = await mediaAPI.getList();
      setMediaList(res.data.media || []);
    } catch (err) {
      console.error('Failed to load media:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      await mediaAPI.upload(formData);
      await fetchMedia();
      alert('✅ File uploaded and analyzed successfully!');
    } catch (err) {
      alert(`Upload failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleCreateSample = async (type) => {
    setIsCreatingSample(true);
    try {
      await mediaAPI.createSample(type);
      await fetchMedia();
      alert(`✅ Sample ${type} added to library!`);
    } catch (err) {
      alert(`Failed to create sample: ${err.message}`);
    } finally {
      setIsCreatingSample(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await mediaAPI.delete(id);
      await fetchMedia();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (sec) => {
    if (!sec) return 'Static';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  const filteredMedia = mediaList.filter((m) => {
    if (filterType === 'ALL') return true;
    return m.mediaType === filterType;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight">Media & Audio Library</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Upload and manage videos, MP3 backing tracks, and graphics for live streams.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleCreateSample('AUDIO')}
            disabled={isCreatingSample}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <Music className="w-4 h-4 text-purple-400" />
            <span>+ Sample MP3 Track</span>
          </button>
          <button
            onClick={() => handleCreateSample('VIDEO')}
            disabled={isCreatingSample}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <Film className="w-4 h-4 text-blue-400" />
            <span>+ Sample Video</span>
          </button>
          <button
            onClick={() => handleCreateSample('IMAGE')}
            disabled={isCreatingSample}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span>+ Sample Poster</span>
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="glass-panel p-8 rounded-2xl border-2 border-dashed border-slate-800 hover:border-blue-500/50 transition-colors text-center relative">
        <input
          type="file"
          accept="video/*,image/*,audio/*,.mp4,.mov,.mkv,.webm,.avi,.flv,.wmv,.m4v,.3gp,.mpeg,.mpg,.mpe,.m2v,.ts,.m2ts,.mts,.vob,.mp3,.wav,.m4a,.aac,.ogg,.flac,.wma,.jpg,.jpeg,.png,.webp"
          onChange={handleFileUpload}
          disabled={isUploading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="max-w-md mx-auto pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-3 text-blue-400">
            <UploadCloud className={`w-6 h-6 ${isUploading ? 'animate-bounce' : ''}`} />
          </div>
          <h3 className="font-bold text-sm text-slate-200">
            {isUploading ? 'Uploading & Analyzing File...' : 'Click to Upload Video, Audio Track, or Image'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Supports MP4, MPEG, MPG, MOV, MKV, MP3, WAV, AAC, M4A, FLAC, JPG, PNG
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold">
          {['ALL', 'AUDIO', 'VIDEO', 'IMAGE'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterType(tab)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                filterType === tab ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab === 'ALL' ? `All (${mediaList.length})` : `${tab}s (${mediaList.filter(m => m.mediaType === tab).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      <div className="space-y-4">
        {filteredMedia.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center border border-slate-800 text-slate-400">
            No files in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMedia.map((media) => {
              const isAudio = media.mediaType === 'AUDIO';
              const isVideo = media.mediaType === 'VIDEO';
              return (
                <div
                  key={media._id}
                  className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between hover:border-slate-700 transition-all group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          isAudio
                            ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                            : isVideo
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        {isAudio ? 'MP3 AUDIO' : media.mediaType}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {isAudio ? media.codec?.toUpperCase() || 'MP3' : `${media.width}x${media.height}`}
                      </span>
                    </div>

                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isAudio
                            ? 'bg-purple-500/10 text-purple-400'
                            : isVideo
                            ? 'bg-blue-500/10 text-blue-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {isAudio ? <Music className="w-5 h-5" /> : isVideo ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-200 text-sm truncate" title={media.originalName}>
                          {media.originalName}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            {formatDuration(media.durationSec)}
                          </span>
                          <span className="flex items-center gap-1">
                            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                            {formatBytes(media.fileSizeBytes)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">
                      {new Date(media.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => handleDelete(media._id)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors border border-slate-800"
                      title="Delete file"
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
    </div>
  );
};

export default MediaLibrary;
