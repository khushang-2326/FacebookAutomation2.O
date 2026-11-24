import React, { useState, useEffect } from 'react';
import { facebookAPI, mediaAPI, cameraAPI, systemAPI, automationAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import {
  X,
  Share2,
  Video,
  Clock,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Zap,
  Calendar,
  Layers,
  RefreshCw,
  Camera,
  Youtube,
  Mic,
  Music,
  Sparkles,
  VolumeX,
  Radio,
  Globe,
  Sliders,
  Check,
  ListMusic,
  GripVertical,
  Trash2,
  Repeat,
  Plus,
  Edit2,
  Copy,
  Filter
} from 'lucide-react';
import EditCameraModal from './EditCameraModal';
import ScheduleDurationInput from './ScheduleDurationInput';

const userDetectedTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch (e) {
    return 'Asia/Kolkata';
  }
})();

const ALL_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST +05:30 — India)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT — US Eastern)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT — US Central)' },
  { value: 'America/Denver', label: 'America/Denver (MST/MDT — US Mountain)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT — US Pacific)' },
  { value: 'America/Anchorage', label: 'America/Anchorage (AKST/AKDT — Alaska)' },
  { value: 'Pacific/Honolulu', label: 'Pacific/Honolulu (HST — Hawaii)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT — Brazil)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST — UK / London)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST — France / Central Europe)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST — Germany)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (MSK — Moscow)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST +04:00 — UAE / Dubai)' },
  { value: 'Asia/Karachi', label: 'Asia/Karachi (PKT +05:00 — Pakistan)' },
  { value: 'Asia/Dhaka', label: 'Asia/Dhaka (BST +06:00 — Bangladesh)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT +07:00 — Thailand / Vietnam)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT +08:00 — Singapore)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (HKT +08:00 — Hong Kong)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (CST +08:00 — China)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST +09:00 — Japan)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT — Sydney / Australia)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (NZST/NZDT — New Zealand)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
];

const TIMEZONE_OPTIONS = ALL_TIMEZONES.some(t => t.value === userDetectedTz)
  ? ALL_TIMEZONES
  : [{ value: userDetectedTz, label: `${userDetectedTz} (Local Browser Default)` }, ...ALL_TIMEZONES];

