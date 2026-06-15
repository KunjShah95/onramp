# Cost Monitoring Script for CodeFlow (PowerShell)
# Usage: .\monitor-costs.ps1 [-Interval 60] [-ApiUrl "http://localhost:8000"]

param(
    [int]$Interval = 60,
    [string]$ApiUrl = "http://localhost:8000"
)

function Get-CostSummary {
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/cost/summary" -Method Get -TimeoutSec 5
        return $response
    } catch {
        return $null
    }
}

function Get-BudgetStatus {
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/cost/budget" -Method Get -TimeoutSec 5
        return $response
    } catch {
        return $null
    }
}

function Get-CostBreakdown {
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api/v1/cost/breakdown" -Method Get -TimeoutSec 5
        return $response
    } catch {
        return $null
    }
}

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║   CodeFlow Cost Monitoring Dashboard   ║" -ForegroundColor Blue
Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host "Monitoring every ${Interval}s" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Yellow

while ($true) {
    Clear-Host
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║   CodeFlow Cost Monitoring Dashboard   ║" -ForegroundColor Blue
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host "Last updated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`n"

    # Fetch cost summary
    $summary = Get-CostSummary
    
    if ($null -eq $summary) {
        Write-Host "❌ Failed to fetch cost data. Is the API running?" -ForegroundColor Red
        Start-Sleep -Seconds $Interval
        continue
    }

    # Display request metrics
    Write-Host "📊 Request Metrics" -ForegroundColor Green
    Write-Host "├─ Total Requests:  $($summary.total_requests)"
    Write-Host "├─ Cached Requests: $($summary.cached_requests)"
    Write-Host "└─ Cache Hit Rate:  $($summary.cache_hit_rate_percent)%"

    # Display cost metrics
    Write-Host "`n💰 Cost Metrics" -ForegroundColor Green
    Write-Host "├─ Current Cost:    `$$($summary.total_cost_usd)"
    Write-Host "├─ Monthly Est.:    `$$($summary.estimated_monthly_cost_usd)"
    Write-Host "└─ Cache Savings:   `$$($summary.cost_savings_from_cache_usd)"

    # Fetch and display budget status
    $budget = Get-BudgetStatus
    
    if ($null -ne $budget) {
        Write-Host "`n📈 Budget Status" -ForegroundColor Green
        
        $usagePercent = [int]$budget.daily_usage_percent
        $statusColor = if ($usagePercent -lt 50) { "Green" } 
                      elseif ($usagePercent -lt 80) { "Yellow" } 
                      else { "Red" }
        
        Write-Host "├─ Daily Usage:     " -NoNewline
        Write-Host "$($budget.daily_usage_percent)%" -ForegroundColor $statusColor
        Write-Host "└─ Status:          " -NoNewline
        Write-Host "$($budget.status)" -ForegroundColor $statusColor
    }

    # Fetch and display model breakdown
    $breakdown = Get-CostBreakdown
    
    if ($null -ne $breakdown -and $breakdown.by_model) {
        Write-Host "`n🤖 Top AI Models" -ForegroundColor Green
        
        $topModels = $breakdown.by_model.PSObject.Properties | 
                     Sort-Object {$_.Value.cost} -Descending | 
                     Select-Object -First 4
        
        $modelCount = 0
        foreach ($model in $topModels) {
            $modelCount++
            $prefix = if ($modelCount -eq $topModels.Count) { "└─" } else { "├─" }
            Write-Host "$prefix $($model.Name) - `$$([math]::Round($model.Value.cost, 2))"
        }
    }

    # Cost efficiency score
    if ($null -ne $summary.cache_hit_rate_percent) {
        $cacheRate = [int]$summary.cache_hit_rate_percent
        
        Write-Host "`n🎯 Efficiency Score" -ForegroundColor Green
        
        if ($cacheRate -ge 50) {
            Write-Host "└─ " -NoNewline
            Write-Host "Excellent" -ForegroundColor Green -NoNewline
            Write-Host " - Cache hit rate: $($summary.cache_hit_rate_percent)%"
        } elseif ($cacheRate -ge 30) {
            Write-Host "└─ " -NoNewline
            Write-Host "Good" -ForegroundColor Yellow -NoNewline
            Write-Host " - Cache hit rate: $($summary.cache_hit_rate_percent)%"
        } else {
            Write-Host "└─ " -NoNewline
            Write-Host "Needs Improvement" -ForegroundColor Red -NoNewline
            Write-Host " - Cache hit rate: $($summary.cache_hit_rate_percent)%"
        }
    }

    # Alerts
    if ($null -ne $budget -and [int]$budget.daily_usage_percent -ge 80) {
        Write-Host "`n⚠️  WARNING: Budget usage high ($($budget.daily_usage_percent)%)" -ForegroundColor Red
    }

    Write-Host "`nPress Ctrl+C to stop" -ForegroundColor Blue
    
    Start-Sleep -Seconds $Interval
}
