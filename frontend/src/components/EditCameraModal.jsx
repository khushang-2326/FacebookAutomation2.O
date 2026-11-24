import React, { useState, useEffect } from 'react';
import { cameraAPI } from '../services/api';
import {
  Camera,
  Video,
  Edit2,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  MapPin,
  Wifi,
  Tag,
  Trash2
} from 'lucide-react';

/**
 * Universal Edit / Rename Camera Modal
 * Supports both CCTV (IP/RTSP) Cameras and Local DirectShow Webcams
 */
export const EditCameraModal = ({
  camera,
  isOpen,
  onClose,
  onSaved,
  onDeleted
}) => {
  if (!isOpen || !camera) return null;

  const isWebcam = Boolean(
    camera.isWebcam ||
    camera.cameraType === 'WEBCAM' ||
    camera.deviceName ||
    camera.sourceType === 'LOCAL_CAMERA'
  );

  const rawDevName = camera.deviceName || camera.name || 'Webcam';
  const initialName = isWebcam
    ? (camera.customName || camera.label || camera.displayName || camera.cameraName || rawDevName)
    : (camera.name || camera.cameraName || '');

  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(camera.location || '');
  const [ipAddress, setIpAddress] = useState(camera.ipAddress || '');
  const [port, setPort] = useState(camera.port || 554);
  const [streamPath, setStreamPath] = useState(camera.streamPath || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    setName(initialName);
    setLocation(camera.location || '');
    setIpAddress(camera.ipAddress || '');
    setPort(camera.port || 554);
    setStreamPath(camera.streamPath || '');
    setError(null);
    setSuccess(null);
    setIsConfirmingDelete(false);
    setIsDeleting(false);
  }, [camera, initialName]);

  const handleDelete = async () => {
    setIsDeleting(true);
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isWebcam) {
        // Reset/delete custom alias in database
        await cameraAPI.deleteWebcamAlias({ deviceName: rawDevName }).catch(() => {});
        setSuccess(`Webcam "${rawDevName}" reset / removed.`);
      } else {
        const camId = camera.id || camera._id || camera.cameraId;
        if (camId) {
          await cameraAPI.deleteCamera(camId);
        }
        setSuccess(`Camera "${name || 'Camera'}" deleted successfully.`);
      }

      setTimeout(() => {
        if (onDeleted) onDeleted(camera);
        if (onSaved) onSaved({ ...camera, _deleted: true });
        onClose();
      }, 700);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to delete camera.');
      setIsDeleting(false);
      setIsSubmitting(false);
      setIsConfirmingDelete(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !name.trim()) {
      setError('Camera name cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (isWebcam) {
        // Rename Webcam
        const res = await cameraAPI.renameWebcam({
          deviceName: rawDevName,
          customName: name.trim()
        });
        setSuccess(`Webcam renamed to "${name.trim()}"!`);
        setTimeout(() => {
          if (onSaved) onSaved({ ...camera, customName: name.trim(), displayName: name.trim(), name: name.trim(), cameraName: name.trim() });
          onClose();
        }, 800);
      } else {
        // Update CCTV / IP Camera
        const camId = camera.id || camera._id || camera.cameraId;
        const res = await cameraAPI.update(camId, {
          name: name.trim(),
          location: location.trim(),
          ipAddress: ipAddress ? ipAddress.trim() : undefined,
          port: port ? Number(port) : undefined,
          streamPath: streamPath ? streamPath.trim() : undefined
        });
        setSuccess(`Camera "${name.trim()}" updated successfully!`);
        setTimeout(() => {
          if (onSaved) onSaved(res.data.camera || { ...camera, name: name.trim(), cameraName: name.trim(), location: location.trim() });
          onClose();
        }, 800);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update camera.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isWebcam
                ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
              {isWebcam ? <Video className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{isWebcam ? 'Rename Webcam' : 'Edit IP / CCTV Camera'}</span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                  isWebcam
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {isWebcam ? 'Webcam' : 'CCTV'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isWebcam
                  ? 'Set a friendly custom label for this hardware webcam.'
                  : 'Update camera display name, location, and parameters.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Webcam original device name info banner */}
          {isWebcam && (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                <Tag className="w-3 h-3 text-indigo-400" />
                Hardware Device Name
              </span>
              <p className="text-xs font-mono font-bold text-slate-200 truncate">{rawDevName}</p>
            </div>
          )}

          {/* Camera Name Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Edit2 className="w-3.5 h-3.5 text-blue-400" />
              <span>{isWebcam ? 'Custom Webcam Display Name' : 'Camera Name'}</span>
              <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isWebcam ? 'e.g. Studio Front Webcam, Desk Cam #1' : 'e.g. Main Entrance CCTV, Cash Counter'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 text-slate-100 text-sm font-semibold placeholder:text-slate-600 focus:outline-none transition-all shadow-inner"
            />
          </div>

          {/* CCTV: Location Field */}
          {!isWebcam && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>Physical Location (Optional)</span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Reception Desk, Warehouse Gate 2"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 text-slate-100 text-sm placeholder:text-slate-600 focus:outline-none transition-all"
              />
            </div>
          )}

          {/* CCTV: Collapsible Advanced Network Details */}
          {!isWebcam && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Advanced Stream Settings</span>
                </span>
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showAdvanced && (
                <div className="p-3.5 mt-1 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[11px] text-slate-400">IP Address</label>
                      <input
                        type="text"
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400">RTSP Port</label>
                      <input
                        type="number"
                        value={port}
                        onChange={(e) => setPort(e.target.value)}
                        placeholder="554"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Stream Path</label>
                    <input
                      type="text"
                      value={streamPath}
                      onChange={(e) => setStreamPath(e.target.value)}
                      placeholder="/live/0/MAIN"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons: Delete on left, Cancel & Save on right */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800">
            <div>
              {isConfirmingDelete ? (
                <div className="flex items-center gap-2 animate-in fade-in duration-150">
                  <span className="text-[11px] font-bold text-rose-300">Delete this camera?</span>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-[11px] font-bold transition-all shadow-md shadow-rose-600/30 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <>
                        <RotateCw className="w-3 h-3 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3 h-3" />
                        <span>Yes, Delete</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingDelete(false)}
                    disabled={isSubmitting}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(true)}
                  disabled={isSubmitting}
                  className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-400 hover:text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                  title={isWebcam ? "Reset / remove this webcam" : "Delete camera from system"}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Camera</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold transition-all shadow-lg shadow-blue-600/30 flex items-center gap-2 disabled:opacity-50"
              >
                {isSubmitting && !isDeleting ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditCameraModal;
