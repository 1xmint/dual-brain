<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 21bec10cef1eb7b09756bc5e9574674ffb6cd6eca381612a4877f920312b19f2 -->
<!-- canonical-sources:
  - PACKAGE-STRUCTURE.md
  - DOC-UPDATE-PROTOCOL.md
-->
---
name: package-maintenance
description: Package mirror, release hygiene, and buyer-facing sync discipline. Use when updating or auditing repo-ops-starter-pack, release flow, or packaging drift.
---

# Package Maintenance

Use this skill when changing the shipped package or deciding whether the mirror
is safe to build from.

## Read first

1. `PACKAGE-STRUCTURE.md`
2. `DOC-UPDATE-PROTOCOL.md`

## Default loop

1. Treat `orchestration/` as canonical doctrine.
2. Mirror changes deliberately into `repo-ops-starter-pack/orchestration/`.
3. Classify package drift before building.
4. Keep generated archives and planning clutter out of committed package truth.

## Watch for

- dirty package tree treated as a safe build source
- buyer-facing docs lagging the canonical doctrine
- generated artifacts committed as though they were source

## Output shape

- `Canonical source:`
- `Mirror status:`
- `Dirty tree classification:`
- `Build readiness:`


