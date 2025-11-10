@echo off
REM ========================================
REM   Uninstall Thermal Printer Service
REM ========================================

echo.
echo ========================================
echo   Thermal Printer Service Uninstaller
echo ========================================
echo.
echo This will remove the auto-start service
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
echo Uninstalling service...
echo.

cd /d "%~dp0"
node uninstall-service.js

echo.
echo ========================================
echo   Service Uninstalled
echo ========================================
echo.
echo The thermal printer service has been removed
echo and will no longer start automatically.
echo.
pause
