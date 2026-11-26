# GStreamer Migration Audit Report

**Date:** 2026-11-24  
**Project:** Facebook Live Streamer (FB live auto 2.0)  
**Objective:** Replace FFmpeg live camera streaming engine with a persistent GStreamer architecture supporting D3D11 zero-copy, input-selector camera switching, simultaneous Facebook 1080p60 + YouTube 1440p60 broadcasting, and direct HDMI output.

---

## 1. Inventory of FFmpeg Dependencies

- **`fluent-ffmpeg`** (listed in `backend/package.json`): Used historically for FFmpeg command generation.
- **`ffmpeg.exe` CLI binary**: Bundled in `backend/bin/ffmpeg.exe` and referenced throughout `backend/services/ffmpegService.js`, `backend/services/cameraService.js`, and `backend/services/hardwareEncoderService.js`.
- **`ffprobe.exe` CLI binary**: Bundled in `backend/bin/ffprobe.exe` and referenced for media metadata and RTSP diagnostic testing.

---

## 2. Ingestion & Process Spawning Points

| File | Function / Line | Operation | Migration Plan |
|---|---|---|---|
| `backend/services/ffmpegService.js` | `_spawnStream` | Spawns `ffmpeg.exe` child process for live streaming | Replaced by `GStreamerService` for all camera streaming workflows |
| `backend/services/ffmpegService.js` | `_spawnReorderedStream` | Spawns `ffmpeg.exe` to hot-swap cameras via process restart | Obsolete: Removed. GStreamer `input-selector` switches pads without process restart |
| `backend/services/ffmpegService.js` | `stitchVideoPlaylist` | Uses FFmpeg concat filter to stitch offline video files | Retained for pre-recorded media file playlists only (non-camera) |
| `backend/services/cameraService.js` | `testRtspStream` | Spawns `ffprobe` / `ffmpeg` to probe RTSP stream format | Migrated to GStreamer RTSP discovery (`gst-discoverer-1.0` / GStreamer pipeline probe) |
| `backend/services/cameraService.js` | `verifyFrameDecode` | Decodes 5 frames via FFmpeg | Migrated to GStreamer test decode |
| `backend/services/hardwareEncoderService.js` | `_probeEncoderDirect` | Probes FFmpeg encoders via `testsrc` | Replaced by GStreamer plugin inspector (`gst-inspect-1.0`) for D3D11, QSV, NVENC, AMF |
| `backend/services/mediaService.js` | `probeMedia` | Probes uploaded video file metadata | Retained for VOD / offline file uploads |

---

## 3. FFprobe Dependencies

- `backend/services/cameraService.js`: Probes RTSP stream resolution, video codec, audio codec, and fps.
- `backend/services/mediaToolResolver.js`: Validates tool paths on startup.
- `backend/services/agentService.js`: Probes camera stream status.

*Action:* Camera and RTSP stream validation is migrated to GStreamer runtime discovery.

---

## 4. Camera-Switching Execution Paths

1. **Frontend Trigger**:
   - `frontend/src/components/LiveCameraScheduleSwitcher.jsx` calls `automationAPI.switchCamera(automationId, slotIndex)`
2. **Backend API Route**:
   - `backend/routes/automationRoutes.js`: `POST /api/automations/:id/switch-camera`
3. **Controller**:
   - `backend/controllers/automationController.js`: `switchLiveCamera()`
4. **Service Orchestration**:
   - `backend/services/broadcastService.js`: `switchLiveCamera(automationId, slotIndex)`
   - *Current Implementation:* Invoked `ffmpegService.switchCameraInPlace(broadcastId, targetSlotIndex)` via ZeroMQ and FFmpeg filter `streamselect@camselect`.
   - *Migrated Implementation:* Directly invokes `gstreamerService.switchCamera(slotIndex)` on the persistent GStreamer pipeline. The active pad on `input-selector` changes in $<1\text{ ms}$ without dropping RTMPS or HDMI output.
5. **Scheduled Rotation**:
   - `backend/services/schedulerService.js`: `switchRes = await broadcastService.switchLiveCamera(auto._id, nextSlotIdx, { isManual: false })`
   - *Both manual and automatic switching use the exact same GStreamer `switchCamera(index)` method.*

---

## 5. RTSP Resolution & Ingest Paths

