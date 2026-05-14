function Get-SkillSpecs {
    [CmdletBinding()]
    param()

    @(
        [pscustomobject]@{
            Name = 'lane-discipline'
            TargetPath = '.claude/skills/lane-discipline/SKILL.md'
            Description = 'Lane lifecycle, identity, startup, ownership, and honest lane adoption. Use when a chat needs to resolve who it is, which lane it owns, how revive/startup should work, or how lane closeout and map truth should stay coherent.'
            SourceFiles = @(
                'LANE.md',
                'IDENTITY-DISCIPLINE.md',
                'STARTUP-SELF-CHECK-GATE.md',
                'LIFECYCLE-REPAIR-PROTOCOL.md',
                'WORKSTREAM-STORY-MODEL.md'
            )
        }
        [pscustomobject]@{
            Name = 'continuity-pickup'
            TargetPath = '.claude/skills/continuity-pickup/SKILL.md'
            Description = 'Runtime pickup, done absorption, and child-result fan-in. Use when a live owner should stay hot, absorb unread completions, or tell the buyer the smallest honest pickup trigger.'
            SourceFiles = @(
                'RUNTIME-MAIL-PROTOCOL.md',
                'DONE-ABSORPTION-RULE.md',
                'FAN-IN-SYNTHESIS-RULE.md',
                'MAILBOX-STATE-MODEL.md',
                'RESULT-RETURN-SIMPLIFICATION-RULE.md',
                'PARENT-PICKUP-HANDHOLDING-RULE.md'
            )
        }
        [pscustomobject]@{
            Name = 'launch-and-transport'
            TargetPath = '.claude/skills/launch-and-transport/SKILL.md'
            Description = 'Launch shape, transport choice, packet vs spawn vs injection, and launch honesty. Use when the next move changes containers or when launch wording is ambiguous.'
            SourceFiles = @(
                'LAUNCH.md',
                'CANONICAL-PACKET-MINIMIZATION-RULE.md',
                'EXECUTABLE-HANDOFF-BRIDGE-RULE.md'
            )
        }
        [pscustomobject]@{
            Name = 'truth-and-verification'
            TargetPath = '.claude/skills/truth-and-verification/SKILL.md'
            Description = 'Truth-before-assumption discipline, inference labeling, and verification posture. Use when routing, diagnosis, or recommendations risk guessing.'
            SourceFiles = @(
                'TRUTH-BEFORE-ASSUMPTION.md',
                'PERSPECTIVE-SWEEP-GATE.md',
                'REPO-SCOPE-GATE.md'
            )
        }
        [pscustomobject]@{
            Name = 'review-topology'
            TargetPath = '.claude/skills/review-topology/SKILL.md'
            Description = 'Review density, second-brain topology, review state, and assurance shape. Use when choosing T0-T5, deciding whether a manager/super cell is justified, or auditing review quality.'
            SourceFiles = @(
                'REVIEW-TOPOLOGY-LADDER.md',
                'REVIEW-STATE-MACHINE.md',
                'REVIEW-CELL-MODEL.md',
                'ASSURANCE-TO-TOPOLOGY-MATRIX.md',
                'SECOND-BRAIN-DIVERSITY-GATE.md',
                'MANAGER-CONTEXT-PURITY-GATE.md'
            )
        }
        [pscustomobject]@{
            Name = 'buyer-support'
            TargetPath = '.claude/skills/buyer-support/SKILL.md'
            Description = 'Buyer-facing support posture, handholding, delivery tails, and closeout clarity. Use when shaping the response itself or deciding how much guidance the buyer should get.'
            SourceFiles = @(
                'OUTPUT-MODES.md',
                'USER-SUPPORT-PROFILE.md',
                'SUPPORT-POSTURE-GATE.md',
                'ADAPTIVE-EXPLANATION-GATE.md',
                'USER-CONFIDENCE-MODEL.md',
                'GUIDED-TAIL-PATTERNS.md',
                'FAST-PATH-VS-TEACHING-PATH-RULE.md',
                'BUYER-HANDHOLDING-COMPLETION-RULE.md',
                'EARNED-REASSURANCE-RULE.md'
            )
        }
        [pscustomobject]@{
            Name = 'code-review'
            TargetPath = '.claude/skills/code-review/SKILL.md'
            Description = 'Substantive changed-code review. Use when reviewing a patch for bug risk, missing validation, silent failures, unsafe state changes, weak proof, or common defect patterns.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'test-design'
            TargetPath = '.claude/skills/test-design/SKILL.md'
            Description = 'Load-bearing test design. Use when deciding what to test, how to prove an edge case, whether to mock, or whether a proposed test would actually fail for the right reason.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'refactoring-patterns'
            TargetPath = '.claude/skills/refactoring-patterns/SKILL.md'
            Description = 'Safe refactor discipline. Use when reshaping code, separating mechanical change from behavior change, or judging whether a refactor is too risky for the current task.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'error-handling'
            TargetPath = '.claude/skills/error-handling/SKILL.md'
            Description = 'Boundary validation, failure handling, retries, and graceful degradation. Use when input trust, retries, observability, or recovery behavior matters to correctness.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'api-design'
            TargetPath = '.claude/skills/api-design/SKILL.md'
            Description = 'Public-surface and caller-contract discipline. Use when adding or changing functions, endpoints, events, config surfaces, or any interface other code depends on.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'commit-hygiene'
            TargetPath = '.claude/skills/commit-hygiene/SKILL.md'
            Description = 'Atomic commit discipline and message truth. Use when staging changes, deciding commit boundaries, or checking whether the final commit explains why and risk instead of just what changed.'
            SourceFiles = @(
                'decisions/CODE-QUALITY-PATTERN.md'
            )
        }
        [pscustomobject]@{
            Name = 'patterns'
            TargetPath = '.claude/skills/patterns/SKILL.md'
            Description = 'Repo-specific craft conventions and reusable implementation patterns. Use when this codebase has local testing, auth, database, API, or error-handling rules that generic craft skills should augment.'
            SourceFiles = @(
                'decisions/FRICTION-AND-PATTERNS-PATTERN.md',
                'patterns/README.md'
            )
        }
        [pscustomobject]@{
            Name = 'execution-routing'
            TargetPath = '.claude/skills/execution-routing/SKILL.md'
            Description = 'Freshness, context load, lane elasticity, and choosing whether to reuse, rotate, or open a new execution container. Use when routing owned execution work.'
            SourceFiles = @(
                'EXECUTION-OWNER-REUSE-GATE.md',
                'AGENT-FRESHNESS-REUSE-GATE.md',
                'CHAT-STATE-GATE.md',
                'CONTEXT-LOAD-GATE.md',
                'ROLE-TO-LANE-ELASTICITY.md',
                'ADAPTIVE-ROUTING-LADDER.md'
            )
        }
        [pscustomobject]@{
            Name = 'doctor-audit'
            TargetPath = '.claude/skills/doctor-audit/SKILL.md'
            Description = 'Doctor evidence-first audits, sweep discipline, and retirement-minded fixes. Use when auditing workflow quality, continuity, or doctrine drift.'
            SourceFiles = @(
                'DOCTOR-PLAYBOOK.md',
                'DOCTOR-FINDING-SCHEMA.md',
                'DOCTOR-SEVERITY-MODEL.md',
                'DOCTOR-OBSERVABILITY-LAYER.md',
                'DOCTOR-SWEEP-PROTOCOL.md',
                'DOCTOR-CONTROL-PLANE-DASHBOARD.md',
                'TURN-OUTCOME-EVENT-SCHEMA.md',
                'EVIDENCE-RETENTION-RULE.md',
                'OBSERVABILITY-METRICS-MODEL.md'
            )
        }
        [pscustomobject]@{
            Name = 'state-plane'
            TargetPath = '.claude/skills/state-plane/SKILL.md'
            Description = 'Active map, workstream health, lane capsules, and control-plane truth precedence. Use when head/manager state feels disconnected or runtime truth needs a compact state-plane read.'
            SourceFiles = @(
                'ACTIVE-WORKSTREAMS.md',
                'LIVE-STATE-POPULATION-PROTOCOL.md',
                'WORKSTREAM-CELL-REGISTRY.md',
                'ORCHESTRATION-STATE-CONSISTENCY.md',
                'ORCHESTRATION-HEALTH-MODEL.md'
            )
        }
        [pscustomobject]@{
            Name = 'system-impact'
            TargetPath = '.claude/skills/system-impact/SKILL.md'
            Description = 'Cross-workstream impact, dependency tracing, and neighbor awareness. Use when one change should reshape adjacent cells or the current world model.'
            SourceFiles = @(
                'SYSTEM-WORLD-MODEL.md',
                'WORKSTREAM-DEPENDENCY-GRAPH.md',
                'CROSS-WORKSTREAM-CONTRACTS.md',
                'WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md',
                'REPLAN-TRIGGER-GATE.md',
                'ATTENTION-ROUTING-ENGINE.md',
                'CONFLICT-RADAR.md',
                'OPPORTUNITY-RADAR.md',
                'TOP-CHAIN-SYNTHESIS-LOOP.md'
            )
        }
        [pscustomobject]@{
            Name = 'external-research'
            TargetPath = '.claude/skills/external-research/SKILL.md'
            Description = 'Research freshness, source-tier discipline, and external-risk scouting. Use when local certainty is probably stale or hidden external context could change the recommendation.'
            SourceFiles = @(
                'INTERNET-AWARENESS-GATE.md',
                'RESEARCH-FRESHNESS-LADDER.md',
                'SOURCE-TIER-POLICY.md',
                'BIG-PICTURE-SCOUT-PASS.md',
                'SECURITY-AND-DOCS-RESEARCH-PROTOCOL.md',
                'WEB-CAPABLE-LANE-ROUTING.md',
                'EXTERNAL-RESEARCH-EVIDENCE-LEDGER.md'
            )
        }
        [pscustomobject]@{
            Name = 'plugins-and-capability'
            TargetPath = '.claude/skills/plugins-and-capability/SKILL.md'
            Description = 'Plugin fit, capability-first execution, and install suggestion discipline. Use when installed or marketplace capabilities could materially change the workflow.'
            SourceFiles = @(
                'PLUGIN-AWARENESS-GATE.md',
                'PLUGIN-INVENTORY.md',
                'PLUGIN-FIT-MATRIX.md',
                'PLUGIN-OPTIONALITY-RULE.md',
                'PLUGIN-INSTALL-SUGGESTION-PROTOCOL.md',
                'PLUGIN-PORTABILITY-GATE.md',
                'CAPABILITY-FIRST-EXECUTION-RULE.md',
                'CAPABILITY-AWARENESS-GATE.md',
                'CAPABILITY-TRUTH-VERIFICATION-PROTOCOL.md'
            )
        }
        [pscustomobject]@{
            Name = 'surface-runtime'
            TargetPath = '.claude/skills/surface-runtime/SKILL.md'
            Description = 'Surface-specific memory model, runtime wording, operator setup, and preference truth. Use when the answer depends on which app/runtime is in play or how the operator actually works.'
            SourceFiles = @(
                'SURFACE-COMPACTION-AND-RESUME.md',
                'RUNTIME-TERM-SEPARATION-RULE.md',
                'SURFACE-RUNTIME-TERM-MATRIX.md',
                'CLAUDE-HOOKS-INTEGRATION.md',
                'claude-info.md',
                'gpt-info.md',
                'SESSION-ID-GATE.md',
                'OPERATOR-ORCHESTRATION-PROFILE.md',
                'OPERATOR-CAPABILITIES.md'
            )
        }
        [pscustomobject]@{
            Name = 'model-and-budget'
            TargetPath = '.claude/skills/model-and-budget/SKILL.md'
            Description = 'Model/provider routing, budget truth, quality thresholds, and production-shaped escalation. Use when the system must choose a model or provider deliberately.'
            SourceFiles = @(
                'MODEL-CONFIG.md',
                'RUNTIME-MODEL-GATE.md',
                'EXECUTION-ROUTING-GATE.md',
                'BUDGET-AND-SUBSCRIPTION-ROUTING.md',
                'PROVIDER-BINDING-RULE.md'
            )
        }
        [pscustomobject]@{
            Name = 'package-maintenance'
            TargetPath = '.claude/skills/package-maintenance/SKILL.md'
            Description = 'Package mirror, release hygiene, and buyer-facing sync discipline. Use when updating or auditing repo-ops-starter-pack, release flow, or packaging drift.'
            SourceFiles = @(
                'PACKAGE-STRUCTURE.md',
                'DOC-UPDATE-PROTOCOL.md'
            )
        }
    )
}
