# Deployment Setup Script for Vercel + Render (PowerShell)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Onramp Deployment Setup" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Install Vercel CLI
Write-Host "Step 1: Installing Vercel CLI..." -ForegroundColor Blue
npm install -g vercel

Write-Host ""

# Step 2: Login to Vercel
Write-Host "Step 2: Logging into Vercel..." -ForegroundColor Blue
Write-Host "This will open a browser for authentication" -ForegroundColor Yellow
vercel login

Write-Host ""

# Step 3: Get Info
Write-Host "Step 3: Project Information" -ForegroundColor Blue
$vercelProject = Read-Host "What is your Vercel project name?"
$backendUrl = Read-Host "What is your Render backend URL? (https://ahs-2026.onrender.com)"

Write-Host ""

# Step 4: Set Environment Variables
Write-Host "Step 4: Setting Environment Variables in Vercel" -ForegroundColor Blue
Write-Host "Adding VITE_API_URL = $backendUrl" -ForegroundColor Green

Write-Host ""
Write-Host "Run the following commands in Vercel dashboard or CLI:" -ForegroundColor Yellow
Write-Host "vercel env add VITE_API_URL" -ForegroundColor Cyan
Write-Host "(Then paste the backend URL when prompted)" -ForegroundColor Gray


Write-Host ""

# Step 5: Neon Auth env vars (optional)
Write-Host "Step 5: Neon Auth Environment Variables" -ForegroundColor Yellow
Write-Host "No Firebase vars needed — auth is handled via neon_auth tables in PostgreSQL." -ForegroundColor Green
Write-Host "Optional: set VITE_NEON_AUTH_URL in Vercel if using a custom auth endpoint." -ForegroundColor Cyan

# Step 6: Deploy
Write-Host "Step 6: Deploy Frontend" -ForegroundColor Blue
Write-Host "Changing to frontend directory..." -ForegroundColor Gray
Set-Location "ai-onboarding-engineer"

Write-Host "Building and deploying to Vercel..." -ForegroundColor Green
npm run build
vercel deploy --prod

Write-Host ""
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""

# Get deployment info
Write-Host "Your application details:" -ForegroundColor Cyan
vercel ls

Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. ✓ Verify Render backend has FRONTEND_URL_PROD environment variable set" -ForegroundColor Gray
Write-Host "2. ✓ Navigate to your Vercel domain in browser" -ForegroundColor Gray
Write-Host "3. ✓ Sign in with Google OAuth" -ForegroundColor Gray
Write-Host "4. ✓ Test the Analysis page with a GitHub repo URL" -ForegroundColor Gray

Write-Host ""
Write-Host "Backend Status:" -ForegroundColor Cyan
Write-Host "  API URL: https://ahs-2026.onrender.com" -ForegroundColor Green
Write-Host "  Check backend logs: https://dashboard.render.com" -ForegroundColor Gray

Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Yellow
Write-Host "  Browser Console: F12 → Console & Network tabs" -ForegroundColor Gray
Write-Host "  Vercel Logs: https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host "  Render Logs: https://dashboard.render.com" -ForegroundColor Gray
Write-Host "  Firebase Console: https://console.firebase.google.com" -ForegroundColor Gray
