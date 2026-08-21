#!/bin/bash
# Quick Start Script for Local Development
# Sets up backend + frontend to run locally, connecting to the remote NeonDB database.
#
# Requirements: Python 3.12+, Node.js 20+
# No Docker needed — PostgreSQL is hosted on NeonDB, Redis features use in-memory fallback.

set -e

echo "🚀 Onramp - Local Development Setup"
echo "======================================"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Please run this script from the Onramp project root${NC}"
    echo "   cd /path/to/onramp && bash setup-local.sh"
    exit 1
fi

# ── Backend Setup ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▶ Setting up Backend...${NC}"

cd backend

if [ ! -d ".venv" ]; then
    echo "  Creating Python virtual environment..."
    python -m venv .venv
fi

if [ -f ".venv/Scripts/activate" ]; then
    source .venv/Scripts/activate  # Windows Git Bash
elif [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate      # macOS/Linux
fi

echo "  Installing Python dependencies..."
pip install -q -r requirements.txt

# ── Backend .env ──────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    echo "  Creating backend/.env from backend/.env.example..."

    # Generate secrets for local dev
    JWT_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(32))")
    API_KEY_HMAC_SECRET=$(python -c "import secrets; print(secrets.token_hex(32))")

    # Copy .env.example → .env:
    #   • Strip [TEMPLATE] header lines (not valid env syntax)
    #   • JWT_SECRET / API_KEY_HMAC_SECRET: auto-generated for local dev
    grep -v '^\[TEMPLATE\]' .env.example | \
        sed -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" \
            -e "s|^API_KEY_HMAC_SECRET=.*|API_KEY_HMAC_SECRET=${API_KEY_HMAC_SECRET}|" \
        > .env

    echo ""
    echo -e "${YELLOW}  ⚠️  DATABASE_URL in backend/.env still points to localhost.${NC}"
    echo -e "${YELLOW}     Update it with your NeonDB connection string:${NC}"
    echo -e "${YELLOW}     DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.us-east-2.aws.neon.tech/onramp?sslmode=require${NC}"
    echo ""
    echo -e "${YELLOW}  📝 Edit backend/.env to add LLM provider / OAuth keys as needed${NC}"
else
    echo "  backend/.env already exists, skipping creation."
fi

# ── Alembic Migrations ────────────────────────────────────────────────────────
echo ""
echo "  Running Alembic migrations against DATABASE_URL..."
if alembic upgrade head 2>/dev/null; then
    echo "  Migrations applied successfully."
else
    echo -e "${YELLOW}  ⚠️  Migrations failed — is DATABASE_URL set correctly in backend/.env?${NC}"
    echo -e "${YELLOW}     Once configured, run: cd backend && alembic upgrade head${NC}"
fi

cd ..

# ── Frontend Setup ────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}▶ Setting up Frontend...${NC}"

cd web

echo "  Installing Node dependencies..."
npm install -q

if [ ! -f ".env.local" ]; then
    echo "  Creating web/.env.local..."
    cat > .env.local << 'EOF'
VITE_APP_URL=http://localhost:5173
VITE_API_URL=http://localhost:8000/api/v1
EOF
    echo -e "${YELLOW}  📝 web/.env.local created for the local backend${NC}"
else
    echo "  web/.env.local already exists, skipping creation."
fi

cd ..

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "======================================"
echo ""
echo "To start development, open two terminals:"
echo ""
echo -e "${BLUE}Terminal 1 — Backend:${NC}"
echo "  cd backend"
echo "  source .venv/bin/activate    # or .venv\\Scripts\\activate on Windows"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo -e "${BLUE}Terminal 2 — Frontend:${NC}"
echo "  cd web"
echo "  npm run dev"
echo ""
echo "======================================"
echo "Then open in your browser:"
echo "  Frontend:    http://localhost:5173"
echo "  Backend API: http://localhost:8000"
echo "  API Docs:    http://localhost:8000/docs"
echo ""
echo -e "${YELLOW}📝 Before starting the backend, make sure backend/.env has:${NC}"
echo "  • DATABASE_URL  — your NeonDB connection string (required)"
echo "  • JWT_SECRET    — already auto-generated"
echo "  • LLM keys      — optional, configure from Admin Console or .env"
echo ""
echo -e "${BLUE}Note: Redis features (caching, Celery tasks) use in-memory fallback locally.${NC}"
echo ""
