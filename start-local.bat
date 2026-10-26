@echo off
echo ===================================================
echo   LM Studio API Gateway - Native Local Launcher
echo ===================================================
echo.

echo Starting FastAPI Backend on port 8000...
start "LM Studio Gateway Backend" cmd /k "cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting Vite React Dashboard on port 5173...
start "LM Studio Gateway Dashboard" cmd /k "cd frontend && npm run dev"

timeout /t 3 >nul
start http://localhost:5173

echo.
echo Gateway is launching!
echo Backend API: http://127.0.0.1:8000
echo Web UI:      http://localhost:5173
echo.
