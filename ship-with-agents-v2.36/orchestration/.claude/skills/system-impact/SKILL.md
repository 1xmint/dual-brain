<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: ae1edf467781af2c0b9426e5e1da0a7956e1716972969889826260bb2071c816 -->
<!-- canonical-sources:
  - SYSTEM-WORLD-MODEL.md
  - WORKSTREAM-DEPENDENCY-GRAPH.md
  - CROSS-WORKSTREAM-CONTRACTS.md
  - WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md
  - REPLAN-TRIGGER-GATE.md
  - ATTENTION-ROUTING-ENGINE.md
  - CONFLICT-RADAR.md
  - OPPORTUNITY-RADAR.md
  - TOP-CHAIN-SYNTHESIS-LOOP.md
-->
---
name: system-impact
description: Cross-workstream impact, dependency tracing, and neighbor awareness. Use when one change should reshape adjacent cells or the current world model.
---

# System Impact

Use this skill when one local change might alter other lanes, workstreams, or
the shared story.

## Read first

1. `SYSTEM-WORLD-MODEL.md`
2. `WORKSTREAM-DEPENDENCY-GRAPH.md`
3. `WORKSTREAM-IMPACT-PROPAGATION-PROTOCOL.md`

Then load as needed:

- `CROSS-WORKSTREAM-CONTRACTS.md`
- `REPLAN-TRIGGER-GATE.md`
- `ATTENTION-ROUTING-ENGINE.md`
- `CONFLICT-RADAR.md`
- `OPPORTUNITY-RADAR.md`
- `TOP-CHAIN-SYNTHESIS-LOOP.md`

## Default loop

1. Name the local change.
2. Trace who else should care now.
3. Distinguish dependency, conflict, and opportunity.
4. Replan only when the impact is meaningful.
5. Prefer one coherent neighbor brief over many partial nudges.

## Output shape

- `Impact event:`
- `Affected cells:`
- `Required replans:`
- `Recommended notifications:`

