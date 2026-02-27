@echo off
REM Trade Inquiry Tracker - Windows Quick Start
REM Prerequisites: Python 3.10+ and Node.js 18+ must be installed

echo === Trade Inquiry Tracker ===
echo.

echo [1/4] Setting up Python backend...
cd backend
python -m venv venv
call venv\Scripts\activate.bat
pip install -q -r requirements.txt

echo [2/4] Starting backend on http://localhost:8000 ...
start "Backend" cmd /k "venv\Scripts\activate.bat && uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
cd ..

echo [3/4] Installing frontend dependencies...
cd frontend
call npm install --silent

echo [4/4] Starting frontend on http://localhost:3000 ...
start "Frontend" cmd /k "npm start"
cd ..

echo.
echo === App is running! ===
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo   API docs: http://localhost:8000/docs
echo.
echo Close the "Backend" and "Frontend" windows to stop the servers.
pause
