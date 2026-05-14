param(
    [int]    $Days      = 0,
    [string] $Project   = '',
    [switch] $ByModel,
    [switch] $Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Locate config -----------------------------------------------------------

$scriptDir  = $PSScriptRoot
$repoRoot   = (Resolve-Path (Join-Path $scriptDir '..')).Path
$ratesFile  = Join-Path $repoRoot 'config\model-rates.json'
$budgetFile = Join-Path $repoRoot 'config\budget.json'
$healthDir  = Join-Path $repoRoot 'health'
$spendFile  = Join-Path $healthDir 'spend.json'

if (-not (Test-Path $ratesFile)) {
    Write-Warning "model-rates.json not found at $ratesFile - cost estimates will be zero."
    $rates = @{}
} else {
    $ratesJson = Get-Content $ratesFile -Raw | ConvertFrom-Json
    $rates = @{}
    foreach ($prop in $ratesJson.models.PSObject.Properties) {
        $rates[$prop.Name] = $prop.Value
    }
}

# --- Load budget config (optional) -------------------------------------------

$budget = $null
if (Test-Path $budgetFile) {
    try {
        $budget = Get-Content $budgetFile -Raw | ConvertFrom-Json
    } catch {
        Write-Warning "Could not parse config\budget.json - budget alerts disabled."
    }
}

# Tracks models that were resolved via alias (stripped date suffix) so we only
# warn once per model string, not per turn.
$aliasedModels = [System.Collections.Generic.HashSet[string]]::new()

function Resolve-ModelRate {
    param([string]$model)
    # Exact match first
    if ($rates.ContainsKey($model)) { return $rates[$model] }

    # Prefix-match: strip trailing versioned date suffix -YYYYMMDD
    # e.g. claude-haiku-4-5-20251001 -> claude-haiku-4-5
    $stripped = $model -replace '-\d{8}$', ''
    if ($stripped -ne $model -and $rates.ContainsKey($stripped)) {
        # Record the alias so we can warn once at the end
        [void]$aliasedModels.Add($model)
        return $rates[$stripped]
    }

    return $null
}

function Get-TurnCost {
    param($model, $inputTok, $outputTok, $cacheCreateTok, $cacheReadTok)
    $r = Resolve-ModelRate $model
    if (-not $r) {
        return 0.0
    }
    $cost = ($inputTok       * $r.inputPerMTok       / 1000000) +
            ($outputTok      * $r.outputPerMTok      / 1000000) +
            ($cacheCreateTok * $r.cacheCreatePerMTok / 1000000) +
            ($cacheReadTok   * $r.cacheReadPerMTok   / 1000000)
    return [double]$cost
}

# --- Determine time window ---------------------------------------------------

$now   = [datetime]::Now
$today = $now.Date

if ($Days -gt 0) {
    $windowStart = $today.AddDays(-($Days - 1))
} else {
    $windowStart = [datetime]::MinValue
}

$weekStart  = $today.AddDays(-[int]$today.DayOfWeek)
$monthStart = [datetime]::new($today.Year, $today.Month, 1)

# --- Discover JSONL files ----------------------------------------------------

$claudeRoot = Join-Path $env:USERPROFILE '.claude\projects'

if (-not (Test-Path $claudeRoot)) {
    if ($Json) {
        [pscustomobject]@{ error = "No Claude Code project data found at $claudeRoot" } |
            ConvertTo-Json
    } else {
        Write-Host 'Tracked surface: Claude Code only'
        Write-Host "No Claude Code project data found at: $claudeRoot"
    }
    exit 0
}

$projectDirs = Get-ChildItem -Path $claudeRoot -Directory -ErrorAction SilentlyContinue

if ($projectDirs.Count -eq 0) {
    if ($Json) {
        [pscustomobject]@{ error = 'No project directories found' } | ConvertTo-Json
    } else {
        Write-Host 'Tracked surface: Claude Code only'
        Write-Host "No project directories found under $claudeRoot"
    }
    exit 0
}

if ($Project) {
    $projectDirs = $projectDirs | Where-Object { $_.Name -like "*$Project*" }
    if ($projectDirs.Count -eq 0) {
        Write-Warning "No project matching '$Project' found."
        exit 0
    }
}

# --- Parse turns -------------------------------------------------------------

$turns         = [System.Collections.Generic.List[pscustomobject]]::new()
$seenMsgIds    = [System.Collections.Generic.HashSet[string]]::new()
$unknownModels = [System.Collections.Generic.HashSet[string]]::new()
$parseWarnings = 0

foreach ($dir in $projectDirs) {
    # Derive a human-readable display name from the encoded directory name.
    # Encoded form: Users--you-projects-repo
    # Decode: '--' -> ':/', '-' -> '/' then take the last path component.
    $decoded = $dir.Name -replace '^([A-Za-z])--', '$1:/' -replace '-(?=[^-])', '/'
    # Collapse any remaining double-dashes that survived
    $decoded = $decoded -replace '--', '-'
    $displayName = Split-Path $decoded -Leaf
    if (-not $displayName) { $displayName = $dir.Name }

    # Collect all JSONL files: root-level + subagents/ subdirectory
    $jsonlFiles = [System.Collections.Generic.List[string]]::new()

    Get-ChildItem -Path $dir.FullName -Filter '*.jsonl' -File -ErrorAction SilentlyContinue |
        ForEach-Object { $jsonlFiles.Add($_.FullName) }

    $subagentsDir = Join-Path $dir.FullName 'subagents'
    if (Test-Path $subagentsDir) {
        Get-ChildItem -Path $subagentsDir -Filter '*.jsonl' -File -ErrorAction SilentlyContinue |
            ForEach-Object { $jsonlFiles.Add($_.FullName) }
    }

    foreach ($file in $jsonlFiles) {
        $lines = $null
        try {
            $lines = Get-Content $file -ErrorAction Stop
        } catch {
            Write-Warning "Could not read $file - skipping"
            $parseWarnings++
            continue
        }

        foreach ($line in $lines) {
            if ([string]::IsNullOrWhiteSpace($line)) { continue }

            $entry = $null
            try {
                $entry = $line | ConvertFrom-Json -ErrorAction Stop
            } catch {
                $parseWarnings++
                continue
            }

            # Only process assistant turns
            if ($entry.type -ne 'assistant') { continue }

            # Must have a message object with a usage block
            $msg = $entry.message
            if (-not $msg) { continue }
            if (-not $msg.usage) { continue }

            # Dedup: each API call produces a streaming partial (stop_reason=null)
            # and a final entry (stop_reason set). Count only the final entry.
            $msgId = $msg.id
            if ($msgId) {
                $stopReason = $msg.stop_reason
                if ($null -eq $stopReason -or $stopReason -eq '') { continue }
                if ($seenMsgIds.Contains($msgId)) { continue }
                [void]$seenMsgIds.Add($msgId)
            }

            # Parse timestamp
            $ts = $null
            if ($entry.timestamp) {
                try {
                    $ts = [datetime]::Parse($entry.timestamp)
                } catch {
                    $parseWarnings++
                    continue
                }
            } else {
                continue
            }

            # Apply time-window filter when -Days was specified
            if ($Days -gt 0 -and $ts.Date -lt $windowStart) { continue }

            # Extract usage fields (default 0 if absent)
            $u = $msg.usage
            $inputTok       = if ($u.input_tokens)                { [long]$u.input_tokens }                else { 0L }
            $outputTok      = if ($u.output_tokens)               { [long]$u.output_tokens }               else { 0L }
            $cacheCreateTok = if ($u.cache_creation_input_tokens) { [long]$u.cache_creation_input_tokens } else { 0L }
            $cacheReadTok   = if ($u.cache_read_input_tokens)     { [long]$u.cache_read_input_tokens }     else { 0L }

            $model = if ($msg.model) { $msg.model } else { 'unknown' }

            # Track unknown models: skip if it will resolve via prefix aliasing
            if ($model -ne 'unknown' -and -not $rates.ContainsKey($model)) {
                $stripped = $model -replace '-\d{8}$', ''
                if (-not ($stripped -ne $model -and $rates.ContainsKey($stripped))) {
                    [void]$unknownModels.Add($model)
                }
            }

            $cost = Get-TurnCost $model $inputTok $outputTok $cacheCreateTok $cacheReadTok

            $turns.Add([pscustomobject]@{
                Date           = $ts.Date
                Project        = $displayName
                Model          = $model
                Cost           = $cost
                InputTok       = $inputTok
                OutputTok      = $outputTok
                CacheCreateTok = $cacheCreateTok
                CacheReadTok   = $cacheReadTok
            })
        }
    }
}

# --- Aggregate helpers -------------------------------------------------------

function Get-Aggregate {
    param([object[]]$rows)
    if (-not $rows -or $rows.Count -eq 0) {
        return [pscustomobject]@{
            TurnCount      = 0
            Cost           = 0.0
            InputTok       = 0L
            OutputTok      = 0L
            CacheCreateTok = 0L
            CacheReadTok   = 0L
        }
    }
    return [pscustomobject]@{
        TurnCount      = $rows.Count
        Cost           = ($rows | Measure-Object -Property Cost          -Sum).Sum
        InputTok       = ($rows | Measure-Object -Property InputTok       -Sum).Sum
        OutputTok      = ($rows | Measure-Object -Property OutputTok      -Sum).Sum
        CacheCreateTok = ($rows | Measure-Object -Property CacheCreateTok -Sum).Sum
        CacheReadTok   = ($rows | Measure-Object -Property CacheReadTok   -Sum).Sum
    }
}

function Format-Cost { param($c) return ('${0:F4}' -f $c) }
function Format-Tok  { param($t) return ('{0:N0}' -f $t) }

# --- Build aggregates --------------------------------------------------------

$allRows   = @($turns)
$todayRows = @($allRows | Where-Object { $_.Date -eq $today })
$weekRows  = @($allRows | Where-Object { $_.Date -ge $weekStart })
$monthRows = @($allRows | Where-Object { $_.Date -ge $monthStart })

$todayAgg = Get-Aggregate $todayRows
$weekAgg  = Get-Aggregate $weekRows
$monthAgg = Get-Aggregate $monthRows

# Project breakdown scoped to -Days window (or current month if not specified)
$scopeRows = if ($Days -gt 0) { $allRows } else { $monthRows }
$byProject = $scopeRows |
    Group-Object -Property Project |
    ForEach-Object {
        $agg = Get-Aggregate @($_.Group)
        [pscustomobject]@{
            Project   = $_.Name
            TurnCount = $agg.TurnCount
            Cost      = $agg.Cost
            Tokens    = $agg.InputTok + $agg.OutputTok + $agg.CacheCreateTok + $agg.CacheReadTok
        }
    } |
    Sort-Object -Property Cost -Descending

# Model breakdown always uses month scope
$modelRows = $monthRows |
    Group-Object -Property Model |
    ForEach-Object {
        $agg = Get-Aggregate @($_.Group)
        [pscustomobject]@{
            Model     = $_.Name
            TurnCount = $agg.TurnCount
            Cost      = $agg.Cost
        }
    } |
    Sort-Object -Property Cost -Descending

# --- Budget alert computation ------------------------------------------------

$budgetAlertLevel  = $null   # 'warn' | 'critical' | $null
$budgetAlertMsg    = $null
$budgetTargetUsd   = $null

if ($budget) {
    try {
        $targetUsd = [double]$budget.monthly_targets.combined_advisory_usd
        $warnPct   = [double]$budget.alert_thresholds.warn_pct
        $critPct   = [double]$budget.alert_thresholds.critical_pct
        $monthCost = $monthAgg.Cost
        if ($targetUsd -gt 0) {
            $budgetTargetUsd = $targetUsd
            $pct = ($monthCost / $targetUsd) * 100.0
            if ($pct -ge $critPct) {
                $budgetAlertLevel = 'critical'
                $budgetAlertMsg   = ('ADVISORY: {0:F1}% of ${1:F0} monthly target consumed ({2} API-equivalent). ' +
                    'Budget alerts are advisory - this reflects API-equivalent value, not your subscription bill.') `
                    -f $pct, $targetUsd, (Format-Cost $monthCost)
            } elseif ($pct -ge $warnPct) {
                $budgetAlertLevel = 'warn'
                $budgetAlertMsg   = ('ADVISORY: {0:F1}% of ${1:F0} monthly target consumed ({2} API-equivalent). ' +
                    'Budget alerts are advisory - this reflects API-equivalent value, not your subscription bill.') `
                    -f $pct, $targetUsd, (Format-Cost $monthCost)
            }
        }
    } catch {
        # Budget alert computation failed silently — non-fatal
    }
}

# --- Write health/spend.json -------------------------------------------------

function Write-SpendJson {
    if (-not (Test-Path $healthDir)) {
        try { New-Item -ItemType Directory -Path $healthDir -Force | Out-Null } catch { return }
    }
    $spendObj = [pscustomobject]@{
        lastUpdated = $now.ToString('o')
        source      = 'claude-code-only'
        today       = [pscustomobject]@{
            cost      = [math]::Round($todayAgg.Cost, 6)
            turnCount = $todayAgg.TurnCount
        }
        week        = [pscustomobject]@{
            cost      = [math]::Round($weekAgg.Cost, 6)
            turnCount = $weekAgg.TurnCount
        }
        month       = [pscustomobject]@{
            cost      = [math]::Round($monthAgg.Cost, 6)
            turnCount = $monthAgg.TurnCount
        }
        byProject   = @($byProject | ForEach-Object {
            [pscustomobject]@{
                project   = $_.Project
                cost      = [math]::Round($_.Cost, 6)
                turnCount = $_.TurnCount
            }
        })
        byModel     = @($modelRows | ForEach-Object {
            [pscustomobject]@{
                model     = $_.Model
                cost      = [math]::Round($_.Cost, 6)
                turnCount = $_.TurnCount
            }
        })
        budgetTarget = $budgetTargetUsd
        budgetAlertLevel = $budgetAlertLevel
    }
    try {
        $spendObj | ConvertTo-Json -Depth 4 | Set-Content $spendFile -Encoding UTF8
    } catch {
        Write-Warning "Could not write health\spend.json: $_"
    }
}

# --- JSON output -------------------------------------------------------------

if ($Json) {
    [pscustomobject]@{
        trackedSurface   = 'Claude Code only'
        generatedAt      = $now.ToString('o')
        today            = $todayAgg
        thisWeek         = $weekAgg
        thisMonth        = $monthAgg
        byProject        = $byProject
        byModel          = $modelRows
        parseWarnings    = $parseWarnings
        unknownModels    = @($unknownModels)
        aliasedModels    = @($aliasedModels)
        budgetAlertLevel = $budgetAlertLevel
        budgetTargetUsd  = $budgetTargetUsd
    } | ConvertTo-Json -Depth 5
    Write-SpendJson
    exit 0
}

# --- Human-readable output ---------------------------------------------------

$planLabel = if ($budget -and $budget.subscription_plan_label) { $budget.subscription_plan_label } else { 'subscription plan' }

Write-Host ''
Write-Host '================================================================'
Write-Host '  Claude Code Cost Rollup'
Write-Host '  Tracked surface: Claude Code only'
Write-Host '  Codex / Claude Desktop / web sessions: not included' -ForegroundColor DarkGray
Write-Host '================================================================'
Write-Host ''
Write-Host '  *** API-EQUIVALENT VALUE CONSUMED (not your bill) ***' -ForegroundColor Cyan
Write-Host ("  These figures use public Anthropic API rates to show compute consumed") -ForegroundColor Cyan
Write-Host ("  within your $planLabel allowance.") -ForegroundColor Cyan
Write-Host '  Your actual cost is your flat subscription fee, not these numbers.' -ForegroundColor Cyan
Write-Host ''

Write-Host 'Summary' -ForegroundColor Cyan
Write-Host ('  Today        {0,10}   {1,6} turns   {2} in / {3} out tokens' -f `
    (Format-Cost $todayAgg.Cost), $todayAgg.TurnCount,
    (Format-Tok $todayAgg.InputTok), (Format-Tok $todayAgg.OutputTok))
Write-Host ('  This week    {0,10}   {1,6} turns' -f `
    (Format-Cost $weekAgg.Cost), $weekAgg.TurnCount)
Write-Host ('  This month   {0,10}   {1,6} turns' -f `
    (Format-Cost $monthAgg.Cost), $monthAgg.TurnCount)
Write-Host ''

$scopeLabel = if ($Days -gt 0) { "last $Days days" } else { 'this month' }
Write-Host ("By project ({0}, sorted by cost):" -f $scopeLabel) -ForegroundColor Cyan
if ($byProject.Count -eq 0) {
    Write-Host '  (no data)' -ForegroundColor DarkGray
} else {
    foreach ($row in $byProject) {
        Write-Host ('  {0,-40}  {1,10}   {2,5} turns' -f `
            $row.Project, (Format-Cost $row.Cost), $row.TurnCount)
    }
}
Write-Host ''

