param(
    [Parameter(Mandatory = $true)]
    [string] $TargetRepo
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$targetRoot = (Resolve-Path -LiteralPath $TargetRepo).Path
$vendorRoot = Join-Path $targetRoot '_agent-system'
$localRoot = Join-Path $targetRoot '_agent-system-local'
$runtimeRoot = Join-Path $targetRoot '_agent-system-runtime'

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$passes = New-Object System.Collections.Generic.List[string]

function Add-Pass([string] $Message) { $script:passes.Add($Message) }
function Add-Warn([string] $Message) { $script:warnings.Add($Message) }
function Add-Fail([string] $Message) { $script:failures.Add($Message) }

function Test-ActiveMapHealth {
    param(
        [string] $MapPath
    )

    if (-not (Test-Path -LiteralPath $MapPath -PathType Leaf)) {
        return
    }

    $content = Get-Content -Path $MapPath -Raw

    if ($content -match 'Last verified:\s*`?<YYYY-MM-DD') {
        Add-Warn "Active chat map still has placeholder Last verified line: $MapPath"
    }

    if ($content -notmatch 'display name:' -or $content -notmatch 'routing id:') {
        Add-Warn "Active chat map does not yet separate display name and routing id clearly: $MapPath"
    }

    $inActiveChildSection = $false
    foreach ($line in Get-Content -Path $MapPath) {
        if ($line -match '^## Active Child Chats') {
            $inActiveChildSection = $true
            continue
        }

        if ($inActiveChildSection -and $line -match '^## ') {
            $inActiveChildSection = $false
        }

        if ($inActiveChildSection -and $line -match 'state:\s*`?closed`?') {
            Add-Warn "Closed row still present inside Active Child Chats: $MapPath"
            break
        }
    }
}

function Test-OptionalRuntimeFiles {
    param(
        [string[]] $Paths
    )

    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Runtime helper file present: $path"
        }
        else {
            Add-Warn "Missing runtime helper file: $path"
        }
    }
}

function Test-LiveVendorFiles {
    param(
        [string] $Directory,
        [string[]] $AllowedNames
    )

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return
    }

    $liveFiles = Get-ChildItem -LiteralPath $Directory -File | Where-Object {
        $AllowedNames -notcontains $_.Name
    }

    foreach ($file in $liveFiles) {
        Add-Warn "Live-looking file inside vendor layer: $($file.FullName)"
    }
}

function Get-MeaningfulMarkdownFiles {
    param(
        [string] $Directory
    )

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return @()
    }

    return @(Get-ChildItem -LiteralPath $Directory -File -Filter *.md | Where-Object {
        $_.Name -notin @('README.md', 'TEMPLATE.md')
    })
}

function Test-CheckpointContinuityHealth {
    param(
        [string] $CheckpointDir,
        [string] $CloseoutDir
    )

    $requiredFields = @(
        'Last verified at:',
        'Freshness window:',
        'Terminal status:',
        'Pickup confidence:',
        'Resume risk:',
        'Closeout packet needed:',
        'Lane state if stopping now:'
    )

    foreach ($file in Get-MeaningfulMarkdownFiles -Directory $CheckpointDir) {
        $content = Get-Content -LiteralPath $file.FullName -Raw
        $missingFields = @($requiredFields | Where-Object { $content -notmatch [regex]::Escape($_) })

        if ($missingFields.Count -gt 0) {
            Add-Warn ("Checkpoint missing continuity field(s): {0} -> {1}" -f $file.FullName, ($missingFields -join ', '))
        }

        if ($content -match '(?im)^Closeout packet needed:\s*(yes|probably later)\b') {
            $expectedCloseout = Join-Path $CloseoutDir $file.Name
            if (-not (Test-Path -LiteralPath $expectedCloseout -PathType Leaf)) {
                Add-Warn "Checkpoint says closeout packet is needed but closeout file is missing: $expectedCloseout"
            }
        }
    }
}

function Test-CloseoutContinuityHealth {
    param(
        [string] $CloseoutDir
    )

    $requiredFields = @(
        'Lane state action:',
        'Active-workstreams action:',
        'Active-chat-map action:',
        'Expected next session:'
    )

    foreach ($file in Get-MeaningfulMarkdownFiles -Directory $CloseoutDir) {
        $content = Get-Content -LiteralPath $file.FullName -Raw
        $missingFields = @($requiredFields | Where-Object { $content -notmatch [regex]::Escape($_) })

        if ($missingFields.Count -gt 0) {
            Add-Warn ("Closeout missing lane-state cleanup field(s): {0} -> {1}" -f $file.FullName, ($missingFields -join ', '))
        }
    }
}

