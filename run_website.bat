@echo off
title Starlite Client Website & Portal
cd /d "%~dp0"

echo ===================================================
echo     STARLITE CLIENT - OFFICIAL WEBSITE PORTAL
echo ===================================================
echo.

rem Check node
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

rem Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing required dependencies (express, cors)...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install npm dependencies.
        pause
        exit /b 1
    )
)

echo [INFO] Starting web server on http://localhost:3000 ...
start "" http://localhost:3000
node server.js
pause
