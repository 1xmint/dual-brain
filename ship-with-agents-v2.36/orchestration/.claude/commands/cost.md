---
description: Show Claude Code token spend — today, this week, this month, by project
---

# /cost

Run the cost rollup script and display token spend across Claude Code sessions.

**Tracked surface: Claude Code only.**
Codex, Claude Desktop, and Claude.ai web sessions are not included — those
surfaces expose no programmatic log access. For total AI spend, add Codex
($20/mo) and any other subscriptions manually.

## Steps

1. Determine flags from `$ARGUMENTS` (optional):
   - `today` — show only today's sessions
   - `week` — show this week's sessions
   - `month` — show this month's sessions (default)
   - `by-project` — always shown; no flag needed
   - `by-model` — pass `-ByModel` to the script
   - `last <N>` or `<N>d` — pass `-Days <N>` to the script
   - `json` — pass `-Json` for raw JSON output

2. Run the script:

   ```
   powershell -ExecutionPolicy Bypass -File scripts/cost-rollup.ps1 [flags]
   ```

   Common invocations:
   - Default (today / week / month + by-project): no flags
   - By model breakdown: `-ByModel`
   - Last 7 days: `-Days 7`
   - Specific project: `-Project Agents`
   - JSON output: `-Json`

3. Display the output as-is. The script formats its own output.

4. If the script reports unknown models (zero-cost rows), note that
   `config/model-rates.json` needs updating for those model strings.

5. If the user asks about Codex or Desktop spend, say:
   > Those surfaces expose no log access. Only Claude Code sessions are
   > tracked. Log Codex usage manually against your $20/mo subscription.

## Subscription vs API-equivalent disclaimer

When displaying output, include this context if the user seems confused by
the dollar figures:

> **These figures are API-equivalent value, not your billing statement.**
> Claude Max ($100/mo) and Codex ($20/mo) are flat subscriptions — you are
> not charged per token. The script applies public Anthropic API rates to
> compute an "API-equivalent" number showing how much compute value you
> consumed within your plan's allowance. Think of it as a usage gauge, not
> a credit card charge.

Budget thresholds are configured in `config/budget.json` and are advisory
only. They compare API-equivalent monthly total against your configured
`combined_advisory_usd` target. No automatic action is taken when thresholds
are crossed — warnings are informational.

## Output tail

Script output is the complete result. No further action needed unless
the user asks to drill into a specific project or time range.

After each run, `health/spend.json` is updated with machine-readable totals
for today, this week, this month, by-project, and by-model breakdowns.
