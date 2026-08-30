@echo off
setlocal
cd /d %~dp0

if not exist node_modules (
    echo [1/3] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies. Check your network and try again.
        pause
        exit /b 1
    )
)

echo [2/3] Building app...
if exist dist rmdir /s /q dist
call npm run build
if errorlevel 1 (
    echo Build failed.
    pause
    exit /b 1
)

echo [3/3] Starting server...
start "" http://localhost:4173
call npm run preview -- --port 4173 --strictPort
