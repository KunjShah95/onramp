#!/bin/bash
# Quick Start Script for Local Development
# Sets up backend/frontend dependencies, starts local data services, and applies DB migrations.

set -e

echo "🚀 Onramp - Local Development Setup"
echo "======================================"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

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

if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate  # Windows Git Bash
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate      # macOS/Linux
fi

echo "Installing Python dependencies..."
pip install -q -r requirements.txt

if [ ! -f ".env" ]; then
    echo "Creating backend/.env from backend/.env.example..."
    cp .env.example .env
    echo -e "${YELLOW}📝 Add at least one AI provider key in backend/.env for AI features${NC}"
fi

cd ..

if command -v docker >/dev/null 2>&1; then
    echo "Starting local PostgreSQL and Redis containers..."
    docker compose up -d postgres redis
    echo "Running Alembic migrations..."
    cd backend
    alembic upgrade head
    cd ..
else
    echo -e "${YELLOW}⚠️  Docker not found. Start PostgreSQL manually, then run: cd backend && alembic upgrade head${NC}"
fi

# Frontend Setup
echo -e "${BLUE}▶ Setting up Frontend...${NC}"

cd web

echo "Installing Node dependencies..."
npm install -q

if [ ! -f ".env.local" ]; then
    echo "Creating web/.env.local file..."
    cat > .env.local << 'EOF'
VITE_API_URL=http://localhost:8000/api/v1
EOF
    echo -e "${YELLOW}📝 web/.env.local created for the local backend${NC}"
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
echo "  alembic upgrade head"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo -e "${BLUE}Terminal 2 - Frontend:${NC}"
echo "  cd web"
echo "  npm run dev"
echo ""
echo "======================================"
echo "Then open in browser:"
echo "  Frontend: http://localhost:5173"
echo "  Backend API: http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}📝 Database: postgresql+asyncpg://onramp:postgres_password@localhost:5432/onramp${NC}"
