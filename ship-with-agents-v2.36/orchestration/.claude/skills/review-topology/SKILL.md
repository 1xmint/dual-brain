<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: fbfdf10442a59aacba95f89f598a0f12b440de93ac76cd70e45e35b56b3e3cad -->
<!-- canonical-sources:
  - REVIEW-TOPOLOGY-LADDER.md
  - REVIEW-STATE-MACHINE.md
  - REVIEW-CELL-MODEL.md
  - ASSURANCE-TO-TOPOLOGY-MATRIX.md
  - SECOND-BRAIN-DIVERSITY-GATE.md
  - MANAGER-CONTEXT-PURITY-GATE.md
-->
---
name: review-topology
description: Review density, second-brain topology, review state, and assurance shape. Use when choosing T0-T5, deciding whether a manager/super cell is justified, or auditing review quality.
---

# Review Topology

Use this skill when the issue is review density, not execution mechanics.

## Read first

1. `REVIEW-TOPOLOGY-LADDER.md`
2. `REVIEW-STATE-MACHINE.md`
3. `REVIEW-CELL-MODEL.md`

Then load as needed:

- `ASSURANCE-TO-TOPOLOGY-MATRIX.md`
- `SECOND-BRAIN-DIVERSITY-GATE.md`
- `MANAGER-CONTEXT-PURITY-GATE.md`

## Default loop

1. Choose the lightest honest topology for the risk.
2. Keep topology, state, and ownership explicit.
3. Distinguish prompt-diverse review from model-diverse review honestly.
4. Require evidence for higher-assurance claims.
5. Reduce topology when it no longer buys real independence.

## Watch for

- same-model review sold as stronger diversity than it is
- manager carrying too many hot supers by habit
- T3+ language with no cell record, assurance record, or handoff evidence
- recommendation state missing even though topology exists

## Output shape

- `Topology:`
- `Review cell:`
- `Assurance level:`
- `Diversity type:`
- `Next owner:`

