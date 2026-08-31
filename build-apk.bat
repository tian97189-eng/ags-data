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

cd /d C:\Users\sky\ags-build2\android

echo [1/2] Building APK (first run may take 5-10 min)...
call "C:\Users\sky\gradle-dist\gradle-8.14.3\bin\gradle.bat" assembleDebug --no-daemon
if errorlevel 1 (
    echo.
    echo BUILD FAILED. Please send the error above to the assistant.
    pause
    exit /b 1
)

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
