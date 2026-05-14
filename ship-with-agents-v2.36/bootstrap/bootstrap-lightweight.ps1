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

$localRoot = Join-Path $targetRoot '_agent-system-local'
$runtimeRoot = Join-Path $targetRoot '_agent-system-runtime'
$starterRoot = Join-Path $localRoot 'starters'

Ensure-Directory -Path $localRoot
Ensure-Directory -Path $runtimeRoot
Ensure-Directory -Path (Join-Path $runtimeRoot 'checkpoints')
Ensure-Directory -Path (Join-Path $runtimeRoot 'logs')
Ensure-Directory -Path $starterRoot

Copy-FileSafe -Source (Join-Path $packageRoot 'templates\AGENTS.md') -Destination (Join-Path $targetRoot 'AGENTS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\CLAUDE.md') -Destination (Join-Path $targetRoot 'CLAUDE.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\task-packet.md') -Destination (Join-Path $starterRoot 'task-packet.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\work-chat-handoff.md') -Destination (Join-Path $starterRoot 'work-chat-handoff.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\chat-migration-packet.md') -Destination (Join-Path $starterRoot 'chat-migration-packet.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-QUIRKS.md') -Destination (Join-Path $localRoot 'LOCAL-QUIRKS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-LESSONS.md') -Destination (Join-Path $localRoot 'LOCAL-LESSONS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\LOCAL-WINS.md') -Destination (Join-Path $localRoot 'LOCAL-WINS.md')
Copy-FileSafe -Source (Join-Path $packageRoot 'templates\OPERATOR-PREFERENCES.md') -Destination (Join-Path $localRoot 'OPERATOR-PREFERENCES.md')

$installConfig = @"
# Install Config

## Install Mode

- Install mode: simple-in-place

## Folder Truth

- Vendor layer path: [not installed in lightweight mode]
- Local layer path: `_agent-system-local/`
- Runtime layer path: `_agent-system-runtime/`

## Runtime Paths

- Active workstreams index: [not required in lightweight mode]
- Checkpoints directory: `_agent-system-runtime/checkpoints/`
- Logs directory: `_agent-system-runtime/logs/`
- Archive directory: [optional later]

## Naming Truth

- Uses phase tags?: [yes / no]
- Phase style: [p1/p2, w1/w2, day0/day1, custom]
- Stable lane key style: [default `head-<N>`, `super-<N>-<slug>`,
  `agent-<N>-<workstream>`, `doctor-<N>-<slug>`, `brainstorm-<N>-<slug>`]
- Continuation tokens: [default `--run<N>` / `--recover<N>` or custom]

## Model / Control Truth

- Can this runtime show current model directly?: [yes / no / sometimes]
- Can helpers be pinned to a different runtime reliably?: [yes / no / unknown]
- Exact-control path: [manual terminal launch / direct helper acceptable]

## Notes

- Lightweight bootstrap created local and runtime folders early so you can grow
  into safer upgrades later without moving everything twice.
"@

$enabledModules = @"
# Enabled Modules

## Core Mode

- Lightweight lane enabled?: yes
- Full orchestration enabled?: no
- True dual-brain audited mode enabled?: no

## Optional Gates And Systems

- Active chat map enabled?: no
- Context-load gate enabled?: no
- Spawn-decision gate enabled?: no
- Self-improvement loop enabled?: yes
- System improvement lane enabled?: yes
- Phase-and-storage system enabled?: no
- Runtime separation enabled?: yes

## Tooling Modes

- Primary execution tool: [Claude Code / Codex / Cursor / Windsurf / other]
- Second review brain enabled?: [yes / no]
- Local model helper enabled?: [yes / no]

## Notes

- Lightweight bootstrap installs the smallest durable starter shape.
- Graduate to orchestration only when simple task-packet transport stops being enough.
"@

Write-TextSafe -Destination (Join-Path $localRoot 'INSTALL-CONFIG.md') -Content $installConfig
Write-TextSafe -Destination (Join-Path $localRoot 'ENABLED-MODULES.md') -Content $enabledModules

Write-Host ''
Write-Host 'Lightweight bootstrap complete.'
Write-Host "Repo: $targetRoot"
Write-Host 'Next recommended reads: START-HERE.md, AGENT-WORKFLOW-GUIDE.md, PLATFORM-SETUP.md, FIRST-WEEK-PLAYBOOK.md'
Write-Host 'Then run: bootstrap/agent-system-doctor.ps1'
