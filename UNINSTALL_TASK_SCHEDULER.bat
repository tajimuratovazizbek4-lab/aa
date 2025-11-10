@echo off
REM ========================================
REM   Uninstall Thermal Printer Task
REM ========================================

echo.
echo ========================================
echo   Thermal Printer Task Uninstaller
echo ========================================
echo.
echo This will remove the scheduled task
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
echo Stopping the task...
schtasks /end /tn "ThermalPrinterService" >nul 2>&1

echo Removing scheduled task...
schtasks /delete /tn "ThermalPrinterService" /f

if %errorlevel% equ 0 (
    echo.
    echo ✓ Task removed successfully
) else (
    echo.
    echo ⚠ Task may not exist or already removed
)

echo.
echo ========================================
echo   Task Uninstalled
echo ========================================
echo.
echo The thermal printer service has been removed
echo and will no longer start automatically.
echo.
pause
