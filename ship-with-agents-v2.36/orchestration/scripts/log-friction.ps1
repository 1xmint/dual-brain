param(
    [Parameter(Mandatory = $true)]
    [string] $TaskKind,
    [Parameter(Mandatory = $true)]
    [string] $Wrong,
    [Parameter(Mandatory = $true)]
    [string] $Correction,
    [string] $ExpectedSkill = '',
    [string] $ActualSkill = '',
    [ValidateSet('low', 'medium', 'high')]
    [string] $Severity = 'medium',
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$observabilityDir = Join-Path $Root 'observability'
$logPath = Join-Path $observabilityDir 'friction.jsonl'

if (-not (Test-Path $observabilityDir)) {
    New-Item -Path $observabilityDir -ItemType Directory | Out-Null
}

$entry = [ordered]@{
    ts = [DateTimeOffset]::Now.ToString('o')
    taskKind = $TaskKind
    wrong = $Wrong
    correction = $Correction
    severity = $Severity
}

if ($ExpectedSkill) { $entry.expectedSkill = $ExpectedSkill }
if ($ActualSkill) { $entry.actualSkill = $ActualSkill }

$json = $entry | ConvertTo-Json -Compress
Add-Content -Path $logPath -Value $json

Write-Host "Logged friction to $logPath"
