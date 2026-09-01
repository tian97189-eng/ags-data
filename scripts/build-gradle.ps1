# build-gradle.ps1
# 由 build-apk.bat 调用（powershell -NoProfile -ExecutionPolicy Bypass -File ...）
# 用 java 直启 GradleMain（绕开 gradle.bat 的 exit 行为），Tee-Object 让 gradle 输出
# 同时显示在调用方窗口 AND 追加写入 build-log.txt。
# 关键：用 --% stop-parsing token 让 PowerShell 把后续 token 原样传给 java，
# 避免 PowerShell 把 "-D..." 误当成自己的 cmd 参数（之前在 cmd -Command 字符串里
# --% 行为不稳，故把整个 PowerShell 命令移到独立 .ps1 文件执行）。

# 注意：--% 之后的所有 token 必须为字面量（PowerShell 在 stop-parsing 模式下不展开
# 变量、不解析引号/转义），所以路径全部写死不插变量。

$ErrorActionPreference = 'Continue'
$logFile = 'C:\Users\sky\ags-build2\build-log.txt'

& 'C:\jdk21\jdk\bin\java.exe' --% -Dorg.gradle.appname=gradlew -classpath C:\Users\sky\gradle-dist\gradle-8.14.3\lib\gradle-launcher-8.14.3.jar org.gradle.launcher.GradleMain assembleRelease --no-daemon --console=plain |
  Tee-Object -Append -FilePath $logFile
exit $LASTEXITCODE