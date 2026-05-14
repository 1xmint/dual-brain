# Subscription Routing Pattern

**Status:** Active
**Introduced:** Pass 9
**Audience:** Solo dev on Claude Max ($100/mo) + Codex ($20/mo)
**Complements:** `MODEL-CONFIG.md`, `BUDGET-AND-SUBSCRIPTION-ROUTING.md`,
`decisions/COST-DASHBOARD-PATTERN.md`

---

## Why this exists

A solo developer with two AI subscriptions — Claude Max and Codex — faces a
routing question that the existing model-and-budget skill does not fully cover.
That skill answers "which model tier?". This pattern answers "which provider?"
— a distinct question that precedes model selection. The answer affects quota
consumption, output style, and whether cross-provider diversity adds value or
just friction.

---

## Connection to existing doctrine

**This pattern complements, does not replace, model-and-budget.**

- `model-and-budget` skill: chooses model tier (Opus/Sonnet/Haiku) and budget
  justification within a single provider context.
- This pattern: chooses which provider to use at all, then hands off to
  model-and-budget for model selection within that provider.

The `executionProvider` and `reviewProvider` fields already in
`health/workstreams.json` are the canonical record of provider assignment per
workstream. This pattern governs how those fields get set.

---

## The honest limit on quota state

Subscription quota is **not auto-measurable**. Neither Claude Max nor Codex
exposes a quota API. The system has no way to know programmatically whether
you are 20% or 95% into your monthly allowance.

The routing logic therefore treats quota state as a **manual advisory signal**:

- Default: assume quota is not a constraint (fresh-month posture).
- Override: user manually flags "Claude Max nearing limit" or "Codex quota
  fresh" as context. The provider-routing skill reads this flag if present;
  otherwise it ignores quota state entirely.
- Never: infer quota state from token counts in session logs. The logs track
  API-equivalent token costs, not Max subscription quota consumption, and the
  two are not the same accounting unit.

---

## Decision factors

Choose provider based on task fit first, quota advisory second.

**Task-type guidance:**

| Task type | Default provider | Notes |
|---|---|---|
| Repo-scoped code generation | Claude Code (terminal) | Full file access, hook rails, skills |
| Code review of a PR | Cross-provider second opinion worth it for high-risk | See diversity rule below |
| Research / explanation | Either; Claude Code for repo context | |
| Creative / copy | Either; personal preference | |
| System design, ADRs | Claude Code (terminal) | Needs full repo context |
| Quick one-off question | Whichever is open | Overhead not worth provider switch |

**Cross-provider diversity rule:**

Provider diversity adds value when:
1. The work is high-risk (auth, data schema changes, production routing)
2. Both providers will have enough context to give an independent opinion
3. The cost of the switch (context re-loading, overhead) is worth the
   second opinion

Provider diversity is overhead-not-worth-it when:
1. The task is routine solo execution
2. One provider lacks the context the other has
3. The routing decision is driven by "we have another subscription" rather
   than by task fit — this is the primary anti-pattern

---

## Anti-patterns

**Routing by subscription existence:** "I have Codex, so I should use it here"
is not a routing rationale. Idle subscription capacity is not a reason to
switch providers mid-context. Routing by task fit first.

**Pretending to know quota state:** Do not adjust routing based on assumed
quota depletion unless the user has explicitly flagged it. Silently routing
away from Claude Max because "it might be running low" introduces invisible
bias without any factual basis.

**Provider-hopping for variety:** Switching providers on every task introduces
context fragmentation. A clean single-provider execution is better than a
diverse-but-incoherent cross-provider chain.

**Over-weighting diversity for low-risk work:** Cross-provider review is
worth the overhead for Tier 2+ risk (auth, trust model, payments). For most
solo feature work, single-provider is cheaper and faster.

---

## Default loop

1. Classify the task type (code gen / review / research / system design / quick)
2. Check for explicit quota advisory flag from user (none = assume unconstrained)
3. Apply task-type guidance above
4. If high-risk: consider cross-provider second opinion, weigh overhead
5. Record provider choice in `executionProvider` / `reviewProvider` fields of
   `health/workstreams.json` when the workstream is registered

---

## Alternatives considered

**Automatic quota inference from token logs:** Rejected. Session logs record
API-equivalent token costs, not Max subscription quota units. The mapping is
unknown and not stable across Anthropic pricing changes. Any inference would
be guessing dressed as measurement.

**Single-provider always:** Rejected. Cross-provider review for high-risk work
is documented as genuinely valuable in the existing topology. The pattern
preserves that option while discouraging its overuse.

**Quota-aware auto-routing:** Rejected for now. Would require either a quota
API (does not exist) or a manual tracking file with too much maintenance
overhead for one person. Deferred: if Anthropic exposes a quota endpoint,
revisit.
