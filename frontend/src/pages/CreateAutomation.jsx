import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import { facebookAPI, mediaAPI, automationAPI, cameraAPI, systemAPI } from '../services/api';
import { useSocket } from '../context/SocketContext';
import {
  Share2,
  Video,
  Clock,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Zap,
  Info,
  Key,
  Upload,
  Calendar,
  Sparkles,
  ShieldCheck,
  Layers,
  X,
  RefreshCw,
  HelpCircle,
  Trash2,
  Camera,
  Youtube,
  Mic,
  Music,
  Sliders,
  Volume2,
  VolumeX,
  Radio,
  Tv,
  Globe,
  ListMusic,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Repeat,
  Plus,
  Edit2,
  Copy,
  Filter
} from 'lucide-react';
import EditCameraModal from '../components/EditCameraModal';
import ScheduleDurationInput from '../components/ScheduleDurationInput';

/**
 * Formats a Date object as "YYYY-MM-DDTHH:mm" in target timezone for HTML datetime-local input
 */
function formatDateTimeLocal(date, timeZone) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = {};
    dtf.formatToParts(d).forEach(p => { parts[p.type] = p.value; });
    let hour = parts.hour;
    if (hour === '24') hour = '00';
    return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
  } catch (e) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/**
 * Parses a "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" string as local time in target timeZone
 * and returns a JS Date object in UTC.
 */
function parseZonedDateTime(dateTimeStr, timeZone) {
  if (!dateTimeStr) return null;
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  
  const [datePart, timePart = '00:00'] = dateTimeStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0] = timePart.split(':').map(Number);

  if (!year || !month || !day) return new Date(dateTimeStr);

  try {
    const nominalUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const parts = {};
    dtf.formatToParts(nominalUtc).forEach(p => { parts[p.type] = p.value; });
    
    let renderedHour = parseInt(parts.hour, 10);
    if (renderedHour === 24) renderedHour = 0;
    
    const renderedUtc = new Date(Date.UTC(
      parseInt(parts.year, 10),
      parseInt(parts.month, 10) - 1,
      parseInt(parts.day, 10),
      renderedHour,
      parseInt(parts.minute, 10),
      0
    ));

    const diffMs = renderedUtc.getTime() - nominalUtc.getTime();
    return new Date(nominalUtc.getTime() - diffMs);
  } catch (err) {
    return new Date(dateTimeStr);
  }
}

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

