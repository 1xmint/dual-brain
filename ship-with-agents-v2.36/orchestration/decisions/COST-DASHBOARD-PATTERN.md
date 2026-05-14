# Cost Dashboard Pattern

**Status:** Active
**Introduced:** Pass 9
**Audience:** Solo dev on Claude Max ($100/mo) + Codex ($20/mo)

---

## Why this exists

A solo developer juggling two paid AI subscriptions needs to know whether
their spend is tracking against budget and which projects are consuming
the most tokens. Without visibility, the instinct is to under-use to avoid
surprise overages — which wastes paid capacity — or to over-use and hit
soft quota walls mid-session.

This pattern defines what we can honestly measure, how to aggregate it,
and what to display. It does not pretend to solve what is technically
unmeasurable.

---

## What we CAN measure: Claude Code session logs

Claude Code writes per-session JSONL files to:

    ~/.claude/projects/<project-encoded-path>/<session-uuid>.jsonl

**Confirmed data shape** (from live inspection of session files, 2026-05-10):

Each `assistant` turn entry includes a `usage` object with:

```json
"usage": {
  "input_tokens": 3,
  "cache_creation_input_tokens": 3485,
  "cache_read_input_tokens": 7098,
  "output_tokens": 154,
  "service_tier": "standard"
}
```

The `message.model` field records the exact model string per-turn, e.g.
`"claude-opus-4-6"`. Timestamps are ISO 8601 per-entry. Session ID is a
UUID in both the filename and every entry.

This means we can compute:

- Total input/output tokens per turn, per session, per project, per day/week/month
- Cache creation vs. cache read breakdown (relevant for cost calculation)
- Per-model breakdown (opus vs. sonnet vs. haiku, per turn)
- Project attribution via the encoded directory name

All of this is already written to disk automatically — no agent-side
instrumentation required.

---

## What we CANNOT measure

Be explicit. These surfaces produce zero programmatically accessible data:

| Surface | Why unmeasurable |
|---|---|
| Codex desktop / CLI | No log file exposed outside the app |
| Claude Desktop (non-terminal) | No session log file accessible |
| Claude.ai web | No API or log access |
| ChatGPT web / desktop | No API or log access |
| Claude Max quota remaining | No quota API; no programmatic endpoint |
| Codex quota remaining | No quota API |

**Honesty rule:** Any cost output produced by this system must carry a
prominent label: `Tracked surface: Claude Code only`. Never imply that
Codex, Claude Desktop, or web sessions are included. If the label is
absent, the output is misleading.

---

## Aggregation model

Rollup hierarchy:

1. **Turn** — smallest unit; one assistant response with its usage block
2. **Session** — one JSONL file (one `session-uuid.jsonl`)
3. **Project** — one encoded directory under `~/.claude/projects/`
4. **Day / week / month** — time-windowed aggregation across sessions

The project-encoded-path directories decode from an encoded filesystem path to
the original local project path, for example:
`Users--you-projects-repo` → `/users/you/projects/repo`

Per-project breakdown is first-class. The most useful daily view is:
which project consumed the most tokens today, and at what model tier.

---

## Cost calculation

Token costs vary by model and by token type. Cache reads are significantly
cheaper than fresh input tokens. Cache creation has its own rate.

**Pricing reference** (Anthropic per-MTok rates, as of model cards 2026-05;
prices change — the aggregation script MUST read rates from a config file,
not hardcode them):

| Model | Input $/MTok | Output $/MTok | Cache creation $/MTok | Cache read $/MTok |
|---|---|---|---|---|
| claude-opus-4.x | $15 | $75 | $18.75 | $1.50 |
| claude-sonnet-4.5 / 4.6 | $3 | $15 | $3.75 | $0.30 |
| claude-haiku-4.5 | $1 | $5 | $1.25 | $0.10 |

Note: Claude Max subscription may change effective rates or apply usage
caps rather than per-token billing. These are API-equivalent rates useful
for relative cost comparison within the tracked surface.

**Cost formula per turn:**

```
cost = (input_tokens × input_rate)
     + (output_tokens × output_rate)
     + (cache_creation_input_tokens × cache_creation_rate)
     + (cache_read_input_tokens × cache_read_rate)
```

All divided by 1,000,000 for MTok conversion.

---

## Display surfaces (deferred to Pass 9.1)

