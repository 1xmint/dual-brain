<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: api-design
description: Public-surface and caller-contract discipline. Use when adding or changing functions, endpoints, events, config surfaces, or any interface other code depends on.
---

# API Design

Use this skill when the hard part is not just implementation, but the shape of
the interface other code must live with.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. changed interface and its main callers
3. relevant `patterns/*.md` file when the repo has one

## Default loop

1. Name the caller and the promise the API makes.
2. Check naming, argument ordering, defaults, and optionality for clarity.
3. Make success and failure contracts explicit.
4. Prefer additive migration paths over silent breaking changes.

## Watch for

- parameters whose order invites misuse
- booleans where a named mode would be clearer
- hidden null / optional return paths
- public surface changes with no migration story
- leaking storage or transport details into the caller contract

## Output shape

- `Caller contract:`
- `Surface risk:`
- `Compatibility note:`
- `Cleaner API shape:`

