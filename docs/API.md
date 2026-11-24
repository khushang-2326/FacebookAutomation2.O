# REST API Reference Documentation

All endpoints (except public auth routes) require a JWT Bearer token in the `Authorization` header:
`Authorization: Bearer <JWT_TOKEN>`

---

## 1. Authentication Endpoints

### Register
`POST /api/auth/register`
```json
{
  "name": "Admin User",
  "email": "admin@example.com",
  "password": "password123"
}
```

### Login
`POST /api/auth/login`
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

### Get Current User
`GET /api/auth/me`

---

## 2. Facebook Management Endpoints

### Get OAuth URL
`GET /api/facebook/auth-url?mock=false`

### Handle OAuth Callback
`POST /api/facebook/callback`
```json
{
  "code": "AQB38...authorizaton_code",
  "state": "csrf_state_token",
  "isMock": false
}
```

### One-Click Mock Connect
`POST /api/facebook/mock-connect`

### List Connected Pages
`GET /api/facebook/pages`

### Test Page Token Validity
`POST /api/facebook/pages/:id/test`

### Disconnect Facebook Account
`DELETE /api/facebook/accounts/:id`

---

## 3. Media Endpoints

### Upload Media File
`POST /api/media/upload` (Multipart Form: `file`)

### Create Sample Demo Media
`POST /api/media/sample`
```json
{
  "type": "VIDEO" // or "IMAGE"
}
```

### List Media
`GET /api/media`

### Delete Media
`DELETE /api/media/:id`

---

## 4. Automation Endpoints

### Create Automation
`POST /api/automations`
```json
{
  "name": "24/7 Music Live Stream",
  "facebookPageId": "65db8...",
  "mediaId": "65dc9...",
  "title": "Relaxing Beats 24/7",
  "description": "Continuous stream",
  "scheduledStartTime": "2026-08-20T10:00:00Z",
  "rotationDurationSec": 17400,
  "restartDelaySec": 60,
  "repeatMode": "INDEFINITE",
  "startImmediately": true
}
```

For a YouTube source, use `sourceType: "YOUTUBE_VIDEO"` and `youtubeUrl` instead of `mediaId`:

```json
{
  "name": "My licensed YouTube stream",
  "facebookPageId": "65db8...",
  "sourceType": "YOUTUBE_VIDEO",
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "title": "My Facebook Live Stream",
  "startImmediately": true
}
```

The server accepts only YouTube URLs, downloads a private local MP4 once, and then streams it using the normal video loop. `yt-dlp` must be installed or configured with `YTDLP_PATH`.

### List Automations
`GET /api/automations`

### Get Automation Detail & Telemetry
`GET /api/automations/:id`

### Start / Pause / Resume / Stop Automation
`POST /api/automations/:id/start`
`POST /api/automations/:id/pause`
`POST /api/automations/:id/resume`
`POST /api/automations/:id/stop`

### Force Immediate Rotation
`POST /api/automations/:id/rotate-now`

### Pre-Flight Verification
`POST /api/automations/:id/preflight`

### Global Emergency Stop
`POST /api/automations/emergency-stop`

---

## 5. Broadcast History & System Endpoints

### List Broadcast History
`GET /api/broadcasts?automationId=...&status=...&page=1&limit=50`

### Get Broadcast Details
`GET /api/broadcasts/:id`

### System Health
`GET /api/system/health`

### System Diagnostic Logs
`GET /api/system/logs?level=error&limit=100`

### Get & Update Settings
`GET /api/settings`
`PUT /api/settings`
