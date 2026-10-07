@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo ============================================================
echo   DWM - Supermarket Association Mining
echo   One-click project launcher
echo ============================================================
echo.

where py >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python Launcher ^(py^) was not found.
  echo Install Python 3.10+ and run this file again.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found.
  echo Install Node.js 18+ and run this file again.
  pause
  exit /b 1
)

rem ------------------------------------------------------------
rem Backend: create/install ONLY when actually missing.
rem ------------------------------------------------------------
if not exist "%BACKEND%\venv\Scripts\python.exe" (
  echo [First run] Creating Python virtual environment...
  py -m venv "%BACKEND%\venv"
  if errorlevel 1 goto :venv_error
)

"%BACKEND%\venv\Scripts\python.exe" -c "import fastapi,uvicorn,pandas,mlxtend,multipart,xlsxwriter" >nul 2>&1
if errorlevel 1 (
  echo [First run/repair] Installing missing Python dependencies...
  echo This happens only if the backend environment is missing or broken.
  "%BACKEND%\venv\Scripts\python.exe" -m pip install --disable-pip-version-check --no-input --prefer-binary -r "%BACKEND%\requirements.txt"
  if errorlevel 1 goto :pip_error
) else (
  echo Python dependencies: READY - skipping pip install.
)

rem ------------------------------------------------------------
rem Frontend: npm install ONLY when node_modules is missing.
rem ------------------------------------------------------------
if not exist "%FRONTEND%\node_modules\.bin\vite.cmd" (
  echo [First run] Installing frontend dependencies...
  pushd "%FRONTEND%"
  if exist package-lock.json (
    call npm ci --no-audit --no-fund
  ) else (
    call npm install --no-audit --no-fund
  )
  if errorlevel 1 (
    popd
    goto :npm_error
  )
  popd
) else (
  echo Frontend dependencies: READY - skipping npm install.
)

echo.
echo Checking whether the project is already running...
netstat -ano | findstr /R /C:":8000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo Starting backend...
  start "DWM Backend" cmd /k "cd /d ""%BACKEND%"" && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"
) else (
  rem Make sure the process on 8000 is this version of the backend. This avoids
  rem silently using an older server after project files have been updated.
  powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/datasets'; if ($response.StatusCode -eq 200) { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    echo Backend already running and supports saved datasets.
  ) else (
    echo Restarting an older backend so saved datasets are available...
    for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do taskkill /PID %%P /F >nul 2>&1
    timeout /t 1 /nobreak >nul
    start "DWM Backend" cmd /k "cd /d ""%BACKEND%"" && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000"
  )
)

timeout /t 2 /nobreak >nul

netstat -ano | findstr /R /C:":5173 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  echo Starting frontend...
  start "DWM Frontend" cmd /k "cd /d ""%FRONTEND%"" && npm run dev -- --host 127.0.0.1"
) else (
  echo Frontend already running on port 5173 - not starting another copy.
)

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo.
echo ============================================================
echo   PROJECT STARTED
echo   Frontend: http://127.0.0.1:5173
echo   Backend:  http://127.0.0.1:8000
echo   API Docs: http://127.0.0.1:8000/docs
echo.
echo   Future runs will NOT reinstall packages.
echo   Keep this project folder. Do not extract a fresh ZIP each time.
echo ============================================================
echo.
exit /b 0

:venv_error
echo.
echo ERROR: Could not create the Python virtual environment.
echo Check that Python is installed correctly.
pause
exit /b 1

:pip_error
echo.
echo ERROR: Python dependency installation failed.
pause
exit /b 1

:npm_error
echo.
echo ERROR: Frontend dependency installation failed.
pause
exit /b 1
