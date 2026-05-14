param(
    [string] $Root = (Get-Location).Path,
    [switch] $Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = (Resolve-Path $Root).Path
$detectScript = Join-Path $PSScriptRoot 'detect-stack.ps1'
$stackInfo = & $detectScript -Root $resolvedRoot -Json | ConvertFrom-Json

$results = [System.Collections.Generic.List[object]]::new()

function Add-Result {
    param(
        [string] $Stack,
        [string] $Check,
        [string] $Status,
        [string] $Command,
        [string] $Reason = '',
        [int] $ExitCode = 0
    )

    $results.Add([pscustomobject]@{
        stack = $Stack
        check = $Check
        status = $Status
        command = $Command
        exitCode = $ExitCode
        reason = $Reason
    })
}

function Invoke-ExternalCheck {
    param(
        [string] $Stack,
        [string] $Check,
        [string] $Executable,
        [string[]] $Arguments
    )

    $commandText = ($Executable + ' ' + ($Arguments -join ' ')).Trim()

    Push-Location $resolvedRoot
    try {
        & $Executable @Arguments
        $exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
    }
    catch {
        Add-Result -Stack $Stack -Check $Check -Status 'fail' -Command $commandText -Reason $_.Exception.Message -ExitCode 1
        return
    }
    finally {
        Pop-Location
    }

    if ($exitCode -eq 0) {
        Add-Result -Stack $Stack -Check $Check -Status 'pass' -Command $commandText
    }
    else {
        Add-Result -Stack $Stack -Check $Check -Status 'fail' -Command $commandText -ExitCode $exitCode
    }
}

function Find-LocalNodeBinary {
    param([string] $RootPath, [string] $Name)

    $cmdPath = Join-Path $RootPath ("node_modules\.bin\{0}.cmd" -f $Name)
    if (Test-Path $cmdPath) { return $cmdPath }

    $plainPath = Join-Path $RootPath ("node_modules\.bin\{0}" -f $Name)
    if (Test-Path $plainPath) { return $plainPath }

    return $null
}

function Get-PackageJson {
    param([string] $RootPath)

    $packageJsonPath = Join-Path $RootPath 'package.json'
    if (-not (Test-Path $packageJsonPath)) { return $null }

    try {
        return Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Get-PackageScriptText {
    param($Package, [string] $Name)

    if (-not $Package -or -not $Package.scripts) {
        return ''
    }

    $property = $Package.scripts.PSObject.Properties[$Name]
    if (-not $property) {
        return ''
    }

    return [string]$property.Value
}

function Run-NodeChecks {
    param([string] $RootPath, [string] $PackageManager)

    $package = Get-PackageJson -RootPath $RootPath
    $scripts = if ($package -and $package.scripts) { $package.scripts.PSObject.Properties.Name } else { @() }
    $testScript = Get-PackageScriptText -Package $package -Name 'test'

    if ($scripts -contains 'typecheck') {
        switch ($PackageManager) {
            'pnpm' { Invoke-ExternalCheck -Stack 'node' -Check 'typecheck' -Executable 'pnpm' -Arguments @('run', 'typecheck') }
            'yarn' { Invoke-ExternalCheck -Stack 'node' -Check 'typecheck' -Executable 'yarn' -Arguments @('typecheck') }
            'bun'  { Invoke-ExternalCheck -Stack 'node' -Check 'typecheck' -Executable 'bun' -Arguments @('run', 'typecheck') }
            default { Invoke-ExternalCheck -Stack 'node' -Check 'typecheck' -Executable 'npm' -Arguments @('run', 'typecheck') }
        }
    }
    elseif ((Test-Path (Join-Path $RootPath 'tsconfig.json')) -and (Find-LocalNodeBinary -RootPath $RootPath -Name 'tsc')) {
        $tsc = Find-LocalNodeBinary -RootPath $RootPath -Name 'tsc'
        Invoke-ExternalCheck -Stack 'node' -Check 'typecheck' -Executable $tsc -Arguments @('--noEmit')
    }
    else {
        Add-Result -Stack 'node' -Check 'typecheck' -Status 'skip' -Command '' -Reason 'No typecheck script or local TypeScript compiler found.'
    }

    if ($scripts -contains 'lint') {
        switch ($PackageManager) {
            'pnpm' { Invoke-ExternalCheck -Stack 'node' -Check 'lint' -Executable 'pnpm' -Arguments @('run', 'lint') }
            'yarn' { Invoke-ExternalCheck -Stack 'node' -Check 'lint' -Executable 'yarn' -Arguments @('lint') }
            'bun'  { Invoke-ExternalCheck -Stack 'node' -Check 'lint' -Executable 'bun' -Arguments @('run', 'lint') }
            default { Invoke-ExternalCheck -Stack 'node' -Check 'lint' -Executable 'npm' -Arguments @('run', 'lint') }
        }
    }
    elseif ((Find-LocalNodeBinary -RootPath $RootPath -Name 'eslint') -and
            ((Test-Path (Join-Path $RootPath 'eslint.config.js')) -or
             (Test-Path (Join-Path $RootPath 'eslint.config.mjs')) -or
             (Test-Path (Join-Path $RootPath '.eslintrc.js')) -or
             (Test-Path (Join-Path $RootPath '.eslintrc.cjs')) -or
             (Test-Path (Join-Path $RootPath '.eslintrc.json')))) {
        $eslint = Find-LocalNodeBinary -RootPath $RootPath -Name 'eslint'
        Invoke-ExternalCheck -Stack 'node' -Check 'lint' -Executable $eslint -Arguments @('.')
    }
    else {
        Add-Result -Stack 'node' -Check 'lint' -Status 'skip' -Command '' -Reason 'No lint script or local eslint config found.'
    }

    if (($scripts -contains 'test') -and ($testScript -notmatch 'no test specified')) {
        switch ($PackageManager) {
            'pnpm' { Invoke-ExternalCheck -Stack 'node' -Check 'test' -Executable 'pnpm' -Arguments @('test') }
            'yarn' { Invoke-ExternalCheck -Stack 'node' -Check 'test' -Executable 'yarn' -Arguments @('test') }
            'bun'  { Invoke-ExternalCheck -Stack 'node' -Check 'test' -Executable 'bun' -Arguments @('test') }
            default { Invoke-ExternalCheck -Stack 'node' -Check 'test' -Executable 'npm' -Arguments @('test') }
        }
    }
    else {
        Add-Result -Stack 'node' -Check 'test' -Status 'skip' -Command '' -Reason 'No real test script declared in package.json.'
    }
}

function Run-PythonChecks {
    param([string] $RootPath)

    $pyprojectPath = Join-Path $RootPath 'pyproject.toml'
    $pyproject = if (Test-Path $pyprojectPath) { Get-Content $pyprojectPath -Raw } else { '' }

    if (((Test-Path (Join-Path $RootPath 'pyrightconfig.json')) -or $pyproject.Contains('[tool.pyright]')) -and (Get-Command pyright -ErrorAction SilentlyContinue)) {
        Invoke-ExternalCheck -Stack 'python' -Check 'typecheck' -Executable 'pyright' -Arguments @()
    }
    elseif (($pyproject.Contains('[tool.mypy]') -or (Test-Path (Join-Path $RootPath 'mypy.ini'))) -and (Get-Command mypy -ErrorAction SilentlyContinue)) {
        Invoke-ExternalCheck -Stack 'python' -Check 'typecheck' -Executable 'mypy' -Arguments @('.')
    }
    else {
        Add-Result -Stack 'python' -Check 'typecheck' -Status 'skip' -Command '' -Reason 'No configured Python typechecker found.'
    }

    if (($pyproject.Contains('[tool.ruff]') -or (Test-Path (Join-Path $RootPath 'ruff.toml'))) -and (Get-Command ruff -ErrorAction SilentlyContinue)) {
        Invoke-ExternalCheck -Stack 'python' -Check 'lint' -Executable 'ruff' -Arguments @('check', '.')
    }
    else {
        Add-Result -Stack 'python' -Check 'lint' -Status 'skip' -Command '' -Reason 'No configured ruff install found.'
    }

    $hasPytestSignal = $pyproject.Contains('[tool.pytest.ini_options]') -or
        (Test-Path (Join-Path $RootPath 'pytest.ini')) -or
        (Test-Path (Join-Path $RootPath 'tests'))

    if ($hasPytestSignal -and (Get-Command pytest -ErrorAction SilentlyContinue)) {
        Invoke-ExternalCheck -Stack 'python' -Check 'test' -Executable 'pytest' -Arguments @()
    }
    else {
        Add-Result -Stack 'python' -Check 'test' -Status 'skip' -Command '' -Reason 'No configured pytest runner found.'
    }
}

function Run-RustChecks {
    Invoke-ExternalCheck -Stack 'rust' -Check 'typecheck' -Executable 'cargo' -Arguments @('check', '--all-targets')

    if (Get-Command cargo-clippy -ErrorAction SilentlyContinue) {
        Invoke-ExternalCheck -Stack 'rust' -Check 'lint' -Executable 'cargo' -Arguments @('clippy', '--all-targets', '--all-features', '--', '-D', 'warnings')
    }
    else {
        Add-Result -Stack 'rust' -Check 'lint' -Status 'skip' -Command '' -Reason 'cargo-clippy is not installed.'
    }

    Invoke-ExternalCheck -Stack 'rust' -Check 'test' -Executable 'cargo' -Arguments @('test')
}

function Run-GoChecks {
    Invoke-ExternalCheck -Stack 'go' -Check 'typecheck' -Executable 'go' -Arguments @('vet', './...')

    if (Get-Command gofmt -ErrorAction SilentlyContinue) {
        Push-Location $resolvedRoot
        try {
            $gofmtOutput = & gofmt -l .
            $exitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
        }
        finally {
            Pop-Location
        }

        if ($exitCode -ne 0) {
            Add-Result -Stack 'go' -Check 'lint' -Status 'fail' -Command 'gofmt -l .' -ExitCode $exitCode
        }
        elseif ($gofmtOutput) {
            Add-Result -Stack 'go' -Check 'lint' -Status 'fail' -Command 'gofmt -l .' -Reason ("Files need formatting: {0}" -f (($gofmtOutput | ForEach-Object { $_.ToString().Trim() }) -join ', '))
        }
        else {
            Add-Result -Stack 'go' -Check 'lint' -Status 'pass' -Command 'gofmt -l .'
        }
    }
    else {
        Add-Result -Stack 'go' -Check 'lint' -Status 'skip' -Command '' -Reason 'gofmt is not installed.'
    }

    Invoke-ExternalCheck -Stack 'go' -Check 'test' -Executable 'go' -Arguments @('test', './...')
}

foreach ($stack in @($stackInfo.stacks)) {
    switch ($stack.name) {
        'node'   { Run-NodeChecks -RootPath $resolvedRoot -PackageManager $stack.packageManager }
        'python' { Run-PythonChecks -RootPath $resolvedRoot }
        'rust'   { Run-RustChecks }
        'go'     { Run-GoChecks }
    }
}

$summary = [pscustomobject]@{
    root = $resolvedRoot
    primary = $stackInfo.primary
    stacks = @($stackInfo.stacks | ForEach-Object { $_.name })
    results = @($results)
}

if ($Json) {
    $summary | ConvertTo-Json -Depth 6
}
else {
    Write-Host ("Quality checks for: {0}" -f $resolvedRoot)
    Write-Host ("Primary stack: {0}" -f $stackInfo.primary)
    Write-Host ("Detected stacks: {0}" -f ((@($stackInfo.stacks | ForEach-Object { $_.name }) -join ', ')))
    foreach ($result in $results) {
        $status = $result.status.ToUpperInvariant()
        $line = "[{0}] {1}/{2}" -f $status, $result.stack, $result.check
        if ($result.command) {
            $line += " :: $($result.command)"
        }
        if ($result.reason) {
            $line += " :: $($result.reason)"
        }
        Write-Host $line
    }
}

if ($results.Count -eq 0) {
    Write-Warning 'No supported stack detected. Nothing was checked.'
    exit 0
}

$failed = @($results | Where-Object { $_.status -eq 'fail' })
if ($failed.Count -gt 0) {
    exit 1
}

exit 0
