@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: freeXan by BloomX — Master Plugin Installer (Windows)
:: Installs all CEP plugins via robocopy (no junction, no Admin needed)
:: Run this file once after cloning or after any plugin update.
:: =====================================================================

echo.
echo  ============================================================
echo   freeXan by BloomX — Plugin Installer
echo  ============================================================
echo.

:: ── Resolve paths ────────────────────────────────────────────────────
set "CEPS_DIR=%~dp0"
:: plugins/ lives one level up (FreeXan Development\plugins\)
set "PLUGINS_DIR=%~dp0..\plugins"
set "CEP_EXT=%APPDATA%\Adobe\CEP\extensions"

:: ── Ensure extensions folder exists ──────────────────────────────────
if not exist "%CEP_EXT%" (
    mkdir "%CEP_EXT%"
    echo  Created extensions directory: %CEP_EXT%
)

:: ── Step 1: Registry — PlayerDebugMode for all known CSXS versions ───
echo  [1/6] Enabling Adobe CEP Debug Mode (allows unsigned extensions)...
for %%V in (4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20) do (
    reg add "HKCU\Software\Adobe\CSXS.%%V" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)
echo       Done.
echo.

:: ── Helper macro: install one plugin via robocopy ────────────────────
:: Usage: call :install_plugin  <source_folder>  <bundle_id>  <display_name>
goto :start_installs

:install_plugin
    set "_SRC=%~1"
    set "_BUNDLE=%~2"
    set "_NAME=%~3"
    set "_DST=%CEP_EXT%\%_BUNDLE%"

    echo  Installing %_NAME%...
    echo       Source : %_SRC%
    echo       Target : %_DST%

    :: Remove existing install cleanly
    if exist "%_DST%" (
        rmdir /S /Q "%_DST%" >nul 2>&1
        if exist "%_DST%" (
            echo  [WARN] Could not remove old install at %_DST%.
            echo         Close Premiere Pro and re-run this installer.
        )
    )

    :: Create target folder
    mkdir "%_DST%" >nul 2>&1

    :: Robocopy: copy all files/folders, exclude dev artifacts
    robocopy "%_SRC%" "%_DST%" ^
        /E /NJH /NJS /ndl /nc /ns /np ^
        /XD ".git" ".agent" ".claude" "node_modules" "panel-src" ^
             "scratch" "trash" "old_files" "Backup" "BUG" "SKILL" ^
             "Extras" "Prompt" "debug" "docs" ^
        /XF ".gitignore" "*.patch" "*.ps1" "*.md" "*.tmp" ^
             "package.json" "package-lock.json" "tsconfig.json" ^
             "*.map" "install_mac.command" >nul

    :: Robocopy exit codes 0-7 are success (0=no change, 1=copied, etc.)
    if !ERRORLEVEL! LEQ 7 (
        echo       [OK] %_NAME% installed successfully.
    ) else (
        echo  [ERROR] %_NAME% install failed ^(robocopy exit: !ERRORLEVEL!^).
    )
    echo.
    goto :eof

:start_installs

:: ── Step 2: freeXan Caption ──────────────────────────────────────────
echo  [2/6] freeXan Caption
call :install_plugin "%CEPS_DIR%freeXan_Caption" "com.bloomx.freexan.caption" "freeXan Caption"

:: ── Step 3: Link_freeXan ─────────────────────────────────────────────
echo  [3/6] Link freeXan
call :install_plugin "%CEPS_DIR%Link_freeXan" "com.bloomx.freexan.link" "Link freeXan"

:: ── Step 4: Audio_freeXan (source in CEPs/) ──────────────────────────
echo  [4/6] Audio freeXan
call :install_plugin "%CEPS_DIR%Audio_freeXan" "com.bloomx.freexan.audio" "Audio freeXan"

:: ── Step 5: MISTER BloomX (source in CEPs/) ──────────────────────────
echo  [5/6] MISTER BloomX
call :install_plugin "%CEPS_DIR%MISTER_BloomX" "com.bloomx.misterbloomx" "MISTER BloomX"

:: ── Step 6: freeXan DebugLog ─────────────────────────────────────────
echo  [6/6] freeXan DebugLog
:: DebugLog folder exists in CEPs but may be empty — check and skip gracefully
if exist "%CEPS_DIR%freeXan_DebugLog\CSXS\manifest.xml" (
    call :install_plugin "%CEPS_DIR%freeXan_DebugLog" "com.bloomx.freexan.debuglog" "freeXan DebugLog"
) else (
    echo       Skipped ^(no manifest found — plugin not yet set up^).
    echo.
)

:: ── Done ─────────────────────────────────────────────────────────────
echo  ============================================================
echo   Installation complete!
echo  ============================================================
echo.
echo   Next steps:
echo   1. Close Adobe Premiere Pro completely (if open).
echo   2. Reopen Premiere Pro.
echo   3. Go to  Window ^> Extensions  to see the installed panels.
echo.
echo   Installed to: %CEP_EXT%
echo.
pause
