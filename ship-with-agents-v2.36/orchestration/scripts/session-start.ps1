param(
    [string] $Label = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$baselineFile = Join-Path $root '.session-baseline'

# Verify this is a git repo with a valid HEAD
try {
    $sha = & git -C $root rev-parse HEAD 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git rev-parse HEAD failed. Is HEAD detached or repo not initialized?" -ForegroundColor Red
        Write-Host $sha
        exit 1
    }
    $sha = $sha.Trim()
}
catch {
    Write-Host "ERROR: Could not run git. Is git installed and on PATH?" -ForegroundColor Red
    exit 1
}

$branch = (& git -C $root rev-parse --abbrev-ref HEAD 2>&1).Trim()
if ($branch -eq 'HEAD') {
    Write-Host "ERROR: HEAD is detached at $sha. Checkout a branch before starting a session." -ForegroundColor Red
    exit 1
}

# If baseline already exists, confirm before overwriting
if (Test-Path $baselineFile) {
    $existing = Get-Content $baselineFile -Raw
    Write-Host "WARNING: .session-baseline already exists:" -ForegroundColor Yellow
    Write-Host $existing.Trim()
    $answer = Read-Host "Overwrite? (yes / no)"
    if ($answer -notmatch '^y(es)?$') {
        Write-Host "Session start cancelled. Existing baseline kept." -ForegroundColor Cyan
        exit 0
    }
}

$ts = (Get-Date).ToString('o')
$labelLine = if ($Label) { $Label } else { "session" }

$content = @"
sha=$sha
branch=$branch
ts=$ts
label=$labelLine
"@

Set-Content -Path $baselineFile -Value $content.Trim()

Write-Host "Session baseline recorded." -ForegroundColor Green
Write-Host "  SHA:    $sha"
Write-Host "  Branch: $branch"
Write-Host "  Time:   $ts"
if ($Label) {
    Write-Host "  Label:  $Label"
}
Write-Host "  File:   $baselineFile"
