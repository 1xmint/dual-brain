param(
    [switch] $Full
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$baselineFile = Join-Path $root '.session-baseline'

# --- Resolve the baseline SHA ---
$baselineSha = $null
$baselineSource = $null

if (Test-Path $baselineFile) {
    $lines = Get-Content $baselineFile
    foreach ($line in $lines) {
        if ($line -match '^sha=(.+)$') {
            $baselineSha = $Matches[1].Trim()
            $baselineSource = ".session-baseline file"
            break
        }
    }
}

if (-not $baselineSha) {
    # Fall back to merge-base with origin/main
    $mergeBase = & git -C $root merge-base HEAD origin/main 2>&1
    if ($LASTEXITCODE -eq 0) {
        $baselineSha = $mergeBase.Trim()
        $baselineSource = "merge-base with origin/main"
    }
}

if (-not $baselineSha) {
    Write-Host "ERROR: No .session-baseline found and no origin/main to compare against." -ForegroundColor Red
    Write-Host "Run './scripts/session-start.ps1' at the start of a session, or ensure origin/main exists."
    exit 1
}

Write-Host "Baseline: $baselineSha  (from $baselineSource)" -ForegroundColor Cyan

# --- Gather committed changes since baseline ---
$committedStat = & git -C $root diff --stat "$baselineSha..HEAD" 2>&1
$committedNameStatus = & git -C $root diff --name-status "$baselineSha..HEAD" 2>&1

# --- Gather uncommitted working-tree changes ---
$workingNameStatus = & git -C $root status --porcelain 2>&1

# --- Categorize committed changes ---
$added    = @()
$modified = @()
$deleted  = @()

foreach ($line in $committedNameStatus) {
    if ($line -match '^A\s+(.+)$') { $added    += $Matches[1].Trim() }
    elseif ($line -match '^M\s+(.+)$') { $modified += $Matches[1].Trim() }
    elseif ($line -match '^D\s+(.+)$') { $deleted  += $Matches[1].Trim() }
    elseif ($line -match '^R\d*\s+\S+\s+(.+)$') { $modified += $Matches[1].Trim() }
}

# --- Uncommitted changes ---
$uncommitted = @()
foreach ($line in $workingNameStatus) {
    if ($line -match '^(.{2})\s+(.+)$') {
        $flags = $Matches[1]
        $path  = $Matches[2].Trim()
        $state = if ($flags[0] -ne ' ' -and $flags[0] -ne '?') { 'staged' } else { 'unstaged' }
        $uncommitted += "$path ($state)"
    }
}

# --- Print summary ---
Write-Host ""

if ($added.Count -gt 0) {
    Write-Host "Added files:" -ForegroundColor Green
    foreach ($f in $added) { Write-Host "  + $f" }
} else {
    Write-Host "Added files:    (none)" -ForegroundColor DarkGray
}

if ($modified.Count -gt 0) {
    Write-Host "Modified files:" -ForegroundColor Yellow
    foreach ($f in $modified) { Write-Host "  ~ $f" }
} else {
    Write-Host "Modified files: (none)" -ForegroundColor DarkGray
}

if ($deleted.Count -gt 0) {
    Write-Host "Deleted files:" -ForegroundColor Red
    foreach ($f in $deleted) { Write-Host "  - $f" }
} else {
    Write-Host "Deleted files:  (none)" -ForegroundColor DarkGray
}

if ($uncommitted.Count -gt 0) {
    Write-Host "Uncommitted working-tree changes:" -ForegroundColor Magenta
    foreach ($f in $uncommitted) { Write-Host "  * $f" }
} else {
    Write-Host "Uncommitted changes: (none)" -ForegroundColor DarkGray
}

# --- Stats line ---
Write-Host ""
$totalChanged = $added.Count + $modified.Count + $deleted.Count
if ($totalChanged -eq 0 -and $uncommitted.Count -eq 0) {
    Write-Host "No changes since baseline." -ForegroundColor Cyan
} else {
    # Pull insertion/deletion counts from git diff --shortstat
    $shortStat = (& git -C $root diff --shortstat "$baselineSha..HEAD" 2>&1) -join ''
    if ($shortStat) {
        Write-Host "Stats: $($shortStat.Trim())" -ForegroundColor Cyan
    }
}

# --- Offer full diff ---
if ($Full) {
    Write-Host ""
    Write-Host "--- Full diff ---" -ForegroundColor Cyan
    & git -C $root diff "$baselineSha..HEAD"
} else {
    if ($totalChanged -gt 0) {
        Write-Host "Run with -Full to see the complete diff." -ForegroundColor DarkGray
    }
}
