# Dual-Brain Orchestrator

One command. Both brains. Auto-detected. Auto-configured. Default profile: **auto**.

Dual-provider orchestration for Claude Code across Claude and OpenAI subscriptions. Routes search to cheap models, execution to mid-tier, thinking to the most capable. Dispatches work to GPT via Codex CLI. Dual-brain analysis for high-risk decisions.

## Install

```bash
npx -y dual-brain
```

That's it. The installer auto-detects your environment:
- Finds Claude CLI and checks auth status
- Finds Codex CLI and checks auth status
- Detects Replit and replit-tools if present
- Configures dual-provider, Claude-only, or OpenAI-only mode automatically
- Registers hooks in `.claude/settings.json`
- No wizard. No restart. No manual steps.

Run it again anytime — it's idempotent. Re-detects providers, updates hooks, preserves your config.

### Unlock full features

```bash
# Claude (you probably have this already)
claude login

# OpenAI (optional — enables GPT lane + dual-brain)
npm i -g @openai/codex
codex login

# Re-run to detect new providers
npx -y dual-brain
```

## How it works

**Two advisory hooks** are registered in `.claude/settings.json` and fire on each tool use. They detect and recommend — they do not execute actions without user confirmation:

- **enforce-tier.mjs** (PreToolUse on Agent): Classifies tasks, recommends the correct model tier, detects duplicates, suggests cross-provider routing
- **cost-logger.mjs** (PostToolUse on all tools): Logs usage to daily rotated files for cost tracking

**Three tiers route work by complexity:**

| Tier | Claude | OpenAI | Use for |
|------|--------|--------|---------|
| Search | Haiku | GPT-4.1-mini | grep, explore, file reads |
| Execute | Sonnet | GPT-5.4 | edits, tests, git ops |
| Think | Opus | GPT-5.5 | architecture, review, planning |

**Dual-brain** is recommended automatically for high-risk decisions — hooks detect the risk level and suggest dual-brain analysis, where both providers think on the same problem independently.

## Scripts

| Script | Purpose |
|--------|---------|
| `hooks/cost-report.mjs` | Activity & cost estimates by model tier |
| `hooks/dual-brain-review.mjs` | Send git diff to GPT for independent review |
| `hooks/dual-brain-think.mjs` | Dual-perspective analysis on architecture decisions |
| `hooks/quality-gate.mjs` | Sensitivity-scored quality gate with review artifacts |
| `hooks/budget-balancer.mjs` | Provider balance and routing recommendations |
| `hooks/gpt-work-dispatcher.mjs` | Dispatch execution tasks to GPT via Codex CLI |
| `hooks/session-report.mjs` | Session-end summary: activity, compliance, quality |
| `hooks/health-check.mjs` | Verify all hooks and dependencies are working |
| `hooks/test-orchestrator.mjs` | Self-test harness (39 tests) |
| `hooks/setup-wizard.mjs` | Interactive config (optional — for custom plans) |
| `hooks/install-git-hooks.mjs` | Git pre-commit hook for quality gate |

## CLI options

```bash
npx -y dual-brain              # detect, configure, install
npx dual-brain --force          # overwrite all config
npx dual-brain --dry-run        # detect only, don't write
npx dual-brain --json           # output detection as JSON
npx dual-brain --help           # show help
```

## Customize

After install, edit these files:

- `orchestrator.json` — subscriptions, tiers, quality gate, budgets, routing
- `review-rules.md` — project-specific rules for GPT code review
- `settings.json` — hook registrations (auto-generated, safe to extend)

## Profiles

The active profile controls routing posture, budgets, and quality gate behavior. Default: **auto**.

```bash
npx dual-brain mode cost-saver   # switch profile
npx dual-brain status            # check current profile and provider health
```

- **auto** (default): Adapts routing based on task risk, provider health, and outcomes. Auto-escalates tier on repeated failures.
- **balanced**: Best model per tier, normal budgets, reviews at medium+ risk.
- **cost-saver**: Prefer cheaper models, lower budgets, skip GPT for non-critical work.
- **quality-first**: Dual-brain for medium+ risk, higher budgets, stricter reviews.

## Requirements

- Node 20+
- Claude Code (any subscription tier)
- Codex CLI (optional) — `npm i -g @openai/codex && codex login`

Works with any subscription combination. Without OpenAI, GPT features gracefully degrade — all work routes through Claude.
