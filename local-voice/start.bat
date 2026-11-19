@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating a Python environment. Internet is required for first setup.
  py -3 -m venv .venv
  if errorlevel 1 goto error
)
.venv\Scripts\python.exe -c "import torch" >nul 2>&1
if errorlevel 1 (
  echo Installing PyTorch CPU. This can take several minutes.
  .venv\Scripts\python.exe -m pip install --upgrade pip
  if errorlevel 1 goto error
  .venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cpu
  if errorlevel 1 goto error
)
.venv\Scripts\python.exe server.py
if errorlevel 1 goto error
goto end
:error
echo.
echo Setup or startup failed. Please send a screenshot of this window.
pause
:end
endlocal
