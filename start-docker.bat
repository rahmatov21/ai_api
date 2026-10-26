@echo off
title LM Studio API Gateway - All-In-One Launcher
cd /d "%~dp0"

echo ==========================================================================
echo    LM Studio API Gateway - All-In-One Launcher
echo    (Docker Compose + LM Studio Auto-Check + Cloudflare Global Tunnel)
echo ==========================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch-all.ps1"

if %ERRORLEVEL% neq 0 (
    echo.
    echo ==========================================================================
    echo [ERROR] The launcher encountered an issue.
    echo If Docker Desktop is closed, start Docker Desktop and run this script again.
    echo Or double-click start-local.bat to run without Docker.
    echo ==========================================================================
    pause
)
