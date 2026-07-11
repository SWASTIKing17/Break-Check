@echo off
:: ==============================================================================
:: FreeXan Native Pill Quick Updater Script
:: Automatically replaces FreeXanPill.exe in C:\Program Files\freexan\
:: ==============================================================================

echo [FreeXan Updater] Checking for Administrator privileges...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [FreeXan Updater] Requesting Administrator permissions...
    powershell -Command "Start-Process -FilePath '%~dpnx0' -Verb RunAs"
    exit /b
)

echo [FreeXan Updater] Administrator privileges confirmed.
echo [FreeXan Updater] Terminating any running FreeXanPill.exe processes...
taskkill /F /IM FreeXanPill.exe >nul 2>&1

set "SOURCE=C:\Swastik Development\FreeXan Development\native-pill\build\FreeXanPill.exe"
set "TARGET_DIR=C:\Program Files\freexan\resources\app.asar.unpacked\native-pill\build"
set "TARGET_FILE=%TARGET_DIR%\FreeXanPill.exe"

if not exist "%SOURCE%" (
    echo [ERROR] Source binary not found: "%SOURCE%"
    echo Please run build.bat inside native-pill folder first!
    pause
    exit /b 1
)

if not exist "%TARGET_DIR%" (
    echo [INFO] Target directory does not exist, creating: "%TARGET_DIR%"
    mkdir "%TARGET_DIR%"
)

echo [FreeXan Updater] Copying new FreeXanPill.exe...
copy /Y "%SOURCE%" "%TARGET_FILE%"

if %errorLevel% equ 0 (
    echo ==============================================================================
    echo [SUCCESS] FreeXanPill.exe updated inside C:\Program Files\freexan\ successfully!
    echo ==============================================================================
) else (
    echo ==============================================================================
    echo [ERROR] Failed to copy binary. Check permissions or make sure FreeXan is closed.
    echo ==============================================================================
)

echo.
echo Press any key to exit...
pause >nul
