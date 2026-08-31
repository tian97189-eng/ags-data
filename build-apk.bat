@echo off
setlocal
echo ==========================================
echo  AGS Data App - Build APK
echo ==========================================
echo.

set "JAVA_HOME=C:\jdk21\jdk"
set "ANDROID_HOME=C:\android-sdk"
set "ANDROID_SDK_ROOT=C:\android-sdk"
set "GRADLE_USER_HOME=C:\Users\sky\gradle-home"

rem ======== [0/5] Sync latest source code to build dir ========
echo [0/5] Syncing source code...
set "SRC=%~dp0"
xcopy /D /E /I /Y /Q "%SRC%src"       "C:\Users\sky\ags-build2\src"       >nul
xcopy /D /E /I /Y /Q "%SRC%public"    "C:\Users\sky\ags-build2\public"    >nul
xcopy /D /E /I /Y /Q "%SRC%scripts"   "C:\Users\sky\ags-build2\scripts"   >nul
copy /Y "%SRC%package.json"       "C:\Users\sky\ags-build2\package.json"       >nul
copy /Y "%SRC%package-lock.json"  "C:\Users\sky\ags-build2\package-lock.json"  >nul
copy /Y "%SRC%vite.config.ts"     "C:\Users\sky\ags-build2\vite.config.ts"     >nul
copy /Y "%SRC%tsconfig.json"      "C:\Users\sky\ags-build2\tsconfig.json"      >nul
copy /Y "%SRC%tailwind.config.js" "C:\Users\sky\ags-build2\tailwind.config.js" >nul
copy /Y "%SRC%postcss.config.js"  "C:\Users\sky\ags-build2\postcss.config.js"  >nul
copy /Y "%SRC%index.html"         "C:\Users\sky\ags-build2\index.html"         >nul
echo      source synced.

rem ======== [1/5] Install any new dependencies ========
echo [1/5] Installing dependencies (incremental)...
cd /d C:\Users\sky\ags-build2
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo FAILED: npm install failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      dependencies ok.

rem ======== [2/5] Build web assets ========
echo [2/5] Building web assets...
call npm run build
if errorlevel 1 (
    echo.
    echo FAILED: web build failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      web build ok.

rem ======== [3/5] Sync web assets into Android project ========
echo [3/5] Syncing into Android project...
call node node_modules\@capacitor\cli\bin\capacitor sync android
if errorlevel 1 (
    echo.
    echo FAILED: capacitor sync failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      android sync ok.

rem ======== [4/5] Build APK ========
echo [4/5] Building APK (first run may take 5-10 min)...
cd /d C:\Users\sky\ags-build2\android
call "C:\Users\sky\gradle-dist\gradle-8.14.3\bin\gradle.bat" assembleDebug --no-daemon
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Please send the error above to the assistant.
    pause
    exit /b 1
)

rem ======== [5/5] Copy APK to Desktop ========
set "APK=C:\Users\sky\ags-build2\android\app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK%" (
    copy /y "%APK%" "%USERPROFILE%\Desktop\AGS-data-app.apk" >nul
    echo.
    echo ==========================================
    echo  SUCCESS!
    echo  APK copied to your Desktop:
    echo  %USERPROFILE%\Desktop\AGS-data-app.apk
    echo ==========================================
) else (
    echo APK file not found. Build may not have completed.
)
echo.
pause
