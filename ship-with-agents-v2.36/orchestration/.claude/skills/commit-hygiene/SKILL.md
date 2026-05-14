<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: commit-hygiene
description: Atomic commit discipline and message truth. Use when staging changes, deciding commit boundaries, or checking whether the final commit explains why and risk instead of just what changed.
---

# Commit Hygiene

Use this skill when the code may be fine but the change is becoming hard to
review, hard to revert, or easy to mis-explain.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. current `git diff --staged` or planned file list
3. nearby commits when the boundary feels ambiguous

## Default loop

1. Ask whether the staged change has one real purpose.
2. Remove unrelated cleanup, experiments, and generated noise.
3. Make the commit message explain why, risk, and any known gap.
4. Do not claim green if checks or blockers are still unresolved.

## Watch for

- staged files that belong to two different ideas
- fix plus refactor plus docs in one commit
- messages that restate filenames instead of intent
- "temporary" or "wip" commits presented as done
- skipped quality checks hidden from the commit message

## Output shape

- `Commit boundary:`
- `Files to stage now:`
- `Files to leave out:`
- `Commit message shape:`

