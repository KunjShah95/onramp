# Load env vars from root .env
$envContent = Get-Content "$PSScriptRoot\..\..\.env" -Raw

# Extract and set each env var
$envContent -split "`n" | ForEach-Object {
  if ($_ -match "^(GOOGLE_CREDENTIALS_JSON|GOOGLE_SHEET_ID|SENDGRID_API_KEY|ADMIN_EMAIL)=(.*)$") {
    # Convert literal \n back to actual newlines for JSON
    $val = $matches[2] -replace '\\n', "`n"
    [System.Environment]::SetEnvironmentVariable($matches[1], $val, "Process")
    Write-Host "Set $($matches[1])"
  }
}

python -m poetry run uvicorn app.main:app --port 3008 --host 0.0.0.0
