# FFmpeg Streaming & Transcoding Engine

## 1. Facebook Live RTMPS Requirements

Facebook Live requires ingest streams to strictly conform to the following specifications:
- **Protocol**: RTMPS (`rtmps://...:443/rtmp/...`) or RTMP with SSL encryption.
- **Video Codec**: H.264 (AVC) Baseline or Main profile (`libx264`).
- **Resolution**: 1080p (1920x1080) or 720p (1280x720) at 30fps or 60fps.
- **Keyframe Interval**: Maximum 2 seconds (`-g 60` for 30fps).
- **Pixel Format**: `yuv420p`.
- **Audio Codec**: AAC-LC (`aac`), 128 kbps, 44.1 kHz or 48 kHz stereo.
- **Container**: FLV (`-f flv`).

---

## 2. Video Streaming Pipeline (Continuous Looping)

To stream an MP4/MKV video continuously without buffering or audio desync:

```bash
ffmpeg \
  -re \
  -stream_loop -1 \
  -i /path/to/video.mp4 \
  -c:v libx264 \
  -preset veryfast \
  -b:v 3000k \
  -maxrate 3500k \
  -bufsize 6000k \
  -pix_fmt yuv420p \
  -g 60 \
  -c:a aac \
  -b:a 128k \
  -ar 44100 \
  -f flv \
  "rtmps://live-api-s.facebook.com:443/rtmp/FB-..."
```

### Key Parameters:
- `-re`: Reads input at native frame rate (prevents flooding network bandwidth).
- `-stream_loop -1`: Loops the input video infinitely.
- `-c:v libx264 -preset veryfast`: Highly optimized CPU encoding suitable for VPS instances.
- `-g 60`: Inserts an IDR keyframe every 2 seconds at 30 fps (mandatory for Facebook).
- `-b:v 3000k -maxrate 3500k -bufsize 6000k`: Constrains bitrate to prevent frame drops.

---

## 3. Image-to-Video Streaming Pipeline (Static Poster + Silent Audio)

Facebook's RTMPS server requires both a continuous video stream and an active audio track. To broadcast a static poster/infographic:

```bash
ffmpeg \
  -re \
  -loop 1 \
  -i /path/to/poster.jpg \
  -f lavfi \
  -i anullsrc=channel_layout=stereo:sample_rate=44100 \
  -c:v libx264 \
  -preset veryfast \
  -tune stillimage \
  -b:v 2000k \
  -pix_fmt yuv420p \
  -g 60 \
  -c:a aac \
  -b:a 128k \
  -shortest \
  -f flv \
  "rtmps://live-api-s.facebook.com:443/rtmp/FB-..."
```

### Key Parameters:
- `-loop 1`: Loops the single image frame infinitely.
- `-f lavfi -i anullsrc=...`: Uses FFmpeg's built-in audio null source filter to synthesize a silent 44.1kHz stereo audio track, satisfying Facebook's ingest container requirement.
- `-tune stillimage`: Optimizes H.264 macroblock compression for non-moving content.
