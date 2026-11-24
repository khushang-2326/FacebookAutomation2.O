@echo off
title Local CCTV Camera Agent (ONVIF & RTSP Discovery)
color 0B
cd /d "%~dp0"

echo ================================================================
echo   STARTING LOCAL CCTV CAMERA DISCOVERY AGENT
echo ================================================================
echo.

node index.js
pause
