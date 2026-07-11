@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: freeXan Caption by BloomX - Single-Click Installer for Windows
:: =====================================================================

echo.
echo  [freeXan Caption] Starting Installer...
echo.

:: 1. Define Paths
set "BUNDLE_ID=com.bloomx.freexan.caption"
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

:: Using robocopy for robust copying
:: /E - Copy subdirectories, including empty ones
:: /NJH /NJS - Quiet mode (no header/summary)
:: /XF - Exclude specific files
:: /XD - Exclude specific directories
robocopy "%~dp0CSXS" "%INSTALL_PATH%\CSXS" /E /NJH /NJS /ndl /nc /ns /np
robocopy "%~dp0panel" "%INSTALL_PATH%\panel" /E /NJH /NJS /ndl /nc /ns /np /XD "%INSTALL_PATH%\panel\prompt"
:: Re-create the prompt folder if it doesn't exist yet (first install)
if not exist "%INSTALL_PATH%\panel\prompt" (
    robocopy "%~dp0panel\prompt" "%INSTALL_PATH%\panel\prompt" /E /NJH /NJS /ndl /nc /ns /np
)
robocopy "%~dp0dialog" "%INSTALL_PATH%\dialog" /E /NJH /NJS /ndl /nc /ns /np
robocopy "%~dp0src" "%INSTALL_PATH%\src" /E /NJH /NJS /ndl /nc /ns /np
copy "%~dp0mimetype" "%INSTALL_PATH%\mimetype" >nul

echo.
echo  =============================================================
echo  [SUCCESS] freeXan Caption has been installed!
echo  =============================================================
echo.
echo  INSTRUCTIONS:
echo  1. Close and restart Premiere Pro.
echo  2. Go to Window -^> Extensions -^> freeXan Caption.
echo.
pause
