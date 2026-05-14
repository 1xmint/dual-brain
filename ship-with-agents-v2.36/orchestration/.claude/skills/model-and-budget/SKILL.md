<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: fe0b0a389aeffe3558eb45cfe75135e9a875071a3ed7cbdb0d7fefe44fd635a4 -->
<!-- canonical-sources:
  - MODEL-CONFIG.md
  - RUNTIME-MODEL-GATE.md
  - EXECUTION-ROUTING-GATE.md
  - BUDGET-AND-SUBSCRIPTION-ROUTING.md
  - PROVIDER-BINDING-RULE.md
-->
---
name: model-and-budget
description: Model/provider routing, budget truth, quality thresholds, and production-shaped escalation. Use when the system must choose a model or provider deliberately.
---

# Model And Budget

Use this skill when model choice, provider honesty, or budget constraints are
part of the decision.

## Read first

1. `MODEL-CONFIG.md`
2. `RUNTIME-MODEL-GATE.md`
3. `EXECUTION-ROUTING-GATE.md`

Then load as needed:

- `BUDGET-AND-SUBSCRIPTION-ROUTING.md`
- `PROVIDER-BINDING-RULE.md`

## Default loop

1. Start from the saved baseline for the role.
2. Escalate only when the task genuinely benefits.
3. Keep provider/model choice explicit in metadata and buyer-facing reasoning
   when relevant.
4. Distinguish production-readiness review from routine execution loops.

## Output shape

- `Recommended model:`
- `Why this is worth it:`
- `Cheaper acceptable fallback:`