- `cameraService.resolveRtspUrl(camera)`: Resolves raw or encrypted RTSP URLs with percent-encoded credentials.
- `mediamtxService.registerProxyPath(pathName, rawUrl, automationId)`: Registers local MediaMTX RTSP relay paths (`rtsp://127.0.0.1:8554/<pathName>`).
- *GStreamer Pipeline:* Ingests RTSP directly via `rtspsrc protocols=tcp latency=150` with `rtph265depay` / `rtph264depay` into D3D11 zero-copy hardware decoders (`d3d11h265dec` / `d3d11h264dec`).

---

## 6. MediaMTX Dependencies & Assessment

- `backend/services/mediamtxProcessManager.js`: Starts/stops `mediamtx.exe` (RTSP on `8554`, API on `9997`).
- `backend/routes/liveStreamProxyRoutes.js`: Proxies `/whep` (WebRTC) and `/hls` for low-latency web browser previews in the React UI.
- *Decision:* **Keep MediaMTX** for browser-based preview tiles in the Web UI. For live broadcast streaming and HDMI output, the primary engine is **GStreamer**, which pulls camera streams and feeds Facebook, YouTube, and HDMI directly.

---

## 7. Audio Processing

- Current: FFmpeg mixes RTSP audio, uploaded audio, or local microphone into a stereo AAC stream (`-c:a aac -b:a 128k -ar 44100`).
- GStreamer: Audio branch uses `audiomixer` or audio `input-selector` synced to the master pipeline clock, encoded to AAC (`voaacenc` / `avenc_aac` / `mfaccenc`) and fed to each output muxer.

---

## 8. Facebook Output Creation

- Endpoint: Meta Graph API v21.0 Live Video RTMPS URL (`rtmps://live-api-s.facebook.com:443/rtmp/<KEY>`).
- Requirements: Strict H.264 (AVC) Level 4.2 at 1080p60 ($1920\times 1080$), 6,000–8,000 Kbps CBR, GOP 120 (2.0s keyframe), stereo AAC.
- GStreamer Branch: `d3d11scale` $\rightarrow$ `h264 encoder` (`qsvh264enc` / `d3d11h264enc` / `amfh264enc` / `nvh264enc`) $\rightarrow$ `h264parse` $\rightarrow$ `flvmux` $\rightarrow$ `rtmpsink` / `rtmp2sink`.

---

## 9. YouTube Output Creation

- Endpoint: YouTube Live Enhanced RTMPS (`rtmp://a.rtmp.youtube.com/live2/<KEY>`).
- Requirements: 1440p60 ($2560\times 1440$) or 4K60, H.265 (HEVC) or H.264, 12,000–16,000 Kbps CBR, GOP 120 (2.0s keyframe), stereo AAC.
- GStreamer Branch: `d3d11scale` $\rightarrow$ `h265 encoder` (`qsvh265enc` / `d3d11h265enc` / `amfh265enc` / `nvh265enc`) $\rightarrow$ `h265parse` $\rightarrow$ `flvmux` $\rightarrow$ `rtmpsink` / `rtmp2sink`.

---

## 10. HDMI / Local Preview Output

- Current: `ProjectorScreen.jsx` loads WebRTC WHEP / HLS through an Electron / Chromium browser window.
- GStreamer Branch: A dedicated queue on the GPU `tee` branch routes directly to `d3d11videosink` on the target display adapter, bypassing Chromium frame copying and rendering with 0% CPU overhead.

---

## 11. Telemetry Architecture

- Current: Parses FFmpeg stderr lines (`fps=... bitrate=... speed=... drop=...`).
- Migrated: GStreamer pipeline bus monitoring (`GstBus`, `GstMessage`, pad probes, element property queries). Reports:
  - Active camera slot index and name
  - Current FPS & target FPS
  - Dropped frames & decoded frames
  - Instantaneous bitrate
  - Encoder & decoder in use (with verification of true hardware acceleration)
  - Pipeline state (`PLAYING`, `PAUSED`, `SWITCHING`)
  - Destination status (Facebook: CONNECTED, YouTube: CONNECTED, HDMI: ACTIVE)

---

## 12. Tests Assuming FFmpeg

- `backend/tests/ffmpegService.test.js`
- `backend/tests/cameraScheduleAndSwitching.test.js`
- `backend/tests/multiCameraReliability.test.js`
- `backend/tests/multiDestinationResolution.test.js`
- `backend/tests/hardwareAcceleration.test.js`

*Action:* Implement new GStreamer unit and integration test suites (`gstreamerRuntime.test.js`, `gstreamerPipeline.test.js`, `gstreamerSwitching.test.js`) and update legacy tests.
