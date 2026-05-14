# Agent System Sync Check
# Diffs _agent-system (source of truth) against product and ClawNet copies
# Run: .\sync-check.ps1 -All        (check both targets)
#      .\sync-check.ps1 -Product    (check product only)
#      .\sync-check.ps1 -ClawNet    (check ClawNet only)

param(
    [switch]$Product,
    [switch]$ClawNet,
    [switch]$All
)

$source = "C:\Users\Josh\Desktop\GitHub\_agent-system"
$productTarget = "C:\Users\Josh\Desktop\GitHub\repo-ops-starter-pack\orchestration"
$clawnetTarget = "C:\Users\Josh\Desktop\GitHub\claw-net\_agent-system"

# Files to sync (core system files only — not logs, checkpoints, or history)
$syncFiles = @(
    "orchestrator-prompt.md", "orchestrator-reference.md",
    "task-agent-prompt.md", "task-agent-reference.md",
    "work-agent-prompt.md",
    "idea-discussion-prompt.md", "idea-discussion-reference.md",
    "START-ORCHESTRATOR.md", "START-TASK-AGENT.md",
    "START-WORK-AGENT.md", "START-IDEA-CHAT.md",
    "QUICK-START.md", "HOW-IT-WORKS.md", "CUSTOMIZATION.md",
    "README.md", "prompt-smoke-tests.md",
    "task-packet-template.md", "handoff-template.md",
    "chat-migration-template.md", "proposal-roadmap.md",
    ".claude\agents\orchestrator.md",
    ".claude\agents\task-agent.md",
    ".claude\agents\work-agent.md",
    "checkpoints\TEMPLATE.md"
)

if (-not $Product -and -not $ClawNet -and -not $All) { $All = $true }
if ($All) { $Product = $true; $ClawNet = $true }

function Compare-Target {
    param($TargetName, $TargetPath)
    
    if (-not (Test-Path $TargetPath)) {
        Write-Host "`n  $TargetName : NOT FOUND at $TargetPath" -ForegroundColor Red
        return
    }
    
    $diverged = @()
    $missing = @()
    $identical = 0
    
    foreach ($file in $syncFiles) {
        $srcFile = Join-Path $source $file
        $tgtFile = Join-Path $TargetPath $file
        
        if (-not (Test-Path $srcFile)) { continue }
        
        if (-not (Test-Path $tgtFile)) {
            $missing += $file
            continue
        }
        
        $srcHash = (Get-FileHash $srcFile -Algorithm MD5).Hash
        $tgtHash = (Get-FileHash $tgtFile -Algorithm MD5).Hash
        
        if ($srcHash -ne $tgtHash) {
            $diverged += $file
        } else {
            $identical++
        }
    }
    
    Write-Host "`n  === $TargetName ===" -ForegroundColor Cyan
    Write-Host "  Identical: $identical files"
    
    if ($diverged.Count -gt 0) {
        Write-Host "  DIVERGED ($($diverged.Count)):" -ForegroundColor Yellow
        foreach ($f in $diverged) {
            Write-Host "    * $f" -ForegroundColor Yellow
        }
    }
    
    if ($missing.Count -gt 0) {
        Write-Host "  MISSING ($($missing.Count)):" -ForegroundColor Red
        foreach ($f in $missing) {
            Write-Host "    - $f" -ForegroundColor Red
        }
    }
    
    if ($diverged.Count -eq 0 -and $missing.Count -eq 0) {
        Write-Host "  All files in sync!" -ForegroundColor Green
    }
}

Write-Host "`nAgent System Sync Check" -ForegroundColor White
Write-Host "Source: $source"

if ($Product) { Compare-Target "Product (repo-ops)" $productTarget }
if ($ClawNet) { Compare-Target "ClawNet" $clawnetTarget }

Write-Host ""
