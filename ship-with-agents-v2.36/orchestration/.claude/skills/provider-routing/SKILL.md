<!-- generated-by: handwritten — not derived from doctrine source files -->
<!-- canonical-hash: not-drift-checked — see decisions/SUBSCRIPTION-ROUTING-PATTERN.md -->
<!-- canonical-sources:
  - decisions/SUBSCRIPTION-ROUTING-PATTERN.md
  - decisions/COST-DASHBOARD-PATTERN.md
-->
---
name: provider-routing
description: Which AI provider to use for this task (Claude Code vs. Codex vs. cross-provider review). Use when the question is about provider selection, subscription quota advisory, whether cross-provider diversity is worth the overhead, or how to set executionProvider/reviewProvider in workstreams.json. Distinct from model-and-budget, which answers which model tier to use within a provider — this skill answers which provider to use at all.
---

# Provider Routing

Use this skill when the question is **which provider** — not which model tier.
If the question is which model tier (Opus vs. Sonnet vs. Haiku), use the
`model-and-budget` skill instead.

## Read first

1. `decisions/SUBSCRIPTION-ROUTING-PATTERN.md` — the core routing logic
2. `decisions/COST-DASHBOARD-PATTERN.md` — when cost is the question
3. `health/workstreams.json` — check existing `executionProvider` /
   `reviewProvider` fields for the active workstream

## The core distinction

- `model-and-budget` skill: model tier selection (Opus/Sonnet/Haiku),
  budget justification, quality thresholds
- `provider-routing` skill: provider selection (Claude Code terminal vs.
  Codex vs. cross-provider review), quota advisory, diversity value

These are sequential decisions: pick provider first, then pick model tier.

## Default loop

1. **Classify task** — code gen / review / research / system design / quick
2. **Check quota advisory** — has the user explicitly flagged a quota
   constraint? If not, treat quota as unconstrained. Do not infer from
   token logs.
3. **Apply task-type guidance:**
   - Repo-scoped code/ADR work → Claude Code terminal (has file access,
     hook rails, skills)
   - High-risk review (auth, schema, trust model) → consider cross-provider
     second opinion
   - Quick one-off → whichever is already open, no overhead
4. **Diversity check** — is cross-provider worth it? Yes for Tier 2+ risk.
   No for routine solo execution. Never for "we have another subscription."
5. **Record choice** — if a workstream is registered, note the provider
   in `executionProvider` / `reviewProvider` in `health/workstreams.json`

## Quota advisory

Subscription quota is NOT auto-measurable. Claude Max and Codex expose no
quota API. Only act on quota state if the user has explicitly said something
like "Claude Max is near its limit" or "Codex quota is fresh this month."
Absent that signal, assume quota is not a constraint.

## Output shape

When provider was a meaningful choice in this turn, include:

- `Provider:` — which provider and why (one line)
- `Reason:` — task fit / quota advisory / diversity value / overhead not
  worth it (one line)

When provider is obvious (only one makes sense), skip the output shape and
just proceed.

## Model defaults

After picking a provider, pick the model tier. Default table per role (Claude
Code surface only) is governed by `decisions/MODEL-DEFAULTS-PATTERN.md`.
Short summary:

- `head` — Opus permanent default (strategic decisions)
- `manager` / `super` / `doctor` — Sonnet default, escalate to Opus when:
  - work touches auth, credentials, payments, or trust-sensitive code
  - decision shapes a long-lived architectural choice or cross-workstream contract
  - a non-obvious failure mode needs deeper reasoning
  - systemic root-cause analysis (vs. routine sweep)
  - output becomes a durable pattern file, ADR, or gate
  - user requests: `/upgrade-model opus`
- `agent` / `worker` — Sonnet (fixed)

Escalation path: `/upgrade-model opus` mid-session (re-launch required), or
`--model claude-opus-4-6` flag at spawn.

## Anti-patterns to call out

- Routing by subscription existence ("I have Codex so I should use it")
- Assuming quota depletion without user confirmation
- Provider-hopping across turns in the same context
- Cross-provider diversity for routine solo work where overhead exceeds value
- Escalating to Opus without citing a documented trigger from MODEL-DEFAULTS-PATTERN.md
