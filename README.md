# Facebook Live Scheduled Automation & Continuous Rotation Platform

A production-ready, persistent automation web platform that allows users to schedule, stream, and continuously rotate Facebook Live broadcasts (looping media, rotating with conservative durations such as 4h 50m, and automatically re-creating live streams with identical configurations) without requiring Facebook credentials or browser automation bots.

---

## 🌟 Key Features

- **Automated Broadcast Rotation Engine**:
  - Automatically rotates live broadcasts according to configured rotation duration (default: 4h 50m in production, 15s in test mode) with a configurable restart delay (default 60s in production, 3s in test mode).
  - Gracefully stops the current stream $\rightarrow$ ends the Meta Live Video session $\rightarrow$ waits the restart delay $\rightarrow$ creates a new Live Video with identical configurations $\rightarrow$ restarts the stream as Part #2, Part #3, etc.
- **Strict Meta API Compliance**:
  - Strictly follows official Meta OAuth 2.0 and Graph API (`META_GRAPH_API_VERSION` configurable in `.env`, default `v21.0`).
  - Zero browser automation (no Selenium/Puppeteer), zero storage of Facebook user passwords.
- **Hardware-Grade Cryptography**:
  - All Facebook User and Page access tokens are encrypted at rest using **AES-256-GCM** with unique IVs and authentication tags.
- **Zero-Setup Development & Robust Production Rules**:
  - `FACEBOOK_MOCK_MODE=true` enables complete offline testing with simulated Pages and RTMPS endpoints.
  - In `NODE_ENV=production`, MongoDB is strictly required (no silent ephemeral fallback).
- **Robust FFmpeg Media Engine**:
  - Safe argument arrays (preventing command injection) for continuous video looping (`-stream_loop -1`) or single playthrough.
  - Image-to-video streaming with synthetic silent AAC audio track (`anullsrc`), satisfying Facebook's RTMPS container requirements.
  - Real-time stderr telemetry parser capturing FPS, bitrate, speed multiplier, dropped frames, and total frames.
- **YouTube Video Source**:
  - Add a YouTube video URL in the automation wizard; the app caches an MP4 locally and then uses the same secure looping and rotation pipeline as uploaded media.
  - Requires the bundled `backend/bin/yt-dlp.exe` on Windows (or set `YTDLP_PATH` to a compatible executable). Only use videos you own or are licensed to rebroadcast.
- **Stateful Crash Recovery & Startup Reconciler**:
  - Detects server reboots and reconciles orphaned `LIVE` / `ROTATING` broadcasts without duplicate stream spawns.
  - Global **Emergency Stop Switch** to terminate all active OS child processes and broadcasts instantly.
- **Modern React + Vite Frontend**:
  - Tailwind CSS dark UI with glassmorphism accents.
  - Real-time Socket.IO telemetry and visual rotation timeline.
  - Guided creation wizard with pre-flight checks.

---

## 🏗️ Architecture

```
                                  ┌──────────────────────────────┐
                                  │   React + Vite Frontend      │
                                  │  Tailwind CSS + Socket.IO    │
                                  └──────────────┬───────────────┘
                                                 │ REST / WebSocket
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Node.js + Express Backend API                         │
├────────────────────────────────┬───────────────────────────┬────────────────┤
│ Authentication & Security      │ Persistent Scheduler      │ Media Service  │
│ • JWT + bcrypt                 │ • MongoDB Timers & Ticks  │ • Upload & Val │
│ • AES-256-GCM Token Encryption │ • State Reconciler        │ • Video/Image  │
│ • Helmet, CORS, Rate Limit     │ • Rotation Lifecycle Mgr  │ • Loop Manager │
├────────────────────────────────┴───────────────────────────┴────────────────┤
│                             Service Layer                                   │
│  ┌───────────────────────────────┐        ┌──────────────────────────────┐  │
│  │     FacebookProvider          │        │       FFmpegService          │  │
│  │  ┌─────────────────────────┐  │        │  • Safe Argument Arrays      │  │
│  │  │ MetaFacebookProvider    │  │        │  • PID & Metric Tracking     │  │
│  │  ├─────────────────────────┤  │        │  • Video (Loop/Stop)         │  │
│  │  │ MockFacebookProvider    │  │        │  • Image (Static + AAC)      │  │
│  │  └─────────────────────────┘  │        │  • Crash Recovery            │  │
│  └───────────────────────────────┘        └──────────────────────────────┘  │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      ┌────────────────────┐          ┌─────────────────────┐
      │  MongoDB Database  │          │ Meta Facebook API / │
      │  Mongoose Schemas  │          │ RTMPS Ingest Server │
      └────────────────────┘          └─────────────────────┘
```

---

## 🚀 Quick Start (Zero-Setup Development)

### 1. Install Backend & Frontend Dependencies

```bash
# In backend directory
cd backend
npm install

# In frontend directory
cd ../frontend
npm install
```

### 2. Start Backend Server

```bash
cd backend
npm start
```
*The backend will automatically start an embedded in-memory MongoDB instance and enable Mock Mode.*

### 3. Start Frontend Client

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser:
1. Click **1-Click Demo Admin Login** on the login screen.
2. Navigate to **Facebook Pages** and click **Connect Mock Facebook Account**.
3. Navigate to **Media Library** and click **+ Sample Video**.
4. Click **New Automation** and follow the 7-step wizard (select Test Mode for 15s rotations).
5. Watch the Live Dashboard and Automation Detail timeline seamlessly rotate from Broadcast #1 to #2 to #3 in real-time over WebSocket!

---

## 🧪 Running Automated Tests

Run the full automated test suite (Provider unit tests, Media validator, FFmpeg argument generator, Scheduler state machine, Rotation lifecycle, and Startup Reconciler):

```bash
cd backend
npm test
```

---

## 📚 Detailed Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Meta Facebook Setup Guide](docs/FACEBOOK_SETUP.md)
- [REST API Reference](docs/API.md)
- [Scheduler & Rotation Logic](docs/SCHEDULER.md)
- [FFmpeg Streaming Pipelines](docs/STREAMING.md)
- [VPS & PM2 Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)

---

## 📄 License
MIT License
