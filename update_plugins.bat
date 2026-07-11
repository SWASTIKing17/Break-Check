@echo off
setlocal EnableDelayedExpansion

:: Get Date and Month safely using PowerShell
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-Date -Format 'yyyy-MM-dd'"`) do set "folderDate=%%a"
for /f "usebackq tokens=*" %%a in (`powershell -Command "Get-Date -Format 'MMM'"`) do set "folderMonth=%%a"

set "BACKUP_DIR=plugin_backup\backup\%folderDate% %folderMonth%"
set "PLUGINS_DIR=plugins"
set "CEPS_DIR=CEPs"

echo ===================================================
echo FreeXan Plugin Updater
echo ===================================================

echo [1/3] Creating backup directory: "%BACKUP_DIR%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo [2/3] Moving current plugins to backup...
:: Move all files and directories from plugins to the backup folder
move /Y "%PLUGINS_DIR%\*" "%BACKUP_DIR%\" 2>nul
for /d %%x in ("%PLUGINS_DIR%\*") do move /Y "%%x" "%BACKUP_DIR%\" 2>nul

echo [3/3] Copying necessary CEP extension files to plugins...
:: Iterate through each plugin inside CEPs folder
for /d %%P in ("%CEPS_DIR%\*") do (
    set "PLUGIN_NAME=%%~nxP"
    echo   - Processing !PLUGIN_NAME!...
    
    :: Only process folders that look like actual plugins (have a CSXS manifest)
    if exist "%%P\CSXS\manifest.xml" (
        mkdir "%PLUGINS_DIR%\!PLUGIN_NAME!" 2>nul
        
        :: Robocopy: copy all files/folders, exclude dev artifacts exactly like install_plugins.bat
        robocopy "%%P" "%PLUGINS_DIR%\!PLUGIN_NAME!" ^
            /E /NJH /NJS /ndl /nc /ns /np ^
            /XD ".git" ".agent" ".claude" "node_modules" "panel-src" ^
                 "scratch" "trash" "old_files" "Backup" "BUG" "SKILL" ^
                 "Extras" "Prompt" "debug" "docs" "%%APPDATA%%" ^
                 "custom" "mogrt sample" ^
            /XF ".gitignore" "*.patch" "*.ps1" "*.md" "*.tmp" ^
                 "package.json" "package-lock.json" "tsconfig.json" ^
                 "*.map" "install_mac.command" "Install_*.bat" >nul
                 
        if !ERRORLEVEL! LEQ 7 (
            echo       [OK] Copied successfully.
        ) else (
            echo       [ERROR] Copy failed ^(robocopy exit: !ERRORLEVEL!^).
        )
    ) else (
        echo       Skipped ^(no manifest found — not a valid plugin^).
    )
)

echo ===================================================
echo Update Complete! Only necessary files were copied.
echo ===================================================
pause
