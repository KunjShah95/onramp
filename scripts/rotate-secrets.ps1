<#
.SYNOPSIS
  Rotate environment-level secrets for Onramp 2.0.
.DESCRIPTION
  Generates new values for the specified secret type and outputs the new
  value. Optionally updates the local .env file.
.PARAMETER Name
  Secret to rotate: enc-key, hmac-secret, all-internal, or all.
.PARAMETER UpdateEnv
  If set, writes the new value(s) into backend/.env.
.EXAMPLE
  .\rotate-secrets.ps1 -Name enc-key
  .\rotate-secrets.ps1 -Name all-internal -UpdateEnv
#>
param(
  [Parameter(Mandatory)]
  [ValidateSet("enc-key","hmac-secret","all-internal","all")]
  [string]$Name,
  [switch]$UpdateEnv
)
$ErrorActionPreference = "Stop"

function New-FernetKey {
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = [byte[]]::new(32)
  $rng.GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

function New-HexToken {
  param([int]$Length = 32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $bytes = [byte[]]::new($Length)
  $rng.GetBytes($bytes)
  return -join ($bytes | ForEach-Object { "{0:x2}" -f $_ })
}

function Read-EnvFile {
  $envPath = Join-Path $PSScriptRoot "..\backend\.env"
  if (-not (Test-Path $envPath)) { return @{} }
  $vars = @{}
  foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
      $vars[$matches[1]] = $matches[2]
    }
  }
  return $vars
}

function Write-EnvVar {
  param([string]$Key, [string]$Value)
  $envPath = Join-Path $PSScriptRoot "..\backend\.env"
  if (-not (Test-Path $envPath)) {
    Write-Warning "backend/.env not found -- creating it."
    $null = New-Item -ItemType File -Path $envPath -Force
  }
  $lines = Get-Content $envPath
  $replaced = $false
  $newLines = foreach ($line in $lines) {
    if ($line -match "^#?\s*${Key}\s*=") {
      "${Key}=${Value}"
      $replaced = $true
    } else {
      $line
    }
  }
  if (-not $replaced) {
    $newLines += "${Key}=${Value}"
  }
  Set-Content -Path $envPath -Value $newLines
  Write-Host "  [OK] Updated ${Key} in backend/.env" -ForegroundColor Green
}

$rotations = @{}
$rotations["enc-key"] = @{
  Description = "GITHUB_TOKEN_ENCRYPTION_KEY (Fernet)"
  EnvVar = "GITHUB_TOKEN_ENCRYPTION_KEY"
  Generator = ${function:New-FernetKey}
  Instructions = "Copy the key into your deployment dashboard. Old key remains valid for existing encrypted tokens."
}
$rotations["hmac-secret"] = @{
  Description = "API_KEY_HMAC_SECRET"
  EnvVar = "API_KEY_HMAC_SECRET"
  Generator = { New-HexToken -Length 32 }
  Instructions = "Copy the key into your deployment dashboard. API keys hashed with old secret will stop working."
}

$externalSecrets = @(
  @{ EnvVar = "OPENROUTER_API_KEY"; Provider = "https://openrouter.ai/keys" }
  @{ EnvVar = "GEMINI_API_KEY"; Provider = "https://aistudio.google.com/apikey" }
  @{ EnvVar = "GROQ_API_KEY"; Provider = "https://console.groq.com/keys" }
  @{ EnvVar = "NVIDIA_API_KEY"; Provider = "https://build.nvidia.com/" }
  @{ EnvVar = "OPENAI_API_KEY"; Provider = "https://platform.openai.com/api-keys" }
  @{ EnvVar = "ANTHROPIC_API_KEY"; Provider = "https://console.anthropic.com/" }
  @{ EnvVar = "STRIPE_SECRET_KEY"; Provider = "https://dashboard.stripe.com/apikeys" }
  @{ EnvVar = "STRIPE_WEBHOOK_SECRET"; Provider = "https://dashboard.stripe.com/webhooks" }
  @{ EnvVar = "SENDGRID_API_KEY"; Provider = "https://app.sendgrid.com/settings/api_keys" }
  @{ EnvVar = "GITHUB_TOKEN"; Provider = "https://github.com/settings/tokens" }
  @{ EnvVar = "SENTRY_DSN"; Provider = "https://sentry.io/settings/account/api/keys/" }
  @{ EnvVar = "GOOGLE_CREDENTIALS_JSON"; Provider = "Google Cloud Console > Service Accounts" }
  @{ EnvVar = "DATABASE_URL"; Provider = "Neon Console > Connection Details" }
  @{ EnvVar = "REDIS_URL"; Provider = "Redis provider dashboard" }
)

Write-Host ""
Write-Host "Onramp Secret Rotation" -ForegroundColor Cyan
Write-Host ""

$keysToRotate = @()
if ($Name -eq "all" -or $Name -eq "all-internal") {
  $keysToRotate += "enc-key", "hmac-secret"
} else {
  $keysToRotate += $Name
}

foreach ($keyName in $keysToRotate) {
  $cfg = $rotations[$keyName]
  Write-Host "-- Rotating $($cfg.Description) --" -ForegroundColor Yellow
  $newValue = & $cfg.Generator
  if ($UpdateEnv) {
    Write-EnvVar -Key $cfg.EnvVar -Value $newValue
  }
  Write-Host "  New $($cfg.EnvVar):" -ForegroundColor White
  Write-Host "  $newValue" -ForegroundColor Green
  Write-Host ""
  Write-Host "  $($cfg.Instructions)" -ForegroundColor Gray
  Write-Host ""
}

if ($Name -eq "all") {
  Write-Host "External secrets (rotate manually):" -ForegroundColor Magenta
  $currentEnv = Read-EnvFile
  foreach ($s in $externalSecrets) {
    $val = $currentEnv[$s.EnvVar]
    $status = if ([string]::IsNullOrWhiteSpace($val)) { "MISSING" } else { "set" }
    $c = if ([string]::IsNullOrWhiteSpace($val)) { "Red" } else { "Green" }
    Write-Host "  $($s.EnvVar): $status" -ForegroundColor $c
    if (-not [string]::IsNullOrWhiteSpace($val)) {
      Write-Host "    Regenerate at: $($s.Provider)" -ForegroundColor Gray
      Write-Host "    Update in Render Dashboard > Environment" -ForegroundColor Gray
    }
  }
  Write-Host ""
  Write-Host "Recommended rotation cadence:" -ForegroundColor Cyan
  Write-Host "  GITHUB_TOKEN_ENCRYPTION_KEY  : every 90 days" -ForegroundColor Gray
  Write-Host "  API_KEY_HMAC_SECRET          : every 90 days" -ForegroundColor Gray
  Write-Host "  LLM API keys                 : every 180 days" -ForegroundColor Gray
  Write-Host "  Stripe keys                  : every 180 days" -ForegroundColor Gray
  Write-Host "  DATABASE_URL                 : on team member offboarding" -ForegroundColor Gray
  Write-Host ""
}

Write-Host "Done." -ForegroundColor Green
