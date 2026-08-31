@echo off
setlocal
echo ==========================================
echo  AGS Data App - Build APK (release signed)
echo ==========================================
echo.

set "JAVA_HOME=C:\jdk21\jdk"
set "ANDROID_HOME=C:\android-sdk"
set "ANDROID_SDK_ROOT=C:\android-sdk"
set "GRADLE_USER_HOME=C:\Users\sky\gradle-home"

rem ======== [0/6] Sync latest source code to build dir ========
echo [0/6] Syncing source code...
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

rem ======== [1/6] Ensure release keystore exists (固定签名 → 升级保留数据) ========
echo [1/6] Ensuring release keystore...
set "KEYSTORE_DIR=C:\Users\sky\ags-release-keystore"
set "KEYSTORE_FILE=%KEYSTORE_DIR%\ags-release.keystore"
set "KS_PASS=ags-release-2026"
if not exist "%KEYSTORE_FILE%" (
    if not exist "%KEYSTORE_DIR%" mkdir "%KEYSTORE_DIR%"
    "%JAVA_HOME%\bin\keytool.exe" -genkeypair -v -keystore "%KEYSTORE_FILE%" -alias ags -keyalg RSA -keysize 2048 -validity 36500 -storepass %KS_PASS% -keypass %KS_PASS% -dname "CN=AGS Data,O=Local,C=CN" >nul
    if errorlevel 1 (
        echo FAILED: keytool failed. Send the error above to the assistant.
        pause
        exit /b 1
    )
    echo      generated new keystore at %KEYSTORE_FILE%
) else (
    echo      reusing existing keystore at %KEYSTORE_FILE%
)

rem 把 keystore.properties 写到 android/ 目录（build.gradle 从这里读），不提交 git
(
    echo storeFile=%KEYSTORE_FILE%
    echo storePassword=%KS_PASS%
    echo keyAlias=ags
    echo keyPassword=%KS_PASS%
) > "C:\Users\sky\ags-build2\android\keystore.properties"
echo      keystore.properties written.

rem ======== [2/6] Install any new dependencies ========
echo [2/6] Installing dependencies (incremental)...
cd /d C:\Users\sky\ags-build2
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo FAILED: npm install failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      dependencies ok.

rem ======== [3/6] Build web assets ========
echo [3/6] Building web assets...
call npm run build
if errorlevel 1 (
    echo.
    echo FAILED: web build failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      web build ok.

rem ======== [4/6] Sync web assets into Android project ========
echo [4/6] Syncing into Android project...
call node node_modules\@capacitor\cli\bin\capacitor sync android
if errorlevel 1 (
    echo.
    echo FAILED: capacitor sync failed. Send the error above to the assistant.
    pause
    exit /b 1
)
echo      android sync ok.

rem ======== [5/6] Build APK ========
echo [5/6] Building APK (first run may take 5-10 min)...
cd /d C:\Users\sky\ags-build2\android
call "C:\Users\sky\gradle-dist\gradle-8.14.3\bin\gradle.bat" assembleRelease --no-daemon
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Please send the error above to the assistant.
    pause
    exit /b 1
)

rem ======== [6/6] Copy APK to Desktop ========
set "APK=C:\Users\sky\ags-build2\android\app\build\outputs\apk\release\app-release.apk"
if exist "%APK%" (
    copy /y "%APK%" "%USERPROFILE%\Desktop\AGS-data-app.apk" >nul
    echo.
    echo ==========================================
    echo  SUCCESS!
    echo  APK copied to your Desktop:
    echo  %USERPROFILE%\Desktop\AGS-data-app.apk
    echo.
    echo  IMPORTANT - 升级安装保留数据:
    echo    * 直接点新 APK 安装（覆盖安装），不要先卸载
    echo    * 签名已固定 (release)，重复构建 APK 的包名/签名一致
    echo    * 数据会保留。如果不小心卸载了，数据会清。
    echo ==========================================
) else (
    echo APK file not found. Build may not have completed.
)
echo.
pause