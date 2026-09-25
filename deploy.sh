#!/bin/bash
# Deployment Setup Script for Vercel + Render
set -euo pipefail

echo "=================================================="
echo "Onramp Deployment Setup"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Step 1: Install Vercel CLI${NC}"
npm install -g vercel

echo ""
echo -e "${BLUE}Step 2: Login to Vercel${NC}"
vercel login

echo ""
echo -e "${BLUE}Step 3: Project Setup${NC}"
echo "What is your Vercel project name?"
read VERCEL_PROJECT

echo "What is your Render backend URL?"
echo "(Use the current HTTPS service origin, for example your Render API URL)"
read -r BACKEND_URL
if [[ -z "$BACKEND_URL" || "$BACKEND_URL" != https://* ]]; then
    echo "BACKEND_URL must be a non-empty https:// URL" >&2
    exit 1
fi

echo ""
echo -e "${BLUE}Step 4: Set Environment Variables in Vercel${NC}"
# Vercel does not interpolate environment variables inside vercel.json.  Set
# the build-time VITE_API_URL explicitly; the app accepts either an API origin
# or an origin ending in /api/v1.
if [[ "$BACKEND_URL" == */api/v1 ]]; then
    VITE_API_URL="$BACKEND_URL"
else
    VITE_API_URL="${BACKEND_URL%/}/api/v1"
fi
echo "Adding VITE_API_URL=$VITE_API_URL"
cd web
printf '%s\n' "$VITE_API_URL" | vercel env add VITE_API_URL production
cd ..

echo ""
echo -e "${YELLOW}Step 5: Environment Variables${NC}"
echo "No Firebase vars needed — auth is handled via neon_auth tables in PostgreSQL."
echo "Optional: set VITE_NEON_AUTH_URL in Vercel for a custom auth endpoint."

echo ""
echo -e "${BLUE}Step 6: Deploy Frontend${NC}"
echo "Current directory should be: web/"
cd web
npm run build
vercel deploy --prod

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Your app is now live at:"
vercel ls

echo ""
echo "Next steps:"
echo "1. Verify Render backend has BACKEND_URL and FRONTEND_URL set"
echo "2. Test: Open https://your-vercel-domain.vercel.app"
echo "3. Sign in with Google OAuth"
echo "4. Try the Analysis page"
