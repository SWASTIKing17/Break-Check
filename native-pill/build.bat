@echo off
setlocal
echo ========================================================
echo FreeXan C++ Native Overlay Pill Build Script
echo ========================================================

if not exist "build" mkdir build

set "PATH=%PATH%;%LOCALAPPDATA%\Microsoft\WinGet\Links"
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\*BrechtSanders.WinLibs*") do (
    if exist "%%D\mingw64\bin" set "PATH=%PATH%;%%D\mingw64\bin"
)

where cl >nul 2>nul
if %errorlevel% equ 0 (
    echo [BUILD] Microsoft Visual C++ compiler detected.
    cl /nologo /EHsc /W3 /O2 /Fe:build\FreeXanPill.exe main.cpp Renderer.cpp DropHandler.cpp IpcMessenger.cpp ole32.lib shell32.lib user32.lib d2d1.lib dwrite.lib dwmapi.lib
    if %errorlevel% equ 0 (
        echo [SUCCESS] Build completed: build\FreeXanPill.exe
        del *.obj 2>nul
    ) else (
        echo [ERROR] MSVC build failed.
    )
    goto end
)

where g++ >nul 2>nul
if %errorlevel% equ 0 (
    echo [BUILD] MinGW g++ compiler detected.
    g++ -O2 -static -static-libgcc -static-libstdc++ -mwindows -o build\FreeXanPill.exe main.cpp Renderer.cpp DropHandler.cpp IpcMessenger.cpp -lole32 -lshell32 -luser32 -ld2d1 -ldwrite -luuid -loleaut32 -ldwmapi
    if %errorlevel% equ 0 (
        echo [SUCCESS] Build completed: build\FreeXanPill.exe
    ) else (
        echo [ERROR] MinGW build failed.
    )
    goto end
)

echo [WARNING] No C++ compiler (cl.exe or g++.exe) found in PATH.
echo To build the native pill, please open a Visual Studio Developer Command Prompt or install MinGW.
echo Once built, FreeXan will automatically launch FreeXanPill.exe side-by-side!

:end
endlocal
