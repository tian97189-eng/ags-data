@echo off
setlocal
cd /d %~dp0

rem ====== Find Node.js (try PATH first, then common install locations) ======
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
    echo  Please install Node.js LTS from:
    echo      https://nodejs.org/
    echo.
    echo  Or unzip the Node.js zip (e.g. v22 LTS) into C:\nodejs\
    echo  so that C:\nodejs\node.exe exists.
    echo ========================================================
    echo.
    pause
    exit /b 1
)

rem Put the directory containing node.exe on PATH for this script
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

echo [2/3] Building app...
if exist dist rmdir /s /q dist
call npm run build
if errorlevel 1 (
    echo.
    echo Build failed. If you see Node.js version errors, try Node 22 LTS:
    echo   https://nodejs.org/dist/v22.11.0/node-v22.11.0-win-x64.zip
    echo  Unzip into C:\nodejs\ (overwrite), then re-run.
    pause
    exit /b 1
)

echo [3/3] Starting server at http://localhost:4173
start "" http://localhost:4173
call npm run preview -- --port 4173 --strictPort