if ($ByModel) {
    Write-Host 'By model (this month):' -ForegroundColor Cyan
    if ($modelRows.Count -eq 0) {
        Write-Host '  (no data)' -ForegroundColor DarkGray
    } else {
        foreach ($row in $modelRows) {
            Write-Host ('  {0,-40}  {1,10}   {2,5} turns' -f `
                $row.Model, (Format-Cost $row.Cost), $row.TurnCount)
        }
    }
    Write-Host ''
}

if ($aliasedModels.Count -gt 0) {
    Write-Host ('Note: {0} model(s) matched via version-suffix aliasing (date suffix stripped):' -f `
        $aliasedModels.Count) -ForegroundColor DarkGray
    foreach ($m in $aliasedModels) { Write-Host "  $m" -ForegroundColor DarkGray }
    Write-Host ''
}

if ($unknownModels.Count -gt 0) {
    Write-Host ('Note: {0} unknown model(s) - cost listed as $0.00 for those turns:' -f `
        $unknownModels.Count) -ForegroundColor Yellow
    foreach ($m in $unknownModels) { Write-Host "  $m" -ForegroundColor Yellow }
    Write-Host '  Add rates to config\model-rates.json to fix.' -ForegroundColor Yellow
    Write-Host ''
}

if ($parseWarnings -gt 0) {
    Write-Host ("  {0} line(s) skipped (parse errors or missing fields)." -f $parseWarnings) `
        -ForegroundColor DarkGray
    Write-Host ''
}

# Budget advisory alerts
if ($budgetAlertLevel -eq 'critical') {
    Write-Host $budgetAlertMsg -ForegroundColor Red
    Write-Host ''
} elseif ($budgetAlertLevel -eq 'warn') {
    Write-Host $budgetAlertMsg -ForegroundColor Yellow
    Write-Host ''
}

Write-Host 'Note: API-equivalent rates used. Claude Max may apply usage caps' -ForegroundColor DarkGray
Write-Host 'rather than per-token billing. Check your Anthropic billing dashboard' -ForegroundColor DarkGray
Write-Host 'for exact spend. Add Codex/Desktop spend manually.' -ForegroundColor DarkGray
Write-Host ''

# Write spend.json for machine consumers
Write-SpendJson
