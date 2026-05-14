param(
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'skill-specs.ps1')

function Get-Sha256Hex {
    param([string] $Text)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        $hash = $sha.ComputeHash($bytes)
        return ([System.BitConverter]::ToString($hash)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

$skillSpecs = @(Get-SkillSpecs)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($spec in $skillSpecs) {
    $target = Join-Path $Root $spec.TargetPath
    if (-not (Test-Path $target)) {
        $failures.Add("missing skill file: $($spec.TargetPath)")
        continue
    }

    $content = Get-Content $target -Raw
    $match = [regex]::Match($content, 'canonical-hash:\s*([0-9a-f]+)')
    if (-not $match.Success) {
        $failures.Add("missing canonical hash sentinel: $($spec.TargetPath)")
        continue
    }

    $sourcePayload = foreach ($relative in $spec.SourceFiles) {
        $path = Join-Path $Root $relative
        "===== $([System.IO.Path]::GetFileName($path)) =====`n" + (Get-Content $path -Raw).Trim()
    }

    $expected = Get-Sha256Hex (($sourcePayload -join "`n`n"))
    $actual = $match.Groups[1].Value

    if ($expected -ne $actual) {
        $failures.Add("drift detected for $($spec.Name): expected $expected but skill sentinel says $actual")
    }
}

if ($failures.Count -gt 0) {
    Write-Host 'Skill drift check failed:' -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "- $failure" -ForegroundColor Yellow
    }
    exit 1
}

Write-Host "Skill drift check passed."
