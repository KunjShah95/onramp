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
$backendUrl = Read-Host "What is your Render backend URL? (HTTPS origin)"

Write-Host ""

# Step 4: Set Environment Variables
Write-Host "Step 4: Setting Environment Variables in Vercel" -ForegroundColor Blue
if ([string]::IsNullOrWhiteSpace($backendUrl) -or -not $backendUrl.StartsWith('https://')) {
    throw 'BACKEND_URL must be a non-empty https:// URL.'
}
$apiUrl = $backendUrl.TrimEnd('/')
if (-not $apiUrl.EndsWith('/api/v1')) { $apiUrl = "$apiUrl/api/v1" }
Write-Host "Adding VITE_API_URL = $apiUrl" -ForegroundColor Green
Push-Location "web"
try {
    $apiUrl | vercel env add VITE_API_URL production
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Step 5: Neon Auth Environment Variables" -ForegroundColor Yellow
Write-Host "No Firebase vars needed — auth is handled via neon_auth tables in PostgreSQL." -ForegroundColor Green
Write-Host "Optional: set VITE_NEON_AUTH_URL in Vercel for a custom auth endpoint." -ForegroundColor Cyan

# Step 6: Deploy
Write-Host "Step 6: Deploy Frontend" -ForegroundColor Blue
Write-Host "Changing to frontend directory..." -ForegroundColor Gray
Set-Location "web"

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
Write-Host "1. ✓ Verify Render backend has BACKEND_URL and FRONTEND_URL set" -ForegroundColor Gray
Write-Host "2. ✓ Navigate to your Vercel domain in browser" -ForegroundColor Gray
Write-Host "3. ✓ Sign in with Google OAuth" -ForegroundColor Gray
Write-Host "4. ✓ Test the Analysis page with a GitHub repo URL" -ForegroundColor Gray

Write-Host ""
Write-Host "Backend Status:" -ForegroundColor Cyan
Write-Host "  API URL: $backendUrl" -ForegroundColor Green
Write-Host "  Check backend logs: https://dashboard.render.com" -ForegroundColor Gray

Write-Host ""
Write-Host "Troubleshooting:" -ForegroundColor Yellow
Write-Host "  Browser Console: F12 → Console & Network tabs" -ForegroundColor Gray
Write-Host "  Vercel Logs: https://vercel.com/dashboard" -ForegroundColor Gray
Write-Host "  Render Logs: https://dashboard.render.com" -ForegroundColor Gray
Write-Host "  Neon Auth Dashboard: https://console.neon.tech" -ForegroundColor Gray
