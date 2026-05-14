<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 8b85291572d769e542e69780d5736116611111cdd84049d27a870bb2c1151e54 -->
<!-- canonical-sources:
  - EXECUTION-OWNER-REUSE-GATE.md
  - AGENT-FRESHNESS-REUSE-GATE.md
  - CHAT-STATE-GATE.md
  - CONTEXT-LOAD-GATE.md
  - ROLE-TO-LANE-ELASTICITY.md
  - ADAPTIVE-ROUTING-LADDER.md
-->
---
name: execution-routing
description: Freshness, context load, lane elasticity, and choosing whether to reuse, rotate, or open a new execution container. Use when routing owned execution work.
---

# Execution Routing

Use this skill when the question is which container should do the work next.

## Read first

1. `EXECUTION-OWNER-REUSE-GATE.md`
2. `AGENT-FRESHNESS-REUSE-GATE.md`
3. `CHAT-STATE-GATE.md`

Then load as needed:

- `CONTEXT-LOAD-GATE.md`
- `ROLE-TO-LANE-ELASTICITY.md`
- `ADAPTIVE-ROUTING-LADDER.md`

## Default loop

1. Prefer the freshest honest current owner.
2. Rotate only when quality or context integrity actually improves.
3. Use the lightest coordination layer that still tells the truth.
4. Keep same-workstream packets minimal and delta-only.

## Watch for

- new agent launched because it feels cleaner, not because it is better
- stale lane reused after context integrity is already lost
- hot manager/super kept around for straightforward execution
- buyer asked to choose between containers without enough context

## Output shape

- `Current best owner:`
- `Why reuse / rotate / spawn:`
- `Context risk:`
- `Next packet shape:`

