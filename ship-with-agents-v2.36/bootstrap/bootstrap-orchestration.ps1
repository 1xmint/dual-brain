param(
    [Parameter(Mandatory = $true)]
    [string] $TargetRepo,
    [switch] $Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path

function Ensure-Directory {
    param([string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Copy-FileSafe {
    param(
        [string] $Source,
        [string] $Destination
    )

    if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and -not $Force) {
        Write-Host "skip existing: $Destination"
        return
    }

    Ensure-Directory -Path (Split-Path -Parent $Destination)
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
    Write-Host "wrote: $Destination"
}

function Copy-TreeSafe {
    param(
        [string] $SourceDir,
        [string] $DestinationDir
    )

    Get-ChildItem -LiteralPath $SourceDir -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($SourceDir.Length).TrimStart('\')
        $destination = Join-Path $DestinationDir $relative
        Copy-FileSafe -Source $_.FullName -Destination $destination
    }
}

function Write-TextSafe {
    param(
        [string] $Destination,
        [string] $Content
    )

    if ((Test-Path -LiteralPath $Destination -PathType Leaf) -and -not $Force) {
        Write-Host "skip existing: $Destination"
        return
    }

    Ensure-Directory -Path (Split-Path -Parent $Destination)
    [System.IO.File]::WriteAllText($Destination, $Content)
    Write-Host "wrote: $Destination"
}

$vendorRoot = Join-Path $targetRoot '_agent-system'
$localRoot = Join-Path $targetRoot '_agent-system-local'
$runtimeRoot = Join-Path $targetRoot '_agent-system-runtime'
$claudeRoot = Join-Path $targetRoot '.claude'

Ensure-Directory -Path $vendorRoot
Ensure-Directory -Path $localRoot
Ensure-Directory -Path $runtimeRoot
Ensure-Directory -Path (Join-Path $runtimeRoot 'slices')
Ensure-Directory -Path (Join-Path $runtimeRoot 'reviews')
Ensure-Directory -Path (Join-Path $runtimeRoot 'checkpoints')
Ensure-Directory -Path (Join-Path $runtimeRoot 'checkpoint-events')
Ensure-Directory -Path (Join-Path $runtimeRoot 'closeouts')
Ensure-Directory -Path (Join-Path $runtimeRoot 'health')
Ensure-Directory -Path (Join-Path $runtimeRoot 'observability')
Ensure-Directory -Path (Join-Path $runtimeRoot 'lanes')
Ensure-Directory -Path (Join-Path $runtimeRoot 'mail')
Ensure-Directory -Path (Join-Path $runtimeRoot 'mail\inbox')
Ensure-Directory -Path (Join-Path $runtimeRoot 'logs')
Ensure-Directory -Path (Join-Path $runtimeRoot 'archive')
Ensure-Directory -Path (Join-Path $runtimeRoot 'updates')
Ensure-Directory -Path (Join-Path $runtimeRoot 'updates\inbox')
Ensure-Directory -Path (Join-Path $runtimeRoot 'workstreams')
Ensure-Directory -Path $claudeRoot

Copy-FileSafe -Source (Join-Path $packageRoot 'templates\AGENTS.md') -Destination (Join-Path $targetRoot 'AGENTS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\CLAUDE.md') -Destination (Join-Path $targetRoot 'CLAUDE.md')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration') -DestinationDir $vendorRoot
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\.claude\agents') -DestinationDir (Join-Path $claudeRoot 'agents')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\.claude\commands') -DestinationDir (Join-Path $claudeRoot 'commands')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\.claude\rules') -DestinationDir (Join-Path $claudeRoot 'rules')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\.claude\skills') -DestinationDir (Join-Path $claudeRoot 'skills')
Copy-FileSafe -Source (Join-Path $packageRoot 'orchestration\.claude\settings.json') -Destination (Join-Path $claudeRoot 'settings.json')
Copy-FileSafe -Source (Join-Path $packageRoot 'orchestration\ACTIVE-WORKSTREAMS.md') -Destination (Join-Path $runtimeRoot 'ACTIVE-WORKSTREAMS.md')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\updates') -DestinationDir (Join-Path $runtimeRoot 'updates')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\checkpoint-events') -DestinationDir (Join-Path $runtimeRoot 'checkpoint-events')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\closeouts') -DestinationDir (Join-Path $runtimeRoot 'closeouts')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\health') -DestinationDir (Join-Path $runtimeRoot 'health')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\lanes') -DestinationDir (Join-Path $runtimeRoot 'lanes')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\mail') -DestinationDir (Join-Path $runtimeRoot 'mail')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\observability') -DestinationDir (Join-Path $runtimeRoot 'observability')
Copy-TreeSafe -SourceDir (Join-Path $packageRoot 'orchestration\workstreams') -DestinationDir (Join-Path $runtimeRoot 'workstreams')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-QUIRKS.md') -Destination (Join-Path $localRoot 'LOCAL-QUIRKS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-LESSONS.md') -Destination (Join-Path $localRoot 'LOCAL-LESSONS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-WINS.md') -Destination (Join-Path $localRoot 'LOCAL-WINS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\OPERATOR-PREFERENCES.md') -Destination (Join-Path $localRoot 'OPERATOR-PREFERENCES.md')

