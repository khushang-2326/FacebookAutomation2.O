# Client GPU Hardware Acceleration & Performance Verification Guide

**Project:** Facebook Live Streamer & Auto-Scheduler  
**Optimization Target:** GPU Hardware Acceleration, 60 FPS Support & Multi-Camera Scaling  
**App Version:** 1.0.0 (Updated with Central GPU Hardware Acceleration Manager)

---

## 1. Executive Summary

This update integrates full hardware video decoding and hardware video encoding into the application, optimizing performance across Intel (QuickSync / QSV), NVIDIA (NVENC / NVDEC), AMD (AMF / VCN), and universal Windows Media Foundation (MFT / D3D11VA) architectures.

### What Was Optimized:
1. **Hardware Video Encoding:** Automatically selects and utilizes your laptop's GPU encoder (`h264_nvenc`, `h264_qsv`, `h264_amf`, or `h264_mf`) instead of taxing the CPU with software encoding (`libx264`).
2. **Direct GPU Video Decoding:** Ingests RTSP CCTV camera feeds and local video files using Direct3D 11 Video Acceleration (`-hwaccel d3d11va`), bypassing CPU video decoding.
3. **Multi-Camera Architecture Redesign:** Camera resolution scaling, aspect padding, and frame pacing now run **after** stream selection (`streamselect@camselect`). When 2 or more cameras are configured, FFmpeg only scales and encodes the single active camera instead of duplicating heavy CPU processing across all inactive cameras simultaneously.
4. **60 FPS Motion Pipeline:** Tuned GOP keyframe intervals ($2 \times \text{FPS}$), Constant Bitrate (CBR) rate control, and frame pacing prevent buffer bloat and dropped frames at 60 FPS.
5. **Zero-Copy Dual Destination (Facebook + YouTube):** FFmpeg encodes the live stream only once on the GPU and splits the encoded bitstream packets using a non-blocking tee multiplexer.

---

## 2. Pre-Test Verification in Windows

Before beginning the test suite, open **Windows Task Manager**:
1. Press `Ctrl + Shift + Esc` to open Task Manager.
2. Click the **Performance** tab.
3. Select your **GPU** (e.g. GPU 0 / GPU 1).
4. In the GPU graphs, change one of the drop-down graphs to **Video Encode** and another to **Video Decode**.
5. During streaming, you will see activity in **Video Encode** and **Video Decode**, while CPU utilization remains low and stable.

---

## 3. Client Acceptance Test Suite

### Test A: Single CCTV Camera at 30 FPS
* **Goal:** Verify baseline hardware encoding and low CPU utilization.
* **Procedure:**
  1. Open the application.
  2. Navigate to **Create Automation**.
  3. Select **RTSP Camera** or **Local Webcam**.
  4. Choose **1080p** resolution and **30 FPS**.
  5. Select your Facebook Page or YouTube Destination and start the stream.
* **Expected Result:**
  - Real-Time Telemetry panel shows `⚡ GPU: <EncoderName> (ACCELERATED)`.
  - Stream speed is consistently $\ge 1.00\text{x}$.
  - Dropped frames remain 0.
  - In Windows Task Manager, GPU **Video Encode** shows activity. CPU usage is minimal (<10–15%).

---

### Test B: Single CCTV Camera at 60 FPS
* **Goal:** Verify high-fluidity 60 FPS streaming without lagging or buffer buildup.
* **Procedure:**
  1. Navigate to **Create Automation**.
  2. Select your camera feed.
  3. Set Frame Rate to **60 FPS** (Resolution: **1080p**).
  4. Start the automation.
* **Expected Result:**
  - Real-Time Telemetry panel shows `TARGET: 1080P @ 60 FPS`.
  - If the CCTV camera natively outputs 25/30 FPS, the telemetry panel displays `PACED (30 ➔ 60)` indicating frames are paced smoothly to 60 CFR without CPU spinning.
  - Video motion is fluid on Facebook Live / YouTube Live.
  - Encoding speed remains $\ge 1.00\text{x}$ with no lagging.

---

### Test C: Two CCTV Cameras at 30 FPS (Scheduled & Manual Rotation)
* **Goal:** Verify multi-camera switching without CPU overload.
* **Procedure:**
  1. Navigate to **Create Automation** ➔ **Multi-Camera (CCTV Cycling)**.
  2. Add **Camera 1** (e.g. 20 seconds duration) and **Camera 2** (e.g. 20 seconds duration).
  3. Set Frame Rate to **30 FPS**.
  4. Launch the automation.
  5. While streaming, observe automatic camera rotation.
  6. Click **Switch Camera** in the Live Dashboard to perform an immediate manual switch.
* **Expected Result:**
  - CPU usage remains low because inactive camera streams are not processed through the scaling pipeline.
  - In-place camera switching occurs instantly with **0 disconnects** (Facebook/YouTube live broadcast stays connected without interruption).
  - Telemetry speed factor stays $\ge 1.00\text{x}$.

---

### Test D: Two CCTV Cameras at 60 FPS
* **Goal:** Verify that multi-camera operation at 60 FPS remains stable and responsive.
* **Procedure:**
  1. Create a Multi-Camera automation with 2 cameras set to **60 FPS**.
  2. Launch the stream and monitor Windows Task Manager.
* **Expected Result:**
  - Stream maintains 60 FPS output.
  - GPU handles video encoding and decoding.
  - No CPU saturation or runaway process lag.

---

### Test E: Simultaneous Facebook + YouTube Live Streaming
* **Goal:** Verify dual-destination streaming with single GPU encode pass.
* **Procedure:**
  1. Navigate to **Create Automation**.
  2. Connect both Facebook and YouTube destinations (or enter Facebook stream key and YouTube stream key).
  3. Start the stream.
* **Expected Result:**
  - FFmpeg encodes the video only once on the GPU.
  - Both Facebook Live and YouTube Live receive the identical stream in real time without doubling GPU or CPU load.

---

## 4. How to Export the Hardware Diagnostic Report

If you encounter any questions or wish to send your hardware benchmarks to our engineering team:
1. In the application sidebar, navigate to **Settings**.
2. Locate the **GPU Hardware Acceleration & Diagnostics** section.
3. Review your detected GPU adapter, active encoder, and active decoder.
4. Click the **Export Diagnostic Report** button.
5. A sanitized Markdown report (`gpu-diagnostic-report.md`) will be downloaded to your computer.
6. Email or attach this report to our support channel.

> [!NOTE]
> **Privacy Guarantee:** The export tool automatically redacts all Facebook access tokens, stream keys, page IDs, and camera passwords.

---

## 5. Verification Checklist

| Test Item | Verification Criteria | Status |
|---|---|:---:|
| 1. GPU Detection | GPU adapter name & vendor correctly detected in Settings | [ ] Pass |
| 2. Hardware Video Encoder | Telemetry shows GPU encoder (e.g. `h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_mf`) | [ ] Pass |
| 3. Hardware Video Decoder | Telemetry shows `DEC: d3d11va` | [ ] Pass |
| 4. 30 FPS Stability | Speed factor $\ge 1.00\text{x}$, 0 dropped frames | [ ] Pass |
| 5. 60 FPS Stability | 60 FPS stream plays fluidly without buffering | [ ] Pass |
| 6. Two-Camera Operation | Switching between cameras is instantaneous with no CPU spike | [ ] Pass |
| 7. Task Manager Check | GPU Video Encode & Decode graphs show activity; CPU < 20% | [ ] Pass |
| 8. Diagnostic Export | Sanitized report exports cleanly from Settings | [ ] Pass |
