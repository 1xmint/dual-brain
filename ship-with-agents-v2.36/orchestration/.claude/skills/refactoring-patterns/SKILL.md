<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: refactoring-patterns
description: Safe refactor discipline. Use when reshaping code, separating mechanical change from behavior change, or judging whether a refactor is too risky for the current task.
---

# Refactoring Patterns

Use this skill when the code would benefit from cleanup but the cleanup itself
could become the risk.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. changed files and their nearest callers
3. relevant local pattern file when one exists

## Default loop

1. Separate mechanical refactor from behavior change.
2. Prefer scaffold-before-change: extraction, rename, move, then behavior.
3. Bound the blast radius before introducing a new abstraction.
4. Stop if the refactor has become larger than the user actually asked for.

## Watch for

- bug fix and refactor bundled in one unreadable diff
- new abstraction invented before the repeated shape is stable
- moving logic without proving call sites still match
- "cleanup" that quietly rewrites behavior
- touching many files when one narrower seam existed

## Output shape

- `Refactor class:`
- `Safe first move:`
- `Blast radius:`
- `Proof needed before merge:`

