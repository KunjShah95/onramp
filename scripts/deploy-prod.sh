#!/bin/bash
set -e

# CodeFlow Production Deployment Script
# Usage: ./deploy-prod.sh

echo "🚀 CodeFlow Production Deployment"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose not found. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo -e "\n${YELLOW}⚠️  .env.production not found. Creating from template...${NC}"
    
    if [ -f ".env.production.example" ]; then
        cp .env.production.example .env.production
        echo -e "${YELLOW}⚠️  Please edit .env.production with your credentials before continuing.${NC}"
        echo -e "${YELLOW}Press Enter once you've configured .env.production...${NC}"
        read
    else
        echo -e "${RED}❌ .env.production.example not found. Cannot continue.${NC}"
        exit 1
    fi
fi

# Validate critical environment variables
echo -e "\n${YELLOW}Validating environment configuration...${NC}"

source .env.production

if [ -z "$GEMINI_API_KEY" ] && [ -z "$OPENROUTER_API_KEY" ]; then
    echo -e "${RED}❌ No AI provider API key found. Please set GEMINI_API_KEY or OPENROUTER_API_KEY.${NC}"
    exit 1
fi

if [ -z "$FIREBASE_PROJECT_ID" ]; then
    echo -e "${RED}❌ FIREBASE_PROJECT_ID not set in .env.production${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Environment configuration OK${NC}"

# Stop existing containers
echo -e "\n${YELLOW}Stopping existing containers...${NC}"
docker-compose -f docker-compose.prod.yml down || true

# Build production images
echo -e "\n${YELLOW}Building production Docker images...${NC}"
docker-compose -f docker-compose.prod.yml build --no-cache

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Images built successfully${NC}"

# Start services
echo -e "\n${YELLOW}Starting production services...${NC}"
docker-compose -f docker-compose.prod.yml up -d

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
fi

# Wait for services to be healthy
echo -e "\n${YELLOW}Waiting for services to be healthy...${NC}"

RETRIES=30
DELAY=2
COUNT=0

while [ $COUNT -lt $RETRIES ]; do
    if docker-compose -f docker-compose.prod.yml ps | grep -q "unhealthy\|starting"; then
        echo -n "."
        sleep $DELAY
        COUNT=$((COUNT+1))
    else
        break
    fi
done

echo ""

if [ $COUNT -eq $RETRIES ]; then
    echo -e "${RED}❌ Services did not become healthy in time${NC}"
    echo -e "${YELLOW}Service status:${NC}"
    docker-compose -f docker-compose.prod.yml ps
    echo -e "\n${YELLOW}Backend logs:${NC}"
    docker-compose -f docker-compose.prod.yml logs --tail=50 backend
    exit 1
fi

# Health check
echo -e "\n${YELLOW}Running health checks...${NC}"

# Check backend health
if command -v curl &> /dev/null; then
    HEALTH_CHECK=$(curl -s http://localhost:8000/health || echo "failed")
    
    if [[ "$HEALTH_CHECK" == *"healthy"* ]]; then
        echo -e "${GREEN}✅ Backend health check passed${NC}"
    else
        echo -e "${RED}❌ Backend health check failed${NC}"
        echo "Response: $HEALTH_CHECK"
        exit 1
    fi
fi

# Check Redis
echo -n "Checking Redis... "
if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping | grep -q "PONG"; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
    exit 1
fi

# Verify cost monitoring
echo -e "\n${YELLOW}Verifying cost monitoring...${NC}"
if command -v curl &> /dev/null; then
    COST_RESPONSE=$(curl -s http://localhost:8000/api/v1/cost/summary || echo "failed")
    
    if [[ "$COST_RESPONSE" == *"total_requests"* ]]; then
        echo -e "${GREEN}✅ Cost monitoring active${NC}"
    else
        echo -e "${YELLOW}⚠️  Cost monitoring not responding (may need time to initialize)${NC}"
    fi
fi

# Show service status
echo -e "\n${YELLOW}Service status:${NC}"
docker-compose -f docker-compose.prod.yml ps

# Calculate estimated costs
echo -e "\n${YELLOW}Estimated Monthly Costs:${NC}"
echo "├─ AI API calls (optimized): $50-150"
echo "├─ Redis Cloud (managed): $0-10"
echo "├─ Hosting (Cloud Run/Heroku): $25-50"
echo "└─ Total: $75-210/month"

# Display important URLs
echo -e "\n${GREEN}✅ Deployment successful!${NC}"
echo -e "\n${YELLOW}Important URLs:${NC}"
echo "├─ Backend API: http://localhost:8000"
echo "├─ Health Check: http://localhost:8000/health"
echo "├─ API Docs: http://localhost:8000/docs"
echo "├─ Cost Dashboard: http://localhost:8000/api/v1/cost/summary"
echo "└─ Metrics: http://localhost:8000/metrics"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Set up SSL certificates (Let's Encrypt)"
echo "2. Configure domain DNS"
echo "3. Set up monitoring alerts"
echo "4. Enable backup automation"
echo "5. Configure CI/CD pipeline"

echo -e "\n${YELLOW}Useful Commands:${NC}"
echo "├─ View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "├─ Scale backend: docker-compose -f docker-compose.prod.yml up -d --scale backend=4"
echo "├─ Stop services: docker-compose -f docker-compose.prod.yml down"
echo "└─ Restart: docker-compose -f docker-compose.prod.yml restart"

echo -e "\n${GREEN}🎉 CodeFlow is now running in production mode!${NC}"
