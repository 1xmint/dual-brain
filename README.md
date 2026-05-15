# dual-brain

AI orchestration across Claude + OpenAI subscriptions — smart routing, budget awareness, and dual-brain collaboration.

## Quick Start

```bash
npm install -g dual-brain
dual-brain init
dual-brain go "fix the login bug"
```

## How It Works

dual-brain detects the intent and risk of your task, picks the best model based on your subscriptions and current budget pressure, and dispatches to Claude or OpenAI. For high-risk decisions (auth, architecture, critical changes), it runs both providers in parallel and surfaces a consensus. It learns from usage patterns to improve routing over time.

**Pipeline:** `detect` → `decide` → `dispatch`

- **detect** — classifies intent (edit, refactor, debug, search, architecture…), risk (low/medium/high/critical), complexity, and effort from the task prompt and file paths
- **decide** — picks provider, model, and effort level based on your subscription plan, current budget pressure, and routing bias
- **dispatch** — runs the agent via `claude` CLI or `codex` CLI, records token usage, returns a structured result

## Commands

### `dual-brain init`

First-time setup. Three questions: which providers you have, subscription tiers, and optimization preference.

```
Dual-Brain Orchestrator — First-time setup

Which AI subscriptions do you have?
  (1) Claude only  (2) OpenAI only  (3) Both
> 3

Claude tier?
  (1) $20/mo  (2) $100/mo  (3) $200/mo
> 2

Default optimization?
  (1) Save usage  (2) Balanced  (3) Best quality
> 2

Profile saved. Providers: Claude ($100), OpenAI ($20). Mode: dual. Runtime: claude-code
```

Profile is written to `.dualbrain/profile.json` in your project (or `~/.config/dual-brain/profile.json` globally).

### `dual-brain go "task"`

Detects, decides, and dispatches in one command.

```
$ dual-brain go "refactor the auth middleware to use JWT" --files src/middleware/auth.js

Moderate critical-risk security touching 1 file.
  provider   : claude
  model      : opus (high)
  tier       : think
  dual-brain : yes
  reason     : Using opus high with dual-brain review because this security change is critical risk.

Dispatching...

Consensus: both-passed
Claude : Refactored auth.js to validate JWT using jsonwebtoken...
OpenAI : Updated middleware to verify tokens with proper expiry...
```

**Options:**

```
dual-brain go "task" --dry-run              # show routing decision, don't execute
dual-brain go "task" --files a.mjs,b.mjs   # add file context for risk classification
```

### `dual-brain status`

Shows provider health, budget pressure, available models, and active preferences.

```
$ dual-brain status

=== Dual-Brain Status ===

Providers:
  Claude  plan=$100  budget=23% used
  OpenAI  plan=$20   budget=5% used

Available models:
  Claude : haiku, sonnet, opus
  OpenAI : gpt-4.1-mini, gpt-4.1, gpt-5.2, gpt-5.4-mini, gpt-5.3-codex, gpt-5.4, gpt-5.5

Head model : sonnet
Mode       : dual
Solo brain : no

Runtime:
  claude CLI : available
  codex CLI  : available
  detected   : claude-code

Preferences: (none)
```

### `dual-brain remember "preference"`

Saves a project-scoped preference that influences routing decisions.

```bash
dual-brain remember "always use opus for security tasks"
dual-brain remember "prefer cost-saver mode this sprint"
dual-brain forget "cost-saver"
```

Preferences are stored in `.dualbrain/profile.json` and applied on every `go` invocation.

## Programmatic API

```js
import { orchestrate } from 'dual-brain';

const result = await orchestrate({ prompt: "fix the bug", cwd: "." });
console.log(result.summary);
```

Individual modules are also exported:

```js
import { detectTask }   from 'dual-brain/detect';
import { decideRoute }  from 'dual-brain/decide';
import { dispatch }     from 'dual-brain/dispatch';
import { loadProfile }  from 'dual-brain/profile';

const profile   = loadProfile(process.cwd());
const detection = detectTask({ prompt: "refactor auth", files: ["src/auth.js"] });
const decision  = decideRoute({ profile, detection });
const result    = await dispatch({ decision, prompt: "refactor auth" });
```

## Configuration

Profile shape (`~/.config/dual-brain/profile.json` or `.dualbrain/profile.json`):

```json
{
  "schemaVersion": 1,
  "providers": {
    "claude": { "plan": "$100", "enabled": true },
    "openai": { "plan": "$20",  "enabled": true }
  },
  "mode": "dual",
  "bias": "balanced",
  "preferences": []
}
```

**`mode`** is set automatically: `dual` (both providers), `solo-claude`, or `solo-openai`.

**`bias`** controls routing posture:
- `balanced` — best model per task, normal budgets (default)
- `cost-saver` — cheapest available model, skip GPT for non-critical work
- `quality-first` — strongest model per task, dual-brain for medium+ risk

Token usage is tracked in `.dualbrain/usage/` (daily JSONL files). Budget pressure is computed from real token counts against your subscription limits and influences model downgrade decisions automatically.

## Solo vs Dual Brain

dual-brain works with just Claude, just OpenAI, or both. There is no degraded experience in solo mode — routing, budget tracking, and preferences all work the same way. Dual-brain analysis (parallel dispatch to both providers) activates only when both are configured and the task qualifies (critical risk, architecture, or security intent).

## Claude Code Integration

For Claude Code users, a hooks layer provides deeper integration. Hooks fire on each tool use to enforce tier routing, log usage, and surface routing recommendations inline.

```bash
# Install hooks into .claude/settings.json
npx -y dual-brain
```

The installer auto-detects your environment (Claude CLI, Codex CLI, Replit), registers `enforce-tier.mjs` and `cost-logger.mjs` hooks, and writes `orchestrator.json` with your subscription config. Re-run anytime — it's idempotent.

See `.claude/hooks/` for the full hooks library: wave orchestrator, vibe router, budget balancer, dual-brain review, quality gate, and more.

## Requirements

- Node.js >= 20
- `claude` CLI and/or `codex` CLI
- Active subscription: Claude Pro/Max ($20–$200) or ChatGPT Plus/Pro ($20–$200)

```bash
# Claude CLI
claude login

# Codex CLI (optional — enables OpenAI lane + dual-brain)
npm i -g @openai/codex
codex login
```
