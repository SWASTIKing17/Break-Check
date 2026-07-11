@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: freeXan Caption by BloomX — Single-Plugin Installer for Windows
:: Use this to install ONLY the Caption plugin (e.g. after an update).
:: For a full suite install, run CEPs\install_plugins.bat instead.
:: =====================================================================

echo.
echo  ============================================================
echo   freeXan Caption by BloomX — Installer
echo  ============================================================
echo.

set "BUNDLE_ID=com.bloomx.freexan.caption"
set "CEP_EXT=%APPDATA%\Adobe\CEP\extensions"
set "INSTALL_PATH=%CEP_EXT%\%BUNDLE_ID%"
set "SRC=%~dp0"

:: ── Step 1: Registry ─────────────────────────────────────────────────
echo  [1/3] Enabling Adobe CEP Debug Mode (allows unsigned extensions)...
for %%V in (4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20) do (
    reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)
echo       Done.
echo.

:: ── Step 2: Remove old install ───────────────────────────────────────
echo  [2/3] Preparing extension folder...
if exist "%INSTALL_PATH%" (
    echo       Removing existing version...
    rmdir /S /Q "%INSTALL_PATH%" >nul 2>&1
    if exist "%INSTALL_PATH%" (
        echo  [ERROR] Could not remove old install. Is Premiere Pro open?
        echo          Please close Premiere Pro and run this installer again.
        pause
        exit /b 1
    )
)
mkdir "%INSTALL_PATH%"
if not exist "%INSTALL_PATH%" (
    echo  [ERROR] Could not create install directory: %INSTALL_PATH%
    pause
    exit /b 1
)
echo       Ready.
echo.

:: ── Step 3: Copy plugin files (exclude dev artifacts) ────────────────
echo  [3/3] Copying plugin files...

:: CSXS — manifest (required)
robocopy "%SRC%CSXS" "%INSTALL_PATH%\CSXS" /E /NJH /NJS /ndl /nc /ns /np >nul

:: panel — compiled JS/CSS/HTML (required); exclude dev-only subfolders
robocopy "%SRC%panel" "%INSTALL_PATH%\panel" /E /NJH /NJS /ndl /nc /ns /np ^
    /XD "prompt" "logs" >nul

:: dialog — dialog HTML (required)
if exist "%SRC%dialog" (
    robocopy "%SRC%dialog" "%INSTALL_PATH%\dialog" /E /NJH /NJS /ndl /nc /ns /np >nul
)

:: src — ExtendScript / legacy JS (required if exists)
if exist "%SRC%src" (
    robocopy "%SRC%src" "%INSTALL_PATH%\src" /E /NJH /NJS /ndl /nc /ns /np >nul
)

:: mimetype — required by CEP spec
if exist "%SRC%mimetype" (
    copy /Y "%SRC%mimetype" "%INSTALL_PATH%\mimetype" >nul
)

:: Verify something actually landed
if not exist "%INSTALL_PATH%\CSXS\manifest.xml" (
    echo.
    echo  [ERROR] manifest.xml not found after copy — something went wrong.
    echo          Source: %SRC%CSXS\manifest.xml
    pause
    exit /b 1
)

echo       Done.
echo.

:: ── Result ───────────────────────────────────────────────────────────
echo  ============================================================
echo   [SUCCESS] freeXan Caption installed!
echo  ============================================================
echo.
echo   Installed to:
echo     %INSTALL_PATH%
echo.
echo   Next steps:
echo   1. Close Premiere Pro completely (if open).
echo   2. Reopen Premiere Pro.
echo   3. Go to  Window ^> Extensions ^> freeXan Caption.
echo.
pause
