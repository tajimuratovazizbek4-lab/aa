@echo off
REM ========================================
REM   Auto-Start Thermal Printer Service
REM   Installation Script for Windows
REM ========================================

echo.
echo ========================================
echo   Thermal Printer Auto-Start Installer
echo ========================================
echo.
echo This script will:
echo 1. Install required dependencies
echo 2. Install the service to run automatically
echo 3. Start the service immediately
echo.
echo NOTE: This requires Administrator privileges
echo.
pause

REM Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: This script must be run as Administrator!
    echo.
    echo Right-click this file and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo.
echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js found: 
node --version
echo.

REM Navigate to script directory
cd /d "%~dp0"

echo [2/4] Installing dependencies...
echo This may take a few minutes...
echo.
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    echo.
    pause
    exit /b 1
)

echo.
echo ✓ Dependencies installed successfully
echo.

echo [3/4] Installing Windows Service...
echo.
node install-service.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install service
    echo.
    pause
    exit /b 1
)

echo.
echo [4/4] Waiting for service to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo ✓ Service Name: H58C-Thermal-Print-Service
echo ✓ Service URL: http://localhost:3001
echo ✓ Auto-start: Enabled (runs on Windows startup)
echo.
echo You can manage the service:
echo - Open Services: Press Win+R, type "services.msc"
echo - Find: "H58C-Thermal-Print-Service"
echo.
echo To uninstall: Run UNINSTALL_SERVICE.bat
echo.
pause
