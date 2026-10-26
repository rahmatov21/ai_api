@echo off
cd /d "%~dp0"
echo ===================================================
echo     Cloudflare Global Public Tunnel for AI Gateway
echo ===================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-tunnel.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo Running direct fallback tunnel...
    cloudflared.exe tunnel --url http://localhost:5173
)
pause
