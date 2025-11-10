@echo off
REM ========================================
REM   Quick Install - Thermal Printer Service
REM   Automatic Method Selection
REM ========================================

echo.
echo ========================================
echo   Thermal Printer Quick Installer
echo ========================================
echo.
echo This will set up the thermal printer service
echo to start automatically with Windows.
echo.
echo NOTE: Administrator privileges required
echo.
pause

REM Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo   ADMINISTRATOR PRIVILEGES REQUIRED
    echo ========================================
    echo.
    echo Please right-click this file and select
    echo "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo Checking system requirements...
echo.

REM Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ========================================
    echo   NODE.JS NOT FOUND
    echo ========================================
    echo.
    echo Please install Node.js first:
    echo 1. Go to https://nodejs.org
    echo 2. Download and install LTS version
    echo 3. Restart computer
    echo 4. Run this installer again
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js found: 
node --version
echo.

cd /d "%~dp0"

echo Installing dependencies...
echo Please wait, this may take a few minutes...
echo.
call npm install --silent
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    echo.
    pause
    exit /b 1
)

echo ✓ Dependencies installed
echo.

REM Check if node-windows was installed successfully
node -e "require('node-windows')" >nul 2>&1
if %errorlevel% equ 0 (
    echo Using Windows Service method (recommended)...
    echo.
    call INSTALL_AUTO_START.bat
) else (
    echo Using Task Scheduler method (fallback)...
    echo.
    call INSTALL_TASK_SCHEDULER.bat
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo The thermal printer service is now running
echo and will start automatically with Windows.
echo.
echo Service URL: http://localhost:3001
echo.
echo Test it now:
echo 1. Open browser: http://localhost:3001/health
echo 2. You should see: "status": "ok"
echo.
pause
