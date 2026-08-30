@echo off
setlocal
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo ========================================================
    echo  Node.js is not installed.
    echo ========================================================
    echo.
    echo  Please install Node.js LTS from:
    echo      https://nodejs.org/
    echo.
    echo  After installation, re-run this script.
    echo  (Restart the terminal so the new PATH takes effect.)
    echo ========================================================
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo Error: npm not found. Please reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo [1/3] Installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies. Check your network.
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

echo [3/3] Starting server at http://localhost:4173
start "" http://localhost:4173
call npm run preview -- --port 4173 --strictPort

