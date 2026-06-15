#!/bin/bash
# Quick Start Script for Local Development
# Run this to set up and start both frontend and backend

set -e

echo "🚀 CodeFlow - Local Development Setup"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}⚠️  Please run this script from the AHS-2026 project root${NC}"
    exit 1
fi

# Backend Setup
echo -e "${BLUE}▶ Setting up Backend...${NC}"

cd backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python -m venv venv
fi

# Activate venv
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate  # Windows Git Bash
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate  # macOS/Linux
fi

echo "Installing Python dependencies..."
pip install -q fastapi uvicorn python-dotenv

if [ -f "requirements.txt" ]; then
    pip install -q -r requirements.txt
fi

# Create .env if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
GOOGLE_CLOUD_PROJECT=your-firebase-project-id
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account","project_id":"..."}
PYTHON_VERSION=3.11
FRONTEND_URL_PROD=https://your-vercel-app.vercel.app
EOF
    echo -e "${YELLOW}📝 Please update .env with your credentials${NC}"
fi

cd ..

# Frontend Setup
echo -e "${BLUE}▶ Setting up Frontend...${NC}"

cd ai-onboarding-engineer

echo "Installing Node dependencies..."
npm install -q

# Create .env.local if not exists
if [ ! -f ".env.local" ]; then
    echo "Creating .env.local file..."
    cat > .env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:8000
VITE_FIREBASE_PROJECT_ID=your-firebase-project-id
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
VITE_FIREBASE_APP_ID=your-app-id
EOF
    echo -e "${YELLOW}📝 Please update .env.local with your Firebase credentials${NC}"
fi

cd ..

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "======================================"
echo "To start development:"
echo ""
echo -e "${BLUE}Terminal 1 - Backend:${NC}"
echo "  cd backend"
echo "  source venv/bin/activate  # or venv\\Scripts\\activate on Windows"
echo "  uvicorn app.main:app --reload"
echo ""
echo -e "${BLUE}Terminal 2 - Frontend:${NC}"
echo "  cd ai-onboarding-engineer"
echo "  npm run dev"
echo ""
echo "======================================"
echo "Then open in browser:"
echo "  Frontend: http://localhost:5173"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}📝 Don't forget to update credentials in .env and .env.local${NC}"