export const CreateAutomation = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { socket } = useSocket();
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [switchingCameraSlotIndex, setSwitchingCameraSlotIndex] = useState(null);
  const [switchCameraError, setSwitchCameraError] = useState(null);
  const [liveStreamingSlotIndex, setLiveStreamingSlotIndex] = useState(0);
  const [liveStreamStartedAt, setLiveStreamStartedAt] = useState(Date.now());
  const [liveSlotRemainingSec, setLiveSlotRemainingSec] = useState(0);

  const [switchingMediaSlotIndex, setSwitchingMediaSlotIndex] = useState(null);
  const [liveStreamingMediaSlotIndex, setLiveStreamingMediaSlotIndex] = useState(0);
  const [liveMediaStreamStartedAt, setLiveMediaStreamStartedAt] = useState(Date.now());
  const [liveMediaSlotRemainingSec, setLiveMediaSlotRemainingSec] = useState(0);

  const [switchingYoutubeSlotIndex, setSwitchingYoutubeSlotIndex] = useState(null);
  const [liveStreamingYoutubeSlotIndex, setLiveStreamingYoutubeSlotIndex] = useState(0);
  const [liveYoutubeStreamStartedAt, setLiveYoutubeStreamStartedAt] = useState(Date.now());
  const [liveYoutubeSlotRemainingSec, setLiveYoutubeSlotRemainingSec] = useState(0);

  // Loaded Options
  const [pages, setPages] = useState([]);
  const [destinationFilter, setDestinationFilter] = useState('ALL'); // 'ALL' | 'FACEBOOK' | 'YOUTUBE' | 'OTHERS'
  const [mediaList, setMediaList] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanningDevices, setIsScanningDevices] = useState(false);

  // Derived Media Lists
  const videoMediaList = mediaList.filter((m) => m.mediaType !== 'AUDIO');
  const audioMediaList = mediaList.filter((m) => m.mediaType === 'AUDIO');

  // Form State
  const [sourceType, setSourceType] = useState('LOCAL_CAMERA'); // 'LOCAL_CAMERA' | 'RTSP_CAMERA' | 'VIDEO_FILE' | 'YOUTUBE_VIDEO'
  const [selectedPageIds, setSelectedPageIds] = useState([]);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [mediaSchedules, setMediaSchedules] = useState([]); // Array of { scheduleId, mediaId, title, durationSeconds }
  const [draggedMediaIndex, setDraggedMediaIndex] = useState(null);
  const [dragOverMediaIndex, setDragOverMediaIndex] = useState(null);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [cameraSchedules, setCameraSchedules] = useState([]); // Array of { cameraId, durationSeconds }
  const [selectedLocalCamera, setSelectedLocalCamera] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeSchedules, setYoutubeSchedules] = useState([]); // Array of { scheduleId, youtubeUrl, title, durationSeconds }
  const [newYoutubeInputUrl, setNewYoutubeInputUrl] = useState('');
  const [newYoutubeInputTitle, setNewYoutubeInputTitle] = useState('');
  const [newYoutubeInputDuration, setNewYoutubeInputDuration] = useState(30);
  const [draggedYoutubeIndex, setDraggedYoutubeIndex] = useState(null);
  const [dragOverYoutubeIndex, setDragOverYoutubeIndex] = useState(null);
  const [title, setTitle] = useState('My Live Stream Broadcast');
  const [editingCameraTarget, setEditingCameraTarget] = useState(null);

  const handleCameraDeleted = (deletedCam) => {
    // Reload saved cameras
    cameraAPI.getList().then(res => setCameras(res.data.cameras || [])).catch(() => {});
    // Reload detected webcams
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
      setSelectedLocalCamera(remW ? remW.deviceName : '');
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
    // Reload saved cameras
    cameraAPI.getList().then(res => setCameras(res.data.cameras || [])).catch(() => {});
    // Reload detected webcams with updated aliases
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

  // Multi-Camera (CCTV + Webcam) Cycling Helpers
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
      if (isW && !selectedLocalCamera) setSelectedLocalCamera(key);
      if (!isW && !selectedCameraId) setSelectedCameraId(key);
      return next;
    });
  };

  const handleRemoveCameraScheduleAt = (index) => {
    setCameraSchedules((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      const remW = next.find(s => s.cameraType === 'WEBCAM');
      setSelectedLocalCamera(remW ? remW.deviceName : '');
      const remR = next.find(s => s.cameraType !== 'WEBCAM');
      setSelectedCameraId(remR ? remR.cameraId : '');
      return next;
    });
  };

  const handleToggleCameraSchedule = (camItem) => {
    // If not in schedule, add it. If in schedule, add another instance!
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
    if (editingAutomation) {
      if (editingAutomation.currentCameraSlotIndex !== undefined) {
        setLiveStreamingSlotIndex(editingAutomation.currentCameraSlotIndex);
      }
      if (editingAutomation.cameraStreamStartedAt) {
        setLiveStreamStartedAt(new Date(editingAutomation.cameraStreamStartedAt).getTime());
      }
    }
  }, [editingAutomation?.currentCameraSlotIndex, editingAutomation?.cameraStreamStartedAt]);

  useEffect(() => {
    if (!socket || !id) return;
    const handleSwitched = (data) => {
      if (String(data.automationId) === String(id)) {
        setLiveStreamingSlotIndex(data.activeSlotIndex);
        setLiveStreamStartedAt(data.cameraStreamStartedAt ? new Date(data.cameraStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('camera:active_switched', handleSwitched);
    return () => socket.off('camera:active_switched', handleSwitched);
  }, [socket, id]);

  useEffect(() => {
    const isLive = editingAutomation && ['LIVE', 'ACTIVE', 'STREAMING'].includes(editingAutomation.status);
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
  }, [editingAutomation?.status, cameraSchedules, liveStreamStartedAt, liveStreamingSlotIndex]);

  const handleInstantSwitchCameraSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!id || !editingAutomation) {
      setLiveStreamingSlotIndex(slotIdx);
      return;
    }
    setSwitchingCameraSlotIndex(slotIdx);
    setSwitchCameraError(null);
    try {
      const res = await automationAPI.switchCamera(id, slotIdx);
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
      console.warn('Switch camera error:', errMsg);
      setSwitchCameraError(errMsg);
      // Retain previous active slot, timer, and state on failure
    } finally {
      setSwitchingCameraSlotIndex(null);
    }
  };

  // Live Media Slot Synchronization & Real-Time Countdown
  useEffect(() => {
    if (!socket || !id) return;
    const handleMediaSwitched = (data) => {
      if (String(data.automationId) === String(id)) {
        setLiveStreamingMediaSlotIndex(data.activeSlotIndex);
        setLiveMediaStreamStartedAt(data.mediaStreamStartedAt ? new Date(data.mediaStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('media:active_switched', handleMediaSwitched);
    return () => socket.off('media:active_switched', handleMediaSwitched);
  }, [socket, id]);

  useEffect(() => {
    const isLive = editingAutomation && ['LIVE', 'ACTIVE', 'STREAMING'].includes(editingAutomation.status);
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
  }, [editingAutomation?.status, mediaSchedules, liveMediaStreamStartedAt, liveStreamingMediaSlotIndex]);

  const handleInstantSwitchMediaSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!id || !editingAutomation) {
      setLiveStreamingMediaSlotIndex(slotIdx);
      return;
    }
    setSwitchingMediaSlotIndex(slotIdx);
    try {
      const res = await automationAPI.switchMedia(id, slotIdx);
      if (res.data?.success) {
        setLiveStreamingMediaSlotIndex(slotIdx);
        setLiveMediaStreamStartedAt(Date.now());
        setLiveSlotRemainingSec(res.data.durationSeconds || mediaSchedules[slotIdx]?.durationSeconds || 30);
      } else {
        console.warn('Media switch error:', res.data?.error || 'Failed to switch media');
      }
    } catch (err) {
      console.warn('Switch media error:', err.response?.data?.error || err.message);
      // Retain previous active slot on failure
    } finally {
      setSwitchingMediaSlotIndex(null);
    }
  };

  // Live YouTube Slot Synchronization & Real-Time Countdown
  useEffect(() => {
    if (!socket || !id) return;
    const handleYtSwitched = (data) => {
      if (String(data.automationId) === String(id)) {
        setLiveStreamingYoutubeSlotIndex(data.activeSlotIndex);
        setLiveYoutubeStreamStartedAt(data.youtubeStreamStartedAt ? new Date(data.youtubeStreamStartedAt).getTime() : Date.now());
      }
    };
    socket.on('youtube:active_switched', handleYtSwitched);
    return () => socket.off('youtube:active_switched', handleYtSwitched);
  }, [socket, id]);

  useEffect(() => {
    const isLive = editingAutomation && ['LIVE', 'ACTIVE', 'STREAMING'].includes(editingAutomation.status);
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
  }, [editingAutomation?.status, youtubeSchedules, liveYoutubeStreamStartedAt, liveStreamingYoutubeSlotIndex]);

  const handleInstantSwitchYoutubeSlot = async (slotIdx, e) => {
    if (e) e.stopPropagation();
    if (!id || !editingAutomation) {
      setLiveStreamingYoutubeSlotIndex(slotIdx);
      return;
    }
    setSwitchingYoutubeSlotIndex(slotIdx);
    try {
      const res = await automationAPI.switchYouTube(id, slotIdx);
      if (res.data?.success) {
        setLiveStreamingYoutubeSlotIndex(slotIdx);
        setLiveYoutubeStreamStartedAt(Date.now());
        setLiveYoutubeSlotRemainingSec(res.data.durationSeconds || youtubeSchedules[slotIdx]?.durationSeconds || 30);
      } else {
        console.warn('YouTube switch error:', res.data?.error || 'Failed to switch YouTube video');
      }
    } catch (err) {
      console.warn('Switch YouTube error:', err.response?.data?.error || err.message);
      // Retain previous active slot on failure
    } finally {
      setSwitchingYoutubeSlotIndex(null);
    }
  };

  // Multi-YouTube Video Cycling & Scheduling Helpers
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
  const [description, setDescription] = useState('Welcome to our scheduled live stream broadcast!');
  const [loopVideo, setLoopVideo] = useState(true);
  const [fps, setFps] = useState(30);
  const [youtubeResolution, setYoutubeResolution] = useState('1080p');
  const [youtubeFps, setYoutubeFps] = useState(30);

  // Audio Configuration State
  const [audioSourceType, setAudioSourceType] = useState('MICROPHONE'); // 'MICROPHONE' | 'UPLOADED_AUDIO' | 'MIC_AND_TRACK' | 'CAMERA_AUDIO' | 'SILENT'
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedAudioMediaId, setSelectedAudioMediaId] = useState('');
  const [selectedAudioMediaIds, setSelectedAudioMediaIds] = useState([]);
  const [audioTrackVolume, setAudioTrackVolume] = useState(0.8);
  const [micVolume, setMicVolume] = useState(1.0);
  const [loopAudio, setLoopAudio] = useState(true);

  // Audio Playlist Helpers
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

  const clearAudioPlaylist = () => {
    setSelectedAudioMediaIds([]);
    setSelectedAudioMediaId('');
  };

  // Timing & Schedule State
  const [startImmediately, setStartImmediately] = useState(true);
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [timezone, setTimezone] = useState(userDetectedTz);
  const [facebookMode, setFacebookMode] = useState('META_GRAPH_API');

  // Advanced Recurring Schedule State
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleMode, setScheduleMode] = useState('IMMEDIATE');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState([1, 2, 3, 4, 5]);
  const [dailyStartTime, setDailyStartTime] = useState('09:00');
  const [dailyEndTime, setDailyEndTime] = useState('17:00');
  const [enableDailyWindow, setEnableDailyWindow] = useState(true);

  // Duration & Completion Time State
  const [durationPreset, setDurationPreset] = useState('5h');
  const [customHours, setCustomHours] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(15);
  const [targetEndTime, setTargetEndTime] = useState('');

  // Inline Connection Modal
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectTab, setConnectTab] = useState('youtube_stream_key'); // 'youtube_stream_key' | 'facebook_stream_key' | 'token'
  const [streamKeyInput, setStreamKeyInput] = useState('');
  const [streamKeyName, setStreamKeyName] = useState('');
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [modalYoutubeResolution, setModalYoutubeResolution] = useState('1080p');
  const [modalYoutubeFps, setModalYoutubeFps] = useState(30);
  const [tokenInput, setTokenInput] = useState('');
  const [pageIdInput, setPageIdInput] = useState('');
  const [isSubmittingToken, setIsSubmittingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [tokenSuccess, setTokenSuccess] = useState('');

  // Inline Media / Audio Upload
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isCreatingSample, setIsCreatingSample] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  const loadDevices = async () => {
    try {
      setIsScanningDevices(true);
      const res = await systemAPI.getDevices();
      const aDevs = res.data.audioDevices || [];
      const vDevs = res.data.videoDevices || [];
      setAudioDevices(aDevs);
      setVideoDevices(vDevs);

      if (aDevs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(aDevs[0].name);
      }
      return { audioDevices: aDevs, videoDevices: vDevs };
    } catch (err) {
      console.warn('Could not scan direct devices:', err);
      return { audioDevices: [], videoDevices: [] };
    } finally {
      setIsScanningDevices(false);
    }
  };

  const loadData = async () => {
    try {
      const [pagesRes, mediaRes, camerasRes, devicesRes] = await Promise.all([
        facebookAPI.getPages(),
        mediaAPI.getList(),
        cameraAPI.getList(),
        systemAPI.getDevices().catch(() => ({ data: {} }))
      ]);
      const pList = pagesRes.data.pages || [];
      const mList = mediaRes.data.media || [];
      const cList = camerasRes.data.cameras || [];
      const aDevs = devicesRes.data?.audioDevices || [];
      const vDevs = devicesRes.data?.videoDevices || [];

      setPages(pList);
      setMediaList(mList);
      setCameras(cList);
      setAudioDevices(aDevs);
      setVideoDevices(vDevs);

      if (aDevs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(aDevs[0].name);
      }

      if (id) {
        // Edit mode: fetch existing automation details and populate form
        const autoRes = await automationAPI.getById(id);
        const auto = autoRes.data.automation;
        if (auto) {
          setEditingAutomation(auto);
          if (auto.name) setScheduleName(auto.name);
          if (auto.title) setTitle(auto.title);
          if (auto.description !== undefined) setDescription(auto.description);
          if (auto.sourceType) setSourceType(auto.sourceType);
          
          if (Array.isArray(auto.targetPageIds) && auto.targetPageIds.length > 0) {
            setSelectedPageIds(auto.targetPageIds.map(p => typeof p === 'object' && p !== null ? String(p._id || p.id) : String(p)));
          } else if (auto.facebookPageId) {
            const pageIdStr = typeof auto.facebookPageId === 'object' && auto.facebookPageId !== null ? String(auto.facebookPageId._id || auto.facebookPageId.id) : String(auto.facebookPageId);
            if (pageIdStr) setSelectedPageIds([pageIdStr]);
          }

          if (Array.isArray(auto.mediaSchedules) && auto.mediaSchedules.length > 0) {
            const rawMedia = auto.mediaSchedules.map((s, idx) => {
              const mId = typeof s.mediaId === 'object' && s.mediaId !== null ? String(s.mediaId._id || s.mediaId.id) : String(s.mediaId);
              return {
                scheduleId: s._id ? String(s._id) : `media_slot_${idx}_${Date.now()}`,
                mediaId: mId,
                title: s.title || (s.mediaId?.originalName || `Clip #${idx + 1}`),
                durationSeconds: s.durationSeconds || (s.mediaId?.durationSec ? Math.round(s.mediaId.durationSec) : 30),
                order: s.order !== undefined ? s.order : idx,
              };
            }).filter(s => s.mediaId);
            setMediaSchedules(rawMedia);
            if (rawMedia.length > 0) setSelectedMediaId(rawMedia[0].mediaId);
          } else if (auto.mediaId) {
            const mId = typeof auto.mediaId === 'object' && auto.mediaId !== null ? String(auto.mediaId._id || auto.mediaId.id) : String(auto.mediaId);
            setSelectedMediaId(mId);
            const foundMedia = mList.find(m => String(m._id || m.id) === String(mId));
            setMediaSchedules([{
              scheduleId: `media_slot_0_${Date.now()}`,
              mediaId: mId,
              title: foundMedia?.originalName || auto.mediaId?.originalName || 'Video/Image Clip',
              durationSeconds: foundMedia?.durationSec ? Math.round(foundMedia.durationSec) : 30,
              order: 0
            }]);
          }
          if (Array.isArray(auto.cameraSchedules) && auto.cameraSchedules.length > 0) {
            const rawScheds = auto.cameraSchedules.map((s, idx) => {
              const isWebcam = s.cameraType === 'WEBCAM' || Boolean(s.deviceName);
              return {
                cameraType: isWebcam ? 'WEBCAM' : 'RTSP',
                cameraId: !isWebcam && typeof s.cameraId === 'object' && s.cameraId !== null ? String(s.cameraId._id || s.cameraId.id) : (s.cameraId ? String(s.cameraId) : null),
                deviceName: isWebcam ? (s.deviceName || auto.localCameraDevice) : null,
                cameraName: s.cameraName || (isWebcam ? (s.deviceName || 'Webcam') : 'CCTV Camera'),
                durationSeconds: s.durationSeconds || 20,
                order: s.order !== undefined ? s.order : idx,
              };
            }).filter(s => (s.cameraType === 'WEBCAM' && s.deviceName) || (s.cameraType === 'RTSP' && s.cameraId));
            setCameraSchedules(rawScheds);
            if (rawScheds.length > 0) {
              const firstRtsp = rawScheds.find(s => s.cameraType === 'RTSP');
              if (firstRtsp) setSelectedCameraId(firstRtsp.cameraId);
              const firstWebcam = rawScheds.find(s => s.cameraType === 'WEBCAM');
              if (firstWebcam) setSelectedLocalCamera(firstWebcam.deviceName);
            }
          } else if (auto.cameraId) {
            const cId = typeof auto.cameraId === 'object' && auto.cameraId !== null ? String(auto.cameraId._id || auto.cameraId.id) : String(auto.cameraId);
            setSelectedCameraId(cId);
            setCameraSchedules([{ cameraType: 'RTSP', cameraId: cId, durationSeconds: 20, order: 0 }]);
          } else if (auto.localCameraDevice) {
            setSelectedLocalCamera(auto.localCameraDevice);
            setCameraSchedules([{ cameraType: 'WEBCAM', deviceName: auto.localCameraDevice, cameraName: auto.localCameraDevice, durationSeconds: 20, order: 0 }]);
          }
          if (Array.isArray(auto.youtubeSchedules) && auto.youtubeSchedules.length > 0) {
            const rawYt = auto.youtubeSchedules.map((s, idx) => ({
              scheduleId: s._id ? String(s._id) : `yt_slot_${idx}_${Date.now()}`,
              youtubeUrl: s.youtubeUrl,
              title: s.title || `YouTube Video #${idx + 1}`,
              durationSeconds: s.durationSeconds || 30,
              order: s.order !== undefined ? s.order : idx,
            }));
            setYoutubeSchedules(rawYt);
            if (rawYt.length > 0) setYoutubeUrl(rawYt[0].youtubeUrl);
          } else if (auto.youtubeUrl) {
            setYoutubeUrl(auto.youtubeUrl);
            setYoutubeSchedules([{
              scheduleId: `yt_slot_0_${Date.now()}`,
              youtubeUrl: auto.youtubeUrl,
              title: 'YouTube Video',
              durationSeconds: 30,
              order: 0
            }]);
          }
          if (auto.loopVideo !== undefined) setLoopVideo(Boolean(auto.loopVideo));
          if (auto.fps !== undefined) setFps(auto.fps === 60 ? 60 : 30);
          if (auto.youtubeResolution) setYoutubeResolution(auto.youtubeResolution);
          if (auto.youtubeFps !== undefined) setYoutubeFps(auto.youtubeFps === 60 ? 60 : 30);

          if (auto.audioSourceType) setAudioSourceType(auto.audioSourceType);
          if (Array.isArray(auto.audioMediaIds) && auto.audioMediaIds.length > 0) {
            const rawAudioIds = auto.audioMediaIds.map(a => typeof a === 'object' && a !== null ? String(a._id || a.id) : String(a)).filter(Boolean);
            setSelectedAudioMediaIds(rawAudioIds);
            setSelectedAudioMediaId(rawAudioIds[0] || '');
          } else if (auto.audioMediaId) {
            const aId = typeof auto.audioMediaId === 'object' && auto.audioMediaId !== null ? String(auto.audioMediaId._id || auto.audioMediaId.id) : String(auto.audioMediaId);
            if (aId) {
              setSelectedAudioMediaIds([aId]);
              setSelectedAudioMediaId(aId);
            }
          }
          if (auto.audioDeviceName) setSelectedAudioDevice(auto.audioDeviceName);
          if (auto.audioTrackVolume !== undefined) setAudioTrackVolume(Number(auto.audioTrackVolume));
          if (auto.micVolume !== undefined) setMicVolume(Number(auto.micVolume));
          if (auto.loopAudio !== undefined) setLoopAudio(Boolean(auto.loopAudio));

          if (auto.timezone) setTimezone(auto.timezone);
          if (auto.scheduleMode) setScheduleMode(auto.scheduleMode);
          if (auto.scheduleName) setScheduleName(auto.scheduleName || auto.name || '');
          if (auto.startImmediately !== undefined) setStartImmediately(Boolean(auto.startImmediately));
          if (auto.scheduledStartTime) setScheduledStartTime(formatDateTimeLocal(new Date(auto.scheduledStartTime), auto.timezone || userDetectedTz));
          if (auto.startDate) setStartDate(typeof auto.startDate === 'string' ? auto.startDate.split('T')[0] : new Date(auto.startDate).toISOString().split('T')[0]);
          if (auto.endDate) setEndDate(typeof auto.endDate === 'string' ? auto.endDate.split('T')[0] : new Date(auto.endDate).toISOString().split('T')[0]);
          if (Array.isArray(auto.daysOfWeek)) setDaysOfWeek(auto.daysOfWeek);
          if (auto.dailyStartTime) setDailyStartTime(auto.dailyStartTime);
          if (auto.dailyEndTime) setDailyEndTime(auto.dailyEndTime);
          if (auto.enableDailyWindow !== undefined) setEnableDailyWindow(Boolean(auto.enableDailyWindow));

          if (auto.totalDurationSec || auto.totalDurationHours) {
            const totalSec = auto.totalDurationSec || Math.round(auto.totalDurationHours * 3600);
            if (totalSec === 3600) setDurationPreset('1h');
            else if (totalSec === 7200) setDurationPreset('2h');
            else if (totalSec === 18000) setDurationPreset('5h');
            else if (totalSec === 36000) setDurationPreset('10h');
            else if (totalSec === 86400) setDurationPreset('24h');
            else {
              setDurationPreset('custom_hours');
              setCustomHours(Math.floor(totalSec / 3600));
              setCustomMinutes(Math.round((totalSec % 3600) / 60));
            }
          } else if (auto.completionMode === 'INDEFINITE') {
            setDurationPreset('indefinite');
          }

          if (auto.currentMediaSlotIndex !== undefined) setLiveStreamingMediaSlotIndex(auto.currentMediaSlotIndex);
          if (auto.mediaStreamStartedAt) setLiveMediaStreamStartedAt(new Date(auto.mediaStreamStartedAt).getTime());
          if (auto.currentYoutubeSlotIndex !== undefined) setLiveStreamingYoutubeSlotIndex(auto.currentYoutubeSlotIndex);
          if (auto.youtubeStreamStartedAt) setLiveYoutubeStreamStartedAt(new Date(auto.youtubeStreamStartedAt).getTime());
          if (auto.currentCameraSlotIndex !== undefined) setLiveStreamingSlotIndex(auto.currentCameraSlotIndex);
          if (auto.cameraStreamStartedAt) setLiveStreamStartedAt(new Date(auto.cameraStreamStartedAt).getTime());
        }
      } else {
        // No items selected by default: user explicitly chooses their destination, media, audio, or cameras
        setSelectedPageIds([]);
        setSelectedMediaId('');
        setSelectedAudioMediaId('');
        setSelectedAudioMediaIds([]);
        setSelectedCameraId('');
        setSelectedLocalCamera('');
        setCameraSchedules([]);
        setMediaSchedules([]);
        setYoutubeSchedules([]);
      }
    } catch (err) {
      console.error('Failed to load form data:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleDestination = (id) => {
    const sId = String(id);
    const exists = selectedPageIds.some(item => String(item) === sId);
    if (exists) {
      setSelectedPageIds(prev => prev.filter(item => String(item) !== sId));
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

  const toggleSelectAllDestinations = () => {
    const targetList = destinationFilter === 'ALL' ? pages : filteredPages;
    if (targetList.length === 0) return;
    const allTargetSelected = targetList.every(p => selectedPageIds.some(id => String(id) === String(p.id || p._id)));
    if (allTargetSelected) {
      const targetIds = new Set(targetList.map(p => String(p.id || p._id)));
      setSelectedPageIds(prev => prev.filter(id => !targetIds.has(String(id))));
    } else {
      const newIds = targetList.map(p => String(p.id || p._id));
      setSelectedPageIds(prev => [...new Set([...prev.map(String), ...newIds])]);
    }
  };

  useEffect(() => {
    loadData();
    const nextHour = new Date(Date.now() + 3600 * 1000);
    nextHour.setMinutes(Math.ceil(nextHour.getMinutes() / 15) * 15, 0, 0);
    setScheduledStartTime(nextHour.toISOString().slice(0, 16));
  }, []);

  // Compute Start Time
  const effectiveStartTime = startImmediately ? new Date() : (scheduledStartTime ? new Date(scheduledStartTime) : new Date());

  // Compute Total Duration in Seconds
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
  } else if (durationPreset === 'end_time' && targetEndTime) {
    const diffSec = Math.max(0, Math.round((new Date(targetEndTime).getTime() - effectiveStartTime.getTime()) / 1000));
    calculatedDurationSec = diffSec > 0 ? diffSec : 60;
    calculatedDurationHours = parseFloat((calculatedDurationSec / 3600).toFixed(4));
  } else if (durationPreset === 'indefinite') {
    calculatedDurationSec = null;
    calculatedDurationHours = null;
  }

  // Compute Completion Time
  let calculatedCompletionTime = null;
  if (calculatedDurationSec) {
    calculatedCompletionTime = new Date(effectiveStartTime.getTime() + (calculatedDurationSec * 1000));
  }

  // Calculate Rotations Breakdown
  const maxFbDurationSec = 17400; // 4h 50m safe rotation
  let rotationCount = 1;
  if (calculatedDurationSec) {
    rotationCount = Math.ceil(calculatedDurationSec / maxFbDurationSec);
  }

  // Handle Inline Stream Key or Token Connect
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
          resolution: modalYoutubeResolution,
          fps: Number(modalYoutubeFps) === 60 ? 60 : 30
        });
        setTokenSuccess(res.data.message || 'YouTube Live connected successfully!');
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
        setTokenSuccess(res.data.message || 'Facebook Stream Key connected successfully!');
        setStreamKeyInput('');
      } else {
        if (!tokenInput.trim()) {
          setTokenError('Please paste your Facebook Page Access Token.');
          setIsSubmittingToken(false);
          return;
        }
        const res = await facebookAPI.connectWithToken({
          token: tokenInput.trim(),
          pageId: pageIdInput.trim() || undefined
        });
        setTokenSuccess(res.data.message || 'Token connected successfully!');
        setTokenInput('');
        setPageIdInput('');
      }

      const updatedPages = await facebookAPI.getPages();
      const pList = updatedPages.data.pages || [];
      setPages(pList);
      if (pList.length > 0) {
        const newId = String(pList[pList.length - 1].id || pList[pList.length - 1]._id);
        setSelectedPageIds(prev => {
          const nonMockPrev = prev.filter(id => {
            const page = pList.find(p => String(p.id || p._id) === String(id));
            return page && !page.isMock;
          });
          return nonMockPrev.includes(newId) ? (nonMockPrev.length > 0 ? nonMockPrev : [newId]) : [...nonMockPrev, newId];
        });
      }
      setTimeout(() => {
        setShowConnectModal(false);
        setTokenSuccess('');
      }, 1200);
    } catch (err) {
      setTokenError(err.response?.data?.error || err.message || 'Connection failed.');
    } finally {
      setIsSubmittingToken(false);
    }
  };

  const handleDeletePage = async (e, pageId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to remove this streaming destination?')) return;
    try {
      await facebookAPI.deletePage(pageId);
      const updatedPages = await facebookAPI.getPages();
      const pList = updatedPages.data.pages || [];
      setPages(pList);
      if (selectedPageIds.includes(pageId)) {
        const remaining = selectedPageIds.filter(id => id !== pageId);
        if (remaining.length > 0) {
          setSelectedPageIds(remaining);
        } else if (pList.length > 0) {
          setSelectedPageIds([pList[0].id]);
        } else {
          setSelectedPageIds([]);
        }
      }
    } catch (err) {
      alert(err.response?.data?.error || err.message || 'Failed to remove destination');
    }
  };

  // Handle Video / Image Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingMedia(true);
    setUploadProgress(0);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mediaType', 'VIDEO');
    try {
      const res = await mediaAPI.upload(formData, (progressEvent) => {
        if (progressEvent.total) {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(pct);
        }
      });
      const mediaListRes = await mediaAPI.getList();
      const mList = mediaListRes.data.media || [];
      setMediaList(mList);
      if (res.data.media?._id) setSelectedMediaId(res.data.media._id);
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploadingMedia(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  // Handle MP3 Audio Track Upload (Single or Multiple)
  const handleAudioUpload = async (e) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setIsUploadingAudio(true);
    setAudioUploadProgress(0);
    setUploadError('');
    const formData = new FormData();
    formData.append('mediaType', 'AUDIO');
    files.forEach(f => formData.append('files', f));
    if (files.length === 1) {
      formData.append('file', files[0]);
    }
    try {
      const res = await mediaAPI.upload(formData, (progressEvent) => {
        if (progressEvent.total) {
          const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setAudioUploadProgress(pct);
        }
      });
      const mediaListRes = await mediaAPI.getList();
      const mList = mediaListRes.data.media || [];
      setMediaList(mList);

      const items = res.data.items || (res.data.media ? [res.data.media] : []);
      const newIds = items.map(m => String(m._id || m.id));
      if (newIds.length > 0) {
        setSelectedAudioMediaIds(prev => {
          const combined = [...prev, ...newIds.filter(id => !prev.includes(id))];
          setSelectedAudioMediaId(combined[0] || '');
          return combined;
        });
      }
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Audio upload failed.');
    } finally {
      setIsUploadingAudio(false);
      setAudioUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleCreateSampleMedia = async (type = 'VIDEO') => {
    setIsCreatingSample(true);
    setUploadError('');
    try {
      const res = await mediaAPI.createSample(type);
      const mediaListRes = await mediaAPI.getList();
      const mList = mediaListRes.data.media || [];
      setMediaList(mList);
      if (type === 'AUDIO') {
        const newId = String(res.data.media?._id || res.data.media?.id);
        if (newId) {
          setSelectedAudioMediaIds(prev => {
            const combined = prev.includes(newId) ? prev : [...prev, newId];
            setSelectedAudioMediaId(combined[0] || '');
            return combined;
          });
        }
      } else {
        if (res.data.media?._id) setSelectedMediaId(res.data.media._id);
      }
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Failed to create sample media');
    } finally {
      setIsCreatingSample(false);
    }
  };

  // Handle Submit
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (selectedPageIds.length === 0) {
      alert('Please select at least one live streaming destination (Facebook Page or YouTube Live).');
      return;
    }
    const isRtsp = sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA';
    const isLocalCam = sourceType === 'LOCAL_CAMERA';
    const isYouTube = sourceType === 'YOUTUBE_VIDEO';

    const isCamera = isRtsp || isLocalCam;
    const effectiveCameraId = selectedCameraId || (cameraSchedules.find(s => s.cameraType !== 'WEBCAM')?.cameraId);
    const effectiveWebcam = selectedLocalCamera || (cameraSchedules.find(s => s.cameraType === 'WEBCAM')?.deviceName);

    if (isCamera && cameraSchedules.length === 0 && !effectiveCameraId && !effectiveWebcam) {
      alert('Please select at least one camera (CCTV or Webcam).');
      return;
    }
    const effectiveYoutubeUrl = (isYouTube && youtubeSchedules.length > 0)
      ? youtubeSchedules[0].youtubeUrl
      : youtubeUrl.trim();

    if (isYouTube && !effectiveYoutubeUrl) {
      alert('Please enter or schedule at least one YouTube video URL.');
      return;
    }
    const isLocalMedia = !isCamera && !isYouTube;
    if (isLocalMedia && mediaSchedules.length === 0 && !selectedMediaId) {
      alert('Please select or add at least one video/image to broadcast.');
      return;
    }

    if ((audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') && selectedAudioMediaIds.length === 0 && !selectedAudioMediaId) {
      alert('Please upload or select at least one MP3 audio track for your playlist.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isRecurring = scheduleMode === 'RECURRING_WINDOW';
      const effectiveStartImmediately = isRecurring ? false : startImmediately;
      
      const selectedPageObjs = pages.filter(p => selectedPageIds.some(id => String(id) === String(p.id || p._id)));
      let hasFacebook = selectedPageObjs.some(p => p.platform === 'FACEBOOK' || (!p.platform && !p.category?.includes('YouTube')));
      let hasYouTube = selectedPageObjs.some(p => p.platform === 'YOUTUBE' || p.category?.toLowerCase().includes('youtube') || p.name?.toLowerCase().includes('youtube'));
      
      // Fallback check against full pages collection if selectedPageObjs had any reference discrepancies
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
      const targetPlatform = (selectedPageIds.length > 1 || (hasFacebook && Boolean(streamKeyInput?.trim())))
        ? 'MULTI_DESTINATION'
        : (hasYouTube ? 'YOUTUBE' : 'FACEBOOK');

      let parsedScheduledStartTime = new Date().toISOString();
      if (!effectiveStartImmediately && scheduledStartTime) {
        const zDate = parseZonedDateTime(scheduledStartTime, timezone);
        parsedScheduledStartTime = zDate ? zDate.toISOString() : new Date(scheduledStartTime).toISOString();
      }

      let parsedStartDate = null;
      if (startDate) {
        const zStart = parseZonedDateTime(`${startDate}T00:00:00`, timezone);
        parsedStartDate = zStart ? zStart.toISOString() : new Date(startDate).toISOString();
      }

      let parsedEndDate = null;
      if (endDate) {
        const zEnd = parseZonedDateTime(`${endDate}T23:59:59`, timezone);
        parsedEndDate = zEnd ? zEnd.toISOString() : new Date(endDate).toISOString();
      }

      const formattedCameraSchedules = isCamera && cameraSchedules.length > 0
        ? cameraSchedules.map((s, idx) => ({
            cameraType: s.cameraType || (s.deviceName ? 'WEBCAM' : 'RTSP'),
            cameraId: s.cameraType === 'WEBCAM' ? undefined : (s.cameraId || undefined),
            deviceName: s.cameraType === 'WEBCAM' ? (s.deviceName || undefined) : undefined,
            cameraName: s.cameraName || undefined,
            durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 10),
            order: idx
          }))
        : (isRtsp && effectiveCameraId
            ? [{ cameraType: 'RTSP', cameraId: effectiveCameraId, durationSeconds: 20, order: 0 }]
            : (isLocalCam && effectiveWebcam
                ? [{ cameraType: 'WEBCAM', deviceName: effectiveWebcam, cameraName: effectiveWebcam, durationSeconds: 20, order: 0 }]
                : []));

      const firstSlot = formattedCameraSchedules[0];
      const resolvedSourceType = isCamera
        ? (firstSlot ? (firstSlot.cameraType === 'WEBCAM' ? 'LOCAL_CAMERA' : 'RTSP_CAMERA') : sourceType)
        : sourceType;

      const firstRtsp = formattedCameraSchedules.find(s => s.cameraType === 'RTSP');
      const firstWebcam = formattedCameraSchedules.find(s => s.cameraType === 'WEBCAM');

      const payload = {
        name: scheduleName?.trim() || `${title} (${isRecurring ? 'Recurring Window' : (durationPreset === 'indefinite' ? '24/7' : formatDurationLabel(calculatedDurationSec))})`,
        facebookPageId: selectedPageIds[0],
        targetPageIds: selectedPageIds,
        destinationPlatform: targetPlatform,
        youtubeStreamKey: streamKeyInput?.trim() || undefined,
        sourceType: resolvedSourceType,
        mediaId: isCamera || isYouTube ? undefined : (mediaSchedules[0]?.mediaId || selectedMediaId || undefined),
        mediaSchedules: isLocalMedia ? mediaSchedules.map((s, idx) => ({
          mediaId: s.mediaId,
          title: s.title || `Media Clip #${idx + 1}`,
          durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 30),
          order: idx
        })) : [],
        cameraId: firstSlot?.cameraType === 'RTSP' ? firstSlot.cameraId : (firstRtsp ? firstRtsp.cameraId : undefined),
        cameraSchedules: isCamera ? formattedCameraSchedules : [],
        localCameraDevice: firstSlot?.cameraType === 'WEBCAM' ? firstSlot.deviceName : (firstWebcam ? firstWebcam.deviceName : (isLocalCam ? selectedLocalCamera : undefined)),
        audioSourceType,
        audioMediaId: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? (selectedAudioMediaIds[0] || selectedAudioMediaId || undefined) : undefined,
        audioMediaIds: (audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') ? selectedAudioMediaIds : [],
        audioDeviceName: (audioSourceType === 'MICROPHONE' || audioSourceType === 'MIC_AND_TRACK') ? selectedAudioDevice : undefined,
        audioTrackVolume: Number(audioTrackVolume),
        micVolume: Number(micVolume),
        loopAudio,
        youtubeUrl: isYouTube ? effectiveYoutubeUrl : undefined,
        youtubeSchedules: isYouTube ? youtubeSchedules.map((s, idx) => ({
          youtubeUrl: s.youtubeUrl.trim(),
          title: s.title || `YouTube Video #${idx + 1}`,
          durationSeconds: Math.max(1, parseInt(s.durationSeconds, 10) || 30),
          order: idx
        })) : [],
        title,
        description,
        loopVideo,
        fps: Number(fps) === 60 ? 60 : 30,
        youtubeResolution: youtubeResolution || '1080p',
        youtubeFps: Number(youtubeFps) === 60 ? 60 : (Number(fps) === 60 ? 60 : 30),
        scheduleName: scheduleName?.trim() || null,
        scheduleMode,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        daysOfWeek,
        dailyStartTime,
        dailyEndTime,
        enableDailyWindow,
        scheduledStartTime: parsedScheduledStartTime,
        startImmediately: effectiveStartImmediately,
        timezone,
        facebookMode,
        completionMode: isRecurring ? 'INDEFINITE' : (durationPreset === 'indefinite' ? 'INDEFINITE' : 'DURATION'),
        repeatMode: isRecurring ? 'INDEFINITE' : (durationPreset === 'indefinite' ? 'INDEFINITE' : 'DURATION'),
        totalDurationHours: isRecurring ? null : (durationPreset === 'indefinite' ? null : calculatedDurationHours),
        totalDurationSec: isRecurring ? null : (durationPreset === 'indefinite' ? null : calculatedDurationSec),
        targetEndTime: isRecurring ? null : (durationPreset === 'indefinite' ? null : (calculatedCompletionTime ? calculatedCompletionTime.toISOString() : null)),
      };

      if (isEditMode) {
        const res = await automationAPI.update(id, payload);
        alert(res.data.message || 'Automation updated successfully!');
        navigate(`/automations/${id}`);
      } else {
        const res = await automationAPI.create(payload);
        navigate(`/automations/${res.data.automation._id}`);
      }
    } catch (err) {
      alert(`Failed to save automation changes: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const isLiveStreamRunning = editingAutomation && ['LIVE', 'ACTIVE', 'STREAMING'].includes(editingAutomation.status);
  const isLive = Boolean(isLiveStreamRunning);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight flex items-center gap-3">
            <span>{isEditMode ? 'Modify Live Automation & Modules' : 'Schedule Live Broadcast'}</span>
            {isLiveStreamRunning ? (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                ● LIVE BROADCAST ACTIVE
              </span>
            ) : (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Facebook & YouTube Live
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {isEditMode
              ? `Editing "${editingAutomation?.name || scheduleName || title}" — Update stream video source, audio mixing, destinations, schedule, or timezone.`
              : 'Stream live from your camera with microphone, backing track, or singer audio mix.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Choose Destination (Facebook or YouTube - Multi-Selection Supported!) */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Tv className="w-4 h-4" />
              <span>1. Select Live Streaming Destination(s)</span>
              {selectedPageIds.length > 0 && (
                <span className="ml-1 px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
                  {selectedPageIds.length} Selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {filteredPages.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllDestinations}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700/60"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {filteredPages.every(p => selectedPageIds.some(id => String(id) === String(p.id || p._id)))
                      ? (destinationFilter === 'ALL' ? 'Deselect All' : `Deselect ${destinationFilter.charAt(0) + destinationFilter.slice(1).toLowerCase()}`)
                      : (destinationFilter === 'ALL' ? '+ Select All' : `+ Select All ${destinationFilter.charAt(0) + destinationFilter.slice(1).toLowerCase()}`)}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowConnectModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
              >
                <Key className="w-3.5 h-3.5" />
                <span>+ Connect Facebook / YouTube</span>
              </button>
            </div>
          </div>

          {pages.length > 0 && selectedPageIds.length > 1 && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-purple-900/30 via-indigo-900/20 to-slate-900 border border-indigo-500/30 flex items-center justify-between text-xs">
              <span className="text-indigo-200 font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Simultaneous Multi-Destination Live Stream Active: Broadcast will stream live to all {selectedPageIds.length} selected platforms at the same time!</span>
              </span>
            </div>
          )}

          {/* Destination Platform Filter Tabs */}
          {pages.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-slate-800/80 pb-3">
              <span className="text-xs text-slate-400 font-semibold mr-1 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>Filter Platform:</span>
              </span>

              <button
                type="button"
                onClick={() => setDestinationFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  destinationFilter === 'ALL'
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/60'
                }`}
              >
                <span>All</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${destinationFilter === 'ALL' ? 'bg-blue-800/80 text-blue-100' : 'bg-slate-800 text-slate-400'}`}>
                  {pages.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDestinationFilter('FACEBOOK')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  destinationFilter === 'FACEBOOK'
                    ? 'bg-blue-700 text-white border-blue-500 shadow-md shadow-blue-700/30 ring-1 ring-blue-400'
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  destinationFilter === 'YOUTUBE'
                    ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30 ring-1 ring-red-400'
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
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                  destinationFilter === 'OTHERS'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
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
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto text-amber-400" />
              <p className="text-sm text-slate-200 font-semibold">No Streaming Destination Connected Yet</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Connect YouTube Live, Facebook Page, or stream key to begin live broadcasting.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setConnectTab('youtube_stream_key');
                    setShowConnectModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/20 transition-all flex items-center gap-1.5"
                >
                  <Youtube className="w-4 h-4" />
                  <span>Connect YouTube Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConnectTab('facebook_stream_key');
                    setShowConnectModal(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 transition-all flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Connect Facebook Live</span>
                </button>
              </div>
            </div>
          ) : filteredPages.length === 0 ? (
            <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800 text-center space-y-3">
              <AlertCircle className="w-7 h-7 mx-auto text-slate-400" />
              <p className="text-sm text-slate-300 font-semibold">No destinations connected under "{destinationFilter}"</p>
              <p className="text-xs text-slate-500">Connect a destination for this platform or switch to another filter.</p>
              <button
                type="button"
                onClick={() => setDestinationFilter('ALL')}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition-all"
              >
                Show All Destinations ({pages.length})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredPages.map((p) => {
                const isYT = p.platform === 'YOUTUBE' || p.category?.includes('YouTube') || p.name?.toLowerCase().includes('youtube');
                const isSelected = selectedPageIds.some((id) => String(id) === String(p.id || p._id));

                return (
                  <div
                    key={p.id || p._id}
                    onClick={() => toggleDestination(p.id || p._id)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center gap-3 relative select-none ${
                      isSelected
                        ? isYT 
                          ? 'bg-red-600/10 border-red-500 shadow-lg shadow-red-600/10 ring-1 ring-red-500' 
                          : 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-600/10 ring-1 ring-blue-500'
                        : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={p.pictureUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100'}
                        alt={p.name}
                        className={`w-11 h-11 rounded-xl object-cover border ${isSelected ? 'border-slate-600' : 'border-slate-800 opacity-60'}`}
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
                      <p className={`font-bold text-sm truncate ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isYT ? (
                          <>
                            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.2 rounded">
                              YOUTUBE LIVE
                            </span>
                            <span className="text-[9px] font-bold text-slate-300 bg-slate-800 border border-slate-700/60 px-1.5 py-0.2 rounded font-mono">
                              {(p.resolution || '1080p').toUpperCase()} {p.fps || 30}FPS
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.2 rounded">
                            FACEBOOK LIVE
                          </span>
                        )}
                        {p.isMock && (
                          <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded">
                            MOCK
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSelected ? (
                        <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700 hover:bg-slate-700 hover:text-slate-200">
                          + Add
                        </span>
                      )}
                      <button
                        type="button"
                        title="Remove Destination"
                        onClick={(e) => handleDeletePage(e, p.id || p._id)}
                        className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 transition-colors"
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

        {/* Section 2: Choose Video Source */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Video className="w-4 h-4" />
              <span>2. Select Video Source (Camera / Media)</span>
            </div>
            {sourceType === 'LOCAL_CAMERA' && (
              <button
                type="button"
                onClick={loadDevices}
                disabled={isScanningDevices}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanningDevices ? 'animate-spin text-blue-400' : ''}`} />
                <span>Rescan Webcams</span>
              </button>
            )}
          </div>

          {/* Source Type Selector Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSourceType('LOCAL_CAMERA')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                sourceType === 'LOCAL_CAMERA' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Laptop / USB Webcam</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('RTSP_CAMERA')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>CCTV / IP Camera (RTSP)</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('VIDEO_FILE')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                sourceType === 'VIDEO_FILE' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Video / Image File</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceType('YOUTUBE_VIDEO')}
              className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                sourceType === 'YOUTUBE_VIDEO' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Youtube className="w-4 h-4" />
              <span>YouTube Video</span>
            </button>
          </div>

          {/* Unified Camera Source Selector (CCTV & Webcam) */}
          {(sourceType === 'LOCAL_CAMERA' || sourceType === 'RTSP_CAMERA' || sourceType === 'ONVIF_CAMERA') && (
            <div className="space-y-4">
              {/* CCTV Cameras Section */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-blue-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-200">CCTV / IP Cameras (RTSP)</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Select IP cameras to include in your live stream playlist.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/cameras"
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      + Add CCTV Camera
                    </Link>
                  </div>
                </div>

                {cameras.length === 0 ? (
                  <div className="text-center py-6 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 space-y-2">
                    <Radio className="w-6 h-6 text-slate-500 mx-auto" />
                    <p className="text-xs text-slate-400">No CCTV cameras connected yet.</p>
                    <Link
                      to="/cameras"
                      className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-xs font-semibold inline-block border border-blue-500/40"
                    >
                      Connect RTSP Camera
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                    {cameras.map((c) => {
                      const cId = String(c.id || c._id);
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
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                            count > 0
                              ? 'bg-blue-600/15 border-blue-500/80 text-slate-100 shadow-md ring-1 ring-blue-500/40'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <Radio className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <h4 className="text-xs font-bold text-slate-100 truncate">{c.name}</h4>
                            </div>
                            <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{c.maskedRtspUrl}</p>
                            {count > 0 && (
                              <p className="text-[10px] text-blue-300 mt-1 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                                <span>In Sequence ({count}x): #{occurrences.join(', #')}</span>
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCameraTarget({ ...c, isWebcam: false, type: 'CCTV' });
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-slate-700 transition-all shadow-sm"
                              title="Edit Camera Details"
                            >
                              <Edit2 className="w-3 h-3 text-slate-400" />
                              <span>Edit</span>
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
                              className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-blue-500/40 transition-all shadow-sm"
                              title="Add another instance to rotation"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Laptop & USB Webcams Section */}
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-400" />
                    <div>
                      <span className="text-xs font-bold text-slate-200">Laptop & USB Webcams</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Select connected webcam devices to include in your live stream playlist.
                      </p>
                    </div>
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
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                    <span>No webcam devices detected.</span>
                    <button type="button" onClick={loadDevices} className="text-indigo-400 underline">Scan Now</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
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
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                            count > 0
                              ? 'bg-indigo-600/15 border-indigo-500/80 text-slate-100 shadow-md ring-1 ring-indigo-500/40'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="flex items-center gap-2">
                              <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span className="text-xs font-bold truncate">{dev.label || dev.name}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 truncate">DirectShow USB / Built-in Camera</p>
                            {count > 0 && (
                              <p className="text-[10px] text-indigo-300 mt-1 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-indigo-400 shrink-0" />
                                <span>In Sequence ({count}x): #{occurrences.join(', #')}</span>
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingCameraTarget({ ...dev, isWebcam: true, type: 'WEBCAM', deviceName: dev.name });
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-slate-700 transition-all shadow-sm"
                              title="Rename Webcam"
                            >
                              <Edit2 className="w-3 h-3 text-slate-400" />
                              <span>Rename</span>
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
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-indigo-500/40 transition-all shadow-sm"
                              title="Add another instance to rotation"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Combined Camera Cycle Sequence & Seconds Duration Playlist */}
              {cameraSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-5 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
                    <Camera className="w-4 h-4 text-slate-500" />
                    <span>No Cameras Selected in Sequence</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Click <span className="text-blue-400 font-semibold">+ Add</span> on any CCTV camera or Webcam above to include it in your broadcast rotation.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-500/25 bg-blue-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Camera Cycle Sequence & Seconds Duration
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {cameraSchedules.length > 1 && (
                        <span className="text-[10px] text-blue-300 font-medium flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-blue-400" />
                          Drag up/down to reorder
                        </span>
                      )}
                      <span className="text-[11px] text-blue-400/80 font-mono">
                        {cameraSchedules.length} {cameraSchedules.length === 1 ? 'Slot' : 'Slots'} in Rotation
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

                  <div className="space-y-2">
                    {cameraSchedules.map((item, index) => {
                      const isWebcam = item.cameraType === 'WEBCAM' || Boolean(item.deviceName);
                      let displayName = item.cameraName;
                      let displaySub = isWebcam ? 'DirectShow Webcam' : 'RTSP Stream';

                      if (!isWebcam) {
                        const camObj = cameras.find((c) => String(c.id || c._id) === String(item.cameraId));
                        if (camObj) {
                          displayName = camObj.name;
                          displaySub = camObj.maskedRtspUrl;
                        }
                      } else {
                        const devObj = videoDevices.find((d) => d.name === item.deviceName);
                        if (devObj) {
                          displayName = devObj.label || devObj.name;
                        }
                      }
                      if (!displayName) {
                        displayName = isWebcam ? (item.deviceName || `Webcam #${index + 1}`) : `CCTV Camera #${index + 1}`;
                      }

                      const isDragging = draggedCameraIndex === index;
                      const isDragOver = dragOverCameraIndex === index && !isDragging;
                      const slotKey = item.scheduleId || `${item.cameraType || 'c'}-${item.cameraId || item.deviceName}-${index}`;

                      return (
                        <div
                          key={slotKey}
                          draggable={cameraSchedules.length > 1}
                          onDragStart={(e) => handleCameraDragStart(e, index)}
                          onDragOver={(e) => handleCameraDragOver(e, index)}
                          onDrop={(e) => handleCameraDrop(e, index)}
                          onDragEnd={handleCameraDragEnd}
                          className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-2.5 rounded-xl border text-xs transition-all select-none ${
                            cameraSchedules.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isLiveStreamRunning && liveStreamingSlotIndex === index
                              ? 'bg-rose-950/20 border-rose-500/70 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
                              : isDragging
                              ? 'opacity-40 bg-blue-900/40 border-2 border-dashed border-blue-400'
                              : isDragOver
                              ? 'bg-blue-600/20 border-2 border-blue-400 shadow-lg scale-[1.01]'
                              : isLiveStreamRunning && liveStreamingSlotIndex === index
                              ? 'bg-slate-950/90 border-rose-500/70 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40'
                              : 'bg-slate-950/80 border-slate-800 hover:border-blue-500/40'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {cameraSchedules.length > 1 && (
                              <GripVertical className="w-4 h-4 text-slate-500 hover:text-blue-300 shrink-0" />
                            )}
                            <span
                              className={`shrink-0 w-6 h-6 rounded-full font-bold flex items-center justify-center text-[11px] ${
                                isLiveStreamRunning && liveStreamingSlotIndex === index
                                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/40'
                                  : 'bg-blue-600/30 border border-blue-500/40 text-blue-300'
                              }`}
                            >
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                    isWebcam
                                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  }`}
                                >
                                  {isWebcam ? 'Webcam' : 'CCTV'}
                                </span>
                                <p className="font-semibold text-slate-200 truncate">{displayName}</p>
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
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{displaySub}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-auto">
                            {/* Always visible: Active Selection Badge or Dedicated Select Button for Instant Streaming */}
                            {liveStreamingSlotIndex === index ? (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold text-xs animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                                <span>Selected {isLiveStreamRunning ? `(Streaming ${liveSlotRemainingSec}s)` : '(Active)'}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={switchingCameraSlotIndex !== null}
                                onClick={(e) => handleInstantSwitchCameraSlot(index, e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all hover:scale-105 disabled:opacity-50"
                                title="Select this camera for instant streaming"
                              >
                                {switchingCameraSlotIndex === index ? (
                                  <>
                                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Selecting...</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
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
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                              title="Remove this slot from rotation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cycle Flow Preview Banner */}
                  <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    {cameraSchedules.length > 1 ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-blue-300">
                          <Repeat className="w-3.5 h-3.5" />
                          <span>Continuous Cycling Plan:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-slate-300">
                          {cameraSchedules.map((s, idx) => {
                            const isW = s.cameraType === 'WEBCAM' || Boolean(s.deviceName);
                            let nm = s.cameraName;
                            if (!isW) {
                              const c = cameras.find((cam) => String(cam.id || cam._id) === String(s.cameraId));
                              if (c) nm = c.name;
                            } else {
                              const dev = videoDevices.find((d) => d.name === s.deviceName);
                              if (dev) nm = dev.label || dev.name;
                            }
                            if (!nm) nm = isW ? 'Webcam' : 'CCTV';
                            const dur = s.durationSeconds || 20;

                            return (
                              <React.Fragment key={`${s.cameraType || 'c'}-${s.cameraId || s.deviceName || idx}`}>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium ${
                                  isW
                                    ? 'bg-indigo-900/40 border-indigo-700/50 text-indigo-200'
                                    : 'bg-blue-900/40 border-blue-700/50 text-blue-200'
                                }`}>
                                  <span className="font-bold">#{idx + 1}</span> {nm} ({dur}s)
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
                            {cameraSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 20), 0)} seconds
                          </strong>
                          . The stream will switch cameras smoothly and loop continuously until broadcast ends.
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-300">
                        Single camera active:{' '}
                        <strong className="text-blue-300">
                          {cameraSchedules[0]?.cameraName || (cameraSchedules[0]?.cameraType === 'WEBCAM' ? (cameraSchedules[0]?.deviceName || 'Webcam') : 'CCTV Camera')}
                        </strong>{' '}
                        will broadcast continuously. (Select more CCTV or Webcam cameras above to enable multi-camera rotation).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {sourceType === 'YOUTUBE_VIDEO' && (
            <div className="space-y-4">
              {/* YouTube Video URL Input & Quick Add Section */}
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
                  Add multiple YouTube video links with duration in seconds to create a continuous live stream rotation playlist. You can repeat the same YouTube link multiple times and drag to reorder.
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

          {(sourceType === 'VIDEO_FILE' || sourceType === 'IMAGE') && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-300">
                    Uploaded Videos & Images ({videoMediaList.length})
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Click <strong>+ Add</strong> on clips to build a continuous rotation sequence playlist (like CCTV cameras).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCreateSampleMedia('VIDEO')}
                    disabled={isCreatingSample}
                    className="text-xs px-2.5 py-1 rounded-lg bg-purple-600/10 text-purple-300 border border-purple-500/30 font-semibold hover:bg-purple-600/20"
                  >
                    + Sample Video
                  </button>
                  <label className="cursor-pointer text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-500">
                    {isUploadingMedia ? `Uploading (${uploadProgress}%)...` : '+ Upload Video'}
                    <input type="file" accept="video/*,image/*,.mp4,.mov,.mkv,.webm,.avi,.flv,.wmv,.m4v,.3gp,.mpeg,.mpg,.mpe,.m2v,.ts,.m2ts,.mts,.vob" onChange={handleFileUpload} disabled={isUploadingMedia} className="hidden" />
                  </label>
                </div>
              </div>

              {videoMediaList.length === 0 ? (
                <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl text-xs text-slate-400">
                  No video files uploaded yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-56 overflow-y-auto">
                  {videoMediaList.map((m) => {
                    const mId = String(m._id || m.id);
                    const occurrences = getMediaScheduleOccurrences(mId);
                    const count = occurrences.length;
                    const isSelected = String(selectedMediaId) === mId;
                    const isImg = m.mediaType === 'IMAGE' || /\.(jpe?g|png|webp|bmp|gif)$/i.test(m.filename || m.originalName || '');

                    return (
                      <div
                        key={mId}
                        onClick={() => handleAddMediaSchedule(m)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                          count > 0 || isSelected
                            ? 'bg-blue-600/10 border-blue-500/70 shadow-md ring-1 ring-blue-500/50'
                            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-bold text-xs text-slate-200 truncate">{m.originalName || m.filename}</p>
                            <span className="text-[10px] text-slate-400">
                              {isImg ? 'Image File' : (m.durationSec ? `${m.durationSec}s Video` : 'Video File')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddMediaSchedule(m);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-[11px] font-bold flex items-center gap-1 border border-blue-500/40 transition-all shadow-sm shrink-0"
                            title="Add to sequence rotation"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add</span>
                          </button>
                        </div>
                        {count > 0 && (
                          <div className="flex items-center gap-1 text-[10px] text-blue-300 font-semibold mt-2">
                            <CheckCircle2 className="w-3 h-3 text-blue-400 shrink-0" />
                            <span>In Sequence ({count}x): #{occurrences.join(', #')}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Combined Sequence & Seconds Duration Playlist */}
              {mediaSchedules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-5 text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold">
                    <Video className="w-4 h-4 text-slate-500" />
                    <span>No Videos / Images in Sequence</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Click <span className="text-blue-400 font-semibold">+ Add</span> on any clip above to build your continuous playlist rotation.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-blue-500/25 bg-blue-950/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-bold text-slate-200">
                        Video / Image Cycle Sequence & Duration
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {mediaSchedules.length > 1 && (
                        <span className="text-[10px] text-blue-300 font-medium flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-blue-400" />
                          Drag up/down to reorder
                        </span>
                      )}
                      <span className="text-[11px] text-blue-400/80 font-mono">
                        {mediaSchedules.length} {mediaSchedules.length === 1 ? 'Slot' : 'Slots'} in Rotation
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {mediaSchedules.map((item, index) => {
                      const isDragging = draggedMediaIndex === index;
                      const isDragOver = dragOverMediaIndex === index && !isDragging;
                      const slotKey = item.scheduleId || `media_slot_${index}`;
                      const clipDoc = videoMediaList.find((m) => String(m._id || m.id) === String(item.mediaId));
                      const clipTitle = item.title || clipDoc?.originalName || clipDoc?.filename || `Media Clip #${index + 1}`;

                      return (
                        <div
                          key={slotKey}
                          draggable={mediaSchedules.length > 1}
                          onDragStart={(e) => handleMediaDragStart(e, index)}
                          onDragOver={(e) => handleMediaDragOver(e, index)}
                          onDrop={(e) => handleMediaDrop(e, index)}
                          onDragEnd={handleMediaDragEnd}
                          className={`flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 p-2.5 rounded-xl border text-xs transition-all select-none ${
                            mediaSchedules.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            isDragging
                              ? 'opacity-40 scale-[0.98] border-dashed border-blue-400 bg-blue-950/40'
                              : isDragOver
                              ? 'border-blue-400 bg-blue-900/30 ring-2 ring-blue-500/40 shadow-lg'
                              : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {mediaSchedules.length > 1 && (
                              <GripVertical className="w-4 h-4 text-slate-500 hover:text-blue-300 shrink-0" />
                            )}
                            <span className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/30">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate max-w-xs sm:max-w-md">{clipTitle}</p>
                              <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                                {clipDoc?.durationSec ? `Original: ${clipDoc.durationSec}s` : 'Image / Video Clip'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 ml-auto">
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
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 border border-slate-700"
                              title="Duplicate slot in rotation"
                            >
                              <Copy className="w-3 h-3 text-slate-400" />
                              <span className="hidden sm:inline">Duplicate</span>
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
                              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                              title="Remove this clip from rotation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cycle Flow Preview Banner */}
                  <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    {mediaSchedules.length > 1 ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-blue-300">
                          <Repeat className="w-3.5 h-3.5" />
                          <span>Continuous Playlist Cycle Plan:</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-slate-300">
                          {mediaSchedules.map((s, idx) => {
                            const clip = videoMediaList.find((m) => String(m._id || m.id) === String(s.mediaId));
                            const nm = s.title || clip?.originalName || clip?.filename || `Clip #${idx + 1}`;
                            const dur = s.durationSeconds || 30;

                            return (
                              <React.Fragment key={`${s.mediaId || idx}-${idx}`}>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border font-medium bg-blue-900/40 border-blue-700/50 text-blue-200">
                                  <span className="font-bold">#{idx + 1}</span> {nm} ({dur}s)
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
                            {mediaSchedules.reduce((acc, s) => acc + (parseInt(s.durationSeconds, 10) || 30), 0)} seconds
                          </strong>
                          . The stream will stitch/loop the clips seamlessly and broadcast continuously until broadcast ends.
                        </p>
                      </div>
                    ) : (
                      <p className="text-slate-300">
                        Single video active:{' '}
                        <strong className="text-blue-300">
                          {mediaSchedules[0]?.title || videoMediaList.find((m) => String(m._id || m.id) === String(mediaSchedules[0]?.mediaId))?.originalName || 'Video/Image Clip'}
                        </strong>{' '}
                        will broadcast continuously. (Click + Add on more video clips above to enable multi-video rotation).
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2.5: AUDIO CONFIGURATION (Live Mic / MP3 / Singer Mix) */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-slate-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <Mic className="w-4 h-4" />
              <span>3. Live Audio Source (Singer Mic / MP3 / Mixed)</span>
            </div>
            <button
              type="button"
              onClick={loadDevices}
              disabled={isScanningDevices}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
            >
              <RefreshCw className={`w-3 h-3 ${isScanningDevices ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Refresh Microphones</span>
            </button>
          </div>

          {/* Audio Source Mode Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setAudioSourceType('MICROPHONE')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                audioSourceType === 'MICROPHONE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Live Mic</span>
            </button>

            <button
              type="button"
              onClick={() => setAudioSourceType('UPLOADED_AUDIO')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                audioSourceType === 'UPLOADED_AUDIO' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Uploaded MP3</span>
            </button>

            <button
              type="button"
              onClick={() => setAudioSourceType('MIC_AND_TRACK')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                audioSourceType === 'MIC_AND_TRACK' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate">Singer Mode</span>
            </button>

            <button
              type="button"
              onClick={() => setAudioSourceType('CAMERA_AUDIO')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                audioSourceType === 'CAMERA_AUDIO' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Camera Audio</span>
            </button>

            <button
              type="button"
              onClick={() => setAudioSourceType('SILENT')}
              className={`py-2.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                audioSourceType === 'SILENT' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Silent</span>
            </button>
          </div>

          {/* Configuration for Selected Audio Mode */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-4">
            {/* Microphone Selection (shown for MICROPHONE or MIC_AND_TRACK) */}
            {(audioSourceType === 'MICROPHONE' || audioSourceType === 'MIC_AND_TRACK') && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Select Microphone (Laptop Mic or External USB Microphone)</span>
                </label>
                {audioDevices.length === 0 ? (
                  <p className="text-xs text-slate-400">No microphones detected. Click "Refresh Microphones" above.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {audioDevices.map((dev) => (
                      <div
                        key={dev.name}
                        onClick={() => setSelectedAudioDevice(dev.name)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          selectedAudioDevice === dev.name
                            ? 'bg-indigo-600/20 border-indigo-500 text-slate-100 shadow-md ring-1 ring-indigo-500'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Mic className="w-4 h-4 text-indigo-400 shrink-0" />
                          <span className="text-xs font-semibold truncate">{dev.label || dev.name}</span>
                        </div>
                        {selectedAudioDevice === dev.name && <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MP3 Backing Track Selection & Playlist (shown for UPLOADED_AUDIO or MIC_AND_TRACK) */}
            {(audioSourceType === 'UPLOADED_AUDIO' || audioSourceType === 'MIC_AND_TRACK') && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5 text-purple-400" />
                      <span>Select Audio / MP3 / MPEG Tracks (Loops Repeatably)</span>
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Select one or multiple audio tracks (MP3, MPEG, MPG, WAV, AAC, M4A, FLAC) to create a playlist that plays sequentially and loops continuously.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedAudioMediaIds.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAudioPlaylist}
                        className="text-xs px-2 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700/50 font-semibold transition-colors"
                      >
                        Clear All
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCreateSampleMedia('AUDIO')}
                      disabled={isCreatingSample}
                      className="text-xs px-2.5 py-1 rounded-lg bg-purple-600/10 text-purple-300 border border-purple-500/30 font-semibold hover:bg-purple-600/20"
                    >
                      + Demo Track
                    </button>
                    <label className="cursor-pointer text-xs px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors">
                      {isUploadingAudio ? `Uploading (${audioUploadProgress}%)...` : '+ Upload Audio / MP3(s)'}
                      <input type="file" accept="audio/*,video/mpeg,audio/mpeg,.mp3,.mpeg,.mpg,.mpe,.mp2,.mpa,.wav,.m4a,.aac,.ogg,.flac,.wma" multiple onChange={handleAudioUpload} disabled={isUploadingAudio} className="hidden" />
                    </label>
                  </div>
                </div>

                {audioMediaList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-center text-xs text-slate-400">
                    No MP3 backing tracks uploaded yet. Click "+ Upload MP3(s)" or "+ Demo MP3 Track".
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                    {audioMediaList.map((m) => {
                      const trackIdStr = String(m._id || m.id);
                      const playlistIndex = selectedAudioMediaIds.indexOf(trackIdStr);
                      const isSelected = playlistIndex !== -1;
                      return (
                        <div
                          key={trackIdStr}
                          onClick={() => toggleTrackInPlaylist(trackIdStr)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between select-none ${
                            isSelected
                              ? 'bg-purple-600/20 border-purple-500 text-slate-100 shadow-md ring-1 ring-purple-500'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-purple-500 text-white font-bold text-xs' : 'bg-slate-800 text-purple-400'}`}>
                              {isSelected ? `#${playlistIndex + 1}` : <Music className="w-3.5 h-3.5" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold truncate">{m.originalName}</p>
                              <p className="text-[10px] text-slate-400">{m.durationSec ? `${m.durationSec}s` : 'Audio track'}</p>
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="text-[11px] font-bold text-purple-300 bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 rounded-full shrink-0">
                              In Queue
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 hover:text-purple-300 shrink-0 font-medium">
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
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2.5">
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

                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
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
                        <strong>Seamless Looping:</strong> Plays tracks 1 to {selectedAudioMediaIds.length} in order, then immediately loops back to Track #1.
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
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                    <span className="flex items-center gap-1"><Mic className="w-3.5 h-3.5 text-indigo-400" /> Singer Mic Volume</span>
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
                  <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-1">
                    <span className="flex items-center gap-1"><Music className="w-3.5 h-3.5 text-purple-400" /> MP3 Backing Track Volume</span>
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

            {audioSourceType === 'CAMERA_AUDIO' && (
              <p className="text-xs text-slate-400">
                Captures live audio stream directly from the CCTV / RTSP camera microphone.
              </p>
            )}

            {audioSourceType === 'SILENT' && (
              <p className="text-xs text-slate-400">
                Generates a synthetic silent audio stream for quiet video broadcasts without background noise.
              </p>
            )}
          </div>
        </div>

        {/* Section 4: Live Broadcast Details */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>4. Live Stream Title & Description</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Live Broadcast Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Live Singing & Acoustic Concert"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Live Broadcast Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Write a message to your live audience..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

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
        </div>

        {/* Section 5: Start Time & Duration */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              <span>5. Start Time, Schedule & Timezone</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-semibold hidden sm:inline">Operating Timezone:</span>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-lg">
                {timezone}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {/* Operating Timezone Selector */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Select Schedule Timezone</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  Detected Local: <strong className="text-slate-200">{userDetectedTz}</strong>
                </span>
              </div>
              <select
                value={timezone}
                onChange={(e) => {
                  const newTz = e.target.value;
                  setTimezone(newTz);
                  const nextHour = new Date(Date.now() + 3600 * 1000);
                  nextHour.setMinutes(Math.ceil(nextHour.getMinutes() / 15) * 15, 0, 0);
                  setScheduledStartTime(formatDateTimeLocal(nextHour, newTz));
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:border-indigo-500 focus:outline-none font-sans"
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 pt-0.5">
                All scheduled start times, daily operational windows, and date ranges will be calculated according to this timezone.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">Operating Schedule Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  onClick={() => {
                    setScheduleMode('IMMEDIATE');
                    setStartImmediately(true);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    scheduleMode === 'IMMEDIATE'
                      ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-600/10 ring-1 ring-blue-500'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" /> Start Live Now
                    </span>
                    {scheduleMode === 'IMMEDIATE' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-xs text-slate-400">Launch stream immediately upon submitting.</p>
                </div>

                <div
                  onClick={() => {
                    setScheduleMode('ONE_TIME_FUTURE');
                    setStartImmediately(false);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    scheduleMode === 'ONE_TIME_FUTURE'
                      ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-600/10 ring-1 ring-blue-500'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-400" /> One-Time Future Date
                    </span>
                    {scheduleMode === 'ONE_TIME_FUTURE' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-xs text-slate-400">Schedule to start live at a specific future date and time.</p>
                </div>

                <div
                  onClick={() => {
                    setScheduleMode('RECURRING_WINDOW');
                    setStartImmediately(false);
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    scheduleMode === 'RECURRING_WINDOW'
                      ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-600/10 ring-1 ring-blue-500'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-200 flex items-center gap-1.5">
                      <RotateCw className="w-4 h-4 text-purple-400" /> Recurring Daily Window
                    </span>
                    {scheduleMode === 'RECURRING_WINDOW' && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </div>
                  <p className="text-xs text-slate-400">Auto-start daily at specific start & end times.</p>
                </div>
              </div>

              {/* Detail Card for ONE_TIME_FUTURE */}
              {scheduleMode === 'ONE_TIME_FUTURE' && (
                <div className="mt-3 p-4 rounded-xl bg-slate-950 border border-blue-500/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-400" />
                      <span>Pick Scheduled Start Date & Time</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs text-slate-400 font-semibold">Timezone:</span>
                      <select
                        value={timezone}
                        onChange={(e) => {
                          const newTz = e.target.value;
                          setTimezone(newTz);
                          const nextHour = new Date(Date.now() + 3600 * 1000);
                          nextHour.setMinutes(Math.ceil(nextHour.getMinutes() / 15) * 15, 0, 0);
                          setScheduledStartTime(formatDateTimeLocal(nextHour, newTz));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                      >
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz.value} value={tz.value} className="bg-slate-900 text-slate-100">
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <input
                    type="datetime-local"
                    required
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-blue-500 focus:outline-none font-mono"
                  />
                  <p className="text-[11px] text-slate-400">
                    Live stream will automatically launch on target platform at this exact time in <span className="text-indigo-300 font-semibold">{timezone}</span>.
                  </p>
                </div>
              )}

              {/* Detail Card for RECURRING_WINDOW (Matches User Mockup Image!) */}
              {scheduleMode === 'RECURRING_WINDOW' && (
                <div className="mt-4 p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-5">
                  {/* Recurring Schedule Timezone Selector Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-purple-400" />
                      <span>Recurring Schedule Timezone</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-xs text-slate-400 font-semibold">Timezone:</span>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-indigo-300 focus:border-indigo-500 focus:outline-none"
                      >
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz.value} value={tz.value} className="bg-slate-900 text-slate-100">
                            {tz.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Date Range (Optional) */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">Date Range (Optional)</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Leave empty for a continuous schedule ({timezone})</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">Start Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1.5">End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Days of Week Selector (Single-letter pills matching mockup!) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-2.5">Days of Week</label>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {[
                        { day: 1, label: 'M', fullName: 'Monday' },
                        { day: 2, label: 'T', fullName: 'Tuesday' },
                        { day: 3, label: 'W', fullName: 'Wednesday' },
                        { day: 4, label: 'T', fullName: 'Thursday' },
                        { day: 5, label: 'F', fullName: 'Friday' },
                        { day: 6, label: 'S', fullName: 'Saturday' },
                        { day: 0, label: 'S', fullName: 'Sunday' },
                      ].map((item) => {
                        const isSelected = daysOfWeek.includes(item.day);
                        return (
                          <button
                            key={item.day}
                            type="button"
                            title={item.fullName}
                            onClick={() => {
                              if (isSelected) {
                                setDaysOfWeek(daysOfWeek.filter((d) => d !== item.day));
                              } else {
                                setDaysOfWeek([...daysOfWeek, item.day]);
                              }
                            }}
                            className={`h-11 w-11 sm:h-12 sm:w-14 rounded-xl text-sm font-bold transition-all flex items-center justify-center ${
                              isSelected
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400'
                                : 'bg-slate-900 border border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Daily Operating Hours (Start Time & End Time) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
                        <span>Start Time</span>
                        <span className="text-[11px] text-indigo-400 font-medium">({timezone})</span>
                      </label>
                      <div className="relative">
                        <input
                          type="time"
                          value={dailyStartTime}
                          onChange={(e) => setDailyStartTime(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
                        <span>End Time</span>
                        <span className="text-[11px] text-indigo-400 font-medium">({timezone})</span>
                      </label>
                      <div className="relative">
                        <input
                          type="time"
                          value={dailyEndTime}
                          onChange={(e) => setDailyEndTime(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-sm focus:border-indigo-500 focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Target Duration Presets */}
            {scheduleMode !== 'RECURRING_WINDOW' && (
              <div className="space-y-3 pt-2">
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
                          : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Custom Duration Inputs and Quick Shortcuts */}
                {durationPreset === 'custom_hours' && (
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-blue-500/40 shadow-xl shadow-blue-950/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
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
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                          />
                          <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500 pointer-events-none">hours</span>
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
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-sm font-bold focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                          />
                          <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-500 pointer-events-none">mins</span>
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
                                  : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-600 hover:text-white'
                              }`}
                            >
                              {chip.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Calculated Status Banner */}
                    <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/20 text-xs space-y-1.5">
                      <div className="flex items-center justify-between font-bold">
                        <span className="text-slate-300">Target Duration:</span>
                        <span className="text-blue-400 font-mono text-sm">
                          {formatDurationText(calculatedDurationSec)} ({calculatedDurationSec?.toLocaleString()}s)
                        </span>
                      </div>
                      {calculatedCompletionTime && (
                        <div className="flex items-center justify-between text-slate-400 text-[11px]">
                          <span>Expected Stream Auto-Stop:</span>
                          <span className="text-slate-200 font-semibold font-mono">
                            {calculatedCompletionTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                            {calculatedCompletionTime.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        {calculatedDurationSec <= 17400 ? (
                          <span className="text-emerald-400">
                            ✓ Single continuous live broadcast. Stream will automatically stop cleanly when time expires.
                          </span>
                        ) : (
                          <span className="text-indigo-300">
                            ℹ️ Will auto-rotate {rotationCount} times seamlessly before completing to observe Facebook's continuous live limit.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Preset Info Banner */}
                {durationPreset !== 'custom_hours' && durationPreset !== 'indefinite' && (
                  <div className="flex items-center justify-between text-xs px-3.5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-400">
                    <span>Target Broadcast Time: <strong className="text-slate-200">{durationPreset}</strong></span>
                    {calculatedCompletionTime && (
                      <span>Auto-stop at: <strong className="text-blue-400 font-mono">{calculatedCompletionTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></span>
                    )}
                  </div>
                )}

                {durationPreset === 'indefinite' && (
                  <div className="flex items-center gap-2 text-xs px-3.5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Runs continuously 24/7 forever, auto-rotating every 4h 50m to stay online without human intervention.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || pages.length === 0}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-base shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{isEditMode ? 'Saving & Hot-Restarting Live Stream...' : 'Launching Live Broadcast...'}</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-white" />
                <span>
                  {isEditMode
                    ? (isLiveStreamRunning ? 'Save & Hot-Restart Live Stream' : 'Save Automation Changes')
                    : (startImmediately ? 'Start Live Stream Now' : 'Schedule Live Broadcast')}
                </span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Inline Connection Modal (Facebook or YouTube) */}
      {showConnectModal && (
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
                onClick={() => setShowConnectModal(false)}
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
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{tokenError}</span>
              </div>
            )}

            {tokenSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
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
                        value={modalYoutubeResolution}
                        onChange={(e) => setModalYoutubeResolution(e.target.value)}
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
                        value={modalYoutubeFps}
                        onChange={(e) => setModalYoutubeFps(Number(e.target.value))}
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
                        modalYoutubeResolution === '144p' ? '256 × 144 (16:9)' :
                        modalYoutubeResolution === '240p' ? '426 × 240 (16:9)' :
                        modalYoutubeResolution === '360p' ? '640 × 360 (16:9)' :
                        modalYoutubeResolution === '480p' ? '854 × 480 (16:9)' :
                        modalYoutubeResolution === '720p' ? '1280 × 720 (16:9 HD)' :
                        modalYoutubeResolution === '1080p' ? '1920 × 1080 (16:9 Full HD)' :
                        modalYoutubeResolution === '1440p' ? '2560 × 1440 (16:9 2K QHD)' :
                        '3840 × 2160 (16:9 4K UHD)'
                      }</span>
                      <span className="text-red-400 font-semibold">{
                        modalYoutubeResolution === '144p' ? (modalYoutubeFps === 60 ? '600 Kbps CBR' : '400 Kbps CBR') :
                        modalYoutubeResolution === '240p' ? (modalYoutubeFps === 60 ? '900 Kbps CBR' : '600 Kbps CBR') :
                        modalYoutubeResolution === '360p' ? (modalYoutubeFps === 60 ? '1,500 Kbps CBR' : '1,000 Kbps CBR') :
                        modalYoutubeResolution === '480p' ? (modalYoutubeFps === 60 ? '2,500 Kbps CBR' : '1,500 Kbps CBR') :
                        modalYoutubeResolution === '720p' ? (modalYoutubeFps === 60 ? '4,000 Kbps CBR' : '2,500 Kbps CBR') :
                        modalYoutubeResolution === '1080p' ? (modalYoutubeFps === 60 ? '5,500–6,500 Kbps CBR' : '3,000–3,500 Kbps CBR') :
                        modalYoutubeResolution === '1440p' ? (modalYoutubeFps === 60 ? '16,000 Kbps CBR' : '10,000 Kbps CBR') :
                        (modalYoutubeFps === 60 ? '38,000 Kbps CBR' : '25,000 Kbps CBR')
                      }</span>
                    </div>
                    {modalYoutubeResolution === '144p' && (
                      <p className="text-amber-400 text-[10px]">
                        ⚠️ <em>Note: YouTube Live ingestion officially recommends 240p or higher. 144p is encoded via standard RTMP for ultra-constrained networks.</em>
                      </p>
                    )}
                    {(modalYoutubeResolution === '1440p' || modalYoutubeResolution === '2160p') && (
                      <p className="text-purple-300 text-[10px]">
                        🚀 <em>High Bandwidth: Streaming at {modalYoutubeResolution === '2160p' ? '4K UHD' : '2K QHD'} requires a stable upload speed of at least 35+ Mbps and dedicated encoder hardware.</em>
                      </p>
                    )}
                  </div>
                </>
              ) : connectTab === 'facebook_stream_key' ? (
                <>
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
                  onClick={() => setShowConnectModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingToken}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20"
                >
                  {isSubmittingToken ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{isSubmittingToken ? 'Connecting...' : 'Connect Destination'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default CreateAutomation;
