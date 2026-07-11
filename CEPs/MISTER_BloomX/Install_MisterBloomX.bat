@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: Mister BloomX Single-Click Installer for Windows
:: =====================================================================

echo.
echo  [Mister BloomX] Starting Installer...
echo.

:: 1. Define Paths
set "BUNDLE_ID=com.bloomx.misterbloomx"
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

robocopy "%~dp0CSXS" "%INSTALL_PATH%\CSXS" /E /NJH /NJS /ndl /nc /ns /np
robocopy "%~dp0dist" "%INSTALL_PATH%\dist" /E /NJH /NJS /ndl /nc /ns /np

echo.
echo  =============================================================
echo  [SUCCESS] Mister BloomX has been installed!
echo  =============================================================
echo.
echo  INSTRUCTIONS:
echo  1. Close and restart Premiere Pro.
echo  2. Go to Window -^> Extensions -^> MisterBloomX.
echo.
pause
