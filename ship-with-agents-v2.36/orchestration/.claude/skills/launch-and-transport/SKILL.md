<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 2704933ba4d19e2d4cde29fdf7e290e9098fc52650453ad7b0c882b40020ab63 -->
<!-- canonical-sources:
  - LAUNCH.md
  - CANONICAL-PACKET-MINIMIZATION-RULE.md
  - EXECUTABLE-HANDOFF-BRIDGE-RULE.md
-->
---
name: launch-and-transport
description: Launch shape, transport choice, packet vs spawn vs injection, and launch honesty. Use when the next move changes containers or when launch wording is ambiguous.
---

# Launch And Transport

Use this skill when `launch`, `spawn`, `revive`, `inject`, or “use this lane”
could mean more than one runtime action.

## Read first

1. `LAUNCH.md`
2. `CANONICAL-PACKET-MINIMIZATION-RULE.md`
3. `EXECUTABLE-HANDOFF-BRIDGE-RULE.md`

## Default loop

1. Resolve whether the buyer wants a packet, a current-terminal action, or a
   new container.
2. Keep packet-ready and live-running states separate.
3. Choose the smallest honest transport shape.
4. Name the next owner and the runtime surface clearly.
5. Keep launch instructions delta-only for same-workstream follow-ups.

## Watch for

- desktop spawn assumed when a packet was recommended
- current-terminal injection assumed when a safer packet is enough
- packet labeled as though the lane is already live
- review state skipped before launch recommendation

## Output shape

- `Launch shape:`
- `Surface:`
- `Owner after launch:`
- `Exact next trigger:`

