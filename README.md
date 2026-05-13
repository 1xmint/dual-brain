# dual-brain

Tiered model routing and GPT dual-brain code review for Claude Code.

---

### What it does

- Routes search work to cheap models (Haiku), execution to mid-tier (Sonnet), reserves expensive models (Opus) for thinking
- Optionally sends diffs to GPT-5.5 for independent "dual-brain" code review via your ChatGPT subscription
- Enforces quality gates at session end and git commit time
- Tracks costs, detects drift, prevents duplicate work, and reports compliance

---

### Install

```bash
npx dual-brain init
node .claude/hooks/setup-wizard.mjs
```

Then restart Claude Code.

---

### How it works

Three tiers:

| Tier    | Model  | Use For                                  |
|---------|--------|------------------------------------------|
| Search  | Haiku  | File lookups, grep, explore, read-only   |
| Execute | Sonnet | Implementation, edits, tests, git ops    |
| Think   | Opus   | Architecture, review, planning, security |

Two hooks run automatically:

- **PreToolUse** (`enforce-tier.mjs`): Classifies Agent calls by tier, warns on mismatches, detects duplicates, checks pricing drift
- **PostToolUse** (`cost-logger.mjs`): Logs every tool call with daily rotation, budget alerts

---

### Dual-Brain Review

Uses your ChatGPT subscription via Codex CLI — no API key needed. Claude writes code, GPT reviews it independently. Different models catch different bugs.

```bash
# Install Codex CLI and login
npm i -g @openai/codex
codex login

# Run a review
node .claude/hooks/dual-brain-review.mjs
```

Falls back to `OPENAI_API_KEY` if Codex isn't available.

---

### Scripts

| Script                    | What it does                                        |
|---------------------------|-----------------------------------------------------|
| `setup-wizard.mjs`        | Interactive config for your subscription plan       |
| `health-check.mjs`        | Verify hooks are wired and system is healthy        |
| `cost-report.mjs`         | Session cost estimates by model tier                |
| `session-report.mjs`      | Full session summary: costs, compliance, gate status|
| `quality-gate.mjs`        | Run GPT review on changed files                     |
| `dual-brain-review.mjs`   | Send current diff to GPT for independent review     |
| `install-git-hooks.mjs`   | Add quality gate to git pre-commit hook             |
| `test-orchestrator.mjs`   | Self-test harness for all hooks                     |

---

### Configuration

`orchestrator.json` has four main sections:

- **`subscriptions`** — your Claude and OpenAI plans with per-model pricing
- **`model_intelligence`** — strengths, weaknesses, and best-for guidance per model
- **`quality_gate`** — which file extensions trigger GPT review, what to skip
- **`budgets`** — daily warn/limit thresholds for cost alerts

Run `setup-wizard.mjs` to auto-configure based on your subscription plan.

---

### Subscription Compatibility

Works with any combination:

| Claude plan   | OpenAI plan       | Dual-brain review |
|---------------|-------------------|-------------------|
| $20 / $100+   | $100+ / API       | Full (GPT-5.5)    |
| $20 / $100+   | $20               | Partial (GPT-5.4) |
| Any           | None              | Claude-only mode  |

The setup wizard configures the right models and rates for your plan.

---

### Requirements

- Node 20+
- Claude Code (CLI, desktop, or web)
- Codex CLI (optional, for dual-brain review): `npm i -g @openai/codex`

---

### Example output

```
  ╔══════════════════════════════════════╗
  ║     Session Summary Report           ║
  ╠══════════════════════════════════════╣
  ║ Activity Summary                     ║
  ║ Tier     │ Calls │ Est. Cost         ║
  ║ Search   │    12 │      $0.04        ║
  ║ Execute  │     8 │      $0.19        ║
  ║ Think    │     2 │      $0.14        ║
  ╠══════════════════════════════════════╣
  ║ Routing Compliance                   ║
  ║ Followed: 20 (91%)                   ║
  ╠══════════════════════════════════════╣
  ║ Quality Gate: pass                   ║
  ╚══════════════════════════════════════╝
```

---

### License

MIT
