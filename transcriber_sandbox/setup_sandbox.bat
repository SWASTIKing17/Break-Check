@echo off
SETLOCAL EnableDelayedExpansion

:: =====================================================================
:: freeXan Transcriber Sandbox — Environment Setup (Phase 1)
:: Creates a localized Python virtual environment (venv) and installs
:: PyTorch with CUDA 12.1 support along with faster-whisper and WhisperX.
:: =====================================================================

echo.
echo  ============================================================
echo   freeXan Transcriber Sandbox — Phase 1 Setup
echo  ============================================================
echo.

cd /d "%~dp0"

:: 1. Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Python is not installed or not in system PATH.
    echo          Please install Python 3.10 or 3.11.
    pause
    exit /b 1
)

:: 2. Create Virtual Environment
if not exist "venv" (
    echo  [1/3] Creating Python virtual environment (venv)...
    python -m venv venv
    echo        Done.
) else (
    echo  [1/3] Virtual environment 'venv' already exists.
)
echo.

:: 3. Activate and Install PyTorch CUDA
echo  [2/3] Installing PyTorch (CUDA 12.1) and AI dependencies...
echo        (Note: This will download ~3GB of GPU wheels on first run)
echo.

call venv\Scripts\activate.bat

:: Upgrade pip
python -m pip install --upgrade pip >nul

:: Install PyTorch CUDA 12.1 explicitly first
pip install torch==2.3.1 torchaudio==2.3.1 --index-url https://download.pytorch.org/whl/cu121

:: Install faster-whisper and WhisperX
pip install faster-whisper==1.0.3
pip install git+https://github.com/m-bain/whisperX.git

:: Install FastAPI bridge dependencies
pip install fastapi==0.111.0 uvicorn==0.30.1

echo.
echo  [3/3] Verification...
python -c "import torch; print('PyTorch CUDA Available:', torch.cuda.is_available(), '| Device:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"

echo.
echo  ============================================================
echo   Setup Complete!
echo  ============================================================
echo.
echo   To test the engine:
echo   1. Place any audio file (e.g., test.wav) in this folder.
echo   2. Run: venv\Scripts\python core_engine.py test.wav
echo.
pause
