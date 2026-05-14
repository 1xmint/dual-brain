<!-- generated-by: scripts/sync-skills-from-doctrine.ps1 -->
<!-- canonical-hash: 58c156bbb04a3f18abcae3dc824fd015a2a93b2dd388d972e5e1b0b018ca3fe6 -->
<!-- canonical-sources:
  - decisions/CODE-QUALITY-PATTERN.md
-->
---
name: test-design
description: Load-bearing test design. Use when deciding what to test, how to prove an edge case, whether to mock, or whether a proposed test would actually fail for the right reason.
---

# Test Design

Use this skill when "write a test" is too vague to be useful.

## Read first

1. `decisions/CODE-QUALITY-PATTERN.md`
2. changed code and existing nearby tests
3. `patterns/testing.md` when the repo has one

## Default loop

1. Name the behavior that must be proven.
2. Pick the smallest test level that can fail for the right reason.
3. Add the edge case, boundary, or regression path that would be easy to miss.
4. Make the assertion specific enough that a half-broken implementation fails.

## Watch for

- tests that only snapshot or smoke-check without proving behavior
- mocks that hide the real contract
- fixtures with too much setup noise
- one test covering many behaviors poorly instead of one behavior clearly
- happy-path-only tests for code that mostly fails at boundaries

## Output shape

- `Behavior under test:`
- `Best test level:`
- `Edge cases to cover:`
- `Assertion that proves it:`

