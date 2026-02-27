# Trade Inquiry Tracker - Setup Guide (Windows)

## Prerequisites

1. **Python 3.10+** — Download from https://www.python.org/downloads/
   - During install, check **"Add Python to PATH"**
2. **Node.js 18+** — Download from https://nodejs.org/ (LTS version)
   - This also installs npm

To verify both are installed, open Command Prompt and run:
```
python --version
node --version
```

## Quick Start (Windows)

### Option A: One-click batch file

1. Open File Explorer, navigate to this project folder
2. Double-click **`run.bat`**
3. Two command windows will open (backend + frontend)
4. Open your browser to **http://localhost:3000**

### Option B: Manual startup (two terminals)

**Terminal 1 — Backend:**
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```cmd
cd frontend
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

### Option C: Docker (if you have Docker Desktop)

```cmd
docker-compose up --build
```

## URLs

| Service  | URL                          |
|----------|------------------------------|
| App      | http://localhost:3000         |
| API      | http://localhost:8000         |
| API Docs | http://localhost:8000/docs    |

## Stopping the App

- **Batch file**: Close both command prompt windows ("Backend" and "Frontend")
- **Manual**: Press `Ctrl+C` in each terminal
- **Docker**: Press `Ctrl+C` or run `docker-compose down`

## Troubleshooting

- **"python is not recognized"** — Reinstall Python and check "Add to PATH"
- **"node is not recognized"** — Reinstall Node.js
- **Port already in use** — Another app is using port 3000 or 8000. Close it or change the port
- **npm install fails** — Try deleting `frontend/node_modules` and running `npm install` again
