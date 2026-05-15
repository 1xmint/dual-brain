# Dual-Brain Orchestrator

This project uses dual-provider orchestration. Config: `.claude/orchestrator.json`.

## Core Architecture (v7)

Four modules in `src/` form the decision pipeline:

- **`profile.mjs`** — Load active profile, provider availability, preferences, and subscription plan
- **`detect.mjs`** — Classify task intent, risk, complexity, and tier from prompt + file paths
- **`decide.mjs`** — Route to provider/model/tier; handles budget pressure and dual-brain threshold
- **`dispatch.mjs`** — Execute the decision: Claude subagent, GPT via Codex, or dual-brain flow

The hooks layer (`/home/runner/workspace/.claude/hooks/`) wraps these modules for Claude Code integration and is still valid.

## CLI Commands

```bash
dual-brain init                        # First-time setup
dual-brain go "task description"       # Detect → decide → dispatch
dual-brain go --dry-run "..."          # Show routing without executing
dual-brain go --files a.mjs,b.mjs "..." # Provide file context for risk classification
dual-brain status                      # Provider health, budget pressure, models
dual-brain remember "preference"       # Save project-scoped preference
dual-brain forget "preference"         # Remove preference by fuzzy match
```

## Tier Routing

- **Search** (`haiku`): Read-only lookups, grep, explore. Return: files found, line refs, confidence.
- **Execute** (`sonnet`): Edits, tests, git ops. Return: files changed, tests run, edge cases.
- **Think** (main session, Opus): Architecture, review, planning. Return: decision, alternatives, risks.

## Dual-Brain Collaboration

Dual-brain is a multi-round conversation between Claude and GPT — not a single-shot dispatch.

**Think flow** (architecture decisions):
1. Round 1: `node .claude/hooks/dual-brain-think.mjs --question "..."` → GPT gives independent analysis
2. You analyze the same question independently
3. Round 2: `node .claude/hooks/dual-brain-think.mjs --question "..." --round 2 --claude-says "<your analysis>"` → GPT responds with agreements, pushback, refined recommendation
4. You synthesize both rounds into a final decision

**Review flow** (code review):
1. Round 1: `node .claude/hooks/dual-brain-review.mjs` → GPT reviews the diff independently
2. You review the same diff independently
3. Round 2: `node .claude/hooks/dual-brain-review.mjs --round 2 --claude-review "<your findings>"` → GPT confirms shared findings, acknowledges misses
4. You synthesize into a final review verdict

## Routing Rules

1. Tasks under 3 min → Claude (Codex startup overhead not worth it)
2. Isolated tasks over 3 min → check balance: `node .claude/hooks/budget-balancer.mjs`
3. High-risk decisions → dual-brain think
4. When a task spans tiers: think > execute > search

## Mandatory Workload Distribution

**Claude MUST follow these rules before implementing multi-file changes:**

1. **Before starting any batch of 3+ file edits**: run `node .claude/hooks/budget-balancer.mjs` to check provider balance, then `dual-brain go --dry-run "description"` to classify tasks
2. **When budget-balancer recommends GPT**: dispatch via `src/dispatch.mjs` (or `node .claude/hooks/gpt-work-dispatcher.mjs --task "..." --tier execute`)
3. **Security/auth/credential changes**: always require dual-brain think flow before implementation
4. **Audit remediation batches**: plan waves with dual-brain think, dispatch execution to GPT, Claude reviews
5. **Claude's role in multi-task work**: define acceptance criteria, dispatch agents, review results — not solo-implement everything

**Triggers that require this workflow:** 3+ production files edited in one session · auth/credentials/tokens/secrets · changes to dispatcher, agent routing, or tier logic · audit remediation across multiple subsystems · Claude think capacity above 60% per budget-balancer.

**Failure to route is itself a bug.**

## Quality Gate

Before ending a session with code changes:
1. `node .claude/hooks/session-report.mjs` (allowed by head-guard for hook scripts)
2. `node .claude/hooks/quality-gate.mjs`

Gate statuses: `pass` (safe to end), `issues_found` (fix first), `needs_human_review` (GPT unavailable).

## Profiles

Profile persists to `.dualbrain/profile.json` (project-scoped, gitignored).

- **auto** (default): Adapts routing based on task risk, provider health, and outcomes
- **balanced**: Best model per tier, normal budgets, reviews at medium+ risk
- **cost-saver**: Prefer cheaper models, lower budgets, skip GPT for non-critical
- **quality-first**: Dual-brain for medium+ risk, higher budgets, stricter reviews

Switch via the interactive Profile screen in `dual-brain`, or set `bias` in `.dualbrain/profile.json`.

## Adaptive Routing (Auto Mode)

- **Risk classification**: auth/secrets→critical, billing/migrations→high, tests/utils→medium, docs→low
- **Failure detection**: 2+ failures on same prompt in 2 hours → auto-escalate tier or trigger dual-brain
- **Provider balance**: Routes to underused provider when one subscription is hot
- **Burst awareness**: Suppresses duplicate warnings during agent waves (3+ agents in 90s)

## Budget Balancer

`src/decide.mjs` handles routing decisions using the same token data internally. For inspection:

```bash
node .claude/hooks/budget-balancer.mjs
```

Tracks 5-hour and 7-day rolling windows against subscription limits (Claude Pro/Max, ChatGPT Plus/Pro). The higher pressure window is the binding constraint. Uses actual `input_tokens + output_tokens` from usage logs.

**Subscription tiers** (configured in `orchestrator.json` → `subscriptions.*.plan`):
- Claude: Pro $20, Max x5 $100, Max x20 $200
- ChatGPT: Plus $20, Pro $100, Pro $200

## Multi-Step Work

The wave orchestrator is available for complex multi-step tasks:

```bash
node .claude/hooks/wave-orchestrator.mjs "fix the login bug and update the nav"
node .claude/hooks/wave-orchestrator.mjs --dry-run "refactor auth module"
node .claude/hooks/wave-orchestrator.mjs --resume <manifestId>
```

For most tasks, prefer `dual-brain go "..."` — it runs the same detect→decide→dispatch pipeline with less overhead.

## Available Tools

| Tool | Purpose |
|------|---------|
| `dual-brain go "..."` | Primary entry point: detect, decide, dispatch |
| `dual-brain status` | Provider health, budget, models |
| `node .claude/hooks/budget-balancer.mjs` | Token usage and routing recommendation |
| `node .claude/hooks/dual-brain-think.mjs` | Multi-round architecture decisions with GPT |
| `node .claude/hooks/dual-brain-review.mjs` | Multi-round code review with GPT |
| `node .claude/hooks/wave-orchestrator.mjs "..."` | Dependency-aware multi-wave dispatch |
| `node .claude/hooks/session-report.mjs` | End-of-session summary |
| `node .claude/hooks/quality-gate.mjs` | Gate check before ending session |
| `node .claude/hooks/health-check.mjs` | System health |
| `node .claude/hooks/test-orchestrator.mjs` | Self-tests (40 tests) |
| `node .claude/hooks/vibe-memory.mjs` | Persistent preferences across sessions |
