param(
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$targets =
    Get-ChildItem -Path $Root -Recurse -File -Filter '*.md' -Force |
    Where-Object {
        $full = $_.FullName
        $relative = $full.Substring($Root.Length).TrimStart('\', '/')
        -not (
            $relative -like 'logs\*' -or
            $relative -like 'logs/*' -or
            $relative -like 'checkpoints\*' -or
            $relative -like 'checkpoints/*' -or
            $relative -like '_design\*' -or
            $relative -like '_design/*' -or
            $relative -like 'updates\*archive.md' -or
            $relative -like 'updates/*archive.md' -or
            $relative -like 'scripts\*' -or
            $relative -like 'scripts/*' -or
            $relative -eq 'prompt-change-log.md'
        )
    } |
    Select-Object -ExpandProperty FullName |
    Sort-Object -Unique

$checks = @(
    @{ Pattern = '_agent-system/'; Message = 'package vendor path leaked into a live operational surface' },
    @{ Pattern = '_agent-system-local/'; Message = 'phantom local-install path leaked into a live operational surface' },
    @{ Pattern = '_agent-system-runtime/'; Message = 'phantom runtime-install path leaked into a live operational surface' },
    @{ Pattern = 'NAMING-SCHEMA.md'; Message = 'package-only naming doc leaked into a live operational surface' },
    @{ Pattern = 'the relevant gate under ``'; Message = 'path-repair placeholder text survived in a live role card' },
    @{ Pattern = 'Decision needed from user:'; Message = 'legacy user-wording survived in a live operational surface' },
    @{ Pattern = 'SURFACE-CONTAINER-COMPATIBILITY-GATE.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-CONTAINER-RESOLUTION.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'TERMINAL-LAUNCH-PACKET-RULE.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'LAUNCHER-ADAPTER-RULE.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-SEQUENCING-RULE.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-MODE-PREFERENCE-MEMORY.md'; Message = 'deleted launch satellite survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-INTENT-DISAMBIGUATION.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-READINESS-GATE.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'LAUNCH-STATE-MACHINE.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'PHANTOM-LANE-PREVENTION-GATE.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'POST-LAUNCH-CONFIRMATION-RULE.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'TERMINAL-INJECTION-GATE.md'; Message = 'deleted launch source file survived in a live operational surface' },
    @{ Pattern = 'RESOLVE-CLASSIFY-ACT.md'; Message = 'deleted truth source file survived in a live operational surface' },
    @{ Pattern = 'ASSUMPTION-RISK-LADDER.md'; Message = 'deleted truth source file survived in a live operational surface' },
    @{ Pattern = 'INFERENCE-LABELING-RULE.md'; Message = 'deleted truth source file survived in a live operational surface' },
    @{ Pattern = 'VERIFY-BEFORE-ROUTING-GATE.md'; Message = 'deleted truth source file survived in a live operational surface' },
    @{ Pattern = 'TRUTH-SOURCE-PRIORITY.md'; Message = 'deleted truth source file survived in a live operational surface' },
    @{ Pattern = 'IDENTITY-RESOLUTION-PROTOCOL.md'; Message = 'deleted identity source file survived in a live operational surface' },
    @{ Pattern = 'SELF-NOTE-RECOGNITION-GATE.md'; Message = 'deleted identity source file survived in a live operational surface' },
    @{ Pattern = 'THREAD-LOCAL-IDENTITY-PRIORITY-RULE.md'; Message = 'deleted identity source file survived in a live operational surface' },
    @{ Pattern = 'CURRENT-LANE-CERTAINTY-LADDER.md'; Message = 'deleted identity source file survived in a live operational surface' },
    @{ Pattern = 'LANE-WELCOME-HANDSHAKE.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-MAP-VISUAL-PROTOCOL.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-HEARTBEAT-MODEL.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-AWARENESS-SCORECARD.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-BRAIN-CAPSULE-MODEL.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-BROKER-LADDER.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-BIRTH-TRANSACTION.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-INBOX-PROVISIONING-GATE.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-CLOSEOUT-TRANSACTION.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-LIFECYCLE-EVENT-SCHEMA.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'LANE-OWNERSHIP-GATE.md'; Message = 'deleted lane source file survived in a live operational surface' },
    @{ Pattern = 'MULTI-BRAIN-TOPOLOGY.md'; Message = 'deleted review-topology source file survived in a live operational surface' },
    @{ Pattern = 'TRI-BRAIN-DIVERSITY-GATE.md'; Message = 'deleted review-topology source file survived in a live operational surface' },
    @{ Pattern = 'REVIEW-CELL-STATE-REGISTRY.md'; Message = 'deleted review-topology source file survived in a live operational surface' },
    @{ Pattern = 'ACTIVE-LANE-CLOSEOUT.md'; Message = 'deleted lane absorbable source file survived in a live operational surface' },
    @{ Pattern = 'ACTIVE-MAP-HYGIENE.md'; Message = 'deleted lane absorbable source file survived in a live operational surface' },
    @{ Pattern = 'ACTIVE-OWNER-MOMENTUM.md'; Message = 'deleted continuity source file survived in a live operational surface' },
    @{ Pattern = 'ACTIVE-PICKUP-TRIGGER-GATE.md'; Message = 'deleted continuity source file survived in a live operational surface' },
    @{ Pattern = 'DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md'; Message = 'deleted lane identity source file survived in a live operational surface' },
    @{ Pattern = 'HUMAN-FRIENDLY-NAMING-GATE.md'; Message = 'deleted lane identity source file survived in a live operational surface' },
    @{ Pattern = 'CONTINUATION-ADOPTION-GATE.md'; Message = 'deleted lane identity source file survived in a live operational surface' },
    @{ Pattern = 'TWO-SIDED-HANDHOLDING-RULE.md'; Message = 'deleted buyer-support source file survived in a live operational surface' }
)

function Test-DoctorReleaseCap {
    param(
        [string] $RepoRoot
    )

    $addedPaths = @(git -C $RepoRoot diff --cached --name-only --diff-filter=A 2>$null)
    if (-not $addedPaths -or $addedPaths.Count -eq 0) {
        return @()
    }

    $releaseRegex = '^logs/doctor-(\d{4}-\d{2}-\d{2})-.*-release\.md$'
    $releaseByDate = @{}

    foreach ($path in $addedPaths) {
        $normalized = $path -replace '\\', '/'
        if ($normalized -match $releaseRegex) {
            $date = $Matches[1]
            if (-not $releaseByDate.ContainsKey($date)) {
                $releaseByDate[$date] = New-Object System.Collections.Generic.List[string]
            }
            $releaseByDate[$date].Add($normalized)
        }
    }

    $violations = New-Object System.Collections.Generic.List[object]

    foreach ($date in $releaseByDate.Keys) {
        $existing = Get-ChildItem -Path (Join-Path $RepoRoot 'logs') -Filter ("doctor-{0}-*-release.md" -f $date) -File -ErrorAction SilentlyContinue
        $stagedCount = $releaseByDate[$date].Count
        $existingCount = @($existing).Count

        if (($existingCount + $stagedCount) -gt 1) {
            foreach ($path in $releaseByDate[$date]) {
                $violations.Add([pscustomobject]@{
                    File = $path
                    Line = 1
                    Message = "doctor release-cap violation for $date; keep at most one doctor *-release.md per day"
                    Text = "existing=$existingCount staged=$stagedCount"
                })
            }
        }
    }

    return $violations
}

$failures = New-Object System.Collections.Generic.List[object]

foreach ($target in $targets) {
    foreach ($check in $checks) {
        $hits = Select-String -Path $target -Pattern $check.Pattern -SimpleMatch
        foreach ($hit in $hits) {
            $failures.Add([pscustomobject]@{
                File = $target.Substring($Root.Length).TrimStart('\', '/')
                Line = $hit.LineNumber
                Message = $check.Message
                Text = $hit.Line.Trim()
            })
        }
    }
}

if ($failures.Count -gt 0) {
    Write-Host 'Live surface check failed:' -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host ("- {0}:{1} :: {2}" -f $failure.File, $failure.Line, $failure.Message) -ForegroundColor Yellow
        Write-Host ("  {0}" -f $failure.Text)
    }
    exit 1
}

$releaseViolations = @(Test-DoctorReleaseCap -RepoRoot $Root)
if ($releaseViolations.Count -gt 0) {
    Write-Host 'Live surface check failed:' -ForegroundColor Red
    foreach ($failure in $releaseViolations) {
        Write-Host ("- {0}:{1} :: {2}" -f $failure.File, $failure.Line, $failure.Message) -ForegroundColor Yellow
        Write-Host ("  {0}" -f $failure.Text)
    }
    exit 1
}

Write-Host ("Live surface check passed. scanned {0} files." -f $targets.Count)
