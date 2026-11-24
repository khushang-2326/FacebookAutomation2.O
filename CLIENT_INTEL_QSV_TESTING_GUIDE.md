# Intel Quick Sync (QSV) Hardware Acceleration Verification Guide

This document is the client verification guide for confirming **Intel GPU Hardware Acceleration (Quick Sync / `h264_qsv`)**, **60 FPS streaming stability**, and **Multi-Camera CPU reduction** in Facebook Live Streamer.

---

## 1. Overview of Fixes Implemented

| Defect Reported | Root Cause | Verified Codebase Fix |
|---|---|---|
| **Intel Quick Sync bypassed** | Encoder candidate priority listed `h264_mf` before `h264_qsv`, and probe used `yuv420p` (which QSV rejects). | **Intel QSV First Priority & NV12**: On Intel systems or `INTEL_QSV` mode, `h264_qsv` is strictly prioritized first with native `nv12` pixel format and live streaming parameters (`-scenario livestreaming`, `-async_depth 4`, `-forced_idr 1`). |
| **Media Foundation False Hardware** | `h264_mf` previously did not pass `-hw_encoding 1`, silently allowing Microsoft software MFT. | **Strict `-hw_encoding 1`**: Forced hardware-only encoding on Media Foundation. If no GPU MFT exists, it fails explicitly rather than falling back silently to CPU. |
| **Lifecycle Disconnect** | `hardwareEncoderService.init()` was only called in unit tests. | **Startup & Pre-Stream Lifecycle**: `hardwareEncoderService.init()` is invoked during `server.js` startup and right before any broadcast starts in `broadcastService.js`. |
| **Multi-Camera CPU Overload** | Continuous CPU decoding and scaling of all inactive cameras before stream selection. | **Post-Selection Scaling & Hardware Decoding**: Hardware decoders (`d3d11va` / `qsv`) ingest feeds directly into `streamselect@camselect`. Scaling, padding, and frame pacing happen **only on the active stream**. |
| **60 FPS Lag** | GOP mismatch and missing 60 FPS validation. | **60 FPS Pacing & CBR 2-Second GOP**: $2 \times \text{FPS}$ GOP (120 at 60 FPS, 60 at 30 FPS), constant bitrate, and automatic frame pacing detection for 30 FPS cameras. |

---

## 2. Prerequisites on the Client Laptop

1. **Intel Graphics Hardware**:
   - Intel UHD Graphics (Gen 9 / 10 / 11 / 12),
   - Intel Iris Xe Graphics, or
   - Intel Arc Dedicated Graphics.
2. **Intel Graphics Driver**:
   - Ensure the official Intel DCH Graphics Driver is up to date (download from [Intel Driver & Support Assistant](https://www.intel.com/content/www/us/en/support/detect.html)).
   - Modern FFmpeg v8.1.1 bundles Intel oneVPL runtime support.
3. **Application Executable**:
   - Run `Facebook Live Streamer.exe` (Permanent License) or `trialexe.exe` (30-Day Trial).

---

## 3. Step-by-Step Verification Procedure

### Test A: Intel QSV Hardware Initialization & Diagnostics
1. Launch `Facebook Live Streamer.exe`.
2. Navigate to **Settings** in the left navigation sidebar.
3. Locate the **GPU Hardware Acceleration & Diagnostics** panel:
   - Verify detected GPU adapter displays your Intel GPU (e.g. `Intel(R) Iris(R) Xe Graphics` or `Intel(R) UHD Graphics`).
   - Notice the **Active Video Encoder** badge shows `h264_qsv (INTEL QSV ENCODING ACTIVE)`.
   - Notice the **Active Video Decoder** badge shows `qsv` or `d3d11va (HARDWARE DECODING ACTIVE)`.
4. In the **Acceleration Policy & Preferred Encoder** selector:
   - Select **INTEL QUICK SYNC (QSV)** (or leave on **AUTO (HARDWARE FIRST)**).
5. Click **"Export Diagnostic Report"** (top right of GPU panel) to download `gpu-diagnostic-report.md`.
   - Verify that `h264_qsv` shows `✓ YES (Verified Functional)`.

---

### Test B: Single CCTV Camera at 30 FPS
1. Go to **Automations** ➔ Create/Edit an Automation.
2. Select your CCTV camera (RTSP stream).
3. Set Frame Rate to **30 FPS**, Resolution to **1080p**.
4. Click **Start Broadcast** (Facebook Live or YouTube Live).
5. Open Windows **Task Manager** (`Ctrl + Shift + Esc`) ➔ **Performance** tab ➔ **GPU**:
   - Verify **GPU Video Decode** engine shows active activity (~5–15%).
   - Verify **GPU Video Encode** engine shows active activity (~10–25%).
   - Verify CPU usage remains low and stable (< 15%).
6. Look at the **Real-Time Telemetry Panel** at the bottom of the stream page:
   - Encoder badge: `⚡ GPU: h264_qsv`
   - Frame rate: stable at `30 fps`
   - Speed: `>= 1.0x` (real-time, no dropped frames).

---

### Test C: Single CCTV Camera at 60 FPS
1. Ensure your camera is configured to output genuine 60 FPS (or high-framerate feed).
2. In the Automation, select **60 FPS** and Resolution **1080p** (or 720p).
3. Start the Live Stream.
4. Check **Task Manager** ➔ **GPU**:
   - Verify **Video Encode** engine is actively encoding at 60 FPS without spiking the CPU.
5. In the **Telemetry Panel**:
   - Frame rate should sustain `60 fps`.
   - Speed: `1.00x` to `1.02x`.
   - Dropped frames: `0`.
   - If camera source is 30 FPS, the telemetry panel will safely indicate: `PACED (30 ➔ 60)`.

---

### Test D: Two CCTV Cameras with Rotation & Switching
1. Configure a Multi-Camera Automation with 2 cameras (e.g. 5-minute rotation or manual switching).
2. Start the Live Broadcast.
3. Observe initial streaming of Camera 1:
   - Both cameras are ingested with hardware decoding.
   - Post-selection scaling ensures **only the active camera** is scaled and encoded.
4. Click a camera thumbnail to perform a **Manual Camera Switch**:
   - Camera switches in-place in `< 30ms` via ZMQ.
   - Stream key does NOT disconnect.
   - Task Manager CPU does NOT spike.
5. Let the 5-minute timer elapse:
   - Automatic rotation switches to Camera 2 seamlessly with zero dropped frames.

---

### Test E: Simultaneous Facebook + YouTube Live
1. Select **Multi-Destination** (or enter both Facebook Page and YouTube Stream Key).
2. Start the Live Broadcast.
3. Verify that FFmpeg generates a single hardware-encoded stream routed through the `tee` muxer:
   - Only **one** `h264_qsv` encoding instance runs on the GPU.
   - If YouTube or Facebook connection drops or reconnects, `onfail=ignore` protects the other destination.

---

## 4. How to Export and Share the Diagnostic Report

When testing is complete, simply export the sanitized diagnostic report:
1. Go to **Settings** ➔ **GPU Hardware Acceleration**.
2. Click **Export Diagnostic Report** (choose Markdown or JSON).
3. All sensitive Facebook tokens, stream keys, and camera passwords are automatically stripped.
4. Share the generated `gpu-diagnostic-report.md` file for verification.
