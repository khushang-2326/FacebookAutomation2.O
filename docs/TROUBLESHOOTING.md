# Troubleshooting & Common Issues

## 1. Facebook OAuth & Token Errors

### Error: "Invalid Scopes" or "Permissions Not Granted"
- **Cause**: The user logging into Facebook did not grant `pages_show_list`, `pages_manage_posts`, or `publish_video`.
- **Fix**: Verify your Meta Developer App has these permissions configured. Re-authenticate through `/facebook` and ensure all checkboxes are checked in Meta's consent dialog.

### Error: "Page Access Token Expired"
- **Cause**: Meta user tokens expire after 60 days.
- **Fix**: Navigate to **Facebook Pages** in the dashboard and click **Test Token** or re-authenticate the account.

---

## 2. Streaming & FFmpeg Issues

### Error: "Cannot find FFmpeg"
- **Cause**: FFmpeg binary is not in your system's `PATH`.
- **Fix**:
  - Windows: Download FFmpeg from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) and add `bin/` to Environment Variables.
  - Linux: Run `sudo apt install ffmpeg`.
  - In development without FFmpeg, the platform automatically switches to simulation mode!

### Video Loop Glitches or Desync
- **Cause**: Non-standard keyframe intervals in the source file.
- **Fix**: The platform automatically re-encodes source files with `-g 60` (2s keyframe interval) and `-pix_fmt yuv420p` to guarantee compatibility.

---

## 3. Database & Connectivity

### Embedded In-Memory MongoDB Warnings
- **Cause**: No `MONGODB_URI` was defined in `.env`.
- **Behavior**: The application automatically starts an embedded `MongoMemoryServer` instance. All data is persisted in RAM during server execution. To persist across restarts, install local MongoDB or provide a MongoDB Atlas URI.

---

## 4. Emergency Kill Switch

If any unexpected streaming runaway or duplicate stream occurs:
1. Click the red **EMERGENCY KILL ALL** button on the top-right navbar.
2. Alternatively, invoke the API endpoint directly:
   ```bash
   curl -X POST http://localhost:5000/api/automations/emergency-stop \
     -H "Authorization: Bearer <TOKEN>"
   ```
This immediately issues OS `SIGKILL` to all active FFmpeg PIDs and marks all live broadcast sessions as ended.
