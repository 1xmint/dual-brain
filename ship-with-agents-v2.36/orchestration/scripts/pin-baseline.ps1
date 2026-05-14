param(
    [Parameter(Mandatory = $true)]
    [string] $Reason
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$baselinesDir = Join-Path $root '.baselines'
$ledger = Join-Path $baselinesDir 'baselines.jsonl'

# Verify git repo
$sha = & git -C $root rev-parse HEAD 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Not a git repo or HEAD is unresolvable." -ForegroundColor Red
    exit 1
}
$sha = $sha.Trim()

# Check for dirty tree
$dirtyLines = @(& git -C $root status --porcelain 2>&1 | Where-Object { $_ -ne '' })
$dirtyTree = $dirtyLines.Count -gt 0

if ($dirtyTree) {
    Write-Host "WARNING: Working tree has uncommitted changes. The baseline will point to the last commit, not the dirty tree." -ForegroundColor Yellow
    foreach ($line in $dirtyLines) { Write-Host "  $line" }
}

# Ensure .baselines/ directory exists
if (-not (Test-Path $baselinesDir)) {
    New-Item -ItemType Directory -Path $baselinesDir | Out-Null
    Write-Host "Created directory: .baselines/" -ForegroundColor Cyan
}

# Build and append the JSON record
$ts = (Get-Date).ToString('o')
$entry = [pscustomobject]@{
    sha        = $sha
    ts         = $ts
    label      = $Reason
    dirty_tree = $dirtyTree
}
$line = $entry | ConvertTo-Json -Compress
Add-Content -Path $ledger -Value $line

Write-Host ""
Write-Host "Baseline recorded." -ForegroundColor Green
Write-Host "  SHA:        $sha"
Write-Host "  Label:      $Reason"
Write-Host "  Dirty tree: $dirtyTree"
Write-Host "  File:       $ledger"

# Offer a git tag
$slug = ($Reason -replace '[^a-zA-Z0-9]+', '-').ToLower().Trim('-')
$tagName = "baseline/$slug"
Write-Host ""
$tagAnswer = Read-Host "Create git tag '$tagName'? (yes / no — default: no)"
if ($tagAnswer -match '^y(es)?$') {
    & git -C $root tag $tagName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Tag created: $tagName  (not pushed)" -ForegroundColor Green
    } else {
        Write-Host "WARNING: git tag failed. Tag may already exist." -ForegroundColor Yellow
    }
} else {
    Write-Host "Tag skipped."
}
