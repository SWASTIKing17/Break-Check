@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: Audio freeXan Single-Click Installer for Windows
:: =====================================================================

echo.
echo  [Audio freeXan] Starting Installer...
echo.

:: 1. Define Paths
set "BUNDLE_ID=com.bloomx.freexan.audio"
set "CEP_DIR=%APPDATA%\Adobe\CEP\extensions"
set "INSTALL_PATH=%CEP_DIR%\%BUNDLE_ID%"

:: 2. Registry Fix: Enable Debug Mode (allows unsigned extensions)
echo  [1/3] Enabling Adobe Debug Mode (Registry)...
powershell -Command "foreach($v in 4..17) { $path = \"HKCU:\Software\Adobe\CSXS.$v\"; if(-not (Test-Path $path)) { New-Item $path -Force | Out-Null }; Set-ItemProperty $path -Name \"PlayerDebugMode\" -Value \"1\" -Force }"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to update Registry. Please run as Administrator if this persists.
)

:: 3. Create Extension Directory
echo  [2/3] Preparing Extension Folder...
if exist "%INSTALL_PATH%" (
    echo      Removing existing version...
    rmdir /s /q "%INSTALL_PATH%"
)
mkdir "%INSTALL_PATH%"

:: 4. Copy Essential Files
echo  [3/3] Copying Plugin Files...

:: Copying all files and directories except the installer script itself
robocopy "%~dp0." "%INSTALL_PATH%" /E /NJH /NJS /ndl /nc /ns /np /XF "Install_AudioFreeXan.bat"

echo.
echo  =============================================================
echo  [SUCCESS] Audio freeXan has been installed!
echo  =============================================================
echo.
echo  INSTRUCTIONS:
echo  1. Close and restart Premiere Pro.
echo  2. Go to Window -^> Extensions -^> Audio freeXan.
echo.
pause
