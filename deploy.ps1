# Deployment Setup Script for Vercel + Render (PowerShell)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "CodeFlow Deployment Setup" -ForegroundColor Cyan
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
Write-Host "Adding VITE_API_BASE_URL = $backendUrl" -ForegroundColor Green

Write-Host ""
Write-Host "Run the following commands in Vercel dashboard or CLI:" -ForegroundColor Yellow
Write-Host "vercel env add VITE_API_BASE_URL" -ForegroundColor Cyan
Write-Host "(Then paste the backend URL when prompted)" -ForegroundColor Gray

Write-Host ""

# Step 5: Firebase vars
Write-Host "Step 5: Add Firebase Environment Variables" -ForegroundColor Yellow
Write-Host "You need to add these environment variables to Vercel:" -ForegroundColor Green
Write-Host ""
$vars = @(
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_MEASUREMENT_ID"
)

foreach ($var in $vars) {
    Write-Host "  ✓ $var" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Option A: Use Vercel Dashboard" -ForegroundColor Blue
Write-Host "  1. Go to https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host "  2. Select your project" -ForegroundColor Gray
Write-Host "  3. Settings → Environment Variables" -ForegroundColor Gray
Write-Host "  4. Add each variable" -ForegroundColor Gray

Write-Host ""
Write-Host "Option B: Use Vercel CLI" -ForegroundColor Blue
Write-Host "  vercel env add VITE_FIREBASE_API_KEY" -ForegroundColor Cyan
Write-Host "  (Repeat for each variable)" -ForegroundColor Gray

Write-Host ""

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
