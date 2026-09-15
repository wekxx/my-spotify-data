@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 20 or newer, then try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing app dependencies for the first run...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting My Spotify Data...
echo Keep this window open while you use the app. Press Ctrl+C to stop it.
call npm.cmd run dev -- --open
endlocal
