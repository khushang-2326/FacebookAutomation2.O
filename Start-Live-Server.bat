@echo off
title Facebook Live Automation Server (24/7 Streaming)
color 0A
cd /d "%~dp0"

echo ================================================================
echo   STARTING FACEBOOK LIVE STREAMING SERVER
echo ================================================================
echo.

set NODE_ENV=production
set PORT=5000
set AUTO_OPEN_BROWSER=1

if exist "dist-electron\win-unpacked\resources\bin" (
    set "PATH=%~dp0dist-electron\win-unpacked\resources\bin;%PATH%"
) else if exist "backend\bin" (
    set "PATH=%~dp0backend\bin;%PATH%"
)

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed on this system.
    echo Please install Node.js from https://nodejs.org/ or use the packaged Facebook-Live-Streamer-Setup.exe
    pause
    exit /b 1
)

node backend/server.js
pause
