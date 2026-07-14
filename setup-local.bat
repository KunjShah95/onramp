@echo off
REM Quick Start Script for Local Development (Windows)
REM Sets up backend/frontend dependencies, starts local data services, and applies DB migrations.

cls
echo.
echo 🚀 Onramp - Local Development Setup
echo ======================================
echo.

if not exist "package.json" (
    echo ⚠️  Please run this script from the AHS-2026 project root
    echo       Right-click in File Explorer ^> Open PowerShell here
    pause
    exit /b 1
)

REM Backend Setup
echo ▶ Setting up Backend...
cd backend

if not exist "venv" (
    echo Creating Python virtual environment...
    python -m venv venv
)

echo Installing Python dependencies...
call venv\Scripts\activate.bat
pip install -q -r requirements.txt

if not exist ".env" (
    echo Creating backend\.env from backend\.env.example...
    copy .env.example .env >nul
    echo 📝 Add at least one AI provider key in backend\.env for AI features
)

cd ..

where docker >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Starting local PostgreSQL and Redis containers...
    docker compose up -d postgres redis
    echo Running Alembic migrations...
    cd backend
    alembic upgrade head
    cd ..
) else (
    echo ⚠️  Docker not found. Start PostgreSQL manually, then run: cd backend ^&^& alembic upgrade head
)

REM Frontend Setup
echo.
echo ▶ Setting up Frontend...
cd web

echo Installing Node dependencies...
call npm install -q

if not exist ".env.local" (
    echo Creating web\.env.local file...
    (
        echo VITE_API_URL=http://localhost:8000/api/v1
    ) > .env.local
    echo 📝 web\.env.local created for the local backend
)

cd ..

echo.
echo ======================================
echo ✅ Setup Complete!
echo ======================================
echo.
echo To start development:
echo.
echo Terminal 1 - Backend:
echo   cd backend
echo   venv\Scripts\activate.bat
echo   alembic upgrade head
echo   uvicorn app.main:app --reload --port 8000
echo.
echo Terminal 2 - Frontend:
echo   cd web
echo   npm run dev
echo.
echo ======================================
echo Then open in browser:
echo   Frontend: http://localhost:5173
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo.
echo 📝 Database: postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp
echo.
pause
