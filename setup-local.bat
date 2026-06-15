@echo off
REM Quick Start Script for Local Development (Windows)
REM Run this to set up and start both frontend and backend

cls
echo.
echo 🚀 CodeFlow - Local Development Setup
echo ======================================
echo.

REM Check if running from project root
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

pip install -q fastapi uvicorn python-dotenv

if exist "requirements.txt" (
    pip install -q -r requirements.txt
)

REM Create .env if not exists
if not exist ".env" (
    echo Creating .env file...
    (
        echo GOOGLE_CLOUD_PROJECT=your-firebase-project-id
        echo GOOGLE_CLOUD_CREDENTIALS={"type":"service_account","project_id":"..."}
        echo PYTHON_VERSION=3.11
        echo FRONTEND_URL_PROD=https://your-vercel-app.vercel.app
    ) > .env
    echo 📝 Please update .env with your credentials
)

cd ..

REM Frontend Setup
echo.
echo ▶ Setting up Frontend...
cd ai-onboarding-engineer

echo Installing Node dependencies...
call npm install -q

REM Create .env.local if not exists
if not exist ".env.local" (
    echo Creating .env.local file...
    (
        echo VITE_API_BASE_URL=http://localhost:8000
        echo VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
        echo VITE_FIREBASE_API_KEY=your-firebase-api-key
        echo VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
        echo VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
        echo VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
        echo VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
        echo VITE_FIREBASE_APP_ID=your-app-id
    ) > .env.local
    echo 📝 Please update .env.local with your Firebase credentials
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
echo   uvicorn app.main:app --reload
echo.
echo Terminal 2 - Frontend:
echo   cd ai-onboarding-engineer
echo   npm run dev
echo.
echo ======================================
echo Then open in browser:
echo   Frontend: http://localhost:5173
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo.
echo 📝 Don't forget to update credentials in .env and .env.local
echo.
pause
