@echo off
REM CodeFlow Video Generator - Complete Pipeline
REM Run this script to generate the complete promotional video

echo ========================================
echo CodeFlow Video Generator
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting video generation pipeline...
echo.

REM Run the complete pipeline
node generate-all.js

echo.
echo ========================================
echo Generation Complete!
echo ========================================
echo.
echo Output files are in the output/ directory
echo Final video: output/codeflow-final.mp4
echo.
pause
