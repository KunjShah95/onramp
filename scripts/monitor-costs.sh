#!/bin/bash

# Cost Monitoring Script for CodeFlow
# Usage: ./monitor-costs.sh [interval_seconds]

INTERVAL=${1:-60}  # Default 60 seconds
API_URL=${2:-http://localhost:8000}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   CodeFlow Cost Monitoring Dashboard   ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}Monitoring every ${INTERVAL}s${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"

while true; do
    clear
    echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   CodeFlow Cost Monitoring Dashboard   ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
    echo -e "Last updated: $(date '+%Y-%m-%d %H:%M:%S')\n"

    # Fetch cost summary
    SUMMARY=$(curl -s "${API_URL}/api/v1/cost/summary" 2>/dev/null)
    
    if [ $? -ne 0 ] || [ -z "$SUMMARY" ]; then
        echo -e "${RED}❌ Failed to fetch cost data. Is the API running?${NC}"
        sleep $INTERVAL
        continue
    fi

    # Parse JSON using basic text processing (works without jq)
    TOTAL_REQUESTS=$(echo "$SUMMARY" | grep -o '"total_requests":[0-9]*' | grep -o '[0-9]*')
    CACHED_REQUESTS=$(echo "$SUMMARY" | grep -o '"cached_requests":[0-9]*' | grep -o '[0-9]*')
    CACHE_HIT_RATE=$(echo "$SUMMARY" | grep -o '"cache_hit_rate_percent":[0-9.]*' | grep -o '[0-9.]*')
    TOTAL_COST=$(echo "$SUMMARY" | grep -o '"total_cost_usd":[0-9.]*' | grep -o '[0-9.]*')
    MONTHLY_ESTIMATE=$(echo "$SUMMARY" | grep -o '"estimated_monthly_cost_usd":[0-9.]*' | grep -o '[0-9.]*')
    CACHE_SAVINGS=$(echo "$SUMMARY" | grep -o '"cost_savings_from_cache_usd":[0-9.]*' | grep -o '[0-9.]*')

    # Budget status
    BUDGET=$(curl -s "${API_URL}/api/v1/cost/budget" 2>/dev/null)
    BUDGET_USAGE=$(echo "$BUDGET" | grep -o '"daily_usage_percent":[0-9.]*' | grep -o '[0-9.]*')
    BUDGET_STATUS=$(echo "$BUDGET" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

    # Display metrics
    echo -e "${GREEN}📊 Request Metrics${NC}"
    echo -e "├─ Total Requests:  ${TOTAL_REQUESTS}"
    echo -e "├─ Cached Requests: ${CACHED_REQUESTS}"
    echo -e "└─ Cache Hit Rate:  ${CACHE_HIT_RATE}%"

    echo -e "\n${GREEN}💰 Cost Metrics${NC}"
    echo -e "├─ Current Cost:    \$${TOTAL_COST}"
    echo -e "├─ Monthly Est.:    \$${MONTHLY_ESTIMATE}"
    echo -e "└─ Cache Savings:   \$${CACHE_SAVINGS}"

    echo -e "\n${GREEN}📈 Budget Status${NC}"
    
    # Color code budget status
    if [ -z "$BUDGET_USAGE" ]; then
        BUDGET_USAGE="0.0"
    fi
    
    USAGE_INT=$(printf "%.0f" "$BUDGET_USAGE")
    
    if [ "$USAGE_INT" -lt 50 ]; then
        STATUS_COLOR=$GREEN
    elif [ "$USAGE_INT" -lt 80 ]; then
        STATUS_COLOR=$YELLOW
    else
        STATUS_COLOR=$RED
    fi
    
    echo -e "├─ Daily Usage:     ${STATUS_COLOR}${BUDGET_USAGE}%${NC}"
    echo -e "└─ Status:          ${STATUS_COLOR}${BUDGET_STATUS}${NC}"

    # Fetch model breakdown
    BREAKDOWN=$(curl -s "${API_URL}/api/v1/cost/breakdown" 2>/dev/null)
    
    if [ -n "$BREAKDOWN" ]; then
        echo -e "\n${GREEN}🤖 Top AI Models${NC}"
        
        # Extract top 3 models (simplified parsing)
        echo "$BREAKDOWN" | grep -o '"gemini-[^"]*"' | head -3 | while read -r model; do
            model_clean=$(echo "$model" | tr -d '"')
            echo -e "├─ $model_clean"
        done
        echo "$BREAKDOWN" | grep -o '"claude-[^"]*"' | head -1 | while read -r model; do
            model_clean=$(echo "$model" | tr -d '"')
            echo -e "└─ $model_clean"
        done
    fi

    # Cost efficiency score
    if [ -n "$CACHE_HIT_RATE" ] && [ -n "$TOTAL_COST" ]; then
        CACHE_INT=$(printf "%.0f" "$CACHE_HIT_RATE")
        
        echo -e "\n${GREEN}🎯 Efficiency Score${NC}"
        
        if [ "$CACHE_INT" -ge 50 ]; then
            echo -e "└─ ${GREEN}Excellent${NC} - Cache hit rate: ${CACHE_HIT_RATE}%"
        elif [ "$CACHE_INT" -ge 30 ]; then
            echo -e "└─ ${YELLOW}Good${NC} - Cache hit rate: ${CACHE_HIT_RATE}%"
        else
            echo -e "└─ ${RED}Needs Improvement${NC} - Cache hit rate: ${CACHE_HIT_RATE}%"
        fi
    fi

    # Alerts
    if [ "$USAGE_INT" -ge 80 ]; then
        echo -e "\n${RED}⚠️  WARNING: Budget usage high (${BUDGET_USAGE}%)${NC}"
    fi

    echo -e "\n${BLUE}Press Ctrl+C to stop${NC}"
    
    sleep $INTERVAL
done
