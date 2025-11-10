@echo off
REM ========================================
REM   Install Thermal Printer Service
REM   Using Windows Task Scheduler
REM   (Alternative to Windows Service)
REM ========================================

echo.
echo ========================================
echo   Thermal Printer Task Scheduler Setup
echo ========================================
echo.
echo This will create a scheduled task that:
echo - Starts automatically when Windows boots
echo - Runs in the background
echo - Restarts if it crashes
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
echo [1/3] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo ✓ Node.js found
echo.

REM Get current directory
set "SERVICE_DIR=%~dp0"
set "NODE_PATH=%ProgramFiles%\nodejs\node.exe"

REM Check if node.exe exists in default location
if not exist "%NODE_PATH%" (
    REM Try to find node.exe in PATH
    for %%i in (node.exe) do set "NODE_PATH=%%~$PATH:i"
)

if not exist "%NODE_PATH%" (
    echo ERROR: Could not locate node.exe
    echo Please ensure Node.js is installed correctly
    pause
    exit /b 1
)

echo [2/3] Installing dependencies...
cd /d "%SERVICE_DIR%"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo ✓ Dependencies installed
echo.

echo [3/3] Creating scheduled task...

REM Delete existing task if it exists
schtasks /query /tn "ThermalPrinterService" >nul 2>&1
if %errorlevel% equ 0 (
    echo Removing existing task...
    schtasks /delete /tn "ThermalPrinterService" /f >nul 2>&1
)

REM Create the scheduled task
schtasks /create /tn "ThermalPrinterService" /tr "\"%NODE_PATH%\" \"%SERVICE_DIR%server.js\"" /sc onstart /ru SYSTEM /rl HIGHEST /f

if %errorlevel% neq 0 (
    echo ERROR: Failed to create scheduled task
    pause
    exit /b 1
)

echo ✓ Scheduled task created
echo.

echo Starting the service now...
schtasks /run /tn "ThermalPrinterService"

echo.
echo Waiting for service to start...
timeout /t 5 /nobreak >nul

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo ✓ Task Name: ThermalPrinterService
echo ✓ Service URL: http://localhost:3001
echo ✓ Auto-start: Enabled (runs on Windows startup)
echo ✓ Runs as: SYSTEM (background service)
echo.
echo The service is now running and will start
echo automatically every time Windows boots.
echo.
echo To manage the task:
echo - Open Task Scheduler (taskschd.msc)
echo - Look for "ThermalPrinterService"
echo.
echo To uninstall: Run UNINSTALL_TASK_SCHEDULER.bat
echo.
echo Testing connection...
timeout /t 3 /nobreak >nul
curl -s http://localhost:3001/health >nul 2>&1
if %errorlevel% equ 0 (
    echo ✓ Service is responding!
) else (
    echo ⚠ Service may still be starting...
    echo   Check http://localhost:3001/health in a browser
)
echo.
pause