function Test-NamingSchemaHealth {
    param(
        [string] $VendorRoot,
        [string] $ClaudeAgentsRoot
    )

    $schemaPath = Join-Path $VendorRoot 'NAMING-SCHEMA.md'
    if (Test-Path -LiteralPath $schemaPath -PathType Leaf) {
        Add-Pass "Naming schema present: $schemaPath"
    }
    else {
        Add-Fail "Missing naming schema: $schemaPath"
    }

    $legacyPatterns = @(
        'h<N>',
        's<N>',
        's<N>-<workstream>',
        'a<N>-<workstream>',
        '-r<N>',
        '\.<N>',
        '(?<![A-Za-z0-9_-])s\d+(?:-[a-z0-9][a-z0-9-]*)+(?:-r\d+)?(?:\.\d+)?(?![A-Za-z0-9_-])',
        '(?<![A-Za-z0-9_-])a\d+(?:-[a-z0-9][a-z0-9-]*)+(?:-r\d+)?(?:\.\d+)?(?![A-Za-z0-9_-])',
        '(?<![A-Za-z0-9_-])h\d+r\d+(?:\.\d+)?(?![A-Za-z0-9_-])',
        '(?<![A-Za-z0-9_-])b\d+r\d+(?:\.\d+)?(?![A-Za-z0-9_-])'
    )
    $legacyBuyerTitlePattern = '(?<![A-Za-z0-9_-])(Head|Manager|Supervisor|Doctor|Agent|Brainstorm|Worker)\d+\s+-'

    $docsToScan = @(
        (Join-Path $VendorRoot 'ACTIVE-CHAT-MAP.md'),
        (Join-Path $VendorRoot 'ACTIVE-MAP-HYGIENE.md'),
        (Join-Path $VendorRoot 'DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md'),
        (Join-Path $VendorRoot 'HUMAN-FRIENDLY-NAMING-GATE.md'),
        (Join-Path $VendorRoot 'HOW-IT-WORKS.md'),
        (Join-Path $VendorRoot 'NAMING-SCHEMA.md'),
        (Join-Path $VendorRoot 'ROUTING-MATRIX.md'),
        (Join-Path $VendorRoot 'START-BRAINSTORM.md'),
        (Join-Path $VendorRoot 'START-DOCTOR.md'),
        (Join-Path $VendorRoot 'START-HEAD.md'),
        (Join-Path $VendorRoot 'START-MANAGER.md'),
        (Join-Path $VendorRoot 'START-SUPER.md'),
        (Join-Path $VendorRoot 'START-AGENT.md'),
        (Join-Path $VendorRoot 'START-WORKER.md'),
        (Join-Path $VendorRoot 'agent-prompt.md'),
        (Join-Path $VendorRoot 'agent-reference.md'),
        (Join-Path $VendorRoot 'head-prompt.md'),
        (Join-Path $VendorRoot 'manager-prompt.md'),
        (Join-Path $VendorRoot 'super-prompt.md'),
        (Join-Path $ClaudeAgentsRoot 'head.md'),
        (Join-Path $ClaudeAgentsRoot 'manager.md'),
        (Join-Path $ClaudeAgentsRoot 'super.md'),
        (Join-Path $ClaudeAgentsRoot 'agent.md'),
        (Join-Path $ClaudeAgentsRoot 'doctor.md')
    )

    foreach ($path in $docsToScan) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            continue
        }

        $content = Get-Content -LiteralPath $path -Raw
        $hasLegacyCompactNaming = $false

        foreach ($pattern in $legacyPatterns) {
            if ([System.Text.RegularExpressions.Regex]::IsMatch(
                $content,
                $pattern,
                [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
            )) {
                $hasLegacyCompactNaming = $true
                break
            }
        }

        $skipCompactWarning = [System.IO.Path]::GetFileName($path) -eq 'DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md'

        if ((-not $skipCompactWarning) -and $hasLegacyCompactNaming) {
            Add-Warn "Legacy compact naming still present in shipped guidance: $path"
        }

        if ([System.Text.RegularExpressions.Regex]::IsMatch(
            $content,
            $legacyBuyerTitlePattern,
            [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
        )) {
            Add-Warn "Legacy numbered buyer-facing title still present in shipped guidance: $path"
        }
    }
}

function Test-HookHealthSettings {
    param(
        [string] $SettingsPath
    )

    if (-not (Test-Path -LiteralPath $SettingsPath -PathType Leaf)) {
        Add-Fail "Missing Claude settings hook layer: $SettingsPath"
        return
    }

    Add-Pass "Claude settings present: $SettingsPath"

    $content = Get-Content -LiteralPath $SettingsPath -Raw
    if ($content -match '"Stop"' -and $content -match '"SubagentStop"' -and $content -match 'false-done or false-idle') {
        Add-Pass "Hook settings contain stop-gate health protections: $SettingsPath"
    }
    else {
        Add-Warn "Hook settings missing expected stop-gate health protections: $SettingsPath"
    }
}

if (Test-Path -LiteralPath (Join-Path $targetRoot 'AGENTS.md') -PathType Leaf) {
    Add-Pass 'AGENTS.md found'
}
else {
    Add-Fail 'Missing AGENTS.md in repo root'
}

if (Test-Path -LiteralPath (Join-Path $targetRoot 'CLAUDE.md') -PathType Leaf) {
    Add-Pass 'CLAUDE.md found'
}
else {
    Add-Warn 'Missing CLAUDE.md in repo root'
}

$orchestrationInstalled = Test-Path -LiteralPath $vendorRoot -PathType Container

