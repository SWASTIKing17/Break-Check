@echo off
title FreeXan Cloud AI Studio Gateway (Port 8888)
cls
echo Cleaning up stale gateway processes on port 8888...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8888" ^| find "LISTENING"') do taskkill /f /pid %%a 2>nul

echo Starting Node CORS Gateway...
start "" http://127.0.0.1:8888
node "%~dp0sarvam_proxy_server.js"
pause
