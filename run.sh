#!/bin/bash
# Trade Inquiry Tracker - Quick Start
# Run this script to start both backend and frontend

set -e

echo "=== Trade Inquiry Tracker ==="
echo ""

# Backend setup
echo "[1/4] Setting up Python backend..."
cd backend
python3 -m venv venv 2>/dev/null || true
source venv/bin/activate
pip install -q -r requirements.txt

echo "[2/4] Starting backend on http://localhost:8000 ..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
cd ..

# Frontend setup
echo "[3/4] Installing frontend dependencies..."
cd frontend
npm install --silent

echo "[4/4] Starting frontend on http://localhost:3000 ..."
npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "=== App is running! ==="
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
