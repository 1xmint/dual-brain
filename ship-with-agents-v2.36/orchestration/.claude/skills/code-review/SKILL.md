<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: code-review
description: Substantive changed-code review. Use when reviewing a patch for bug risk, missing validation, silent failures, unsafe state changes, weak proof, or common defect patterns.
---

# Code Review

Use this skill when the question is whether the code is good enough to ship,
not whether the review topology is fancy enough.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. changed files only
3. relevant `patterns/*.md` file when the repo already documents a local rule

## Default loop

1. Scan boundaries: what inputs, outputs, and side effects changed?
2. Scan failure modes: what happens on bad input, empty state, retry, timeout,
   or partial failure?
3. Scan state risk: mutation, concurrency, ordering, stale cache, hidden
   coupling, or accidental broad blast radius.
4. Scan proof: do tests or checks actually prove the risky path?

## Watch for

- missing input validation at boundaries
- swallowed or overly generic errors
- off-by-one and empty-state logic
- mutation hazards and shared-state surprises
- weak rollback, retry, or idempotency stories
- tests that pass without proving the changed behavior

## Output shape

- `Findings:`
- `Risk if shipped:`
- `Missing proof:`
- `Smallest safe repair:`

