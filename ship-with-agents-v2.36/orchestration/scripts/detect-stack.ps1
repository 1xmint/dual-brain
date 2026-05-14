param(
    [string] $Root = (Get-Location).Path,
    [switch] $Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = (Resolve-Path $Root).Path
$stacks = [System.Collections.Generic.List[object]]::new()

function Add-Stack {
    param(
        [string] $Name,
        [string[]] $Indicators,
        [string] $PackageManager = ''
    )

    $stacks.Add([pscustomobject]@{
        name = $Name
        indicators = $Indicators
        packageManager = $PackageManager
    })
}

$packageJson = Join-Path $resolvedRoot 'package.json'
$pyproject = Join-Path $resolvedRoot 'pyproject.toml'
$requirements = Join-Path $resolvedRoot 'requirements.txt'
$setupPy = Join-Path $resolvedRoot 'setup.py'
$cargoToml = Join-Path $resolvedRoot 'Cargo.toml'
$goMod = Join-Path $resolvedRoot 'go.mod'

if (Test-Path $packageJson) {
    $indicators = [System.Collections.Generic.List[string]]::new()
    $indicators.Add('package.json')
    $packageManager = 'npm'

    if (Test-Path (Join-Path $resolvedRoot 'pnpm-lock.yaml')) {
        $packageManager = 'pnpm'
        $indicators.Add('pnpm-lock.yaml')
    }
    elseif (Test-Path (Join-Path $resolvedRoot 'yarn.lock')) {
        $packageManager = 'yarn'
        $indicators.Add('yarn.lock')
    }
    elseif ((Test-Path (Join-Path $resolvedRoot 'bun.lockb')) -or
            (Test-Path (Join-Path $resolvedRoot 'bun.lock'))) {
        $packageManager = 'bun'
        $indicators.Add('bun.lock')
    }

    try {
        $package = Get-Content $packageJson -Raw | ConvertFrom-Json
        if ($package.packageManager) {
            if ($package.packageManager -match '^(pnpm|yarn|bun|npm)@') {
                $packageManager = $matches[1]
            }
            $indicators.Add("packageManager:$($package.packageManager)")
        }
    }
    catch {
        $indicators.Add('package.json:unparsed')
    }

    Add-Stack -Name 'node' -Indicators $indicators.ToArray() -PackageManager $packageManager
}

if ((Test-Path $pyproject) -or (Test-Path $requirements) -or (Test-Path $setupPy)) {
    $indicators = [System.Collections.Generic.List[string]]::new()
    foreach ($path in @($pyproject, $requirements, $setupPy)) {
        if (Test-Path $path) {
            $indicators.Add([System.IO.Path]::GetFileName($path))
        }
    }
    Add-Stack -Name 'python' -Indicators $indicators.ToArray()
}

if (Test-Path $cargoToml) {
    Add-Stack -Name 'rust' -Indicators @('Cargo.toml')
}

if (Test-Path $goMod) {
    Add-Stack -Name 'go' -Indicators @('go.mod')
}

$primary = if ($stacks.Count -gt 0) { $stacks[0].name } else { 'unknown' }
$result = [pscustomobject]@{
    root = $resolvedRoot
    primary = $primary
    stacks = @($stacks)
}

if ($Json) {
    $result | ConvertTo-Json -Depth 5
}
else {
    Write-Host "Root: $resolvedRoot"
    Write-Host "Primary stack: $primary"
    if ($stacks.Count -eq 0) {
        Write-Host 'Detected stacks: none'
    }
    else {
        foreach ($stack in $stacks) {
            $suffix = if ($stack.packageManager) { " (package manager: $($stack.packageManager))" } else { '' }
            Write-Host ("- {0}{1} :: {2}" -f $stack.name, $suffix, ($stack.indicators -join ', '))
        }
    }
}
