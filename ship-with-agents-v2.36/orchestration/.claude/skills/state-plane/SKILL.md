<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: de4aaa1c2b9dfbf31f24d0b288ed7ae1ea60265bbf9e7193e47dc944b3e8be7e -->
<!-- canonical-sources:
  - ACTIVE-WORKSTREAMS.md
  - LIVE-STATE-POPULATION-PROTOCOL.md
  - WORKSTREAM-CELL-REGISTRY.md
  - ORCHESTRATION-STATE-CONSISTENCY.md
  - ORCHESTRATION-HEALTH-MODEL.md
-->
---
name: state-plane
description: Active map, workstream health, lane capsules, and control-plane truth precedence. Use when head/manager state feels disconnected or runtime truth needs a compact state-plane read.
---

# State Plane

Use this skill when the current question is really “what is live right now?”

## Read first

1. `ACTIVE-WORKSTREAMS.md`
2. `LIVE-STATE-POPULATION-PROTOCOL.md`
3. `ORCHESTRATION-STATE-CONSISTENCY.md`

Then load as needed:

- `WORKSTREAM-CELL-REGISTRY.md`
- `ORCHESTRATION-HEALTH-MODEL.md`
- `health/workstreams.json`
- `health/DASHBOARD.md`

## Default loop

1. Prefer compact machine-checkable state over memory.
2. Resolve disagreements between state surfaces before routing.
3. Keep explicit whether a fact is observed, declared-only, or missing.
4. Update the smallest truthful state artifact instead of narrating around it.

## Watch for

- dashboard treated as the only truth source
- live cell status described without control-plane evidence
- declared review topology mistaken for verified topology

## Output shape

- `State source used:`
- `Observed live status:`
- `Missing evidence:`
- `Next state repair:`

