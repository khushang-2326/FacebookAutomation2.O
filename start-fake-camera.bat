@echo off
echo Starting Fake RTSP Camera (Test Pattern)...
echo This will stream a test video to MediaMTX at: rtsp://127.0.0.1:8554/fake_camera
echo Keep this window open while testing.
"D:\Krish\FacebookAutomation\backend\bin\ffmpeg.exe" -re -f lavfi -i "testsrc=size=1280x720:rate=30" -f lavfi -i "sine=frequency=1000:sample_rate=44100" -c:v libx264 -preset veryfast -b:v 1500k -c:a aac -b:a 128k -f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/fake_camera
pause
