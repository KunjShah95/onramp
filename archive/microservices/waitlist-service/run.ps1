# Try backend/.env first, then root .env
$backendEnv = "$PSScriptRoot\..\..\backend\.env"
$rootEnv = "$PSScriptRoot\..\..\.env"

$envPath = $rootEnv
if (Test-Path $backendEnv) {
    $envPath = $backendEnv
    Write-Host "Loading env vars from $backendEnv"
} else {
    Write-Host "Loading env vars from $rootEnv"
}

$envContent = Get-Content $envPath -Raw

# Extract and set each env var
$envContent -split "`n" | ForEach-Object {
  if ($_ -match "^(GOOGLE_CREDENTIALS_JSON|GOOGLE_SHEET_ID|SENDGRID_API_KEY|ADMIN_EMAIL)=(.*)$") {
    # Convert literal \n back to actual newlines for JSON
    $val = $matches[2] -replace '\\n', "`n"
    $val = $val.TrimEnd("`r")
    [System.Environment]::SetEnvironmentVariable($matches[1], $val, "Process")
    Write-Host "Set $($matches[1])"
  }
}

python run.py
