param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [string] $WhenApplies = '',
    [string] $DoThis = '',
    [string] $AvoidThis = '',
    [string] $Proof = '',
    [string] $Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Slug {
    param([string] $Text)
    $slug = $Text.ToLowerInvariant() -replace '[^a-z0-9]+', '-'
    return $slug.Trim('-')
}

$patternsDir = Join-Path $Root 'patterns'
if (-not (Test-Path $patternsDir)) {
    New-Item -Path $patternsDir -ItemType Directory | Out-Null
}

$slug = Get-Slug -Text $Name
$patternPath = Join-Path $patternsDir ("{0}.md" -f $slug)

$body = @(
    "# $Name",
    '',
    '## When it applies',
    ('- ' + ($(if ($WhenApplies) { $WhenApplies } else { 'fill this in' }))),
    '',
    '## Do this',
    ('- ' + ($(if ($DoThis) { $DoThis } else { 'fill this in' }))),
    '',
    '## Avoid this',
    ('- ' + ($(if ($AvoidThis) { $AvoidThis } else { 'fill this in' }))),
    '',
    '## Proof',
    ('- ' + ($(if ($Proof) { $Proof } else { 'fill this in' }))),
    ''
) -join "`n"

Set-Content -Path $patternPath -Value $body
Write-Host "Wrote pattern: $patternPath"
