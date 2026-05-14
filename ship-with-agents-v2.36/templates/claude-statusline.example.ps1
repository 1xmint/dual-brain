$inputJson = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($inputJson)) {
    exit 0
}

$data = $inputJson | ConvertFrom-Json

$model = if ($data.model.display_name) { $data.model.display_name } else { "?" }
$effort = if ($data.effort.level) { $data.effort.level } else { "n/a" }
$session = if ($data.session_name) { $data.session_name } elseif ($data.session_id) { $data.session_id.Substring(0, [Math]::Min(8, $data.session_id.Length)) } else { "unnamed" }
$pct = if ($null -ne $data.context_window.used_percentage) { [int][math]::Floor([double]$data.context_window.used_percentage) } else { 0 }
$window = if ($data.context_window.context_window_size) { $data.context_window.context_window_size } else { 0 }
$style = if ($data.output_style.name) { $data.output_style.name } else { "default" }

function Get-LaneColor {
    param([string] $Name)

    if ([string]::IsNullOrWhiteSpace($Name)) { return "`e[0m" }

    switch -Regex ($Name) {
        '^h' { return "`e[96m" }
        '^s' { return "`e[95m" }
        '^m' { return "`e[93m" }
        '^a|^w' { return "`e[92m" }
        '^b' { return "`e[38;5;208m" }
        default { return "`e[94m" }
    }
}

$reset = "`e[0m"
$laneColor = Get-LaneColor -Name $session

Write-Output "${laneColor}[$session]${reset} $model | effort:$effort | ctx:${pct}%/$window | style:$style"
