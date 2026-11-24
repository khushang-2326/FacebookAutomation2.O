# Meta Facebook Developer Setup Guide

This guide walks you through setting up an official Meta Developer App and verifying Facebook Live streaming permissions.

---

## 1. Create a Meta Developer App

1. Go to [developers.facebook.com](https://developers.facebook.com/) and log in with your Facebook account.
2. Click **My Apps** $\rightarrow$ **Create App**.
3. Select **Other** as the use case $\rightarrow$ Click **Next**.
4. Select App Type: **Business** $\rightarrow$ Click **Next**.
5. Set your **App Display Name** (e.g. `Live Broadcast Scheduler`) and enter your Contact Email.
6. Click **Create App**.

---

## 2. Add Facebook Login for Business

1. In the App Dashboard, find **Facebook Login for Business** and click **Set Up**.
2. Go to **Facebook Login** $\rightarrow$ **Settings** on the left sidebar.
3. Under **Valid OAuth Redirect URIs**, enter:
   ```
   http://localhost:5000/api/facebook/callback
   ```
   *(For a production VPS or domain, enter `https://yourdomain.com/api/facebook/callback`)*.
4. Save Changes.

---

## 3. Required Permissions

Under **App Review** $\rightarrow$ **Permissions and Features**, configure the following permissions:
- `pages_show_list` (or `pages_read_engagement`): Allows retrieving the user's managed Facebook Pages.
- `pages_read_engagement`: Required to read Page metrics and posts.
- `pages_manage_posts`: Required to create and manage Live Video posts on the Page.
- `publish_video`: Required to stream video and initiate Live Broadcast sessions.
- `pages_manage_engagement`: (Optional) For reading live comments.

> [!NOTE]
> During Development Mode, users who have Admin, Developer, or Tester roles on your Meta App can immediately stream to any Facebook Page they administer without submitting for public App Review.

---

## 4. Meta Graph API Configuration

The application uses a configurable API version defined in `.env`:
```env
META_GRAPH_API_VERSION=v21.0
FACEBOOK_API_VERSION=v21.0
```

### Live Video Endpoints:
1. **Create Live Broadcast**:
   `POST https://graph.facebook.com/{META_GRAPH_API_VERSION}/{page-id}/live_videos`
   - `title`: Video broadcast title (string)
   - `description`: Video description (string)
   - `status`: `'LIVE_NOW'` (automatically publishes once RTMP stream packets arrive) or `'UNPUBLISHED'`
   - `stream_type`: `'REGULAR'`
   - `planned_start_time`: Unix timestamp (optional, for scheduled streams)

2. **Retrieve Live Video Ingest & Status**:
   `GET https://graph.facebook.com/{META_GRAPH_API_VERSION}/{live-video-id}?fields=id,status,creation_time,live_views,stream_url,secure_stream_url,video{id,published}`

3. **End Live Broadcast**:
   `POST https://graph.facebook.com/{META_GRAPH_API_VERSION}/{live-video-id}`
   - `{ "end_live_video": true }`

---

## 5. Controlled Real Facebook Test Procedure

Before running production continuous broadcasts, follow this controlled verification:

1. In `.env`, configure:
   ```env
   FACEBOOK_APP_ID=your_real_app_id
   FACEBOOK_APP_SECRET=your_real_app_secret
   FACEBOOK_MOCK_MODE=false
   SCHEDULER_TEST_MODE=true
   TEST_ROTATION_DURATION=60
   TEST_RESTART_DELAY=10
   ```
2. Log in to the application and connect your Facebook Page via official Meta OAuth.
3. Select your test Page and upload a short MP4 video.
4. Start a single broadcast and verify:
   - Live stream is created and secure RTMPS ingest URL is received.
   - FFmpeg begins transmitting video packets.
   - Facebook Page displays the video stream in live state.
5. Stop the stream or allow the test rotation to verify clean termination.
6. Once verified, adjust rotation duration to standard production settings (default: 4h 50m).
