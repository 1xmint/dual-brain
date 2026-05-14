<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 88a166e98937e6647bcc1d397af52686dc0a5024c77d7e9bec36ffa533019bad -->
<!-- canonical-sources:
  - decisions/FRICTION-AND-PATTERNS-PATTERN.md
  - patterns/README.md
-->
---
name: patterns
description: Repo-specific craft conventions and reusable implementation patterns. Use when this codebase has local testing, auth, database, API, or error-handling rules that generic craft skills should augment.
---

# Patterns

Use this skill when generic craft guidance is not enough and the repo already
has a local way of doing the thing.

## Read first

1. `decisions/FRICTION-AND-PATTERNS-PATTERN.md`
2. `patterns/README.md`
3. the smallest matching file under `patterns/`

## Default loop

1. Name the local convention the task probably touches.
2. Load only the matching pattern file, not the whole directory.
3. Apply the pattern before inventing a new local style.
4. If no pattern exists and the lesson keeps recurring, recommend capture.

## Watch for

- generic best practice that conflicts with this repo's real conventions
- repeated corrections that should become a pattern file
- pattern files drifting into transcript summaries
- local conventions hidden in memory or checkpoints instead of `patterns/`

## Output shape

- `Pattern loaded:`
- `Local rule:`
- `Why it matters here:`
- `Capture missing pattern?: yes / no`

