# CodeFlow Production Deployment Script (PowerShell)
# Usage: .\deploy-prod.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 CodeFlow Production Deployment" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Check prerequisites
Write-Host "`nChecking prerequisites..." -ForegroundColor Yellow

# Check Docker
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker not found. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check Docker Compose
if (!(Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker Compose not found. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites OK" -ForegroundColor Green

# Check if .env.production exists
if (!(Test-Path ".env.production")) {
    Write-Host "`n⚠️  .env.production not found. Creating from template..." -ForegroundColor Yellow
    
    if (Test-Path ".env.production.example") {
        Copy-Item ".env.production.example" ".env.production"
        Write-Host "⚠️  Please edit .env.production with your credentials before continuing." -ForegroundColor Yellow
        Write-Host "Press Enter once you've configured .env.production..." -ForegroundColor Yellow
        Read-Host
    } else {
        Write-Host "❌ .env.production.example not found. Cannot continue." -ForegroundColor Red
        exit 1
    }
}

# Load and validate environment variables
Write-Host "`nValidating environment configuration..." -ForegroundColor Yellow

$envContent = Get-Content ".env.production" | Where-Object { $_ -match "^[^#]" }
$envVars = @{}
foreach ($line in $envContent) {
    if ($line -match "^(.+?)=(.*)$") {
        $envVars[$matches[1]] = $matches[2]
    }
}

if (!$envVars["GEMINI_API_KEY"] -and !$envVars["OPENROUTER_API_KEY"]) {
    Write-Host "❌ No AI provider API key found. Please set GEMINI_API_KEY or OPENROUTER_API_KEY." -ForegroundColor Red
    exit 1
}

if (!$envVars["FIREBASE_PROJECT_ID"]) {
    Write-Host "❌ FIREBASE_PROJECT_ID not set in .env.production" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Environment configuration OK" -ForegroundColor Green

# Stop existing containers
Write-Host "`nStopping existing containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down 2>$null

# Build production images
Write-Host "`nBuilding production Docker images..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml build --no-cache

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Images built successfully" -ForegroundColor Green

# Start services
Write-Host "`nStarting production services..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    exit 1
}

# Wait for services to be healthy
Write-Host "`nWaiting for services to be healthy..." -ForegroundColor Yellow

$retries = 30
$delay = 2
$count = 0

while ($count -lt $retries) {
    $status = docker-compose -f docker-compose.prod.yml ps | Out-String
    if ($status -match "unhealthy|starting") {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds $delay
        $count++
    } else {
        break
    }
}

Write-Host ""

if ($count -eq $retries) {
    Write-Host "❌ Services did not become healthy in time" -ForegroundColor Red
    Write-Host "`nService status:" -ForegroundColor Yellow
    docker-compose -f docker-compose.prod.yml ps
    Write-Host "`nBackend logs:" -ForegroundColor Yellow
    docker-compose -f docker-compose.prod.yml logs --tail=50 backend
    exit 1
}

# Health check
Write-Host "`nRunning health checks..." -ForegroundColor Yellow

# Check backend health
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 5
    Write-Host "✅ Backend health check passed" -ForegroundColor Green
} catch {
    Write-Host "❌ Backend health check failed" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Check Redis
Write-Host "Checking Redis... " -NoNewline
$redisCheck = docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping 2>$null
if ($redisCheck -match "PONG") {
    Write-Host "✅" -ForegroundColor Green
} else {
    Write-Host "❌" -ForegroundColor Red
    exit 1
}

# Verify cost monitoring
Write-Host "`nVerifying cost monitoring..." -ForegroundColor Yellow
try {
    $costResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/cost/summary" -Method Get -TimeoutSec 5
    Write-Host "✅ Cost monitoring active" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Cost monitoring not responding (may need time to initialize)" -ForegroundColor Yellow
}

# Show service status
Write-Host "`nService status:" -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml ps

# Calculate estimated costs
Write-Host "`nEstimated Monthly Costs:" -ForegroundColor Yellow
Write-Host "├─ AI API calls (optimized): `$50-150"
Write-Host "├─ Redis Cloud (managed): `$0-10"
Write-Host "├─ Hosting (Cloud Run/Heroku): `$25-50"
Write-Host "└─ Total: `$75-210/month"

# Display important URLs
Write-Host "`n✅ Deployment successful!" -ForegroundColor Green
Write-Host "`nImportant URLs:" -ForegroundColor Yellow
Write-Host "├─ Backend API: http://localhost:8000"
Write-Host "├─ Health Check: http://localhost:8000/health"
Write-Host "├─ API Docs: http://localhost:8000/docs"
Write-Host "├─ Cost Dashboard: http://localhost:8000/api/v1/cost/summary"
Write-Host "└─ Metrics: http://localhost:8000/metrics"

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Set up SSL certificates (Let's Encrypt)"
Write-Host "2. Configure domain DNS"
Write-Host "3. Set up monitoring alerts"
Write-Host "4. Enable backup automation"
Write-Host "5. Configure CI/CD pipeline"

Write-Host "`nUseful Commands:" -ForegroundColor Yellow
Write-Host "├─ View logs: docker-compose -f docker-compose.prod.yml logs -f"
Write-Host "├─ Scale backend: docker-compose -f docker-compose.prod.yml up -d --scale backend=4"
Write-Host "├─ Stop services: docker-compose -f docker-compose.prod.yml down"
Write-Host "└─ Restart: docker-compose -f docker-compose.prod.yml restart"

Write-Host "`n🎉 CodeFlow is now running in production mode!" -ForegroundColor Green