if ($orchestrationInstalled) {
    Add-Pass '_agent-system/ found'

    foreach ($path in @(
        (Join-Path $vendorRoot 'OPERATOR-ORCHESTRATION-PROFILE.md'),
        (Join-Path $vendorRoot 'REPO-SCOPE-GATE.md'),
        (Join-Path $vendorRoot 'ROLE-TO-LANE-ELASTICITY.md'),
        (Join-Path $vendorRoot 'ADAPTIVE-ROUTING-LADDER.md'),
        (Join-Path $vendorRoot 'EXECUTION-OWNER-REUSE-GATE.md'),
        (Join-Path $vendorRoot 'HEAD-DECISION-RUBRIC.md'),
        (Join-Path $vendorRoot 'MANAGER-SUPER-AUDIT-RUBRIC.md'),
        (Join-Path $vendorRoot 'TOP-CHAIN-ANTI-PATTERNS.md'),
        (Join-Path $vendorRoot 'HEAD-MANAGER-SCOREBOARD.md'),
        (Join-Path $vendorRoot 'EXECUTION-COMPLETION-TO-CLOSEOUT-PROTOCOL.md'),
        (Join-Path $vendorRoot 'TERMINAL-REPORT-CONVERSION-RULE.md'),
        (Join-Path $vendorRoot 'BUDGET-AND-SUBSCRIPTION-ROUTING.md'),
        (Join-Path $vendorRoot 'USER-SUPPORT-PROFILE.md'),
        (Join-Path $vendorRoot 'SUPPORT-POSTURE-GATE.md'),
        (Join-Path $vendorRoot 'DOCTOR-NOTE-PROTOCOL.md'),
        (Join-Path $vendorRoot 'ADAPTIVE-EXPLANATION-GATE.md'),
        (Join-Path $vendorRoot 'USER-CONFIDENCE-MODEL.md'),
        (Join-Path $vendorRoot 'LANE.md'),
        (Join-Path $vendorRoot 'GUIDED-TAIL-PATTERNS.md'),
        (Join-Path $vendorRoot 'BUYER-HANDHOLDING-COMPLETION-RULE.md'),
        (Join-Path $vendorRoot 'PARENT-PICKUP-HANDHOLDING-RULE.md'),
        (Join-Path $vendorRoot 'SURFACE-AND-EFFORT-DISCLOSURE-RULE.md'),
        (Join-Path $vendorRoot 'CONTINUE-UNLESS-REAL-BOUNDARY-RULE.md'),
        (Join-Path $vendorRoot 'OBVIOUS-NEXT-STEP-AUTONOMY-GATE.md'),
        (Join-Path $vendorRoot 'LAUNCH.md'),
        (Join-Path $vendorRoot 'WRONG-LANE-INPUT-GATE.md'),
        (Join-Path $vendorRoot 'MINIMAL-REPAIR-NOTE-RULE.md'),
        (Join-Path $vendorRoot 'RESULT-RETURN-SIMPLIFICATION-RULE.md'),
        (Join-Path $vendorRoot 'THREAD-ADOPTION-CONFIRMATION-GATE.md'),
        (Join-Path $vendorRoot 'SELF-REGISTRATION-GATE.md'),
        (Join-Path $vendorRoot 'AGENT-FRESHNESS-REUSE-GATE.md'),
        (Join-Path $vendorRoot 'PLUGIN-AWARENESS-GATE.md'),
        (Join-Path $vendorRoot 'PLUGIN-INVENTORY.md'),
        (Join-Path $vendorRoot 'PLUGIN-FIT-MATRIX.md'),
        (Join-Path $vendorRoot 'PLUGIN-OPTIONALITY-RULE.md'),
        (Join-Path $vendorRoot 'PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md'),
        (Join-Path $vendorRoot 'PLUGIN-PORTABILITY-GATE.md'),
        (Join-Path $vendorRoot 'RUNTIME-MAIL-PROTOCOL.md'),
        (Join-Path $vendorRoot 'DONE-ABSORPTION-RULE.md'),
        (Join-Path $vendorRoot 'FAN-IN-SYNTHESIS-RULE.md'),
        (Join-Path $vendorRoot 'MAILBOX-STATE-MODEL.md'),
        (Join-Path $vendorRoot 'COORDINATION-COST-GATE.md'),
        (Join-Path $vendorRoot 'CANONICAL-PACKET-MINIMIZATION-RULE.md'),
        (Join-Path $vendorRoot 'FAST-PATH-VS-TEACHING-PATH-RULE.md'),
        (Join-Path $vendorRoot 'TRUTH-BEFORE-ASSUMPTION.md'),
        (Join-Path $vendorRoot 'RUNTIME-TERM-SEPARATION-RULE.md'),
        (Join-Path $vendorRoot 'CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md'),
        (Join-Path $vendorRoot 'SURFACE-RUNTIME-TERM-MATRIX.md'),
        (Join-Path $vendorRoot 'MISSION-LOCK-GATE.md'),
        (Join-Path $vendorRoot 'ADJACENT-WORKSTREAM-AWARENESS-GATE.md'),
        (Join-Path $vendorRoot 'INTERNET-AWARENESS-GATE.md'),
        (Join-Path $vendorRoot 'RESEARCH-FRESHNESS-LADDER.md'),
        (Join-Path $vendorRoot 'SOURCE-TIER-POLICY.md'),
        (Join-Path $vendorRoot 'BIG-PICTURE-SCOUT-PASS.md'),
        (Join-Path $vendorRoot 'SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md'),
        (Join-Path $vendorRoot 'WEB-CAPABLE-LANE-ROUTING.md'),
        (Join-Path $vendorRoot 'EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md'),
        (Join-Path $vendorRoot 'INTENT-COMPILER.md'),
        (Join-Path $vendorRoot 'VISUALIZATION-DECISION-GATE.md'),
        (Join-Path $vendorRoot 'PRESENTATION-MODE-LADDER.md'),
        (Join-Path $vendorRoot 'VIBE-CODING-TRANSLATOR.md'),
        (Join-Path $vendorRoot 'CHUNK-MAP-PROTOCOL.md'),
        (Join-Path $vendorRoot 'DESKTOP-APP-AFFORDANCE-GATE.md'),
        (Join-Path $vendorRoot 'SMART-NEXT-STEP-FRAMING.md'),
        (Join-Path $vendorRoot 'SYSTEM-WORLD-MODEL.md'),
        (Join-Path $vendorRoot 'WORKSTREAM-DEPENDENCY-GRAPH.md'),
        (Join-Path $vendorRoot 'CROSS-WORKSTREAM-CONTRACTS.md'),
        (Join-Path $vendorRoot 'NEIGHBOR-AWARENESS-CAPSULE.md'),
        (Join-Path $vendorRoot 'CHANGE-EVENT-SCHEMA.md'),
        (Join-Path $vendorRoot 'WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md'),
        (Join-Path $vendorRoot 'REPLAN-TRIGGER-GATE.md'),
        (Join-Path $vendorRoot 'ATTENTION-ROUTING-ENGINE.md'),
        (Join-Path $vendorRoot 'SYSTEM-STORY-DIGEST.md'),
        (Join-Path $vendorRoot 'CONFLICT-RADAR.md'),
        (Join-Path $vendorRoot 'OPPORTUNITY-RADAR.md'),
        (Join-Path $vendorRoot 'TOP-CHAIN-SYNTHESIS-LOOP.md'),
        (Join-Path $vendorRoot 'LIVE-HYDRATION-BOOTSTRAP.md'),
        (Join-Path $vendorRoot 'DOCTOR-PLAYBOOK.md'),
        (Join-Path $vendorRoot 'DOCTOR-FINDING-SCHEMA.md'),
        (Join-Path $vendorRoot 'DOCTOR-SEVERITY-MODEL.md'),
        (Join-Path $vendorRoot 'DOCTOR-OBSERVABILITY-LAYER.md'),
        (Join-Path $vendorRoot 'DOCTOR-SWEEP-PROTOCOL.md'),
        (Join-Path $vendorRoot 'DOCTOR-CONTROL-PLANE-DASHBOARD.md'),
        (Join-Path $vendorRoot 'TURN-OUTCOME-EVENT-SCHEMA.md'),
        (Join-Path $vendorRoot 'EVIDENCE-RETENTION-RULE.md'),
        (Join-Path $vendorRoot 'OBSERVABILITY-METRICS-MODEL.md'),
        (Join-Path $vendorRoot 'LANE.md'),
        (Join-Path $vendorRoot 'UNRESOLVED-ISSUES-REGISTER.md'),
        (Join-Path $vendorRoot 'ORPHAN-LANE-DETECTOR.md'),
        (Join-Path $vendorRoot 'STATE-FRESHNESS-SLA.md'),
        (Join-Path $vendorRoot 'TURN-EVENT-CAPTURE-POLICY.md'),
        (Join-Path $vendorRoot 'FRUSTRATION-RESOLUTION-PROTOCOL.md'),
        (Join-Path $vendorRoot 'CROSS-LANE-AWARENESS-RULE.md'),
        (Join-Path $vendorRoot 'IDENTITY-DISCIPLINE.md'),
        (Join-Path $vendorRoot 'STARTUP-SELF-CHECK-GATE.md'),
        (Join-Path $vendorRoot 'WORKSTREAM-STORY-MODEL.md'),
        (Join-Path $vendorRoot 'LIFECYCLE-REPAIR-PROTOCOL.md'),
        (Join-Path $vendorRoot 'STRATEGIC-FOUNDATION-GATE.md'),
        (Join-Path $vendorRoot 'ORCHESTRATION-HEALTH-MODEL.md'),
        (Join-Path $vendorRoot 'ORCHESTRATION-DASHBOARD.md'),
        (Join-Path $vendorRoot 'ORCHESTRATION-STATE-CONSISTENCY.md'),
        (Join-Path $vendorRoot 'LINEAGE-AND-PROGRESSION-MODEL.md'),
        (Join-Path $vendorRoot 'REVIEW-STATE-MACHINE.md'),
        (Join-Path $vendorRoot 'BUYER-STEERING-VS-BUYER-LABOR-GATE.md'),
        (Join-Path $vendorRoot 'RECOMMENDATION-FIRST-OUTPUT-CONTRACT.md'),
        (Join-Path $vendorRoot 'DEFAULT-RECOMMENDATION-RESOLUTION-RULE.md'),
        (Join-Path $vendorRoot 'REVIEW-CELL-STATE-REGISTRY.md'),
        (Join-Path $vendorRoot 'EXECUTABLE-HANDOFF-BRIDGE-RULE.md'),
        (Join-Path $vendorRoot 'PASSIVE-ROUTING-VS-ACTIVE-PICKUP-PROTOCOL.md'),
        (Join-Path $vendorRoot 'DUAL-BRAIN-COMMIT-PROTOCOL.md'),
        (Join-Path $vendorRoot 'MULTI-BRAIN-TOPOLOGY.md'),
        (Join-Path $vendorRoot 'TRI-BRAIN-DIVERSITY-GATE.md'),
        (Join-Path $vendorRoot 'PROVIDER-ROLE-BINDING-MATRIX.md'),
        (Join-Path $vendorRoot 'DISPLAY-NAME-AND-ROUTING-ID-SEPARATION.md'),
        (Join-Path $vendorRoot 'ROTATION-THRESHOLD-GATE.md'),
        (Join-Path $vendorRoot 'LIVE-STATE-POPULATION-PROTOCOL.md'),
        (Join-Path $vendorRoot 'WORKSTREAM-CELL-REGISTRY.md'),
        (Join-Path $vendorRoot 'CHUNK-TRACKING-RULE.md'),
        (Join-Path $vendorRoot 'HEAD-MANAGER-CONTROL-PLANE-LOOP.md'),
        (Join-Path $vendorRoot 'LEGACY-LIVE-ID-MIGRATION.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Doctor doc present: $path"
        }
        else {
            Add-Fail "Missing doctor doc: $path"
        }
    }

    foreach ($path in @($localRoot, $runtimeRoot)) {
        if (Test-Path -LiteralPath $path -PathType Container) {
            Add-Pass "Found $path"
        }
        else {
            Add-Fail "Missing required folder: $path"
        }
    }

    foreach ($path in @(
        (Join-Path $runtimeRoot 'ACTIVE-WORKSTREAMS.md'),
        (Join-Path $runtimeRoot 'slices'),
        (Join-Path $runtimeRoot 'reviews'),
        (Join-Path $runtimeRoot 'checkpoints'),
        (Join-Path $runtimeRoot 'checkpoint-events'),
        (Join-Path $runtimeRoot 'closeouts'),
        (Join-Path $runtimeRoot 'health'),
        (Join-Path $runtimeRoot 'lanes'),
        (Join-Path $runtimeRoot 'observability'),
        (Join-Path $runtimeRoot 'lanes\README.md'),
        (Join-Path $runtimeRoot 'checkpoint-events\README.md'),
        (Join-Path $runtimeRoot 'closeouts\README.md'),
        (Join-Path $runtimeRoot 'health\README.md'),
        (Join-Path $runtimeRoot 'health\DASHBOARD.md'),
        (Join-Path $runtimeRoot 'health\summary.json'),
        (Join-Path $runtimeRoot 'health\workstreams.json'),
        (Join-Path $runtimeRoot 'observability\README.md'),
        (Join-Path $runtimeRoot 'observability\turn-events.jsonl'),
        (Join-Path $runtimeRoot 'observability\impact-events.jsonl'),
        (Join-Path $runtimeRoot 'observability\evidence.md'),
        (Join-Path $runtimeRoot 'observability\metrics.json'),
        (Join-Path $runtimeRoot 'observability\mail-events.jsonl'),
        (Join-Path $runtimeRoot 'observability\mailbox-state.json'),
        (Join-Path $runtimeRoot 'observability\heartbeats.json'),
        (Join-Path $runtimeRoot 'observability\lane-awareness.json'),
        (Join-Path $runtimeRoot 'observability\unresolved-issues.json'),
        (Join-Path $runtimeRoot 'observability\doctor-dashboard.md'),
        (Join-Path $runtimeRoot 'logs'),
        (Join-Path $runtimeRoot 'archive'),
        (Join-Path $runtimeRoot 'updates'),
        (Join-Path $runtimeRoot 'updates\inbox'),
        (Join-Path $runtimeRoot 'mail'),
        (Join-Path $runtimeRoot 'mail\inbox'),
        (Join-Path $runtimeRoot 'workstreams'),
        (Join-Path $runtimeRoot 'workstreams\README.md'),
        (Join-Path $runtimeRoot 'workstreams\system-story.md'),
        (Join-Path $runtimeRoot 'workstreams\neighbor-digest.json'),
        (Join-Path $runtimeRoot 'updates\UPDATE-FEED.md'),
        (Join-Path $runtimeRoot 'updates\UPDATE-INDEX.md'),
        (Join-Path $runtimeRoot 'updates\UPDATE-WATERMARKS.md')
    )) {
        if (Test-Path -LiteralPath $path) {
            Add-Pass "Runtime path present: $path"
        }
        else {
            Add-Fail "Missing runtime path: $path"
        }
    }

    Test-OptionalRuntimeFiles -Paths @(
        (Join-Path $runtimeRoot 'checkpoint-events\TEMPLATE.md'),
        (Join-Path $runtimeRoot 'closeouts\TEMPLATE.md'),
        (Join-Path $runtimeRoot 'updates\README.md'),
        (Join-Path $runtimeRoot 'updates\inbox\README.md'),
        (Join-Path $runtimeRoot 'updates\inbox\TEMPLATE.md'),
        (Join-Path $runtimeRoot 'mail\README.md'),
        (Join-Path $runtimeRoot 'mail\inbox\README.md'),
        (Join-Path $runtimeRoot 'mail\inbox\TEMPLATE.md')
    )

    foreach ($path in @(
        (Join-Path $localRoot 'INSTALL-CONFIG.md'),
        (Join-Path $localRoot 'ENABLED-MODULES.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Local config present: $path"
        }
        else {
            Add-Warn "Missing local config file: $path"
        }
    }

    $operatorPreferencesPath = Join-Path $localRoot 'OPERATOR-PREFERENCES.md'
    if (Test-Path -LiteralPath $operatorPreferencesPath -PathType Leaf) {
        Add-Pass "Local preference memory present: $operatorPreferencesPath"
    }
    else {
        Add-Warn "Missing local preference memory: $operatorPreferencesPath"
    }

    foreach ($path in @(
        (Join-Path $vendorRoot 'SURFACE-CAPABILITY-PROFILE.json'),
        (Join-Path $targetRoot '.claude\settings.json'),
        (Join-Path $targetRoot '.claude\agents\head.md'),
        (Join-Path $targetRoot '.claude\agents\doctor.md'),
        (Join-Path $targetRoot '.claude\agents\super.md'),
        (Join-Path $targetRoot '.claude\agents\agent.md'),
        (Join-Path $targetRoot '.claude\agents\worker.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Claude agent present: $path"
        }
        else {
            Add-Warn "Missing Claude agent definition: $path"
        }
    }

    foreach ($path in @(
        (Join-Path $targetRoot '.claude\commands\read-inbox.md'),
        (Join-Path $targetRoot '.claude\commands\sync-lane.md'),
        (Join-Path $targetRoot '.claude\commands\resolve-identity.md'),
        (Join-Path $targetRoot '.claude\commands\startup-self-check.md'),
        (Join-Path $targetRoot '.claude\commands\broker-lane.md'),
        (Join-Path $targetRoot '.claude\commands\assess-foundation.md'),
        (Join-Path $targetRoot '.claude\commands\assess-health.md'),
        (Join-Path $targetRoot '.claude\commands\assess-momentum.md'),
        (Join-Path $targetRoot '.claude\commands\assess-fanout.md'),
        (Join-Path $targetRoot '.claude\commands\assess-review-topology.md'),
        (Join-Path $targetRoot '.claude\commands\assess-review-state.md'),
        (Join-Path $targetRoot '.claude\commands\assess-context-purity.md'),
        (Join-Path $targetRoot '.claude\commands\assess-provider-mix.md'),
        (Join-Path $targetRoot '.claude\commands\assess-support-posture.md'),
        (Join-Path $targetRoot '.claude\commands\compile-intent.md'),
        (Join-Path $targetRoot '.claude\commands\choose-presentation-mode.md'),
        (Join-Path $targetRoot '.claude\commands\draw-lane-map.md'),
        (Join-Path $targetRoot '.claude\commands\draw-chunk-map.md'),
        (Join-Path $targetRoot '.claude\commands\translate-vibe-request.md'),
        (Join-Path $targetRoot '.claude\commands\trace-impact.md'),
        (Join-Path $targetRoot '.claude\commands\trace-dependencies.md'),
        (Join-Path $targetRoot '.claude\commands\refresh-system-story.md'),
        (Join-Path $targetRoot '.claude\commands\assess-conflicts.md'),
        (Join-Path $targetRoot '.claude\commands\assess-opportunities.md'),
        (Join-Path $targetRoot '.claude\commands\brief-neighbors.md'),
        (Join-Path $targetRoot '.claude\commands\draft-recommendation.md'),
        (Join-Path $targetRoot '.claude\commands\draft-doctor-note.md'),
        (Join-Path $targetRoot '.claude\commands\form-review-cell.md'),
        (Join-Path $targetRoot '.claude\commands\resolve-next-owner.md'),
        (Join-Path $targetRoot '.claude\commands\score-cell-health.md'),
        (Join-Path $targetRoot '.claude\commands\score-dual-brain-health.md'),
        (Join-Path $targetRoot '.claude\commands\choose-brain-topology.md'),
        (Join-Path $targetRoot '.claude\commands\assess-head-decision.md'),
        (Join-Path $targetRoot '.claude\commands\audit-super-review.md'),
        (Join-Path $targetRoot '.claude\commands\closeout-from-execution.md'),
        (Join-Path $targetRoot '.claude\commands\convert-completion-to-closeout.md'),
        (Join-Path $targetRoot '.claude\commands\resolve-budget-routing.md'),
        (Join-Path $targetRoot '.claude\commands\log-turn-outcome.md'),
        (Join-Path $targetRoot '.claude\commands\assess-observability.md'),
        (Join-Path $targetRoot '.claude\commands\doctor-sweep.md'),
        (Join-Path $targetRoot '.claude\commands\detect-orphan-lanes.md'),
        (Join-Path $targetRoot '.claude\commands\score-lane-awareness.md'),
        (Join-Path $targetRoot '.claude\commands\log-frustration.md'),
        (Join-Path $targetRoot '.claude\commands\resolve-frustration.md'),
        (Join-Path $targetRoot '.claude\commands\refresh-doctor-dashboard.md'),
        (Join-Path $targetRoot '.claude\commands\refresh-health-dashboard.md'),
        (Join-Path $targetRoot '.claude\commands\audit-state-consistency.md'),
        (Join-Path $targetRoot '.claude\commands\checkpoint-now.md'),
        (Join-Path $targetRoot '.claude\commands\read-mailbox.md'),
        (Join-Path $targetRoot '.claude\commands\send-runtime-mail.md'),
        (Join-Path $targetRoot '.claude\commands\absorb-completions.md'),
        (Join-Path $targetRoot '.claude\commands\synthesize-fan-in.md'),
        (Join-Path $targetRoot '.claude\commands\handoff-lane.md'),
        (Join-Path $targetRoot '.claude\commands\draft-pickup-trigger.md'),
        (Join-Path $targetRoot '.claude\commands\refresh-workstream-story.md'),
        (Join-Path $targetRoot '.claude\commands\repair-lifecycle.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Claude command present: $path"
        }
        else {
            Add-Warn "Missing Claude command: $path"
        }
    }

    foreach ($path in @(
        (Join-Path $targetRoot '.claude\commands\audit-continuity.md'),
        (Join-Path $targetRoot '.claude\commands\classify-finding.md'),
        (Join-Path $targetRoot '.claude\commands\promote-finding.md'),
        (Join-Path $targetRoot '.claude\commands\verify-propagation.md'),
        (Join-Path $targetRoot '.claude\commands\release-audit.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Doctor command present: $path"
        }
        else {
            Add-Warn "Missing doctor command: $path"
        }
    }

    foreach ($path in @(
        (Join-Path $targetRoot '.claude\rules\00-hot-path.md'),
        (Join-Path $targetRoot '.claude\rules\10-continuity.md'),
        (Join-Path $targetRoot '.claude\rules\20-collaboration.md'),
        (Join-Path $targetRoot '.claude\rules\30-health.md'),
        (Join-Path $targetRoot '.claude\rules\35-review-topology.md'),
        (Join-Path $targetRoot '.claude\rules\40-review-state.md'),
        (Join-Path $targetRoot '.claude\rules\45-observability.md'),
        (Join-Path $targetRoot '.claude\rules\50-lane-awareness.md'),
        (Join-Path $targetRoot '.claude\rules\55-top-chain.md'),
        (Join-Path $targetRoot '.claude\rules\60-budget-routing.md')
    )) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Add-Pass "Claude rule present: $path"
        }
        else {
            Add-Warn "Missing Claude rule: $path"
        }
    }

    $expectedPublicManagerLauncher = Join-Path $vendorRoot ('START-' + 'MANAGER.md')
    if (Test-Path -LiteralPath $expectedPublicManagerLauncher -PathType Leaf) {
        Add-Pass "Manager launcher present: $expectedPublicManagerLauncher"
    }
    else {
        Add-Warn "Missing manager launcher: $expectedPublicManagerLauncher"
    }

    $expectedPublicManagerAgent = Join-Path (Join-Path $targetRoot '.claude\agents') ('man' + 'ager.md')
    if (Test-Path -LiteralPath $expectedPublicManagerAgent -PathType Leaf) {
        Add-Pass "Manager Claude agent definition present: $expectedPublicManagerAgent"
    }
    else {
        Add-Warn "Missing manager Claude agent definition: $expectedPublicManagerAgent"
    }

    Test-LiveVendorFiles -Directory (Join-Path $vendorRoot 'checkpoints') -AllowedNames @('README.md', 'TEMPLATE.md')
    Test-LiveVendorFiles -Directory (Join-Path $vendorRoot 'slices') -AllowedNames @('README.md', 'TEMPLATE.md')
    Test-LiveVendorFiles -Directory (Join-Path $vendorRoot 'reviews') -AllowedNames @('README.md', 'TEMPLATE.md')
    Test-LiveVendorFiles -Directory (Join-Path $vendorRoot 'logs') -AllowedNames @('TEMPLATE.md')
    Test-ActiveMapHealth -MapPath (Join-Path $vendorRoot 'ACTIVE-CHAT-MAP.md')
    Test-CheckpointContinuityHealth -CheckpointDir (Join-Path $runtimeRoot 'checkpoints') -CloseoutDir (Join-Path $runtimeRoot 'closeouts')
    Test-CloseoutContinuityHealth -CloseoutDir (Join-Path $runtimeRoot 'closeouts')
    Test-NamingSchemaHealth -VendorRoot $vendorRoot -ClaudeAgentsRoot (Join-Path $targetRoot '.claude\agents')
    Test-HookHealthSettings -SettingsPath (Join-Path $targetRoot '.claude\settings.json')

    $activeWorkstreamsPath = Join-Path $runtimeRoot 'ACTIVE-WORKSTREAMS.md'
    if (Test-Path -LiteralPath $activeWorkstreamsPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $activeWorkstreamsPath -Raw
        if ($content -match 'chunk:' -and
            $content -match 'review\s+state:' -and
            $content -match 'recommendation\s+state:' -and
            $content -match 'next\s+owner:') {
            Add-Pass "Active workstreams carries progression and review-state shape: $activeWorkstreamsPath"
        }
        else {
            Add-Warn "Active workstreams missing progression or review-state shape: $activeWorkstreamsPath"
        }
    }

    $healthWorkstreamsPath = Join-Path $runtimeRoot 'health\workstreams.json'
    if (Test-Path -LiteralPath $healthWorkstreamsPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $healthWorkstreamsPath -Raw
        if ($content -match '"chunk"' -and
            $content -match '"reviewState"' -and
            $content -match '"recommendationState"' -and
            $content -match '"nextOwner"' -and
            $content -match '"buyerSteerRequired"') {
            Add-Pass "Health workstreams carries progression and review-state shape: $healthWorkstreamsPath"
        }
        else {
            Add-Warn "Health workstreams missing progression or review-state shape: $healthWorkstreamsPath"
        }
    }

    $healthSummaryPath = Join-Path $runtimeRoot 'health\summary.json'
    if (Test-Path -LiteralPath $healthSummaryPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $healthSummaryPath -Raw
        if ($content -match '"reviewStateDiscipline"' -and
            $content -match '"recommendationClarity"' -and
            $content -match '"observability"' -and
            $content -match '"topChainQuality"' -and
            $content -match '"budgetRouting"' -and
            $content -match '"closeoutTransitionQuality"') {
            Add-Pass "Health summary carries review-state discipline shape: $healthSummaryPath"
        }
        else {
            Add-Warn "Health summary missing review-state discipline shape: $healthSummaryPath"
        }
    }

    $observabilityMetricsPath = Join-Path $runtimeRoot 'observability\metrics.json'
    if (Test-Path -LiteralPath $observabilityMetricsPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $observabilityMetricsPath -Raw
        if ($content -match '"coverageStatus"' -and
            $content -match '"topFailurePatterns"' -and
            $content -match '"recommendedNextMove"' -and
            $content -match '"frustrationHandling"' -and
            $content -match '"frustrationResolution"' -and
            $content -match '"bridgeDiscipline"' -and
            $content -match '"topChainQuality"' -and
            $content -match '"budgetRoutingClarity"' -and
            $content -match '"closeoutTransitionQuality"' -and
            $content -match '"laneAwarenessQuality"' -and
            $content -match '"heartbeatFreshness"' -and
            $content -match '"unresolvedIssueDiscipline"' -and
            $content -match '"doctorSweepFreshness"' -and
            $content -match '"selfCorrectionDiscipline"' -and
            $content -match '"mailboxCoverage"' -and
            $content -match '"mailAbsorptionDiscipline"' -and
            $content -match '"fanInSynthesisQuality"' -and
            $content -match '"buyerRelayAvoidance"') {
            Add-Pass "Observability metrics carries expected shape: $observabilityMetricsPath"
        }
        else {
            Add-Warn "Observability metrics missing expected shape: $observabilityMetricsPath"
        }
    }

    $turnEventsPath = Join-Path $runtimeRoot 'observability\turn-events.jsonl'
    if (Test-Path -LiteralPath $turnEventsPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $turnEventsPath -Raw
        if ($content -match '"eventId"' -and
            $content -match '"deliveryMode"' -and
            $content -match '"nextOwner"' -and
            $content -match '"bridgeProvided"' -and
            $content -match '"userFrustration"' -and
            $content -match '"frustrationResolved"' -and
            $content -match '"identityResolved"' -and
            $content -match '"selfCorrectionTriggered"' -and
            $content -match '"selfCorrectionApplied"') {
            Add-Pass "Turn-event log carries expected shape: $turnEventsPath"
        }
        else {
            Add-Warn "Turn-event log missing expected shape: $turnEventsPath"
        }
    }

    $heartbeatsPath = Join-Path $runtimeRoot 'observability\heartbeats.json'
    if (Test-Path -LiteralPath $heartbeatsPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $heartbeatsPath -Raw
        if ($content -match '"heartbeatStatus"' -and
            $content -match '"lastMeaningfulTurnAt"' -and
            $content -match '"lastInboxReadAt"') {
            Add-Pass "Observability heartbeats carries expected shape: $heartbeatsPath"
        }
        else {
            Add-Warn "Observability heartbeats missing expected shape: $heartbeatsPath"
        }
    }

    $laneAwarenessPath = Join-Path $runtimeRoot 'observability\lane-awareness.json'
    if (Test-Path -LiteralPath $laneAwarenessPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $laneAwarenessPath -Raw
        if ($content -match '"identityAwareness"' -and
            $content -match '"inboxAwareness"' -and
            $content -match '"selfCorrectionDiscipline"') {
            Add-Pass "Lane-awareness runtime carries expected shape: $laneAwarenessPath"
        }
        else {
            Add-Warn "Lane-awareness runtime missing expected shape: $laneAwarenessPath"
        }
    }

    $unresolvedIssuesPath = Join-Path $runtimeRoot 'observability\unresolved-issues.json'
    if (Test-Path -LiteralPath $unresolvedIssuesPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $unresolvedIssuesPath -Raw
        if ($content -match '"issueId"' -and
            $content -match '"ownerLane"' -and
            $content -match '"status"') {
            Add-Pass "Unresolved-issues runtime carries expected shape: $unresolvedIssuesPath"
        }
        else {
            Add-Warn "Unresolved-issues runtime missing expected shape: $unresolvedIssuesPath"
        }
    }

    $doctorDashboardPath = Join-Path $runtimeRoot 'observability\doctor-dashboard.md'
    if (Test-Path -LiteralPath $doctorDashboardPath -PathType Leaf) {
        $content = Get-Content -LiteralPath $doctorDashboardPath -Raw
        if ($content -match 'Overall visibility:' -and
            $content -match 'Unresolved frustrations:' -and
            $content -match 'Best next repair:') {
            Add-Pass "Doctor dashboard carries expected shape: $doctorDashboardPath"
        }
        else {
            Add-Warn "Doctor dashboard missing expected shape: $doctorDashboardPath"
        }
    }

    $lanesReadmePath = Join-Path $runtimeRoot 'lanes\README.md'
    if (Test-Path -LiteralPath $lanesReadmePath -PathType Leaf) {
        Add-Pass "Lanes runtime surface present: $lanesReadmePath"
    }

    $workstreamsReadmePath = Join-Path $runtimeRoot 'workstreams\README.md'
    if (Test-Path -LiteralPath $workstreamsReadmePath -PathType Leaf) {
        Add-Pass "Workstreams runtime surface present: $workstreamsReadmePath"
    }

    $lanesRoot = Join-Path $runtimeRoot 'lanes'
    if (Test-Path -LiteralPath $lanesRoot -PathType Container) {
        $laneStates = Get-ChildItem -LiteralPath $lanesRoot -Recurse -File -Filter STATE.md
        foreach ($laneState in $laneStates) {
            $laneContent = Get-Content -LiteralPath $laneState.FullName -Raw
            $inboxMatch = [regex]::Match($laneContent, 'Inbox path:\s*`?([^`\r\n]+)`?')
            $lifecycleMatch = [regex]::Match($laneContent, 'Lifecycle state:\s*`?([^`\r\n]+)`?')

            if (-not $inboxMatch.Success) {
                Add-Warn "Lane state missing inbox path: $($laneState.FullName)"
                continue
            }

            $lifecycleState = if ($lifecycleMatch.Success) {
                $lifecycleMatch.Groups[1].Value.Trim()
            }
            else {
                'unknown'
            }

            if ($lifecycleState -eq 'closed') {
                continue
            }

            $relativeInbox = $inboxMatch.Groups[1].Value.Trim().Replace('/', '\')
            $resolvedInbox = Join-Path $runtimeRoot $relativeInbox

            if (Test-Path -LiteralPath $resolvedInbox -PathType Leaf) {
                Add-Pass "Lane inbox present: $resolvedInbox"
            }
            else {
                Add-Warn "Missing lane inbox for live lane capsule: $resolvedInbox"
            }
        }
    }
}
else {
    Add-Pass 'No _agent-system/ vendor layer found; lightweight install shape detected'

    if (Test-Path -LiteralPath $localRoot -PathType Container) {
        Add-Pass '_agent-system-local/ found'
    }
    else {
        Add-Warn 'No _agent-system-local/ found for lightweight install'
    }

    if (Test-Path -LiteralPath $runtimeRoot -PathType Container) {
        Add-Pass '_agent-system-runtime/ found'
    }
    else {
        Add-Warn 'No _agent-system-runtime/ found for lightweight install'
    }
}

Write-Host "Doctor report for $targetRoot"
Write-Host ''
Write-Host 'PASS'
$passes | ForEach-Object { Write-Host "  - $_" }
Write-Host ''
Write-Host 'WARN'
if ($warnings.Count -eq 0) { Write-Host '  - none' } else { $warnings | ForEach-Object { Write-Host "  - $_" } }
Write-Host ''
Write-Host 'FAIL'
if ($failures.Count -eq 0) { Write-Host '  - none' } else { $failures | ForEach-Object { Write-Host "  - $_" } }

Write-Host ''
$isOrchestrationInstall = $orchestrationInstalled

if ($failures.Count -gt 0) {
    Write-Host 'STATUS'
    Write-Host '  - red: fix the FAIL items before trusting the install'
}
elseif ($warnings.Count -gt 0) {
    Write-Host 'STATUS'
    Write-Host '  - yellow: usable, but clean up the WARN items soon'
}
else {
    Write-Host 'STATUS'
    Write-Host '  - green: install shape looks healthy'
}

Write-Host ''
Write-Host 'NEXT'
if ($failures.Count -gt 0) {
    Write-Host '  - Fix the FAIL items, then rerun the doctor.'
}
elseif ($isOrchestrationInstall) {
    Write-Host '  - Read FIRST-WEEK-PLAYBOOK.md for healthy usage signals.'
    Write-Host '  - Then read orchestration/QUICK-START.md and do one real workstream before adding more system.'
}
else {
    Write-Host '  - Read FIRST-WEEK-PLAYBOOK.md for healthy usage signals.'
    Write-Host '  - Then read START-HERE.md and do one real task before adding more structure.'
}

if ($failures.Count -gt 0) {
    exit 1
}