Two planned surfaces, neither built in Pass 9:

1. **`scripts/cost-rollup.ps1`** — reads `~/.claude/projects/` JSONL files,
   aggregates by project and time window, outputs a table with per-model
   breakdown and a "Tracked: Claude Code only" header. Rates loaded from
   a config file (e.g., `config/model-rates.json`).

2. **`.claude/commands/cost.md`** (`/cost` slash command) — invokes the
   script and formats output for the Claude Code terminal. Shows top
   projects by spend, current-week total, and a reminder of untracked
   surfaces.

---

## Alternatives considered

**Full cross-provider dashboard:** Rejected. Codex and Claude Desktop expose
nothing programmatically. Any "total spend" number that includes those
surfaces would be fabricated.

**Per-session cost via `/cost` in-session:** Already available interactively.
The gap is aggregation across sessions and projects, which `/cost` does not
provide.

**Token estimation from file sizes:** Rejected. MEASUREMENT-DISCIPLINE.md
documents that chars/4 underestimates real cost by ~2x due to system prompts,
tool definitions, and harness overhead. The JSONL files have exact counts —
use those.

---

## Deferred to Pass 9.1

- `scripts/cost-rollup.ps1` — the aggregation script
- `config/model-rates.json` — the rate config file
- `.claude/commands/cost.md` — the `/cost` slash command
- Decide whether to surface monthly budget-vs-actual as a health field
  in `health/workstreams.json` or as a separate `health/spend.json`
- Decide whether `executionProvider` + model tier in workstreams.json
  should be used to weight estimated Codex spend (advisory, not measured)

---

## Subscription vs API-equivalent

All dollar figures produced by `scripts/cost-rollup.ps1` are
**API-equivalent values**, not billing charges.

The user's actual spend is:
- Claude Max: flat $100/mo subscription
- Codex: flat $20/mo subscription

The script applies Anthropic's public per-token API rates (from
`config/model-rates.json`) to compute how much those tokens _would_ cost if
billed at metered API rates. This produces a useful relative gauge —
"which project is consuming the most?" — without implying an actual charge.

**Do not read the monthly total as a credit card amount.** It is a proxy for
how much of your subscription allowance you are consuming. A month showing
$734 API-equivalent does not mean you owe $734; it means you consumed
$734-worth of compute within a plan that costs $120/mo flat.

**Claude Max quota remaining is not programmatically accessible.** There is no
API endpoint or log file that exposes the remaining Max quota. The dashboard
cannot tell you "X% of your plan left" — only "X tokens consumed at API rates."

---

## Budget alerts are advisory

`config/budget.json` holds the user's configured advisory thresholds:
- `combined_advisory_usd` — a monthly ceiling to compare against (default $120)
- `warn_pct` — yellow alert at this percentage of the target (default 75%)
- `critical_pct` — red alert at this percentage (default 90%)

When the API-equivalent monthly total crosses these thresholds, the script
prints a warning labeled ADVISORY. No automatic action is taken. The
subscription quota is not auto-measurable, so the budget alert is purely
informational — a signal to review usage patterns, not a billing alarm.

---

## Pass 9.2 changes

Four polish items shipped in Pass 9.2:

1. **Subscription clarifier header** — `cost-rollup.ps1` now prints a
   prominent header distinguishing API-equivalent value from the
   subscription bill. `cost.md` command adds a disclaimer block.

2. **Model string prefix-match aliasing** — JSONL files often contain
   versioned model strings like `claude-haiku-4-5-20251001`. The script now
   strips a trailing `-YYYYMMDD` suffix and retries against the short key in
   `config/model-rates.json`. Aliased matches are noted once at output, not
   per turn. Truly unknown models still fall through to the yellow warning.

3. **Budget alerts** — `config/budget.json` (new file) holds the advisory
   monthly target and warning thresholds. The script reads it on each run and
   appends a yellow (75%) or red (90%) advisory note to the output. Alerts are
   labeled ADVISORY and include the "API-equivalent, not your bill" caveat.

4. **`health/spend.json`** — At the end of each normal run (human-readable or
   `-Json`), the script writes a compact JSON rollup to `health/spend.json`
   for other tooling to consume. Fields: `today`, `week`, `month`, `byProject`,
   `byModel`, `budgetTarget`, `budgetAlertLevel`, `lastUpdated`, `source`.