$installConfig = @"
# Install Config

## Install Mode

- Install mode: safe-upgrade

## Folder Truth

- Vendor layer path: `_agent-system/`
- Local layer path: `_agent-system-local/`
- Runtime layer path: `_agent-system-runtime/`

## Runtime Paths

- Active workstreams index: `_agent-system-runtime/ACTIVE-WORKSTREAMS.md`
- Checkpoints directory: `_agent-system-runtime/checkpoints/`
- Checkpoint events directory: `_agent-system-runtime/checkpoint-events/`
- Closeouts directory: `_agent-system-runtime/closeouts/`
- Health directory: `_agent-system-runtime/health/`
- Observability directory: `_agent-system-runtime/observability/`
- Lanes directory: `_agent-system-runtime/lanes/`
- Mail directory: `_agent-system-runtime/mail/`
- Logs directory: `_agent-system-runtime/logs/`
- Archive directory: `_agent-system-runtime/archive/`
- Updates directory: `_agent-system-runtime/updates/`
- Workstreams directory: `_agent-system-runtime/workstreams/`
- Update feed: `_agent-system-runtime/updates/UPDATE-FEED.md`
- Update watermarks: `_agent-system-runtime/updates/UPDATE-WATERMARKS.md`
- Health summary: `_agent-system-runtime/health/summary.json`
- Workstream health: `_agent-system-runtime/health/workstreams.json`
- Health dashboard: `_agent-system-runtime/health/DASHBOARD.md`
- Turn events: `_agent-system-runtime/observability/turn-events.jsonl`
- Observability evidence: `_agent-system-runtime/observability/evidence.md`
- Observability metrics: `_agent-system-runtime/observability/metrics.json`

## Naming Truth

- Uses phase tags?: [yes / no]
- Phase style: [p1/p2, w1/w2, day0/day1, custom]
- Stable lane key style: [default `head-<N>`, `super-<N>-<slug>`,
  `agent-<N>-<workstream>`, `doctor-<N>-<slug>`, `brainstorm-<N>-<slug>`]
- Continuation tokens: [default `--run<N>` / `--recover<N>` or custom]

## Model / Control Truth

- Can this runtime show current model directly?: [yes / no / sometimes]
- Can helpers be pinned to a different runtime reliably?: [yes / no / unknown]
- Exact-control path: manual terminal launch

## Notes

- Orchestration bootstrap installed the upgrade-safe vendor/local/runtime layout.
- Fill in the remaining truth before large multi-chat work starts.
"@

$enabledModules = @"
# Enabled Modules

## Core Mode

- Lightweight lane enabled?: no
- Full orchestration enabled?: yes
- True dual-brain audited mode enabled?: [yes / no]

## Optional Gates And Systems

- Active chat map enabled?: yes
- Hook-and-health layer enabled?: yes
- Doctor observability layer enabled?: yes
- Lane-awareness layer enabled?: yes
- Context-load gate enabled?: yes
- Spawn-decision gate enabled?: yes
- Self-improvement loop enabled?: yes
- System improvement lane enabled?: yes
- Phase-and-storage system enabled?: yes
- Runtime separation enabled?: yes

## Tooling Modes

- Primary execution tool: Claude Code
- Second review brain enabled?: [yes / no]
- Local model helper enabled?: [yes / no]

## Notes

- Orchestration bootstrap installed the full public orchestration layer.
- Keep buyer-specific overrides in `_agent-system-local/`, not in `_agent-system/`.
"@

Write-TextSafe -Destination (Join-Path $localRoot 'INSTALL-CONFIG.md') -Content $installConfig
Write-TextSafe -Destination (Join-Path $localRoot 'ENABLED-MODULES.md') -Content $enabledModules

Write-Host ''
Write-Host 'Orchestration bootstrap complete.'
Write-Host "Repo: $targetRoot"
Write-Host 'Next recommended reads: _agent-system/QUICK-START.md, FIRST-WEEK-PLAYBOOK.md, _agent-system/DOC-FIRST-ORCHESTRATION.md, UPGRADE-GUIDE.md'
Write-Host 'Then run: bootstrap/agent-system-doctor.ps1'