const formatDurationText = (sec) => {
  if (!sec || sec <= 0) return '0 minutes';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs} hr${hrs > 1 ? 's' : ''}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? 's' : ''}`);
  if (secs > 0) parts.push(`${secs} sec`);
  return parts.length > 0 ? parts.join(' ') : '0 minutes';
};

const formatDurationLabel = (sec) => {
  if (!sec || sec <= 0) return '24/7';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.round((sec % 3600) / 60);
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  if (mins > 0) return `${mins}m`;
  return `${sec}s`;
};

const DURATION_PRESETS = [
  { id: '1h', label: '1h' },
  { id: '2h', label: '2h' },
  { id: '5h', label: '5h' },
  { id: '10h', label: '10h' },
  { id: '24h', label: '24h' },
  { id: 'custom_hours', label: '⏱️ Custom' },
  { id: 'indefinite', label: '24/7 Forever' },
];

export const EditAutomationModal = ({ isOpen, onClose, automation, onSaved }) => {
  if (!isOpen || !automation) return null;

  // Form State initialized from automation
  const [name, setName] = useState(automation.name || '');
  const [title, setTitle] = useState(automation.title || '');
  const [description, setDescription] = useState(automation.description || '');

  // Destination state
  const [selectedPageIds, setSelectedPageIds] = useState(() => {
    if (Array.isArray(automation.targetPageIds) && automation.targetPageIds.length > 0) {
      return automation.targetPageIds.map(p => typeof p === 'object' ? p._id || p.id : p);
    }
    if (automation.facebookPageId) {
      const id = typeof automation.facebookPageId === 'object' ? automation.facebookPageId._id || automation.facebookPageId.id : automation.facebookPageId;
      return id ? [id] : [];
    }
    return [];
  });
  const [destinationPlatform, setDestinationPlatform] = useState(automation.destinationPlatform || 'FACEBOOK');
  const [youtubeStreamKey, setYoutubeStreamKey] = useState(automation.youtubeStreamKey || '');

  // Live Camera Switching State
  const isLive = automation.status === 'LIVE' || automation.status === 'ACTIVE' || automation.status === 'STREAMING';
  const { socket } = useSocket();
  const [switchingCameraSlotIndex, setSwitchingCameraSlotIndex] = useState(null);
  const [switchCameraError, setSwitchCameraError] = useState(null);
  const [liveStreamingSlotIndex, setLiveStreamingSlotIndex] = useState(automation.currentCameraSlotIndex ?? 0);
  const [liveStreamStartedAt, setLiveStreamStartedAt] = useState(
    automation.cameraStreamStartedAt ? new Date(automation.cameraStreamStartedAt).getTime() : Date.now()
  );
  const [liveSlotRemainingSec, setLiveSlotRemainingSec] = useState(0);

  const [switchingMediaSlotIndex, setSwitchingMediaSlotIndex] = useState(null);
  const [liveStreamingMediaSlotIndex, setLiveStreamingMediaSlotIndex] = useState(automation.currentMediaSlotIndex ?? 0);
  const [liveMediaStreamStartedAt, setLiveMediaStreamStartedAt] = useState(
    automation.mediaStreamStartedAt ? new Date(automation.mediaStreamStartedAt).getTime() : Date.now()
  );
  const [liveMediaSlotRemainingSec, setLiveMediaSlotRemainingSec] = useState(0);

  const [switchingYoutubeSlotIndex, setSwitchingYoutubeSlotIndex] = useState(null);
  const [liveStreamingYoutubeSlotIndex, setLiveStreamingYoutubeSlotIndex] = useState(automation.currentYoutubeSlotIndex ?? 0);
  const [liveYoutubeStreamStartedAt, setLiveYoutubeStreamStartedAt] = useState(
    automation.youtubeStreamStartedAt ? new Date(automation.youtubeStreamStartedAt).getTime() : Date.now()
  );
  const [liveYoutubeSlotRemainingSec, setLiveYoutubeSlotRemainingSec] = useState(0);

  // Video Source state
  const [sourceType, setSourceType] = useState(automation.sourceType || 'VIDEO_FILE');
  const [selectedMediaId, setSelectedMediaId] = useState(() => {
    return typeof automation.mediaId === 'object' ? automation.mediaId?._id : automation.mediaId || '';
  });
  const [mediaSchedules, setMediaSchedules] = useState(() => {
    if (Array.isArray(automation.mediaSchedules) && automation.mediaSchedules.length > 0) {
      return automation.mediaSchedules.map((s, idx) => {
        const mId = typeof s.mediaId === 'object' && s.mediaId !== null ? String(s.mediaId._id || s.mediaId.id) : String(s.mediaId || '');
        return {
          scheduleId: s._id ? String(s._id) : `media_slot_${idx}_${Date.now()}`,
          mediaId: mId,
          title: s.title || (typeof s.mediaId === 'object' ? s.mediaId.originalName : '') || `Clip #${idx + 1}`,
          durationSeconds: s.durationSeconds || (typeof s.mediaId === 'object' && s.mediaId.durationSec ? Math.round(s.mediaId.durationSec) : 30),
          order: s.order !== undefined ? s.order : idx,
        };
      }).filter(s => s.mediaId);
    }
    const mId = typeof automation.mediaId === 'object' && automation.mediaId !== null ? String(automation.mediaId._id || automation.mediaId.id) : String(automation.mediaId || '');
    if (mId) {
      return [{
        scheduleId: `media_slot_0_${Date.now()}`,
        mediaId: mId,
        title: (typeof automation.mediaId === 'object' ? automation.mediaId.originalName : '') || 'Media Clip',
        durationSeconds: (typeof automation.mediaId === 'object' && automation.mediaId.durationSec ? Math.round(automation.mediaId.durationSec) : 30),
        order: 0
      }];
    }
    return [];
  });
  const [draggedMediaIndex, setDraggedMediaIndex] = useState(null);
  const [dragOverMediaIndex, setDragOverMediaIndex] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState(() => {
    return typeof automation.cameraId === 'object' ? automation.cameraId?._id : automation.cameraId || '';
  });
  const [cameraSchedules, setCameraSchedules] = useState(() => {
    if (Array.isArray(automation.cameraSchedules) && automation.cameraSchedules.length > 0) {
      return automation.cameraSchedules.map((s, idx) => {
        const isWebcam = s.cameraType === 'WEBCAM' || Boolean(s.deviceName);
        return {
          scheduleId: s._id ? String(s._id) : `slot_${idx}_${Date.now()}`,
          cameraType: isWebcam ? 'WEBCAM' : 'RTSP',
          cameraId: !isWebcam && typeof s.cameraId === 'object' && s.cameraId !== null ? String(s.cameraId._id || s.cameraId.id) : (s.cameraId ? String(s.cameraId) : null),
          deviceName: isWebcam ? (s.deviceName || automation.localCameraDevice) : null,
          cameraName: s.cameraName || (isWebcam ? (s.deviceName || 'Webcam') : 'CCTV Camera'),
          durationSeconds: s.durationSeconds || 20,
          order: s.order !== undefined ? s.order : idx,
        };
      }).filter(s => (s.cameraType === 'WEBCAM' && s.deviceName) || (s.cameraType === 'RTSP' && s.cameraId));
    }
    const cId = typeof automation.cameraId === 'object' && automation.cameraId !== null ? String(automation.cameraId._id || automation.cameraId.id) : String(automation.cameraId || '');
    if (cId) {
      return [{ scheduleId: `slot_0_${Date.now()}`, cameraType: 'RTSP', cameraId: cId, durationSeconds: 20, order: 0 }];
    }
    if (automation.localCameraDevice) {
      return [{ scheduleId: `slot_0_${Date.now()}`, cameraType: 'WEBCAM', deviceName: automation.localCameraDevice, cameraName: automation.localCameraDevice, durationSeconds: 20, order: 0 }];
    }
    return [];
  });

  const [editingCameraTarget, setEditingCameraTarget] = useState(null);

  const handleCameraDeleted = (deletedCam) => {
    // Reload cameras
    cameraAPI.getList().then(res => setCameras(res.data.cameras || [])).catch(() => {});
    // Reload webcams
    loadDevices();

    // Remove deleted camera from sequence playlist
    setCameraSchedules((prev) => {
      const next = prev.filter((slot) => {
        const isW = slot.cameraType === 'WEBCAM' || Boolean(slot.deviceName);
        if (isW && deletedCam.deviceName && slot.deviceName === deletedCam.deviceName) {
          return false;
        }
        if (!isW && (deletedCam._id || deletedCam.id) && String(slot.cameraId) === String(deletedCam._id || deletedCam.id)) {
          return false;
        }
        return true;
      });
      const remW = next.find(s => s.cameraType === 'WEBCAM');
      setLocalCameraDevice(remW ? remW.deviceName : '');
      const remR = next.find(s => s.cameraType !== 'WEBCAM');
      setSelectedCameraId(remR ? remR.cameraId : '');
      return next;
    });
  };

  const handleCameraSaved = (saved) => {
    if (saved && saved._deleted) {
      handleCameraDeleted(saved);
      return;
    }
    // Reload cameras
    cameraAPI.getList().then(res => setCameras(res.data.cameras || [])).catch(() => {});
    // Reload webcams
    loadDevices();

    // Propagate updated name across local camera sequence playlist
    setCameraSchedules((prev) =>
      prev.map((slot) => {
        const isW = slot.cameraType === 'WEBCAM' || Boolean(slot.deviceName);
        if (isW && saved.deviceName && slot.deviceName === saved.deviceName) {
          const newName = saved.customName || saved.displayName || saved.name;
          return { ...slot, cameraName: newName };
        }
        if (!isW && (saved._id || saved.id) && String(slot.cameraId) === String(saved._id || saved.id)) {
          return { ...slot, cameraName: saved.name };
        }
        return slot;
      })
    );
  };

  const handleAddCameraSchedule = (camItem) => {
    const isW = camItem.cameraType === 'WEBCAM' || Boolean(camItem.deviceName);
    const key = isW ? String(camItem.deviceName) : String(camItem.cameraId || camItem._id || camItem.id);
    const uniqueSlotId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newItem = {
      scheduleId: uniqueSlotId,
      cameraType: isW ? 'WEBCAM' : 'RTSP',
      cameraId: isW ? null : key,
      deviceName: isW ? key : null,
      cameraName: camItem.name || camItem.label || camItem.cameraName || (isW ? key : 'Camera'),
      durationSeconds: 20
    };

    setCameraSchedules((prev) => {
      const next = [...prev, newItem];
      if (isW && !localCameraDevice) setLocalCameraDevice(key);
      if (!isW && !selectedCameraId) setSelectedCameraId(key);
      return next;
    });
  };

  const handleRemoveCameraScheduleAt = (index) => {
    setCameraSchedules((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      const remW = next.find(s => s.cameraType === 'WEBCAM');
      setLocalCameraDevice(remW ? remW.deviceName : '');
      const remR = next.find(s => s.cameraType !== 'WEBCAM');
      setSelectedCameraId(remR ? remR.cameraId : '');
      return next;
    });
  };

  const handleToggleCameraSchedule = (camItem) => {
    handleAddCameraSchedule(camItem);
  };

  const handleUpdateCameraDuration = (index, seconds) => {
    const val = typeof seconds === 'number' ? seconds : (parseInt(seconds, 10) || 20);
    setCameraSchedules((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, durationSeconds: Math.max(1, val) }
          : item
      )
    );
  };

  const getCameraScheduleOccurrences = (type, key) => {
    const positions = [];
    cameraSchedules.forEach((item, idx) => {
      if (type === 'WEBCAM') {
        if ((item.cameraType === 'WEBCAM' || item.deviceName) && String(item.deviceName) === String(key)) {
          positions.push(idx + 1);
        }
      } else {
        if ((item.cameraType === 'RTSP' || !item.cameraType) && String(item.cameraId) === String(key)) {
          positions.push(idx + 1);
        }
      }
    });
    return positions;
  };

  const getCameraScheduleIndex = (type, key) => {
    return cameraSchedules.findIndex((item) => {
      if (type === 'WEBCAM') {
        return (item.cameraType === 'WEBCAM' || item.deviceName) && String(item.deviceName) === String(key);
      }
      return (item.cameraType === 'RTSP' || !item.cameraType) && String(item.cameraId) === String(key);
    });
  };

  // Drag and Drop Camera Schedule Reordering State
  const [draggedCameraIndex, setDraggedCameraIndex] = useState(null);
  const [dragOverCameraIndex, setDragOverCameraIndex] = useState(null);

  const handleCameraDragStart = (e, index) => {
    setDraggedCameraIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCameraDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCameraIndex !== index) {
      setDragOverCameraIndex(index);
    }
  };

  const handleCameraDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedCameraIndex === null || draggedCameraIndex === targetIndex) {
      setDraggedCameraIndex(null);
      setDragOverCameraIndex(null);
      return;
    }
    setCameraSchedules((prev) => {
      const next = [...prev];
      const [movedItem] = next.splice(draggedCameraIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
    setDraggedCameraIndex(null);
    setDragOverCameraIndex(null);
  };

  const handleCameraDragEnd = () => {
    setDraggedCameraIndex(null);
    setDragOverCameraIndex(null);
  };

  // Live Camera Active Slot Synchronization & Real-Time Countdown
  useEffect(() => {
    if (!socket || !automation?._id) return;
    const handleSwitched = (data) => {
      if (String(data.automationId) === String(automation._id)) {
        setLiveStreamingSlotIndex(data.activeSlotIndex);
        setLiveStreamStartedAt(data.cameraStreamStartedAt ? new Date(data.cameraStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('camera:active_switched', handleSwitched);
    return () => socket.off('camera:active_switched', handleSwitched);
  }, [socket, automation?._id]);

  useEffect(() => {
    if (!isLive || cameraSchedules.length === 0) return;
    const currentSlot = cameraSchedules[liveStreamingSlotIndex] || cameraSchedules[0];
    const slotDuration = Math.max(1, parseInt(currentSlot?.durationSeconds, 10) || 20);

    const updateTimer = () => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - liveStreamStartedAt) / 1000));
      const left = Math.max(0, slotDuration - elapsedSec);
      setLiveSlotRemainingSec(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isLive, cameraSchedules, liveStreamStartedAt, liveStreamingSlotIndex]);

  const handleInstantSwitchCameraSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!automation?._id) return;
    setSwitchingCameraSlotIndex(slotIdx);
    setSwitchCameraError(null);
    try {
      const res = await automationAPI.switchCamera(automation._id, slotIdx);
      if (res.data?.success) {
        setLiveStreamingSlotIndex(slotIdx);
        setLiveStreamStartedAt(Date.now());
        setLiveSlotRemainingSec(res.data.durationSeconds || cameraSchedules[slotIdx]?.durationSeconds || 20);
      } else {
        const errMsg = res.data?.error || res.data?.reason || 'Failed to switch camera stream';
        setSwitchCameraError(errMsg);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.reason || err.message || 'Failed to switch camera stream';
      console.warn('Camera switch error:', errMsg);
      setSwitchCameraError(errMsg);
      // Retain previous active slot, timer, and state on failure
    } finally {
      setSwitchingCameraSlotIndex(null);
    }
  };

  // Live Media Slot Synchronization & Real-Time Countdown
  useEffect(() => {
    if (!socket || !automation?._id) return;
    const handleMediaSwitched = (data) => {
      if (String(data.automationId) === String(automation._id)) {
        setLiveStreamingMediaSlotIndex(data.activeSlotIndex);
        setLiveMediaStreamStartedAt(data.mediaStreamStartedAt ? new Date(data.mediaStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('media:active_switched', handleMediaSwitched);
    return () => socket.off('media:active_switched', handleMediaSwitched);
  }, [socket, automation?._id]);

  useEffect(() => {
    if (!isLive || mediaSchedules.length === 0) return;
    const currentSlot = mediaSchedules[liveStreamingMediaSlotIndex] || mediaSchedules[0];
    const slotDuration = Math.max(1, parseInt(currentSlot?.durationSeconds, 10) || 30);

    const updateTimer = () => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - liveMediaStreamStartedAt) / 1000));
      const left = Math.max(0, slotDuration - elapsedSec);
      setLiveMediaSlotRemainingSec(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isLive, mediaSchedules, liveMediaStreamStartedAt, liveStreamingMediaSlotIndex]);

  const handleInstantSwitchMediaSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!automation?._id) return;
    setSwitchingMediaSlotIndex(slotIdx);
    try {
      const res = await automationAPI.switchMedia(automation._id, slotIdx);
      if (res.data?.success) {
        setLiveStreamingMediaSlotIndex(slotIdx);
        setLiveMediaStreamStartedAt(Date.now());
        setLiveMediaSlotRemainingSec(res.data.durationSeconds || mediaSchedules[slotIdx]?.durationSeconds || 30);
      } else {
        console.warn('Media switch error:', res.data?.error || 'Failed to switch media');
      }
    } catch (err) {
      console.warn('Media switch error:', err.response?.data?.error || err.message);
      // Retain previous active slot on failure
    } finally {
      setSwitchingMediaSlotIndex(null);
    }
  };

  // Live YouTube Slot Synchronization & Real-Time Countdown
  useEffect(() => {
    if (!socket || !automation?._id) return;
    const handleYtSwitched = (data) => {
      if (String(data.automationId) === String(automation._id)) {
        setLiveStreamingYoutubeSlotIndex(data.activeSlotIndex);
        setLiveYoutubeStreamStartedAt(data.youtubeStreamStartedAt ? new Date(data.youtubeStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('youtube:active_switched', handleYtSwitched);
    return () => socket.off('youtube:active_switched', handleYtSwitched);
  }, [socket, automation?._id]);

  useEffect(() => {
    if (!isLive || youtubeSchedules.length === 0) return;
    const currentSlot = youtubeSchedules[liveStreamingYoutubeSlotIndex] || youtubeSchedules[0];
    const slotDuration = Math.max(1, parseInt(currentSlot?.durationSeconds, 10) || 30);

    const updateTimer = () => {
      const now = Date.now();
      const elapsedSec = Math.max(0, Math.floor((now - liveYoutubeStreamStartedAt) / 1000));
      const left = Math.max(0, slotDuration - elapsedSec);
      setLiveYoutubeSlotRemainingSec(left);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [isLive, youtubeSchedules, liveYoutubeStreamStartedAt, liveStreamingYoutubeSlotIndex]);

  const handleInstantSwitchYoutubeSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!automation?._id) return;
    setSwitchingYoutubeSlotIndex(slotIdx);
    try {
      const res = await automationAPI.switchYouTube(automation._id, slotIdx);
      if (res.data?.success) {
        setLiveStreamingYoutubeSlotIndex(slotIdx);
        setLiveYoutubeStreamStartedAt(Date.now());
        setLiveYoutubeSlotRemainingSec(res.data.durationSeconds || youtubeSchedules[slotIdx]?.durationSeconds || 30);
      } else {
        console.warn('YouTube switch error:', res.data?.error || 'Failed to switch YouTube video');
      }
    } catch (err) {
      console.warn('YouTube switch error:', err.response?.data?.error || err.message);
      // Retain previous active slot on failure
    } finally {
      setSwitchingYoutubeSlotIndex(null);
    }
  };

  const [localCameraDevice, setLocalCameraDevice] = useState(automation.localCameraDevice || '');
  const [youtubeUrl, setYoutubeUrl] = useState(automation.youtubeUrl || '');
  const [youtubeSchedules, setYoutubeSchedules] = useState(() => {
    if (Array.isArray(automation.youtubeSchedules) && automation.youtubeSchedules.length > 0) {
      return automation.youtubeSchedules.map((s, idx) => ({
        scheduleId: s._id ? String(s._id) : `yt_slot_${idx}_${Date.now()}`,
        youtubeUrl: s.youtubeUrl,
        title: s.title || `YouTube Video #${idx + 1}`,
        durationSeconds: s.durationSeconds || 30,
        order: s.order !== undefined ? s.order : idx,
      }));
    }
    if (automation.youtubeUrl) {
      return [{
        scheduleId: `yt_slot_0_${Date.now()}`,
        youtubeUrl: automation.youtubeUrl,
        title: 'YouTube Video',
        durationSeconds: 30,
        order: 0
      }];
    }
    return [];
  });
  const [newYoutubeInputUrl, setNewYoutubeInputUrl] = useState('');
  const [newYoutubeInputTitle, setNewYoutubeInputTitle] = useState('');
  const [newYoutubeInputDuration, setNewYoutubeInputDuration] = useState(30);
  const [draggedYoutubeIndex, setDraggedYoutubeIndex] = useState(null);
  const [dragOverYoutubeIndex, setDragOverYoutubeIndex] = useState(null);

  const handleAddYoutubeSchedule = (urlToAdd, titleToAdd, durationSec = 30) => {
    const rawUrl = (urlToAdd || newYoutubeInputUrl || '').trim();
    if (!rawUrl) return;
    const dur = Math.max(1, parseInt(durationSec || newYoutubeInputDuration, 10) || 30);
    const uniqueSlotId = `yt_slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let inferredTitle = (titleToAdd || newYoutubeInputTitle || '').trim();
    if (!inferredTitle) {
      try {
        const u = new URL(rawUrl);
        const v = u.searchParams.get('v');
        inferredTitle = v ? `YouTube (${v})` : 'YouTube Video';
      } catch (_) {
        inferredTitle = 'YouTube Video';
      }
    }

    const newItem = {
      scheduleId: uniqueSlotId,
      youtubeUrl: rawUrl,
      title: inferredTitle,
      durationSeconds: dur
    };

    setYoutubeSchedules((prev) => {
      const next = [...prev, newItem];
      if (!youtubeUrl) setYoutubeUrl(rawUrl);
      return next;
    });

    setNewYoutubeInputUrl('');
    setNewYoutubeInputTitle('');
    setNewYoutubeInputDuration(30);
  };

  const handleDuplicateYoutubeSchedule = (item) => {
    const uniqueSlotId = `yt_slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItem = {
      scheduleId: uniqueSlotId,
      youtubeUrl: item.youtubeUrl,
      title: item.title,
      durationSeconds: item.durationSeconds || 30
    };
    setYoutubeSchedules((prev) => [...prev, newItem]);
  };

  const handleRemoveYoutubeScheduleAt = (index) => {
    setYoutubeSchedules((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length > 0) {
        setYoutubeUrl(next[0].youtubeUrl);
      } else {
        setYoutubeUrl('');
      }
      return next;
    });
  };

  const handleUpdateYoutubeDuration = (index, seconds) => {
    const val = parseInt(seconds, 10);
    setYoutubeSchedules((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, durationSeconds: isNaN(val) ? '' : Math.max(1, val) } : item
      )
    );
  };

  const handleYoutubeDragStart = (e, index) => {
    setDraggedYoutubeIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
  };

  const handleYoutubeDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverYoutubeIndex !== index) {
      setDragOverYoutubeIndex(index);
    }
  };

  const handleYoutubeDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedYoutubeIndex === null || draggedYoutubeIndex === targetIndex) {
      setDraggedYoutubeIndex(null);
      setDragOverYoutubeIndex(null);
      return;
    }
    setYoutubeSchedules((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedYoutubeIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });
    setDraggedYoutubeIndex(null);
    setDragOverYoutubeIndex(null);
  };

  const handleYoutubeDragEnd = () => {
    setDraggedYoutubeIndex(null);
    setDragOverYoutubeIndex(null);
  };

  // Multi-Media (Video / Image) Playlist & Scheduling Helpers
  const handleAddMediaSchedule = (mediaItem, defaultDuration) => {
    if (!mediaItem) return;
    const mId = String(mediaItem._id || mediaItem.id);
    const uniqueSlotId = `media_slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isImage = mediaItem.mediaType === 'IMAGE' || /\.(jpe?g|png|webp|bmp|gif)$/i.test(mediaItem.filename || mediaItem.originalName || '');
    const fallbackDur = isImage ? 15 : (mediaItem.durationSec ? Math.round(mediaItem.durationSec) : 30);
    const dur = defaultDuration || fallbackDur;

    const newItem = {
      scheduleId: uniqueSlotId,
      mediaId: mId,
      title: mediaItem.originalName || mediaItem.filename || 'Media Clip',
      durationSeconds: Math.max(1, dur)
    };

    setMediaSchedules((prev) => {
      const next = [...prev, newItem];
      if (!selectedMediaId) setSelectedMediaId(mId);
      return next;
    });
  };

  const handleDuplicateMediaSchedule = (item) => {
    const uniqueSlotId = `media_slot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newItem = {
      scheduleId: uniqueSlotId,
      mediaId: item.mediaId,
      title: item.title,
      durationSeconds: item.durationSeconds || 30
    };
    setMediaSchedules((prev) => [...prev, newItem]);
  };

  const handleRemoveMediaScheduleAt = (index) => {
    setMediaSchedules((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length > 0) {
        setSelectedMediaId(next[0].mediaId);
      } else {
        setSelectedMediaId('');
      }
      return next;
    });
  };

  const handleUpdateMediaDuration = (index, seconds) => {
    const val = parseInt(seconds, 10);
    setMediaSchedules((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, durationSeconds: isNaN(val) ? '' : Math.max(1, val) } : item
      )
    );
  };

  const getMediaScheduleOccurrences = (mediaId) => {
    const positions = [];
    mediaSchedules.forEach((item, idx) => {
      if (String(item.mediaId) === String(mediaId)) {
        positions.push(idx + 1);
      }
    });
    return positions;
  };

  const handleMediaDragStart = (e, index) => {
    setDraggedMediaIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
  };

  const handleMediaDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverMediaIndex !== index) {
      setDragOverMediaIndex(index);
    }
  };

  const handleMediaDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedMediaIndex === null || draggedMediaIndex === targetIndex) {
      setDraggedMediaIndex(null);
      setDragOverMediaIndex(null);
      return;
    }
    setMediaSchedules((prev) => {
      const updated = [...prev];
      const [movedItem] = updated.splice(draggedMediaIndex, 1);
      updated.splice(targetIndex, 0, movedItem);
      return updated;
    });
    setDraggedMediaIndex(null);
    setDragOverMediaIndex(null);
  };

  const handleMediaDragEnd = () => {
    setDraggedMediaIndex(null);
    setDragOverMediaIndex(null);
  };

  const [loopVideo, setLoopVideo] = useState(automation.loopVideo !== false);
  const [fps, setFps] = useState(automation.fps === 60 ? 60 : 30);
  const [youtubeResolution, setYoutubeResolution] = useState(automation.youtubeResolution || '1080p');
  const [youtubeFps, setYoutubeFps] = useState(automation.youtubeFps || 30);

  // Audio Source state
  const [audioSourceType, setAudioSourceType] = useState(automation.audioSourceType || 'CAMERA_AUDIO');
  const [selectedAudioMediaId, setSelectedAudioMediaId] = useState(() => {
    return typeof automation.audioMediaId === 'object' ? automation.audioMediaId?._id : automation.audioMediaId || '';
  });
  const [selectedAudioMediaIds, setSelectedAudioMediaIds] = useState(() => {
    if (Array.isArray(automation.audioMediaIds) && automation.audioMediaIds.length > 0) {
      return automation.audioMediaIds.map(a => typeof a === 'object' && a !== null ? String(a._id || a.id) : String(a)).filter(Boolean);
    }
    if (automation.audioMediaId) {
      const aId = typeof automation.audioMediaId === 'object' && automation.audioMediaId !== null ? String(automation.audioMediaId._id || automation.audioMediaId.id) : String(automation.audioMediaId);
      return aId ? [aId] : [];
    }
    return [];
  });
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(automation.audioDeviceName || 'Microphone Array (Realtek(R) Audio)');
  const [micVolume, setMicVolume] = useState(automation.micVolume !== undefined ? automation.micVolume : 1.0);
  const [audioTrackVolume, setAudioTrackVolume] = useState(automation.audioTrackVolume !== undefined ? automation.audioTrackVolume : 0.8);
  const [loopAudio, setLoopAudio] = useState(automation.loopAudio !== false);

  const toggleTrackInPlaylist = (trackId) => {
    const sId = String(trackId);
    setSelectedAudioMediaIds((prev) => {
      let next;
      if (prev.includes(sId)) {
        next = prev.filter((id) => id !== sId);
      } else {
        next = [...prev, sId];
      }
      setSelectedAudioMediaId(next[0] || '');
      return next;
    });
  };

  // Drag and Drop Playlist Reordering State
  const [draggedAudioIndex, setDraggedAudioIndex] = useState(null);
  const [dragOverAudioIndex, setDragOverAudioIndex] = useState(null);

  const handleAudioDragStart = (e, index) => {
    setDraggedAudioIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleAudioDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverAudioIndex !== index) {
      setDragOverAudioIndex(index);
    }
  };

  const handleAudioDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedAudioIndex === null || draggedAudioIndex === targetIndex) {
      setDraggedAudioIndex(null);
      setDragOverAudioIndex(null);
      return;
    }
    setSelectedAudioMediaIds((prev) => {
      const next = [...prev];
      const [movedItem] = next.splice(draggedAudioIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      setSelectedAudioMediaId(next[0] || '');
      return next;
    });
    setDraggedAudioIndex(null);
    setDragOverAudioIndex(null);
  };

  const handleAudioDragEnd = () => {
    setDraggedAudioIndex(null);
    setDragOverAudioIndex(null);
  };

  const moveTrackUp = (index) => {
    if (index <= 0) return;
    setSelectedAudioMediaIds((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      setSelectedAudioMediaId(next[0] || '');
      return next;
    });
  };

  const moveTrackDown = (index) => {
    setSelectedAudioMediaIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      setSelectedAudioMediaId(next[0] || '');
      return next;
    });
  };

  const removeTrackFromPlaylist = (trackId) => {
    const sId = String(trackId);
    setSelectedAudioMediaIds((prev) => {
      const next = prev.filter((id) => id !== sId);
      setSelectedAudioMediaId(next[0] || '');
      return next;
    });
  };

  // Schedule & Timezone state
  const [timezone, setTimezone] = useState(automation.timezone || userDetectedTz);
  const [scheduleMode, setScheduleMode] = useState(automation.scheduleMode || 'IMMEDIATE');
  const [rotationDurationSec, setRotationDurationSec] = useState(automation.rotationDurationSec || 18000);
  const [startDate, setStartDate] = useState(automation.startDate ? automation.startDate.split('T')[0] : '');
  const [endDate, setEndDate] = useState(automation.endDate ? automation.endDate.split('T')[0] : '');
  const [daysOfWeek, setDaysOfWeek] = useState(automation.daysOfWeek || [1, 2, 3, 4, 5]);
  const [dailyStartTime, setDailyStartTime] = useState(automation.dailyStartTime || '09:00');
  const [dailyEndTime, setDailyEndTime] = useState(automation.dailyEndTime || '17:00');

  // Target Duration state
  const [durationPreset, setDurationPreset] = useState(() => {
    if (automation.completionMode === 'INDEFINITE') return 'indefinite';
    const totalSec = automation.totalDurationSec || (automation.totalDurationHours ? Math.round(automation.totalDurationHours * 3600) : 0);
    if (totalSec === 3600) return '1h';
    if (totalSec === 7200) return '2h';
    if (totalSec === 18000) return '5h';
    if (totalSec === 36000) return '10h';
    if (totalSec === 86400) return '24h';
    if (totalSec > 0) return 'custom_hours';
    return '5h';
  });

  const [customHours, setCustomHours] = useState(() => {
    const totalSec = automation.totalDurationSec || (automation.totalDurationHours ? Math.round(automation.totalDurationHours * 3600) : 0);
    return totalSec > 0 ? Math.floor(totalSec / 3600) : 0;
  });

  const [customMinutes, setCustomMinutes] = useState(() => {
    const totalSec = automation.totalDurationSec || (automation.totalDurationHours ? Math.round(automation.totalDurationHours * 3600) : 0);
    return totalSec > 0 ? Math.round((totalSec % 3600) / 60) : 15;
  });

  let calculatedDurationSec = null;
  let calculatedDurationHours = null;
  if (durationPreset === '1h') {
    calculatedDurationSec = 3600;
    calculatedDurationHours = 1;
  } else if (durationPreset === '2h') {
    calculatedDurationSec = 7200;
    calculatedDurationHours = 2;
  } else if (durationPreset === '5h') {
    calculatedDurationSec = 18000;
    calculatedDurationHours = 5;
  } else if (durationPreset === '10h') {
    calculatedDurationSec = 36000;
    calculatedDurationHours = 10;
  } else if (durationPreset === '24h') {
    calculatedDurationSec = 86400;
    calculatedDurationHours = 24;
  } else if (durationPreset === 'custom_hours') {
    const totalSec = (Number(customHours) || 0) * 3600 + (Number(customMinutes) || 0) * 60;
    calculatedDurationSec = totalSec > 0 ? totalSec : 60;
    calculatedDurationHours = parseFloat((calculatedDurationSec / 3600).toFixed(4));
  } else if (durationPreset === 'indefinite') {
    calculatedDurationSec = null;
    calculatedDurationHours = null;
  }

  // Loaded Options
  const [pages, setPages] = useState([]);
  const [destinationFilter, setDestinationFilter] = useState('ALL'); // 'ALL' | 'FACEBOOK' | 'YOUTUBE' | 'OTHERS'
  const [mediaList, setMediaList] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [isScanningDevices, setIsScanningDevices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const audioMediaList = mediaList.filter((m) => m.mediaType === 'AUDIO');

  useEffect(() => {
    loadOptions();
  }, []);

  const loadDevices = async () => {
    setIsScanningDevices(true);
    try {
      const res = await systemAPI.getDevices();
      setAudioDevices(res.data.audioDevices || []);
      setVideoDevices(res.data.videoDevices || []);
    } catch (err) {
      console.warn('Could not scan devices in edit modal:', err);
    } finally {
      setIsScanningDevices(false);
    }
  };

  const loadOptions = async () => {
    try {
      const [pagesRes, mediaRes, camerasRes, devicesRes] = await Promise.all([
        facebookAPI.getPages(),
        mediaAPI.getList(),
        cameraAPI.getList(),
        systemAPI.getDevices().catch(() => ({ data: { audioDevices: [], videoDevices: [] } }))
      ]);
      setPages(pagesRes.data.pages || []);
      setMediaList(mediaRes.data.media || []);
      setCameras(camerasRes.data.cameras || []);
      setAudioDevices(devicesRes.data.audioDevices || []);
      setVideoDevices(devicesRes.data.videoDevices || []);
    } catch (err) {
      console.error('Failed to load edit options:', err);
    }
  };

  const getDestinationCategory = (p) => {
    const isYT = p.platform === 'YOUTUBE' || p.category?.includes('YouTube') || p.name?.toLowerCase().includes('youtube');
    if (isYT) return 'YOUTUBE';
    const isFB = p.platform === 'FACEBOOK' || p.category?.includes('Facebook') || (!p.platform || p.platform === 'FACEBOOK');
    if (isFB) return 'FACEBOOK';
    return 'OTHERS';
  };

  const filteredPages = pages.filter((p) => {
    if (destinationFilter === 'ALL') return true;
    return getDestinationCategory(p) === destinationFilter;
  });

  const fbDestCount = pages.filter(p => getDestinationCategory(p) === 'FACEBOOK').length;
  const ytDestCount = pages.filter(p => getDestinationCategory(p) === 'YOUTUBE').length;
  const othersDestCount = pages.filter(p => getDestinationCategory(p) === 'OTHERS').length;

  const toggleDestination = (id) => {
    const sId = String(id);
    const exists = selectedPageIds.some((i) => String(i) === sId);
    if (exists) {
      setSelectedPageIds(prev => prev.filter((i) => String(i) !== sId));
    } else {
      setSelectedPageIds(prev => [...prev, sId]);
      const selectedDoc = pages.find(p => String(p.id || p._id) === sId);
      if (selectedDoc && (selectedDoc.platform === 'YOUTUBE' || selectedDoc.category?.includes('YouTube') || selectedDoc.name?.toLowerCase().includes('youtube'))) {
        if (selectedDoc.resolution) {
          setYoutubeResolution(selectedDoc.resolution);
        }
        if (selectedDoc.fps) {
          setYoutubeFps(selectedDoc.fps);
        }
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const isRtsp = sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA';
      const isLocalCam = sourceType === 'LOCAL_CAMERA';
      const isCamera = isRtsp || isLocalCam;

      const formattedCameraSchedules = isCamera && cameraSchedules.length > 0
        ? cameraSchedules.map((s, idx) => ({
            cameraType: s.cameraType || (s.deviceName ? 'WEBCAM' : 'RTSP'),
            cameraId: s.cameraType === 'WEBCAM' ? undefined : (s.cameraId || undefined),
            deviceName: s.cameraType === 'WEBCAM' ? (s.deviceName || undefined) : undefined,
            cameraName: s.cameraName || undefined,
            durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 10),
            order: idx
          }))
        : (isRtsp && selectedCameraId
            ? [{ cameraType: 'RTSP', cameraId: selectedCameraId, durationSeconds: 20, order: 0 }]
            : (isLocalCam && localCameraDevice
                ? [{ cameraType: 'WEBCAM', deviceName: localCameraDevice, cameraName: localCameraDevice, durationSeconds: 20, order: 0 }]
                : []));

      const firstSlot = formattedCameraSchedules[0];
      const resolvedSourceType = isCamera
        ? (firstSlot ? (firstSlot.cameraType === 'WEBCAM' ? 'LOCAL_CAMERA' : 'RTSP_CAMERA') : sourceType)
        : sourceType;

      const firstRtsp = formattedCameraSchedules.find(s => s.cameraType === 'RTSP');
      const firstWebcam = formattedCameraSchedules.find(s => s.cameraType === 'WEBCAM');

      const selectedPageObjs = pages.filter(p => selectedPageIds.some(id => String(id) === String(p.id || p._id)));
      let hasFacebook = selectedPageObjs.some(p => p.platform === 'FACEBOOK' || (!p.platform && !p.category?.includes('YouTube')));
      let hasYouTube = selectedPageObjs.some(p => p.platform === 'YOUTUBE' || p.category?.toLowerCase().includes('youtube') || p.name?.toLowerCase().includes('youtube'));
      if (!hasYouTube && !hasFacebook && selectedPageIds.length > 0) {
        const found = pages.find(p => selectedPageIds.some(id => String(id) === String(p.id || p._id)));
        if (found) {
          if (found.platform === 'YOUTUBE' || found.category?.toLowerCase().includes('youtube') || found.name?.toLowerCase().includes('youtube')) {
            hasYouTube = true;
          } else {
            hasFacebook = true;
          }
        }
      }
      const targetPlatform = (selectedPageIds.length > 1 || (hasFacebook && Boolean(youtubeStreamKey?.trim())))
        ? 'MULTI_DESTINATION'
        : (hasYouTube ? 'YOUTUBE' : (hasFacebook ? 'FACEBOOK' : destinationPlatform));

      const payload = {
        name,
        title,
        description,
        destinationPlatform: targetPlatform,
        facebookPageId: selectedPageIds[0] || undefined,
        targetPageIds: selectedPageIds,
        youtubeStreamKey: youtubeStreamKey || undefined,
        sourceType: resolvedSourceType,
        mediaId: (sourceType === 'VIDEO_FILE' || sourceType === 'IMAGE_FILE' || sourceType === 'IMAGE') ? (mediaSchedules[0]?.mediaId || selectedMediaId || undefined) : undefined,
        mediaSchedules: (sourceType === 'VIDEO_FILE' || sourceType === 'IMAGE_FILE' || sourceType === 'IMAGE') ? mediaSchedules.map((s, idx) => ({
          mediaId: s.mediaId,
          title: s.title || `Media Clip #${idx + 1}`,
          durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 30),
          order: idx
        })) : [],
        cameraId: firstSlot?.cameraType === 'RTSP' ? firstSlot.cameraId : (firstRtsp ? (firstRtsp.cameraId || selectedCameraId) : undefined),
        cameraSchedules: isCamera ? formattedCameraSchedules : [],
        localCameraDevice: firstSlot?.cameraType === 'WEBCAM' ? firstSlot.deviceName : (firstWebcam ? firstWebcam.deviceName : (isLocalCam ? localCameraDevice : undefined)),
        youtubeUrl: sourceType === 'YOUTUBE_VIDEO' ? (youtubeSchedules[0]?.youtubeUrl || youtubeUrl) : undefined,
        youtubeSchedules: sourceType === 'YOUTUBE_VIDEO' ? youtubeSchedules.map((s, idx) => ({
          youtubeUrl: s.youtubeUrl.trim(),
          title: s.title || `YouTube Video #${idx + 1}`,
          durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 30),
          order: idx
        })) : [],
        loopVideo,
        fps: Number(fps) === 60 ? 60 : 30,
        youtubeResolution: youtubeResolution || '1080p',
        youtubeFps: Number(youtubeFps) === 60 ? 60 : (Number(fps) === 60 ? 60 : 30),
        audioSourceType,
        audioMediaId: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? (selectedAudioMediaIds[0] || selectedAudioMediaId || undefined) : undefined,
        audioMediaIds: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? selectedAudioMediaIds : [],
        audioDeviceName: (audioSourceType === 'MICROPHONE' || audioSourceType === 'MIC_AND_TRACK') ? selectedAudioDevice : undefined,
        micVolume,
        audioTrackVolume,
        loopAudio,
        timezone,
        scheduleMode,
        rotationDurationSec,
        completionMode: scheduleMode === 'RECURRING_WINDOW' ? 'INDEFINITE' : (durationPreset === 'indefinite' ? 'INDEFINITE' : 'DURATION'),
        totalDurationSec: scheduleMode === 'RECURRING_WINDOW' ? null : (durationPreset === 'indefinite' ? null : calculatedDurationSec),
        totalDurationHours: scheduleMode === 'RECURRING_WINDOW' ? null : (durationPreset === 'indefinite' ? null : calculatedDurationHours),
        startDate: startDate || null,
        endDate: endDate || null,
        daysOfWeek,
        dailyStartTime,
        dailyEndTime,
      };

      const res = await automationAPI.update(automation._id, payload);
      setSuccessMsg(res.data.message || 'Automation updated successfully!');
      
      setTimeout(() => {
        if (onSaved) onSaved();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update automation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 p-6">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                Modify Automation Modules
                {isLive && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-bold animate-pulse">
                    ● LIVE BROADCASTING
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                {isLive
                  ? 'Modifications will hot-restart the live stream seamlessly with your new module parameters.'
                  : 'Update media sources, audio parameters, stream key destinations, or operating windows.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banners */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Module 1: Broadcast Info */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
              <Layers className="w-4 h-4" />
              <span>1. Broadcast Identity & Title</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Automation Session Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Live Broadcast Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Live Broadcast Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* Stream Frame Rate (FPS) & Motion Smoothing */}
            <div className="pt-3 border-t border-slate-800/80">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Stream Frame Rate (FPS) & Motion Smoothing
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFps(30)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    fps === 30
                      ? 'bg-blue-600/20 border-blue-500 text-blue-200 ring-1 ring-blue-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-100">30 FPS (Standard)</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">Recommended</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Optimal for CCTV cameras (natively 20–25 fps). Smooth motion, efficient CPU and network bandwidth.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFps(60)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    fps === 60
                      ? 'bg-blue-600/20 border-blue-500 text-blue-200 ring-1 ring-blue-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-100">60 FPS (Ultra Smooth)</span>
                    <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono">High Motion</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    High motion fluidity for 50/60fps cameras & capture devices. Automatically scales to 5.5–6.5 Mbps bitrate.
                  </p>
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                💡 <em>Note: If your CCTV camera natively outputs 20 or 25 FPS, streaming at 60 FPS will duplicate frames and cannot create genuine additional motion detail.</em>
              </p>
            </div>

            {/* YouTube Live Streaming Quality (144p to 4K) */}
            <div className="pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Youtube className="w-3.5 h-3.5 text-red-500" />
                  <span>YouTube Live Streaming Quality & Resolution</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">144p to 4K</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {[
                  { value: '144p', label: '144p', res: '256×144', tag: 'Mobile' },
                  { value: '240p', label: '240p', res: '426×240', tag: 'Low' },
                  { value: '360p', label: '360p', res: '640×360', tag: 'SD' },
                  { value: '480p', label: '480p', res: '854×480', tag: 'Enhanced' },
                  { value: '720p', label: '720p HD', res: '1280×720', tag: 'HD' },
                  { value: '1080p', label: '1080p Full HD', res: '1920×1080', tag: 'Default' },
                  { value: '1440p', label: '1440p 2K', res: '2560×1440', tag: '2K QHD' },
                  { value: '2160p', label: '2160p 4K', res: '3840×2160', tag: 'Cinema 4K' },
                ].map((q) => (
                  <button
                    key={q.value}
                    type="button"
                    onClick={() => setYoutubeResolution(q.value)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      youtubeResolution === q.value
                        ? 'bg-red-600/20 border-red-500 text-red-200 ring-1 ring-red-500'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-xs text-slate-100">{q.label}</span>
                      <span className="text-[9px] font-mono bg-slate-800 text-slate-300 px-1 py-0.2 rounded">{q.tag}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">{q.res}</p>
                  </button>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Selected YouTube Quality: <strong className="text-slate-200">{youtubeResolution.toUpperCase()}</strong></span>
                <span className="text-red-400 font-mono font-semibold">
                  {youtubeResolution === '144p' ? (fps === 60 ? '600 Kbps CBR' : '400 Kbps CBR') :
                   youtubeResolution === '240p' ? (fps === 60 ? '900 Kbps CBR' : '600 Kbps CBR') :
                   youtubeResolution === '360p' ? (fps === 60 ? '1,500 Kbps CBR' : '1,000 Kbps CBR') :
                   youtubeResolution === '480p' ? (fps === 60 ? '2,500 Kbps CBR' : '1,500 Kbps CBR') :
                   youtubeResolution === '720p' ? (fps === 60 ? '4,000 Kbps CBR' : '2,500 Kbps CBR') :
                   youtubeResolution === '1080p' ? (fps === 60 ? '5,500–6,500 Kbps CBR' : '3,000–3,500 Kbps CBR') :
                   youtubeResolution === '1440p' ? (fps === 60 ? '16,000 Kbps CBR' : '10,000 Kbps CBR') :
                   (fps === 60 ? '38,000 Kbps CBR' : '25,000 Kbps CBR')}
                </span>
              </div>
            </div>
          </div>

          {/* Module 2: Streaming Destinations */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Share2 className="w-4 h-4" />
                <span>2. Live Streaming Destination Target(s)</span>
                {selectedPageIds.length > 0 && (
                  <span className="ml-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                    {selectedPageIds.length} Selected
                  </span>
                )}
              </div>
            </div>

            {/* Destination Platform Filter Tabs */}
            {pages.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-slate-800/80 pb-2">
                <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span>Filter:</span>
                </span>

                <button
                  type="button"
                  onClick={() => setDestinationFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    destinationFilter === 'ALL'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm ring-1 ring-blue-400'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <span>All</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${destinationFilter === 'ALL' ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'}`}>
                    {pages.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationFilter('FACEBOOK')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    destinationFilter === 'FACEBOOK'
                      ? 'bg-blue-700 text-white border-blue-500 shadow-sm ring-1 ring-blue-400'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <Share2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Facebook</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${destinationFilter === 'FACEBOOK' ? 'bg-blue-900 text-blue-200' : 'bg-slate-800 text-slate-400'}`}>
                    {fbDestCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationFilter('YOUTUBE')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    destinationFilter === 'YOUTUBE'
                      ? 'bg-red-600 text-white border-red-500 shadow-sm ring-1 ring-red-400'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <Youtube className="w-3.5 h-3.5 text-red-400" />
                  <span>YouTube</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${destinationFilter === 'YOUTUBE' ? 'bg-red-800 text-red-100' : 'bg-slate-800 text-slate-400'}`}>
                    {ytDestCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDestinationFilter('OTHERS')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                    destinationFilter === 'OTHERS'
                      ? 'bg-purple-600 text-white border-purple-500 shadow-sm ring-1 ring-purple-400'
                      : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5 text-purple-400" />
                  <span>Others</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${destinationFilter === 'OTHERS' ? 'bg-purple-800 text-purple-200' : 'bg-slate-800 text-slate-400'}`}>
                    {othersDestCount}
                  </span>
                </button>
              </div>
            )}

            {pages.length === 0 ? (
              <p className="text-xs text-slate-400">No connected destinations found. Connect a stream key or page first.</p>
            ) : filteredPages.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-1.5">
                <p className="text-xs text-slate-400">No destinations under "{destinationFilter}" filter.</p>
                <button
                  type="button"
                  onClick={() => setDestinationFilter('ALL')}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold"
                >
                  Show All ({pages.length})
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {filteredPages.map((p) => {
                  const isSelected = selectedPageIds.some(id => String(id) === String(p.id || p._id));
                  return (
                    <div
                      key={p.id || p._id}
                      onClick={() => toggleDestination(p.id || p._id)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-600/10 border-blue-500 shadow-md ring-1 ring-blue-500'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {p.platform === 'YOUTUBE' ? (
                          <Youtube className="w-4 h-4 text-rose-500 shrink-0" />
                        ) : (
                          <Share2 className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                        {p.platform === 'YOUTUBE' ? (
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-200 truncate block">{p.name}</span>
                            <span className="text-[9px] font-mono text-slate-400">{(p.resolution || '1080p').toUpperCase()} {p.fps || 30}FPS</span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-200 truncate">{p.name}</span>
                        )}
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Module 3: Video Source */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
              <Video className="w-4 h-4" />
              <span>3. Video & Media Source</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setSourceType('VIDEO_FILE')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'VIDEO_FILE' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Video className="w-3.5 h-3.5" /> Media File
              </button>
              <button
                type="button"
                onClick={() => setSourceType('RTSP_CAMERA')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Camera className="w-3.5 h-3.5" /> CCTV Camera
              </button>
              <button
                type="button"
                onClick={() => setSourceType('LOCAL_CAMERA')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'LOCAL_CAMERA' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Video className="w-3.5 h-3.5" /> Local Webcam
              </button>
              <button
                type="button"
                onClick={() => setSourceType('YOUTUBE_VIDEO')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  sourceType === 'YOUTUBE_VIDEO' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Youtube className="w-3.5 h-3.5" /> YouTube Video
              </button>
            </div>

            {/* Video File selection */}
            {(sourceType === 'VIDEO_FILE' || sourceType === 'IMAGE_FILE' || sourceType === 'IMAGE') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    Uploaded Media Clips ({mediaList.filter(m => m.mediaType !== 'AUDIO').length})
                  </span>
                  <span className="text-[11px] text-blue-400 font-mono">
                    {mediaSchedules.length} {mediaSchedules.length === 1 ? 'Clip' : 'Clips'} in Rotation
                  </span>
                </div>

                {mediaList.filter(m => m.mediaType !== 'AUDIO').length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-400">
                    No video or image files uploaded yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {mediaList.filter(m => m.mediaType !== 'AUDIO').map((m) => {
                      const mId = String(m._id || m.id);
                      const occurrences = getMediaScheduleOccurrences(mId);
                      const count = occurrences.length;
                      const isSelected = String(selectedMediaId) === mId;
                      const isImg = m.mediaType === 'IMAGE' || /\.(jpe?g|png|webp|bmp|gif)$/i.test(m.filename || m.originalName || '');

                      return (
                        <div
                          key={mId}
                          onClick={() => handleAddMediaSchedule(m)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-2 ${
                            count > 0 || isSelected
                              ? 'bg-blue-600/15 border-blue-500/70 text-slate-100 ring-1 ring-blue-500/50'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-bold truncate block">{m.originalName || m.filename}</span>
                            <span className="text-[10px] text-slate-400">
                              {isImg ? 'Image' : (m.durationSec ? `${m.durationSec}s Video` : 'Video')}
                              {count > 0 && ` • In Sequence (${count}x)`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddMediaSchedule(m);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-blue-500/40 shrink-0"
                            title="Add to sequence"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Combined Sequence & Seconds Duration Playlist */}
                {mediaSchedules.length > 0 && (
                  <div className="rounded-xl border border-blue-500/25 bg-blue-950/20 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                        <Repeat className="w-3.5 h-3.5 text-blue-400" />
                        <span>Rotation Sequence & Duration</span>
                      </div>
                      {mediaSchedules.length > 1 && (
                        <span className="text-[10px] text-blue-300 font-medium flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-blue-400" />
                          Drag to reorder
                        </span>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {mediaSchedules.map((item, index) => {
                        const isDragging = draggedMediaIndex === index;
                        const isDragOver = dragOverMediaIndex === index && !isDragging;
                        const slotKey = item.scheduleId || `media_edit_slot_${index}`;
                        const clipDoc = mediaList.find((m) => String(m._id || m.id) === String(item.mediaId));
                        const clipTitle = item.title || clipDoc?.originalName || clipDoc?.filename || `Clip #${index + 1}`;

                        return (
                          <div
                            key={slotKey}
                            draggable={mediaSchedules.length > 1}
                            onDragStart={(e) => handleMediaDragStart(e, index)}
                            onDragOver={(e) => handleMediaDragOver(e, index)}
                            onDrop={(e) => handleMediaDrop(e, index)}
                            onDragEnd={handleMediaDragEnd}
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-all select-none ${
                              mediaSchedules.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                            } ${
                              isDragging
                                ? 'opacity-40 scale-[0.98] border-dashed border-blue-400 bg-blue-950/40'
                                : isDragOver
                                ? 'border-blue-400 bg-blue-900/30'
                                : 'bg-slate-900/80 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {mediaSchedules.length > 1 && (
                                <GripVertical className="w-3.5 h-3.5 text-slate-500 hover:text-blue-300 shrink-0" />
                              )}
                              <span className="w-5 h-5 rounded bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-[11px] shrink-0 border border-blue-500/30">
                                #{index + 1}
                              </span>
                              <p className="font-semibold text-slate-200 truncate max-w-[140px] sm:max-w-[200px]">
                                {clipTitle}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Always visible: Active Selection Badge or Dedicated Select Button for Instant Streaming */}
                              {liveStreamingMediaSlotIndex === index ? (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[10px] animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                  <span>Selected {isLive ? `(LIVE ${liveMediaSlotRemainingSec}s)` : '(Active)'}</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={switchingMediaSlotIndex !== null}
                                  onClick={(e) => handleInstantSwitchMediaSlot(index, e)}
                                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-[10px] shadow-sm shadow-blue-600/30 transition-all hover:scale-105 disabled:opacity-50"
                                  title="Select this clip for instant streaming"
                                >
                                  {switchingMediaSlotIndex === index ? (
                                    <>
                                      <RotateCw className="w-3 h-3 animate-spin" />
                                      <span>Selecting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-blue-200" />
                                      <span>Select</span>
                                    </>
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateMediaSchedule(item);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                                title="Duplicate"
                              >
                                <Copy className="w-3 h-3" />
                              </button>

                              <ScheduleDurationInput
                                value={item.durationSeconds}
                                onChange={(newSeconds) => handleUpdateMediaDuration(index, newSeconds)}
                                color="indigo"
                                label="Show for:"
                              />

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveMediaScheduleAt(index);
                                }}
                                className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10"
                                title="Remove slot"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-[11px] text-slate-300">
                      {mediaSchedules.length > 1 ? (
                        <span>
                          🔄 Total rotation cycle: <strong>{mediaSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 30), 0)}s</strong>. Loops continuously across {mediaSchedules.length} clips.
                        </span>
                      ) : (
                        <span>Single clip will broadcast continuously.</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Unified Camera Source Selector (CCTV & Webcam) */}
            {(sourceType === 'LOCAL_CAMERA' || sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA') && (
              <div className="space-y-3">
                {/* CCTV Cameras Section */}
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-bold text-slate-200">CCTV / IP Cameras (RTSP)</span>
                    </div>
                  </div>

                  {cameras.length === 0 ? (
                    <div className="text-center py-4 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 space-y-1">
                      <Radio className="w-5 h-5 text-slate-500 mx-auto" />
                      <p className="text-[11px] text-slate-400">No CCTV cameras connected yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                      {cameras.map((c) => {
                        const cId = String(c._id || c.id);
                        const occurrences = getCameraScheduleOccurrences('RTSP', cId);
                        const count = occurrences.length;

                        return (
                          <div
                            key={cId}
                                onClick={() => handleAddCameraSchedule({
                                  cameraType: 'RTSP',
                                  cameraId: cId,
                                  name: c.name
                                })}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                                  count > 0
                                    ? 'bg-blue-600/15 border-blue-500 text-slate-100 shadow-md ring-1 ring-blue-500/50'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span className="text-xs font-bold truncate">{c.name}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono block mt-0.5 truncate">{c.maskedRtspUrl || c.ipAddress}</span>
                                  {count > 0 && (
                                    <span className="text-[10px] text-blue-300 font-semibold block mt-0.5">
                                      In Cycle ({count}x): #{occurrences.join(', #')}
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCameraTarget({ ...c, isWebcam: false, type: 'CCTV' });
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-0.5 border border-slate-700"
                                    title="Edit Camera Details"
                                  >
                                    <Edit2 className="w-2.5 h-2.5 text-slate-400" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddCameraSchedule({
                                        cameraType: 'RTSP',
                                        cameraId: cId,
                                        name: c.name
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[10px] font-bold flex items-center gap-0.5 border border-blue-500/40"
                                  >
                                    <Plus className="w-2.5 h-2.5" /> Add
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Laptop & USB Webcams Section */}
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-xs font-bold text-slate-200">Laptop & USB Webcams</span>
                        </div>
                        <button
                          type="button"
                          onClick={loadDevices}
                          disabled={isScanningDevices}
                          className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 ${isScanningDevices ? 'animate-spin' : ''}`} />
                          <span>Scan Webcams</span>
                        </button>
                      </div>

                      {videoDevices.length === 0 ? (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                          <span>No webcam devices detected.</span>
                          <button type="button" onClick={loadDevices} className="text-indigo-400 underline">Scan Now</button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                          {videoDevices.map((dev) => {
                            const occurrences = getCameraScheduleOccurrences('WEBCAM', dev.name);
                            const count = occurrences.length;

                            return (
                              <div
                                key={dev.name}
                                onClick={() => handleAddCameraSchedule({
                                  cameraType: 'WEBCAM',
                                  deviceName: dev.name,
                                  name: dev.label || dev.name
                                })}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                                  count > 0
                                    ? 'bg-indigo-600/15 border-indigo-500 text-slate-100 shadow-md ring-1 ring-indigo-500/50'
                                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div className="min-w-0 pr-2">
                                  <div className="flex items-center gap-1.5">
                                    <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="text-xs font-bold truncate">{dev.label || dev.name}</span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate">DirectShow Webcam</span>
                                  {count > 0 && (
                                    <span className="text-[10px] text-indigo-300 font-semibold block mt-0.5">
                                      In Cycle ({count}x): #{occurrences.join(', #')}
                                    </span>
                                  )}
                                </div>
                                <div className="shrink-0 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCameraTarget({ ...dev, isWebcam: true, type: 'WEBCAM', deviceName: dev.name });
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold flex items-center gap-0.5 border border-slate-700"
                                    title="Rename Webcam"
                                  >
                                    <Edit2 className="w-2.5 h-2.5 text-slate-400" /> Rename
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddCameraSchedule({
                                        cameraType: 'WEBCAM',
                                        deviceName: dev.name,
                                        name: dev.label || dev.name
                                      });
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-bold flex items-center gap-0.5 border border-indigo-500/40"
                                  >
                                    <Plus className="w-2.5 h-2.5" /> Add
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Combined Camera Cycle Sequence & Seconds Duration */}
                    {cameraSchedules.length > 0 && (
                      <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-3 space-y-2 mt-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                            <Repeat className="w-3.5 h-3.5 text-blue-400" />
                            <span>Rotation Sequence & Per-Camera Duration</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {cameraSchedules.length > 1 && (
                              <span className="text-[10px] text-blue-300 font-medium flex items-center gap-1">
                                <GripVertical className="w-3 h-3 text-blue-400" />
                                Drag to reorder
                              </span>
                            )}
                            <span className="text-[11px] text-blue-400 font-mono">
                              {cameraSchedules.length} {cameraSchedules.length === 1 ? 'Slot' : 'Slots'}
                            </span>
                          </div>
                        </div>

                        {switchCameraError && (
                          <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                            <div className="flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                              <span>{switchCameraError}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSwitchCameraError(null)}
                              className="p-1 hover:text-white rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          {cameraSchedules.map((item, index) => {
                            const isWebcam = item.cameraType === 'WEBCAM' || Boolean(item.deviceName);
                            let displayName = item.cameraName;
                            if (!isWebcam) {
                              const cam = cameras.find((c) => String(c._id || c.id) === String(item.cameraId));
                              if (cam) displayName = cam.name;
                            } else {
                              const dev = videoDevices.find((d) => d.name === item.deviceName);
                              if (dev) displayName = dev.label || dev.name;
                            }
                            if (!displayName) displayName = isWebcam ? (item.deviceName || `Webcam #${index + 1}`) : `CCTV Camera #${index + 1}`;

                            const isDragging = draggedCameraIndex === index;
                            const isDragOver = dragOverCameraIndex === index && !isDragging;
                            const slotKey = item.scheduleId || `${item.cameraType || 'cam'}-${item.cameraId || item.deviceName}-${index}`;

                            return (
                              <div
                                key={slotKey}
                                draggable={cameraSchedules.length > 1}
                                onDragStart={(e) => handleCameraDragStart(e, index)}
                                onDragOver={(e) => handleCameraDragOver(e, index)}
                                onDrop={(e) => handleCameraDrop(e, index)}
                                onDragEnd={handleCameraDragEnd}
                                className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-all select-none ${
                                  cameraSchedules.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                                } ${
                                  isLive && liveStreamingSlotIndex === index
                                    ? 'bg-rose-950/20 border-rose-500/70 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
                                    : isDragging
                                    ? 'opacity-40 bg-blue-900/40 border-2 border-dashed border-blue-400'
                                    : isDragOver
                                    ? 'bg-blue-600/20 border-2 border-blue-400 shadow-lg scale-[1.01]'
                                    : isLive && liveStreamingSlotIndex === index
                                    ? 'bg-slate-950 border-rose-500/70 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
                                    : 'bg-slate-950 border-slate-800 hover:border-blue-500/40'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {cameraSchedules.length > 1 && (
                                    <GripVertical className="w-3.5 h-3.5 text-slate-500 hover:text-blue-300 shrink-0" />
                                  )}
                                  <span
                                    className={`shrink-0 w-5 h-5 rounded-full font-bold flex items-center justify-center text-[10px] ${
                                      isLive && liveStreamingSlotIndex === index
                                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40'
                                        : 'bg-blue-600/30 border border-blue-500/40 text-blue-300'
                                    }`}
                                  >
                                    {index + 1}
                                  </span>
                                  <span
                                    className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                                      isWebcam
                                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                    }`}
                                  >
                                    {isWebcam ? 'Webcam' : 'CCTV'}
                                  </span>
                                  <span className="font-semibold text-slate-200 truncate">{displayName}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isWebcam) {
                                        const devObj = videoDevices.find((d) => d.name === item.deviceName);
                                        setEditingCameraTarget({
                                          ...(devObj || {}),
                                          isWebcam: true,
                                          type: 'WEBCAM',
                                          deviceName: item.deviceName,
                                          customName: displayName
                                        });
                                      } else {
                                        const camObj = cameras.find((c) => String(c.id || c._id) === String(item.cameraId));
                                        setEditingCameraTarget({
                                          ...(camObj || {}),
                                          id: item.cameraId,
                                          _id: item.cameraId,
                                          name: displayName,
                                          isWebcam: false,
                                          type: 'CCTV'
                                        });
                                      }
                                    }}
                                    title="Rename / Edit Camera"
                                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                                  {/* Always visible: Active Selection Badge or Dedicated Select Button for Instant Streaming */}
                                  {liveStreamingSlotIndex === index ? (
                                    <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[10px] animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                      <span>Selected {isLive ? `(LIVE ${liveSlotRemainingSec}s)` : '(Active)'}</span>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={switchingCameraSlotIndex !== null}
                                      onClick={(e) => handleInstantSwitchCameraSlot(index, e)}
                                      className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-[10px] shadow-sm shadow-blue-600/30 transition-all hover:scale-105 disabled:opacity-50"
                                      title="Select this camera for instant streaming"
                                    >
                                      {switchingCameraSlotIndex === index ? (
                                        <>
                                          <RotateCw className="w-3 h-3 animate-spin" />
                                          <span>Selecting...</span>
                                        </>
                                      ) : (
                                        <>
                                          <CheckCircle2 className="w-3 h-3 text-blue-200" />
                                          <span>Select</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  <ScheduleDurationInput
                                    value={item.durationSeconds}
                                    onChange={(newSeconds) => handleUpdateCameraDuration(index, newSeconds)}
                                    color="blue"
                                    label="Show for:"
                                  />

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveCameraScheduleAt(index);
                                    }}
                                    className="p-1 text-slate-500 hover:text-red-400"
                                    title="Remove this slot from sequence"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                    {cameraSchedules.length > 1 && (
                      <p className="text-[10px] text-blue-300/90 pt-1">
                        🔄 Cycles through all {cameraSchedules.length} cameras continuously (total loop:{' '}
                        {cameraSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 20), 0)}s).
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* YouTube Video Playlist & Scheduling */}
            {sourceType === 'YOUTUBE_VIDEO' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-red-300 text-sm font-semibold">
                      <Youtube className="w-4 h-4 text-red-400" />
                      <span>YouTube Video Scheduling & Playlist</span>
                    </div>
                    <span className="text-[11px] text-red-400/80 font-mono">
                      {youtubeSchedules.length} {youtubeSchedules.length === 1 ? 'Video' : 'Videos'} Scheduled
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Schedule YouTube video links with duration in seconds for continuous rotation. Drag to reorder or click repeat to duplicate in sequence.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                    <div className="sm:col-span-6">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1 block">YouTube Video URL</label>
                      <input
                        type="url"
                        value={newYoutubeInputUrl}
                        onChange={(e) => setNewYoutubeInputUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddYoutubeSchedule();
                          }
                        }}
                        placeholder="https://www.youtube.com/watch?v=... or youtu.be/..."
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-400"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-semibold text-slate-400 mb-1 block">Title / Note (Optional)</label>
                      <input
                        type="text"
                        value={newYoutubeInputTitle}
                        onChange={(e) => setNewYoutubeInputTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddYoutubeSchedule();
                          }
                        }}
                        placeholder="e.g. Intro Clip, Segment #1"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-400"
                      />
                    </div>

                    <div className="sm:col-span-3 flex items-end gap-2">
                      <div className="w-24">
                        <label className="text-[10px] font-semibold text-slate-400 mb-1 block">Show (Sec)</label>
                        <input
                          type="number"
                          min="1"
                          max="86400"
                          value={newYoutubeInputDuration}
                          onChange={(e) => setNewYoutubeInputDuration(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-2.5 py-2 text-xs text-center font-bold text-white focus:outline-none focus:border-red-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddYoutubeSchedule()}
                        disabled={!newYoutubeInputUrl.trim()}
                        className="flex-1 py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shrink-0 h-[38px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  {/* Quick Sample Presets */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-500 font-medium">Quick Test Links:</span>
                    <button
                      type="button"
                      onClick={() => handleAddYoutubeSchedule('https://www.youtube.com/watch?v=jfKfPfyJRdk', 'Lofi Hip Hop Chill Beats', 30)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-red-500/50 text-slate-300 hover:text-white transition-all"
                    >
                      + Lofi Music (30s)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddYoutubeSchedule('https://www.youtube.com/watch?v=2OEL4P1Rz04', 'Relaxing Nature 4K Stream', 45)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-red-500/50 text-slate-300 hover:text-white transition-all"
                    >
                      + Nature Clip (45s)
                    </button>
                  </div>
                </div>

                {/* Combined Sequence & Seconds Duration Playlist */}
                {youtubeSchedules.length > 0 && (
                  <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Repeat className="w-4 h-4 text-red-400" />
                        <span className="text-xs font-bold text-slate-200">
                          YouTube Video Sequence & Seconds Duration
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {youtubeSchedules.length > 1 && (
                          <span className="text-[10px] text-red-300 font-medium flex items-center gap-1">
                            <GripVertical className="w-3 h-3 text-red-400" />
                            Drag up/down to reorder
                          </span>
                        )}
                        <span className="text-[11px] text-red-400/80 font-mono">
                          {youtubeSchedules.length} {youtubeSchedules.length === 1 ? 'Slot' : 'Slots'} in Rotation
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {youtubeSchedules.map((item, index) => {
                        const isDragging = draggedYoutubeIndex === index;
                        const isDragOver = dragOverYoutubeIndex === index && !isDragging;
                        const slotKey = item.scheduleId || `yt-slot-${index}`;

                        return (
                          <div
                            key={slotKey}
                            draggable={youtubeSchedules.length > 1}
                            onDragStart={(e) => handleYoutubeDragStart(e, index)}
                            onDragOver={(e) => handleYoutubeDragOver(e, index)}
                            onDrop={(e) => handleYoutubeDrop(e, index)}
                            onDragEnd={handleYoutubeDragEnd}
                            className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-2.5 rounded-xl border text-xs transition-all select-none ${
                              youtubeSchedules.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                            } ${
                              isDragging
                                ? 'opacity-40 bg-red-900/40 border-2 border-dashed border-red-400'
                                : isDragOver
                                ? 'bg-red-600/20 border-2 border-red-400 shadow-lg scale-[1.01]'
                                : 'bg-slate-950/80 border-slate-800 hover:border-red-500/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {youtubeSchedules.length > 1 && (
                                <GripVertical className="w-4 h-4 text-slate-500 hover:text-red-300 shrink-0" />
                              )}
                              <span className="shrink-0 w-6 h-6 rounded-full bg-red-600/30 border border-red-500/40 text-red-300 font-bold flex items-center justify-center text-[11px]">
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/30">
                                    YouTube
                                  </span>
                                  <p className="font-semibold text-slate-200 truncate">{item.title || `Video #${index + 1}`}</p>
                                </div>
                                <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{item.youtubeUrl}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                              {/* Always visible: Active Selection Badge or Dedicated Select Button for Instant Streaming */}
                              {liveStreamingYoutubeSlotIndex === index ? (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-[10px] animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                  <span>Selected {isLive ? `(LIVE ${liveYoutubeSlotRemainingSec}s)` : '(Active)'}</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={switchingYoutubeSlotIndex !== null}
                                  onClick={(e) => handleInstantSwitchYoutubeSlot(index, e)}
                                  className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-[10px] shadow-sm shadow-red-600/30 transition-all hover:scale-105 disabled:opacity-50"
                                  title="Select this YouTube video for instant streaming"
                                >
                                  {switchingYoutubeSlotIndex === index ? (
                                    <>
                                      <RotateCw className="w-3 h-3 animate-spin" />
                                      <span>Selecting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-red-200" />
                                      <span>Select</span>
                                    </>
                                  )}
                                </button>
                              )}

                              <ScheduleDurationInput
                                value={item.durationSeconds}
                                onChange={(newSeconds) => handleUpdateYoutubeDuration(index, newSeconds)}
                                color="red"
                                label="Show for:"
                              />

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateYoutubeSchedule(item);
                                }}
                                className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-red-500/30 transition-all shadow-sm"
                                title="Add another instance to rotation"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Repeat</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveYoutubeScheduleAt(index);
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                                title="Remove this video from rotation"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Cycle Flow Preview Banner */}
                    <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs">
                      {youtubeSchedules.length > 1 ? (
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-red-300">
                            <Repeat className="w-3.5 h-3.5" />
                            <span>Continuous YouTube Cycling Plan:</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-slate-300">
                            {youtubeSchedules.map((s, idx) => {
                              const dur = s.durationSeconds || 30;
                              return (
                                <React.Fragment key={s.scheduleId || idx}>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium bg-red-900/40 border-red-700/50 text-red-200">
                                    <span className="font-bold">#{idx + 1}</span> {s.title || `Video #${idx + 1}`} ({dur}s)
                                  </span>
                                  <span>➔</span>
                                </React.Fragment>
                              );
                            })}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 font-semibold">
                              Loops back to #1
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-2">
                            Total rotation cycle:{' '}
                            <strong className="text-white">
                              {youtubeSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 30), 0)} seconds
                            </strong>
                            . The stream will switch between YouTube videos smoothly and loop continuously until broadcast ends.
                          </p>
                        </div>
                      ) : (
                        <p className="text-slate-300">
                          Single YouTube video active:{' '}
                          <strong className="text-red-300">
                            {youtubeSchedules[0]?.title || 'YouTube Video'}
                          </strong>{' '}
                          will broadcast continuously. (Add more YouTube links above to enable multi-video rotation).
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Module 4: Live Audio Source */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-wider">
              <Mic className="w-4 h-4" />
              <span>4. Audio Source & Mixing (Singer / Live Mic / Track)</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setAudioSourceType('MICROPHONE')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  audioSourceType === 'MICROPHONE' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Mic className="w-3.5 h-3.5" /> Live Mic
              </button>
              <button
                type="button"
                onClick={() => setAudioSourceType('UPLOADED_AUDIO')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  audioSourceType === 'UPLOADED_AUDIO' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Music className="w-3.5 h-3.5" /> MP3 Track
              </button>
              <button
                type="button"
                onClick={() => setAudioSourceType('MIC_AND_TRACK')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  audioSourceType === 'MIC_AND_TRACK' ? 'bg-purple-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Singer Mode
              </button>
              <button
                type="button"
                onClick={() => setAudioSourceType('CAMERA_AUDIO')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  audioSourceType === 'CAMERA_AUDIO' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <Radio className="w-3.5 h-3.5" /> Camera Audio
              </button>
              <button
                type="button"
                onClick={() => setAudioSourceType('SILENT')}
                className={`py-2 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  audioSourceType === 'SILENT' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-950 border border-slate-800 text-slate-400'
                }`}
              >
                <VolumeX className="w-3.5 h-3.5" /> Silent
              </button>
            </div>

            {/* Microphone device pick */}
            {(audioSourceType === 'MICROPHONE' || audioSourceType === 'MIC_AND_TRACK') && (
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-bold text-slate-300">Microphone Input</label>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                >
                  {audioDevices.map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.label || d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* MP3 Backing Track Selection & Playlist (shown for UPLOADED_AUDIO or MIC_AND_TRACK) */}
            {(audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-purple-400" />
                    <span>Select Audio / MP3 / MPEG Playlist (Loops Continuously)</span>
                  </label>
                  {selectedAudioMediaIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAudioMediaIds([]);
                        setSelectedAudioMediaId('');
                      }}
                      className="text-[11px] text-slate-400 hover:text-rose-400 font-semibold transition-colors"
                    >
                      Clear Selection
                    </button>
                  )}
                </div>

                {audioMediaList.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    No MP3 files found in Media Library. Upload audio files from the Create page or Media Library.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {audioMediaList.map((m) => {
                      const trackIdStr = String(m._id || m.id);
                      const playlistIndex = selectedAudioMediaIds.indexOf(trackIdStr);
                      const isSelected = playlistIndex !== -1;
                      return (
                        <div
                          key={trackIdStr}
                          onClick={() => toggleTrackInPlaylist(trackIdStr)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between select-none ${
                            isSelected
                              ? 'bg-purple-600/20 border-purple-500 text-slate-100 shadow-md ring-1 ring-purple-500'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-500 text-white font-bold text-xs' : 'bg-slate-800 text-purple-400'}`}>
                              {isSelected ? `#${playlistIndex + 1}` : <Music className="w-3 h-3" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{m.originalName}</p>
                              <p className="text-[10px] text-slate-400">{m.durationSec ? `${m.durationSec}s` : 'Audio'}</p>
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="text-[10px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 rounded-full shrink-0">
                              In Queue
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 hover:text-purple-300 shrink-0 font-medium">
                              + Add
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ordered Playlist Queue */}
                {selectedAudioMediaIds.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                        <ListMusic className="w-4 h-4 text-purple-400" />
                        <span>Active Playlist Queue ({selectedAudioMediaIds.length} track{selectedAudioMediaIds.length > 1 ? 's' : ''})</span>
                      </span>
                      <span className="text-[10px] text-purple-300 font-medium flex items-center gap-1">
                        <GripVertical className="w-3 h-3 text-purple-400" />
                        Drag up/down to reorder
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {selectedAudioMediaIds.map((sId, idx) => {
                        const trackDoc = audioMediaList.find((item) => String(item._id || item.id) === String(sId));
                        const trackName = trackDoc?.originalName || `Track #${idx + 1}`;
                        const trackDuration = trackDoc?.durationSec ? `${trackDoc.durationSec}s` : 'Audio';
                        const isDragging = draggedAudioIndex === idx;
                        const isDragOver = dragOverAudioIndex === idx && !isDragging;

                        return (
                          <div
                            key={`${sId}-${idx}`}
                            draggable
                            onDragStart={(e) => handleAudioDragStart(e, idx)}
                            onDragOver={(e) => handleAudioDragOver(e, idx)}
                            onDrop={(e) => handleAudioDrop(e, idx)}
                            onDragEnd={handleAudioDragEnd}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs transition-all select-none cursor-grab active:cursor-grabbing ${
                              isDragging
                                ? 'opacity-40 bg-purple-900/40 border-2 border-dashed border-purple-400'
                                : isDragOver
                                ? 'bg-purple-600/20 border-2 border-purple-400 shadow-lg scale-[1.01]'
                                : 'bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-900/90 text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <GripVertical className="w-4 h-4 text-slate-500 hover:text-purple-300 shrink-0" />
                              <span className="w-5 h-5 rounded-md bg-purple-600/30 text-purple-300 font-bold font-mono text-[11px] flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <span className="font-medium truncate text-slate-200">{trackName}</span>
                              <span className="text-[10px] text-slate-500 shrink-0">({trackDuration})</span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTrackFromPlaylist(sId);
                                }}
                                title="Remove track from playlist"
                                className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-2 rounded-lg bg-purple-950/30 border border-purple-500/20 text-[11px] text-purple-200 flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span>
                        <strong>Seamless Looping:</strong> Plays tracks 1 to {selectedAudioMediaIds.length} in order, then automatically loops back to Track #1.
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs text-slate-300 font-semibold cursor-pointer flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Loop MP3 Playlist Continuously</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={loopAudio}
                    onChange={(e) => setLoopAudio(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
                  />
                </div>
              </div>
            )}

            {/* Dual Volume Sliders for Singer Mode */}
            {audioSourceType === 'MIC_AND_TRACK' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>Singer Mic Volume</span>
                    <span className="text-indigo-400">{Math.round(micVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={micVolume}
                    onChange={(e) => setMicVolume(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
                    <span>MP3 Track Volume</span>
                    <span className="text-purple-400">{Math.round(audioTrackVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={audioTrackVolume}
                    onChange={(e) => setAudioTrackVolume(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Module 5: Timezone & Schedule */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                <span>5. Schedule & Timezone</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-xs text-slate-400 font-semibold">Timezone:</span>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value} className="bg-slate-900 text-slate-100">
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {scheduleMode === 'RECURRING_WINDOW' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Daily Start Time ({timezone})</label>
                  <input
                    type="time"
                    value={dailyStartTime}
                    onChange={(e) => setDailyStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Daily End Time ({timezone})</label>
                  <input
                    type="time"
                    value={dailyEndTime}
                    onChange={(e) => setDailyEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {/* Target Duration Presets */}
            {scheduleMode !== 'RECURRING_WINDOW' && (
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-300">Target Duration (Auto-Rotated Continuous Broadcast)</label>
                  <span className="text-[11px] text-slate-400 font-medium">Select preset or enter custom time</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDurationPreset(p.id)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                        durationPreset === p.id
                          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20 scale-[1.02]'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom Duration Inputs and Quick Shortcuts */}
                {durationPreset === 'custom_hours' && (
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-blue-500/40 shadow-xl shadow-blue-950/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">Custom Target Stream Duration</span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        Set any custom duration (e.g. 5m, 15m, 15h)
                      </span>
                    </div>

                    {/* Numeric Inputs for Hours and Minutes */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Hours</span>
                          <span className="text-slate-500 font-normal">e.g. 0, 1, 15...</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="8760"
                            value={customHours}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                              setCustomHours(val);
                            }}
                            placeholder="0"
                            className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                          />
                          <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-500 pointer-events-none">hours</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                          <span>Minutes</span>
                          <span className="text-slate-500 font-normal">0 - 59 mins</span>
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={customMinutes}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                              setCustomMinutes(val);
                            }}
                            placeholder="15"
                            className="w-full px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                          />
                          <span className="absolute right-3.5 top-2 text-xs font-bold text-slate-500 pointer-events-none">mins</span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Duration Shortcuts */}
                    <div>
                      <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Quick Duration Shortcuts:</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: '5 min', h: 0, m: 5 },
                          { label: '10 min', h: 0, m: 10 },
                          { label: '15 min', h: 0, m: 15 },
                          { label: '30 min', h: 0, m: 30 },
                          { label: '45 min', h: 0, m: 45 },
                          { label: '1 hr', h: 1, m: 0 },
                          { label: '1h 30m', h: 1, m: 30 },
                          { label: '3 hrs', h: 3, m: 0 },
                          { label: '6 hrs', h: 6, m: 0 },
                          { label: '12 hrs', h: 12, m: 0 },
                          { label: '15 hrs', h: 15, m: 0 },
                          { label: '48 hrs', h: 48, m: 0 },
                        ].map((chip) => {
                          const isActive = Number(customHours) === chip.h && Number(customMinutes) === chip.m;
                          return (
                            <button
                              key={chip.label}
                              type="button"
                              onClick={() => {
                                setCustomHours(chip.h);
                                setCustomMinutes(chip.m);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                                isActive
                                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              {chip.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Calculated Status Banner */}
                    <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/20 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-300">Target Duration:</span>
                        <span className="text-blue-400 font-mono text-sm">
                          {formatDurationText(calculatedDurationSec)} ({calculatedDurationSec?.toLocaleString()}s)
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        {calculatedDurationSec <= 17400 ? (
                          <span className="text-emerald-400">
                            ✓ Single continuous broadcast. Live stream will automatically stop cleanly when time expires.
                          </span>
                        ) : (
                          <span className="text-indigo-300">
                            ℹ️ Multi-hour stream will auto-rotate seamlessly before completing.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Preset Info Banner */}
                {durationPreset !== 'custom_hours' && durationPreset !== 'indefinite' && (
                  <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-slate-400">
                    <span>Target Broadcast Time: <strong className="text-slate-200">{durationPreset}</strong></span>
                  </div>
                )}

                {durationPreset === 'indefinite' && (
                  <div className="flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Runs continuously 24/7 forever, auto-rotating every 4h 50m.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Submit Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving & Hot-Restarting...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save & Apply Changes</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>

      {/* Universal Edit / Rename Camera Modal */}
      <EditCameraModal
        isOpen={Boolean(editingCameraTarget)}
        camera={editingCameraTarget}
        onClose={() => setEditingCameraTarget(null)}
        onSaved={handleCameraSaved}
        onDeleted={handleCameraDeleted}
      />
    </div>
  );
};
