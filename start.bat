@echo off
setlocal
cd /d %~dp0

set NODE_EXE=
where node >nul 2>nul
if not errorlevel 1 (
    for /f "delims=" %%i in ('where node') do set NODE_EXE=%%i
)

if "%NODE_EXE%"=="" if exist "C:\nodejs\node.exe" set NODE_EXE=C:\nodejs\node.exe
if "%NODE_EXE%"=="" if exist "C:\Program Files\nodejs\node.exe" set NODE_EXE=C:\Program Files\nodejs\node.exe
if "%NODE_EXE%"=="" if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe
if "%NODE_EXE%"=="" if exist "%USERPROFILE%\scoop\apps\nodejs\current\node.exe" set NODE_EXE=%USERPROFILE%\scoop\apps\nodejs\current\node.exe

if "%NODE_EXE%"=="" (
    echo.
    echo ========================================================
    echo  Node.js was not found.
    echo ========================================================
    echo  Please install Node.js LTS from https://nodejs.org/
    echo  Or unzip Node.js zip into C:\nodejs\
    echo ========================================================
    echo.
    pause
    exit /b 1
)

for %%i in ("%NODE_EXE%") do set "NODE_DIR=%%~dpi"
set "PATH=%NODE_DIR%;%PATH%"
echo Using Node.js: %NODE_EXE%

where npm >nul 2>nul
if errorlevel 1 (
    echo Error: npm.cmd not found in %NODE_DIR%.
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

rem Build + preview runs in this source project dir (dist/ here).
echo [2/3] Building app (takes 30-60s on first run, a few seconds when cached)...
if exist dist rmdir /s /q dist
call npm run build
if errorlevel 1 (
    echo.
    echo Build failed. See error above. If it is a Node version error,
    echo try Node 22 LTS: https://nodejs.org/dist/v22.11.0/
    pause
    exit /b 1
)

rem Free port 5173 in case a previous preview is still running
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo Killing leftover process %%P on port 5173...
    taskkill /F /PID %%P >nul 2>&1
)

echo [3/3] Starting server at http://localhost:5173

rem Print LAN IPs so the user knows what to open on the phone
echo.
echo   Phone access (same WiFi) - use the 192.168.x.x one:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /R "IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do echo     http://%%b:5173
)

start "" http://localhost:5173
rem Preview runs in its OWN window so this batch window can be closed safely.
rem Stop preview: close the "AGS Preview" window, or taskkill node.exe.
set "PREVIEWLOG=%~dp0preview.log"
start "AGS Preview (close to stop)" cmd /k "npm run preview -- --port 5173 --strictPort > %PREVIEWLOG% 2>&1"
echo.
echo  Preview server running in its own window [AGS Preview].
echo  Keep that window open while using the app.
echo  Close the [AGS Preview] window to STOP the server.
echo  App URL:    http://localhost:5173
echo.
echo  To stop dev later: run this in cmd -
echo    for /f "tokens=5" %%P in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%P
echo.
pause

echo.
echo Server stopped. Close this window to exit.
pause
