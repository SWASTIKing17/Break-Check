@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: Link freeXan by BloomX — Standalone Installer (Windows)
:: Bundle ID : com.bloomx.freexan.link
:: Source    : CEPs\Link_freeXan\
:: Target    : %APPDATA%\Adobe\CEP\extensions\com.bloomx.freexan.link\
::
:: Installs via robocopy — no junction points, no Admin rights required.
:: Close Adobe Premiere Pro before running.
:: =====================================================================

echo.
echo  ============================================================
echo   Link freeXan by BloomX — Installer
echo  ============================================================
echo.

:: ── Resolve paths ──────────────────────────────────────────────────────────
:: This .bat lives in CEPs\Link_freeXan\ — source is the same folder.
set "SRC=%~dp0"
:: Remove trailing backslash to prevent escaping quotes in robocopy
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"
set "BUNDLE=com.bloomx.freexan.link"
set "CEP_EXT=%APPDATA%\Adobe\CEP\extensions"
set "DST=%CEP_EXT%\%BUNDLE%"

echo   Source  : %SRC%
echo   Target  : %DST%
echo.

:: ── Step 1: CEP Debug Mode (allows unsigned extensions) ────────────────────
echo  [1/3] Enabling Adobe CEP PlayerDebugMode...
for %%V in (4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20) do (
    reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)
echo        Done.
echo.

:: ── Step 2: Ensure extensions folder exists ────────────────────────────────
if not exist "%CEP_EXT%" (
    mkdir "%CEP_EXT%"
    echo  Created extensions directory: %CEP_EXT%
)

:: ── Step 3: Install Link freeXan ───────────────────────────────────────────
echo  [2/3] Installing Link freeXan...

:: Remove previous install cleanly
if exist "%DST%" (
    echo        Removing old installation...
    rmdir /S /Q "%DST%" >nul 2>&1
    if exist "%DST%" (
        echo.
        echo  [WARN] Could not remove old install at:
        echo         %DST%
        echo.
        echo         Premiere Pro may be holding a lock on the files.
        echo         Please close Premiere Pro and run this installer again.
        echo.
        pause
        exit /b 1
    )
)

:: Create fresh target folder
mkdir "%DST%" >nul 2>&1

:: Robocopy — copy all files & sub-folders, exclude dev artifacts
robocopy "%SRC%" "%DST%" ^
    /E /NJH /NJS /ndl /nc /ns /np ^
    /XD ".git" "node_modules" "scratch" "trash" "old_files" ^
         "Backup" "BUG" "SKILL" "Extras" "Prompt" "debug" "docs" ^
    /XF ".gitignore" "*.patch" "*.ps1" "*.md" "*.tmp" ^
         "package.json" "package-lock.json" "*.map" ^
         "install_link_freexan.bat" "install_mac.command" >nul

:: Robocopy exit codes 0-7 are all successes
if !ERRORLEVEL! LEQ 7 (
    echo        [OK] Link freeXan installed successfully.
) else (
    echo.
    echo  [ERROR] Installation failed ^(robocopy exit code: !ERRORLEVEL!^).
    echo          Check that you have write access to:
    echo          %DST%
    echo.
    pause
    exit /b 1
)
echo.

:: ── Verify manifest was copied ─────────────────────────────────────────────
echo  [3/3] Verifying installation...
if exist "%DST%\CSXS\manifest.xml" (
    echo        [OK] manifest.xml found — extension is valid.
) else (
    echo        [WARN] manifest.xml not found in target. Extension may not load.
    echo               Expected: %DST%\CSXS\manifest.xml
)
echo.

:: ── Done ───────────────────────────────────────────────────────────────────
echo  ============================================================
echo   Link freeXan installed successfully!
echo  ============================================================
echo.
echo   Bundle ID : com.bloomx.freexan.link
echo   Installed : %DST%
echo.
echo   Next steps:
echo   1. Close Adobe Premiere Pro completely ^(if still open^).
echo   2. Reopen Premiere Pro.
echo   3. Go to  Window ^> Extensions ^> Link freeXan
echo.
pause
