#!/bin/bash
# Deployment Setup Script for Vercel + Render

echo "=================================================="
echo "CodeFlow Deployment Setup"
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
echo "(Should be: https://ahs-2026.onrender.com)"
read BACKEND_URL

echo ""
echo -e "${BLUE}Step 4: Set Environment Variables in Vercel${NC}"
echo "Adding VITE_API_BASE_URL=$BACKEND_URL"

vercel env add VITE_API_BASE_URL
# User will be prompted to enter the value

echo ""
echo -e "${YELLOW}Step 5: Add Firebase Environment Variables${NC}"
echo "You need to add these to Vercel:"
echo "  - VITE_FIREBASE_API_KEY"
echo "  - VITE_FIREBASE_AUTH_DOMAIN"
echo "  - VITE_FIREBASE_PROJECT_ID"
echo "  - VITE_FIREBASE_STORAGE_BUCKET"
echo "  - VITE_FIREBASE_MESSAGING_SENDER_ID"
echo "  - VITE_FIREBASE_APP_ID"
echo "  - VITE_FIREBASE_MEASUREMENT_ID"
echo ""
echo "Run: vercel env add [VARIABLE_NAME]"

echo ""
echo -e "${BLUE}Step 6: Deploy Frontend${NC}"
echo "Current directory should be: ai-onboarding-engineer"
cd ai-onboarding-engineer
vercel deploy --prod

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Your app is now live at:"
vercel ls

echo ""
echo "Next steps:"
echo "1. Verify Render backend has FRONTEND_URL_PROD set"
echo "2. Test: Open https://your-vercel-domain.vercel.app"
echo "3. Sign in with Google OAuth"
echo "4. Try the Analysis page"
