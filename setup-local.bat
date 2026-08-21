@echo off
setlocal enabledelayedexpansion
REM Quick Start Script for Local Development (Windows)
REM Sets up backend + frontend to run locally, connecting to the remote NeonDB database.
REM
REM Requirements: Python 3.12+, Node.js 20+
REM No Docker needed — PostgreSQL is hosted on NeonDB, Redis features use in-memory fallback.

cls
echo.
echo 🚀 Onramp - Local Development Setup
echo ======================================
echo.

if not exist "package.json" (
    echo ❌ Please run this script from the Onramp project root
    echo    Right-click in File Explorer ^> Open PowerShell here
    pause
    exit /b 1
)

REM ── Backend Setup ────────────────────────────────────────────────────────────
echo ▶ Setting up Backend...
cd backend

if not exist ".venv" (
    echo   Creating Python virtual environment...
    python -m venv .venv
)

echo   Installing Python dependencies...
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

REM ── Backend .env ─────────────────────────────────────────────────────────────
if not exist ".env" (
    echo   Creating backend\.env from backend\.env.example...

    REM Generate secrets using Python (already available from venv)
    for /f "tokens=*" %%i in ('python -c "import secrets; print(secrets.token_urlsafe(32))"') do set "JWT_SECRET=%%i"
    for /f "tokens=*" %%i in ('python -c "import secrets; print(secrets.token_hex(32))"') do set "API_KEY_HMAC_SECRET=%%i"

    REM Copy .env.example to .env via PowerShell:
    REM   - Strip [TEMPLATE] header lines (not valid env syntax)
    REM   - JWT_SECRET / API_KEY_HMAC_SECRET: auto-generated for local dev
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$jwt = '%JWT_SECRET%'; $hmac = '%API_KEY_HMAC_SECRET%';" ^
        "(Get-Content '.env.example' | Where-Object { $_ -notmatch '^\[TEMPLATE\]' }) -replace '^JWT_SECRET=.*', ('JWT_SECRET=' + $jwt) -replace '^API_KEY_HMAC_SECRET=.*', ('API_KEY_HMAC_SECRET=' + $hmac) | Set-Content '.env' -Encoding UTF8"

    echo.
    echo   ⚠️  DATABASE_URL in backend\.env still points to localhost.
    echo      Update it with your NeonDB connection string:
    echo      DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/onramp?sslmode=require
    echo.
    echo   📝 Edit backend\.env to add LLM provider / OAuth keys as needed
) else (
    echo   backend\.env already exists, skipping creation.
)

REM ── Alembic Migrations ──────────────────────────────────────────────────────
echo.
echo   Running Alembic migrations against DATABASE_URL...
alembic upgrade head >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo   Migrations applied successfully.
) else (
    echo   ⚠️  Migrations failed — is DATABASE_URL set correctly in backend\.env?
    echo      Once configured, run: cd backend ^&^& alembic upgrade head
)

cd ..

REM ── Frontend Setup ───────────────────────────────────────────────────────────
echo.
echo ▶ Setting up Frontend...
cd web

echo   Installing Node dependencies...
call npm install -q

if not exist ".env.local" (
    echo   Creating web\.env.local...
    (
        echo VITE_APP_URL=http://localhost:5173
        echo VITE_API_URL=http://localhost:8000/api/v1
    ) > .env.local
    echo   📝 web\.env.local created for the local backend
) else (
    echo   web\.env.local already exists, skipping creation.
)

cd ..

REM ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo ======================================
echo ✅ Setup Complete!
echo ======================================
echo.
echo To start development, open two terminals:
echo.
echo Terminal 1 — Backend:
echo   cd backend
echo   .venv\Scripts\activate.bat
echo   uvicorn app.main:app --reload --port 8000
echo.
echo Terminal 2 — Frontend:
echo   cd web
echo   npm run dev
echo.
echo ======================================
echo Then open in your browser:
echo   Frontend:    http://localhost:5173
echo   Backend API: http://localhost:8000
echo   API Docs:    http://localhost:8000/docs
echo.
echo 📝 Before starting the backend, make sure backend\.env has:
echo   • DATABASE_URL  — your NeonDB connection string (required)
echo   • JWT_SECRET    — already auto-generated
echo   • LLM keys      — optional, configure from Admin Console or .env
echo.
echo Note: Redis features (caching, Celery tasks) use in-memory fallback locally.
echo.
pause
