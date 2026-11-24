# System Architecture & Design Documentation

## 1. High-Level Overview

The Facebook Live Scheduled Automation Platform provides a persistent, scalable engine for unattended 24/7 live video broadcasting on Facebook Pages. It strictly adheres to Meta Graph API v21.0 standards and solves the fundamental limitation of Facebook's 8-hour maximum live video duration through an automated rotation lifecycle engine.

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

## 2. Core Components

### 2.1 Security & Token Cryptography
- **AES-256-GCM Encryption**: All Meta user OAuth tokens and Page access tokens are encrypted at rest with hardware Galois/Counter Mode (GCM). Each encrypted record contains a unique 16-byte initialization vector (IV), a 16-byte authentication tag, and the ciphertext (`iv:authTag:ciphertext`).
- **Zero Browser Automation**: No Selenium, Puppeteer, or stored Facebook user passwords. All interactions occur via official Graph API endpoints.

### 2.2 Facebook Provider Abstraction
The system utilizes a clean Strategy Pattern:
- `FacebookProvider` (Base Interface): Defines methods for OAuth exchange, page discovery, live broadcast creation, telemetry polling, and termination.
- `MetaFacebookProvider`: Official Graph API v21.0 HTTPS implementation.
- `MockFacebookProvider`: Fully stateful offline mock generator that simulates Page discovery, RTMPS stream key creation, and lifecycle transitions without external network requirements.
- `FacebookService`: Singleton factory that seamlessly switches between Mock and Live Meta modes based on `FACEBOOK_MOCK_MODE`.

### 2.3 Media & FFmpeg Streaming Engine
- **Video Looping**: Safe argument arrays execute `ffmpeg -re -stream_loop -1 -i <file> -c:v libx264 -preset veryfast -b:v 3000k -maxrate 3500k -bufsize 6000k -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -ar 44100 -f flv <rtmps_url>`.
- **Image-to-Video Engine**: Generates continuous H.264 video streams from static posters (`-loop 1`) combined with synthetic silent AAC audio (`-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100`) to strictly satisfy Meta's RTMPS container requirements.
- **Stderr Telemetry Parsing**: Regular expressions extract live FPS, bitrate, speed multiplier, dropped frames, and total encoded frames in real-time.
- **Process Registry & Crash Handling**: Tracks OS child process PIDs in `StreamProcess` documents. Gracefully terminates streams via `SIGTERM` before escalating to `SIGKILL`.

### 2.4 Persistent Scheduler & Automated Rotation
- **Tick Engine**: Periodically polls MongoDB for due automations (every 1000ms in Test Mode, 5000ms in Production).
- **Automated Rotation Lifecycle**:
  ```
  SCHEDULED ──> STARTING ──> LIVE (Broadcast #1) ──[Rotation Limit Reached]──>
  ROTATING ──> STOP STREAM ──> END META BROADCAST ──[Wait Delay]──>
  CREATE NEW BROADCAST ──> START STREAM ──> LIVE (Broadcast #2) ──> ...
  ```
- **Startup Crash Reconciliation**: On boot, orphaned automations marked `LIVE` or `ROTATING` are reconciled against active OS PIDs to prevent stream leaks and ghost live videos.
