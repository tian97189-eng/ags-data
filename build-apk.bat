@echo off
setlocal EnableExtensions
echo ==========================================
echo  AGS Data App - Build APK
echo ==========================================
echo.

set "JAVA_HOME=C:\jdk21\jdk"
set "ANDROID_HOME=C:\android-sdk"
set "ANDROID_SDK_ROOT=C:\android-sdk"
set "GRADLE_USER_HOME=C:\Users\sky\gradle-home"
set "BUILD=C:\Users\sky\ags-build2"
set "LOG=%BUILD%\build-log.txt"
set "SRC=%~dp0"

echo Log file: %LOG%
if exist "%LOG%" del /q "%LOG%" >nul 2>&1

rem ======== [1/7] Ensure release keystore (fixed signature keeps data on update) ========
echo [1/7] Ensuring release keystore...
set "KEYSTORE_DIR=C:\Users\sky\ags-release-keystore"
set "KEYSTORE_FILE=%KEYSTORE_DIR%\ags-release.keystore"
set "KS_PASS=ags-release-2026"
if not exist "%KEYSTORE_FILE%" (
    if not exist "%KEYSTORE_DIR%" mkdir "%KEYSTORE_DIR%"
    "%JAVA_HOME%\bin\keytool.exe" -genkeypair -v -keystore "%KEYSTORE_FILE%" -alias ags -keyalg RSA -keysize 2048 -validity 36500 -storepass %KS_PASS% -keypass %KS_PASS% -dname "CN=AGS Data,O=Local,C=CN" >> "%LOG%" 2>&1
    if errorlevel 1 goto fail
    echo      keystore created.
) else (
    echo      keystore exists.
)
(
    echo storeFile=%KEYSTORE_FILE:\=/%
    echo storePassword=%KS_PASS%
    echo keyAlias=ags
    echo keyPassword=%KS_PASS%
) > "%BUILD%\android\keystore.properties"
if errorlevel 1 goto fail
echo      keystore.properties written.

rem ======== [2/7] Sync latest source code ========
echo [2/7] Syncing source code...
xcopy /D /E /I /Y /Q "%SRC%src"       "%BUILD%\src"       >> "%LOG%" 2>&1
xcopy /D /E /I /Y /Q "%SRC%public"    "%BUILD%\public"    >> "%LOG%" 2>&1
xcopy /D /E /I /Y /Q "%SRC%scripts"   "%BUILD%\scripts"   >> "%LOG%" 2>&1
copy /Y "%SRC%package.json"       "%BUILD%\package.json"       >> "%LOG%" 2>&1
copy /Y "%SRC%package-lock.json"  "%BUILD%\package-lock.json"  >> "%LOG%" 2>&1
copy /Y "%SRC%vite.config.ts"     "%BUILD%\vite.config.ts"     >> "%LOG%" 2>&1
copy /Y "%SRC%tsconfig.json"      "%BUILD%\tsconfig.json"      >> "%LOG%" 2>&1
copy /Y "%SRC%tailwind.config.js" "%BUILD%\tailwind.config.js" >> "%LOG%" 2>&1
copy /Y "%SRC%postcss.config.js"  "%BUILD%\postcss.config.js"  >> "%LOG%" 2>&1
copy /Y "%SRC%index.html"         "%BUILD%\index.html"         >> "%LOG%" 2>&1
copy /Y "%SRC%capacitor.config.ts" "%BUILD%\capacitor.config.ts" >> "%LOG%" 2>&1
copy /Y "%SRC%android\app\build.gradle" "%BUILD%\android\app\build.gradle" >> "%LOG%" 2>&1
rem MainActivity.java 必须同步（包名 com.ags.data，漏了会用旧包名导致启动闪退）
copy /Y "%SRC%android\app\src\main\java\com\ags\data\MainActivity.java" "%BUILD%\android\app\src\main\java\com\ags\data\MainActivity.java" >> "%LOG%" 2>&1
echo      source synced.

rem ======== [3/7] Install dependencies ========
echo [3/7] Installing dependencies (this may take a few minutes)...
cd /d "%BUILD%"
call npm install --no-audit --no-fund >> "%LOG%" 2>&1
if errorlevel 1 goto fail
echo      dependencies ok.

rem ======== [4/7] Build web assets ========
echo [4/7] Building web assets...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto fail
echo      web build ok.

rem ======== [5/7] Sync web assets into Android project ========
echo [5/7] Syncing into Android project...
call node node_modules\@capacitor\cli\bin\capacitor sync android >> "%LOG%" 2>&1
if errorlevel 1 goto fail
echo      android sync ok.

rem ======== [6/7] Build APK (gradle) ========
echo [6/7] Building APK. Progress is shown below, takes 1-10 minutes.
echo      看到窗口在滚动 gradle 日志就说明正在构建，请等到出现 SUCCESS 或 BUILD FAILED。
cd /d "%BUILD%\android"
rem gradle 输出直接显示在窗口（不再重定向进日志）。之前把输出全写日志导致窗口
rem 空白 1-10 分钟，用户误以为卡死而关窗/Ctrl+C，[7/7] 拷贝步骤永远没机会执行，
rem 桌面就一直没 APK。现在窗口能实时看到 gradle 进度，用户知道在跑，不会误关。
"%JAVA_HOME%\bin\java.exe" -Dorg.gradle.appname=gradlew -classpath "C:\Users\sky\gradle-dist\gradle-8.14.3\lib\gradle-launcher-8.14.3.jar" org.gradle.launcher.GradleMain assembleRelease --no-daemon --console=plain
if errorlevel 1 goto fail
echo      apk build ok.

rem ======== [7/7] Copy APK to Desktop ========
set "APK=%BUILD%\android\app\build\outputs\apk\release\app-release.apk"
if exist "%APK%" (
    copy /y "%APK%" "%USERPROFILE%\Desktop\AGS-data-app.apk" >> "%LOG%" 2>&1
    echo.
    echo ==========================================
    echo  SUCCESS!
    echo  APK copied to your Desktop:
    echo  %USERPROFILE%\Desktop\AGS-data-app.apk
    echo.
    echo  IMPORTANT for updating:
    echo    * Install the new APK directly over the old one (do NOT uninstall first).
    echo    * Signature is fixed (release), so app data is kept.
    echo ==========================================
    echo.
    goto end
) else (
    echo APK file not found. See log for details.
    goto fail
)

:fail
echo.
echo ==========================================
echo  BUILD FAILED - window will stay open.
echo  Full log: %LOG%
echo  Please send the log file to your AI assistant.
echo ==========================================
echo.
pause
exit /b 1

:end
pause
